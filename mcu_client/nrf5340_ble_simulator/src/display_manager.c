/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include <lvgl.h>

#include "display_manager.h"
#include "mos_lvgl_display.h"
#include "xip_fonts.h"  // Include XIP font definitions

LOG_MODULE_REGISTER(display_manager, LOG_LEVEL_DBG);

// Message queue for display commands
#define DISPLAY_QUEUE_SIZE 10
K_MSGQ_DEFINE(display_msgq, sizeof(display_msg_t), DISPLAY_QUEUE_SIZE, 4);

// Display thread configuration
#define DISPLAY_THREAD_STACK_SIZE 4096
#define DISPLAY_THREAD_PRIORITY 6

K_THREAD_STACK_DEFINE(display_stack_area, DISPLAY_THREAD_STACK_SIZE);
static struct k_thread display_thread_data;
static k_tid_t display_thread_id;

// Current display state
static bool display_enabled = false;
static lv_obj_t *current_text_label = NULL;
static lv_obj_t *current_scroll_container = NULL;

// XIP Font mapping table - using external flash fonts
static const struct {
    uint16_t code;
    const lv_font_t *font;
} font_map[] = {
    {12, &font_puhui_12_essential},  // XIP: Chinese + English 12pt
    {14, &font_puhui_14_essential},  // XIP: Chinese + English 14pt  
    {16, &font_puhui_16_essential},  // XIP: Chinese + English 16pt
    // All fonts available in external flash now!
    {0, &font_puhui_14_essential}    // Default XIP font
};

static void display_thread_entry(void *arg1, void *arg2, void *arg3);
static void handle_static_text_message(const display_msg_t *msg);
static void handle_scrolling_text_message(const display_msg_t *msg);
static void handle_brightness_message(const display_msg_t *msg);

int display_manager_init(void)
{
    LOG_INF("🖥️  Initializing display manager");
    
    // Start LVGL display thread first
    lvgl_display_thread();
    
    // Give LVGL some time to initialize
    k_msleep(100);
    
    // Start our display manager thread
    display_thread_id = k_thread_create(&display_thread_data,
                                       display_stack_area,
                                       K_THREAD_STACK_SIZEOF(display_stack_area),
                                       display_thread_entry,
                                       NULL, NULL, NULL,
                                       DISPLAY_THREAD_PRIORITY,
                                       0, K_NO_WAIT);
    
    if (display_thread_id == NULL) {
        LOG_ERR("❌ Failed to create display manager thread");
        return -ENOMEM;
    }
    
    k_thread_name_set(display_thread_id, "display_mgr");
    
    LOG_INF("✅ Display manager initialized successfully");
    return 0;
}

int display_manager_enable(void)
{
    display_msg_t msg = {
        .type = DISPLAY_MSG_ENABLE
    };
    
    int ret = k_msgq_put(&display_msgq, &msg, K_NO_WAIT);
    if (ret != 0) {
        LOG_WRN("⚠️  Display queue full, dropping enable message");
        return ret;
    }
    
    LOG_INF("🖥️  Display enable command queued");
    return 0;
}

int display_manager_disable(void)
{
    display_msg_t msg = {
        .type = DISPLAY_MSG_DISABLE
    };
    
    int ret = k_msgq_put(&display_msgq, &msg, K_NO_WAIT);
    if (ret != 0) {
        LOG_WRN("⚠️  Display queue full, dropping disable message");
        return ret;
    }
    
    LOG_INF("🖥️  Display disable command queued");
    return 0;
}

int display_manager_clear(void)
{
    display_msg_t msg = {
        .type = DISPLAY_MSG_CLEAR
    };
    
    int ret = k_msgq_put(&display_msgq, &msg, K_NO_WAIT);
    if (ret != 0) {
        LOG_WRN("⚠️  Display queue full, dropping clear message");
        return ret;
    }
    
    LOG_INF("🖥️  Display clear command queued");
    return 0;
}

