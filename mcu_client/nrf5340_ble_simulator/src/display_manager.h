/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef DISPLAY_MANAGER_H
#define DISPLAY_MANAGER_H

#include <zephyr/kernel.h>
#include <lvgl.h>
#include "proto/mentraos_ble.pb.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Display message types for the display manager
 */
typedef enum {
    DISPLAY_MSG_INIT,
    DISPLAY_MSG_ENABLE,
    DISPLAY_MSG_DISABLE,
    DISPLAY_MSG_CLEAR,
    DISPLAY_MSG_STATIC_TEXT,
    DISPLAY_MSG_SCROLLING_TEXT,
    DISPLAY_MSG_BRIGHTNESS
} display_msg_type_t;

/**
 * @brief Display message structure for inter-thread communication
 */
typedef struct {
    display_msg_type_t type;
    union {
        struct {
            char text[128];
            uint16_t x;
            uint16_t y;
            uint32_t color;
            uint16_t font_code;
            uint8_t size;
        } static_text;
        
        struct {
            char text[128];
            uint16_t x;
            uint16_t y;
            uint16_t width;
            uint16_t height;
            uint32_t color;
            uint16_t font_code;
            uint8_t align;
            uint16_t speed;
            uint16_t line_spacing;
            bool loop;
            uint16_t pause_ms;
        } scrolling_text;
        
        struct {
            uint8_t level; // 0-100%
        } brightness;
    } payload;
} display_msg_t;

/**
 * @brief Initialize the display manager
 * @return 0 on success, negative errno code on failure
 */
int display_manager_init(void);

/**
 * @brief Send a display enable command
 * @return 0 on success, negative errno code on failure
 */
int display_manager_enable(void);

/**
 * @brief Send a display disable command
 * @return 0 on success, negative errno code on failure
 */
int display_manager_disable(void);

/**
 * @brief Clear the display
 * @return 0 on success, negative errno code on failure
 */
int display_manager_clear(void);

/**
 * @brief Display static text from protobuf DisplayText message
 * @param display_text Pointer to DisplayText protobuf structure
 * @return 0 on success, negative errno code on failure
 */
int display_manager_show_static_text(const mentraos_ble_DisplayText *display_text);

/**
 * @brief Display scrolling text from protobuf DisplayScrollingText message
 * @param scrolling_text Pointer to DisplayScrollingText protobuf structure
 * @return 0 on success, negative errno code on failure
 */
int display_manager_show_scrolling_text(const mentraos_ble_DisplayScrollingText *scrolling_text);

/**
 * @brief Set display brightness
 * @param brightness_level Brightness level (0-100%)
 * @return 0 on success, negative errno code on failure
 */
int display_manager_set_brightness(uint8_t brightness_level);

/**
 * @brief Map font code to LVGL font
 * @param font_code Font code from protobuf message
 * @return Pointer to LVGL font, or default font if not found
 */
const lv_font_t *display_manager_map_font(uint16_t font_code);

/**
 * @brief Get LVGL font by size (for shell and display system)
 * @param size Font size in points (12, 14, 30, 48)
 * @return Pointer to LVGL font, or default 14pt font if not found
 */
const lv_font_t *display_get_font_by_size(int size);

/**
 * @brief Convert RGB888 color to LVGL color
 * @param rgb888_color 24-bit RGB color
 * @return LVGL color structure
 */
lv_color_t display_manager_convert_color(uint32_t rgb888_color);

#ifdef __cplusplus
}
#endif

#endif /* DISPLAY_MANAGER_H */
