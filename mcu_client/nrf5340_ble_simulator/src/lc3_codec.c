/**
 * @file lc3_codec.c
 * @brief LC3 Audio Codec Implementation for nRF5340
 * 
 * Based on MentraOS task_lc3_codec.c implementation
 * Provides LC3 audio decoding for BLE audio streaming
 */

#include "lc3_codec.h"
#include "i2s_audio.h"
#include <string.h>
#include <math.h>
#include <math.h>

LOG_MODULE_REGISTER(lc3_codec, LOG_LEVEL_DBG);

/** LC3 Decoder Context */
static lc3_decoder_state_t decoder_state = LC3_DECODER_IDLE;
static lc3_decoder_stats_t decoder_stats = {0};

/** PCM Output Buffer */
static int16_t pcm_buffer[LC3_SAMPLES_PER_FRAME * LC3_CHANNELS];

/** Audio Chunk Processing Buffer */
#define AUDIO_CHUNK_BUFFER_SIZE 512
static uint8_t audio_chunk_buffer[AUDIO_CHUNK_BUFFER_SIZE];
static size_t audio_chunk_offset = 0;

/**
 * @brief Simple LC3 frame decoder simulation
 * 
 * For now, this implements a basic placeholder decoder.
 * In a full implementation, this would use the actual LC3 codec library.
 * 
 * @param encoded_data LC3 encoded frame data
 * @param encoded_size Size of encoded frame
 * @param pcm_output Output PCM buffer
 * @param pcm_size Size of PCM output buffer
 * @param samples_decoded Number of samples decoded
 * @return 0 on success, negative on error
 */
static int lc3_decode_frame_internal(const uint8_t *encoded_data, size_t encoded_size,
                                    int16_t *pcm_output, size_t pcm_size,
                                    size_t *samples_decoded)
{
    // Validate inputs
    if (!encoded_data || !pcm_output || !samples_decoded) {
        return -EINVAL;
    }
    
    if (encoded_size > LC3_MAX_ENCODED_SIZE) {
        LOG_ERR("Encoded frame too large: %zu bytes", encoded_size);
        return -EINVAL;
    }
    
    if (pcm_size < LC3_PCM_FRAME_SIZE) {
        LOG_ERR("PCM buffer too small: %zu bytes", pcm_size);
        return -ENOMEM;
    }
    
    LOG_DBG("Decoding LC3 frame: %zu bytes -> PCM", encoded_size);
    
    // TODO: Replace with actual LC3 decoder
    // For now, generate a simple test tone based on encoded data
    uint16_t tone_freq = 440; // Base frequency (A4)
    if (encoded_size > 0) {
        tone_freq += (encoded_data[0] % 200); // Vary frequency based on data
    }
    
    // Generate stereo PCM data (160 samples per channel)
    for (int i = 0; i < LC3_SAMPLES_PER_FRAME; i++) {
        // Simple sine wave generation
        float phase = (float)(i * tone_freq * 2 * 3.14159) / LC3_SAMPLE_RATE;
        int16_t sample = (int16_t)(1000 * sin(phase)); // Low amplitude
        
        // Interleaved stereo: L, R, L, R, ...
        pcm_output[i * 2] = sample;     // Left channel
        pcm_output[i * 2 + 1] = sample; // Right channel
    }
    
    *samples_decoded = LC3_SAMPLES_PER_FRAME * LC3_CHANNELS;
    
    // Update statistics
    decoder_stats.frames_decoded++;
    decoder_stats.total_samples += *samples_decoded;
    
    return 0;
}

int lc3_decoder_init(void)
{
    LOG_INF("Initializing LC3 decoder");
    
    // Reset statistics
    memset(&decoder_stats, 0, sizeof(decoder_stats));
    
    // Initialize I2S audio output for LC3 decoded audio
    LOG_INF("🎵 Initializing I2S audio output for LC3 playback...");
    
    // Initialize audio output
    int ret = i2s_audio_init();
    if (ret < 0) {
        LOG_ERR("Failed to initialize I2S audio: %d", ret);
        decoder_state = LC3_DECODER_ERROR;
        return ret;
    }
    
    decoder_state = LC3_DECODER_READY;
    
    LOG_INF("✅ LC3 decoder initialized successfully with I2S audio output");
    LOG_INF("🎵 Audio Pipeline: BLE → LC3 Decode → I2S Output → Audio Hardware");
    LOG_INF("Channels: %d", LC3_CHANNELS);
    LOG_INF("Frame Duration: %d ms", LC3_FRAME_DURATION_MS);
    LOG_INF("Bitrate: %d kbps", LC3_BITRATE_KBPS);
    LOG_INF("Samples per Frame: %d", LC3_SAMPLES_PER_FRAME);
    
    return 0;
}

