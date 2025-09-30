/*
 * @Author       : Cole
 * @Date         : 2025-07-31 10:40:40
 * @LastEditTime : 2025-09-30 09:39:49
 * @FilePath     : hls12vga.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 				LOG_DBG("SPI Transfer #%d: %zu bytes in %lld ms (%.2f MB/s, %.2f MHz effective)", 
						transfer_count, size, transfer_time_ms, (fl		LOG_ERR("❌ Write bounds check failed: y(%d) + height(%d) > screen_height(%d)", 
				y, height, cfg->screen_height);LOG_ERR("Write bounds check failed: y(%d) + height(%d) > screen_height(%d)", 
				y, height, cfg->screen_height);t)bytes_per_sec / 1000000.0f, effective_speed_mhz); SPDX-License-Identifier: Apache-2.0
 */

#include <stdio.h>
#include <zephyr/types.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/device.h>
#include <zephyr/pm/device.h>
#include <zephyr/drivers/display.h>
#include <zephyr/logging/log.h>
#include "hls12vga.h"

// Include display config for adaptive mirroring correction
#ifdef CONFIG_CUSTOM_HLS12VGA
#include "../../../../src/mos_components/mos_lvgl_display/include/display_config.h"
#endif

LOG_MODULE_REGISTER(custom_hls12vga, LOG_LEVEL_DBG);

#define SCREEN_WIDTH 640
#define SCREEN_HEIGHT 480
#define DT_DRV_COMPAT zephyr_custom_hls12vga

#if DT_NUM_INST_STATUS_OKAY(DT_DRV_COMPAT) == 0
#warning "Custom ls12vga driver enabled without any devices"
#endif
const struct device *dev_hls12vga = DEVICE_DT_GET(DT_INST(0, DT_DRV_COMPAT));
static K_SEM_DEFINE(hls12vga_init_sem, 0, 1);

#define LVGL_TICK_MS 5
// The maximum number of rows written each time can be adjusted according to config lv z vdb size;
#define MAX_LINES_PER_WRITE 48 // 每次写入的最大行数，依据CONFIG_LV_Z_VDB_SIZE可调整;
void hls12vga_init_sem_give(void)
{
	k_sem_give(&hls12vga_init_sem);
}

int hls12vga_init_sem_take(void)
{
	return k_sem_take(&hls12vga_init_sem, K_FOREVER);
}
static int write_reg_side(const struct device *dev,
						  const struct gpio_dt_spec *cs,
						  uint8_t reg,
						  uint8_t val)
{
	if ((!device_is_ready(dev)))
	{
		LOG_ERR("SPI device not ready");
		return -EINVAL;
	}
	if (!gpio_is_ready_dt(cs))
	{
		LOG_ERR("GPIO CS not ready");
		return -EINVAL;
	}

	const hls12vga_config *cfg = dev->config;
	uint8_t tx[3];
	tx[0] = LCD_WRITE_ADDRESS;
	tx[1] = reg;
	tx[2] = val;
	const struct spi_buf buf = {
		.buf = tx,
		.len = sizeof(tx),
	};
	const struct spi_buf_set tx_set = {
		.buffers = &buf,
		.count = 1,
	};
	gpio_pin_set_dt(cs, 0);  // CS active (LOW) - select device
	int err = spi_write_dt(&cfg->spi, &tx_set);
	gpio_pin_set_dt(cs, 1);  // CS inactive (HIGH) - deselect device

	if (err)
	{
		LOG_ERR("SPI write_reg_side @0x%02x failed: %d", reg, err);
	}
	return err;
}
/**
 * @brief 设置左右/垂直 两路显示的偏移量 ;Set the offset for the left/right / vertical dual-display mode
 * @param mode: 左右/垂直; Left/right / vertical;
 * @param pixels: 偏移量 0->8; Offset 0->8;
 */
