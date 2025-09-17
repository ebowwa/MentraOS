/**
 * @file i2s_simple_loopback.h
 * @brief Simple I2S Audio Loopback using nrfx_i2s directly
 * 
 * Based on MentraOS approach - uses nrfx_i2s directly to avoid Zephyr conflicts
 */

#ifndef I2S_SIMPLE_LOOPBACK_H
#define I2S_SIMPLE_LOOPBACK_H

#include <zephyr/kernel.h>
#include <nrfx_i2s.h>
#include <nrfx_clock.h>

// Audio configuration
#define AUDIO_SAMPLE_RATE       16000
#define AUDIO_BITS_PER_SAMPLE   16
#define AUDIO_CHANNELS          2
#define AUDIO_FRAME_SIZE        512    // Number of samples per frame
#define AUDIO_BUFFER_SIZE       (AUDIO_FRAME_SIZE * AUDIO_CHANNELS * sizeof(int16_t))
#define AUDIO_BUFFER_COUNT      4      // Ping-pong buffering

// I2S pin configuration (nRF5340DK pins)
#define I2S_LRCK_PIN    6    // P1.06
#define I2S_BCLK_PIN    7    // P1.07  
#define I2S_SDOUT_PIN   8    // P1.08
#define I2S_SDIN_PIN    9    // P1.09

/**
 * @brief Initialize I2S loopback system
 * @return 0 on success, negative error code on failure
 */
int i2s_simple_loopback_init(void);

/**
 * @brief Start I2S loopback
 * @return 0 on success, negative error code on failure  
 */
int i2s_simple_loopback_start(void);

/**
 * @brief Stop I2S loopback
 */
void i2s_simple_loopback_stop(void);

/**
 * @brief Check if I2S loopback is running
 * @return true if running, false otherwise
 */
bool i2s_simple_loopback_is_running(void);

#endif /* I2S_SIMPLE_LOOPBACK_H */