int lc3_decoder_deinit(void)
{
    LOG_INF("Deinitializing LC3 decoder");
    
    // Stop audio output
    i2s_audio_stop();
    
    decoder_state = LC3_DECODER_IDLE;
    
    LOG_INF("LC3 decoder deinitialized");
    
    return 0;
}

int lc3_decode_frame(const uint8_t *encoded_data, size_t encoded_size,
                     int16_t *pcm_output, size_t pcm_size,
                     size_t *samples_decoded)
{
    int ret;
    uint32_t start_time, decode_time;
    
    if (decoder_state != LC3_DECODER_READY && decoder_state != LC3_DECODER_DECODING) {
        LOG_ERR("LC3 decoder not ready");
        return -EINVAL;
    }
    
    decoder_state = LC3_DECODER_DECODING;
    
    // Measure decode time
    start_time = k_cycle_get_32();
    
    ret = lc3_decode_frame_internal(encoded_data, encoded_size,
                                   pcm_output, pcm_size, samples_decoded);
    
    decode_time = k_cyc_to_us_floor32(k_cycle_get_32() - start_time);
    decoder_stats.decode_time_us += decode_time;
    
    if (ret < 0) {
        LOG_ERR("LC3 frame decode failed: %d", ret);
        decoder_stats.decode_errors++;
        decoder_state = LC3_DECODER_ERROR;
        return ret;
    }
    
    decoder_state = LC3_DECODER_READY;
    
    LOG_DBG("LC3 frame decoded: %zu samples, %d us", *samples_decoded, decode_time);
    
    return 0;
}

int lc3_process_audio_chunk(const uint8_t *audio_data, size_t data_size)
{
    int ret;
    size_t samples_decoded;
    
    LOG_DBG("Processing audio chunk: %zu bytes", data_size);
    
    // For simplicity, assume each chunk contains one LC3 frame
    // In a real implementation, you'd need to parse frame boundaries
    
    if (data_size < LC3_ENCODED_FRAME_SIZE) {
        LOG_WRN("Audio chunk too small: %zu bytes (expected %d)", 
                data_size, LC3_ENCODED_FRAME_SIZE);
        return -EINVAL;
    }
    
    // Start audio output if not already running
    if (!i2s_audio_is_running()) {
        ret = i2s_audio_start();
        if (ret < 0) {
            LOG_ERR("Failed to start audio output: %d", ret);
            return ret;
        }
    }
    
    // Process each LC3 frame in the chunk
    size_t offset = 0;
    while (offset + LC3_ENCODED_FRAME_SIZE <= data_size) {
        // Decode LC3 frame
        ret = lc3_decode_frame(&audio_data[offset], LC3_ENCODED_FRAME_SIZE,
                              pcm_buffer, sizeof(pcm_buffer), &samples_decoded);
        if (ret < 0) {
            LOG_ERR("Failed to decode LC3 frame at offset %zu: %d", offset, ret);
            decoder_stats.bad_frames++;
            offset += LC3_ENCODED_FRAME_SIZE;
            continue;
        }
        
        // Play decoded PCM audio
        ret = i2s_audio_play_pcm(pcm_buffer, samples_decoded);
        if (ret < 0) {
            LOG_ERR("Failed to play PCM audio: %d", ret);
            // Continue processing other frames
        }
        
        offset += LC3_ENCODED_FRAME_SIZE;
    }
    
    return 0;
}

lc3_decoder_state_t lc3_get_decoder_state(void)
{
    return decoder_state;
}

int lc3_get_decoder_stats(lc3_decoder_stats_t *stats)
{
    if (!stats) {
        return -EINVAL;
    }
    
    memcpy(stats, &decoder_stats, sizeof(lc3_decoder_stats_t));
    return 0;
}

void lc3_reset_decoder_stats(void)
{
    memset(&decoder_stats, 0, sizeof(decoder_stats));
    LOG_INF("LC3 decoder statistics reset");
}

int lc3_test_decoder(void)
{
    int ret;
    uint8_t test_frame[LC3_ENCODED_FRAME_SIZE];
    int16_t test_pcm[LC3_SAMPLES_PER_FRAME * LC3_CHANNELS];
    size_t samples_decoded;
    
    LOG_INF("Testing LC3 decoder");
    
    // Generate test encoded frame
    for (int i = 0; i < LC3_ENCODED_FRAME_SIZE; i++) {
        test_frame[i] = i % 256;
    }
    
    // Test decode
    ret = lc3_decode_frame(test_frame, sizeof(test_frame),
                          test_pcm, sizeof(test_pcm), &samples_decoded);
    if (ret < 0) {
        LOG_ERR("LC3 decoder test failed: %d", ret);
        return ret;
    }
    
    LOG_INF("LC3 decoder test successful");
    LOG_INF("Decoded %zu samples", samples_decoded);
    LOG_INF("First few PCM samples: %d, %d, %d, %d", 
            test_pcm[0], test_pcm[1], test_pcm[2], test_pcm[3]);
    
    return 0;
}