int hls12vga_set_shift(move_mode mode, uint8_t pixels)
{
	if ((pixels > HLS12VGA_SHIFT_MAX) || (mode > MOVE_DOWN))
	{
		LOG_ERR("Invalid shift parameters");
		return -EINVAL;
	}
	const hls12vga_config *cfg = dev_hls12vga->config;
	int err1 = 0, err2 = 0;
	uint8_t reg_l, val_l, reg_r, val_r;

	switch (mode)
	{
	case MOVE_DEFAULT:
		reg_l = HLS12VGA_LCD_HD_REG;
		val_l = HLS12VGA_SHIFT_CENTER;
		reg_r = HLS12VGA_LCD_HD_REG;
		val_r = HLS12VGA_SHIFT_CENTER;
		break;
	case MOVE_RIGHT:
		reg_l = HLS12VGA_LCD_HD_REG;
		val_l = HLS12VGA_SHIFT_CENTER + pixels; /* 左机向右; Left machine to the right */
		reg_r = HLS12VGA_LCD_HD_REG;
		val_r = HLS12VGA_SHIFT_CENTER - pixels; /* 右机向左; Right machine to the left */
		break;
	case MOVE_LEFT:
		reg_l = HLS12VGA_LCD_HD_REG;
		val_l = HLS12VGA_SHIFT_CENTER - pixels; /* 左机向左; Left machine to the left */
		reg_r = HLS12VGA_LCD_HD_REG;
		val_r = HLS12VGA_SHIFT_CENTER + pixels; /* 右机向右; Right machine to the right */
		break;
	case MOVE_UP:
		reg_l = HLS12VGA_LCD_VD_REG;
		val_l = HLS12VGA_SHIFT_CENTER - pixels; /* 同步向上; Synchronous upward */
		reg_r = HLS12VGA_LCD_VD_REG;
		val_r = HLS12VGA_SHIFT_CENTER - pixels;
		break;
	case MOVE_DOWN:
		reg_l = HLS12VGA_LCD_VD_REG;
		val_l = HLS12VGA_SHIFT_CENTER + pixels; /* 同步向下; Synchronous downward */
		reg_r = HLS12VGA_LCD_VD_REG;
		val_r = HLS12VGA_SHIFT_CENTER + pixels;
		break;
	default:
		return -EINVAL;
	}
	LOG_DBG("hls12vga_set_shift: reg_l=%02X, val_l=%d reg_r=%02X, val_r=%d", reg_l, val_l, reg_r, val_r);
	/* 分别对左右两路写寄存器; Write registers separately for both sides */
	err1 = write_reg_side(dev_hls12vga, &cfg->left_cs, reg_l, val_l);
	err2 = write_reg_side(dev_hls12vga, &cfg->right_cs, reg_r, val_r);

	return err1 ?: err2;
}
/**
 * Send data via SPI
 * @param dev      SPI device handle
 * @param data     Pointer to the data buffer to send
 * @param size     Number of bytes to send
 * @param retries  Number of retries on failure
 * @return         0 on success, negative value on error
 */
static int hls12vga_transmit_all(const struct device *dev, const uint8_t *data, size_t size, int retries)
{
	/* 边界条件检查; Boundary condition check */
	if (!dev || !data || size == 0)
	{
		return -EINVAL;
	}
	
	// **NEW: Add SPI speed measurement for debugging**
	static uint32_t transfer_count = 0;
	int64_t start_time = k_uptime_get();
	transfer_count++;
	
	int err = -1;
	const hls12vga_config *cfg = dev->config;
	struct spi_buf tx_buf = {
		.buf = data,
		.len = size,
	};
	struct spi_buf_set tx = {
		.buffers = &tx_buf,
		.count = 1,
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
			LOG_DBG("SPI write to left failed (attempt %d/%d): %d", i + 1, retries + 1, err);
			continue;
		}
		if (err == 0)
		{
			// **NEW: Calculate and log SPI transfer performance**
			int64_t end_time = k_uptime_get();
			int64_t transfer_time_ms = end_time - start_time;
			uint32_t bytes_per_sec = (transfer_time_ms > 0) ? (size * 1000) / transfer_time_ms : 0;
			float effective_speed_mhz = (float)(size * 8) / (transfer_time_ms * 1000.0f);  // bits per microsecond = MHz
			
			// Log every 100th transfer to avoid spam (disabled for runtime)
			if (transfer_count % 100 == 0) {
				LOG_DBG("SPI Transfer #%d: %zu bytes in %lld ms (%.2f MB/s, %.2f MHz effective)", 
					transfer_count, size, transfer_time_ms, (float)bytes_per_sec / 1000000.0f, effective_speed_mhz);
			}
			
			return 0; /* 成功; Success */
		}
		k_msleep(1); /* 短暂延迟; Short delay */
		LOG_DBG("SPI write to right failed (attempt %d/%d): %d", i + 1, retries + 1, err);
	}
	return err;
}

/**
 * @Description: Command for local data mode
 * @start_line: Starting line number
 * @end_line: Ending line number
 */
void hls12vga_write_multiple_rows_cmd(const struct device *dev, uint16_t start_line, uint16_t end_line)
{
	uint8_t reg[8] = {0};
	reg[0] = HLS12VGA_LCD_DATA_REG;
	reg[1] = (HLS12VGA_LCD_LOCALITY_REG >> 16) & 0xff;
	reg[2] = (HLS12VGA_LCD_LOCALITY_REG >> 8) & 0xff;
	reg[3] = HLS12VGA_LCD_LOCALITY_REG & 0xff;
	reg[4] = (start_line >> 8) & 0xff;
	reg[5] = start_line & 0xff;
	reg[6] = (end_line >> 8) & 0xff;
	reg[7] = end_line & 0xff;
	hls12vga_transmit_all(dev, reg, sizeof(reg), 1);
}

static int hls12vga_blanking_on(struct device *dev)
{
	return 0;
}

static int hls12vga_blanking_off(struct device *dev)
{
	return 0;
}
/**
 * @Description: Initializes the display device
 * @param dev   Display device handle
 * @param y     Starting line
 * @param lines Number of lines
 * @param desc  Image data descriptor structure
 * @param buf   Image data buffer
 * @return      0 on success, negative value on error
 */
