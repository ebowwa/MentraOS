/*
 * @Author       : Cole
 * @Date         : 2025-11-19 20:05:11
 * @LastEditTime : 2025-11-20 11:54:46
 * @FilePath     : lsm6dsv16x.c
 * @Description  : LSM6DSV16X 6-axis IMU sensor driver wrapper
 *                 LSM6DSV16X 6轴IMU传感器驱动封装
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include "lsm6dsv16x.h"

#include <math.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/drivers/sensor_data_types.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/util.h>

LOG_MODULE_REGISTER(lsm6dsv16x, LOG_LEVEL_INF);

// Device tree node | 设备树节点
#define LSM6DSV16X_NODE DT_ALIAS(lsm6dsv16x)

// I2C address | I2C地址
#define LSM6DSV16X_I2C_ADDR_0 0x6a  // AD0 = GND
#define LSM6DSV16X_I2C_ADDR_1 0x6b  // AD0 = VDD

// WHO_AM_I register | WHO_AM_I寄存器
#define LSM6DSV16X_REG_WHO_AM_I 0x0F
#define LSM6DSV16X_WHO_AM_I_VAL 0x70  // Expected value for LSM6DSV16X

// Global sensor device pointer | 全局传感器设备指针
static const struct device* lsm6dsv16x_dev = NULL;
static const struct device* i2c_bus        = NULL;

// GPIO control for IMU initialization | IMU初始化GPIO控制
#define USER_NODE DT_PATH(zephyr_user)
#if DT_NODE_EXISTS(USER_NODE) && DT_NODE_HAS_PROP(USER_NODE, imu_ctrl_init_gpios)
static const struct gpio_dt_spec imu_init_gpio = GPIO_DT_SPEC_GET(USER_NODE, imu_ctrl_init_gpios);
static bool imu_init_gpio_initialized = false;

/**
 * Initialize IMU init control GPIO | 初始化IMU初始化控制GPIO
 */
static int imu_init_gpio_init(void)
{
    if (imu_init_gpio_initialized)
    {
        return 0;  // Already initialized
    }
    
    if (!gpio_is_ready_dt(&imu_init_gpio))
    {
        LOG_ERR("IMU init control GPIO port not ready");
        return -ENODEV;
    }
    
    // Configure as output, initial state LOW (inactive) | 配置为输出，初始状态为低电平（非激活）
    int ret = gpio_pin_configure_dt(&imu_init_gpio, GPIO_OUTPUT_INACTIVE);
    if (ret != 0)
    {
        LOG_ERR("Failed to configure IMU init control GPIO: %d", ret);
        return ret;
    }
    
    imu_init_gpio_initialized = true;
    LOG_INF("IMU init control GPIO (P1.04) initialized as output, initial state: LOW");
    return 0;
}

/**
 * Set IMU init control GPIO state | 设置IMU初始化控制GPIO状态
 * @param high true to set high, false to set low | true为高电平，false为低电平
 */
static int imu_init_gpio_set(bool high)
{
    if (!imu_init_gpio_initialized)
    {
        int ret = imu_init_gpio_init();
        if (ret != 0)
        {
            LOG_ERR("IMU init GPIO init failed: %d", ret);
            return ret;
        }
    }
    
    int ret = gpio_pin_set_dt(&imu_init_gpio, high ? 1 : 0);
    if (ret != 0)
    {
        LOG_ERR("Failed to set IMU init control GPIO to %s: %d", high ? "HIGH" : "LOW", ret);
        return ret;
    }
    
    LOG_INF("IMU init control GPIO (P1.04) set to %s", high ? "HIGH" : "LOW");
    return 0;
}
#else
static int imu_init_gpio_init(void) { return 0; }
static int imu_init_gpio_set(bool high) { (void)high; return 0; }
#endif

