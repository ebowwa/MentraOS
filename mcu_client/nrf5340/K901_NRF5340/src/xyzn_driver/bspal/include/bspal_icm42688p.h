#ifndef BSPAL_ICM42688P_H
#define BSPAL_ICM42688P_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"
#include "bsp_icm42688p.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSPAL ICM42688P Platform Abstraction Layer declarations
 * This is a wrapper around the BSP ICM42688P driver
 */

/* BSPAL ICM42688P configuration structure */
typedef struct {
    bsp_icm42688p_config_t bsp_config;
    bool enable_power_management;
    uint32_t power_mode;
    bool enable_fifo;
} bspal_icm42688p_config_t;

/* BSPAL ICM42688P handle type */
typedef void* bspal_icm42688p_handle_t;

/**
 * @brief Initialize the BSPAL ICM42688P driver
 * @param config ICM42688P configuration
 * @return Handle to ICM42688P instance or NULL on error
 */
bspal_icm42688p_handle_t bspal_icm42688p_init(const bspal_icm42688p_config_t *config);

/**
 * @brief Read sensor data
 * @param handle ICM42688P handle
 * @param data Pointer to data structure to fill
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_read_data(bspal_icm42688p_handle_t handle, bsp_icm42688p_data_t *data);

/**
 * @brief Read accelerometer data only
 * @param handle ICM42688P handle
 * @param accel_x X-axis accelerometer data
 * @param accel_y Y-axis accelerometer data
 * @param accel_z Z-axis accelerometer data
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_read_accel(bspal_icm42688p_handle_t handle, int16_t *accel_x, int16_t *accel_y, int16_t *accel_z);

/**
 * @brief Read gyroscope data only
 * @param handle ICM42688P handle
 * @param gyro_x X-axis gyroscope data
 * @param gyro_y Y-axis gyroscope data
 * @param gyro_z Z-axis gyroscope data
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_read_gyro(bspal_icm42688p_handle_t handle, int16_t *gyro_x, int16_t *gyro_y, int16_t *gyro_z);

/**
 * @brief Set data ready callback
 * @param handle ICM42688P handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_set_callback(bspal_icm42688p_handle_t handle, bsp_icm42688p_callback_t callback);

/**
 * @brief Enable/disable sensor
 * @param handle ICM42688P handle
 * @param enable true to enable, false to disable
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_enable(bspal_icm42688p_handle_t handle, bool enable);

/**
 * @brief Perform sensor self-test
 * @param handle ICM42688P handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_self_test(bspal_icm42688p_handle_t handle);

/**
 * @brief Enter low power mode
 * @param handle ICM42688P handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_enter_low_power(bspal_icm42688p_handle_t handle);

/**
 * @brief Exit low power mode
 * @param handle ICM42688P handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_exit_low_power(bspal_icm42688p_handle_t handle);

/**
 * @brief Deinitialize sensor
 * @param handle ICM42688P handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_deinit(bspal_icm42688p_handle_t handle);

/**
 * @brief Configure ICM42688P parameters
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_icm42688p_parameter_config(void);

/**
 * @brief Test ICM42688P functionality
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int test_icm42688p(void);

#ifdef __cplusplus
}
#endif

#endif /* BSPAL_ICM42688P_H */
