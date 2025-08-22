/*
 * @Author       : XK
 * @Date         : 2025-07-09 12:30:39
 * @LastEditTime : 2025-07-18 11:53:09
 * @FilePath     : xyzn_lvgl_display.c
 * @Description  : 
 * 
 * Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved. 
 */

#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/display.h>
#include <math.h>
#include <zephyr/kernel.h>
#include "lvgl_display.h"
// #include <lvgl.h>
#include "hls12vga.h"
#include "bal_os.h"
#include "bsp_log.h"
#include "xyzn_lvgl_display.h"
#include "bspal_icm42688p.h"

#define TAG "XYZN_LVGL"
#define TASK_LVGL_NAME "lvgl_task"

#define LVGL_THREAD_STACK_SIZE (4096 * 2)
#define LVGL_THREAD_PRIORITY 5
K_THREAD_STACK_DEFINE(lvgl_stack_area, LVGL_THREAD_STACK_SIZE);
static struct k_thread lvgl_thread_data;
k_tid_t lvgl_thread_handle;

static K_SEM_DEFINE(lvgl_display_sem, 0, 1);
K_MSGQ_DEFINE(display_msgq, sizeof(display_cmd_t), 8, 4);

#define LVGL_TICK_MS 5
static struct k_timer fps_timer;
static uint32_t frame_count = 0;

static volatile bool display_onoff = false;

static void fps_timer_cb(struct k_timer *timer_id)
{
    uint32_t fps = frame_count;
    frame_count = 0;
    BSP_LOGI(TAG, "当前帧率 FPS: %d", fps);
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
    xyzn_os_sem_give(&lvgl_display_sem);
}

int lvgl_display_sem_take(int64_t time)
{
    xyzn_os_sem_take(&lvgl_display_sem, time);
}

void display_open(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_OPEN, .param = NULL};
    xyzn_os_msgq_send(&display_msgq, &cmd, XYZN_OS_WAIT_FOREVER);
}

void display_close(void)
{
    display_cmd_t cmd = {.type = LCD_CMD_CLOSE, .param = NULL};
    xyzn_os_msgq_send(&display_msgq, &cmd, XYZN_OS_WAIT_FOREVER);
}