#if 1
static int hls12vga_write(const struct device *dev,
						  const uint16_t x,
						  const uint16_t y,
						  const struct display_buffer_descriptor *desc,
						  const void *buf)
{
	const hls12vga_config *cfg = dev->config;
	hls12vga_data *data = dev->data;
	const uint16_t width = desc->width;
	const uint16_t height = desc->height;
	const uint16_t pitch = desc->pitch;
	int ret = 0;
	
	static uint32_t write_call_count = 0;
	write_call_count++;
	
	// LOG_DBG( "🎨 hls12vga_write #%d: pos(%d,%d) size(%dx%d) pitch(%d)", 
	//	write_call_count, x, y, width, height, pitch);
	
	// Disable verbose buffer analysis logging
	// LOG_DBG( "📊 LVGL Buffer Analysis:");
	// LOG_DBG( "  - src_stride: %d bytes (packed bits)", (width + 7) / 8);
	// LOG_DBG( "  - dst_stride: %d bytes (expanded)", cfg->screen_width);
	// LOG_DBG( "  - Total bytes to send: %d", height * cfg->screen_width);
	
	// Disable hex dump logging
	// const uint8_t *debug_src = (const uint8_t *)buf;
	
	// **SAFETY CHECK: Implement chunked transfers for large displays**
	uint32_t total_pixels = width * height;
	const uint32_t MAX_PIXELS_PER_CHUNK = 32000;  // 32K pixels max per transfer
	
	if (total_pixels > MAX_PIXELS_PER_CHUNK) {
		// LOG_DBG( "🔄 Large transfer detected: %d pixels. Implementing chunked transfer...", total_pixels);
		
		// Calculate chunk size - process in horizontal strips
		uint16_t chunk_height = MAX_PIXELS_PER_CHUNK / width;
		if (chunk_height > height) chunk_height = height;
		
		// LOG_DBG( "📦 Chunk size: %dx%d (%d pixels each)", width, chunk_height, width * chunk_height);
		
		// Process in chunks
		int ret = 0;
		for (uint16_t y_offset = 0; y_offset < height; y_offset += chunk_height) {
			uint16_t current_chunk_height = chunk_height;
			if (y_offset + chunk_height > height) {
				current_chunk_height = height - y_offset;
			}
			
			// LOG_DBG( "🧩 Processing chunk at y=%d, height=%d", y + y_offset, current_chunk_height);
			
			// Create a descriptor for this chunk
			struct display_buffer_descriptor chunk_desc = {
				.buf_size = current_chunk_height * ((width + 7) / 8),
				.width = width,
				.height = current_chunk_height,
				.pitch = pitch,
			};
			
			// Calculate source buffer offset for this chunk
			const uint8_t *src_buffer = (const uint8_t *)buf;
			const uint8_t *chunk_src = src_buffer + (y_offset * ((width + 7) / 8));
			
			// Recursively call ourselves with the smaller chunk
			ret = hls12vga_write(dev, x, y + y_offset, &chunk_desc, chunk_src);
			if (ret != 0) {
				LOG_ERR("Chunk transfer failed at y=%d: %d", y + y_offset, ret);
				return ret;
			}
			
			// Small delay between chunks to prevent overwhelming the system
			k_msleep(1);
		}
		
		// LOG_DBG( "✅ Chunked transfer completed successfully!");
		return 0;
	}
	
	// LOG_DBG( "✅ Transfer size OK: %d pixels (direct transfer)", total_pixels);
	
	// if (x != 0 || pitch != cfg->screen_width || width != cfg->screen_width || height > MAX_LINES_PER_WRITE)
	if (y + height > cfg->screen_height)
	{
		LOG_ERR("❌ Write bounds check failed: y(%d) + height(%d) > screen_height(%d)", 
			y, height, cfg->screen_height);
		return -ENOTSUP;
	}

	const uint8_t *src = (const uint8_t *)buf;
	uint8_t *dst = data->tx_buf_bulk + 4;
	const uint16_t src_stride = (width + 7) / 8;
	const uint16_t dst_stride = cfg->screen_width;

	// 每像素1bit展开为 0x00 / 0xFF
	for (uint16_t row = 0; row < height; row++)
	{
		// LVGL缓冲区起始地址 + 偏移量 * 每行字节数（1b = 1像素）
		// Expand LVGL buffer to 0x00 / 0xFF (1b = 1 pixel)
		const uint8_t *src_row = src + row * src_stride;
		// 缓冲区起始地址 + 偏移量 * 每行字节数（1B = 1 像素）
		// Buffer starting address + offset * bytes per row (1B = 1 pixel)
		uint8_t *dst_row = dst + row * dst_stride;
		
#ifdef CONFIG_CUSTOM_HLS12VGA
		// Check if hardware mirroring correction is needed
		const display_config_t *config = display_get_config();
		bool apply_mirroring = (config && config->color_config.hardware_mirroring);
		bool apply_color_inversion = (config && config->color_config.invert_colors);
#else
		bool apply_mirroring = false;
		bool apply_color_inversion = false;
#endif
		
		for (uint16_t col = 0; col < width; col++) // 处理一行数据像素点; Process pixel points in a row of data
		{
			// 读取LVGL源数据字节(1b = 1像素)展开为0x00/0xFF（1B = 1像素）
			// Read LVGL source data byte (1b = 1 pixel) expanded to 0x00/0xFF (1B = 1 pixel)
			uint8_t byte = src_row[col / 8];
			// 读取1bit数据 按照MSB位序读取
			// Read 1bit data, read according to MSB bit order
			uint8_t bit = (byte >> (7 - (col % 8))) & 0x01;
			
			// Apply hardware mirroring correction if needed
			uint16_t dest_col = apply_mirroring ? (width - 1 - col) : col;
			
			// Apply color inversion correction if needed
			if (apply_color_inversion) {
				// For HLS12VGA with color inversion: bit=1(white) -> LED ON(0xFF), bit=0(black) -> LED OFF(0x00)
				dst_row[dest_col] = bit ? COLOR_BRIGHT : BACKGROUND_COLOR;
			} else {
				// Original mapping: bit=1 -> LED OFF, bit=0 -> LED ON (inverted)
				dst_row[dest_col] = bit ? BACKGROUND_COLOR : COLOR_BRIGHT;
			}
		}
	}
	hls12vga_write_multiple_rows_cmd(dev, y, y + height - 1);

	uint8_t *tx_buf = data->tx_buf_bulk;
	tx_buf[0] = HLS12VGA_LCD_DATA_REG;
	tx_buf[1] = (HLS12VGA_LCD_CMD_REG >> 16) & 0xFF;
	tx_buf[2] = (HLS12VGA_LCD_CMD_REG >> 8) & 0xFF;
	tx_buf[3] = HLS12VGA_LCD_CMD_REG & 0xFF;

	ret = hls12vga_transmit_all(dev, tx_buf, 4 + height * dst_stride, 1);
	if (ret != 0)
	{
		LOG_ERR("SPI transmit failed: %d", ret);
	}
	return ret;
}
#endif

