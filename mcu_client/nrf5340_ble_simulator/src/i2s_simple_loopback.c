/**
 * @file i2s_simple_loopback.c
 * @brief Simple I2S Audio Loopback using nrfx_i2s directly
 * 
 * Based on MentraOS approach - uses nrfx_i2s directly to avoid Zephyr conflicts
 * Implements real-time microphone input to speaker output loopback
 */

#include "i2s_simple_loopback.h"
#include <zephyr/logging/log.h>
#include <zephyr/kernel.h>
#include <hal/nrf_gpio.h>
#include <hal/nrf_i2s.h>
#include <nrfx_i2s.h>
#include <nrfx_clock.h>

LOG_MODULE_REGISTER(i2s_simple_loopback, LOG_LEVEL_INF);

// Audio buffers for ping-pong operation
static int16_t rx_buffers[AUDIO_BUFFER_COUNT][AUDIO_FRAME_SIZE * AUDIO_CHANNELS];
static int16_t tx_buffers[AUDIO_BUFFER_COUNT][AUDIO_FRAME_SIZE * AUDIO_CHANNELS];

// Buffer management
static volatile uint8_t current_rx_buffer = 0;
static volatile uint8_t current_tx_buffer = 0;
static volatile uint8_t ready_tx_buffer = 0;
static volatile bool new_rx_data = false;

// System state
static volatile bool is_running = false;
static volatile bool is_initialized = false;

// I2S instance
static nrfx_i2s_t i2s_instance = NRFX_I2S_INSTANCE(0);

/**
 * @brief Copy and process audio data from RX to TX buffer
 */
static void process_audio_data(void)
{
    // Simple loopback - copy RX data to TX buffer
    memcpy(tx_buffers[ready_tx_buffer], 
           rx_buffers[current_rx_buffer], 
           AUDIO_BUFFER_SIZE);
    
    // Optional: Apply volume scaling or other processing here
    // For now, just pass through the audio data
}

/**
 * @brief I2S event handler
 */
static void i2s_event_handler(nrfx_i2s_buffers_t const *p_released, uint32_t status)
{
    if (status == NRFX_I2S_STATUS_NEXT_BUFFERS_NEEDED) {
        // Process the received audio data
        if (p_released && p_released->p_rx_buffer) {
            new_rx_data = true;
            process_audio_data();
            
            // Prepare next buffers
            uint8_t next_rx = (current_rx_buffer + 1) % AUDIO_BUFFER_COUNT;
            uint8_t next_tx = (current_tx_buffer + 1) % AUDIO_BUFFER_COUNT;
            
            nrfx_i2s_buffers_t next_buffers = {
                .p_rx_buffer = rx_buffers[next_rx],
                .p_tx_buffer = tx_buffers[ready_tx_buffer]
            };
            
            nrfx_err_t err = nrfx_i2s_next_buffers_set(&next_buffers);
            if (err != NRFX_SUCCESS) {
                LOG_ERR("Failed to set next I2S buffers: %d", err);
            } else {
                current_rx_buffer = next_rx;
                current_tx_buffer = next_tx;
                ready_tx_buffer = (ready_tx_buffer + 1) % AUDIO_BUFFER_COUNT;
            }
        }
    } else {
        LOG_WRN("I2S event with status: 0x%08x", status);
    }
}

/**
 * @brief Configure audio clock (HFCLKAUDIO)
 */
static int configure_audio_clock(void)
{
    // Enable HFCLKAUDIO at 12.288 MHz (suitable for 16kHz audio)
    nrf_clock_hfclkaudio_config_set(NRF_CLOCK, NRF_CLOCK_HFCLKAUDIO_12_288_MHZ);
    nrf_clock_task_trigger(NRF_CLOCK, NRF_CLOCK_TASK_HFCLKAUDIOSTART);
    
    // Wait for HFCLKAUDIO to start
    while (!nrf_clock_event_check(NRF_CLOCK, NRF_CLOCK_EVENT_HFCLKAUDIOSTARTED)) {
        k_busy_wait(10);
    }
    
    LOG_INF("HFCLKAUDIO started at 12.288 MHz");
    return 0;
}

/**
 * @brief Configure I2S pins
 */