void display_send_frame(void *data_ptr)
{
    display_cmd_t cmd = {.type = LCD_CMD_DATA, .param = data_ptr};
    xyzn_os_msgq_send(&display_msgq, &cmd, XYZN_OS_WAIT_FOREVER);
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
    int *count = (int *)lv_timer_get_user_data(timer);
    // lv_label_set_text_fmt(counter_label, "Count: %d", (*count)++);
    char buf[64];
    sprintf(buf, "ACC X=%.3f m/s Y=%.3f m/s Z=%.3f m/s",
            icm42688p_data.acc_ms2[0],
            icm42688p_data.acc_ms2[1],
            icm42688p_data.acc_ms2[2]);
    lv_label_set_text(acc_label, buf);
    memset(buf, 0, sizeof(buf));
    /* 更新陀螺仪标签 */
    sprintf(buf, "GYR X=%.4f dps Y=%.4f dps Z=%.4f dps",
            icm42688p_data.gyr_dps[0],
            icm42688p_data.gyr_dps[1],
            icm42688p_data.gyr_dps[2]);
    lv_label_set_text(gyr_label, buf);
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

/****************************************************/
static void show_default_ui(void)
{
    // 强制 LVGL 下一次做整屏刷新
    // lv_disp_set_full_refresh(lv_disp_get_default(), true);
    char *txt = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque fringilla, lorem dapibus fringilla feugiat, justo arcu volutpat magna, vitae ultricies metus tortor nec est. Fusce ut tellus arcu. Fusce eu rutrum metus, nec porta felis. Sed sed ligula laoreet, sodales lacus blandit, elementum justo. Sed posuere quam ut pellentesque ullamcorper. In quis consequat magna. Etiam quis turpis nec lorem dictum finibus. Donec mattis enim dolor, consequat lacinia nisi scelerisque id. Nulla euismod, purus sit amet accumsan tempus, lorem lectus euismod dolor, sit amet facilisis nisl quam elementum nisi. Curabitur et massa eget lorem lacinia scelerisque eget vitae felis. Nulla facilisi.\n\n"
                "Vivamus auctor sit amet ante id rhoncus. Duis a dolor neque. Mauris eu ornare tortor. Vivamus consequat, ipsum a volutpat congue, sem libero laoreet nulla, malesuada efficitur leo orci a est. Donec tincidunt nulla nibh, quis pretium mi fermentum quis. Fusce a mattis libero. Curabitur in felis suscipit, ultrices diam imperdiet, vestibulum arcu. Praesent id faucibus turpis. Pellentesque sed massa tincidunt, interdum purus tempus, pellentesque risus. Fusce feugiat magna eget nisl eleifend efficitur. Mauris ut convallis justo. Integer malesuada rutrum orci non tincidunt.\n\n"
                "Nullam aliquet leo sit amet volutpat tincidunt. Mauris ac accumsan nibh. Morbi accumsan commodo leo, at hendrerit massa hendrerit et. Aliquam nec sodales ex. Morbi at aliquet sem. Sed at magna ut felis mollis dictum ut ac orci. Nunc id lorem lacus. Vivamus id accumsan dolor, sed suscipit nulla. Pellentesque dictum erat non bibendum tempor. Fusce arcu risus, eleifend in lacus a, iaculis fermentum sapien. Praesent sodales libero vitae massa suscipit tincidunt. Aliquam quis arcu urna. Nunc sit amet mi leo.\n\n";
    // 清掉旧的所有对象
    lv_obj_clean(lv_screen_active());

    ui_create();

    // lv_example_scroll_text();
    // lvgl_dispaly_text();
    /*********************************/
    scroll_text_create(lv_scr_act(),
                       0, 0,     // x, y
                       640, 240, // w, h
                       txt,
                       &lv_font_montserrat_30,
                       8000); // 往返周期 4000ms

    // LV_IMG_DECLARE(my_img);   // 由 LVGL 的 img converter 工具生成 C 数组
    // lv_obj_t *img = lv_img_create(lv_scr_act());
    // lv_img_set_src(img, &my_img);
    // lv_obj_align(img, LV_ALIGN_CENTER, 0, 0);

    /********************************************** */
    // lv_demo_benchmark(); // 测试性能
    // 立刻执行一次 LVGL 刷新
    lv_timer_handler();
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
    // xyzn_os_delay_ms(1000);
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
    xyzn_os_timer_create(&fps_timer, fps_timer_cb);
    xyzn_os_timer_start(&fps_timer, true, 1000);

    display_state_t state_type = LCD_STATE_INIT;
    display_cmd_t cmd;
    display_open(); // test
    while (1)
    {
        frame_count++;
        /* 在“ON”状态，既要处理命令，也要不停刷新 */
        if (state_type == LCD_STATE_ON)
        {
            /* 用短超时既不中断刷新，也能及时响应命令 */
            if (xyzn_os_msgq_receive(&display_msgq, &cmd, LVGL_TICK_MS) == 0)
            {
                /* 取到命令就走下面 switch */
            }
            else
            {
                /* 超时没命令 -> 刷新一次 LVGL */
                lv_timer_handler();
                continue;
            }
        }
        else
        {
            xyzn_os_msgq_receive(&display_msgq, &cmd, XYZN_OS_WAIT_FOREVER);
        }
        switch (cmd.type)
        {
        case LCD_CMD_INIT:
            // state_type = LCD_STATE_OFF;
            break;
        case LCD_CMD_OPEN:
            BSP_LOGI(TAG, "LCD_CMD_OPEN");
            hls12vga_power_on();
            set_display_onoff(true);
            hls12vga_set_brightness(9); // 设置亮度
            hls12vga_set_mirror(0x08);  // 0x10 垂直镜像 0x00 正常显示 0x08 水平镜像 0x18 水平+垂直镜像
            xyzn_os_delay_ms(2);
            hls12vga_open_display(); // 开启显示
            // hls12vga_set_shift(MOVE_DEFAULT, 0);
            hls12vga_clear_screen(false); // 清屏
            state_type = LCD_STATE_ON;

            show_default_ui(); // 显示默认图像
            break;
        case LCD_CMD_DATA:
            /* 处理帧数据*/
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
        default:
            break;
        }
        /* 最后再刷一次 LVGL，以便命令执行后的第一帧能够更新 */
        if (state_type == LCD_STATE_ON)
        {
            lv_timer_handler();
        }
    }
}

void lvgl_dispaly_thread(void)
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