static int hls12vga_read(struct device *dev, int x, int y,
						 const struct display_buffer_descriptor *desc,
						 void *buf)
{

	return -ENOTSUP;
}
int hls12vga_set_brightness(uint8_t brightness)
{
	// LOG_DBG( "set Brightness: [%d]", brightness);
	const uint8_t reg_val[] = {1, 4, 7, 10, 14, 18, 22, 27, 32, 40};
	uint8_t level = 0;
	uint8_t cmd[3] = {0};
	if (brightness > 9)
	{
		LOG_ERR("level error %d", brightness);
		level = 40;
	}
	else
	{
		level = reg_val[brightness % 10];
	}
	cmd[0] = LCD_WRITE_ADDRESS;
	cmd[1] = HLS12VGA_LCD_SB_REG;
	cmd[2] = level;
	hls12vga_transmit_all(dev_hls12vga, cmd, sizeof(cmd), 1);
	return 0;
}
/**
 * @Description: Set display orientation
 * @param value: Orientation value.
 *               0x10: Vertical mirror
 *               0x00: Normal display
 *               0x08: Horizontal mirror
 *               0x18: Horizontal + vertical mirror
 * @return: 0 on success, negative value on error
 */
int hls12vga_set_mirror(const uint8_t value)
{
	uint8_t cmd[3] = {0};
	cmd[0] = LCD_WRITE_ADDRESS;
	cmd[1] = HLS12VGA_LCD_MIRROR_REG;
	cmd[2] = value;
	int err = hls12vga_transmit_all(dev_hls12vga, cmd, sizeof(cmd), 1);
	return err;
}
static void *hls12vga_get_framebuffer(struct device *dev)
{
	return NULL;
}
/**
 * @brief Retrieves the capabilities of the display device
 * @param dev Display device handle
 * @param cap Pointer to the display device capability structure
 */
static int hls12vga_get_capabilities(struct device *dev,
									 struct display_capabilities *cap)
{
	const hls12vga_config *cfg = (hls12vga_config *)dev->config;
	memset(cap, 0, sizeof(struct display_capabilities));
	cap->x_resolution = cfg->screen_width;
	cap->y_resolution = cfg->screen_height;
	cap->screen_info = SCREEN_INFO_MONO_MSB_FIRST | SCREEN_INFO_X_ALIGNMENT_WIDTH;