int lsm6dsv16x_init(void)
{
#if DT_NODE_EXISTS(LSM6DSV16X_NODE)
    int ret;
    uint8_t device_id = 0;
    bool gpio_raised = false;  // Track GPIO state | 跟踪GPIO状态

    // Set GPIO to HIGH at the start of initialization | 初始化开始时设置GPIO为高电平
    ret = imu_init_gpio_set(true);
    if (ret == 0)
    {
        gpio_raised = true;
    }
    else
    {
        LOG_WRN("⚠️  Failed to set IMU init GPIO HIGH: %d (continuing anyway)", ret);
    }

    LOG_INF("========================================");
    LOG_INF("🔍 LSM6DSV16X Sensor Initialization");
    LOG_INF("========================================");

    // Step 1: Get I2C bus device | 获取I2C总线设备
    i2c_bus = DEVICE_DT_GET(DT_BUS(LSM6DSV16X_NODE));
    if (i2c_bus == NULL || !device_is_ready(i2c_bus))
    {
        LOG_ERR("❌ I2C bus device not available or not ready");
        // Set GPIO to LOW before returning | 返回前设置GPIO为低电平
        if (gpio_raised)
        {
            imu_init_gpio_set(false);
        }
        return -ENODEV;
    }
    LOG_INF("✅ I2C bus device: %s", i2c_bus->name);

    // Step 2: Read device ID to verify hardware connection | 读取器件ID验证硬件连接
    LOG_INF("🔍 Step 1: Reading device ID to verify hardware connection...");
    ret = lsm6dsv16x_read_device_id(&device_id);
    if (ret != 0)
    {
        LOG_ERR("❌ Failed to read device ID: %d", ret);
        LOG_ERR("   This indicates a hardware connection problem.");
        LOG_ERR("   The sensor driver initialization will likely fail.");
    }
    else
    {
        if (device_id == LSM6DSV16X_WHO_AM_I_VAL)
        {
            LOG_INF("✅ Device ID verified: 0x%02x (LSM6DSV16X)", device_id);
        }
        else
        {
            LOG_WRN("⚠️  Unexpected device ID: 0x%02x (expected 0x%02x)", 
                    device_id, LSM6DSV16X_WHO_AM_I_VAL);
        }
    }

    // Step 3: Get device from device tree | 从设备树获取设备
    LOG_INF("🔍 Step 2: Initializing sensor driver...");
    lsm6dsv16x_dev = DEVICE_DT_GET_ONE(st_lsm6dsv16x);
    LOG_INF("   Device pointer: %p", lsm6dsv16x_dev);
    LOG_INF("   Device name: %s", lsm6dsv16x_dev->name);

    // Wait a bit for I2C bus and driver to stabilize | 等待I2C总线和驱动稳定
    k_msleep(100);

    // Step 4: Check if device is ready | 检查设备是否就绪
    bool is_ready = device_is_ready(lsm6dsv16x_dev);
    if (!is_ready)
    {
        LOG_ERR("❌ LSM6DSV16X device not ready - driver initialization failed");
        // Set GPIO to LOW before returning | 返回前设置GPIO为低电平
        if (gpio_raised)
        {
            imu_init_gpio_set(false);
        }
        return -ENODEV;
    }

    LOG_INF("✅ LSM6DSV16X sensor driver initialized successfully");

    // Step 5: Configure default settings | 配置默认设置
    LOG_INF("🔍 Step 3: Configuring default settings...");
    
    // Set default sampling frequency to 104 Hz | 设置默认采样频率为104 Hz
    ret = lsm6dsv16x_set_accel_odr(104);
    if (ret == 0)
    {
        LOG_INF("✅ Accelerometer ODR set to 104 Hz");
    }
    else
    {
        LOG_WRN("⚠️  Failed to set accelerometer ODR: %d", ret);
    }
    // set default sampling frequency to 104 Hz | 设置默认采样频率为104 Hz
    ret = lsm6dsv16x_set_gyro_odr(104);
    if (ret == 0)
    {
        LOG_INF("✅ Gyroscope ODR set to 104 Hz");
    }
    else
    {
        LOG_WRN("⚠️  Failed to set gyroscope ODR: %d", ret);
    }

    LOG_INF("========================================");
    LOG_INF("✅ LSM6DSV16X initialization complete");
    LOG_INF("========================================");

    // Set GPIO to LOW at the end of successful initialization | 成功初始化结束时设置GPIO为低电平
    if (gpio_raised)
    {
        imu_init_gpio_set(false);
    }

    return 0;
#else
    LOG_ERR("❌ LSM6DSV16X device not found in device tree");
    LOG_ERR("   Please check device tree overlay configuration");
    return -ENODEV;
#endif
}

/**
 * @brief Check if sensor is ready | 检查传感器是否就绪
 */
bool lsm6dsv16x_is_ready(void)
{
    if (lsm6dsv16x_dev == NULL)
    {
        return false;
    }
    return device_is_ready(lsm6dsv16x_dev);
}

/**
 * @brief Read accelerometer data | 读取加速度计数据
 */
