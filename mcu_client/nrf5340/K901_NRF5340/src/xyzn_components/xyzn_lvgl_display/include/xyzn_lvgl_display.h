#ifndef XYZN_LVGL_DISPLAY_H
#define XYZN_LVGL_DISPLAY_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __/**
 * @brief Deinitialize the LVGL display driver
 * @param handle Display handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_deinit(xyzn_lvgl_display_handle_t handle);

/**
 * @brief LVGL display thread function
 */
void lvgl_dispaly_thread(void);

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief XYZN LVGL Display component declarations
 */

/* Display configuration structure */
typedef struct {
    uint16_t width;
    uint16_t height;
    uint8_t color_depth;
    bool enable_double_buffer;
    uint32_t refresh_rate_hz;
} xyzn_lvgl_display_config_t;

/* Display rotation */
typedef enum {
    XYZN_LVGL_DISPLAY_ROTATION_0 = 0,
    XYZN_LVGL_DISPLAY_ROTATION_90,
    XYZN_LVGL_DISPLAY_ROTATION_180,
    XYZN_LVGL_DISPLAY_ROTATION_270
} xyzn_lvgl_display_rotation_t;

/* Display handle type */
typedef void* xyzn_lvgl_display_handle_t;

/**
 * @brief Initialize the LVGL display driver
 * @param config Display configuration
 * @return Handle to display instance or NULL on error
 */
xyzn_lvgl_display_handle_t xyzn_lvgl_display_init(const xyzn_lvgl_display_config_t *config);

/**
 * @brief Start display operations
 * @param handle Display handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_start(xyzn_lvgl_display_handle_t handle);

/**
 * @brief Stop display operations
 * @param handle Display handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_stop(xyzn_lvgl_display_handle_t handle);

/**
 * @brief Set display brightness
 * @param handle Display handle
 * @param brightness Brightness level (0-100)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_set_brightness(xyzn_lvgl_display_handle_t handle, uint8_t brightness);

/**
 * @brief Get display brightness
 * @param handle Display handle
 * @param brightness Output brightness level
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_get_brightness(xyzn_lvgl_display_handle_t handle, uint8_t *brightness);

/**
 * @brief Set display rotation
 * @param handle Display handle
 * @param rotation Display rotation
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_set_rotation(xyzn_lvgl_display_handle_t handle, xyzn_lvgl_display_rotation_t rotation);

/**
 * @brief Flush display buffer
 * @param handle Display handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_flush(xyzn_lvgl_display_handle_t handle);

/**
 * @brief Enable/disable display
 * @param handle Display handle
 * @param enable true to enable, false to disable
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_enable(xyzn_lvgl_display_handle_t handle, bool enable);

/**
 * @brief Check if display is enabled
 * @param handle Display handle
 * @return true if enabled, false otherwise
 */
bool xyzn_lvgl_display_is_enabled(xyzn_lvgl_display_handle_t handle);

/**
 * @brief Get display dimensions
 * @param handle Display handle
 * @param width Output width
 * @param height Output height
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_get_dimensions(xyzn_lvgl_display_handle_t handle, uint16_t *width, uint16_t *height);

/**
 * @brief Set display buffer
 * @param handle Display handle
 * @param buffer1 Primary buffer
 * @param buffer2 Secondary buffer (optional for double buffering)
 * @param buffer_size Buffer size in bytes
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_set_buffer(xyzn_lvgl_display_handle_t handle, void *buffer1, void *buffer2, uint32_t buffer_size);

/**
 * @brief Process LVGL tasks (call from main loop)
 * @param handle Display handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_task(xyzn_lvgl_display_handle_t handle);

/**
 * @brief Deinitialize display
 * @param handle Display handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_lvgl_display_deinit(xyzn_lvgl_display_handle_t handle);

#ifdef __cplusplus
}
#endif

#endif /* XYZN_LVGL_DISPLAY_H */