	cap->current_pixel_format = PIXEL_FORMAT_MONO01;
	cap->supported_pixel_formats = PIXEL_FORMAT_MONO01;
	// cap->current_pixel_format = PIXEL_FORMAT_MONO10;
	// cap->supported_pixel_formats = PIXEL_FORMAT_MONO10;
	cap->current_orientation = DISPLAY_ORIENTATION_NORMAL;
	return 0;
}
void hls12vga_power_on(void)
{
	LOG_DBG("HLS12VGA power on");
	const hls12vga_config *cfg = (hls12vga_config *)dev_hls12vga->config;
	pm_device_action_run(dev_hls12vga, PM_DEVICE_ACTION_RESUME);
	k_msleep(50);
	gpio_pin_set_dt(&cfg->reset, 1); // reset high
	k_msleep(1);
	gpio_pin_set_dt(&cfg->v0_9, 1); // v0.9 high
	k_msleep(5);
	gpio_pin_set_dt(&cfg->v1_8, 1); // v1.8 high
	k_msleep(200);
	gpio_pin_set_dt(&cfg->reset, 0); // reset low
	k_msleep(50);					 // 等待复位完成; Wait for reset to complete
	gpio_pin_set_dt(&cfg->reset, 1); // reset high
	k_msleep(200);
}

void hls12vga_power_off(void)
{
	LOG_DBG("HLS12VGA power off");
	const hls12vga_config *cfg = (hls12vga_config *)dev_hls12vga->config;
	// display_blanking_on(dev_hls12vga);
	// spi_release_dt(&cfg->spi);
	gpio_pin_set_dt(&cfg->left_cs, 1);
	gpio_pin_set_dt(&cfg->right_cs, 1);
	pm_device_action_run(dev_hls12vga, PM_DEVICE_ACTION_SUSPEND);

	gpio_pin_set_dt(&cfg->vcom, 0);
	k_msleep(10);
	gpio_pin_set_dt(&cfg->v1_8, 0);
	k_msleep(10);
	gpio_pin_set_dt(&cfg->v0_9, 0);
}
static void lvgl_tick_cb(struct k_timer *timer)
{
	// LOG_DBG( "lvgl_tick_cb");
	lv_tick_inc(LVGL_TICK_MS); // Fixed: use raw value instead of K_MSEC
}
int hls12vga_clear_screen(bool color_on)
{
	const hls12vga_config *cfg = dev_hls12vga->config;
	hls12vga_data *data = dev_hls12vga->data;

	const uint16_t width = cfg->screen_width;
	// const uint16_t height = cfg->screen_height;
	const uint16_t height = SCREEN_HEIGHT;
	// Clear MAX_LINES_PER_WRITE lines each time
	uint8_t *tx_buf = data->tx_buf_bulk;
	uint16_t lines_per_batch = MAX_LINES_PER_WRITE;
	uint16_t total_lines = height;

	uint8_t fill_byte = color_on ? 0xFF : 0x00;
	
	// LOG_DBG( "🧹 hls12vga_clear_screen: color_on=%s, fill_byte=0x%02X", 
	//	color_on ? "true" : "false", fill_byte);
	// LOG_DBG( "  - Screen: %dx%d pixels", width, height);
	// LOG_DBG( "  - Total bytes per frame: %d", width * height);

	for (uint16_t y = 0; y < total_lines; y += lines_per_batch)
	{
		uint16_t batch_lines = MIN(lines_per_batch, total_lines - y);

		// Build data command (LCD Locality + Address)
		hls12vga_write_multiple_rows_cmd(dev_hls12vga, y, y + batch_lines - 1);
		tx_buf[0] = HLS12VGA_LCD_DATA_REG;
		tx_buf[1] = (HLS12VGA_LCD_CMD_REG >> 16) & 0xFF;
		tx_buf[2] = (HLS12VGA_LCD_CMD_REG >> 8) & 0xFF;
		tx_buf[3] = HLS12VGA_LCD_CMD_REG & 0xFF;

		memset(&tx_buf[4], fill_byte, batch_lines * width);
		int ret = hls12vga_transmit_all(dev_hls12vga, tx_buf, 4 + batch_lines * width, 1);
		if (ret != 0)
		{
			LOG_ERR("hls12vga_transmit_all failed! (%d)", ret);
			return ret;
		}
	}
	return 0;
}

// **NEW: Direct HLS12VGA Grayscale Test Patterns**
// These functions bypass LVGL and directly access the HLS12VGA hardware for true 8-bit grayscale testing

/**
 * @brief Draw horizontal grayscale pattern with true 8-bit levels
 * @return 0 on success, negative on error
 */