int lsm6dsv16x_read_accel(float* accel_x, float* accel_y, float* accel_z)
{
    struct sensor_value accel[3];
    int ret;

    if (lsm6dsv16x_dev == NULL || !device_is_ready(lsm6dsv16x_dev))
    {
        LOG_ERR("LSM6DSV16X device not initialized");
        return -ENODEV;
    }

    if (accel_x == NULL || accel_y == NULL || accel_z == NULL)
    {
        return -EINVAL;
    }

    // Fetch sensor sample | 获取传感器采样
    ret = sensor_sample_fetch_chan(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_XYZ);
    if (ret != 0)
    {
        LOG_ERR("Failed to fetch accelerometer data: %d", ret);
        return ret;
    }

    // Read accelerometer channels | 读取加速度计通道
    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_X, &accel[0]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read accel X: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_Y, &accel[1]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read accel Y: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_Z, &accel[2]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read accel Z: %d", ret);
        return ret;
    }

    // Convert to float (m/s²) | 转换为浮点数（m/s²）
    *accel_x = sensor_value_to_double(&accel[0]);
    *accel_y = sensor_value_to_double(&accel[1]);
    *accel_z = sensor_value_to_double(&accel[2]);

    LOG_DBG("Accel: X=%.2f, Y=%.2f, Z=%.2f m/s²", (double)*accel_x, (double)*accel_y, (double)*accel_z);

    return 0;
}

/**
 * @brief Read gyroscope data | 读取陀螺仪数据
 */
int lsm6dsv16x_read_gyro(float* gyro_x, float* gyro_y, float* gyro_z)
{
    struct sensor_value gyro[3];
    int                 ret;

    if (lsm6dsv16x_dev == NULL || !device_is_ready(lsm6dsv16x_dev))
    {
        LOG_ERR("LSM6DSV16X device not initialized");
        return -ENODEV;
    }

    if (gyro_x == NULL || gyro_y == NULL || gyro_z == NULL)
    {
        return -EINVAL;
    }

    // Fetch sensor sample | 获取传感器采样
    ret = sensor_sample_fetch_chan(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_XYZ);
    if (ret != 0)
    {
        LOG_ERR("Failed to fetch gyroscope data: %d", ret);
        return ret;
    }

    // Read gyroscope channels | 读取陀螺仪通道
    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_X, &gyro[0]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read gyro X: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_Y, &gyro[1]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read gyro Y: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_Z, &gyro[2]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read gyro Z: %d", ret);
        return ret;
    }

    // Convert to float (dps) | 转换为浮点数（度/秒）
    *gyro_x = sensor_value_to_double(&gyro[0]);
    *gyro_y = sensor_value_to_double(&gyro[1]);
    *gyro_z = sensor_value_to_double(&gyro[2]);

    LOG_DBG("Gyro: X=%.2f, Y=%.2f, Z=%.2f dps", (double)*gyro_x, (double)*gyro_y, (double)*gyro_z);

    return 0;
}

/**
 * @brief Read both accelerometer and gyroscope data | 同时读取加速度计和陀螺仪数据
 * @note This function fetches data once and reads both channels to avoid duplicate fetches
 * @note 此函数只获取一次数据并读取两个通道，避免重复获取
 */
int lsm6dsv16x_read_all(float* accel_x, float* accel_y, float* accel_z, float* gyro_x, float* gyro_y, float* gyro_z)
{
    struct sensor_value accel[3];
    struct sensor_value gyro[3];
    int ret;

    if (lsm6dsv16x_dev == NULL)
    {
        LOG_ERR("LSM6DSV16X device pointer is NULL");
        return -ENODEV;
    }

    if (!device_is_ready(lsm6dsv16x_dev))
    {
        LOG_ERR("LSM6DSV16X device not ready");
        return -ENODEV;
    }

    if (accel_x == NULL || accel_y == NULL || accel_z == NULL ||
        gyro_x == NULL || gyro_y == NULL || gyro_z == NULL)
    {
        return -EINVAL;
    }

    // Fetch all sensor data at once | 一次性获取所有传感器数据
    ret = sensor_sample_fetch(lsm6dsv16x_dev);
    if (ret != 0)
    {
        LOG_ERR("Failed to fetch sensor data: %d", ret);
        return ret;
    }

    // Read accelerometer channels directly (without re-fetching) | 直接读取加速度计通道（不重新获取）
    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_X, &accel[0]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read accel X: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_Y, &accel[1]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read accel Y: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_Z, &accel[2]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read accel Z: %d", ret);
        return ret;
    }

    // Read gyroscope channels directly (without re-fetching) | 直接读取陀螺仪通道（不重新获取）
    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_X, &gyro[0]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read gyro X: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_Y, &gyro[1]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read gyro Y: %d", ret);
        return ret;
    }

    ret = sensor_channel_get(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_Z, &gyro[2]);
    if (ret != 0)
    {
        LOG_ERR("Failed to read gyro Z: %d", ret);
        return ret;
    }

    // Convert to float | 转换为浮点数
    *accel_x = sensor_value_to_double(&accel[0]);
    *accel_y = sensor_value_to_double(&accel[1]);
    *accel_z = sensor_value_to_double(&accel[2]);

    *gyro_x = sensor_value_to_double(&gyro[0]);
    *gyro_y = sensor_value_to_double(&gyro[1]);
    *gyro_z = sensor_value_to_double(&gyro[2]);

    LOG_DBG("Accel: X=%.2f, Y=%.2f, Z=%.2f m/s² | Gyro: X=%.2f, Y=%.2f, Z=%.2f dps",
            (double)*accel_x, (double)*accel_y, (double)*accel_z,
            (double)*gyro_x, (double)*gyro_y, (double)*gyro_z);

    return 0;
}

