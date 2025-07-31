#ifndef BSPAL_JSA_1147_H
#define BSPAL_JSA_1147_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSPAL JSA-1147 Platform Abstraction Layer declarations
 * JSA-1147 is typically an audio component/driver
 */

/* JSA-1147 configuration structure */
typedef struct {
    uint32_t sample_rate;
    uint8_t channels;
    uint8_t bit_depth;
    bool enable_interrupt;
    bool enable_dma;
} bspal_jsa_1147_config_t;

/* JSA-1147 audio data structure */
typedef struct {
    uint8_t *data;
    uint32_t length;
    uint32_t timestamp;
    uint8_t format;
} bspal_jsa_1147_audio_data_t;

/* JSA-1147 handle type */
typedef void* bspal_jsa_1147_handle_t;

/* JSA-1147 callback function type */
typedef void (*bspal_jsa_1147_callback_t)(uint8_t event, const bspal_jsa_1147_audio_data_t *data);

/**
 * @brief Initialize the JSA-1147 component
 * @return 0 on success, negative on error
 */
int bspal_jsa_1147_init(void);

/**
 * @brief Start JSA-1147 operation
 * @param handle JSA-1147 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_start(bspal_jsa_1147_handle_t handle);

/**
 * @brief Stop JSA-1147 operation
 * @param handle JSA-1147 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_stop(bspal_jsa_1147_handle_t handle);

/**
 * @brief Read audio data from JSA-1147
 * @param handle JSA-1147 handle
 * @param buffer Buffer to store audio data
 * @param length Buffer length
 * @return Number of bytes read, or negative error code
 */
int bspal_jsa_1147_read(bspal_jsa_1147_handle_t handle, uint8_t *buffer, uint32_t length);

/**
 * @brief Write audio data to JSA-1147
 * @param handle JSA-1147 handle
 * @param data Audio data to write
 * @param length Data length
 * @return Number of bytes written, or negative error code
 */
int bspal_jsa_1147_write(bspal_jsa_1147_handle_t handle, const uint8_t *data, uint32_t length);

/**
 * @brief Set JSA-1147 callback function
 * @param handle JSA-1147 handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_set_callback(bspal_jsa_1147_handle_t handle, bspal_jsa_1147_callback_t callback);

/**
 * @brief Set audio parameters
 * @param handle JSA-1147 handle
 * @param sample_rate Sample rate in Hz
 * @param channels Number of channels
 * @param bit_depth Bit depth
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_set_audio_params(bspal_jsa_1147_handle_t handle, uint32_t sample_rate, uint8_t channels, uint8_t bit_depth);

/**
 * @brief Set volume level
 * @param handle JSA-1147 handle
 * @param volume Volume level (0-100)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_set_volume(bspal_jsa_1147_handle_t handle, uint8_t volume);

/**
 * @brief Get volume level
 * @param handle JSA-1147 handle
 * @param volume Output volume level
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_get_volume(bspal_jsa_1147_handle_t handle, uint8_t *volume);

/**
 * @brief Enter low power mode
 * @param handle JSA-1147 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_enter_low_power(bspal_jsa_1147_handle_t handle);

/**
 * @brief Exit low power mode
 * @param handle JSA-1147 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_exit_low_power(bspal_jsa_1147_handle_t handle);

/**
 * @brief Deinitialize JSA-1147 driver
 * @param handle JSA-1147 handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bspal_jsa_1147_deinit(bspal_jsa_1147_handle_t handle);

/**
 * @brief Enable JSA-1147 interrupt 1 ISR
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int jsa_1147_int1_isr_enable(void);

/**
 * @brief Read JSA-1147 interrupt flag register
 * @return Flag value, negative on error
 */
int read_jsa_1147_int_flag(void);

/**
 * @brief Write JSA-1147 interrupt flag register
 * @param flag Flag value to write
 * @return 0 on success, negative on error
 */
int write_jsa_1147_int_flag(uint8_t flag);

#ifdef __cplusplus
}
#endif

#endif /* BSPAL_JSA_1147_H */
