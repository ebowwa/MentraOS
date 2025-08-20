/**
 * @file i2s_audio_loopback.c
 * @brief I2S Audio Loopback System Implementation
 * 
 * Real-time microphone input to speaker output loopback system
 * Demonstrates full-duplex I2S audio capabilities on nRF5340DK
 */

#include "i2s_audio_loopback.h"
#include "i2s_audio.h"  // To check LC3 I2S status

#include <zephyr/types.h>
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/i2s.h>
#include <zephyr/sys/util.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(i2s_loopback, LOG_LEVEL_INF);

/** I2S Device */
#define I2S_DEV_NODE   DT_ALIAS(i2s_loopback)
#if DT_NODE_EXISTS(I2S_DEV_NODE)
#define I2S_DEV        DEVICE_DT_GET(I2S_DEV_NODE)
#else
#define I2S_DEV        DEVICE_DT_GET(DT_NODELABEL(i2s0))
#endif

/** Audio Buffer Memory Slabs */
K_MEM_SLAB_DEFINE(i2s_rx_mem_slab, I2S_LOOPBACK_BUFFER_SIZE, I2S_LOOPBACK_NUM_BUFFERS, 4);
K_MEM_SLAB_DEFINE(i2s_tx_mem_slab, I2S_LOOPBACK_BUFFER_SIZE, I2S_LOOPBACK_NUM_BUFFERS, 4);

/** Global Variables */
static const struct device *i2s_dev;
static bool loopback_active = false;
static uint8_t current_gain = I2S_LOOPBACK_DEFAULT_GAIN;
static i2s_loopback_stats_t stats = {0};

/** Audio Processing Thread */
static struct k_thread loopback_thread;
static K_THREAD_STACK_DEFINE(loopback_stack, 2048);

/** Audio Buffer Management */
static void *rx_buffers[I2S_LOOPBACK_NUM_BUFFERS];
static void *tx_buffers[I2S_LOOPBACK_NUM_BUFFERS];
static uint8_t rx_buffer_index = 0;
static uint8_t tx_buffer_index = 0;

/**
 * @brief Apply gain to audio samples
 */
static void apply_gain(int16_t *samples, size_t sample_count, uint8_t gain_percent)
{
    if (gain_percent == 100) {
        return; // No gain change needed
    }
    
    for (size_t i = 0; i < sample_count; i++) {
        int32_t sample = samples[i];
        sample = (sample * gain_percent) / 100;
        
        // Clamp to 16-bit range
        if (sample > INT16_MAX) {
            sample = INT16_MAX;
        } else if (sample < INT16_MIN) {
            sample = INT16_MIN;
        }
        
        samples[i] = (int16_t)sample;
    }
}

/**
 * @brief I2S receive callback
 */
static void i2s_rx_callback(const struct device *dev, int result, void *user_data)
{
    if (result < 0) {
        LOG_ERR("I2S RX error: %d", result);
        stats.input_overruns++;
        return;
    }
    
    // Signal the processing thread that new audio data is available
    // In a real implementation, you'd use a queue or semaphore here
}

/**
 * @brief I2S transmit callback
 */
static void i2s_tx_callback(const struct device *dev, int result, void *user_data)
{
    if (result < 0) {
        LOG_ERR("I2S TX error: %d", result);
        stats.output_underruns++;
        return;
    }
}

/**
 * @brief Audio loopback processing thread
 */
static void loopback_thread_entry(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);
    
    LOG_INF("🎵 Audio loopback thread started");
    
    while (loopback_active) {
        void *rx_buffer = NULL;
        void *tx_buffer = NULL;
        uint32_t rx_size, tx_size;
        
        // Get received audio data
        int ret = i2s_read(i2s_dev, &rx_buffer, &rx_size);
        if (ret < 0) {
            LOG_ERR("I2S read failed: %d", ret);
            k_msleep(1);
            continue;
        }
        
        if (rx_buffer == NULL || rx_size == 0) {
            k_msleep(1);
            continue;
        }
        
        // Get transmit buffer
        ret = k_mem_slab_alloc(&i2s_tx_mem_slab, &tx_buffer, K_NO_WAIT);
        if (ret < 0) {
            LOG_WRN("TX buffer allocation failed: %d", ret);
            k_mem_slab_free(&i2s_rx_mem_slab, &rx_buffer);
            stats.output_underruns++;
            continue;
        }
        
        // Process audio (copy with gain)
        uint32_t processing_start = k_cycle_get_32();
        
        memcpy(tx_buffer, rx_buffer, MIN(rx_size, I2S_LOOPBACK_BUFFER_SIZE));
        
        // Apply gain control
        if (current_gain != 100) {
            size_t sample_count = MIN(rx_size, I2S_LOOPBACK_BUFFER_SIZE) / sizeof(int16_t);
            apply_gain((int16_t *)tx_buffer, sample_count, current_gain);
        }
        
        uint32_t processing_cycles = k_cycle_get_32() - processing_start;
        stats.processing_time_us = k_cyc_to_us_floor32(processing_cycles);
        
        // Send processed audio to output
        tx_size = MIN(rx_size, I2S_LOOPBACK_BUFFER_SIZE);
        ret = i2s_write(i2s_dev, tx_buffer, tx_size);
        if (ret < 0) {
            LOG_ERR("I2S write failed: %d", ret);
            k_mem_slab_free(&i2s_tx_mem_slab, &tx_buffer);
            stats.output_underruns++;
        }
        
        // Release RX buffer
        k_mem_slab_free(&i2s_rx_mem_slab, &rx_buffer);
        
        // Update statistics
        stats.frames_processed++;
        stats.total_samples += tx_size / sizeof(int16_t);
        
        // Small yield to prevent starving other threads
        k_yield();
    }
    
    LOG_INF("🎵 Audio loopback thread stopped");
}

