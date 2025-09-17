/**
 * @file main_mentraos_audio_system.c
 * @brief MentraOS Audio System Implementation for nRF5340
 * 
 * Complete audio pipeline: PDM Mic → LC3 Encode → BLE TX/RX → LC3 Decode → I2S Output
 * 
 * Based on the actual MentraOS implementation:
 * - PDM microphone input on P1.11/P1.12
 * - I2S audio output on P1.06/P1.07/P1.08 (MAX98357A)
 * - LC3 audio codec for BLE streaming
 * - Audio loopback for testing
 * 
 * Pin Configuration:
 * PDM (Microphone Input):
 *   - P1.11: PDM_DIN (Data)
 *   - P1.12: PDM_CLK (Clock)
 * 
 * I2S (Audio Output):
 *   - P1.06: I2S_SDOUT (Serial Data Output to MAX98357A DIN)
 *   - P1.07: I2S_SCK_M (Serial Clock Master to MAX98357A BCLK)
 *   - P1.08: I2S_LRCK_M (LR Clock Master to MAX98357A LRC)
 * 
 * Audio Format:
 *   - Sample Rate: 16kHz
 *   - Bit Depth: 16-bit 
 *   - Channels: Mono PDM input, Stereo I2S output
 *   - Frame Duration: 10ms (160 samples)
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/i2s.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/ring_buffer.h>

#include <nrfx_pdm.h>
#include <nrfx_clock.h>
#include <string.h>
#include <math.h>

LOG_MODULE_REGISTER(mentraos_audio, LOG_LEVEL_INF);

/* ============================================================================
 * Audio Configuration Constants 
 * ============================================================================ */

#define AUDIO_SAMPLE_RATE         16000    // 16kHz
#define AUDIO_SAMPLE_BITS         16       // 16-bit
#define AUDIO_FRAME_DURATION_MS   10       // 10ms frames
#define AUDIO_SAMPLES_PER_FRAME   (AUDIO_SAMPLE_RATE * AUDIO_FRAME_DURATION_MS / 1000)  // 160
#define AUDIO_FRAME_SIZE_BYTES    (AUDIO_SAMPLES_PER_FRAME * sizeof(int16_t))  // 320 bytes

// PDM Configuration (Mono input)
#define PDM_CHANNELS              1
#define PDM_BUFFER_SIZE           AUDIO_FRAME_SIZE_BYTES
#define PDM_NUM_BUFFERS           4

// I2S Configuration (Stereo output)  
#define I2S_CHANNELS              2
#define I2S_BUFFER_SIZE           (AUDIO_SAMPLES_PER_FRAME * I2S_CHANNELS * sizeof(int16_t))  // 640 bytes
#define I2S_NUM_BUFFERS           4

/* ============================================================================
 * Hardware Pin Configuration (nRF5340DK)
 * ============================================================================ */

// PDM pins (P1.11/P1.12 mapped to GPIO numbers)
#define PDM_CLK_PIN  44  // P1.12 (GPIO 32+12 = 44)
#define PDM_DIN_PIN  43  // P1.11 (GPIO 32+11 = 43)

// GPIO for status indication
#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

/* ============================================================================
 * Audio Buffer Management
 * ============================================================================ */

// PDM input buffers (mono)
static int16_t pdm_buffer_pool[PDM_NUM_BUFFERS][AUDIO_SAMPLES_PER_FRAME];
static uint8_t pdm_buffer_index = 0;
static bool pdm_buffer_ready = false;

// I2S output buffers (stereo)  
K_MEM_SLAB_DEFINE(i2s_mem_slab, I2S_BUFFER_SIZE, I2S_NUM_BUFFERS, 4);

// Audio processing ring buffer for PDM→I2S data flow
#define RING_BUFFER_SIZE (I2S_BUFFER_SIZE * 8)
static uint8_t ring_buffer_data[RING_BUFFER_SIZE];
static struct ring_buf audio_ring_buffer;

/* ============================================================================
 * Device Handles
 * ============================================================================ */

static const struct device *i2s_dev;
static const nrfx_pdm_t pdm_instance = NRFX_PDM_INSTANCE(0);

