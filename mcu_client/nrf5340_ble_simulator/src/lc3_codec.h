/**
 * @file lc3_codec.h
 * @brief LC3 Audio Codec Implementation for nRF5340
 * 
 * Based on MentraOS task_lc3_codec.c implementation
 * Provides LC3 audio decoding for BLE audio streaming
 * 
 * LC3 Configuration:
 * - Sample Rate: 16kHz
 * - Bit Depth: 16-bit
 * - Channels: Stereo (2 channels)
 * - Frame Duration: 10ms
 * - Bitrate: 32kbps
 * - Frame Size: 160 samples per channel
 */

#ifndef LC3_CODEC_H
#define LC3_CODEC_H

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/** LC3 Codec Configuration */
#define LC3_SAMPLE_RATE         16000    // 16kHz sample rate
#define LC3_CHANNELS            2        // Stereo
#define LC3_FRAME_DURATION_MS   10       // 10ms frame duration
#define LC3_BITRATE_KBPS        32       // 32 kbps bitrate
#define LC3_SAMPLES_PER_FRAME   (LC3_SAMPLE_RATE * LC3_FRAME_DURATION_MS / 1000)
#define LC3_PCM_FRAME_SIZE      (LC3_SAMPLES_PER_FRAME * LC3_CHANNELS * sizeof(int16_t))

/** LC3 Encoded Frame Sizes */
#define LC3_ENCODED_FRAME_SIZE  40       // Bytes per encoded frame (32kbps @ 10ms)
#define LC3_MAX_ENCODED_SIZE    60       // Maximum encoded frame size

/** LC3 Decoder States */
typedef enum {
    LC3_DECODER_IDLE,
    LC3_DECODER_READY,
    LC3_DECODER_DECODING,
    LC3_DECODER_ERROR
} lc3_decoder_state_t;

/** LC3 Decoder Statistics */
typedef struct {
    uint32_t frames_decoded;
    uint32_t decode_errors;
    uint32_t bad_frames;
    uint32_t total_samples;
    uint32_t decode_time_us;
} lc3_decoder_stats_t;

/**
 * @brief Initialize LC3 decoder
 * 
 * Sets up LC3 decoder with the following configuration:
 * - 16kHz sample rate
 * - 2 channels (stereo)
 * - 10ms frame duration
 * - 32kbps bitrate
 * 
 * @return 0 on success, negative error code on failure
 */
int lc3_decoder_init(void);

/**
 * @brief Deinitialize LC3 decoder
 * 
 * Cleans up LC3 decoder resources
 * 
 * @return 0 on success, negative error code on failure
 */
int lc3_decoder_deinit(void);

/**
 * @brief Decode LC3 audio frame
 * 
 * Decodes a single LC3 encoded frame to PCM audio data.
 * 
 * @param encoded_data Pointer to LC3 encoded data
 * @param encoded_size Size of encoded data (typically 40 bytes)
 * @param pcm_output Pointer to output PCM buffer (320 samples)
 * @param pcm_size Size of PCM output buffer
 * @param samples_decoded Pointer to store number of samples decoded
 * @return 0 on success, negative error code on failure
 */
int lc3_decode_frame(const uint8_t *encoded_data, size_t encoded_size,
                     int16_t *pcm_output, size_t pcm_size,
                     size_t *samples_decoded);

/**
 * @brief Process audio chunk for LC3 decoding
 * 
 * Processes incoming audio chunk, extracts LC3 frames,
 * and queues them for decoding and playback.
 * 
 * @param audio_data Pointer to audio chunk data
 * @param data_size Size of audio chunk
 * @return 0 on success, negative error code on failure
 */
int lc3_process_audio_chunk(const uint8_t *audio_data, size_t data_size);

/**
 * @brief Get LC3 decoder state
 * 
 * @return Current decoder state
 */
lc3_decoder_state_t lc3_get_decoder_state(void);

/**
 * @brief Get LC3 decoder statistics
 * 
 * @param stats Pointer to statistics structure
 * @return 0 on success, negative error code on failure
 */
int lc3_get_decoder_stats(lc3_decoder_stats_t *stats);

/**
 * @brief Reset LC3 decoder statistics
 */
void lc3_reset_decoder_stats(void);

/**
 * @brief Test LC3 decoder with sample data
 * 
 * Performs a basic test of the LC3 decoder functionality
 * 
 * @return 0 on success, negative error code on failure
 */
int lc3_test_decoder(void);

#ifdef __cplusplus
}
#endif

#endif /* LC3_CODEC_H */