int hls12vga_draw_horizontal_grayscale_pattern(void)
{
	if (!dev_hls12vga) {
		LOG_ERR("HLS12VGA device not initialized");
		return -ENODEV;
	}

	const hls12vga_config *cfg = dev_hls12vga->config;
	hls12vga_data *data = dev_hls12vga->data;
	
	const uint16_t width = SCREEN_WIDTH;
	const uint16_t height = SCREEN_HEIGHT;
	
	// 8 grayscale levels: 0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF
	const uint8_t gray_levels[8] = {0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF};
	const uint16_t stripe_width = width / 8;  // 80 pixels per stripe
	
	uint8_t *tx_buf = data->tx_buf_bulk;
	uint16_t lines_per_batch = MAX_LINES_PER_WRITE;
	
	LOG_DBG("🎨 Drawing horizontal grayscale pattern (8 levels, %d pixels per stripe)", stripe_width);
	
	for (uint16_t y = 0; y < height; y += lines_per_batch) {
		uint16_t batch_lines = MIN(lines_per_batch, height - y);
		
		// Build data command header
		hls12vga_write_multiple_rows_cmd(dev_hls12vga, y, y + batch_lines - 1);
		tx_buf[0] = HLS12VGA_LCD_DATA_REG;
		tx_buf[1] = (HLS12VGA_LCD_CMD_REG >> 16) & 0xFF;
		tx_buf[2] = (HLS12VGA_LCD_CMD_REG >> 8) & 0xFF;
		tx_buf[3] = HLS12VGA_LCD_CMD_REG & 0xFF;
		
		// Fill data for this batch of lines
		for (uint16_t line = 0; line < batch_lines; line++) {
			uint8_t *line_start = &tx_buf[4 + line * width];
			
			// Fill each stripe with its corresponding gray level
			for (int stripe = 0; stripe < 8; stripe++) {
				uint16_t start_x = stripe * stripe_width;
				uint16_t end_x = (stripe == 7) ? width : (stripe + 1) * stripe_width; // Handle remainder
				
				memset(&line_start[start_x], gray_levels[stripe], end_x - start_x);
			}
		}
		
		int ret = hls12vga_transmit_all(dev_hls12vga, tx_buf, 4 + batch_lines * width, 1);
		if (ret != 0) {
			LOG_ERR( "hls12vga_transmit_all failed! (%d)", ret);
			return ret;
		}
	}
	
	LOG_DBG("✅ Horizontal grayscale pattern completed");
	return 0;
}

/**
 * @brief Draw vertical grayscale pattern with true 8-bit levels  
 * @return 0 on success, negative on error
 */
int hls12vga_draw_vertical_grayscale_pattern(void)
{
	if (!dev_hls12vga) {
		LOG_ERR( "HLS12VGA device not initialized");
		return -ENODEV;
	}

	const hls12vga_config *cfg = dev_hls12vga->config;
	hls12vga_data *data = dev_hls12vga->data;
	
	const uint16_t width = SCREEN_WIDTH;
	const uint16_t height = SCREEN_HEIGHT;
	
	// 8 grayscale levels: 0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF
	const uint8_t gray_levels[8] = {0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF};
	const uint16_t stripe_height = height / 8;  // 60 lines per stripe
	
	uint8_t *tx_buf = data->tx_buf_bulk;
	uint16_t lines_per_batch = MAX_LINES_PER_WRITE;
	
	LOG_DBG("🎨 Drawing vertical grayscale pattern (8 levels, %d lines per stripe)", stripe_height);
	
	for (uint16_t y = 0; y < height; y += lines_per_batch) {
		uint16_t batch_lines = MIN(lines_per_batch, height - y);
		
		// Build data command header
		hls12vga_write_multiple_rows_cmd(dev_hls12vga, y, y + batch_lines - 1);
		tx_buf[0] = HLS12VGA_LCD_DATA_REG;
		tx_buf[1] = (HLS12VGA_LCD_CMD_REG >> 16) & 0xFF;
		tx_buf[2] = (HLS12VGA_LCD_CMD_REG >> 8) & 0xFF;
		tx_buf[3] = HLS12VGA_LCD_CMD_REG & 0xFF;
		
		// Fill data for this batch of lines
		for (uint16_t line = 0; line < batch_lines; line++) {
			uint16_t current_y = y + line;
			uint8_t gray_level = gray_levels[current_y / stripe_height];
			
			// Handle the last stripe which might have different height due to remainder
			if (current_y / stripe_height >= 8) {
				gray_level = gray_levels[7]; // Use last gray level for remainder
			}
			
			memset(&tx_buf[4 + line * width], gray_level, width);
		}
		
		int ret = hls12vga_transmit_all(dev_hls12vga, tx_buf, 4 + batch_lines * width, 1);
		if (ret != 0) {
			LOG_ERR( "hls12vga_transmit_all failed! (%d)", ret);
			return ret;
		}
	}
	
	LOG_DBG("✅ Vertical grayscale pattern completed");
	return 0;
}

/**
 * @brief Draw chess pattern for display testing
 * @return 0 on success, negative on error
 */