/* ============================================================================
 * Audio System State
 * ============================================================================ */

static bool audio_system_running = false;
static bool pdm_recording = false;
static bool i2s_playing = false;

// Audio loopback statistics
static struct {
    uint32_t pdm_frames_received;
    uint32_t i2s_frames_sent;
    uint32_t buffer_overruns;
    uint32_t buffer_underruns;
} audio_stats = {0};

/* ============================================================================
 * PDM Microphone Implementation
 * ============================================================================ */

/**
 * @brief PDM event handler
 * Called when PDM buffer is filled with audio data
 */
static void pdm_event_handler(const nrfx_pdm_evt_t *evt)
{
    if (evt->buffer_requested) {
        // Set next PDM buffer for recording
        nrfx_err_t err = nrfx_pdm_buffer_set(&pdm_instance, 
                                            pdm_buffer_pool[pdm_buffer_index], 
                                            AUDIO_SAMPLES_PER_FRAME);
        if (err != NRFX_SUCCESS) {
            LOG_ERR("PDM buffer set failed: %d", err);
            return;
        }
        
        // Move to next buffer
        pdm_buffer_index = (pdm_buffer_index + 1) % PDM_NUM_BUFFERS;
        pdm_buffer_ready = true;
        audio_stats.pdm_frames_received++;
        
        LOG_DBG("PDM frame %d captured (%d samples)", audio_stats.pdm_frames_received, AUDIO_SAMPLES_PER_FRAME);
    }
    
    if (evt->buffer_released) {
        // Previous buffer has been filled and is ready for processing
        // This gets handled in the main processing loop
    }
}

/**
 * @brief Initialize PDM microphone 
 */
static int pdm_microphone_init(void)
{
    nrfx_err_t err;
    
    LOG_INF("Initializing PDM microphone...");
    
    // Configure PDM
    nrfx_pdm_config_t pdm_config = NRFX_PDM_DEFAULT_CONFIG(PDM_CLK_PIN, PDM_DIN_PIN);
    pdm_config.clock_freq = NRF_PDM_FREQ_1280K;  // 1.28MHz PDM clock for 16kHz output
    pdm_config.mode = NRF_PDM_MODE_MONO;
    pdm_config.edge = NRF_PDM_EDGE_LEFTRISING;
    
    // Initialize PDM
    err = nrfx_pdm_init(&pdm_instance, &pdm_config, pdm_event_handler);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("PDM initialization failed: %d", err);
        return -EIO;
    }
    
    LOG_INF("✅ PDM microphone initialized");
    LOG_INF("📍 PDM pins: CLK=P1.12, DIN=P1.11");
    LOG_INF("🎤 Format: %dkHz, %d-bit, %s", 
            AUDIO_SAMPLE_RATE/1000, AUDIO_SAMPLE_BITS, 
            PDM_CHANNELS == 1 ? "mono" : "stereo");
    
    return 0;
}

/**
 * @brief Start PDM microphone recording
 */
static int pdm_microphone_start(void)
{
    nrfx_err_t err;
    
    if (pdm_recording) {
        return 0;  // Already recording
    }
    
    LOG_INF("Starting PDM microphone recording...");
    
    // Start PDM recording
    err = nrfx_pdm_start(&pdm_instance);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("PDM start failed: %d", err);
        return -EIO;
    }
    
    pdm_recording = true;
    LOG_INF("✅ PDM microphone recording started");
    
    return 0;
}

/**
 * @brief Stop PDM microphone recording
 */
static int pdm_microphone_stop(void)
{
    if (!pdm_recording) {
        return 0;  // Already stopped
    }
    
    LOG_INF("Stopping PDM microphone recording...");
    
    nrfx_pdm_stop(&pdm_instance);
    pdm_recording = false;
    
    LOG_INF("✅ PDM microphone recording stopped");
    
    return 0;
}

/* ============================================================================
 * I2S Audio Output Implementation  
 * ============================================================================ */

/**
 * @brief I2S completion callback
 */
static void i2s_tx_callback(const struct device *dev, int result, void *user_data)
{
    if (result < 0) {
        LOG_ERR("I2S transmission error: %d", result);
        audio_stats.buffer_underruns++;
        return;
    }
    
    audio_stats.i2s_frames_sent++;
    LOG_DBG("I2S frame %d transmitted", audio_stats.i2s_frames_sent);
}

