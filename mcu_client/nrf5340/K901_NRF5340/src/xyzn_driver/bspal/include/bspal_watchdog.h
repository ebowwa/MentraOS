#ifndef BSPAL_WATCHDOG_H
#define BSPAL_WATCHDOG_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSPAL Watchdog driver declarations
 */

/* Watchdog configuration structure */
typedef struct {
    uint32_t timeout_ms;
    bool enable_reset;
    bool enable_interrupt;
} bspal_watchdog_config_t;

/* Watchdog handle type */
typedef void* bspal_watchdog_handle_t;

/**
 * @brief Initialize the watchdog driver
 * @param config Watchdog configuration
 * @return Handle to watchdog instance or NULL on error
 */
bspal_watchdog_handle_t bspal_watchdog_init(const bspal_watchdog_config_t *config);

/**
 * @brief Start the watchdog timer
 * @param handle Watchdog handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_watchdog_start(bspal_watchdog_handle_t handle);

/**
 * @brief Stop the watchdog timer
 * @param handle Watchdog handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_watchdog_stop(bspal_watchdog_handle_t handle);

/**
 * @brief Feed/kick the watchdog to prevent reset
 * @param handle Watchdog handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_watchdog_feed(bspal_watchdog_handle_t handle);

/**
 * @brief Get watchdog status
 * @param handle Watchdog handle
 * @return true if watchdog is running, false otherwise
 */
bool bspal_watchdog_is_running(bspal_watchdog_handle_t handle);

/**
 * @brief Set watchdog timeout
 * @param handle Watchdog handle
 * @param timeout_ms Timeout in milliseconds
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_watchdog_set_timeout(bspal_watchdog_handle_t handle, uint32_t timeout_ms);

/**
 * @brief Deinitialize watchdog
 * @param handle Watchdog handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_watchdog_deinit(bspal_watchdog_handle_t handle);

/**
 * @brief Primary watchdog feed worker function
 */
void primary_feed_worker(void);

#ifdef __cplusplus
}
#endif

#endif /* BSPAL_WATCHDOG_H */