/**
 * @brief Set accelerometer sampling frequency | 设置加速度计采样频率
 * @param freq_hz 采样频率（单位：赫兹） | Sampling frequency (in Hz)
 */
int lsm6dsv16x_set_accel_odr(uint16_t freq_hz)
{
    struct sensor_value odr;
    int                 ret;

    if (lsm6dsv16x_dev == NULL || !device_is_ready(lsm6dsv16x_dev))
    {
        LOG_ERR("LSM6DSV16X device not initialized");
        return -ENODEV;
    }

    odr.val1 = freq_hz;
    odr.val2 = 0;

    ret = sensor_attr_set(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_XYZ, SENSOR_ATTR_SAMPLING_FREQUENCY, &odr);
    if (ret != 0)
    {
        LOG_ERR("Failed to set accelerometer ODR: %d", ret);
        return ret;
    }

    LOG_INF("Accelerometer ODR set to %d Hz", freq_hz);
    return 0;
}

/**
 * @brief Set gyroscope sampling frequency | 设置陀螺仪采样频率
 */
int lsm6dsv16x_set_gyro_odr(uint16_t freq_hz)
{
    struct sensor_value odr;
    int                 ret;

    if (lsm6dsv16x_dev == NULL || !device_is_ready(lsm6dsv16x_dev))
    {
        LOG_ERR("LSM6DSV16X device not initialized");
        return -ENODEV;
    }

    odr.val1 = freq_hz;
    odr.val2 = 0;

    ret = sensor_attr_set(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_XYZ, SENSOR_ATTR_SAMPLING_FREQUENCY, &odr);
    if (ret != 0)
    {
        LOG_ERR("Failed to set gyroscope ODR: %d", ret);
        return ret;
    }

    LOG_INF("Gyroscope ODR set to %d Hz", freq_hz);
    return 0;
}

/**
 * @brief Set accelerometer full scale range | 设置加速度计量程
 */
int lsm6dsv16x_set_accel_range(uint8_t range_g)
{
    struct sensor_value range;
    int                 ret;

    if (lsm6dsv16x_dev == NULL || !device_is_ready(lsm6dsv16x_dev))
    {
        LOG_ERR("LSM6DSV16X device not initialized");
        return -ENODEV;
    }

    // Convert g to m/s² | 将g转换为m/s²
    range.val1 = range_g * 9.80665f;
    range.val2 = 0;

    ret = sensor_attr_set(lsm6dsv16x_dev, SENSOR_CHAN_ACCEL_XYZ, SENSOR_ATTR_FULL_SCALE, &range);
    if (ret != 0)
    {
        LOG_ERR("Failed to set accelerometer range: %d", ret);
        return ret;
    }

    LOG_INF("Accelerometer range set to ±%d g", range_g);
    return 0;
}

/**
 * @brief Set gyroscope full scale range | 设置陀螺仪量程
 */
int lsm6dsv16x_set_gyro_range(uint16_t range_dps)
{
    struct sensor_value range;
    int                 ret;

    if (lsm6dsv16x_dev == NULL || !device_is_ready(lsm6dsv16x_dev))
    {
        LOG_ERR("LSM6DSV16X device not initialized");
        return -ENODEV;
    }

    range.val1 = range_dps;
    range.val2 = 0;

    ret = sensor_attr_set(lsm6dsv16x_dev, SENSOR_CHAN_GYRO_XYZ, SENSOR_ATTR_FULL_SCALE, &range);
    if (ret != 0)
    {
        LOG_ERR("Failed to set gyroscope range: %d", ret);
        return ret;
    }

    LOG_INF("Gyroscope range set to ±%d dps", range_dps);
    return 0;
}