int i2s_audio_loopback_init(void)
{
    LOG_INF("🎵 Initializing I2S audio loopback system...");
    
    // Check if LC3 I2S system is running (would conflict)
    if (i2s_audio_is_running()) {
        LOG_WRN("⚠️  LC3 I2S audio system is already running!");
        LOG_WRN("⚠️  Cannot start loopback while LC3 audio is active");
        LOG_WRN("⚠️  This is a known limitation - only one I2S mode at a time");
        return -EBUSY;
    }
    
    // Get I2S device
    i2s_dev = I2S_DEV;
    if (!device_is_ready(i2s_dev)) {
        LOG_ERR("I2S device not ready");
        return -ENODEV;
    }
    
    LOG_INF("✅ I2S device ready: %s", i2s_dev->name);
    
    // Configure I2S for full-duplex operation
    struct i2s_config config = {
        .word_size = I2S_LOOPBACK_SAMPLE_BITS,
        .channels = I2S_LOOPBACK_CHANNELS,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
        .frame_clk_freq = I2S_LOOPBACK_SAMPLE_RATE,
        .mem_slab = &i2s_rx_mem_slab,
        .block_size = I2S_LOOPBACK_BUFFER_SIZE,
        .timeout = 1000,
    };
    
    // Configure for receive (microphone input)
    int ret = i2s_configure(i2s_dev, I2S_DIR_RX, &config);
    if (ret < 0) {
        LOG_ERR("Failed to configure I2S RX: %d", ret);
        return ret;
    }
    
    // Configure for transmit (speaker output)
    config.mem_slab = &i2s_tx_mem_slab;
    ret = i2s_configure(i2s_dev, I2S_DIR_TX, &config);
    if (ret < 0) {
        LOG_ERR("Failed to configure I2S TX: %d", ret);
        return ret;
    }
    
    LOG_INF("✅ I2S configured for full-duplex operation");
    LOG_INF("📊 Audio format: %dHz, %d-bit, %d channels",
            I2S_LOOPBACK_SAMPLE_RATE, I2S_LOOPBACK_SAMPLE_BITS, I2S_LOOPBACK_CHANNELS);
    LOG_INF("📊 Buffer size: %d bytes, Frame size: %d ms",
            I2S_LOOPBACK_BUFFER_SIZE, I2S_LOOPBACK_FRAME_SIZE_MS);
    
    return 0;
}

int i2s_audio_loopback_start(void)
{
    if (loopback_active) {
        LOG_WRN("Audio loopback already active");
        return -EALREADY;
    }
    
    // Double-check that LC3 I2S is not interfering
    if (i2s_audio_is_running()) {
        LOG_ERR("❌ Cannot start loopback: LC3 I2S system is running");
        LOG_ERR("❌ Please stop LC3 audio playback first");
        return -EBUSY;
    }
    
    LOG_INF("🚀 Starting I2S audio loopback...");
    
    // Reset statistics
    memset(&stats, 0, sizeof(stats));
    
    // Start I2S receive and transmit
    int ret = i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_START);
    if (ret < 0) {
        LOG_ERR("Failed to start I2S RX: %d", ret);
        return ret;
    }
    
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_START);
    if (ret < 0) {
        LOG_ERR("Failed to start I2S TX: %d", ret);
        i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_STOP);
        return ret;
    }
    
    // Start processing thread
    loopback_active = true;
    k_thread_create(&loopback_thread, loopback_stack,
                    K_THREAD_STACK_SIZEOF(loopback_stack),
                    loopback_thread_entry,
                    NULL, NULL, NULL,
                    K_PRIO_PREEMPT(5), 0, K_NO_WAIT);
    
    k_thread_name_set(&loopback_thread, "i2s_loopback");
    
    LOG_INF("✅ I2S audio loopback started successfully");
    LOG_INF("🎤 Microphone input: P1.09 (I2S_SDIN)");
    LOG_INF("🔊 Speaker output: P1.08 (I2S_SDOUT)");
    LOG_INF("🎵 Speak into microphone to hear yourself through speakers!");
    
    return 0;
}

int i2s_audio_loopback_stop(void)
{
    if (!loopback_active) {
        LOG_WRN("Audio loopback not active");
        return -EALREADY;
    }
    
    LOG_INF("🛑 Stopping I2S audio loopback...");
    
    // Stop processing thread
    loopback_active = false;
    k_thread_join(&loopback_thread, K_FOREVER);
    
    // Stop I2S
    i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_STOP);
    i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_STOP);
    
    LOG_INF("✅ I2S audio loopback stopped");
    
    return 0;
}

int i2s_audio_loopback_set_gain(uint8_t gain_percent)
{
    if (gain_percent > 200) {
        LOG_ERR("Invalid gain: %d%% (max 200%%)", gain_percent);
        return -EINVAL;
    }
    
    current_gain = gain_percent;
    LOG_INF("🔊 Audio gain set to %d%%", gain_percent);
    
    return 0;
}

int i2s_audio_loopback_get_stats(i2s_loopback_stats_t *stats_out)
{
    if (stats_out == NULL) {
        return -EINVAL;
    }
    
    memcpy(stats_out, &stats, sizeof(stats));
    return 0;
}

void i2s_audio_loopback_reset_stats(void)
{
    memset(&stats, 0, sizeof(stats));
    LOG_INF("📊 Audio loopback statistics reset");
}
