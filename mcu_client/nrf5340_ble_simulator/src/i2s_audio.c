/**
 * @file i2s_audio.c
 * @brief I2S Audio Output Driver Implementation for nRF5340
 * 
 * Based on MentraOS bspal_audio_i2s.c implementation
 * Provides I2S audio output for LC3 decoded audio playback
 */

#include "i2s_audio.h"
#include <zephyr/drivers/i2s.h>
#include <zephyr/sys/ring_buffer.h>
#include <string.h>

LOG_MODULE_REGISTER(i2s_audio, LOG_LEVEL_DBG);

/** I2S Device */
static const struct device *i2s_dev;

/** Audio Buffer Management */
static uint8_t audio_buffer_pool[I2S_AUDIO_BUFFER_POOL_SIZE];
static struct ring_buf audio_ring_buf;
static bool i2s_running = false;

/** I2S Memory Slab for DMA buffers */
K_MEM_SLAB_DEFINE(i2s_mem_slab, I2S_AUDIO_BUFFER_SIZE, I2S_AUDIO_NUM_BUFFERS, 4);

/** I2S Configuration */
static struct i2s_config i2s_cfg = {
    .word_size = I2S_AUDIO_SAMPLE_BITS,
    .channels = I2S_AUDIO_CHANNELS,
    .format = I2S_FMT_DATA_FORMAT_I2S,
    .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
    .frame_clk_freq = I2S_AUDIO_SAMPLE_RATE,
    .mem_slab = &i2s_mem_slab,
    .block_size = I2S_AUDIO_BUFFER_SIZE,
    .timeout = 1000,  // Timeout in milliseconds
};

/**
 * @brief I2S completion callback
 * 
 * Called when an I2S buffer has been transmitted
 */
static void i2s_tx_callback(const struct device *dev, int result, void *user_data)
{
    if (result < 0) {
        LOG_ERR("I2S transmission error: %d", result);
        return;
    }
    
    LOG_DBG("I2S buffer transmitted successfully");
}

int i2s_audio_init(void)
{
    int ret;
    
    LOG_INF("Initializing I2S audio output");
    
    // Get I2S device
    i2s_dev = DEVICE_DT_GET(DT_NODELABEL(i2s0));
    if (!device_is_ready(i2s_dev)) {
        LOG_ERR("I2S device not ready");
        return -ENODEV;
    }
    
    // Initialize ring buffer for audio data
    ring_buf_init(&audio_ring_buf, sizeof(audio_buffer_pool), audio_buffer_pool);
    
    // Configure I2S
    ret = i2s_configure(i2s_dev, I2S_DIR_TX, &i2s_cfg);
    if (ret < 0) {
        LOG_ERR("Failed to configure I2S: %d", ret);
        return ret;
    }
    
    LOG_INF("I2S audio initialized successfully");
    LOG_INF("Sample Rate: %d Hz", I2S_AUDIO_SAMPLE_RATE);
    LOG_INF("Channels: %d", I2S_AUDIO_CHANNELS);
    LOG_INF("Bit Depth: %d bits", I2S_AUDIO_SAMPLE_BITS);
    LOG_INF("Frame Size: %d ms (%d samples)", I2S_AUDIO_FRAME_SIZE_MS, I2S_AUDIO_SAMPLES_PER_FRAME);
    
    return 0;
}

int i2s_audio_start(void)
{
    int ret;
    
    if (i2s_running) {
        LOG_WRN("I2S already running");
        return 0;
    }
    
    LOG_INF("Starting I2S audio output");
    
    // Start I2S transmission
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_START);
    if (ret < 0) {
        LOG_ERR("Failed to start I2S: %d", ret);
        return ret;
    }
    
    i2s_running = true;
    LOG_INF("I2S audio output started");
    
    return 0;
}

int i2s_audio_stop(void)
{
    int ret;
    
    if (!i2s_running) {
        LOG_WRN("I2S already stopped");
        return 0;
    }
    
    LOG_INF("Stopping I2S audio output");
    
    // Stop I2S transmission
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_STOP);
    if (ret < 0) {
        LOG_ERR("Failed to stop I2S: %d", ret);
        return ret;
    }
    
    i2s_running = false;
    
    // Clear ring buffer
    ring_buf_reset(&audio_ring_buf);
    
    LOG_INF("I2S audio output stopped");
    
    return 0;
}

int i2s_audio_play_pcm(const int16_t *pcm_data, size_t sample_count)
{
    int ret;
    size_t bytes_to_write;
    uint32_t bytes_written;
    
    if (!i2s_running) {
        LOG_ERR("I2S not running, cannot play audio");
        return -EINVAL;
    }
    
    if (!pcm_data || sample_count == 0) {
        LOG_ERR("Invalid PCM data or sample count");
        return -EINVAL;
    }
    
    // Validate expected sample count (320 samples for 10ms stereo frame)
    if (sample_count != I2S_AUDIO_SAMPLES_PER_FRAME * I2S_AUDIO_CHANNELS) {
        LOG_WRN("Unexpected sample count: %zu (expected %d)", 
                sample_count, I2S_AUDIO_SAMPLES_PER_FRAME * I2S_AUDIO_CHANNELS);
    }
    
    bytes_to_write = sample_count * sizeof(int16_t);
    
    LOG_DBG("Playing PCM audio: %zu samples (%zu bytes)", sample_count, bytes_to_write);
    
    // Check if ring buffer has space
    if (ring_buf_space_get(&audio_ring_buf) < bytes_to_write) {
        LOG_WRN("Audio ring buffer full, dropping audio data");
        return -ENOMEM;
    }
    
    // Write PCM data to ring buffer
    bytes_written = ring_buf_put(&audio_ring_buf, (uint8_t *)pcm_data, bytes_to_write);
    if (bytes_written != bytes_to_write) {
        LOG_ERR("Failed to write all PCM data to ring buffer: %d/%zu bytes", 
                bytes_written, bytes_to_write);
        return -ENOMEM;
    }
    
    // Prepare I2S buffer
    void *i2s_buffer;
    size_t buffer_size = I2S_AUDIO_BUFFER_SIZE;
    
    // Get data from ring buffer for I2S transmission
    if (ring_buf_size_get(&audio_ring_buf) >= buffer_size) {
        ret = i2s_buf_write(i2s_dev, audio_buffer_pool, buffer_size);
        if (ret < 0) {
            LOG_ERR("Failed to write I2S buffer: %d", ret);
            return ret;
        }
        
        // Remove transmitted data from ring buffer
        ring_buf_get(&audio_ring_buf, audio_buffer_pool, buffer_size);
        
        LOG_DBG("I2S buffer written successfully");
    }
    
    return 0;
}

bool i2s_audio_is_running(void)
{
    return i2s_running;
}

int i2s_audio_get_free_buffers(void)
{
    size_t free_space = ring_buf_space_get(&audio_ring_buf);
    return free_space / I2S_AUDIO_BUFFER_SIZE;
}
