#ifndef BSPAL_GX8002_H
#define BSPAL_GX8002_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"
#include "bsp_gx8002.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSPAL GX8002 Platform Abstraction Layer declarations
 * This is a wrapper around the BSP GX8002 driver
 */

/* BSPAL GX8002 configuration structure */
typedef struct {
    bsp_gx8002_config_t bsp_config;
    bool enable_power_management;
    uint32_t power_mode;
} bspal_gx8002_config_t;

/* BSPAL GX8002 handle type */
typedef void* bspal_gx8002_handle_t;

/**
 * @brief Initialize the BSPAL GX8002 driver
 * @param config GX8002 configuration
 * @return Handle to GX8002 instance or NULL on error
 */
bspal_gx8002_handle_t bspal_gx8002_init(const bspal_gx8002_config_t *config);

/**
 * @brief Start GX8002 operation
 * @param handle GX8002 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_gx8002_start(bspal_gx8002_handle_t handle);

/**
 * @brief Stop GX8002 operation
 * @param handle GX8002 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_gx8002_stop(bspal_gx8002_handle_t handle);

/**
 * @brief Read data from GX8002
 * @param handle GX8002 handle
 * @param buffer Buffer to store data
 * @param length Buffer length
 * @return Number of bytes read, or negative error code
 */
int bspal_gx8002_read(bspal_gx8002_handle_t handle, uint8_t *buffer, uint32_t length);

/**
 * @brief Write data to GX8002
 * @param handle GX8002 handle
 * @param data Data to write
 * @param length Data length
 * @return Number of bytes written, or negative error code
 */
int bspal_gx8002_write(bspal_gx8002_handle_t handle, const uint8_t *data, uint32_t length);

/**
 * @brief Set GX8002 callback function
 * @param handle GX8002 handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_gx8002_set_callback(bspal_gx8002_handle_t handle, bsp_gx8002_callback_t callback);

/**
 * @brief Reset GX8002 component
 * @param handle GX8002 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_gx8002_reset(bspal_gx8002_handle_t handle);

/**
 * @brief Enter low power mode
 * @param handle GX8002 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_gx8002_enter_low_power(bspal_gx8002_handle_t handle);

/**
 * @brief Exit low power mode
 * @param handle GX8002 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_gx8002_exit_low_power(bspal_gx8002_handle_t handle);

/**
 * @brief Deinitialize GX8002 driver
 * @param handle GX8002 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_gx8002_deinit(bspal_gx8002_handle_t handle);

#ifdef __cplusplus
}
#endif

#endif /* BSPAL_GX8002_H */