int hls12vga_draw_chess_pattern(void)
{
	if (!dev_hls12vga) {
		LOG_ERR( "HLS12VGA device not initialized");
		return -ENODEV;
	}

	const hls12vga_config *cfg = dev_hls12vga->config;
	hls12vga_data *data = dev_hls12vga->data;
	
	const uint16_t width = SCREEN_WIDTH;
	const uint16_t height = SCREEN_HEIGHT;
	const uint16_t square_size = 40;  // 40x40 pixel squares
	
	uint8_t *tx_buf = data->tx_buf_bulk;
	uint16_t lines_per_batch = MAX_LINES_PER_WRITE;
	
	LOG_DBG("🎨 Drawing chess pattern (%dx%d squares)", square_size, square_size);
	
	for (uint16_t y = 0; y < height; y += lines_per_batch) {
		uint16_t batch_lines = MIN(lines_per_batch, height - y);
		
		// Build data command header
		hls12vga_write_multiple_rows_cmd(dev_hls12vga, y, y + batch_lines - 1);
		tx_buf[0] = HLS12VGA_LCD_DATA_REG;
		tx_buf[1] = (HLS12VGA_LCD_CMD_REG >> 16) & 0xFF;
		tx_buf[2] = (HLS12VGA_LCD_CMD_REG >> 8) & 0xFF;
		tx_buf[3] = HLS12VGA_LCD_CMD_REG & 0xFF;
		
		// Fill data for this batch of lines
		for (uint16_t line = 0; line < batch_lines; line++) {
			uint16_t current_y = y + line;
			uint16_t row = current_y / square_size;
			
			for (uint16_t x = 0; x < width; x++) {
				uint16_t col = x / square_size;
				bool is_white = (row + col) % 2 == 0;
				tx_buf[4 + line * width + x] = is_white ? 0xFF : 0x00;
			}
		}
		
		int ret = hls12vga_transmit_all(dev_hls12vga, tx_buf, 4 + batch_lines * width, 1);
		if (ret != 0) {
			LOG_ERR( "hls12vga_transmit_all failed! (%d)", ret);
			return ret;
		}
	}
	
	LOG_DBG("✅ Chess pattern completed");
	return 0;
}

void hls12vga_open_display(void)
{
	const hls12vga_config *cfg = dev_hls12vga->config;
	gpio_pin_set_dt(&cfg->vcom, 1); // 开启显示; open display
}
/**
 * @brief Initializes the device
 * @param dev Device structure
 */
