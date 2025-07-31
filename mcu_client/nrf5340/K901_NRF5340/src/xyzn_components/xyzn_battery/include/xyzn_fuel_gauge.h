#ifndef XYZN_FUEL_GAUGE_H
#define XYZN_FUEL_GAUGE_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief XYZN Fuel Gauge component declarations
 */

/* Fuel gauge data structure */
typedef struct {
    uint16_t voltage_mv;        /* Battery voltage in millivolts */
    int16_t current_ma;         /* Battery current in milliamps */
    uint8_t soc_percent;        /* State of charge in percentage */
    uint16_t capacity_mah;      /* Remaining capacity in mAh */
    int16_t temperature_c;      /* Temperature in Celsius */
    uint32_t time_to_empty_min; /* Time to empty in minutes */
    uint32_t time_to_full_min;  /* Time to full in minutes */
} xyzn_fuel_gauge_data_t;

/* Fuel gauge configuration */
typedef struct {
    uint16_t design_capacity_mah;
    uint16_t design_voltage_mv;
    uint8_t chemistry;
    bool enable_alerts;
} xyzn_fuel_gauge_config_t;

/* Fuel gauge handle type */
typedef void* xyzn_fuel_gauge_handle_t;

/* Fuel gauge callback function type */
typedef void (*xyzn_fuel_gauge_callback_t)(uint8_t event, const xyzn_fuel_gauge_data_t *data);

/**
 * @brief Initialize the fuel gauge
 * @param config Fuel gauge configuration
 * @return Handle to fuel gauge instance or NULL on error
 */
xyzn_fuel_gauge_handle_t xyzn_fuel_gauge_init(const xyzn_fuel_gauge_config_t *config);

/**
 * @brief Read fuel gauge data
 * @param handle Fuel gauge handle
 * @param data Pointer to data structure to fill
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_read_data(xyzn_fuel_gauge_handle_t handle, xyzn_fuel_gauge_data_t *data);

/**
 * @brief Get battery voltage
 * @param handle Fuel gauge handle
 * @param voltage_mv Output voltage in millivolts
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_get_voltage(xyzn_fuel_gauge_handle_t handle, uint16_t *voltage_mv);

/**
 * @brief Get state of charge
 * @param handle Fuel gauge handle
 * @param soc_percent Output state of charge in percentage
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_get_soc(xyzn_fuel_gauge_handle_t handle, uint8_t *soc_percent);

/**
 * @brief Get battery current
 * @param handle Fuel gauge handle
 * @param current_ma Output current in milliamps
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_get_current(xyzn_fuel_gauge_handle_t handle, int16_t *current_ma);

/**
 * @brief Get battery temperature
 * @param handle Fuel gauge handle
 * @param temperature_c Output temperature in Celsius
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_get_temperature(xyzn_fuel_gauge_handle_t handle, int16_t *temperature_c);

/**
 * @brief Set fuel gauge callback
 * @param handle Fuel gauge handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_set_callback(xyzn_fuel_gauge_handle_t handle, xyzn_fuel_gauge_callback_t callback);

/**
 * @brief Enable/disable fuel gauge
 * @param handle Fuel gauge handle
 * @param enable true to enable, false to disable
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_enable(xyzn_fuel_gauge_handle_t handle, bool enable);

/**
 * @brief Reset fuel gauge
 * @param handle Fuel gauge handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_reset(xyzn_fuel_gauge_handle_t handle);

/**
 * @brief Deinitialize fuel gauge
 * @param handle Fuel gauge handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int xyzn_fuel_gauge_deinit(xyzn_fuel_gauge_handle_t handle);

/**
 * @brief Monitor battery status
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int batter_monitor(void);

#ifdef __cplusplus
}
#endif

#endif /* XYZN_FUEL_GAUGE_H */