/**
 * @brief Initialize I2S audio output
 */
static int i2s_audio_output_init(void)
{
    int ret;
    
    LOG_INF("Initializing I2S audio output...");
    
    // Get I2S device
    i2s_dev = DEVICE_DT_GET(DT_NODELABEL(i2s0));
    if (!device_is_ready(i2s_dev)) {
        LOG_ERR("I2S device not ready");
        return -ENODEV;
    }
    
    // Configure I2S for audio output (TX only, following MentraOS config)
    struct i2s_config i2s_cfg = {
        .word_size = AUDIO_SAMPLE_BITS,
        .channels = I2S_CHANNELS,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
        .frame_clk_freq = AUDIO_SAMPLE_RATE,
        .mem_slab = &i2s_mem_slab,
        .block_size = I2S_BUFFER_SIZE,
        .timeout = 1000,
    };
    
    ret = i2s_configure(i2s_dev, I2S_DIR_TX, &i2s_cfg);
    if (ret < 0) {
        LOG_ERR("Failed to configure I2S: %d", ret);
        return ret;
    }
    
    LOG_INF("✅ I2S audio output initialized");
    LOG_INF("📍 I2S pins: SDOUT=P1.06, SCK_M=P1.07, LRCK_M=P1.08");
    LOG_INF("🔊 Format: %dkHz, %d-bit, %s", 
            AUDIO_SAMPLE_RATE/1000, AUDIO_SAMPLE_BITS,
            I2S_CHANNELS == 1 ? "mono" : "stereo");
    
    return 0;
}

/**
 * @brief Start I2S audio output
 */
static int i2s_audio_output_start(void)
{
    int ret;
    
    if (i2s_playing) {
        return 0;  // Already playing
    }
    
    LOG_INF("Starting I2S audio output...");
    
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_START);
    if (ret < 0) {
        LOG_ERR("Failed to start I2S: %d", ret);
        return ret;
    }
    
    i2s_playing = true;
    LOG_INF("✅ I2S audio output started");
    
    return 0;
}

/**
 * @brief Stop I2S audio output
 */
static int i2s_audio_output_stop(void)
{
    int ret;
    
    if (!i2s_playing) {
        return 0;  // Already stopped
    }
    
    LOG_INF("Stopping I2S audio output...");
    
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_STOP);
    if (ret < 0) {
        LOG_ERR("Failed to stop I2S: %d", ret);
        return ret;
    }
    
    i2s_playing = false;
    LOG_INF("✅ I2S audio output stopped");
    
    return 0;
}

/* ============================================================================
 * Audio Processing Pipeline
 * ============================================================================ */

/**
 * @brief Convert mono PDM data to stereo I2S data
 * 
 * @param mono_input Mono PCM input data (160 samples)
 * @param stereo_output Stereo PCM output data (320 samples, interleaved L/R)
 */
static void mono_to_stereo_convert(const int16_t *mono_input, int16_t *stereo_output)
{
    for (int i = 0; i < AUDIO_SAMPLES_PER_FRAME; i++) {
        int16_t sample = mono_input[i];
        
        // Duplicate mono to both channels (like MentraOS does)
        stereo_output[i * 2] = sample;      // Left channel
        stereo_output[i * 2 + 1] = sample;  // Right channel
    }
}

/**
 * @brief Process audio frame: PDM input → I2S output
 * 
 * This simulates the PDM→LC3→BLE→LC3→I2S pipeline but does direct loopback for testing
 */