static int hls12vga_init(const struct device *dev)
{
	hls12vga_config *cfg = (hls12vga_config *)dev->config;
	hls12vga_data *data = (hls12vga_data *)dev->data;
	int ret;
	
	// **NEW: Log SPI configuration for debugging**
	LOG_DBG("HLS12VGA SPI Configuration:");
	LOG_DBG("  - Device: %s", cfg->spi.bus->name);
	LOG_DBG("  - Max Frequency: %d Hz (%.2f MHz)", 
		cfg->spi.config.frequency, (float)cfg->spi.config.frequency / 1000000.0f);
	LOG_DBG("  - Operation Mode: 0x%08X", cfg->spi.config.operation);
	LOG_DBG("  - Slave ID: %d", cfg->spi.config.slave);
	
	if (!spi_is_ready_dt(&cfg->spi))
	{
		LOG_ERR("HLS12VGA SPI device not ready");
		return -ENODEV;
	}
	if (!gpio_is_ready_dt(&cfg->left_cs))
	{
		LOG_ERR("HLS12VGA GPIO left cs device not ready");
		return -ENODEV;
	}
	if (!gpio_is_ready_dt(&cfg->right_cs))
	{
		LOG_ERR( "GPIO right cs device not ready");
		return -ENODEV;
	}
	if (!gpio_is_ready_dt(&cfg->reset))
	{
		LOG_ERR( "GPIO reset device not ready");
		return -ENODEV;
	}
	if (!gpio_is_ready_dt(&cfg->vcom))
	{
		LOG_ERR( "GPIO vcom device not ready");
		return -ENODEV;
	}
	if (!gpio_is_ready_dt(&cfg->v1_8))
	{
		LOG_ERR( "GPIO v0_8 device not ready");
		return -ENODEV;
	}
	if (!gpio_is_ready_dt(&cfg->v0_9))
	{
		LOG_ERR( "GPIO v0_9 device not ready");
		return -ENODEV;
	}
	/****************************************************************** */
	ret = gpio_pin_configure_dt(&cfg->left_cs, GPIO_OUTPUT);
	if (ret < 0)
	{
		LOG_ERR( "cs display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_set_dt(&cfg->left_cs, 1);
	if (ret < 0)
	{
		LOG_ERR( "left_cs Enable display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_configure_dt(&cfg->right_cs, GPIO_OUTPUT);
	if (ret < 0)
	{
		LOG_ERR( "right_cs display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_set_dt(&cfg->right_cs, 1);
	if (ret < 0)
	{
		LOG_ERR( "right_cs Enable display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_configure_dt(&cfg->reset, GPIO_OUTPUT);
	if (ret < 0)
	{
		LOG_ERR( "Reset display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_set_dt(&cfg->reset, 1);
	if (ret < 0)
	{
		LOG_ERR( "reset Enable display failed! (%d)", ret);
		return ret;
	}

	ret = gpio_pin_configure_dt(&cfg->vcom, GPIO_OUTPUT);
	if (ret < 0)
	{
		LOG_ERR( "vcom display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_set_dt(&cfg->vcom, 1);  // Enable VCOM (HIGH)
	if (ret < 0)
	{
		LOG_ERR( "vcom Enable display failed! (%d)", ret);
		return ret;
	}

	ret = gpio_pin_configure_dt(&cfg->v1_8, GPIO_OUTPUT);
	if (ret < 0)
	{
		LOG_ERR( "v1_8 display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_set_dt(&cfg->v1_8, 1);  // Enable 1.8V power supply
	if (ret < 0)
	{
		LOG_ERR( "v1_8 Enable display failed! (%d)", ret);
		return ret;
	}

	ret = gpio_pin_configure_dt(&cfg->v0_9, GPIO_OUTPUT);
	if (ret < 0)
	{
		LOG_ERR( "v0_9 display failed! (%d)", ret);
		return ret;
	}
	ret = gpio_pin_set_dt(&cfg->v0_9, 1);  // Enable 0.9V power supply
	if (ret < 0)
	{
		LOG_ERR( "v0_9 Enable display failed! (%d)", ret);
		return ret;
	}
	hls12vga_init_sem_give();
	data->initialized = true;
	
	// Simple blinking test - DISABLED to test LVGL patterns
	// LOG_DBG( "🔧 Starting simple blinking test (500ms on/off)...");
	// 
	// for (int i = 0; i < 6; i++) {  // 3 full blink cycles
	// 	LOG_DBG( "💡 Blink %d: Display OFF", i/2 + 1);
	// 	hls12vga_clear_screen(false);  // Turn off
	// 	k_msleep(500);  // 500ms on
	// 	
	// 	LOG_DBG( "💡 Blink %d: Display ON", i/2 + 1);
	// 	hls12vga_clear_screen(true); // Turn on
	// 	k_msleep(500);  // 500ms off
	// }
	// 
	// LOG_DBG( "🔧 Blinking test completed - leaving display ON");

	// Clear the display to start fresh for LVGL
	// LOG_DBG( "🧹 Clearing display for LVGL (setting to OFF/black)");
	// hls12vga_clear_screen(false);  // Start with display OFF (black)

	LOG_DBG( "Display initialized");
	return 0;
}
/********************************************************************************/

/* 驱动API注册;device API registration */
// static const struct display_driver_api hls12vga_driver_api =
static DEVICE_API(display, hls12vga_api) =
	{
		.blanking_on = hls12vga_blanking_on,
		.blanking_off = hls12vga_blanking_off,
		.write = hls12vga_write,
		.read = hls12vga_read,
		.set_brightness = hls12vga_set_brightness,	   // set brightness
		.get_framebuffer = hls12vga_get_framebuffer,   // get framebuffer
		.get_capabilities = hls12vga_get_capabilities, // get capabilities
};
#define CUSTOM_HLS12VGA_DEFINE(inst)                                                                     \
	static uint8_t hls12vga_bulk_tx_buffer_##inst[4 + MAX_LINES_PER_WRITE * DT_INST_PROP(inst, width)];  \
	static hls12vga_config hls12vga_config_##inst = {                                                    \
		.spi = SPI_DT_SPEC_INST_GET(inst, SPI_OP_MODE_MASTER | SPI_TRANSFER_MSB | SPI_WORD_SET(8U), 0U), \
		.left_cs = GPIO_DT_SPEC_INST_GET(inst, left_cs_gpios),                                           \
		.right_cs = GPIO_DT_SPEC_INST_GET(inst, right_cs_gpios),                                         \
		.reset = GPIO_DT_SPEC_INST_GET(inst, reset_gpios),                                               \
		.vcom = GPIO_DT_SPEC_INST_GET(inst, vcom_gpios),                                                 \
		.v1_8 = GPIO_DT_SPEC_INST_GET(inst, v1_8_gpios),                                                 \
		.v0_9 = GPIO_DT_SPEC_INST_GET(inst, v0_9_gpios),                                                 \
		.screen_width = DT_INST_PROP(inst, width),                                                       \
		.screen_height = DT_INST_PROP(inst, height),                                                     \
	};                                                                                                   \
                                                                                                         \
	static hls12vga_data hls12vga_data_##inst = {                                                        \
		.tx_buf_bulk = hls12vga_bulk_tx_buffer_##inst,                                                   \
		.screen_width = DT_INST_PROP(inst, width),                                                       \
		.screen_height = DT_INST_PROP(inst, height),                                                     \
		.initialized = false,                                                                            \
	};                                                                                                   \
                                                                                                         \
	DEVICE_DT_INST_DEFINE(inst, hls12vga_init, NULL,                                                     \
						  &hls12vga_data_##inst, &hls12vga_config_##inst,                                \
						  POST_KERNEL, CONFIG_DISPLAY_INIT_PRIORITY,                                     \
						  &hls12vga_api);

/* 为每个状态为"okay"的设备树节点创建实例;
 * Create an instance for each device tree node with status "okay" */
DT_INST_FOREACH_STATUS_OKAY(CUSTOM_HLS12VGA_DEFINE)