static void configure_i2s_pins(void)
{
    // Configure I2S pins
    nrf_gpio_cfg_output(I2S_LRCK_PIN);
    nrf_gpio_cfg_output(I2S_BCLK_PIN);
    nrf_gpio_cfg_output(I2S_SDOUT_PIN);
    nrf_gpio_cfg_input(I2S_SDIN_PIN, NRF_GPIO_PIN_NOPULL);
    
    LOG_INF("I2S pins configured: LRCK=%d, BCLK=%d, SDOUT=%d, SDIN=%d", 
            I2S_LRCK_PIN, I2S_BCLK_PIN, I2S_SDOUT_PIN, I2S_SDIN_PIN);
}

int i2s_simple_loopback_init(void)
{
    if (is_initialized) {
        LOG_WRN("I2S loopback already initialized");
        return 0;
    }
    
    LOG_INF("Initializing I2S simple loopback...");
    
    // Configure audio clock first
    int ret = configure_audio_clock();
    if (ret < 0) {
        LOG_ERR("Failed to configure audio clock: %d", ret);
        return ret;
    }
    
    // Configure I2S pins
    configure_i2s_pins();
    
    // Initialize audio buffers to zero
    memset(rx_buffers, 0, sizeof(rx_buffers));
    memset(tx_buffers, 0, sizeof(tx_buffers));
    
    // Configure I2S
    nrfx_i2s_config_t config = {
        .sck_pin      = I2S_BCLK_PIN,
        .lrck_pin     = I2S_LRCK_PIN,
        .mck_pin      = NRFX_I2S_PIN_NOT_USED,
        .sdout_pin    = I2S_SDOUT_PIN,
        .sdin_pin     = I2S_SDIN_PIN,
        .irq_priority = NRFX_I2S_DEFAULT_CONFIG_IRQ_PRIORITY,
        .mode         = NRF_I2S_MODE_MASTER,
        .format       = NRF_I2S_FORMAT_I2S,
        .alignment    = NRF_I2S_ALIGN_LEFT,
        .sample_width = NRF_I2S_SWIDTH_16BIT,
        .channels     = NRF_I2S_CHANNELS_STEREO,
        .mck_setup    = NRF_I2S_MCK_32MDIV8,  // 4MHz MCK for 16kHz sampling
        .ratio        = NRF_I2S_RATIO_256X,   // 4MHz / 256 = 15.625kHz (close to 16kHz)
    };
    
    // Initialize I2S driver
    nrfx_err_t err = nrfx_i2s_init(&i2s_instance, &config, i2s_event_handler);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("Failed to initialize I2S: %d", err);
        return -EIO;
    }
    
    // Reset buffer indices
    current_rx_buffer = 0;
    current_tx_buffer = 0;
    ready_tx_buffer = 1;
    new_rx_data = false;
    is_running = false;
    is_initialized = true;
    
    LOG_INF("I2S simple loopback initialized successfully");
    return 0;
}

int i2s_simple_loopback_start(void)
{
    if (!is_initialized) {
        LOG_ERR("I2S loopback not initialized");
        return -ENODEV;
    }
    
    if (is_running) {
        LOG_WRN("I2S loopback already running");
        return 0;
    }
    
    LOG_INF("Starting I2S simple loopback...");
    
    // Prepare initial buffers
    nrfx_i2s_buffers_t initial_buffers = {
        .p_rx_buffer = rx_buffers[0],
        .p_tx_buffer = tx_buffers[0]
    };
    
    // Start I2S transfer
    nrfx_err_t err = nrfx_i2s_start(&initial_buffers, AUDIO_FRAME_SIZE, 0);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("Failed to start I2S: %d", err);
        return -EIO;
    }
    
    is_running = true;
    LOG_INF("I2S simple loopback started successfully");
    return 0;
}

void i2s_simple_loopback_stop(void)
{
    if (!is_running) {
        LOG_WRN("I2S loopback not running");
        return;
    }
    
    LOG_INF("Stopping I2S simple loopback...");
    
    // Stop I2S
    nrfx_i2s_stop();
    is_running = false;
    
    LOG_INF("I2S simple loopback stopped");
}

bool i2s_simple_loopback_is_running(void)
{
    return is_running;
}
