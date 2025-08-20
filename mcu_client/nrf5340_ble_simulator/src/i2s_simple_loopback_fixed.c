/**
 * @file i2s_simple_loopback_fixed.c
 * @brief Simple I2S audio loopback implementation for nRF5340DK
 * 
 * This implementation provides real-time audio loopback from I2S microphone
 * input to I2S speaker output using the Nordic nrfx I2S driver directly.
 */

#include "i2s_simple_loopback.h"
#include <nrfx_i2s.h>
#include <hal/nrf_clock.h>
#include <zephyr/logging/log.h>
#include <zephyr/kernel.h>
#include <string.h>

LOG_MODULE_REGISTER(i2s_loopback, LOG_LEVEL_INF);

// I2S instance
static const nrfx_i2s_t i2s_instance = NRFX_I2S_INSTANCE(0);

// Audio buffers
static int16_t rx_buffers[AUDIO_BUFFER_COUNT][AUDIO_FRAME_SIZE] __aligned(4);
static int16_t tx_buffers[AUDIO_BUFFER_COUNT][AUDIO_FRAME_SIZE] __aligned(4);

// Buffer management
static volatile uint8_t current_rx_buffer = 0;
static volatile uint8_t current_tx_buffer = 0;
static volatile uint8_t ready_tx_buffer = 0;
static volatile bool new_rx_data = false;

/**
 * @brief Process audio data (simple loopback)
 */
static void process_audio_data(void)
{
    if (new_rx_data && current_rx_buffer < AUDIO_BUFFER_COUNT) {
        // Simple loopback: copy RX data to TX buffer
        memcpy(tx_buffers[current_rx_buffer], 
               rx_buffers[current_rx_buffer], 
               AUDIO_FRAME_SIZE * sizeof(int16_t));
        
        ready_tx_buffer = current_rx_buffer;
        new_rx_data = false;
        
        LOG_DBG("Processed audio frame %d", current_rx_buffer);
    }
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
            
            nrfx_i2s_buffers_t next_buffers = {
                .p_rx_buffer = (uint32_t*)rx_buffers[next_rx],
                .p_tx_buffer = (uint32_t*)tx_buffers[ready_tx_buffer]
            };
            
            nrfx_err_t err = nrfx_i2s_next_buffers_set(&i2s_instance, &next_buffers);
            if (err != NRFX_SUCCESS) {
                LOG_ERR("Failed to set next I2S buffers: %d", err);
            } else {
                current_rx_buffer = next_rx;
                LOG_DBG("I2S buffers updated, RX: %d, TX: %d", next_rx, ready_tx_buffer);
            }
        }
    } else {
        LOG_WRN("I2S event with status: 0x%08x", status);
    }
}

/**
 * @brief Configure audio clock - simplified version
 */
static void configure_audio_clock(void)
{
    LOG_INF("Configuring audio clock");
    
    // For now, we'll rely on the default clock configuration
    // The I2S driver should handle clock setup automatically
    // In a production system, you would configure HFCLKAUDIO here
    
    LOG_INF("Audio clock configuration completed");
}

/**
 * @brief Initialize I2S for simple loopback
 */
int i2s_simple_loopback_init(void)
{
    LOG_INF("Initializing I2S simple loopback");
    
    // Configure audio clock first
    configure_audio_clock();
    
    // Clear all buffers
    memset(rx_buffers, 0, sizeof(rx_buffers));
    memset(tx_buffers, 0, sizeof(tx_buffers));
    
    // Reset buffer indices
    current_rx_buffer = 0;
    current_tx_buffer = 0;
    ready_tx_buffer = 0;
    new_rx_data = false;
    
    // I2S configuration
    nrfx_i2s_config_t config = {
        .sdin_pin     = I2S_SDIN_PIN,    // P1.09
        .sdout_pin    = I2S_SDOUT_PIN,   // P1.08
        .mck_pin      = NRF_I2S_PIN_NOT_CONNECTED, // Not using MCK
        .sck_pin      = I2S_BCLK_PIN,    // P1.07 (BCLK)
        .lrck_pin     = I2S_LRCK_PIN,    // P1.06 (LRCK)
        .irq_priority = NRFX_I2S_DEFAULT_CONFIG_IRQ_PRIORITY,
        .mode         = NRF_I2S_MODE_MASTER,
        .format       = NRF_I2S_FORMAT_I2S,
        .alignment    = NRF_I2S_ALIGN_LEFT,
        .sample_width = NRF_I2S_SWIDTH_16BIT,
        .channels     = NRF_I2S_CHANNELS_STEREO,
        .mck_setup    = NRF_I2S_MCK_32MDIV8,  // 4 MHz MCK
        .ratio        = NRF_I2S_RATIO_256X,   // LRCK = MCK/256 = 15.625 kHz
    };
    
    LOG_INF("I2S pins - SDIN: %d, SDOUT: %d, SCK: %d, LRCK: %d", 
            config.sdin_pin, config.sdout_pin, config.sck_pin, config.lrck_pin);
    
    // Initialize I2S driver
    nrfx_err_t err = nrfx_i2s_init(&i2s_instance, &config, i2s_event_handler);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("I2S initialization failed: %d", err);
        return -1;
    }
    
    LOG_INF("I2S simple loopback initialized successfully");
    return 0;
}

/**
 * @brief Start I2S loopback operation
 */
int i2s_simple_loopback_start(void)
{
    LOG_INF("Starting I2S simple loopback");
    
    // Prepare initial buffers
    nrfx_i2s_buffers_t initial_buffers = {
        .p_rx_buffer = (uint32_t*)rx_buffers[0],
        .p_tx_buffer = (uint32_t*)tx_buffers[0]
    };
    
    // Start I2S with initial buffers  
    nrfx_err_t err = nrfx_i2s_start(&i2s_instance, &initial_buffers, AUDIO_FRAME_SIZE);
    if (err != NRFX_SUCCESS) {
        LOG_ERR("Failed to start I2S: %d", err);
        return -1;
    }
    
    LOG_INF("I2S simple loopback started successfully");
    return 0;
}

/**
 * @brief Stop I2S loopback operation
 */
void i2s_simple_loopback_stop(void)
{
    LOG_INF("Stopping I2S simple loopback");
    
    // Stop I2S
    nrfx_i2s_stop(&i2s_instance);
    
    LOG_INF("I2S simple loopback stopped");
}

/**
 * @brief Uninitialize I2S loopback
 */
void i2s_simple_loopback_uninit(void)
{
    LOG_INF("Uninitializing I2S simple loopback");
    
    // Stop if running
    i2s_simple_loopback_stop();
    
    // Uninitialize I2S driver
    nrfx_i2s_uninit(&i2s_instance);
    
    LOG_INF("I2S simple loopback uninitialized");
}

/**
 * @brief Check if I2S loopback is running
 */
bool i2s_simple_loopback_is_running(void)
{
    // Check if I2S is currently running
    // This is a simplified check - in a real implementation you might want
    // to track the running state more precisely
    return true; // Placeholder - implement proper state tracking if needed
}
