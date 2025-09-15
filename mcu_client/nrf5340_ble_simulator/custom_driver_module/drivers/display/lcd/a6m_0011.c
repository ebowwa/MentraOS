/*
 * @Author       : Cole
 * @Date         : 2025-07-28 11:31:02
 * @LastEditTime : 2025-09-04 19:36:53
 * @FilePath     : a6m_0011.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include "a6m_0011.h"

#include <stdio.h>
#include <zephyr/device.h>
#include <zephyr/drivers/display.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/pm/device.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/types.h>

#define LOG_MODULE_NAME CUSTOM_A6M_0011
LOG_MODULE_REGISTER(LOG_MODULE_NAME);

#define SCREEN_WIDTH  640
#define SCREEN_HEIGHT 480
#define DT_DRV_COMPAT zephyr_custom_a6m_0011

#if DT_NUM_INST_STATUS_OKAY(DT_DRV_COMPAT) == 0
#warning "Custom a6m_0011 driver enabled without any devices"
#endif
const struct device *dev_a6m_0011 = DEVICE_DT_GET(DT_INST(0, DT_DRV_COMPAT));
static K_SEM_DEFINE(a6m_0011_init_sem, 0, 1);

#define MAX_LINES_PER_WRITE 192  // 每次写入的最大行数; The maximum number of rows written each time
void a6m_0011_init_sem_give(void)
{
    k_sem_give(&a6m_0011_init_sem);
}

int a6m_0011_init_sem_take(void)
{
    return k_sem_take(&a6m_0011_init_sem, K_FOREVER);
}
static int write_reg_side(const struct device *dev, const struct gpio_dt_spec *cs, uint8_t reg, uint8_t val)
{
    if ((!device_is_ready(dev)))
    {
        LOG_ERR("device_is_ready err!!!");
        return -EINVAL;
    }
    if (!gpio_is_ready_dt(cs))
    {
        LOG_ERR("gpio_is_ready_dt err!!!");
        return -EINVAL;
    }

    const a6m_0011_config *cfg = dev->config;
    uint8_t  tx[3];
    tx[0] = A6M_0011_LCD_WRITE_ADDRESS;
    tx[1] = reg;
    tx[2] = val;
    const struct spi_buf buf = {
        .buf = tx,
        .len = sizeof(tx),
    };
    const struct spi_buf_set tx_set = {
        .buffers = &buf,
        .count   = 1,
    };
    gpio_pin_set_dt(cs, 0);
    int err = spi_write_dt(&cfg->spi, &tx_set);
    gpio_pin_set_dt(cs, 1);

    if (err)
    {
        LOG_ERR("SPI write_reg_side @0x%02x failed: %d", reg, err);
    }
    return err;
}
/**
 * @param mode  移动模式 ；mobility pattern
 * @param steps 偏移步数，0～2（每步相当于 8 像素）；Offset steps: 0 to 2 (each step is equivalent to 8 pixels)
 * @return 0 成功，负值错误码；0 Success, negative error code
 */
int a6m_0011_set_shift(move_mode mode, uint8_t steps)
{
    /* 1. 参数校验：steps 只能是 0、1 或 2；Parameter verification: The value of "steps" can only be 0, 1, or 2. */
    if (steps > 2U || mode >= MOVE_MAX)
    {
        LOG_ERR("Invalid parameters: mode=%d, steps=%d", mode, steps);
        return -1;
    }

    /* 2. 选寄存器和左右通道的基准值；Select the reference values for the register and the left and right channels */
    uint8_t reg;
    uint8_t val_l, val_r;

    switch (mode)
    {
        case MOVE_DEFAULT:
            reg = A6M_0011_LCD_HD_REG; /* HD/VD 随便写，写两次都覆盖; HD/VD can be written freely. Writing twice will overwrite the previous content. */
            val_l = A6M_0011_SHIFT_CENTER;
            val_r = A6M_0011_SHIFT_CENTER;
            break;

        case MOVE_RIGHT:
            reg   = A6M_0011_LCD_HD_REG;
            val_l = A6M_0011_SHIFT_CENTER + steps; /* 左机向右；Left aircraft turns right */
            val_r = A6M_0011_SHIFT_CENTER - steps; /* 右机向左；The right machine is moving to the left.*/
            break;

        case MOVE_LEFT:
            reg   = A6M_0011_LCD_HD_REG;
            val_l = A6M_0011_SHIFT_CENTER - steps; /* 左机向左；Left engine on the left side is pointing to the left. */
            val_r = A6M_0011_SHIFT_CENTER + steps; /* 右机向右；The right machine is moving to the right. */
            break;

        case MOVE_UP:
            reg   = A6M_0011_LCD_VD_REG;
            val_l = A6M_0011_SHIFT_CENTER - steps; /* 上移，左右同步；Move upwards, synchronously on the left and right. */
            val_r = A6M_0011_SHIFT_CENTER - steps;
            break;

        case MOVE_DOWN:
            reg   = A6M_0011_LCD_VD_REG;
            val_l = A6M_0011_SHIFT_CENTER + steps; /* 下移，左右同步；Move downward, synchronize left and right */
            val_r = A6M_0011_SHIFT_CENTER + steps;
            break;

        default:
            return -EINVAL;
    }

    const a6m_0011_config *cfg  = dev_a6m_0011->config;
    int err1 = write_reg_side(dev_a6m_0011, &cfg->left_cs, reg, val_l);
    int err2 = write_reg_side(dev_a6m_0011, &cfg->right_cs, reg, val_r);

    LOG_INF("set_shift: mode=%d, steps=%d → reg=0x%02X, L=0x%02X, R=0x%02X", mode, steps, reg, val_l, val_r);

    return err1 ?: err2;
}

/**
 * send all data via SPI with retries
 * @param dev    Device handle
 * @param data   Pointer to data buffer
 * @param size   Size of data buffer in bytes
 * @param retries Number of retries on failure
 * @return 0 on success, negative error code on failure
 */
