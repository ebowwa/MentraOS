#ifndef BSP_KEY_H
#define BSP_KEY_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSP Key/Button driver declarations
 */

/* Key/Button identifiers */
typedef enum {
    BSP_KEY_0 = 0,
    BSP_KEY_1,
    BSP_KEY_2,
    BSP_KEY_3,
    BSP_KEY_MAX
} bsp_key_id_t;

/* Key event types */
typedef enum {
    BSP_KEY_EVENT_PRESS = 0,
    BSP_KEY_EVENT_RELEASE,
    BSP_KEY_EVENT_LONG_PRESS,
    BSP_KEY_EVENT_DOUBLE_CLICK,
    BSP_KEY_EVENT_MAX
} bsp_key_event_t;

/* Key callback function type */
typedef void (*bsp_key_callback_t)(bsp_key_id_t key_id, bsp_key_event_t event);

/* Key configuration structure */
typedef struct {
    uint32_t debounce_ms;
    uint32_t long_press_ms;
    uint32_t double_click_ms;
    bsp_key_callback_t callback;
} bsp_key_config_t;

/**
 * @brief Initialize the key driver
 * @param config Key configuration
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_key_init(const bsp_key_config_t *config);

/**
 * @brief Enable key detection
 * @param key_id Key identifier
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_key_enable(bsp_key_id_t key_id);

/**
 * @brief Disable key detection
 * @param key_id Key identifier
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_key_disable(bsp_key_id_t key_id);

/**
 * @brief Get current key state
 * @param key_id Key identifier
 * @return true if key is pressed, false otherwise
 */
bool bsp_key_is_pressed(bsp_key_id_t key_id);

/**
 * @brief Get key state mask for all keys
 * @return Bitmask of key states
 */
uint32_t bsp_key_get_state_mask(void);

/**
 * @brief Set key callback function
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_key_set_callback(bsp_key_callback_t callback);

/**
 * @brief Process key events (call from main loop or timer)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_key_process(void);

/**
 * @brief Deinitialize key driver
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_key_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* BSP_KEY_H */
