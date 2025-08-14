/*
 * @Author       : Cole
 * @Date         : 2025-07-31 10:40:40
 * @LastEditTime : 2025-08-01 11:29:06
 * @FilePath     : mos_lvgl_display.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/display.h>
#include <math.h>
#include <zephyr/kernel.h>
#include "lvgl_display.h"
// #include <lvgl.h>
// #include <hls12vga.h>
#include <display/lcd/hls12vga.h>
#include "bal_os.h"
#include "bsp_log.h"
#include "mos_lvgl_display.h"
// #include "bspal_icm42688p.h"
// #include "task_ble_receive.h"

#define TAG "MOS_LVGL"
#define TASK_LVGL_NAME "MOS_LVGL"

#define LVGL_THREAD_STACK_SIZE (4096 * 2)
#define LVGL_THREAD_PRIORITY 5
K_THREAD_STACK_DEFINE(lvgl_stack_area, LVGL_THREAD_STACK_SIZE);
static struct k_thread lvgl_thread_data;
k_tid_t lvgl_thread_handle;

static K_SEM_DEFINE(lvgl_display_sem, 0, 1);

#define DISPLAY_CMD_QSZ 16
K_MSGQ_DEFINE(display_msgq, sizeof(display_cmd_t), DISPLAY_CMD_QSZ, 4);

#define LVGL_TICK_MS 5
static struct k_timer fps_timer;
static uint32_t frame_count = 0;

static volatile bool display_onoff = false;

// **NEW: Global references for protobuf text container**
static lv_obj_t *protobuf_container = NULL;
static lv_obj_t *protobuf_label = NULL;

static void fps_timer_cb(struct k_timer *timer_id)
{
    uint32_t fps = frame_count;
    frame_count = 0;
    BSP_LOGI(TAG, "LVGL FPS: %d", fps);
}

void lv_example_scroll_text(void)
{
    // 创建一个标签
    lv_obj_t *label = lv_label_create(lv_screen_active());

    // 设置滚动模式（自动横向滚动）
    // lv_label_set_long_mode(label, LV_LABEL_LONG_SCROLL);
    lv_label_set_long_mode(label, LV_LABEL_LONG_SCROLL_CIRCULAR);

    // 设置标签区域宽度（可视区域）
    lv_obj_set_width(label, 640); // 根据你屏幕宽度设置，单位像素

    // 设置标签位置
    lv_obj_set_pos(label, 0, 410); // x/y 位置，根据屏幕设置

    // 设置长文本（会触发滚动）
    lv_label_set_text(label, "!!!!!nRF5340 + NCS 3.0.0 + LVGL!!!!");

    lv_obj_set_style_text_color(label, lv_color_white(), 0); // 白色对应非零值
    lv_obj_set_style_text_font(label, &lv_font_montserrat_48, 0);
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
    mos_sem_take(&lvgl_display_sem, time);
}

void display_open(void)
{
    // display_cmd_t cmd = {.type = LCD_CMD_OPEN, .param = NULL};
    display_cmd_t cmd = {
        .type = LCD_CMD_OPEN,
        .p.open = {
            .brightness = 9,
            .mirror = 0x08}};
    mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
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
        .type = LCD_CMD_CYCLE_PATTERN,
        .p.pattern = {.pattern_id = 0}  // Will be determined by LVGL thread
    };
    mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

// **NEW: Thread-safe protobuf text update - sends message to LVGL thread**
void display_update_protobuf_text(const char *text_content)
{
    if (!text_content) {
        BSP_LOGE(TAG, "Invalid text content pointer");
        return;
    }
    
    display_cmd_t cmd = {
        .type = LCD_CMD_UPDATE_PROTOBUF_TEXT,
        .p = {.protobuf_text = {{0}}}  // Proper initialization with nested braces
    };
    
    // Safely copy text content with bounds checking
    size_t text_len = strlen(text_content);
    if (text_len > MAX_TEXT_LEN) {
        text_len = MAX_TEXT_LEN;
        BSP_LOGW(TAG, "Protobuf text truncated to %d chars", MAX_TEXT_LEN);
    }
    
    strncpy(cmd.p.protobuf_text.text, text_content, text_len);
    cmd.p.protobuf_text.text[text_len] = '\0';  // Ensure null termination
    
    mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

// **NEW: Direct HLS12VGA pattern functions - Thread-safe**
void display_draw_horizontal_grayscale(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_GRAYSCALE_HORIZONTAL};
    mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

void display_draw_vertical_grayscale(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_GRAYSCALE_VERTICAL};
    mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

void display_draw_chess_pattern(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_CHESS_PATTERN};
    mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}

void display_send_frame(void *data_ptr)
{
    // display_cmd_t cmd = {.type = LCD_CMD_DATA, .param = data_ptr};
    // mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_FOREVER);
}
void lvgl_dispaly_text(void)
{
    lv_obj_t *hello_world_label = lv_label_create(lv_screen_active());
    lv_label_set_text(hello_world_label, "Hello LVGL World");
    lv_obj_align(hello_world_label, LV_ALIGN_CENTER, 0, 0); // 居中对齐
    // lv_obj_align(hello_world_label, LV_TEXT_ALIGN_RIGHT, 0, 0); // 右对齐
    // lv_obj_align(hello_world_label, LV_TEXT_ALIGN_LEFT, 0, 0);  // 左对齐
    // lv_obj_align(hello_world_label, LV_ALIGN_BOTTOM_MID, 0, 0); // 底部居中对齐
    lv_obj_set_style_text_color(hello_world_label, lv_color_white(), 0); // 白色对应非零值
    lv_obj_set_style_text_font(hello_world_label, &lv_font_montserrat_48, 0);
    lv_obj_set_style_bg_color(lv_screen_active(), lv_color_black(), 0);
}
static lv_obj_t *counter_label;
static lv_timer_t *counter_timer; // 指针即可
static lv_obj_t *acc_label;
static lv_obj_t *gyr_label;
static void counter_timer_cb(lv_timer_t *timer)
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
    lv_obj_set_style_text_color(acc_label, lv_color_white(), 0); // 白色对应非零值
    lv_obj_set_style_text_font(acc_label, &lv_font_montserrat_30, 0);
    lv_obj_set_style_text_color(gyr_label, lv_color_white(), 0); // 白色对应非零值
    lv_obj_set_style_text_font(gyr_label, &lv_font_montserrat_30, 0);
    lv_obj_set_style_bg_color(lv_screen_active(), lv_color_black(), 0);
    // 创建一个 100ms 周期的定时器，把 count 指针经 user_data 传给它
    static int count = 0;
    counter_timer = lv_timer_create(counter_timer_cb, 300, &count);
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
void scroll_text_create(lv_obj_t *parent,
                        lv_coord_t x, lv_coord_t y,
                        lv_coord_t w, lv_coord_t h,
                        const char *txt,
                        const lv_font_t *font,
                        uint32_t time_ms)
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
//     if (mos_msgq_send(&display_msgq, &cmd, MOS_OS_WAIT_ON) != 0)
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
    show_test_pattern(3);
    
    BSP_LOGI(TAG, "🖼️ Scrolling welcome message complete - should see animated text");
}

// Test pattern functions
static void create_chess_pattern(lv_obj_t *screen)
{
    const int chess_size = 40;  // 40x40 pixel squares
    const int chess_cols = 640 / chess_size;  // 16 columns
    const int chess_rows = 480 / chess_size;  // 12 rows
    
    for (int row = 0; row < chess_rows; row++) {
        for (int col = 0; col < chess_cols; col++) {
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
    const int stripe_height = 20;  // 20 pixel high stripes
    const int num_stripes = 480 / stripe_height;  // 24 stripes
    
    for (int i = 0; i < num_stripes; i++) {
        bool is_white = i % 2 == 0;
        
        lv_obj_t *stripe = lv_obj_create(screen);
        lv_obj_set_size(stripe, 640, stripe_height);  // Full width
        lv_obj_set_pos(stripe, 0, i * stripe_height);
        lv_obj_set_style_bg_color(stripe, is_white ? lv_color_white() : lv_color_black(), 0);
        lv_obj_set_style_bg_opa(stripe, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(stripe, 0, 0);
        lv_obj_set_style_pad_all(stripe, 0, 0);
    }
}

static void create_vertical_zebra_pattern(lv_obj_t *screen)
{
    const int stripe_width = 20;  // 20 pixel wide stripes
    const int num_stripes = 640 / stripe_width;  // 32 stripes
    
    for (int i = 0; i < num_stripes; i++) {
        bool is_white = i % 2 == 0;
        
        lv_obj_t *stripe = lv_obj_create(screen);
        lv_obj_set_size(stripe, stripe_width, 480);  // Full height
        lv_obj_set_pos(stripe, i * stripe_width, 0);
        lv_obj_set_style_bg_color(stripe, is_white ? lv_color_white() : lv_color_black(), 0);
        lv_obj_set_style_bg_opa(stripe, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(stripe, 0, 0);
        lv_obj_set_style_pad_all(stripe, 0, 0);
    }
}

static void create_center_rectangle_pattern(lv_obj_t *screen)
{
    // Create a scrolling text label
    lv_obj_t *scroll_label = lv_label_create(screen);
    lv_label_set_text(scroll_label, "Welcome to MentraOS NExFirmware!");
    
    // Set text properties
    lv_obj_set_style_text_color(scroll_label, lv_color_white(), 0);  // White text
    lv_obj_set_style_text_font(scroll_label, &lv_font_montserrat_48, 0);  // **UPGRADED: Largest font (48pt)**
    
    // Enable long mode for scrolling
    lv_label_set_long_mode(scroll_label, LV_LABEL_LONG_SCROLL_CIRCULAR);
    
    // Set the width to enable scrolling (narrower than text width)
    lv_obj_set_width(scroll_label, 400);  // 400px width for scrolling
    
    // **SPEED UP THE SCROLLING** - Set faster animation time
    lv_obj_set_style_anim_time(scroll_label, 1500, 0);  // 1.5 seconds for full scroll cycle (much faster!)
    
    // Center the label on screen
    lv_obj_center(scroll_label);
    
    // Optional: Add background for better visibility
    lv_obj_set_style_bg_color(scroll_label, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(scroll_label, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(scroll_label, 15, 0);  // Add padding
    lv_obj_set_style_radius(scroll_label, 5, 0);    // Rounded corners
}

static void create_scrolling_text_container(lv_obj_t *screen)
{
    // Create scrollable container with 20px margins on all sides
    // Screen size: 640x480, so container: 600x440 positioned at (20, 20)
    lv_obj_t *container = lv_obj_create(screen);
    lv_obj_set_size(container, 600, 440);  // 640-40 = 600, 480-40 = 440
    lv_obj_set_pos(container, 20, 20);     // 20px margins from all edges
    
    // **NEW: Store global reference for protobuf text updates**
    protobuf_container = container;
    
    // Configure container scrolling - NO SCROLLBARS, NO BORDERS
    lv_obj_set_scroll_dir(container, LV_DIR_VER);  // Vertical scrolling only
    lv_obj_set_scrollbar_mode(container, LV_SCROLLBAR_MODE_OFF);  // NO SCROLLBARS
    
    // Style the container - NO BORDERS, minimal styling for performance
    lv_obj_set_style_bg_color(container, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(container, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(container, 0, 0);  // NO BORDERS
    lv_obj_set_style_pad_all(container, 5, 0);  // Reduced padding for performance
    
    // Create label inside container with protobuf text
    lv_obj_t *label = lv_label_create(container);
    lv_obj_set_width(label, 590);  // Container width minus minimal padding (600-10=590)
    lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);  // Wrap text to fit width
    
    // **NEW: Store global reference for protobuf text updates**
    protobuf_label = label;
    
    // **NEW: Set initial placeholder text - will be replaced by protobuf messages**
    const char *initial_text = 
        "MentraOS AR Display Ready\n\n"
        "Waiting for protobuf text messages...\n\n"
        "This container will automatically update with incoming text content from the mobile app.\n\n"
        "✅ System initialized and ready for messages!";
    
    lv_label_set_text(label, initial_text);
    
    // Style the label text - optimized settings
    lv_obj_set_style_text_color(label, lv_color_white(), 0);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_30, 0);
    lv_obj_set_style_text_line_space(label, 3, 0);  // Reduced line spacing for performance
    
    // Position label at top of container
    lv_obj_align(label, LV_ALIGN_TOP_LEFT, 0, 0);
    
    // AUTO-SCROLL TO BOTTOM to show latest content
    lv_obj_update_layout(container);  // Ensure layout is calculated
    lv_obj_scroll_to_y(container, lv_obj_get_scroll_bottom(container), LV_ANIM_OFF);
}

static int current_pattern = 4;  // **NEW: Default to auto-scroll container (pattern 4)**
static const int num_patterns = 5;  // Increased from 4 to 5

static void show_test_pattern(int pattern_id)
{
    // **SAFE: Now called only from LVGL thread - no locking needed**
    
    // Clear all existing objects first - safe in LVGL thread context
    lv_obj_clean(lv_screen_active());
    
    // Get screen and set black background
    lv_obj_t *screen = lv_screen_active();
    lv_obj_set_style_bg_color(screen, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);
    
    switch (pattern_id) {
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
            create_center_rectangle_pattern(screen);
            break;
        case 4:
            create_scrolling_text_container(screen);
            break;
        default:
            BSP_LOGE(TAG, "❌ Unknown pattern ID: %d", pattern_id);
            return;
    }
    
    // Force LVGL to render everything immediately
    lv_timer_handler();
    
    // **SAFE: No unlock needed - running in LVGL thread context**
    
    // Add delay to ensure display processes the data
    
    // Small delay for display processing
    k_msleep(100);
}void cycle_test_pattern(void)
{
    // **SAFETY: Prevent rapid cycling that could cause conflicts**
    static int64_t last_cycle_time = 0;
    int64_t current_time = k_uptime_get();
    
    if (current_time - last_cycle_time < 1000) {  // 1 second debounce
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
    
    if (!text_content) {
        BSP_LOGE(TAG, "Invalid text content pointer");
        return;
    }
    
    // Verify we have valid global references
    if (!protobuf_container || !protobuf_label) {
        BSP_LOGE(TAG, "Protobuf container not initialized");
        return;
    }
    
    // **CLEAR AND UPDATE: Replace existing text with new protobuf content**
    lv_label_set_text(protobuf_label, text_content);
    
    // **AUTO-SCROLL TO BOTTOM: Show latest content**
    lv_obj_update_layout(protobuf_container);  // Ensure layout is calculated
    lv_obj_scroll_to_y(protobuf_container, lv_obj_get_scroll_bottom(protobuf_container), LV_ANIM_OFF);
    
    BSP_LOGI(TAG, "📱 Protobuf text updated: %.50s%s", 
             text_content, strlen(text_content) > 50 ? "..." : "");
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
    if (hls12vga_init_sem_take() != 0) // 等待屏幕spi初始化完成
    {
        BSP_LOGE(TAG, "Failed to hls12vga_init_sem_take err");
        return;
    }
    // 初始化 FPS 统计定时器：每 1000ms 输出一次
    mos_timer_create(&fps_timer, fps_timer_cb);
    mos_timer_start(&fps_timer, true, 1000);

    display_state_t state_type = LCD_STATE_INIT;
    display_cmd_t cmd;
    display_open(); // test
    while (1)
    {
        frame_count++;
        /* 1) 刷新 LVGL，保证动画、定时器、输入都在走 */
        if (state_type == LCD_STATE_ON)
        {
            lv_timer_handler();
        }
        /* 2) 尝试读命令——最多等 LVGL_TICK_MS */
        int err = mos_msgq_receive(&display_msgq, &cmd, LVGL_TICK_MS);
        if (err != 0)
        {
            /* 超时或队列空，没有新命令，直接下一次循环 */
            continue;
        }
        /* 3) 有命令就处理 */
        switch (cmd.type)
        {
        case LCD_CMD_INIT:
            // state_type = LCD_STATE_OFF;
            break;
        case LCD_CMD_OPEN:
            BSP_LOGI(TAG, "LCD_CMD_OPEN - Enhanced initialization sequence");
            
            // **ENHANCED: Step 1 - Power-on with extended delays**
            hls12vga_power_on();
            k_msleep(100);  // Extended post-power delay for stability
            
            // **ENHANCED: Step 2 - Enable display first**  
            hls12vga_open_display(); // 开启显示
            k_msleep(50);   // Allow display to stabilize before configuration
            
            // **ENHANCED: Step 3 - Configure settings with error checking**
            set_display_onoff(true);
            
            // Set brightness with error checking
            BSP_LOGI(TAG, "🔆 Setting brightness to level 9...");
            // Note: hls12vga_set_brightness doesn't return error code currently
            hls12vga_set_brightness(9); 
            k_msleep(10);  // Brief delay between settings
            
            // **ROBUST MIRROR SETTING: Retry logic for reliability**
            BSP_LOGI(TAG, "🪞 Setting horizontal mirror (0x08) with retry logic...");
            int mirror_attempts = 0;
            int max_mirror_retries = 3;
            bool mirror_success = false;
            
            for (mirror_attempts = 0; mirror_attempts < max_mirror_retries; mirror_attempts++) {
                // hls12vga_set_mirror returns error code 
                int mirror_err = hls12vga_set_mirror(0x08);  // 0x08 = Horizontal mirror
                
                if (mirror_err == 0) {
                    BSP_LOGI(TAG, "✅ Mirror setting successful (attempt %d)", mirror_attempts + 1);
                    mirror_success = true;
                    k_msleep(20);  // Allow setting to take effect
                    break;
                } else {
                    BSP_LOGW(TAG, "⚠️ Mirror setting failed (attempt %d/%d): err=%d", 
                             mirror_attempts + 1, max_mirror_retries, mirror_err);
                    k_msleep(50);  // Wait before retry
                }
            }
            
            if (!mirror_success) {
                BSP_LOGE(TAG, "❌ CRITICAL: Mirror setting failed after %d attempts!", max_mirror_retries);
                BSP_LOGE(TAG, "❌ Display may appear incorrectly oriented");
            }
            
            // **ENHANCED: Step 4 - Final initialization**
            hls12vga_clear_screen(false); // 清屏
            state_type = LCD_STATE_ON;

            BSP_LOGI(TAG, "🚀 About to call show_default_ui()...");
            show_default_ui(); // 显示默认图像
            BSP_LOGI(TAG, "✅ Enhanced display initialization completed");
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
        case LCD_CMD_CLOSE:
            if (get_display_onoff())
            {
                // hls12vga_clear_screen(false); // 清屏
                // lv_timer_handler();
                scroll_text_stop();
                set_display_onoff(false);
                hls12vga_power_off();
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
            BSP_LOGI(TAG, "LCD_CMD_GRAYSCALE_HORIZONTAL - Drawing true 8-bit horizontal grayscale");
            if (hls12vga_draw_horizontal_grayscale_pattern() != 0) {
                BSP_LOGE(TAG, "Failed to draw horizontal grayscale pattern");
            }
            break;
        case LCD_CMD_GRAYSCALE_VERTICAL:
            /* **NEW: Handle direct HLS12VGA vertical grayscale pattern** */
            BSP_LOGI(TAG, "LCD_CMD_GRAYSCALE_VERTICAL - Drawing true 8-bit vertical grayscale");
            if (hls12vga_draw_vertical_grayscale_pattern() != 0) {
                BSP_LOGE(TAG, "Failed to draw vertical grayscale pattern");
            }
            break;
        case LCD_CMD_CHESS_PATTERN:
            /* **NEW: Handle direct HLS12VGA chess pattern** */
            BSP_LOGI(TAG, "LCD_CMD_CHESS_PATTERN - Drawing chess board pattern");
            if (hls12vga_draw_chess_pattern() != 0) {
                BSP_LOGE(TAG, "Failed to draw chess pattern");
            }
            break;
        default:
            break;
        }
        /* 4) 处理完命令后，立即再刷一次画面，保证命令效果能马上显现 */
        if (state_type == LCD_STATE_ON)
        {
            lv_timer_handler();
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