static int a6m_0011_transmit_all(const struct device *dev, const uint8_t *data, size_t size, int retries)
{
    /* 边界条件检查; Boundary condition check */
    if (!dev || !data || size == 0)
    {
        return -EINVAL;
    }

    int                    err    = -1;
    const a6m_0011_config *cfg    = dev->config;
    struct spi_buf tx_buf = {
        .buf = data,
        .len = size,
    };
    struct spi_buf_set tx = {
        .buffers = &tx_buf,
        .count   = 1,
    };

    /* 执行SPI传输（带重试机制）; Execute SPI transmission (with retry mechanism) */
    for (int i = 0; i <= retries; i++)
    {
        gpio_pin_set_dt(&cfg->left_cs, 0);   // Select left CS (active LOW)
        gpio_pin_set_dt(&cfg->right_cs, 0);  // Select right CS (active LOW)
        err = spi_write_dt(&cfg->spi, &tx);
        gpio_pin_set_dt(&cfg->left_cs, 1);   // Deselect left CS (inactive HIGH)
        gpio_pin_set_dt(&cfg->right_cs, 1);  // Deselect right CS (inactive HIGH)
        if (err != 0)
        {
            k_msleep(1); /* 短暂延迟; Short delay */
            LOG_INF("SPI write to left failed (attempt %d/%d): %d", i + 1, retries + 1, err);
            continue;
        }
        else
        {
            return 0; /* 成功; Success */
        }
    }
    return err;
}
/**
 * @brief Switch video format to GRAY16 (4-bit per pixel) via Bank0 register 0xBE.
 *        Bus stays 1-line SPI; only pixel depth becomes 4-bit (2 pixels per byte).
 *
 * Datasheet: Bank0 0xBE: 0x82=GRAY256, 0x84=GRAY16.
 */
int a6m_0011_set_gray16_mode(void)
{
    /* Bank0 0xBE = 0x84 (GRAY16) */
    int ret = a6m_0011_write_reg(0xBE, 0x84);
    if (ret == 0)
    {
        LOG_INF("A6M_0011 video format -> GRAY16 (4-bit/pixel) set OK");
    }
    else
    {
        LOG_ERR("Set GRAY16 failed, ret=%d", ret);
    }
    return ret;
}

/**
 * @Description: Command for local data mode
 * @start_line: Starting line number
 * @end_line: Ending line number
 */
void a6m_0011_write_multiple_rows_cmd(const struct device *dev, uint16_t start_line, uint16_t end_line)
{
    uint8_t reg[8] = {0};
    reg[0]         = A6M_0011_LCD_DATA_REG;
    reg[1]         = (A6M_0011_LCD_LOCALITY_REG >> 16) & 0xff;
    reg[2]         = (A6M_0011_LCD_LOCALITY_REG >> 8) & 0xff;
    reg[3]         = A6M_0011_LCD_LOCALITY_REG & 0xff;
    reg[4]         = (start_line >> 8) & 0xff;
    reg[5]         = start_line & 0xff;
    reg[6]         = (end_line >> 8) & 0xff;
    reg[7]         = end_line & 0xff;
    a6m_0011_transmit_all(dev, reg, sizeof(reg), 1);
}

static int a6m_0011_blanking_on(struct device *dev)
{
    return 0;
}

static int a6m_0011_blanking_off(struct device *dev)
{
    return 0;
}
#if 1

/* ================== I1→I4 查表（一次性构建） ================== */ 
// LUT for I1→I4 (one-time construction)
static uint32_t s_i1_to_i4_LUT[256];
static bool     s_i1_to_i4_LUT_built = false;

/* 构建 LUT：输入 1 字节（8 像素，MSB→LSB），输出 4 字节（8 个 4bit 像素：两像素/字节） */
// Build LUT: input 1 byte (8 pixels, MSB→LSB), output 4 bytes (8 4bit pixels: two pixels/byte)
static void a6m_build_i1_to_i4_lut(void)
{
    for (int b = 0; b < 256; b++) 
    {
        /* 逐位展开成 4bit 灰度（0x0 或 0xF） */
        // Expand bit by bit into 4bit grayscale (0x0 or 0xF)
        uint8_t px[8];
        for (int i = 0; i < 8; i++) 
        {
            uint8_t bit = (uint8_t)((b >> (7 - i)) & 0x01);
            uint8_t nib = bit ? 0x00 : 0x0F;  /* 位=0亮（默认） 位=1暗 ; bit=0 bright (default) bit=1 dark */
            px[i] = nib;
        }
        /* 打包成 4 个字节（高4位=左像素，低4位=右像素） */
        // Pack into 4 bytes (high 4 bits = left pixel, low 4 bits = right pixel)
        uint32_t pack =
            ((uint32_t)((px[0] << 4) | px[1]) << 24) |
            ((uint32_t)((px[2] << 4) | px[3]) << 16) |
            ((uint32_t)((px[4] << 4) | px[5]) << 8)  |
            ((uint32_t)((px[6] << 4) | px[7]) << 0);
        s_i1_to_i4_LUT[b] = pack;
    }
    s_i1_to_i4_LUT_built = true;
}
/* ================== 按行转换：I1(1bpp, MSB-first) -> I4(两像素/字节) ================== */
// ================== Line-by-line conversion: I1(1bpp, MSB-first) -> I4(two pixels/byte) ==================
/**
 * @Description: Pack a line of 1bpp pixels into 4bpp using LUT
 * @param src_row  Pointer to source row (1bpp, MSB-first)
 * @param width    Width of the row in pixels
 * @param dst_row  Pointer to destination row (4bpp, two pixels/byte)
 * @return         None
 */
