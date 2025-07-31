#ifndef BSPAL_KEY_H
#define BSPAL_KEY_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"
#include "bsp_key.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSPAL Key Platform Abstraction Layer declarations
 * This is a wrapper around the BSP key driver
 */

/* BSPAL Key configuration structure */
typedef struct {
    bsp_key_config_t bsp_config;
    bool enable_power_management;
    uint32_t wakeup_mask;
} bspal_key_config_t;

/* BSPAL Key handle type */
typedef void* bspal_key_handle_t;

/**
 * @brief Initialize the BSPAL key driver
 * @param config Key configuration
 * @return Handle to key instance or NULL on error
 */
bspal_key_handle_t bspal_key_init(const bspal_key_config_t *config);

/**
 * @brief Enable key detection
 * @param handle Key handle
 * @param key_id Key identifier
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_key_enable(bspal_key_handle_t handle, bsp_key_id_t key_id);

/**
 * @brief Disable key detection
 * @param handle Key handle
 * @param key_id Key identifier
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_key_disable(bspal_key_handle_t handle, bsp_key_id_t key_id);

/**
 * @brief Get key state
 * @param handle Key handle
 * @param key_id Key identifier
 * @return true if key is pressed, false otherwise
 */
bool bspal_key_is_pressed(bspal_key_handle_t handle, bsp_key_id_t key_id);

/**
 * @brief Set key callback function
 * @param handle Key handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_key_set_callback(bspal_key_handle_t handle, bsp_key_callback_t callback);

/**
 * @brief Process key events
 * @param handle Key handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_key_process(bspal_key_handle_t handle);

/**
 * @brief Enter low power mode
 * @param handle Key handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_key_enter_low_power(bspal_key_handle_t handle);

/**
 * @brief Exit low power mode
 * @param handle Key handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_key_exit_low_power(bspal_key_handle_t handle);

/**
 * @brief Deinitialize key driver
 * @param handle Key handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_key_deinit(bspal_key_handle_t handle);

/**
 * @brief Start debounce timer
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_debounce_timer_start(void);

#ifdef __cplusplus
}
#endif

#endif /* BSPAL_KEY_H */