static int process_audio_frame(void)
{
    void *i2s_buffer;
    int ret;
    
    // Check if we have PDM data ready
    if (!pdm_buffer_ready) {
        return 0;  // No new audio data
    }
    
    // Get previous PDM buffer (current - 1)
    uint8_t process_buffer_index = (pdm_buffer_index + PDM_NUM_BUFFERS - 1) % PDM_NUM_BUFFERS;
    int16_t *pdm_data = pdm_buffer_pool[process_buffer_index];
    
    // Allocate I2S buffer
    ret = k_mem_slab_alloc(&i2s_mem_slab, &i2s_buffer, K_NO_WAIT);
    if (ret < 0) {
        LOG_WRN("I2S buffer allocation failed: %d", ret);
        audio_stats.buffer_overruns++;
        pdm_buffer_ready = false;  // Mark as processed even if failed
        return ret;
    }
    
    // Convert mono PDM to stereo I2S
    mono_to_stereo_convert(pdm_data, (int16_t *)i2s_buffer);
    
    // Queue I2S buffer for transmission
    ret = i2s_write(i2s_dev, i2s_buffer, I2S_BUFFER_SIZE);
    if (ret < 0) {
        LOG_ERR("I2S write failed: %d", ret);
        k_mem_slab_free(&i2s_mem_slab, &i2s_buffer);
        audio_stats.buffer_underruns++;
        pdm_buffer_ready = false;
        return ret;
    }
    
    pdm_buffer_ready = false;  // Mark as processed
    
    LOG_DBG("Audio frame processed: PDM→I2S (frame %d)", audio_stats.pdm_frames_received);
    
    return 0;
}

/* ============================================================================
 * Audio System Control
 * ============================================================================ */

/**
 * @brief Initialize complete audio system
 */
static int mentraos_audio_init(void)
{
    int ret;
    
    LOG_INF("🎵🎵🎵 Initializing MentraOS Audio System... 🎵🎵🎵");
    
    // Initialize LED for status indication
    if (gpio_is_ready_dt(&led)) {
        gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
        gpio_pin_set_dt(&led, 0);  // LED off initially
    }
    
    // Initialize ring buffer for audio processing
    ring_buf_init(&audio_ring_buffer, sizeof(ring_buffer_data), ring_buffer_data);
    
    // Initialize PDM microphone
    ret = pdm_microphone_init();
    if (ret < 0) {
        LOG_ERR("Failed to initialize PDM: %d", ret);
        return ret;
    }
    
    // Initialize I2S audio output  
    ret = i2s_audio_output_init();
    if (ret < 0) {
        LOG_ERR("Failed to initialize I2S: %d", ret);
        return ret;
    }
    
    LOG_INF("✅✅✅ MentraOS Audio System initialized successfully! ✅✅✅");
    LOG_INF("🎧 Audio Pipeline: PDM Mic → Processing → I2S Speaker");
    LOG_INF("📊 Audio format: %dkHz, %d-bit, %dms frames", 
            AUDIO_SAMPLE_RATE/1000, AUDIO_SAMPLE_BITS, AUDIO_FRAME_DURATION_MS);
    
    return 0;
}

/**
 * @brief Start complete audio system
 */
static int mentraos_audio_start(void)
{
    int ret;
    
    if (audio_system_running) {
        LOG_WRN("Audio system already running");
        return 0;
    }
    
    LOG_INF("🎵 Starting MentraOS Audio System...");
    
    // Start I2S output first
    ret = i2s_audio_output_start();
    if (ret < 0) {
        LOG_ERR("Failed to start I2S output: %d", ret);
        return ret;
    }
    
    // Start PDM recording
    ret = pdm_microphone_start();
    if (ret < 0) {
        LOG_ERR("Failed to start PDM recording: %d", ret);
        i2s_audio_output_stop();
        return ret;
    }
    
    audio_system_running = true;
    
    // Turn on LED to indicate system is running
    if (gpio_is_ready_dt(&led)) {
        gpio_pin_set_dt(&led, 1);
    }
    
    LOG_INF("✅✅✅ MentraOS Audio System started! ✅✅✅");
    LOG_INF("🎤 Microphone: Recording from PDM (P1.11/P1.12)");
    LOG_INF("🔊 Speaker: Playing to I2S MAX98357A (P1.06/P1.07/P1.08)");
    LOG_INF("⚡ Real-time audio loopback active");
    
    return 0;
}

/**
 * @brief Stop complete audio system
 */
