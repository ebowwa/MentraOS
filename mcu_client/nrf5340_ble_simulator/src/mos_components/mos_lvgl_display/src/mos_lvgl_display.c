/*
 * @Author       : Cole
 * @Date         : 2025-07-31 10:40:40
 * @LastEditTime : 2025-09-11 21:08:42
 * @FilePath     : mos_lvgl_display.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include <math.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/display.h>
#include <zephyr/kernel.h>

#include "lvgl_display.h"
// #include <lvgl.h>
// #include <hls12vga.h>
// #include <display/lcd/hls12vga.h>

#include "bal_os.h"
#include "bsp_log.h"
#include "display_manager.h"  // **NEW: For font mapping function**
#include "display_config.h"   // **NEW: Modular display configuration system**
#include "mos_lvgl_display.h"
// #include "bspal_icm42688p.h"
// #include "task_ble_receive.h"
#include <zephyr/logging/log.h>

#define LOG_MODULE_NAME MOS_LVGL
LOG_MODULE_REGISTER(LOG_MODULE_NAME);

#define TAG            "MOS_LVGL"
#define TASK_LVGL_NAME "MOS_LVGL"

#define LVGL_THREAD_STACK_SIZE (4096 * 4)
#define LVGL_THREAD_PRIORITY   6
K_THREAD_STACK_DEFINE(lvgl_stack_area, LVGL_THREAD_STACK_SIZE);
static struct k_thread lvgl_thread_data;
k_tid_t                lvgl_thread_handle;

static K_SEM_DEFINE(lvgl_display_sem, 0, 1);

#define DISPLAY_CMD_QSZ 16
K_MSGQ_DEFINE(lvgl_display_msgq, sizeof(display_cmd_t), DISPLAY_CMD_QSZ, 4);

#define LVGL_TICK_MS 5  // Reduced from 5ms to 2ms for better FPS (K901 optimization)
static struct k_timer fps_timer;
static uint32_t       frame_count = 0;

static volatile bool display_onoff = false;

// **NEW: Global references for protobuf text container**
static lv_obj_t *protobuf_container = NULL;
static lv_obj_t *protobuf_label     = NULL;

// **NEW: Pattern 5 XY Text Positioning Area (Global references)**
static lv_obj_t *xy_text_container     = NULL;  // 124x60 bordered viewing area for SSD1306 128x64
static lv_obj_t *current_xy_text_label = NULL;  // Current positioned text label

static void fps_timer_cb(struct k_timer *timer_id)
{
    uint32_t fps = frame_count;
    frame_count  = 0;
//     BSP_LOGI(TAG, "📈 LVGL Performance Monitor:");
//     BSP_LOGI(TAG, "  - Current FPS: %d (Target: ~5 FPS like K901)", fps);
//     BSP_LOGI(TAG, "  - LVGL Tick Rate: %d ms (K901 optimized)", LVGL_TICK_MS);
//     BSP_LOGI(TAG, "  - Message Queue Timeout: 1ms (K901 fast response)");
}

void lv_example_scroll_text(void)
{
    // 创建一个标签
    lv_obj_t *label = lv_label_create(lv_screen_active());

    // 设置滚动模式（自动横向滚动）
    // lv_label_set_long_mode(label, LV_LABEL_LONG_SCROLL);
    lv_label_set_long_mode(label, LV_LABEL_LONG_SCROLL_CIRCULAR);

    // 设置标签区域宽度（可视区域）- SSD1306 128x64
    lv_obj_set_width(label, 128);  // SSD1306 display width (was 640)

    // 设置标签位置 - SSD1306 128x64
    lv_obj_set_pos(label, 0, 50);  // x/y 位置 (was 0, 410 for larger display)

    // 设置长文本（会触发滚动）
    lv_label_set_text(label, "!!!!!nRF5340 + NCS 3.0.0 + LVGL!!!!");

    lv_obj_set_style_text_color(label, lv_color_white(), 0);  // 白色对应非零值
    lv_obj_set_style_text_font(label, &lv_font_montserrat_12, 0);  // Smaller font for SSD1306 (was 48)
    lv_obj_set_style_bg_color(lv_screen_active(), lv_color_black(), 0);
}

/**
 * @brief 设置显示开关
 * @param state true 开启显示，false 关闭显示
 */
void set_display_onoff(bool state)
{
    display_onoff = state;
}
bool get_display_onoff(void)
{
    return display_onoff;
}
void lvgl_display_sem_give(void)
{
    mos_sem_give(&lvgl_display_sem);
}

int lvgl_display_sem_take(int64_t time)
{
    return mos_sem_take(&lvgl_display_sem, time);
}