int display_manager_show_static_text(const mentraos_ble_DisplayText *display_text)
{
    if (!display_text) {
        LOG_ERR("❌ Invalid display text pointer");
        return -EINVAL;
    }
    
    display_msg_t msg = {
        .type = DISPLAY_MSG_STATIC_TEXT,
        .payload.static_text = {
            .x = display_text->x,
            .y = display_text->y,
            .color = display_text->color,
            .font_code = display_text->font_code,
            .size = display_text->size
        }
    };
    
    // Copy text safely
    strncpy(msg.payload.static_text.text, display_text->text, sizeof(msg.payload.static_text.text) - 1);
    msg.payload.static_text.text[sizeof(msg.payload.static_text.text) - 1] = '\0';
    
    int ret = k_msgq_put(&display_msgq, &msg, K_NO_WAIT);
    if (ret != 0) {
        LOG_WRN("⚠️  Display queue full, dropping static text message");
        return ret;
    }
    
    LOG_INF("📝 Static text display command queued: \"%s\"", msg.payload.static_text.text);
    return 0;
}

int display_manager_show_scrolling_text(const mentraos_ble_DisplayScrollingText *scrolling_text)
{
    if (!scrolling_text) {
        LOG_ERR("❌ Invalid scrolling text pointer");
        return -EINVAL;
    }
    
    display_msg_t msg = {
        .type = DISPLAY_MSG_SCROLLING_TEXT,
        .payload.scrolling_text = {
            .x = scrolling_text->x,
            .y = scrolling_text->y,
            .width = scrolling_text->width,
            .height = scrolling_text->height,
            .color = scrolling_text->color,
            .font_code = scrolling_text->font_code,
            .align = scrolling_text->align,
            .speed = scrolling_text->speed,
            .line_spacing = scrolling_text->line_spacing,
            .loop = scrolling_text->loop,
            .pause_ms = scrolling_text->pause_ms
        }
    };
    
    // Copy text safely
    strncpy(msg.payload.scrolling_text.text, scrolling_text->text, sizeof(msg.payload.scrolling_text.text) - 1);
    msg.payload.scrolling_text.text[sizeof(msg.payload.scrolling_text.text) - 1] = '\0';
    
    int ret = k_msgq_put(&display_msgq, &msg, K_NO_WAIT);
    if (ret != 0) {
        LOG_WRN("⚠️  Display queue full, dropping scrolling text message");
        return ret;
    }
    
    LOG_INF("📜 Scrolling text display command queued: \"%s\"", msg.payload.scrolling_text.text);
    return 0;
}

int display_manager_set_brightness(uint8_t brightness_level)
{
    display_msg_t msg = {
        .type = DISPLAY_MSG_BRIGHTNESS,
        .payload.brightness.level = brightness_level
    };
    
    int ret = k_msgq_put(&display_msgq, &msg, K_NO_WAIT);
    if (ret != 0) {
        LOG_WRN("⚠️  Display queue full, dropping brightness message");
        return ret;
    }
    
    LOG_INF("💡 Display brightness command queued: %u%%", brightness_level);
    return 0;
}

const lv_font_t *display_manager_map_font(uint16_t font_code)
{
    for (int i = 0; i < ARRAY_SIZE(font_map); i++) {
        if (font_map[i].code == font_code) {
            return font_map[i].font;
        }
    }
    
    // Return default font if not found
    LOG_WRN("⚠️  Font code %u not found, using default", font_code);
    return &lv_font_montserrat_14;  // Was 16, using 14 for memory
}

lv_color_t display_manager_convert_color(uint32_t rgb888_color)
{
    uint8_t r = (rgb888_color >> 16) & 0xFF;
    uint8_t g = (rgb888_color >> 8) & 0xFF;
    uint8_t b = rgb888_color & 0xFF;
    
    return lv_color_make(r, g, b);
}

