/*
 * Shell LSM6DSV16X Control Module
 * 
 * Manual LSM6DSV16X IMU sensor control commands
 * 
 * Available Commands:
 * - imu help              : Show all IMU commands
 * - imu status            : Show sensor status and information
 * - imu read              : Read sensor data once (accel, gyro)
 * - imu start [interval]  : Start continuous reading (accel, gyro, default: 100ms)
 * - imu stop              : Stop continuous reading
 * - imu config            : Show current configuration (temporarily disabled)
 * - imu accel_odr <hz>    : Set accelerometer ODR (Hz) (temporarily disabled)
 * - imu gyro_odr <hz>     : Set gyroscope ODR (Hz) (temporarily disabled)
 * - imu accel_range <g>   : Set accelerometer range (±2/±4/±8/±16 g) (temporarily disabled)
 * - imu gyro_range <dps>  : Set gyroscope range (±125/±250/±500/±1000/±2000 dps) (temporarily disabled)
 * 
 * Created: 2025-11-20
 * Author: MentraOS Team
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/logging/log.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/init.h>
#include <string.h>
#include <stdlib.h>

#include "lsm6dsv16x.h"

LOG_MODULE_REGISTER(shell_lsm6dsv16x, LOG_LEVEL_INF);

// GPIO control for IMU start/stop
#define USER_NODE DT_PATH(zephyr_user)
#if DT_NODE_EXISTS(USER_NODE) && DT_NODE_HAS_PROP(USER_NODE, imu_ctrl_gpios)
static const struct gpio_dt_spec imu_ctrl_gpio = GPIO_DT_SPEC_GET(USER_NODE, imu_ctrl_gpios);
static bool imu_gpio_initialized = false;

/**
 * Initialize IMU control GPIO | 初始化IMU控制GPIO
 */
static int imu_gpio_init(void)
{
    if (imu_gpio_initialized)
    {
        return 0;  // Already initialized
    }
    
    if (!gpio_is_ready_dt(&imu_ctrl_gpio))
    {
        LOG_ERR("IMU control GPIO port not ready");
        return -ENODEV;
    }
    
    // Configure as output, initial state LOW (inactive) | 配置为输出，初始状态为低电平（非激活）
    int ret = gpio_pin_configure_dt(&imu_ctrl_gpio, GPIO_OUTPUT_INACTIVE);
    if (ret != 0)
    {
        LOG_ERR("Failed to configure IMU control GPIO: %d", ret);
        return ret;
    }
    
    // Explicitly set to LOW to ensure initial state | 显式设置为低电平确保初始状态
    ret = gpio_pin_set_dt(&imu_ctrl_gpio, 0);
    if (ret != 0)
    {
        LOG_ERR("Failed to set IMU control GPIO to LOW: %d", ret);
        return ret;
    }
    
    imu_gpio_initialized = true;
    LOG_INF("IMU control GPIO (P1.05) initialized as output, initial state: LOW");
    return 0;
}

/**
 * Initialize IMU control GPIO at system startup | 系统启动时初始化IMU控制GPIO
 * This ensures GPIO is LOW by default even if imu start is never called
 * 这确保即使从未调用imu start，GPIO也默认为低电平
 */
static int imu_gpio_sys_init(void)
{
    // Initialize GPIO to LOW state at system startup | 系统启动时将GPIO初始化为低电平状态
    imu_gpio_init();
    return 0;
}

// Initialize GPIO at POST_KERNEL stage (after kernel is ready) | 在POST_KERNEL阶段初始化GPIO（内核就绪后）
SYS_INIT(imu_gpio_sys_init, POST_KERNEL, CONFIG_APPLICATION_INIT_PRIORITY);

/**
 * Set IMU control GPIO state | 设置IMU控制GPIO状态
 * @param high true to set high, false to set low | true为高电平，false为低电平
 */