static inline void a6m_pack_i1_to_i4_line_lut(const uint8_t *src_row,
                                              uint16_t width,
                                              uint8_t *dst_row)
{
    /* 每 8 像素（1 字节）→ LUT 输出 4 字节 ; Every 8 pixels (1 byte) → LUT outputs 4 bytes */
    uint16_t full_groups = (uint16_t)(width / 8U);
    uint16_t tail_pixels = (uint16_t)(width % 8U);
    uint16_t out = 0;

    for (uint16_t g = 0; g < full_groups; g++) 
    {
        uint32_t pack = s_i1_to_i4_LUT[src_row[g]];
        dst_row[out + 0] = (uint8_t)(pack >> 24);
        dst_row[out + 1] = (uint8_t)(pack >> 16);
        dst_row[out + 2] = (uint8_t)(pack >> 8);
        dst_row[out + 3] = (uint8_t)(pack >> 0);
        out += 4;
    }

    /* 收尾：不足 8 像素（最多 7），两两拼一个字节 ; Tail: less than 8 pixels (up to 7), two by two spliced into one byte */
    if (tail_pixels) 
    {
        /* 起始 bit 索引（相对这个组的 8bit 块）; Starting bit index (relative to the 8bit block of this group) */
        uint16_t start_bit = (uint16_t)(full_groups * 8U);
        uint8_t  cur_byte  = src_row[full_groups]; /* 安全：调用方保证源行有足够字节 ; Safe: the caller ensures that the source line has enough bytes */

        /* 从 start_bit 开始逐像素取位 */
        // Take bits pixel by pixel starting from start_bit
        uint8_t nib0 = 0, nib1 = 0, have0 = 0;
        for (uint16_t i = 0; i < tail_pixels; i++) 
        {
            /* 计算这个像素在 cur_byte 中的 bit 位置：MSB-first */
            // Calculate the bit position of this pixel in cur_byte: MSB-first
            uint16_t bit_index = (uint16_t)((start_bit + i) % 8U);
            if (bit_index == 0 && i != 0) 
            {
                /* 跨到下一源字节 */
                // Cross to the next source byte
                cur_byte = src_row[full_groups + (i / 8U)];
            }
            uint8_t bit = (cur_byte >> (7 - bit_index)) & 0x01;
            uint8_t nib = bit ? 0x00 : 0x0F;
            if (!have0) 
            {
                nib0 = nib; have0 = 1;
            } 
            else 
            {
                nib1 = nib; have0 = 0;
                dst_row[out++] = (uint8_t)((nib0 << 4) | (nib1 & 0x0F));
            }
        }
        /* 若尾巴是奇数个像素，补最后一个半字节（右像素=0x0）
        If the tail is an odd number of pixels, add the last half byte (right pixel = 0x0) */
        if (have0) 
        {
            dst_row[out++] = (uint8_t)(nib0 << 4);
        }
    }
}

/**
 * @Description: Write pixel data to the display
 * @param dev   Device handle
 * @param x     X coordinate (must be 0)
 * @param y     Y coordinate (starting row)
 * @param desc  Buffer descriptor
 * @param buf   Pointer to pixel data buffer
 * @return      0 on success, negative value on error
 */
static int a6m_0011_write(const struct device *dev, const uint16_t x, const uint16_t y,
                          const struct display_buffer_descriptor *desc, const void *buf)
{
    const a6m_0011_config *cfg    = dev->config;
    a6m_0011_data         *data   = dev->data;
    const uint16_t         width  = desc->width;  
    const uint16_t         height = desc->height;  
    const uint16_t         pitch  = desc->pitch;  /* 源缓冲每行像素（通常=width）; Source buffer pixels per line (usually = width) */

    if (x != 0) 
    {
        LOG_WRN("a6m_0011_write: x must be 0 (x=%u)", x);
        return -ENOTSUP;
    }
    if ((y + height) > cfg->screen_height || width > cfg->screen_width) 
    {
        LOG_WRN("a6m_0011_write: OOB w=%u h=%u y=%u (scr %ux%u)",
                width, height, y, cfg->screen_width, cfg->screen_height);
        return -ENOTSUP;
    }

    /* 首次构建 LUT ; Build LUT for the first time */
    if (!s_i1_to_i4_LUT_built) 
    {
        a6m_build_i1_to_i4_lut();
        LOG_INF("a6m_0011_write: I1->I4 LUT built");
    }

    const uint8_t *src             = (const uint8_t *)buf; /* 1bpp 源 ; 1bpp source */
    const uint16_t src_stride_bytes= (uint16_t)((pitch + 7U) / 8U);
    const uint16_t i4_bytes_per_ln = (uint16_t)((cfg->screen_width + 1U) / 2U); /* 320 */
    uint8_t       *tx              = data->tx_buf_bulk;
    uint8_t       *dst_base        = tx + 4;

    /* 设置行窗口 ; Set row window */
    a6m_0011_write_multiple_rows_cmd(dev, y, (uint16_t)(y + height - 1U));

    /* 写数据前缀（1线 SPI：0x02 + 0x00 0x2C/0x3C 0x00） */
    // write data prefix (1-line SPI: 0x02 + 0x00 0x2C/0x3C 0x00)
    tx[0] = A6M_0011_LCD_DATA_REG;
    tx[1] = (uint8_t)((A6M_0011_LCD_CMD_REG >> 16) & 0xFF);
    tx[2] = (uint8_t)((A6M_0011_LCD_CMD_REG >>  8) & 0xFF);
    tx[3] = (uint8_t)( A6M_0011_LCD_CMD_REG        & 0xFF);

    /* 逐行 LUT 转换 → I4 行（不足 320B 的右侧补 0） */
    // Line-by-line LUT conversion → I4 line (right side of less than 320B is filled with 0)
    for (uint16_t row = 0; row < height; row++) 
    {
        const uint8_t *src_row = src      + (uint32_t)row * src_stride_bytes;
        uint8_t       *dst_row = dst_base + (uint32_t)row * i4_bytes_per_ln;

        /* 先清整行，确保右侧补零 */
        // First clear the entire line to ensure that the right side is filled with zeros
        memset(dst_row, 0x00, i4_bytes_per_ln);

        /* 把本区域 width 像素打包到行左侧（单位：像素），两像素/字节 */
        // Pack the width pixels of this area to the left side of the line (unit: pixel), two pixels/byte
        a6m_pack_i1_to_i4_line_lut(src_row, width, dst_row);
    }

    const uint32_t payload_bytes = (uint32_t)height * (uint32_t)i4_bytes_per_ln;
    const uint32_t bytes_to_send = 4U + payload_bytes;

    int ret = a6m_0011_transmit_all(dev, tx, bytes_to_send, 1);
    #if 0//TEST LOG
    const int64_t t0 = k_uptime_get();
    ret              = a6m_0011_transmit_all(dev, tx, bytes_to_send, 1);
    const int64_t t1 = k_uptime_get();
    const uint32_t ms   = (uint32_t)(t1 - t0);
    const uint32_t kBps = (ms ? (bytes_to_send * 1000U / ms / 1024U) : 0U);
    const uint32_t Mbps = (ms ? (bytes_to_send * 8U / ms / 1000U) : 0U);
    LOG_INF("a6m_0011_write[I1->I4, %uB/line] = [%u]ms, lines[%u], bytes[%u]B, rate≈[%u]KB/s (%uMbit/s)",
            line_bytes_min, ms, height, bytes_to_send, kBps, Mbps);
    #endif

    if (ret)
    {
        LOG_ERR("a6m_0011_write: SPI transmit failed: %d", ret);
        return ret;
    }
    

    return 0;
}
#endif
static int a6m_0011_read(struct device *dev, int x, int y, const struct display_buffer_descriptor *desc, void *buf)
{
    return -ENOTSUP;
}
/**\
 * @Description: set brightness
 * @param brightness: brightness level (0x00 to 0x3A)
 * @return: 0 success, negative error code
 */
