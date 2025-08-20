/*
 * Simple I2S Audio Implementation using Zephyr API
 * Instead of direct NRFX to avoid configuration conflicts
 */

#include "simple_audio_i2s.h"
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/i2s.h>
#include <zephyr/logging/log.h>
#include <math.h>

LOG_MODULE_REGISTER(simple_audio_i2s, LOG_LEVEL_INF);

#define I2S_DEVICE_NODE DT_NODELABEL(i2s0)
static const struct device *i2s_dev = DEVICE_DT_GET(I2S_DEVICE_NODE);

// Audio configuration
#define SAMPLE_RATE 16000
#define SAMPLES_PER_FRAME 160  // 10ms at 16kHz
#define AUDIO_BUFFER_SIZE (SAMPLES_PER_FRAME * 2)  // stereo

// Audio buffers
static int16_t audio_tx_buffer[2][AUDIO_BUFFER_SIZE];
static int16_t audio_rx_buffer[2][AUDIO_BUFFER_SIZE];

static struct i2s_config i2s_cfg = {
    .word_size = 16,
    .channels = 2,
    .format = I2S_FMT_DATA_FORMAT_I2S,
    .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
    .frame_clk_freq = SAMPLE_RATE,
    .mem_slab = NULL,
    .block_size = AUDIO_BUFFER_SIZE * sizeof(int16_t),
    .timeout = 0,  // Use 0 instead of K_NO_WAIT for int timeout
};

// Audio state
static bool audio_initialized = false;
static bool audio_started = false;
static float tone_phase = 0.0f;

// Math constants
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

void generate_test_tone(int16_t *buffer, size_t frames, float freq)
{
    const float phase_increment = 2.0f * M_PI * freq / SAMPLE_RATE;
    
    for (size_t i = 0; i < frames; i++) {
        // Generate sine wave sample
        int16_t sample = (int16_t)(sinf(tone_phase) * 8000); // 25% volume
        
        // Store as stereo (left and right same)
        buffer[i * 2] = sample;     // Left channel
        buffer[i * 2 + 1] = sample; // Right channel
        
        // Update phase
        tone_phase += phase_increment;
        if (tone_phase >= 2.0f * M_PI) {
            tone_phase -= 2.0f * M_PI;
        }
    }
}

int simple_audio_i2s_init(void)
{
    int ret;
    
    if (!device_is_ready(i2s_dev)) {
        LOG_ERR("I2S device not ready");
        return -ENODEV;
    }
    
    ret = i2s_configure(i2s_dev, I2S_DIR_TX, &i2s_cfg);
    if (ret < 0) {
        LOG_ERR("Failed to configure I2S TX: %d", ret);
        return ret;
    }
    
    ret = i2s_configure(i2s_dev, I2S_DIR_RX, &i2s_cfg);
    if (ret < 0) {
        LOG_ERR("Failed to configure I2S RX: %d", ret);
        return ret;
    }
    
    LOG_INF("Simple I2S Audio initialized successfully");
    audio_initialized = true;
    return 0;
}

int simple_audio_i2s_start(void)
{
    int ret;
    void *tx_buf, *rx_buf;
    size_t buf_size = AUDIO_BUFFER_SIZE * sizeof(int16_t);
    
    if (!audio_initialized) {
        LOG_ERR("Audio not initialized");
        return -EINVAL;
    }
    
    // Generate initial test tone in first buffer
    generate_test_tone(audio_tx_buffer[0], SAMPLES_PER_FRAME, 440.0f);
    
    // Start TX stream
    ret = i2s_buf_write(i2s_dev, audio_tx_buffer[0], buf_size);
    if (ret < 0) {
        LOG_ERR("Failed to write initial TX buffer: %d", ret);
        return ret;
    }
    
    // Start RX stream
    ret = i2s_buf_read(i2s_dev, &rx_buf, &buf_size);
    if (ret < 0) {
        LOG_ERR("Failed to start RX stream: %d", ret);
        return ret;
    }
    
    // Trigger I2S start
    ret = i2s_trigger(i2s_dev, I2S_DIR_BOTH, I2S_TRIGGER_START);
    if (ret < 0) {
        LOG_ERR("Failed to start I2S: %d", ret);
        return ret;
    }
    
    LOG_INF("Simple I2S Audio started");
    audio_started = true;
    return 0;
}

int simple_audio_i2s_stop(void)
{
    int ret;
    
    if (!audio_started) {
        return 0;
    }
    
    ret = i2s_trigger(i2s_dev, I2S_DIR_BOTH, I2S_TRIGGER_STOP);
    if (ret < 0) {
        LOG_ERR("Failed to stop I2S: %d", ret);
        return ret;
    }
    
    LOG_INF("Simple I2S Audio stopped");
    audio_started = false;
    return 0;
}

void simple_audio_i2s_process(void)
{
    int ret;
    void *tx_buf, *rx_buf;
    size_t buf_size;
    static int buffer_index = 1;
    
    if (!audio_started) {
        return;
    }
    
    // Get completed TX buffer
    ret = i2s_buf_read(i2s_dev, &tx_buf, &buf_size);
    if (ret == 0) {
        // TX buffer completed, queue next one
        generate_test_tone(audio_tx_buffer[buffer_index], SAMPLES_PER_FRAME, 440.0f);
        i2s_buf_write(i2s_dev, audio_tx_buffer[buffer_index], AUDIO_BUFFER_SIZE * sizeof(int16_t));
        buffer_index = 1 - buffer_index; // Toggle buffer
    }
    
    // Get completed RX buffer
    ret = i2s_buf_read(i2s_dev, &rx_buf, &buf_size);
    if (ret == 0) {
        // RX buffer completed, could process received audio here
        // For now just queue next RX buffer
        i2s_buf_read(i2s_dev, &rx_buf, &buf_size);
    }
}