static int imu_gpio_set(bool high)
{
    if (!imu_gpio_initialized)
    {
        int ret = imu_gpio_init();
        if (ret != 0)
        {
            LOG_ERR("IMU GPIO init failed: %d", ret);
            return ret;
        }
    }
    
    int ret = gpio_pin_set_dt(&imu_ctrl_gpio, high ? 1 : 0);
    if (ret != 0)
    {
        LOG_ERR("Failed to set IMU control GPIO to %s: %d", high ? "HIGH" : "LOW", ret);
        return ret;
    }
    
    LOG_INF("IMU control GPIO (P1.05) set to %s", high ? "HIGH" : "LOW");
    return 0;
}
#else
static int imu_gpio_init(void) { return 0; }
static int imu_gpio_set(bool high) { (void)high; return 0; }
#endif

// Continuous reading control
static bool continuous_start_active = false;
static uint32_t start_interval_ms = 100;  // Default: 100ms
static uint32_t start_count = 0;

// Work queue for periodic sensor reading
static struct k_work_delayable start_reading_work;

/**
 * Start reading work handler - reads default data (accel + gyro)
 */
static void start_reading_work_handler(struct k_work *work)
{
    if (!continuous_start_active)
    {
        return;
    }
    
    start_count++;
    
    float accel_x, accel_y, accel_z;
    float gyro_x, gyro_y, gyro_z;
    int ret = lsm6dsv16x_read_all(&accel_x, &accel_y, &accel_z, &gyro_x, &gyro_y, &gyro_z);
    if (ret == 0)
    {
        LOG_INF("📊 LSM6DSV16X [%u] - Accel: X=%.2f, Y=%.2f, Z=%.2f m/s² | "
                "Gyro: X=%.2f, Y=%.2f, Z=%.2f dps",
                start_count,
                (double)accel_x, (double)accel_y, (double)accel_z,
                (double)gyro_x, (double)gyro_y, (double)gyro_z);
    }
    else
    {
        if (start_count % 10 == 0)
        {
            LOG_ERR("Failed to read LSM6DSV16X sensor data (attempt %u): %d", start_count, ret);
        }
    }
    
    if (continuous_start_active)
    {
        k_work_schedule(&start_reading_work, K_MSEC(start_interval_ms));
    }
}


/**
 * IMU help command
 */
static int cmd_imu_help(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "");
    shell_print(shell, "📡 LSM6DSV16X IMU Sensor Commands:");
    shell_print(shell, "");
    shell_print(shell, "📋 Basic Commands:");
    shell_print(shell, "  imu help                     - Show this help menu");
    shell_print(shell, "  imu status                   - Show sensor status and information");
    shell_print(shell, "  imu read                     - Read sensor data once (accel, gyro)");
    shell_print(shell, "");
    shell_print(shell, "🔄 Continuous Reading:");
    shell_print(shell, "  imu start [interval]         - Start continuous reading (accel, gyro)");
    shell_print(shell, "                                 interval: reading interval in ms (default: 100)");
    shell_print(shell, "  imu stop                     - Stop continuous reading");
    shell_print(shell, "");
    // Configuration commands temporarily disabled for testing | 配置命令暂时禁用用于测试
    // shell_print(shell, "⚙️  Configuration Commands:");
    // shell_print(shell, "  imu config                   - Show current configuration");
    // shell_print(shell, "  imu accel_odr <hz>          - Set accelerometer ODR (Hz)");
    // shell_print(shell, "  imu gyro_odr <hz>           - Set gyroscope ODR (Hz)");
    // shell_print(shell, "  imu accel_range <g>          - Set accelerometer range");
    // shell_print(shell, "  imu gyro_range <dps>         - Set gyroscope range");
    shell_print(shell, "");
    shell_print(shell, "📊 Examples:");
    shell_print(shell, "  imu read                     - Quick sensor reading");
    shell_print(shell, "  imu start                    - Start continuous reading every 100ms");
    shell_print(shell, "  imu start 500                - Start continuous reading every 500ms");
    shell_print(shell, "  imu stop                     - Stop continuous reading");
    shell_print(shell, "");
    
    return 0;
}

/**
 * IMU status command
 */
