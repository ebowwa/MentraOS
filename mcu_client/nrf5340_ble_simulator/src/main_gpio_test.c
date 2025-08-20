#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/drivers/gpio.h>

// LED pin definitions for nRF5340DK
#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led0 = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

int main(void)
{
    printk("=== nRF5340 GPIO + UART Test Starting ===\n");
    printk("Board: %s\n", CONFIG_BOARD);
    
    // Try to initialize LED
    bool led_available = false;
    if (gpio_is_ready_dt(&led0)) {
        int ret = gpio_pin_configure_dt(&led0, GPIO_OUTPUT_ACTIVE);
        if (ret == 0) {
            led_available = true;
            printk("LED initialized successfully\n");
        } else {
            printk("LED initialization failed: %d\n", ret);
        }
    } else {
        printk("LED device not ready\n");
    }
    
    printk("Starting GPIO + counter test...\n");
    
    // Counter loop with LED blink
    int counter = 0;
    while (1) {
        printk("Counter: %d - System alive", counter);
        
        if (led_available) {
            int ret = gpio_pin_toggle_dt(&led0);
            if (ret == 0) {
                printk(" (LED toggled)");
            } else {
                printk(" (LED toggle failed: %d)", ret);
            }
        }
        
        printk("\n");
        counter++;
        k_msleep(1000);  // 1 second delay
        
        // Exit after 15 iterations for testing
        if (counter >= 15) {
            printk("GPIO test completed successfully!\n");
            break;
        }
    }
    
    printk("=== Test Complete ===\n");
    return 0;
}