void display_open(void)
{
    // display_cmd_t cmd = {.type = LCD_CMD_OPEN, .param = NULL};
    display_cmd_t cmd = {.type = LCD_CMD_OPEN, .p.open = {.brightness = 9, .mirror = 0x08}};
    mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

void display_close(void)
{
    // display_cmd_t cmd = {.type = LCD_CMD_CLOSE, .param = NULL};
    // mos_msgq_sendsplay_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

// **NEW: Thread-safe pattern cycling - sends message to LVGL thread**
void display_cycle_pattern(void)
{
    display_cmd_t cmd = {
        .type = LCD_CMD_CYCLE_PATTERN, .p.pattern = {.pattern_id = 0}  // Will be determined by LVGL thread
    };
    mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

// **NEW: Thread-safe protobuf text update - sends message to LVGL thread**
void display_update_protobuf_text(const char *text_content)
{
    if (!text_content)
    {
        BSP_LOGE(TAG, "Invalid text content pointer");
        return;
    }

    display_cmd_t cmd = {
        .type = LCD_CMD_UPDATE_PROTOBUF_TEXT, .p = {.protobuf_text = {{0}}}  // Proper initialization with nested braces
    };

    // Safely copy text content with bounds checking
    size_t text_len = strlen(text_content);
    if (text_len > MAX_TEXT_LEN)
    {
        text_len = MAX_TEXT_LEN;
        BSP_LOGW(TAG, "Protobuf text truncated to %d chars", MAX_TEXT_LEN);
    }

    strncpy(cmd.p.protobuf_text.text, text_content, text_len);
    cmd.p.protobuf_text.text[text_len] = '\0';  // Ensure null termination

    mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

// **NEW: Direct HLS12VGA pattern functions - Thread-safe**
void display_draw_horizontal_grayscale(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_GRAYSCALE_HORIZONTAL};
    mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

void display_draw_vertical_grayscale(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_GRAYSCALE_VERTICAL};
    mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

void display_draw_chess_pattern(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_CHESS_PATTERN};
    mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

// **NEW: Pattern 5 XY Text Positioning - Thread-safe function**
void display_update_xy_text(uint16_t x, uint16_t y, const char *text_content, uint16_t font_size, uint32_t color)
{
    if (!text_content)
    {
        BSP_LOGE(TAG, "Invalid XY text content pointer");
        return;
    }

    display_cmd_t cmd = {
        .type      = LCD_CMD_UPDATE_XY_TEXT,
        .p.xy_text = {
            .x = x, .y = y, .font_size = font_size, .color = color, .text = {0}  // Initialize text array
        }};

    // Safely copy text content with bounds checking
    size_t text_len = strlen(text_content);
    if (text_len > MAX_TEXT_LEN)
    {
        text_len = MAX_TEXT_LEN;
        BSP_LOGW(TAG, "XY text truncated to %d chars", MAX_TEXT_LEN);
    }

    strncpy(cmd.p.xy_text.text, text_content, text_len);
    cmd.p.xy_text.text[text_len] = '\0';  // Ensure null termination

    mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

void display_send_frame(void *data_ptr)
{
    // display_cmd_t cmd = {.type = LCD_CMD_DATA, .param = data_ptr};
    // mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}
void lvgl_display_text(void)
{
    lv_obj_t *hello_world_label = lv_label_create(lv_screen_active());
    lv_label_set_text(hello_world_label, "Hello LVGL World");
    lv_obj_align(hello_world_label, LV_ALIGN_CENTER, 0, 0);  // 居中对齐
    // lv_obj_align(hello_world_label, LV_TEXT_ALIGN_RIGHT, 0, 0); // 右对齐720
    // lv_obj_align(hello_world_label, LV_TEXT_ALIGN_LEFT, 0, 0);  // 左对齐
    // lv_obj_align(hello_world_label, LV_ALIGN_BOTTOM_MID, 0, 0); // 底部居中对齐
    lv_obj_set_style_text_color(hello_world_label, lv_color_white(), 0);  // 白色对应非零值
    lv_obj_set_style_text_font(hello_world_label, &lv_font_montserrat_48, 0);
    lv_obj_set_style_bg_color(lv_screen_active(), lv_color_black(), 0);
}
static lv_obj_t   *counter_label;
static lv_timer_t *counter_timer;  // 指针即可
static lv_obj_t   *acc_label;
static lv_obj_t   *gyr_label;
static void  counter_timer_cb(lv_timer_t *timer)
{
    // int *count = (int *)lv_timer_get_user_data(timer);
    // // lv_label_set_text_fmt(counter_label, "Count: %d", (*count)++);
    // char buf[64];
    // sprintf(buf, "ACC X=%.3f m/s Y=%.3f m/s Z=%.3f m/s",
    //         icm42688p_data.acc_ms2[0],
    //         icm42688p_data.acc_ms2[1],
    //         icm42688p_data.acc_ms2[2]);
    // lv_label_set_text(acc_label, buf);
    // memset(buf, 0, sizeof(buf));
    // /* 更新陀螺仪标签 */
    // sprintf(buf, "GYR X=%.4f dps Y=%.4f dps Z=%.4f dps",
    //         icm42688p_data.gyr_dps[0],
    //         icm42688p_data.gyr_dps[1],
    //         icm42688p_data.gyr_dps[2]);
    // lv_label_set_text(gyr_label, buf);
}

void ui_create(void)
{
    // counter_label = lv_label_create(lv_screen_active());
    acc_label = lv_label_create(lv_screen_active());
    lv_obj_align(acc_label, LV_TEXT_ALIGN_LEFT, 0, 320);
    gyr_label = lv_label_create(lv_screen_active());
    lv_obj_align(gyr_label, LV_TEXT_ALIGN_LEFT, 0, 380);

    // lv_obj_align(counter_label, LV_TEXT_ALIGN_LEFT, 50, 320);       // 左对齐
    lv_obj_set_style_text_color(acc_label, lv_color_white(), 0);  // 白色对应非零值
    lv_obj_set_style_text_font(acc_label, &lv_font_montserrat_30, 0);
    lv_obj_set_style_text_color(gyr_label, lv_color_white(), 0);  // 白色对应非零值
    lv_obj_set_style_text_font(gyr_label, &lv_font_montserrat_30, 0);
    lv_obj_set_style_bg_color(lv_screen_active(), lv_color_black(), 0);
    // 创建一个 100ms 周期的定时器，把 count 指针经 user_data 传给它
    static int count = 0;
    counter_timer    = lv_timer_create(counter_timer_cb, 300, &count);
    // （100 是毫秒，回调里每次会被触发）
}

/****************************************************/
static lv_obj_t *cont = NULL;
static lv_anim_t anim;

// 动画回调，将容器纵向滚动到 v 像素
static void scroll_cb(void *var, int32_t v)
{
    LV_UNUSED(var);
    lv_obj_scroll_to_y(cont, v, LV_ANIM_OFF);
}
/**
 * @brief 在指定区域创建一个垂直循环滚动长文本
 * @param parent  父对象，一般使用 lv_scr_act()
 * @param x       区域左上角 X 坐标
 * @param y       区域左上角 Y 坐标
 * @param w       区域宽度（像素）
 * @param h       区域高度（像素）
 * @param txt     要滚动显示的文本
 * @param font    字体指针，如 &lv_font_montserrat_48
 * @param time_ms 从滚动到末端并返回所用时间（毫秒）
 */
void scroll_text_create(lv_obj_t *parent, lv_coord_t x, lv_coord_t y, lv_coord_t w, lv_coord_t h, const char *txt,
                        const lv_font_t *font, uint32_t time_ms)
{
    // 移除旧区域
    scroll_text_stop();

    // 创建可滚动容器
    cont = lv_obj_create(parent);
    lv_obj_set_size(cont, w, h);
    lv_obj_set_pos(cont, x, y);
    lv_obj_set_scroll_dir(cont, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(cont, LV_SCROLLBAR_MODE_OFF);
    // 设置容器背景为黑色
    lv_obj_set_style_bg_color(cont, lv_color_black(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(cont, LV_OPA_COVER, LV_PART_MAIN);

    // 在容器中创建标签
    lv_obj_t *label = lv_label_create(cont);
    lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(label, w);
    lv_label_set_text(label, txt);

    // 设置文字为白色和指定字体
    lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);

    // 强制标签布局更新，获取正确的内容高度
    lv_obj_update_layout(label);
    int32_t label_h = lv_obj_get_height(label);
    // 计算滚动范围 = 标签高度 - 容器高度
    int32_t range = label_h - h;
    if (range <= 0)
        return;

    // 初始化并启动往返滚动动画
    lv_anim_init(&anim);
    lv_anim_set_var(&anim, cont);
    lv_anim_set_exec_cb(&anim, scroll_cb);
    lv_anim_set_time(&anim, time_ms);
    lv_anim_set_values(&anim, 0, range);
    // lv_anim_set_playback_duration(&anim, time_ms); // 反向动画时间
    lv_anim_set_repeat_count(&anim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_start(&anim);
}

void scroll_text_stop(void)
{
    if (cont)
    {
        lv_anim_del(cont, scroll_cb);
        lv_obj_del(cont);
        cont = NULL;
    }
}
// void handle_display_text(const mentraos_ble_DisplayText *txt)
// {
//     display_cmd_t cmd;

//     cmd.type = LCD_CMD_TEXT;
//     BSP_LOGI(TAG, "show text: %s", (char *)txt->text.arg);
//     BSP_LOG_BUFFER_HEX(TAG, (char *)txt->text.arg, MAX_TEXT_LEN);
//     // /* txt->text.arg 已由 decode_string 填入 NUL 结尾字符串 */
//     // // strncpy(cmd.p.text.text, (char *)txt->text.arg, MAX_TEXT_LEN);
//     memcpy(cmd.p.text.text, (char *)txt->text.arg, MAX_TEXT_LEN);
//     cmd.p.text.text[MAX_TEXT_LEN] = '\0';

//     cmd.p.text.x = txt->x;
//     cmd.p.text.y = 260; // test  // txt->y;
//     cmd.p.text.font_code = txt->font_code;
//     cmd.p.text.font_color = txt->color;
//     cmd.p.text.size = txt->size;
//     // 非阻塞入队，队满则丢弃并打印警告
//     if (mos_msgq_send(&lvgl_display_msgq, &cmd, MOS_OS_WAIT_ON) != 0)
//     {
//         BSP_LOGE(TAG, "UI queue full, drop text");
//     }
// }

/****************************************************/
// Forward declarations
static void show_test_pattern(int pattern_id);

static void show_default_ui(void)
{
    BSP_LOGI(TAG, "🖼️ Starting with scrolling 'Welcome to MentraOS NExFirmware!' text...");
    // Start with pattern 3 (scrolling welcome text) - advanced text animation
    show_test_pattern(4);

    BSP_LOGI(TAG, "🖼️ Scrolling welcome message complete - should see animated text");
}

// Test pattern functions
static void create_chess_pattern(lv_obj_t *screen)
{
    // **NEW: Get modular display configuration for adaptive chess pattern**
    const display_config_t *config = display_get_config();
    
    // **NEW: Use configuration-based chess square size**
    const int chess_size = config->patterns.chess_square_size;
    const int chess_cols = config->width / chess_size;
    const int chess_rows = config->height / chess_size;

    BSP_LOGI(TAG, "🏁 Creating adaptive chess pattern: %dx%d squares (%d cols x %d rows) for %s", 
             chess_size, chess_size, chess_cols, chess_rows, config->name);

    for (int row = 0; row < chess_rows; row++)
    {
        for (int col = 0; col < chess_cols; col++)
        {
            // Alternate black and white squares
            bool is_white = (row + col) % 2 == 0;

            lv_obj_t *square = lv_obj_create(screen);
            lv_obj_set_size(square, chess_size, chess_size);
            lv_obj_set_pos(square, col * chess_size, row * chess_size);
            lv_obj_set_style_bg_color(square, is_white ? lv_color_white() : lv_color_black(), 0);
            lv_obj_set_style_bg_opa(square, LV_OPA_COVER, 0);
            lv_obj_set_style_border_width(square, 0, 0);
            lv_obj_set_style_pad_all(square, 0, 0);
        }
    }
}

static void create_horizontal_zebra_pattern(lv_obj_t *screen)
{
    // **NEW: Get modular display configuration for adaptive horizontal bars**
    const display_config_t *config = display_get_config();
    
    // **NEW: Use configuration-based bar thickness**
    const int stripe_height = config->patterns.bar_thickness;
    const int num_stripes   = config->height / stripe_height;

    BSP_LOGI(TAG, "🦓 Creating adaptive horizontal zebra: %d stripes (%dpx height) for %s", 
             num_stripes, stripe_height, config->name);

    for (int i = 0; i < num_stripes; i++)
    {
        bool is_white = i % 2 == 0;

        lv_obj_t *stripe = lv_obj_create(screen);
        lv_obj_set_size(stripe, config->width, stripe_height);
        lv_obj_set_pos(stripe, 0, i * stripe_height);
        lv_obj_set_style_bg_color(stripe, is_white ? lv_color_white() : lv_color_black(), 0);
        lv_obj_set_style_bg_opa(stripe, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(stripe, 0, 0);
        lv_obj_set_style_pad_all(stripe, 0, 0);
    }
}

static void create_vertical_zebra_pattern(lv_obj_t *screen)
{
    // **NEW: Get modular display configuration for adaptive vertical bars**
    const display_config_t *config = display_get_config();
    
    // **NEW: Use configuration-based bar thickness**
    const int stripe_width = config->patterns.bar_thickness;
    const int num_stripes  = config->width / stripe_width;

    BSP_LOGI(TAG, "🦓 Creating adaptive vertical zebra: %d stripes (%dpx width) for %s", 
             num_stripes, stripe_width, config->name);

    for (int i = 0; i < num_stripes; i++)
    {
        bool is_white = i % 2 == 0;

        lv_obj_t *stripe = lv_obj_create(screen);
        lv_obj_set_size(stripe, stripe_width, config->height);
        lv_obj_set_pos(stripe, i * stripe_width, 0);
        lv_obj_set_style_bg_color(stripe, is_white ? lv_color_white() : lv_color_black(), 0);
        lv_obj_set_style_bg_opa(stripe, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(stripe, 0, 0);
        lv_obj_set_style_pad_all(stripe, 0, 0);
    }
}

// Global variables for smooth scrolling animation
static lv_obj_t *scrolling_welcome_label = NULL;
static lv_anim_t welcome_scroll_anim;

// Animation callback for smooth horizontal scrolling
static void welcome_scroll_anim_cb(void *var, int32_t v)
{
    lv_obj_set_x((lv_obj_t *)var, v);
}

// Animation ready callback to restart the scroll
static void welcome_scroll_ready_cb(lv_anim_t *a)
{
    if (scrolling_welcome_label == NULL)
        return;

    // Restart the animation for infinite loop
    lv_anim_init(&welcome_scroll_anim);
    lv_anim_set_var(&welcome_scroll_anim, scrolling_welcome_label);
    lv_anim_set_exec_cb(&welcome_scroll_anim, welcome_scroll_anim_cb);
    lv_anim_set_time(&welcome_scroll_anim, 8000);  // 8 seconds for full traverse
    lv_anim_set_repeat_count(&welcome_scroll_anim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_path_cb(&welcome_scroll_anim, lv_anim_path_linear);
    lv_anim_set_ready_cb(&welcome_scroll_anim, welcome_scroll_ready_cb);

    // Start from right edge, move to left edge
    lv_anim_set_values(&welcome_scroll_anim, 640, -600);  // Start at 640px, end at -600px

    lv_anim_start(&welcome_scroll_anim);
}

static void create_center_rectangle_pattern(lv_obj_t *screen)
{
    // Create a scrolling text label
    scrolling_welcome_label = lv_label_create(screen);
    lv_label_set_text(scrolling_welcome_label, "Welcome to MentraOS NExFirmware!");

    // Set text properties
    lv_obj_set_style_text_color(scrolling_welcome_label, lv_color_white(), 0);  // White text
    lv_obj_set_style_text_font(scrolling_welcome_label, &lv_font_montserrat_48,
                               0);  // **UPGRADED: Largest font (48pt)**

    // **NEW: Use normal mode, no built-in scrolling**
    lv_label_set_long_mode(scrolling_welcome_label, LV_LABEL_LONG_CLIP);

    // Set fixed width to contain the text
    lv_obj_set_width(scrolling_welcome_label, 600);  // Wide enough to contain full text

    // Center vertically, but position will be animated horizontally
    lv_obj_set_y(scrolling_welcome_label, (480 - lv_obj_get_height(scrolling_welcome_label)) / 2);

    // Optional: Add background for better visibility
    lv_obj_set_style_bg_color(scrolling_welcome_label, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(scrolling_welcome_label, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(scrolling_welcome_label, 15, 0);  // Add padding
    lv_obj_set_style_radius(scrolling_welcome_label, 5, 0);    // Rounded corners

    // **NEW: Start infinite smooth horizontal scrolling animation**
    lv_anim_init(&welcome_scroll_anim);
    lv_anim_set_var(&welcome_scroll_anim, scrolling_welcome_label);
    lv_anim_set_exec_cb(&welcome_scroll_anim, welcome_scroll_anim_cb);
    lv_anim_set_time(&welcome_scroll_anim, 8000);  // 8 seconds for full traverse
    lv_anim_set_repeat_count(&welcome_scroll_anim, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_path_cb(&welcome_scroll_anim, lv_anim_path_linear);
    lv_anim_set_ready_cb(&welcome_scroll_anim, welcome_scroll_ready_cb);

    // Start from right edge of screen, move to left edge
    lv_anim_set_values(&welcome_scroll_anim, 640, -600);  // Start at 640px (right edge), end at -600px (left edge)

    lv_anim_start(&welcome_scroll_anim);

    BSP_LOGI(TAG, "🔄 Started infinite smooth horizontal scrolling animation for welcome text");
}

static void anim_set_x_cb(void *obj, int32_t v) 
{ 
    lv_obj_set_x((lv_obj_t *)obj, v); 
}

static void create_center_rectangle_pattern_ssd1306(lv_obj_t *screen)
{
    const char *text = "Welcome to MentraOS NExFirmware!";
    const lv_font_t *font = &lv_font_montserrat_12;   
    const uint32_t ms_per_px = 25;   
    const lv_coord_t sw = lv_obj_get_width(screen);
    const lv_coord_t sh = lv_obj_get_height(screen);

    lv_obj_set_style_bg_color(screen, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);


    lv_obj_t *label = lv_label_create(screen);
    lv_obj_set_style_text_color(label, lv_color_black(), 0);
    lv_obj_set_style_text_font(label, font, 0);
    lv_label_set_text(label, text);

    lv_label_set_long_mode(label, LV_LABEL_LONG_CLIP);

    lv_obj_update_layout(label);
    lv_coord_t label_w = lv_obj_get_width(label);
    lv_coord_t label_h = lv_obj_get_height(label);

    lv_obj_set_y(label, (sh - label_h) / 2);

    const lv_coord_t x_start = sw;      
    const lv_coord_t x_end   = -label_w;   

    uint32_t total_px = (uint32_t)(x_start - x_end);  
    uint32_t anim_time_ms = total_px * ms_per_px;

    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, label);
    lv_anim_set_exec_cb(&a, anim_set_x_cb);
    lv_anim_set_values(&a, x_start, x_end);
    lv_anim_set_time(&a, anim_time_ms);
    lv_anim_set_path_cb(&a, lv_anim_path_linear);
    lv_anim_set_repeat_delay(&a, 250);         
    lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
    lv_anim_start(&a);
}



static void create_scrolling_text_container(lv_obj_t *screen)
{
    // **NEW: Get modular display configuration**
    const display_config_t *config = display_get_config();
    
    // **NEW: Create scrollable container using modular dimensions**
    lv_obj_t *container = lv_obj_create(screen);
    display_apply_container_config(container, screen, config);

    // **NEW: Store global reference for protobuf text updates**
    protobuf_container = container;

    // Configure container scrolling - NO SCROLLBARS, minimal borders
    lv_obj_set_scroll_dir(container, LV_DIR_VER);                 // Vertical scrolling only
    lv_obj_set_scrollbar_mode(container, LV_SCROLLBAR_MODE_OFF);  // NO SCROLLBARS

    // Style the container using configuration values
    lv_obj_set_style_bg_color(container, lv_color_white(), 0);
    lv_obj_set_style_bg_opa(container, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(container, lv_color_black(), 0);
    lv_obj_set_style_border_opa(container, LV_OPA_COVER, 0);

    // Create label inside container with protobuf text
    lv_obj_t *label = lv_label_create(container);
    lv_obj_set_width(label, config->layout.usable_width - (config->layout.padding * 2));
    lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);  // Wrap text to fit width

    // **NEW: Store global reference for protobuf text updates**
    protobuf_label = label;

    // **NEW: Set adaptive initial text based on display size**
    const char *initial_text;
    if (config->width >= 500) {
        // Large display - detailed welcome message
        initial_text = 
            "MentraOS AR Display System Ready\n"
            "Waiting for protobuf text messages from mobile app...\n"
            "This container will automatically update with incoming content.\n"
            "English/Chinese multilingual support enabled.\n"
            "系统已完全初始化，准备接收消息！\n"
            "Hello 你好 World 世界";
    } else {
        // Small display - compact welcome message
        initial_text =
            "MentraOS AR Ready\n"
            "Waiting for messages...\n" 
            "EN/CN Support Ready\n"
            "系统已初始化!\n"
            "Hello 你好 World 世界";
    }

    lv_label_set_text(label, initial_text);

    // **NEW: Style the label using modular font configuration**
    lv_obj_set_style_text_color(label, lv_color_black(), 0);
    lv_obj_set_style_text_font(label, display_get_font("cjk"), 0);  // CJK font for Chinese support
    lv_obj_set_style_text_line_space(label, config->fonts.line_spacing, 0);

    // Position label at top of container
    lv_obj_align(label, LV_ALIGN_TOP_LEFT, 0, 0);

    // AUTO-SCROLL TO BOTTOM to show latest content
    lv_obj_update_layout(container);  // Ensure layout is calculated
    BSP_LOGI(TAG, "📝 Created adaptive scrolling container: %dx%d with %s font", 
             config->layout.usable_width, config->layout.usable_height, config->name);
}

// **NEW: Pattern 5 - XY Text Positioning Area with modular configuration**
static void create_xy_text_positioning_area(lv_obj_t *screen)
{
    // **NEW: Get modular display configuration**
    const display_config_t *config = display_get_config();
    
    // **NEW: Create XY positioning container using modular dimensions**
    lv_obj_t *container = lv_obj_create(screen);
    display_apply_container_config(container, screen, config);

    // **NEW: Store global reference for XY text positioning**
    xy_text_container = container;

    // Configure container as static positioning area - NO SCROLLING
    lv_obj_set_scroll_dir(container, LV_DIR_NONE);                // No scrolling
    lv_obj_set_scrollbar_mode(container, LV_SCROLLBAR_MODE_OFF);  // No scrollbars

    // Style the container with visible border for positioning reference
    lv_obj_set_style_bg_color(container, lv_color_white(), 0);  // White background
    lv_obj_set_style_bg_opa(container, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(container, lv_color_black(), 0);  // Black border
    lv_obj_set_style_border_opa(container, LV_OPA_COVER, 0);        // Visible border
    lv_obj_set_style_radius(container, config->layout.border_width, 0);  // Adaptive radius

    // **EMPTY CONTAINER**: No default text - ready for XY positioned messages

    BSP_LOGI(TAG, "📍 Pattern 5: XY Text Positioning Area created (%dx%d) for %s", 
             config->layout.usable_width, config->layout.usable_height, config->name);
}

static int       current_pattern = 4;  // **NEW: Default to auto-scroll container (pattern 4)**
static const int num_patterns    = 6;  // Increased from 5 to 6 (added Pattern 5: XY Text Positioning)

// **NEW: Get current pattern ID for conditional logic**
int display_get_current_pattern(void)
{
    return current_pattern;
}

static void show_test_pattern(int pattern_id)
{
    // **SAFE: Now called only from LVGL thread - no locking needed**

    // Clear all existing objects first - safe in LVGL thread context
    lv_obj_clean(lv_screen_active());

    // Get screen and set black background
    lv_obj_t *screen = lv_screen_active();
    lv_obj_set_style_bg_color(screen, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);

    switch (pattern_id)
    {
        case 0:
            create_chess_pattern(screen);
            break;
        case 1:
            create_horizontal_zebra_pattern(screen);
            break;
        case 2:
            create_vertical_zebra_pattern(screen);
            break;
        case 3:
            // create_center_rectangle_pattern(screen);
            create_center_rectangle_pattern_ssd1306(screen);
            break;
        case 4:
            create_scrolling_text_container(screen);
            break;
        case 5:
            create_xy_text_positioning_area(screen);
            break;
        default:
            BSP_LOGE(TAG, "❌ Unknown pattern ID: %d", pattern_id);
            return;
    }

    // Force LVGL to render everything immediately
    // lv_timer_handler();

    // **SAFE: No unlock needed - running in LVGL thread context**

    // Add delay to ensure display processes the data

    // Small delay for display processing
    // k_msleep(100);
}
void cycle_test_pattern(void)
{
    // **SAFETY: Prevent rapid cycling that could cause conflicts**
    static int64_t last_cycle_time = 0;
    int64_t        current_time    = k_uptime_get();

    if (current_time - last_cycle_time < 1000)
    {  // 1 second debounce
        return;
    }
    last_cycle_time = current_time;

    current_pattern = (current_pattern + 1) % num_patterns;
    BSP_LOGI(TAG, "Pattern #%d", current_pattern);  // Minimal log
    show_test_pattern(current_pattern);
}

// **NEW: Update protobuf text content in the auto-scroll container**
static void update_protobuf_text_content(const char *text_content)
{
    // **SAFETY: This function must only be called from LVGL thread context**

    if (!text_content)
    {
        BSP_LOGE(TAG, "Invalid text content pointer");
        return;
    }

    // Verify we have valid global references
    if (!protobuf_container || !protobuf_label)
    {
        BSP_LOGE(TAG, "Protobuf container not initialized");
        return;
    }

    // **CLEAR AND UPDATE: Replace existing text with new protobuf content**
    lv_label_set_text(protobuf_label, text_content);

    // **AUTO-SCROLL TO BOTTOM: Show latest content**
    lv_obj_update_layout(protobuf_container);  // Ensure layout is calculated
    lv_obj_scroll_to_y(protobuf_container, lv_obj_get_scroll_bottom(protobuf_container), LV_ANIM_OFF);

    BSP_LOGI(TAG, "📱 Protobuf text updated: %.50s%s", text_content, strlen(text_content) > 50 ? "..." : "");
}

// **NEW: Pattern 5 - Handle XY positioned text with font size control**
static void update_xy_positioned_text(uint16_t x, uint16_t y, const char *text_content, uint16_t font_size,
                                      uint32_t color)
{
    // **SAFETY: This function must only be called from LVGL thread context**

    if (!text_content)
    {
        BSP_LOGE(TAG, "Invalid XY text content pointer");
        return;
    }

    // Verify we have valid XY container reference
    if (!xy_text_container)
    {
        BSP_LOGE(TAG, "XY text container not initialized - must be in Pattern 5");
        return;
    }

    // **CLEAR ALL PREVIOUS TEXT CONTENT** before adding new text
    lv_obj_clean(xy_text_container);  // Remove all children from container
    current_xy_text_label = NULL;     // Reset reference since container is now empty

    // Validate coordinates within container bounds (580x420 usable area with 10px padding)
    const uint16_t max_x = 580;  // 600 - (2 * 10px padding)
    const uint16_t max_y = 420;  // 440 - (2 * 10px padding)

    BSP_LOGI(TAG, "📍 Original XY: (%u,%u), max bounds: (%u,%u)", x, y, max_x, max_y);

    if (x >= max_x || y >= max_y)
    {
        BSP_LOGW(TAG, "XY coordinates out of bounds: (%u,%u) - max is (%u,%u)", x, y, max_x, max_y);
        // Clamp to valid range
        x = (x >= max_x) ? max_x - 50 : x;  // Leave some space for text
        y = (y >= max_y) ? max_y - 30 : y;
        BSP_LOGW(TAG, "📍 Clamped to: (%u,%u)", x, y);
    }

    // Map font size to available fonts, default to 12pt if invalid
    const lv_font_t *font = display_manager_map_font(font_size);
    if (!font)
    {
        BSP_LOGW(TAG, "Invalid font size %u, using default 12pt", font_size);
        font = display_manager_map_font(12);  // Fallback to 12pt
    }

    // Create new positioned text label
    current_xy_text_label = lv_label_create(xy_text_container);
    lv_label_set_text(current_xy_text_label, text_content);

    // Apply font and styling - **SAME AS PATTERN 4: Use white text**
    lv_obj_set_style_text_font(current_xy_text_label, font, 0);
    lv_obj_set_style_text_color(current_xy_text_label, lv_color_black(), 0);  // White text like Pattern 4
    lv_obj_set_style_bg_opa(current_xy_text_label, LV_OPA_TRANSP, 0);         // Transparent background

    // Set text wrapping and width constraints
    lv_label_set_long_mode(current_xy_text_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(current_xy_text_label, max_x - x);  // Wrap within remaining width

    // Position the text at specified coordinates (relative to container padding)
    lv_obj_set_pos(current_xy_text_label, x, y);

    BSP_LOGI(TAG, "� Cleared all previous text, positioned new at (%u,%u), font:%upt, color:0x%06X: %.30s%s", x, y,
             font_size, color, text_content, strlen(text_content) > 30 ? "..." : "");
}

void lvgl_dispaly_init(void *p1, void *p2, void *p3)
{
    // 获取当前应用的字体对象
    // const lv_font_t *font = lv_obj_get_style_text_font(label, 0);
    // uint32_t unicode = 'A';
    // lv_font_glyph_dsc_t glyph_dsc;
    // if (lv_font_get_glyph_dsc(font, &glyph_dsc, unicode, 0))
    // {
    //     BSP_LOGI(TAG, "字符 'A' 宽度 = %d px", glyph_dsc.adv_w);
    // }
    // mos_delay_ms(1000);
    // BSP_LOGI(TAG, "Font pointer: %p", font);
    // BSP_LOGI(TAG, "字体高度：%d px", font->line_height);
    // BSP_LOGI(TAG, "基线位置：%d px", font->base_line);
    const struct device *display_dev;
    display_dev = DEVICE_DT_GET(DT_CHOSEN(zephyr_display));
    if (!device_is_ready(display_dev))
    {
        BSP_LOGI(TAG, "display_dev Device not ready, aborting test");
        return;
    }
    
    // **NEW: Initialize modular display configuration system**
    int config_result = display_config_init();
    if (config_result != 0) {
        BSP_LOGE(TAG, "Failed to initialize display configuration: %d", config_result);
        return;
    }
    
    const display_config_t *config = display_get_config();
    BSP_LOGI(TAG, "🖼️ Display configuration loaded: %s (%dx%d)", 
             config->name, config->width, config->height);
    // if (hls12vga_init_sem_take() != 0)  // 等待屏幕spi初始化完成
    // {
    //     BSP_LOGE(TAG, "Failed to hls12vga_init_sem_take err");
    //     return;
    // }
    // 初始化 FPS 统计定时器：每 1000ms 输出一次
    mos_timer_create(&fps_timer, fps_timer_cb);
    mos_timer_start(&fps_timer, true, 1000);
    static uint32_t last_refresh_ms;
    display_state_t state_type = LCD_STATE_INIT;
    display_cmd_t   cmd;
    display_open();  // test
    while (1)
    {
        // frame_count++;
        bool need_refresh = false;
        // 到预算了，允许本轮刷一次； When budgeted, allow one refresh this round
        if (state_type == LCD_STATE_ON && ((k_uptime_get_32() - last_refresh_ms) >= 10))
        {
            need_refresh = true;
        }

        // 处理消息（仍给其它任务时间）； handle message (still give other tasks time)
        int err = mos_msgq_receive(&lvgl_display_msgq, &cmd, LVGL_TICK_MS);
        if (err == 0)
        {
            switch (cmd.type)
            {
                case LCD_CMD_INIT:
                    // state_type = LCD_STATE_OFF;
                    break;
                case LCD_CMD_OPEN:
                    BSP_LOGI(TAG, "LCD_CMD_OPEN");
                    // hls12vga_power_on();
                    // set_display_onoff(true);
                    // hls12vga_set_brightness(9);  // 设置亮度
                    // hls12vga_set_mirror(0x08);   // 0x10 垂直镜像 0x00 正常显示 0x08 水平镜像 0x18 水平+垂直镜像
                    // // hls12vga_set_brightness(cmd.p.open.brightness);
                    // // hls12vga_set_mirror(cmd.p.open.mirror);
                    // mos_delay_ms(2);
                    // hls12vga_open_display();  // 开启显示
                    // // hls12vga_set_shift(MOVE_DEFAULT, 0);
                    // hls12vga_clear_screen(false);  // 清屏
                    state_type = LCD_STATE_ON;

                    BSP_LOGI(TAG, "🚀 About to call show_default_ui()...");
                    show_default_ui();  // 显示默认图像
                    BSP_LOGI(TAG, "✅ show_default_ui() completed");
                    break;
                case LCD_CMD_DATA:
                    /* 处理帧数据*/
                    break;
                case LCD_CMD_CYCLE_PATTERN:
                    /* **NEW: Handle pattern cycling safely in LVGL thread** */
                    BSP_LOGI(TAG, "LCD_CMD_CYCLE_PATTERN - Thread-safe pattern cycling");
                    cycle_test_pattern();  // Now called from LVGL thread context
                    break;
                case LCD_CMD_UPDATE_PROTOBUF_TEXT:
                    /* **NEW: Handle protobuf text updates safely in LVGL thread** */
                    update_protobuf_text_content(cmd.p.protobuf_text.text);
                    break;
                case LCD_CMD_UPDATE_XY_TEXT:
                    /* **NEW: Handle XY positioned text updates for Pattern 5** */
                    BSP_LOGI(TAG, "LCD_CMD_UPDATE_XY_TEXT - XY positioned text at (%u,%u)", cmd.p.xy_text.x,
                             cmd.p.xy_text.y);
                    update_xy_positioned_text(cmd.p.xy_text.x, cmd.p.xy_text.y, cmd.p.xy_text.text,
                                              cmd.p.xy_text.font_size, cmd.p.xy_text.color);
                    break;
                case LCD_CMD_CLOSE:
                    if (get_display_onoff())
                    {
                        // hls12vga_clear_screen(false); // 清屏
                        // lv_timer_handler();
                        // scroll_text_stop();
                        // set_display_onoff(false);
                        // hls12vga_power_off();
                    }
                    state_type = LCD_STATE_OFF;
                    break;
                case LCD_CMD_TEXT:
                {
                    // lv_obj_t *scr = lv_disp_get_scr_act(lv_disp_get_default());
                    lv_obj_t *lbl = lv_label_create(lv_screen_active());
                    lv_label_set_text(lbl, cmd.p.text.text);
                    // lv_label_set_text(lbl, "Hello, world lvgl!"); //test
                    lv_obj_set_style_text_color(lbl, lv_color_white(), LV_PART_MAIN);
                    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_30, LV_PART_MAIN);
                    lv_obj_set_pos(lbl, cmd.p.text.x, cmd.p.text.y);
                }
                break;
                case LCD_CMD_GRAYSCALE_HORIZONTAL:
                    /* **NEW: Handle direct HLS12VGA horizontal grayscale pattern** */
                    // BSP_LOGI(TAG, "LCD_CMD_GRAYSCALE_HORIZONTAL - Drawing true 8-bit horizontal grayscale");
                    // if (hls12vga_draw_horizontal_grayscale_pattern() != 0)
                    // {
                    //     BSP_LOGE(TAG, "Failed to draw horizontal grayscale pattern");
                    // }
                    // break;
                case LCD_CMD_GRAYSCALE_VERTICAL:
                    /* **NEW: Handle direct HLS12VGA vertical grayscale pattern** */
                    // BSP_LOGI(TAG, "LCD_CMD_GRAYSCALE_VERTICAL - Drawing true 8-bit vertical grayscale");
                    // if (hls12vga_draw_vertical_grayscale_pattern() != 0)
                    // {
                    //     BSP_LOGE(TAG, "Failed to draw vertical grayscale pattern");
                    // }
                    // break;
                case LCD_CMD_CHESS_PATTERN:
                    /* **NEW: Handle direct HLS12VGA chess pattern** */
                    // BSP_LOGI(TAG, "LCD_CMD_CHESS_PATTERN - Drawing chess board pattern");
                    // if (hls12vga_draw_chess_pattern() != 0)
                    // {
                    //     BSP_LOGE(TAG, "Failed to draw chess pattern");
                    // }
                    // break;
                default:
                    break;
            }
            if (state_type == LCD_STATE_ON)
                need_refresh = true;
        }

        if (state_type == LCD_STATE_ON && need_refresh)
        {
            lv_timer_handler();  // 每轮只刷一次； only refresh once per round
            last_refresh_ms = k_uptime_get_32();
        }
    }
}

void lvgl_display_thread(void)
{
    // 启动 LVGL 专用线程
    lvgl_thread_handle = k_thread_create(&lvgl_thread_data,
                                         lvgl_stack_area,
                                         K_THREAD_STACK_SIZEOF(lvgl_stack_area),
                                         lvgl_dispaly_init,
                                         NULL,
                                         NULL,
                                         NULL,
                                         LVGL_THREAD_PRIORITY,
                                         0,
                                         K_NO_WAIT);
    k_thread_name_set(lvgl_thread_handle, TASK_LVGL_NAME);
}