static int cmd_imu_status(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "");
    shell_print(shell, "📡 LSM6DSV16X IMU Sensor Status");
    shell_print(shell, "==========================================");
    shell_print(shell, "Sensor:          LSM6DSV16X");
    shell_print(shell, "Manufacturer:    STMicroelectronics");
    shell_print(shell, "I2C Address:     0x6a (AD0=GND) or 0x6b (AD0=VDD)");
    shell_print(shell, "");
    
    bool is_ready = lsm6dsv16x_is_ready();
    shell_print(shell, "Status:          %s", is_ready ? "✅ Ready" : "❌ Not Ready");
    shell_print(shell, "");
    
    shell_print(shell, "Continuous Reading Status:");
    shell_print(shell, "  Status:         %s", continuous_start_active ? "🟢 Active" : "⚪ Inactive");
    if (continuous_start_active)
    {
        shell_print(shell, "    Interval:      %u ms", start_interval_ms);
        shell_print(shell, "    Count:         %u readings", start_count);
    }
    
    shell_print(shell, "");
    
    // Try to read device ID
    uint8_t device_id = 0;
    int ret = lsm6dsv16x_read_device_id(&device_id);
    if (ret == 0)
    {
        shell_print(shell, "Device ID:       0x%02x %s", device_id, 
                    device_id == 0x70 ? "(✅ LSM6DSV16X)" : "(⚠️  Unexpected)");
    }
    else
    {
        shell_print(shell, "Device ID:       ❌ Read failed (%d)", ret);
    }
    
    shell_print(shell, "==========================================");
    shell_print(shell, "");
    
    return 0;
}

/**
 * IMU read command - read sensor data once
 */
static int cmd_imu_read(const struct shell *shell, size_t argc, char **argv)
{
    float accel_x, accel_y, accel_z;
    float gyro_x, gyro_y, gyro_z;
    int ret;
    
    shell_print(shell, "");
    shell_print(shell, "📊 Reading LSM6DSV16X sensor data...");
    
    ret = lsm6dsv16x_read_all(&accel_x, &accel_y, &accel_z, &gyro_x, &gyro_y, &gyro_z);
    if (ret != 0)
    {
        shell_error(shell, "❌ Failed to read sensor data: %d", ret);
        return ret;
    }
    
    shell_print(shell, "");
    shell_print(shell, "📊 Accelerometer (m/s²):");
    shell_print(shell, "  X: %.2f", (double)accel_x);
    shell_print(shell, "  Y: %.2f", (double)accel_y);
    shell_print(shell, "  Z: %.2f", (double)accel_z);
    shell_print(shell, "");
    
    shell_print(shell, "📊 Gyroscope (dps):");
    shell_print(shell, "  X: %.2f", (double)gyro_x);
    shell_print(shell, "  Y: %.2f", (double)gyro_y);
    shell_print(shell, "  Z: %.2f", (double)gyro_z);
    shell_print(shell, "");
    
    return 0;
}

/**
 * IMU start command - start continuous reading (default data)
 */
static int cmd_imu_start(const struct shell *shell, size_t argc, char **argv)
{
    if (continuous_start_active)
    {
        shell_warn(shell, "⚠️  Continuous start reading is already active");
        shell_print(shell, "   Use 'imu stop' to stop it first");
        return 0;
    }
    
    if (argc > 1)
    {
        start_interval_ms = strtoul(argv[1], NULL, 10);
        if (start_interval_ms == 0 || start_interval_ms > 60000)
        {
            shell_error(shell, "❌ Invalid interval: %s (must be 1-60000 ms)", argv[1]);
            return -EINVAL;
        }
    }
    else
    {
        start_interval_ms = 100;  // Default: 100ms
    }
    
    k_work_init_delayable(&start_reading_work, start_reading_work_handler);
    
    continuous_start_active = true;
    start_count = 0;
    
    // Set GPIO to HIGH when starting | 启动时设置GPIO为高电平
    int gpio_ret = imu_gpio_set(true);
    if (gpio_ret != 0)
    {
        shell_warn(shell, "⚠️  Failed to set GPIO: %d", gpio_ret);
    }
    
    k_work_schedule(&start_reading_work, K_NO_WAIT);
    
    shell_print(shell, "✅ Started continuous reading (interval: %u ms)", start_interval_ms);
    shell_print(shell, "   Use 'imu stop' to stop");
    
    return 0;
}


/**
 * IMU stop command - stop continuous reading
 */
