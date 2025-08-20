/**
 * @file main_i2s_loopback.c
 * @brief Simple I2S loopback test main function
 * 
 * This is a simplified main function to test I2S loopback without LC3 conflicts
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include "i2s_simple_loopback.h"

LOG_MODULE_REGISTER(main_i2s_test, LOG_LEVEL_INF);

// LED control for status indication
#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

static void blink_led(void)
{
    static bool led_state = false;
    if (device_is_ready(led.port)) {
        gpio_pin_set_dt(&led, led_state);
        led_state = !led_state;
    }
}

int main(void)
{
    int ret;
    
    LOG_INF("=== nRF5340 I2S Simple Loopback Test ===");
    LOG_INF("Starting I2S microphone to speaker loopback...");
    
    // Initialize LED for status indication
    if (device_is_ready(led.port)) {
        gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
        LOG_INF("LED initialized for status indication");
    }
    
    // Wait a moment for system to stabilize
    k_sleep(K_MSEC(1000));
    
    // Initialize I2S loopback system
    ret = i2s_simple_loopback_init();
    if (ret < 0) {
        LOG_ERR("Failed to initialize I2S loopback: %d", ret);
        return ret;
    }
    
    // Start I2S loopback
    ret = i2s_simple_loopback_start();
    if (ret < 0) {
        LOG_ERR("Failed to start I2S loopback: %d", ret);
        return ret;
    }
    
    LOG_INF("I2S loopback running! Speak into microphone to hear output on speaker.");
    LOG_INF("Audio configuration: 16kHz, 16-bit, stereo");
    LOG_INF("LED will blink to indicate system is running");
    
    // Main loop - just monitor status and blink LED
    while (1) {
        // Blink LED to show system is alive
        blink_led();
        
        // Check if I2S is still running
        if (!i2s_simple_loopback_is_running()) {
            LOG_ERR("I2S loopback stopped unexpectedly!");
            break;
        }
        
        // Sleep for 500ms
        k_sleep(K_MSEC(500));
    }
    
    // If we get here, something went wrong
    i2s_simple_loopback_stop();
    LOG_ERR("I2S loopback test ended");
    
    return -1;
}