int a6m_0011_set_brightness(uint8_t brightness)
{
    LOG_INF("set Brightness: [0x%x]", brightness);
    uint8_t cmd[3] = {0};
    uint8_t level  = 0;
    if (brightness > 0x3a)
    {
        LOG_ERR("level error %02x", brightness);
        level = 0x3a;  // 最大亮度值；maximum brightness value
    }
    else
    {
        level = brightness;
    }
    cmd[0] = A6M_0011_LCD_WRITE_ADDRESS;
    cmd[1] = A6M_0011_LCD_SB_REG;
    cmd[2] = level;
    a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);
    return 0;
}
int a6m_0011_set_mirror(mirror_mode_t mode)
{
    if (mode > MIRROR_BOTH)
    {
        LOG_ERR("Invalid mirror mode: %d", mode);
        return -1;
    }
    uint8_t cmd[3];
    int     err = 0;
    switch (mode)
    {
        case MIRROR_NORMAL:
            // 0: 取消水平和垂直；cancel horizontal and vertical
            cmd[0] = A6M_0011_LCD_WRITE_ADDRESS;
            cmd[1] = A6M_0011_LCD_HORIZONTAL_MIRROR_REG;
            cmd[2] = 0x00;
            err    = a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);

            cmd[1] = A6M_0011_LCD_VERTICAL_MIRROR_REG;
            cmd[2] = 0x00;
            err    |= a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);
            break;

        case MIRROR_HORZ:
            // 1: 仅水平翻转；only horizontal flip
            cmd[0] = A6M_0011_LCD_WRITE_ADDRESS;
            cmd[1] = A6M_0011_LCD_HORIZONTAL_MIRROR_REG;
            cmd[2] = A6M_0011_MIRROR_ENABLE;
            err    = a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);
            break;

        case MIRROR_VERT:
            // 2: 仅垂直翻转；only vertical flip
            cmd[0] = A6M_0011_LCD_WRITE_ADDRESS;
            cmd[1] = A6M_0011_LCD_VERTICAL_MIRROR_REG;
            cmd[2] = A6M_0011_MIRROR_ENABLE;
            err    = a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);
            break;

        case MIRROR_BOTH:
            // 3: 水平 + 垂直；horizontal + vertical
            cmd[0] = A6M_0011_LCD_WRITE_ADDRESS;
            cmd[1] = A6M_0011_LCD_HORIZONTAL_MIRROR_REG;
            cmd[2] = A6M_0011_MIRROR_ENABLE;
            err    = a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);

            cmd[1] = A6M_0011_LCD_VERTICAL_MIRROR_REG;
            cmd[2] = A6M_0011_MIRROR_ENABLE;
            err   |= a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);
            break;
        default:
            LOG_ERR("Unsupported mirror mode: %d", mode);
            return -1;
    }

    LOG_INF("set_mirror: mode=%d, err=%d", mode, err);
    return err;
}

/**
 * @Description: Write register value
 * @param reg: Register address to write
 * @param param: Value to write to the register
 * @return: 0 success, negative error code
 */
int a6m_0011_write_reg(uint8_t reg, uint8_t param)
{
    LOG_INF("bspal_write_register reg:0x%02x, param:0x%02x", reg, param);
    uint8_t cmd[3] = {0};
    cmd[0]         = A6M_0011_LCD_WRITE_ADDRESS;
    cmd[1]         = reg;
    cmd[2]         = param;
    int ret        = a6m_0011_transmit_all(dev_a6m_0011, cmd, sizeof(cmd), 1);
    return ret;
}
/**
 * @Description: Read register value
 * @param reg: Register address to read
 * @return: Register value or negative error code
 */
