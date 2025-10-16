/*
 * @Author       : Cole
 * @Date         : 2025-10-15 16:03:00
 * @LastEditTime : 2025-10-16 20:29:00
 * @FilePath     : opt3006.c
 * @Description  : 
 * 
 *  Copyright (c) MentraOS Contributors 2025 
 *  SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/device.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/logging/log.h>
#include <zephyr/kernel.h>

#include "opt3006.h"

LOG_MODULE_REGISTER(opt3006, LOG_LEVEL_INF);


#define I2C_NODE DT_ALIAS(myals)

// Global I2C device pointer | 全局I2C设备指针
static const struct device* i2c_dev = NULL;

// Read 16-bit register from OPT3006 | 从OPT3006读取16位寄存器
// Parameters | 参数:
//   reg - register address | 寄存器地址
//   value - pointer to store read value | 存储读取值的指针
// Returns | 返回值:
//   0 on success, negative error code on failure | 成功返回0, 失败返回负数错误码
int opt3006_read_reg(uint8_t reg, uint16_t* value)
{
    uint8_t data[2];
    int ret;

    if (value == NULL)
    {
        return -EINVAL;
    }

    // Write register address then read 2 bytes | 写入寄存器地址然后读取2字节
    ret = i2c_write_read(i2c_dev, OPT3006_I2C_ADDR, &reg, 1, data, 2);
    if (ret != 0)
    {
        LOG_ERR("Failed to read register 0x%02x: %d", reg, ret);
        return ret;
    }

    // Combine MSB and LSB (big-endian format) | 组合MSB和LSB(大端格式)
    *value = (data[0] << 8) | data[1];
    LOG_DBG("Read reg 0x%02x = 0x%04x", reg, *value);

    return 0;
}

// Write 16-bit register to OPT3006 | 向OPT3006写入16位寄存器
// Parameters | 参数:
//   reg - register address | 寄存器地址
//   value - value to write | 要写入的值
// Returns | 返回值:
//   0 on success, negative error code on failure | 成功返回0, 失败返回负数错误码
int opt3006_write_reg(uint8_t reg, uint16_t value)
{
    uint8_t data[3];
    int ret;

    // Prepare data: register address + MSB + LSB | 准备数据: 寄存器地址 + MSB + LSB
    data[0] = reg;
    data[1] = (value >> 8) & 0xFF;
    data[2] = value & 0xFF;

    // Write data to I2C device | 向I2C设备写入数据
    ret = i2c_write(i2c_dev, data, 3, OPT3006_I2C_ADDR);
    if (ret != 0)
    {
        LOG_ERR("Failed to write register 0x%02x: %d", reg, ret);
        return ret;
    }

    LOG_DBG("Write reg 0x%02x = 0x%04x", reg, value);
    return 0;
}

// Update specific bits in a register (internal helper) | 更新寄存器中的特定位（内部辅助函数）
// Parameters | 参数:
//   reg - register address | 寄存器地址
//   mask - bit mask for fields to update | 要更新字段的位掩码
//   value - new value for masked bits | 被掩码位的新值
// Returns | 返回值:
//   0 on success, negative error code on failure | 成功返回0, 失败返回负数错误码
static int opt3006_update_reg(uint8_t reg, uint16_t mask, uint16_t value)
{
    uint16_t old_val;
    uint16_t new_val;
    int ret;

    // Read current register value | 读取当前寄存器值
    ret = opt3006_read_reg(reg, &old_val);
    if (ret != 0)
    {
        return ret;
    }

    // Calculate new value: clear masked bits, then set new value
    // 计算新值: 清除被掩码的位, 然后设置新值
    new_val = (old_val & ~mask) | (value & mask);

    // Only write if value changed | 仅在值改变时写入
    if (new_val != old_val)
    {
        ret = opt3006_write_reg(reg, new_val);
        if (ret != 0)
        {
            return ret;
        }
        LOG_DBG("Updated reg 0x%02x: 0x%04x -> 0x%04x", reg, old_val, new_val);
    }

    return 0;
}

// Verify device identification | 验证设备识别
// Returns | 返回值:
//   0 on success, negative error code on failure | 成功返回0, 失败返回负数错误码
static int Opt3006VerifyDevice(void)
{
    uint16_t value;
    int ret;

    // Check manufacturer ID | 检查制造商ID
    ret = opt3006_read_reg(OPT3006_REG_MANUFACTURER_ID, &value);
    if (ret != 0)
    {
        LOG_ERR("Failed to read manufacturer ID");
        return ret;
    }

    if (value != OPT3006_MANUFACTURER_ID)
    {
        LOG_ERR("Invalid manufacturer ID: 0x%04x (expected 0x%04x)", 
                value, OPT3006_MANUFACTURER_ID);
        return -ENOTSUP;
    }

    LOG_INF("Manufacturer ID verified: 0x%04x", value);

    // Check device ID | 检查设备ID
    ret = opt3006_read_reg(OPT3006_REG_DEVICE_ID, &value);
    if (ret != 0)
    {
        LOG_ERR("Failed to read device ID");
        return ret;
    }

    if (value != OPT3006_DEVICE_ID)
    {
        LOG_ERR("Invalid device ID: 0x%04x (expected 0x%04x)", 
                value, OPT3006_DEVICE_ID);
        return -ENOTSUP;
    }

    LOG_INF("Device ID verified: 0x%04x (OPT3001)", value);
    return 0;
}

// Check device ID - public function | 检查设备ID
int opt3006_check_id(void)
{
    return Opt3006VerifyDevice();
}

// Initialize OPT3006 sensor | 初始化OPT3006传感器
int opt3006_init(void)
{
    int ret;
    // Get I2C device binding | 获取I2C设备绑定
    i2c_dev = device_get_binding(DT_NODE_FULL_NAME(I2C_NODE));
    if (!i2c_dev)
    {
        LOG_ERR("I2C Device driver not found");
        return -ENODEV;
    }

    // Configure I2C | 配置I2C
    uint32_t i2c_cfg = I2C_SPEED_SET(I2C_SPEED_STANDARD) | I2C_MODE_CONTROLLER;
    ret = i2c_configure(i2c_dev, i2c_cfg);
    if (ret != 0)
    {
        LOG_ERR("I2C config failed: %d", ret);
        return ret;
    }

    LOG_INF("I2C device configured successfully");
    LOG_INF("OPT3006 I2C address: 0x%02x", OPT3006_I2C_ADDR);

    // Check device ID | 检查设备ID
    ret = opt3006_check_id();
    if (ret != 0)
    {
        LOG_ERR("OPT3006 check id failed");
        return ret;
    }

    // Configure settings: continuous mode, 800ms conversion time, auto range
    // 配置设置: 连续模式, 800ms转换时间, 自动量程
    uint16_t config = 0;
    config |= (OPT3006_RN_AUTO << OPT3006_CONFIG_RN_SHIFT);      
    config |= (OPT3006_CT_800MS << OPT3006_CONFIG_CT_BIT);        
    config |= (OPT3006_MODE_CONTINUOUS << OPT3006_CONFIG_M_SHIFT);
    config |= (1 << OPT3006_CONFIG_L_BIT);                        

    // Log the calculated configuration value | 记录计算的配置值
    LOG_INF("📝 Calculated config value: 0x%04x", config);
    LOG_INF("   RN=0x%X(bit15:12), CT=%d(bit11), M=0x%X(bit10:9), L=1(bit4)",
            OPT3006_RN_AUTO, OPT3006_CT_800MS, OPT3006_MODE_CONTINUOUS);

    ret = opt3006_write_reg(OPT3006_REG_CONFIG, config);
    if (ret != 0)
    {
        LOG_ERR("Failed to configure sensor");
        return ret;
    }

    // Read back and verify | 回读验证
    uint16_t read_back;
    ret = opt3006_read_reg(OPT3006_REG_CONFIG, &read_back);
    if (ret == 0)
    {
        LOG_INF("📖 Config read back: 0x%04x", read_back);
        
        // Parse configuration bits | 解析配置位
        uint8_t rn = (read_back >> OPT3006_CONFIG_RN_SHIFT) & 0x0F;     // Bits 15:12
        uint8_t ct = (read_back >> OPT3006_CONFIG_CT_BIT) & 0x01;       // Bit 11
        uint8_t mode = (read_back >> OPT3006_CONFIG_M_SHIFT) & 0x03;    // Bits 10:9
        uint8_t ovf = (read_back >> OPT3006_CONFIG_OVF_BIT) & 0x01;     // Bit 8
        uint8_t crf = (read_back >> OPT3006_CONFIG_CRF_BIT) & 0x01;     // Bit 7
        uint8_t latch = (read_back >> OPT3006_CONFIG_L_BIT) & 0x01;     // Bit 4
        
        LOG_INF("   RN (Range,15:12): 0x%X (%s)", rn, rn == 0x0C ? "AUTO" : "Manual");
        LOG_INF("   CT (ConvTime,11): %d (%s)", ct, ct == 0 ? "100ms" : "800ms");
        LOG_INF("   M (Mode,10:9): %d (%s)", mode,
                mode == 0 ? "Shutdown" :
                mode == 1 ? "Single-shot" :
                mode >= 2 ? "Continuous" : "?");
        LOG_INF("   OVF,CRF,L: %d,%d,%d", ovf, crf, latch);
        
        if (read_back != config)
        {
            LOG_WRN("⚠️ Config mismatch! Written: 0x%04x, Read: 0x%04x", 
                    config, read_back);
            LOG_WRN("   Difference: 0x%04x", config ^ read_back);
        }
        else
        {
            LOG_INF("✅ Config verified successfully");
        }
    }

    LOG_INF("OPT3006 initialized successfully (continuous mode, 800ms)");
    return 0;
}


int opt3006_read_lux_ex(float* lux, uint16_t* raw_result, uint8_t* exponent, uint16_t* mantissa)
{
    uint16_t result;
    uint8_t exp;
    uint16_t mant;
    int ret;

    if (lux == NULL)
    {
        return -EINVAL;
    }

    // Read result register (only once!) | 读取结果寄存器（只读一次！）
    ret = opt3006_read_reg(OPT3006_REG_RESULT, &result);
    if (ret != 0)
    {
        return ret;
    }

    // Parse result: extract exponent (bits 15:12) and mantissa (bits 11:0)
    // 解析结果: 提取指数(位15:12)和尾数(位11:0)
    exp = (result >> OPT3006_EXPONENT_SHIFT) & 0x0F;
    mant = result & OPT3006_MANTISSA_MASK;

    // Calculate lux value using formula: lux = 0.01 × 2^E × M
    // 使用公式计算照度值: 照度 = 0.01 × 2^E × M
    *lux = OPT3006_LUX_SCALE * (1UL << exp) * mant;

    // Optional: return raw data for debugging | 可选：返回原始数据用于调试
    if (raw_result != NULL)
    {
        *raw_result = result;
    }
    if (exponent != NULL)
    {
        *exponent = exp;
    }
    if (mantissa != NULL)
    {
        *mantissa = mant;
    }

    return 0;
}

// Read illuminance value from sensor (simple version) | 从传感器读取照度值（简化版本）
// 只返回照度值，适合一般使用
int opt3006_read_lux(float* lux)
{
    // Call extended version without requesting raw data
    // 调用扩展版本，不请求原始数据
    return opt3006_read_lux_ex(lux, NULL, NULL, NULL);
}

// Set conversion mode | 设置转换模式
int opt3006_set_mode(uint8_t mode)
{
    if (mode > OPT3006_MODE_CONTINUOUS)
    {
        LOG_ERR("Invalid mode: 0x%02x", mode);
        return -EINVAL;
    }

    return opt3006_update_reg(OPT3006_REG_CONFIG, 
                              OPT3006_CONFIG_M_MASK,
                              mode << OPT3006_CONFIG_M_SHIFT);
}

// Set conversion time | 设置转换时间
int opt3006_set_conversion_time(uint8_t ct)
{
    if (ct > 1)
    {
        LOG_ERR("Invalid conversion time: %d (must be 0 or 1)", ct);
        return -EINVAL;
    }

    // CT is a single bit (bit 11): 0=100ms, 1=800ms
    // CT是单个位(位11): 0=100ms, 1=800ms
    return opt3006_update_reg(OPT3006_REG_CONFIG,
                              OPT3006_CONFIG_CT_MASK,
                              ct << OPT3006_CONFIG_CT_BIT);
}

// Start single-shot conversion | 启动单次转换
int opt3006_start_conversion(void)
{
    return opt3006_set_mode(OPT3006_MODE_SINGLE_SHOT);
}

// Check if conversion is ready | 检查转换是否就绪
bool opt3006_is_ready(void)
{
    uint16_t config;
    int ret;

    ret = opt3006_read_reg(OPT3006_REG_CONFIG, &config);
    if (ret != 0)
    {
        return false;
    }

    // Check Conversion Ready Flag (CRF) bit | 检查转换就绪标志(CRF)位
    return !!(config & OPT3006_CONFIG_CRF_MASK);
}

// Get current configuration | 获取当前配置
int opt3006_get_config(uint16_t* config)
{
    if (config == NULL)
    {
        return -EINVAL;
    }

    return opt3006_read_reg(OPT3006_REG_CONFIG, config);
}

// Set range number | 设置量程编号
int opt3006_set_range(uint8_t rn)
{
    if (rn > 0x0C)
    {
        LOG_ERR("Invalid range number: 0x%02x", rn);
        return -EINVAL;
    }

    return opt3006_update_reg(OPT3006_REG_CONFIG,
                              OPT3006_CONFIG_RN_MASK,
                              rn << OPT3006_CONFIG_RN_SHIFT);
}

int opt3006_initialize(void)
{
    uint16_t config;
    int ret;
    ret = opt3006_init();
    if (ret != 0)
    {
        LOG_ERR("✗ Initialization failed: %d", ret);
    }
    else
    {
        LOG_INF("✓ Initialization successful");
    }
    k_sleep(K_MSEC(100));
    ret = opt3006_get_config(&config);
    if (ret != 0)
    {
        LOG_ERR("✗ Failed to read config: %d", ret);
    }
    else
    {
        LOG_INF("✓ Config read: 0x%04x", config);
        LOG_INF("  Mode: %d, CT: %d, RN: 0x%X",
                (config >> OPT3006_CONFIG_M_SHIFT) & 0x03,
                (config >> OPT3006_CONFIG_CT_BIT) & 0x01,
                (config >> OPT3006_CONFIG_RN_SHIFT) & 0x0F);
    }
    k_sleep(K_MSEC(100));
    ret = opt3006_set_mode(OPT3006_MODE_CONTINUOUS);
    if (ret != 0)
    {
        LOG_ERR("✗ Failed to set continuous mode: %d", ret);
        return ret;
    }

    ret = opt3006_set_conversion_time(OPT3006_CT_100MS);
    if (ret != 0)
    {
        LOG_ERR("✗ Failed to set conversion time: %d", ret);
        return ret;
    }

    // Wait for first conversion | 等待第一次转换完成
    k_sleep(K_MSEC(OPT3006_CONVERSION_100MS));
}