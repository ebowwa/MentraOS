#ifndef BSP_JSA_1147_H
#define BSP_JSA_1147_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif/**
 * @brief Reset JSA-1147 component
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwiseef BSP JSA-1147 audio component driver declarations
 */

/* JSA-1147 Register Definitions */
#define REG_ALS_DATA_L      0x20    // ALS数据寄存器
#define REG_ALS_DATA_M      0x21    // ALS数据寄存器
#define REG_ALS_DATA_H      0x22    // ALS数据寄存器
#define REG_INT_FLAG        0x0B    // 中断标志寄存器
#define REG_INTE_TIME       0x0A    // 积分时间寄存器
#define REG_ALS_CLR_GAIN    0x0F    // ALS增益寄存器
#define REG_ALS_COEF        0x10    // ALS系数寄存器
#define REG_ALS_WIN_LOSS    0x11    // ALS窗口损失寄存器
#define REG_SYSM_CTRL       0x00    // 系统控制寄存器

/* JSA-1147 Gain Definitions */
#define ALS_GAIN_X1         0x00
#define ALS_GAIN_X2         0x01
#define ALS_GAIN_X4         0x02
#define ALS_GAIN_X8         0x03
#define ALS_GAIN_X16        0x04

/* JSA-1147 Constants */
#define STRUCTURE_K         1.0f    // 结构系数

/* JSA-1147 configuration structure */
typedef struct {
    uint32_t sample_rate;
    uint8_t channels;
    uint8_t bit_depth;
    bool enable_interrupt;
} bsp_jsa_1147_config_t;

/* JSA-1147 audio data structure */
typedef struct {
    uint8_t *data;
    uint32_t length;
    uint32_t timestamp;
    uint8_t format;
} bsp_jsa_1147_audio_data_t;

/* JSA-1147 handle type */
typedef void* bsp_jsa_1147_handle_t;

/* JSA-1147 callback function type */
typedef void (*bsp_jsa_1147_callback_t)(uint8_t event, const bsp_jsa_1147_audio_data_t *data);

/**
 * @brief Initialize the JSA-1147 audio component
 * @param config Audio configuration
 * @return Handle to component instance or NULL on error
 */
bsp_jsa_1147_handle_t bsp_jsa_1147_init(const bsp_jsa_1147_config_t *config);

/**
 * @brief Start JSA-1147 audio operation
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_start(bsp_jsa_1147_handle_t handle);

/**
 * @brief Stop JSA-1147 audio operation
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_stop(bsp_jsa_1147_handle_t handle);

/**
 * @brief Read audio data from JSA-1147
 * @param handle Component handle
 * @param buffer Buffer to store data
 * @param length Buffer length
 * @return Number of bytes read, or negative error code
 */
int bsp_jsa_1147_read(bsp_jsa_1147_handle_t handle, uint8_t *buffer, uint32_t length);

/**
 * @brief Write audio data to JSA-1147
 * @param handle Component handle
 * @param data Data to write
 * @param length Data length
 * @return Number of bytes written, or negative error code
 */
int bsp_jsa_1147_write(bsp_jsa_1147_handle_t handle, const uint8_t *data, uint32_t length);

/**
 * @brief Set JSA-1147 callback function
 * @param handle Component handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_set_callback(bsp_jsa_1147_handle_t handle, bsp_jsa_1147_callback_t callback);

/**
 * @brief Set audio parameters
 * @param handle Component handle
 * @param sample_rate Sample rate in Hz
 * @param channels Number of channels
 * @param bit_depth Bit depth
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_set_params(bsp_jsa_1147_handle_t handle, uint32_t sample_rate, uint8_t channels, uint8_t bit_depth);

/**
 * @brief Set volume level
 * @param handle Component handle
 * @param volume Volume level (0-100)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_set_volume(bsp_jsa_1147_handle_t handle, uint8_t volume);

/**
 * @brief Get volume level
 * @param handle Component handle
 * @param volume Output volume level
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_get_volume(bsp_jsa_1147_handle_t handle, uint8_t *volume);

/**
 * @brief I2C register read function
 * @param reg Register address
 * @param data Output data buffer
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int jsa_1147_i2c_read_reg(uint8_t reg, uint8_t *data);

/**
 * @brief I2C register write function
 * @param reg Register address
 * @param data Data to write
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int jsa_1147_i2c_write_reg(uint8_t reg, uint8_t data);

/**
 * @brief Convert ALS count to lux value
 * @param count Raw ALS count
 * @param gain Gain setting
 * @param k_factor Calibration factor
 * @return Calculated lux value
 */
float jsa_1147_count_to_lux(uint32_t count, uint8_t gain, float k_factor);

/**
 * @brief Reset JSA-1147 component
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_reset(bsp_jsa_1147_handle_t handle);

/**
 * @brief Deinitialize JSA-1147
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_jsa_1147_deinit(bsp_jsa_1147_handle_t handle);

/**
 * @brief Test function for JSA-1147
 */
void jsa_1147_test(void);

#ifdef __cplusplus
}
#endif

#endif /* BSP_JSA_1147_H */