int a6m_0011_read_reg(int mode, uint8_t reg)
{
    if (mode < 0 || mode > 1)
    {
        LOG_WRN("Invalid mode err!!!");
        return -EINVAL;
    }
    LOG_INF("read reg: %02X", reg);
    uint8_t cmd[3] = {0};
    cmd[0] = A6M_0011_LCD_READ_ADDRESS;
    cmd[1] = reg;
    cmd[2] = 0;
    uint8_t rx_buff[10] = {0};
    const a6m_0011_config *cfg  = dev_a6m_0011->config;
    struct spi_buf buf = {
        .buf = cmd,
        .len = sizeof(cmd),
    };
    struct spi_buf_set tx_set = {
        .buffers = &buf,
        .count   = 1,
    };

    struct spi_buf rx_buf = {
        .buf = rx_buff,
        .len = sizeof(rx_buff),
    };
    struct spi_buf_set rx_set = {
        .buffers = &rx_buf,
        .count   = 1,
    };
    if (mode == 0)
    {
        gpio_pin_set_dt(&cfg->left_cs, 0);
    }
    else
    {
        gpio_pin_set_dt(&cfg->right_cs, 0);
    }
    int ret = spi_transceive_dt(&cfg->spi, &tx_set, &rx_set);
    if (ret != 0)
    {
        LOG_WRN("SPI read_reg_side @0x%02x failed: %d", reg, ret);
        // return ret;
    }
    if (mode == 0)
    {
        gpio_pin_set_dt(&cfg->left_cs, 1);
    }
    else
    {
        gpio_pin_set_dt(&cfg->right_cs, 1);
    }
    LOG_INF("read reg: %02X, value: 0x%02X 0x%02X 0x%02X", reg, rx_buff[0], rx_buff[1], rx_buff[2]);
    return rx_buff[2];
}
static void *a6m_0011_get_framebuffer(struct device *dev)
{
    return NULL;
}
/**
 * @brief Retrieves the capabilities of the display device
 * @param dev Display device handle
 * @param cap Pointer to the display device capability structure
 */
static int a6m_0011_get_capabilities(struct device *dev, struct display_capabilities *cap)
{
    const a6m_0011_config *cfg = (a6m_0011_config *)dev->config;
    memset(cap, 0, sizeof(struct display_capabilities));
    cap->x_resolution = cfg->screen_width;
    cap->y_resolution = cfg->screen_height;
    cap->screen_info  = SCREEN_INFO_MONO_MSB_FIRST | SCREEN_INFO_X_ALIGNMENT_WIDTH;

    cap->current_pixel_format    = PIXEL_FORMAT_MONO01;
    cap->supported_pixel_formats = PIXEL_FORMAT_MONO01;
    // cap->current_pixel_format = PIXEL_FORMAT_MONO10;
    // cap->supported_pixel_formats = PIXEL_FORMAT_MONO10;
    cap->current_orientation = DISPLAY_ORIENTATION_NORMAL;
    return 0;
}
void a6m_0011_power_on(void)
{
    LOG_INF("bsp_lcd_power_on");
    const a6m_0011_config *cfg = (a6m_0011_config *)dev_a6m_0011->config;
    pm_device_action_run(dev_a6m_0011, PM_DEVICE_ACTION_RESUME);
    k_msleep(50);
    // gpio_pin_set_dt(&cfg->v1_8, 1); // v1.8 high
    gpio_pin_set_dt(&cfg->v0_9, 1);  // v1.8 high
    k_msleep(10);
    // gpio_pin_set_dt(&cfg->v0_9, 1); // v0.9 high
    gpio_pin_set_dt(&cfg->v1_8, 1);  // v0.9 high
    k_msleep(300);
}

void a6m_0011_power_off(void)
{
    LOG_INF("bsp_lcd_power_off");
    const a6m_0011_config *cfg = (a6m_0011_config *)dev_a6m_0011->config;
    // display_blanking_on(dev_a6m_0011);
    // spi_release_dt(&cfg->spi);
    gpio_pin_set_dt(&cfg->left_cs, 1);
    gpio_pin_set_dt(&cfg->right_cs, 1);
    pm_device_action_run(dev_a6m_0011, PM_DEVICE_ACTION_SUSPEND);

    gpio_pin_set_dt(&cfg->vcom, 0);
    k_msleep(10);
    gpio_pin_set_dt(&cfg->v0_9, 0);
    k_msleep(10);
    gpio_pin_set_dt(&cfg->v1_8, 0);
}

int a6m_0011_clear_screen(bool color_on)
{
    const a6m_0011_config *cfg  = dev_a6m_0011->config;
    a6m_0011_data         *data = dev_a6m_0011->data;

    uint16_t width  = cfg->screen_width;
    uint16_t height = SCREEN_HEIGHT;
    // Clear MAX_LINES_PER_WRITE lines each time
    uint8_t *tx_buf          = data->tx_buf_bulk;
    uint16_t lines_per_batch = MAX_LINES_PER_WRITE;
    uint16_t total_lines     = height;

    uint8_t  nib               = color_on ? 0x0F : 0x00;// 4-bit color value (0x0F=white, 0x00=black)
    uint8_t  fill_byte         = (uint8_t)((nib << 4) | nib);
    uint16_t i4_bytes_per_line = (width + 1U) / 2U;

    for (uint16_t y = 0; y < total_lines; y += lines_per_batch)
    {
        uint16_t batch_lines = MIN(lines_per_batch, total_lines - y);

        a6m_0011_write_multiple_rows_cmd(dev_a6m_0011, y, y + batch_lines - 1);
        tx_buf[0] = A6M_0011_LCD_DATA_REG;
        tx_buf[1] = (A6M_0011_LCD_CMD_REG >> 16) & 0xFF;
        tx_buf[2] = (A6M_0011_LCD_CMD_REG >> 8) & 0xFF;
        tx_buf[3] = A6M_0011_LCD_CMD_REG & 0xFF;

        for (uint16_t line = 0; line < batch_lines; line++)
        {
            memset(&tx_buf[4 + line * i4_bytes_per_line], fill_byte, i4_bytes_per_line);
        }
        int ret = a6m_0011_transmit_all(dev_a6m_0011, tx_buf, 4 + batch_lines * i4_bytes_per_line, 1);
        if (ret != 0)
        {
            LOG_ERR("a6m_0011_transmit_all failed! (%d)", ret);
            return ret;
        }
    }
    return 0;
}