/**
 * @brief Read device ID (WHO_AM_I register) | 读取器件ID（WHO_AM_I寄存器）
 */
int lsm6dsv16x_read_device_id(uint8_t* device_id)
{
    uint8_t reg = LSM6DSV16X_REG_WHO_AM_I;
    int     ret;

    LOG_INF("========================================");
    LOG_INF("🔍 lsm6dsv16x_read_device_id() called");
    LOG_INF("========================================");

    if (device_id == NULL)
    {
        LOG_ERR("device_id pointer is NULL");
        return -EINVAL;
    }

    LOG_INF("🔍 Attempting to read LSM6DSV16X device ID...");

    // Get I2C bus device | 获取I2C总线设备
    if (i2c_bus == NULL)
    {
        LOG_INF("Getting I2C bus device from device tree...");
        i2c_bus = DEVICE_DT_GET(DT_BUS(LSM6DSV16X_NODE));
        if (i2c_bus == NULL)
        {
            LOG_ERR("❌ Failed to get I2C bus device from device tree");
            LOG_ERR("   Check device tree configuration for LSM6DSV16X node");
            return -ENODEV;
        }
        LOG_INF("I2C bus device obtained: %s", i2c_bus->name);
    }
    else
    {
        LOG_INF("Using existing I2C bus device: %s", i2c_bus->name);
    }

    if (!device_is_ready(i2c_bus))
    {
        LOG_ERR("❌ I2C bus device not ready: %s", i2c_bus->name);
        LOG_ERR("   I2C bus may not be initialized yet");
        return -ENODEV;
    }

    LOG_INF("✅ I2C bus ready: %s", i2c_bus->name);

    // Try first I2C address | 尝试第一个I2C地址
    LOG_INF("Trying I2C address 0x%02x...", LSM6DSV16X_I2C_ADDR_0);
    ret = i2c_write_read(i2c_bus, LSM6DSV16X_I2C_ADDR_0, &reg, 1, device_id, 1);
    if (ret == 0)
    {
        LOG_INF("✅ Device ID read from 0x%02x: 0x%02x (expected: 0x%02x)", LSM6DSV16X_I2C_ADDR_0, *device_id,
                LSM6DSV16X_WHO_AM_I_VAL);
        if (*device_id == LSM6DSV16X_WHO_AM_I_VAL)
        {
            LOG_INF("✅ LSM6DSV16X detected at I2C address 0x%02x", LSM6DSV16X_I2C_ADDR_0);
            return 0;  // Success, return immediately | 成功，立即返回
        }
        else
        {
            LOG_WRN("⚠️  Unexpected device ID: 0x%02x (expected 0x%02x)", *device_id, LSM6DSV16X_WHO_AM_I_VAL);
            // Continue to try second address | 继续尝试第二个地址
        }
    }
    else
    {
        LOG_DBG("I2C read failed at 0x%02x: %d", LSM6DSV16X_I2C_ADDR_0, ret);
    }

    // Try second I2C address only if first failed | 仅在第一个失败时尝试第二个地址
    LOG_INF("Trying I2C address 0x%02x...", LSM6DSV16X_I2C_ADDR_1);
    ret = i2c_write_read(i2c_bus, LSM6DSV16X_I2C_ADDR_1, &reg, 1, device_id, 1);
    if (ret == 0)
    {
        LOG_INF("✅ Device ID read from 0x%02x: 0x%02x (expected: 0x%02x)", LSM6DSV16X_I2C_ADDR_1, *device_id,
                LSM6DSV16X_WHO_AM_I_VAL);
        if (*device_id == LSM6DSV16X_WHO_AM_I_VAL)
        {
            LOG_INF("✅ LSM6DSV16X detected at I2C address 0x%02x", LSM6DSV16X_I2C_ADDR_1);
            return 0;  // Success | 成功
        }
        else
        {
            LOG_WRN("⚠️  Unexpected device ID: 0x%02x (expected 0x%02x)", *device_id, LSM6DSV16X_WHO_AM_I_VAL);
        }
    }
    else
    {
        LOG_DBG("I2C read failed at 0x%02x: %d", LSM6DSV16X_I2C_ADDR_1, ret);
    }
    
    return ret;  // Return last error | 返回最后的错误
}


/**
 * @brief Get sensor device pointer | 获取传感器设备指针
 */
const struct device* lsm6dsv16x_get_device(void)
{
    return lsm6dsv16x_dev;
}