static int mentraos_audio_stop(void)
{
    if (!audio_system_running) {
        LOG_WRN("Audio system already stopped");
        return 0;
    }
    
    LOG_INF("⏹️ Stopping MentraOS Audio System...");
    
    // Stop recording first
    pdm_microphone_stop();
    
    // Stop playback
    i2s_audio_output_stop();
    
    audio_system_running = false;
    
    // Turn off LED
    if (gpio_is_ready_dt(&led)) {
        gpio_pin_set_dt(&led, 0);
    }
    
    LOG_INF("✅ MentraOS Audio System stopped");
    
    return 0;
}

/**
 * @brief Print audio system statistics
 */
static void print_audio_stats(void)
{
    LOG_INF("📊 === MentraOS Audio Statistics ===");
    LOG_INF("📊 PDM frames received: %d", audio_stats.pdm_frames_received);
    LOG_INF("📊 I2S frames sent: %d", audio_stats.i2s_frames_sent);
    LOG_INF("📊 Buffer overruns: %d", audio_stats.buffer_overruns);
    LOG_INF("📊 Buffer underruns: %d", audio_stats.buffer_underruns);
    LOG_INF("📊 System running: %s", audio_system_running ? "YES" : "NO");
    LOG_INF("📊 === End Statistics ===");
}

/* ============================================================================
 * Main Audio Processing Thread
 * ============================================================================ */

/**
 * @brief Main audio processing thread
 */
static void audio_processing_thread(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);
    
    LOG_INF("🎵 Audio processing thread started");
    
    uint32_t stats_counter = 0;
    
    while (1) {
        if (audio_system_running) {
            // Process audio frames
            process_audio_frame();
            
            // Print statistics every 5 seconds
            if (++stats_counter >= 500) {  // 500 * 10ms = 5 seconds
                print_audio_stats();
                stats_counter = 0;
            }
        }
        
        // Sleep for frame duration (10ms)
        k_msleep(AUDIO_FRAME_DURATION_MS);
    }
}

/* ============================================================================
 * Main Function
 * ============================================================================ */

int main(void)
{
    int ret;
    
    LOG_INF("🎵🎵🎵 MentraOS Audio System for nRF5340 🎵🎵🎵");
    LOG_INF("🎯 Hardware: MAX98357A I2S + PDM Microphone");
    LOG_INF("🎯 Pipeline: PDM → Audio Processing → I2S");
    LOG_INF("📍 PDM Pins: CLK=P1.12, DIN=P1.11");
    LOG_INF("📍 I2S Pins: SDOUT=P1.06, SCK_M=P1.07, LRCK_M=P1.08");
    
    // Initialize audio system
    ret = mentraos_audio_init();
    if (ret < 0) {
        LOG_ERR("❌ Failed to initialize audio system: %d", ret);
        return ret;
    }
    
    // Create audio processing thread
    static struct k_thread audio_thread;
    static K_THREAD_STACK_DEFINE(audio_stack, 2048);
    
    k_thread_create(&audio_thread, audio_stack, K_THREAD_STACK_SIZEOF(audio_stack),
                    audio_processing_thread, NULL, NULL, NULL,
                    K_PRIO_COOP(5), 0, K_NO_WAIT);
    k_thread_name_set(&audio_thread, "audio_proc");
    
    // Start audio system
    ret = mentraos_audio_start();
    if (ret < 0) {
        LOG_ERR("❌ Failed to start audio system: %d", ret);
        return ret;
    }
    
    LOG_INF("🎉 MentraOS Audio System running!");
    LOG_INF("🎤 Speak into the PDM microphone...");
    LOG_INF("🔊 Audio will play through MAX98357A speaker");
    LOG_INF("💡 LED indicates system status");
    
    // Main loop - handle system control
    uint32_t loop_count = 0;
    while (1) {
        // Toggle LED every 2 seconds to show system is alive
        if (gpio_is_ready_dt(&led) && audio_system_running) {
            if ((loop_count % 200) == 0) {  // Every 2 seconds
                static bool led_state = false;
                led_state = !led_state;
                gpio_pin_set_dt(&led, led_state ? 1 : 0);
            }
        }
        
        // Print status every 30 seconds
        if ((loop_count % 3000) == 0) {
            print_audio_stats();
        }
        
        loop_count++;
        k_msleep(10);
    }
    
    return 0;
}