// **NEW: Direct A6M_0011 Grayscale Test Patterns**
// These functions bypass LVGL and directly access the A6M_0011 hardware for true 8-bit grayscale testing
/**
 * @brief Draw horizontal grayscale pattern with true 8-bit levels
 * @return 0 on success, negative on error
 */
int a6m_0011_draw_horizontal_grayscale_pattern(void)
{
    if (!dev_a6m_0011)
    {
        LOG_WRN("A6M_0011 device not initialized");
        return -ENODEV;
    }

    const a6m_0011_config *cfg  = dev_a6m_0011->config;
    a6m_0011_data         *data = dev_a6m_0011->data;

    uint16_t width             = cfg->screen_width;
    uint16_t height            = cfg->screen_height;
    uint16_t i4_bytes_per_line = (width + 1u) / 2u; /* 320 */
    // 8 grayscale levels: 0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF
    uint8_t  gray_levels[8] = {0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF};
    uint16_t stripe_width   = width / 8;  // 80 pixels per stripe

    uint8_t *tx_buf          = data->tx_buf_bulk;
    uint16_t lines_per_batch = MAX_LINES_PER_WRITE;

    LOG_INF("🎨 Drawing horizontal grayscale pattern (8 levels, %d pixels per stripe)", stripe_width);

    for (uint16_t y = 0; y < height; y += lines_per_batch)
    {
        uint16_t batch_lines = MIN(lines_per_batch, height - y);

        // Build data command header
        a6m_0011_write_multiple_rows_cmd(dev_a6m_0011, y, y + batch_lines - 1);
        tx_buf[0] = A6M_0011_LCD_DATA_REG;
        tx_buf[1] = (A6M_0011_LCD_CMD_REG >> 16) & 0xFF;
        tx_buf[2] = (A6M_0011_LCD_CMD_REG >> 8) & 0xFF;
        tx_buf[3] = A6M_0011_LCD_CMD_REG & 0xFF;

        for (uint16_t line = 0; line < batch_lines; line++)
        {
            uint8_t *dst = &tx_buf[4 + line * i4_bytes_per_line];
            uint16_t out = 0;
            for (uint16_t x = 0; x < width; x += 2u)
            {
                uint16_t s0 = (uint16_t)(x / stripe_width);
                if (s0 > 7) s0 = 7;
                uint16_t s1 = (uint16_t)((x + 1u) / stripe_width);
                if (s1 > 7) s1 = 7;
                uint8_t g0_4 = (uint8_t)(gray_levels[s0] >> 4);
                uint8_t g1_4 = (uint8_t)(gray_levels[s1] >> 4);

                dst[out++] = (uint8_t)((g0_4 << 4) | (g1_4 & 0x0F));
            }
        }

        int ret = a6m_0011_transmit_all(dev_a6m_0011, tx_buf, 4 + batch_lines * i4_bytes_per_line, 1);
        if (ret != 0)
        {
            LOG_WRN("a6m_0011_transmit_all failed! (%d)", ret);
            return ret;
        }
    }

    LOG_INF("✅ Horizontal grayscale pattern completed");
    return 0;
}

/**
 * @brief Draw vertical grayscale pattern with true 8-bit levels
 * @return 0 on success, negative on error
 */
int a6m_0011_draw_vertical_grayscale_pattern(void)
{
    if (!dev_a6m_0011)
    {
        LOG_WRN("A6M_0011 device not initialized");
        return -ENODEV;
    }

    const a6m_0011_config *cfg  = dev_a6m_0011->config;
    a6m_0011_data         *data = dev_a6m_0011->data;

    uint16_t width             = cfg->screen_width;
    uint16_t height            = cfg->screen_height;
    uint16_t i4_bytes_per_line = (width + 1u) / 2u; /* 320 */
    // 8 grayscale levels: 0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF
    uint8_t  gray_levels[8] = {0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF};
    uint16_t stripe_height  = height / 8;  // 60 lines per stripe

    uint8_t *tx_buf          = data->tx_buf_bulk;
    uint16_t lines_per_batch = MAX_LINES_PER_WRITE;

    LOG_INF("🎨 Drawing vertical grayscale pattern (8 levels, %d lines per stripe)", stripe_height);

    for (uint16_t y = 0; y < height; y += lines_per_batch)
    {
        uint16_t batch_lines = (y + lines_per_batch <= height) ? lines_per_batch : (height - y);
        a6m_0011_write_multiple_rows_cmd(dev_a6m_0011, y, (uint16_t)(y + batch_lines - 1));

        tx_buf[0] = A6M_0011_LCD_DATA_REG;
        tx_buf[1] = (A6M_0011_LCD_CMD_REG >> 16) & 0xFF;
        tx_buf[2] = (A6M_0011_LCD_CMD_REG >> 8) & 0xFF;
        tx_buf[3] = A6M_0011_LCD_CMD_REG & 0xFF;

        for (uint16_t line = 0; line < batch_lines; line++)
        {
            uint16_t current_y = y + line;
            uint16_t band = (uint16_t)(current_y / stripe_height);
            if (band > 7) band = 7;

            uint8_t g4 = (uint8_t)(gray_levels[band] >> 4);
            uint8_t b  = (uint8_t)((g4 << 4) | g4); /* 两像素同灰度 */

            uint8_t *dst = &tx_buf[4 + line * i4_bytes_per_line];
            memset(dst, b, i4_bytes_per_line);
        }
        int ret = a6m_0011_transmit_all(dev_a6m_0011, tx_buf, 4 + batch_lines * i4_bytes_per_line, 1);
        if (ret != 0)
        {
            LOG_WRN("a6m_0011_transmit_all failed! (%d)", ret);
            return ret;
        }
    }

    LOG_INF("✅ Vertical grayscale pattern completed");
    return 0;
}

/**
 * @brief Draw chess pattern for display testing
 * @return 0 on success, negative on error
 */
