#ifndef BSP_ICM42688P_H
#define BSP_ICM42688P_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"
#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>

/* ICM42688P I2C address */
#define ICM42688P_I2C_ADDR         0x68

/* ICM42688P register addresses */
#define REG_WHO_AM_I               0x75
#define ICM42688P_WHO_AM_I_ID      0x47

/* Sensor data structure */
typedef struct {
    float acc_g[3];     /* Accelerometer data in g */
    float acc_ms2[3];   /* Accelerometer data in m/s^2 */
    float gyr_dps[3];   /* Gyroscope data in deg/s */
} sensor_data;

/* Global sensor data */
extern sensor_data icm42688p_data;

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSP ICM42688P 6-axis IMU sensor driver declarations
 */

/* ICM42688P sensor data structure */
typedef struct {
    int16_t accel_x;    /* Accelerometer X-axis (mg) */
    int16_t accel_y;    /* Accelerometer Y-axis (mg) */
    int16_t accel_z;    /* Accelerometer Z-axis (mg) */
    int16_t gyro_x;     /* Gyroscope X-axis (mdps) */
    int16_t gyro_y;     /* Gyroscope Y-axis (mdps) */
    int16_t gyro_z;     /* Gyroscope Z-axis (mdps) */
    int16_t temperature; /* Temperature (0.01°C) */
} bsp_icm42688p_data_t;

/* ICM42688P configuration structure */
typedef struct {
    uint8_t accel_odr;      /* Accelerometer output data rate */
    uint8_t accel_range;    /* Accelerometer full scale range */
    uint8_t gyro_odr;       /* Gyroscope output data rate */
    uint8_t gyro_range;     /* Gyroscope full scale range */
    bool enable_interrupt;  /* Enable data ready interrupt */
} bsp_icm42688p_config_t;

/* ICM42688P handle type */
typedef void* bsp_icm42688p_handle_t;

/* Data ready callback function type */
typedef void (*bsp_icm42688p_callback_t)(const bsp_icm42688p_data_t *data);

/**
 * @brief Initialize the ICM42688P sensor
 * @param config Sensor configuration
 * @return Handle to sensor instance or NULL on error
 */
bsp_icm42688p_handle_t bsp_icm42688p_init(const bsp_icm42688p_config_t *config);

/**
 * @brief Read sensor data
 * @param handle Sensor handle
 * @param data Pointer to data structure to fill
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_read_data(bsp_icm42688p_handle_t handle, bsp_icm42688p_data_t *data);

/**
 * @brief Read accelerometer data only
 * @param handle Sensor handle
 * @param accel_x X-axis accelerometer data
 * @param accel_y Y-axis accelerometer data
 * @param accel_z Z-axis accelerometer data
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_read_accel(bsp_icm42688p_handle_t handle, int16_t *accel_x, int16_t *accel_y, int16_t *accel_z);

/**
 * @brief Read gyroscope data only
 * @param handle Sensor handle
 * @param gyro_x X-axis gyroscope data
 * @param gyro_y Y-axis gyroscope data
 * @param gyro_z Z-axis gyroscope data
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_read_gyro(bsp_icm42688p_handle_t handle, int16_t *gyro_x, int16_t *gyro_y, int16_t *gyro_z);

/**
 * @brief Read temperature
 * @param handle Sensor handle
 * @param temperature Temperature data
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_read_temperature(bsp_icm42688p_handle_t handle, int16_t *temperature);

/**
 * @brief Set data ready callback
 * @param handle Sensor handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_set_callback(bsp_icm42688p_handle_t handle, bsp_icm42688p_callback_t callback);

/**
 * @brief Enable/disable sensor
 * @param handle Sensor handle
 * @param enable true to enable, false to disable
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_enable(bsp_icm42688p_handle_t handle, bool enable);

/**
 * @brief Perform sensor self-test
 * @param handle Sensor handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_self_test(bsp_icm42688p_handle_t handle);

/**
 * @brief Deinitialize sensor
 * @param handle Sensor handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_icm42688p_deinit(bsp_icm42688p_handle_t handle);

#ifdef __cplusplus
}
#endif

#endif /* BSP_ICM42688P_H */
