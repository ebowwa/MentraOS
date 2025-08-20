/**
 * @file i2s_audio.h
 * @brief I2S Audio Output Driver for nRF5340
 * 
 * Based on MentraOS bspal_audio_i2s.c implementation
 * Provides I2S audio output for LC3 decoded audio playback
 * 
 * Pin Configuration:
 * - P1.06: I2S_LRCK (Left/Right Clock)
 * - P1.07: I2S_BCLK (Bit Clock) 
 * - P1.08: I2S_SDIN (Serial Data Input to DAC)
 * 
 * Audio Format:
 * - Sample Rate: 16kHz
 * - Bit Depth: 16-bit
 * - Channels: Stereo (Left/Right)
 * - Frame Size: 10ms (160 samples per channel)
 */

#ifndef I2S_AUDIO_H
#define I2S_AUDIO_H

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2s.h>
#include <zephyr/logging/log.h>

#ifdef __cplusplus
extern "C" {
#endif

/** I2S Audio Configuration */
#define I2S_AUDIO_SAMPLE_RATE       16000    // 16kHz sample rate
#define I2S_AUDIO_CHANNELS          2        // Stereo
#define I2S_AUDIO_SAMPLE_BITS       16       // 16-bit samples
#define I2S_AUDIO_FRAME_SIZE_MS     10       // 10ms frames
#define I2S_AUDIO_SAMPLES_PER_FRAME (I2S_AUDIO_SAMPLE_RATE * I2S_AUDIO_FRAME_SIZE_MS / 1000)
#define I2S_AUDIO_BUFFER_SIZE       (I2S_AUDIO_SAMPLES_PER_FRAME * I2S_AUDIO_CHANNELS * sizeof(int16_t))

/** I2S Audio Buffer Management */
#define I2S_AUDIO_NUM_BUFFERS       4        // Number of audio buffers
#define I2S_AUDIO_BUFFER_POOL_SIZE  (I2S_AUDIO_BUFFER_SIZE * I2S_AUDIO_NUM_BUFFERS)

/**
 * @brief Initialize I2S audio output system
 * 
 * Configures I2S peripheral for audio output:
 * - 16kHz sample rate
 * - 16-bit stereo output
 * - ACLK timing source for precision
 * 
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_init(void);

/**
 * @brief Start I2S audio output
 * 
 * Begins I2S transmission and prepares for audio playback
 * 
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_start(void);

/**
 * @brief Stop I2S audio output
 * 
 * Stops I2S transmission and audio playback
 * 
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_stop(void);

/**
 * @brief Play PCM audio data through I2S
 * 
 * Queues PCM audio data for I2S output. Data should be:
 * - 16-bit signed integers
 * - Interleaved stereo (L, R, L, R, ...)
 * - 160 samples per channel (320 total samples)
 * 
 * @param pcm_data Pointer to PCM audio data
 * @param sample_count Number of samples (should be 320 for 10ms frame)
 * @return 0 on success, negative error code on failure
 */
int i2s_audio_play_pcm(const int16_t *pcm_data, size_t sample_count);

/**
 * @brief Get I2S audio status
 * 
 * @return true if I2S is running, false if stopped
 */
bool i2s_audio_is_running(void);

/**
 * @brief Get number of buffers available for writing
 * 
 * @return Number of free buffers available
 */
int i2s_audio_get_free_buffers(void);

#ifdef __cplusplus
}
#endif

#endif /* I2S_AUDIO_H */