int a6m_0011_draw_chess_pattern(void)
{
    if (!dev_a6m_0011)
    {
        LOG_WRN("A6M_0011 device not initialized");
        return -ENODEV;
    }

    const a6m_0011_config *cfg  = dev_a6m_0011->config;
    a6m_0011_data         *data = dev_a6m_0011->data;

    uint16_t width             = cfg->screen_width;
    uint16_t height            = cfg->screen_height;
    uint16_t square_size       = 40;                // 40x40 pixel squares
    uint16_t i4_bytes_per_line = (width + 1u) / 2u; /* 320 */
    uint8_t *tx_buf            = data->tx_buf_bulk;
    uint16_t lines_per_batch   = MAX_LINES_PER_WRITE;

    LOG_INF("🎨 Drawing chess pattern (%dx%d squares)", square_size, square_size);
    for (uint16_t y = 0; y < height; y += lines_per_batch)
    {
        uint16_t batch_lines = (y + lines_per_batch <= height) ? lines_per_batch : (height - y);

        a6m_0011_write_multiple_rows_cmd(dev_a6m_0011, y, (uint16_t)(y + batch_lines - 1));

        tx_buf[0] = A6M_0011_LCD_DATA_REG;
        tx_buf[1] = (A6M_0011_LCD_CMD_REG >> 16) & 0xFF;
        tx_buf[2] = (A6M_0011_LCD_CMD_REG >> 8) & 0xFF;
        tx_buf[3] = A6M_0011_LCD_CMD_REG & 0xFF;

        for (uint16_t line = 0; line < batch_lines; line++)
        {
            uint16_t current_y = y + line;
            uint16_t row_block = (uint16_t)(current_y / square_size);

            uint8_t *dst = &tx_buf[4 + line * i4_bytes_per_line];
            uint16_t out = 0;

            for (uint16_t x = 0; x < width; x += 2u)
            {
                uint16_t col_block0 = (uint16_t)(x / square_size);
                bool     white0     = (((row_block + col_block0) & 1u) == 0u);
                uint8_t  px0_4      = white0 ? 0x0F : 0x00;

                uint8_t px1_4 = 0x00;
                if (x + 1u < width)
                {
                    uint16_t col_block1 = (uint16_t)((x + 1u) / square_size);
                    bool white1 = (((row_block + col_block1) & 1u) == 0u);
                    px1_4 = white1 ? 0x0F : 0x00;
                }

                dst[out++] = (uint8_t)((px0_4 << 4) | (px1_4 & 0x0F));
            }
        }

        int ret = a6m_0011_transmit_all(dev_a6m_0011, tx_buf, 4 + batch_lines * i4_bytes_per_line, 1);
        if (ret != 0)
        {
            LOG_WRN("a6m_0011_transmit_all failed! (%d)", ret);
            return ret;
        }
    }

    LOG_INF("✅ Chess pattern completed");
    return 0;
}

void a6m_0011_open_display(void)
{
    const a6m_0011_config *cfg = dev_a6m_0011->config;
    gpio_pin_set_dt(&cfg->vcom, 1);  // 开启显示；Enable display
}
/**
 * @brief Initializes the device
 * @param dev Device structure
 */
static int a6m_0011_init(const struct device *dev)
{
    a6m_0011_config *cfg  = (a6m_0011_config *)dev->config;
    a6m_0011_data   *data = (a6m_0011_data *)dev->data;
    int              ret;
    // **NEW: Log SPI configuration for debugging**
    LOG_INF("🚀 A6M_0011 SPI Configuration:");
    LOG_INF("  - Device: %s", cfg->spi.bus->name);
    LOG_INF("  - Max Frequency: %d Hz (%.2f MHz)", cfg->spi.config.frequency,
            (float)cfg->spi.config.frequency / 1000000.0f);
    LOG_INF("  - Operation Mode: 0x%08X", cfg->spi.config.operation);
    LOG_INF("  - Slave ID: %d", cfg->spi.config.slave);

    if (!spi_is_ready_dt(&cfg->spi))
    {
        LOG_ERR("custom_a6m_0011_init SPI device not ready");
        return -ENODEV;
    }
    if (!gpio_is_ready_dt(&cfg->left_cs))
    {
        LOG_ERR("GPIO left cs device not ready");
        return -ENODEV;
    }
    if (!gpio_is_ready_dt(&cfg->right_cs))
    {
        LOG_ERR("GPIO right cs device not ready");
        return -ENODEV;
    }
    if (!gpio_is_ready_dt(&cfg->reset))
    {
        LOG_ERR("GPIO reset device not ready");
        return -ENODEV;
    }
    if (!gpio_is_ready_dt(&cfg->vcom))
    {
        LOG_ERR("GPIO vcom device not ready");
        return -ENODEV;
    }
    if (!gpio_is_ready_dt(&cfg->v1_8))
    {
        LOG_ERR("GPIO v0_8 device not ready");
        return -ENODEV;
    }
    if (!gpio_is_ready_dt(&cfg->v0_9))
    {
        LOG_ERR("GPIO v0_9 device not ready");
        return -ENODEV;
    }
    /*******************************************************/
    ret = gpio_pin_configure_dt(&cfg->left_cs, GPIO_OUTPUT);
    if (ret < 0)
    {
        LOG_ERR("cs display failed! (%d)", ret);
        return ret;
    }
    ret = gpio_pin_set_dt(&cfg->left_cs, 1);
    if (ret < 0)
    {
        LOG_ERR("left_cs Enable display failed! (%d)", ret);
        return ret;
    }
    ret = gpio_pin_configure_dt(&cfg->right_cs, GPIO_OUTPUT);
    if (ret < 0)
    {
        LOG_ERR("right_cs display failed! (%d)", ret);
        return ret;
    }
    ret = gpio_pin_set_dt(&cfg->right_cs, 1);
    if (ret < 0)
    {
        LOG_ERR("right_cs Enable display failed! (%d)", ret);
        return ret;
    }
    ret = gpio_pin_configure_dt(&cfg->reset, GPIO_INPUT);
    if (ret < 0)
    {
        LOG_ERR("Reset display failed! (%d)", ret);
        return ret;
    }
    // ret = gpio_pin_set_dt(&cfg->reset, 1);
    // if (ret < 0)
    // {
    // 	LOG_ERR("reset Enable display failed! (%d)", ret);
    // 	return ret;
    // }

    ret = gpio_pin_configure_dt(&cfg->vcom, GPIO_OUTPUT);
    if (ret < 0)
    {
        LOG_ERR("vcom display failed! (%d)", ret);
        return ret;
    }
    ret = gpio_pin_set_dt(&cfg->vcom, 0);
    if (ret < 0)
    {
        LOG_ERR("vcom Enable display failed! (%d)", ret);
        return ret;
    }

    ret = gpio_pin_configure_dt(&cfg->v1_8, GPIO_OUTPUT);
    if (ret < 0)
    {
        LOG_ERR("v1_8 display failed! (%d)", ret);
        return ret;
    }
    ret = gpio_pin_set_dt(&cfg->v1_8, 0);
    if (ret < 0)
    {
        LOG_ERR("v1_8 Enable display failed! (%d)", ret);
        return ret;
    }

    ret = gpio_pin_configure_dt(&cfg->v0_9, GPIO_OUTPUT);
    if (ret < 0)
    {
        LOG_ERR("v0_9 display failed! (%d)", ret);
        return ret;
    }
    ret = gpio_pin_set_dt(&cfg->v0_9, 0);
    if (ret < 0)
    {
        LOG_ERR("v0_9 Enable display failed! (%d)", ret);
        return ret;
    }
    a6m_0011_init_sem_give();
    data->initialized = true;

    // Simple blinking test - DISABLED to test LVGL patterns
    // LOG_INF("🔧 Starting simple blinking test (500ms on/off)...");
    //
    // for (int i = 0; i < 6; i++) {  // 3 full blink cycles
    // 	LOG_INF("💡 Blink %d: Display OFF", i/2 + 1);
    // 	a6m_0011_clear_screen(false);  // Turn off
    // 	k_msleep(500);  // 500ms on
    //
    // 	LOG_INF("💡 Blink %d: Display ON", i/2 + 1);
    // 	a6m_0011_clear_screen(true); // Turn on
    // 	k_msleep(500);  // 500ms off
    // }
    //
    // LOG_INF("🔧 Blinking test completed - leaving display ON");

    // Clear the display to start fresh for LVGL
    // LOG_INF("🧹 Clearing display for LVGL (setting to OFF/black)");
    // a6m_0011_clear_screen(false);  // Start with display OFF (black)

    LOG_INF("Display initialized");
    return 0;
}
/********************************************************************************/