static int cmd_imu_stop(const struct shell *shell, size_t argc, char **argv)
{
    if (continuous_start_active)
    {
        continuous_start_active = false;
        k_work_cancel_delayable(&start_reading_work);
        shell_print(shell, "✅ Stopped continuous reading (total: %u)", start_count);
        
        // Set GPIO to LOW when stopping | 停止时设置GPIO为低电平
        int gpio_ret = imu_gpio_set(false);
        if (gpio_ret != 0)
        {
            shell_warn(shell, "⚠️  Failed to set GPIO LOW: %d", gpio_ret);
        }
        else
        {
            shell_print(shell, "   GPIO P1.05 set to LOW");
        }
    }
    else
    {
        shell_warn(shell, "⚠️  No continuous reading is active");
    }
    
    return 0;
}

/**
 * IMU config command - show current configuration
 * Temporarily disabled for testing | 暂时禁用用于测试
 */
static int cmd_imu_config(const struct shell *shell, size_t argc, char **argv)
{
    shell_warn(shell, "⚠️  Configuration commands are temporarily disabled for testing");
    shell_print(shell, "   This feature will be enabled after testing");
    return 0;
}

/**
 * IMU accel_odr command - set accelerometer ODR
 * Temporarily disabled for testing | 暂时禁用用于测试
 */
static int cmd_imu_accel_odr(const struct shell *shell, size_t argc, char **argv)
{
    shell_warn(shell, "⚠️  Configuration commands are temporarily disabled for testing");
    shell_print(shell, "   This feature will be enabled after testing");
    return 0;
}

/**
 * IMU gyro_odr command - set gyroscope ODR
 * Temporarily disabled for testing | 暂时禁用用于测试
 */
static int cmd_imu_gyro_odr(const struct shell *shell, size_t argc, char **argv)
{
    shell_warn(shell, "⚠️  Configuration commands are temporarily disabled for testing");
    shell_print(shell, "   This feature will be enabled after testing");
    return 0;
}

/**
 * IMU accel_range command - set accelerometer range
 * Temporarily disabled for testing | 暂时禁用用于测试
 */
static int cmd_imu_accel_range(const struct shell *shell, size_t argc, char **argv)
{
    shell_warn(shell, "⚠️  Configuration commands are temporarily disabled for testing");
    shell_print(shell, "   This feature will be enabled after testing");
    return 0;
}

/**
 * IMU gyro_range command - set gyroscope range
 * Temporarily disabled for testing | 暂时禁用用于测试
 */
static int cmd_imu_gyro_range(const struct shell *shell, size_t argc, char **argv)
{
    shell_warn(shell, "⚠️  Configuration commands are temporarily disabled for testing");
    shell_print(shell, "   This feature will be enabled after testing");
    return 0;
}

/* Shell command definitions */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_imu,
    SHELL_CMD(help, NULL, "Show IMU commands help", cmd_imu_help),
    SHELL_CMD(status, NULL, "Show sensor status", cmd_imu_status),
    SHELL_CMD(read, NULL, "Read sensor data once", cmd_imu_read),
    SHELL_CMD_ARG(start, NULL, "Start continuous reading [interval_ms]", cmd_imu_start, 1, 1),
    SHELL_CMD(stop, NULL, "Stop continuous reading", cmd_imu_stop),
    // Configuration commands temporarily disabled for testing | 配置命令暂时禁用用于测试
    // SHELL_CMD(config, NULL, "Show current configuration", cmd_imu_config),
    // SHELL_CMD_ARG(accel_odr, NULL, "Set accelerometer ODR <hz>", cmd_imu_accel_odr, 2, 0),
    // SHELL_CMD_ARG(gyro_odr, NULL, "Set gyroscope ODR <hz>", cmd_imu_gyro_odr, 2, 0),
    // SHELL_CMD_ARG(accel_range, NULL, "Set accelerometer range <g>", cmd_imu_accel_range, 2, 0),
    // SHELL_CMD_ARG(gyro_range, NULL, "Set gyroscope range <dps>", cmd_imu_gyro_range, 2, 0),
    SHELL_SUBCMD_SET_END /* Array terminated. */
);

SHELL_CMD_REGISTER(imu, &sub_imu, "LSM6DSV16X IMU sensor control commands", cmd_imu_help);
