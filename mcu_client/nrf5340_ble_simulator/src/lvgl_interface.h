/*
 * Copyright (c) 2025 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef LVGL_INTERFACE_H_
#define LVGL_INTERFACE_H_

#include <zephyr/types.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Update the main text display on LVGL
 *
 * @param text Text to display (max 255 characters)
 * @param color RGB565 color value (0xF800 for red, 0x07E0 for green, etc.)
 * @param x X coordinate position
 * @param y Y coordinate position
 * @param size Font size multiplier
 */
void lvgl_update_text_display(const char *text, uint32_t color, uint32_t x, uint32_t y, uint32_t size);

/**
 * @brief Update the protobuf message label on LVGL
 *
 * @param text Text from protobuf DisplayText message
 * @param color RGB565 color from protobuf message
 * @param x X coordinate from protobuf message
 * @param y Y coordinate from protobuf message
 * @param size Font size from protobuf message
 */
void lvgl_display_protobuf_text(const char *text, uint32_t color, uint32_t x, uint32_t y, uint32_t size);

/**
 * @brief Check if LVGL display system is ready
 *
 * @return true if ready, false otherwise
 */
bool lvgl_is_display_ready(void);

#ifdef __cplusplus
}
#endif

#endif /* LVGL_INTERFACE_H_ */
