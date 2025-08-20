/**
 * @file main_minimal_test.c
 * @brief Minimal test main function to debug the freeze issue
 * 
 * This is a very basic main function to test if the system boots properly
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>

LOG_MODULE_REGISTER(minimal_test, LOG_LEVEL_INF);

// LED control for basic status indication
#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

int main(void)
{
    int counter = 0;
    bool led_state = false;
    
    // Basic system startup logging
    LOG_INF("=== nRF5340 Minimal Test Starting ===");
    LOG_INF("System booted successfully!");
    LOG_INF("Zephyr version: %s", KERNEL_VERSION_STRING);
    
    // Try to initialize LED (non-blocking)
    if (device_is_ready(led.port)) {
        int ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
        if (ret == 0) {
            LOG_INF("LED initialized successfully");
        } else {
            LOG_ERR("LED initialization failed: %d", ret);
        }
    } else {
        LOG_WRN("LED device not ready");
    }
    
    LOG_INF("Entering main loop...");
    
    // Simple main loop with heartbeat
    while (1) {
        counter++;
        
        // Log heartbeat every 10 seconds
        if (counter % 20 == 0) {
            LOG_INF("Heartbeat: %d seconds alive", counter / 2);
        }
        
        // Blink LED every second if available
        if (device_is_ready(led.port)) {
            gpio_pin_set_dt(&led, led_state);
            led_state = !led_state;
        }
        
        // Sleep for 500ms
        k_sleep(K_MSEC(500));
    }
    
    return 0;
}