/* 驱动API注册; Driver API registration */
static DEVICE_API(display, a6m_0011_api) = {
    .blanking_on      = a6m_0011_blanking_on,
    .blanking_off     = a6m_0011_blanking_off,
    .write            = a6m_0011_write,
    .read             = a6m_0011_read,
    .set_brightness   = a6m_0011_set_brightness,    // 设置亮度；Set brightness
    .get_framebuffer  = a6m_0011_get_framebuffer,   // 获取帧缓冲区；Get framebuffer
    .get_capabilities = a6m_0011_get_capabilities,  // 获取显示能力；Get display capabilities
};
/* 每行 I4 字节数：两像素/字节 ; Number of I4 bytes per line: two pixels/byte */
#define A6M_I4_BYTES_PER_LINE(w) (((w) + 1U) / 2U)
#define CUSTOM_a6m_0011_DEFINE(inst)                                                                                \
    static uint8_t                                                                                                  \
        a6m_0011_bulk_tx_buffer_##inst[4 + MAX_LINES_PER_WRITE * A6M_I4_BYTES_PER_LINE(DT_INST_PROP(inst, width))]; \
    static a6m_0011_config a6m_0011_config_##inst = {                                                               \
        .spi           = SPI_DT_SPEC_INST_GET(inst, SPI_OP_MODE_MASTER | SPI_TRANSFER_MSB | SPI_WORD_SET(8U), 0U),  \
        .left_cs       = GPIO_DT_SPEC_INST_GET(inst, left_cs_gpios),                                                \
        .right_cs      = GPIO_DT_SPEC_INST_GET(inst, right_cs_gpios),                                               \
        .reset         = GPIO_DT_SPEC_INST_GET(inst, reset_gpios),                                                  \
        .vcom          = GPIO_DT_SPEC_INST_GET(inst, vcom_gpios),                                                   \
        .v1_8          = GPIO_DT_SPEC_INST_GET(inst, v1_8_gpios),                                                   \
        .v0_9          = GPIO_DT_SPEC_INST_GET(inst, v0_9_gpios),                                                   \
        .screen_width  = DT_INST_PROP(inst, width),                                                                 \
        .screen_height = DT_INST_PROP(inst, height),                                                                \
    };                                                                                                              \
                                                                                                                    \
    static a6m_0011_data a6m_0011_data_##inst = {                                                                   \
        .tx_buf_bulk   = a6m_0011_bulk_tx_buffer_##inst,                                                            \
        .screen_width  = DT_INST_PROP(inst, width),                                                                 \
        .screen_height = DT_INST_PROP(inst, height),                                                                \
        .initialized   = false,                                                                                     \
    };                                                                                                              \
                                                                                                                    \
    DEVICE_DT_INST_DEFINE(inst, a6m_0011_init, NULL, &a6m_0011_data_##inst, &a6m_0011_config_##inst, POST_KERNEL,   \
                          CONFIG_DISPLAY_INIT_PRIORITY, &a6m_0011_api);

/* 为每个状态为"okay"的设备树节点创建实例；Create an instance for each device tree node with the status "okay"*/
DT_INST_FOREACH_STATUS_OKAY(CUSTOM_a6m_0011_DEFINE)