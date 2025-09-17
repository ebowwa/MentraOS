/**
 * @file i2s_audio_loopback.h
 * @brief I2S Audio Loopback System for nRF5340
 * 
 * Real-time microphone input to speaker output loopback system
 * Demonstrates full-duplex I2S audio capabilities
 * 
 * Pin Configuration:
 * - P1.06: I2S_LRCK (Left/Right Clock) - Master
 * - P1.07: I2S_BCLK (Bit Clock) - Master
 * - P1.08: I2S_SDOUT (Serial Data Output to Speaker/DAC)
 * - P1.09: I2S_SDIN (Serial Data Input from Microphone/ADC)
 * 
 * Audio Format:
 * - Sample Rate: 16kHz
 * - Bit Depth: 16-bit
 * - Channels: Stereo (Left/Right)
 * - Latency: ~10ms (160 samples per channel)
 * 
 * Operation:
 * - Real-time audio capture from I2S microphone
 * - Direct pass-through to I2S speaker output
 * - Buffer management for continuous audio stream
 * - Optional audio processing/effects
 */

#ifndef I2S_AUDIO_LOOPBACK_H
#define I2S_AUDIO_LOOPBACK_H

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2s.h>
#include <zephyr/logging/log.h>

#ifdef __cplusplus
extern "C" {
#endif

/** I2S Audio Loopback Configuration */
#define I2S_LOOPBACK_SAMPLE_RATE       16000    // 16kHz sample rate
#define I2S_LOOPBACK_CHANNELS          2        // Stereo
#define I2S_LOOPBACK_SAMPLE_BITS       16       // 16-bit samples
#define I2S_LOOPBACK_FRAME_SIZE_MS     10       // 10ms frames for low latency
#define I2S_LOOPBACK_SAMPLES_PER_FRAME (I2S_LOOPBACK_SAMPLE_RATE * I2S_LOOPBACK_FRAME_SIZE_MS / 1000)
#define I2S_LOOPBACK_BUFFER_SIZE       (I2S_LOOPBACK_SAMPLES_PER_FRAME * I2S_LOOPBACK_CHANNELS * sizeof(int16_t))

/** I2S Audio Buffer Management */
#define I2S_LOOPBACK_NUM_BUFFERS       6        // Ping-pong buffers for input/output
#define I2S_LOOPBACK_BUFFER_POOL_SIZE  (I2S_LOOPBACK_BUFFER_SIZE * I2S_LOOPBACK_NUM_BUFFERS)

/** Audio Processing Options */
#define I2S_LOOPBACK_ENABLE_ECHO       1        // Enable echo effect
#define I2S_LOOPBACK_ENABLE_GAIN       1        // Enable volume control
#define I2S_LOOPBACK_DEFAULT_GAIN      100      // Default gain percentage (100% = no change)

/**
 * @brief Audio loopback statistics
 */
typedef struct {
    uint32_t frames_processed;      // Total frames processed
    uint32_t input_overruns;        // Input buffer overruns
    uint32_t output_underruns;      // Output buffer underruns
    uint32_t total_samples;         // Total samples processed
    uint32_t processing_time_us;    // Average processing time per frame
} i2s_loopback_stats_t;

/**
 * @brief Initialize I2S audio loopback system
 * 
 * Configures I2S peripheral for full-duplex audio:
 * - 16kHz sample rate
 * - 16-bit stereo input/output
 * - Real-time loopback processing
 * - Buffer management
 * 
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_loopback_init(void);

/**
 * @brief Start audio loopback processing
 * 
 * Begins real-time audio capture and playback
 * 
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_loopback_start(void);

/**
 * @brief Stop audio loopback processing
 * 
 * Stops audio capture and playback
 * 
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_loopback_stop(void);

/**
 * @brief Set audio loopback gain
 * 
 * @param gain_percent Gain percentage (0-200%, 100% = no change)
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_loopback_set_gain(uint8_t gain_percent);

/**
 * @brief Get loopback processing statistics
 * 
 * @param stats Pointer to statistics structure to fill
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_loopback_get_stats(i2s_loopback_stats_t *stats);

/**
 * @brief Reset loopback processing statistics
 */
void i2s_audio_loopback_reset_stats(void);

#ifdef __cplusplus
}
#endif

#endif /* I2S_AUDIO_LOOPBACK_H */