static void display_thread_entry(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);
    
    LOG_INF("🖥️  Display manager thread started");
    
    // Wait for LVGL to be ready
    k_msleep(500);
    
    // Initialize display by default
    display_open();
    display_enabled = true;
    
    display_msg_t msg;
    
    while (1) {
        // Wait for display messages with 100ms timeout
        int ret = k_msgq_get(&display_msgq, &msg, K_MSEC(100));
        
        if (ret == 0) {
            // Process the message
            switch (msg.type) {
            case DISPLAY_MSG_ENABLE:
                if (!display_enabled) {
                    display_open();
                    display_enabled = true;
                    LOG_INF("🖥️  Display enabled");
                }
                break;
                
            case DISPLAY_MSG_DISABLE:
                if (display_enabled) {
                    display_close();
                    display_enabled = false;
                    LOG_INF("🖥️  Display disabled");
                }
                break;
                
            case DISPLAY_MSG_CLEAR:
                if (display_enabled) {
                    // Clear existing text elements
                    if (current_text_label) {
                        lv_obj_del(current_text_label);
                        current_text_label = NULL;
                    }
                    if (current_scroll_container) {
                        scroll_text_stop();
                        current_scroll_container = NULL;
                    }
                    LOG_INF("🖥️  Display cleared");
                }
                break;
                
            case DISPLAY_MSG_STATIC_TEXT:
                if (display_enabled) {
                    handle_static_text_message(&msg);
                }
                break;
                
            case DISPLAY_MSG_SCROLLING_TEXT:
                if (display_enabled) {
                    handle_scrolling_text_message(&msg);
                }
                break;
                
            case DISPLAY_MSG_BRIGHTNESS:
                handle_brightness_message(&msg);
                break;
                
            default:
                LOG_WRN("⚠️  Unknown display message type: %d", msg.type);
                break;
            }
        }
        
        // Small delay to prevent excessive CPU usage
        k_msleep(10);
    }
}

static void handle_static_text_message(const display_msg_t *msg)
{
    // Clear any existing text
    if (current_text_label) {
        lv_obj_del(current_text_label);
        current_text_label = NULL;
    }
    
    // Create new text label
    current_text_label = lv_label_create(lv_screen_active());
    if (!current_text_label) {
        LOG_ERR("❌ Failed to create text label");
        return;
    }
    
    // Set text content
    lv_label_set_text(current_text_label, msg->payload.static_text.text);
    
    // Set position
    lv_obj_set_pos(current_text_label, msg->payload.static_text.x, msg->payload.static_text.y);
    
    // Set font
    const lv_font_t *font = display_manager_map_font(msg->payload.static_text.font_code);
    lv_obj_set_style_text_font(current_text_label, font, LV_PART_MAIN);
    
    // Set color
    lv_color_t color = display_manager_convert_color(msg->payload.static_text.color);
    lv_obj_set_style_text_color(current_text_label, color, LV_PART_MAIN);
    
    LOG_INF("📝 Static text displayed: \"%s\" at (%d,%d)", 
            msg->payload.static_text.text,
            msg->payload.static_text.x,
            msg->payload.static_text.y);
}

static void handle_scrolling_text_message(const display_msg_t *msg)
{
    // Stop any existing scrolling text
    if (current_scroll_container) {
        scroll_text_stop();
        current_scroll_container = NULL;
    }
    
    // Calculate scroll time from speed
    // For now, use a fixed time or derive from speed parameter
    uint32_t scroll_time_ms = 3000; // 3 seconds default
    if (msg->payload.scrolling_text.speed > 0) {
        // Simple calculation: time based on speed (px/sec)
        scroll_time_ms = (msg->payload.scrolling_text.width * 1000) / msg->payload.scrolling_text.speed;
    }
    
    // Get font for scrolling text
    const lv_font_t *font = display_manager_map_font(msg->payload.scrolling_text.font_code);
    
    // Create scrolling text using existing function
    scroll_text_create(lv_screen_active(),
                      msg->payload.scrolling_text.x,
                      msg->payload.scrolling_text.y,
                      msg->payload.scrolling_text.width,
                      msg->payload.scrolling_text.height,
                      msg->payload.scrolling_text.text,
                      font,
                      scroll_time_ms);
    
    // Mark that we have active scrolling text
    current_scroll_container = (lv_obj_t *)1; // Non-null indicator
    
    LOG_INF("📜 Scrolling text displayed: \"%s\" at (%d,%d) size %dx%d", 
            msg->payload.scrolling_text.text,
            msg->payload.scrolling_text.x,
            msg->payload.scrolling_text.y,
            msg->payload.scrolling_text.width,
            msg->payload.scrolling_text.height);
}

static void handle_brightness_message(const display_msg_t *msg)
{
    // The brightness control is handled at the hardware level (PWM for LEDs)
    // For display brightness, we could potentially control backlight here
    // For now, just log the brightness change
    LOG_INF("💡 Display brightness request: %u%%", msg->payload.brightness.level);
    
    // TODO: Implement actual display brightness control if hardware supports it
}
