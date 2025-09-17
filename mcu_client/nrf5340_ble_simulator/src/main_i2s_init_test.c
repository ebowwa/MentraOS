#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2s.h>
#include <zephyr/device.h>

// LED for status indication
#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led0 = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

// I2S device node
#define I2S_NODE DT_NODELABEL(i2s0)
static const struct device *i2s_dev = DEVICE_DT_GET(I2S_NODE);

int main(void)
{
    printk("=== nRF5340 I2S Init Test Starting ===\n");
    printk("Board: %s\n", CONFIG_BOARD);
    
    // Initialize LED
    bool led_available = false;
    if (gpio_is_ready_dt(&led0)) {
        int ret = gpio_pin_configure_dt(&led0, GPIO_OUTPUT_ACTIVE);
        if (ret == 0) {
            led_available = true;
            printk("LED initialized successfully\n");
        } else {
            printk("LED initialization failed: %d\n", ret);
        }
    }
    
    // Check I2S device availability
    printk("Checking I2S device...\n");
    if (!device_is_ready(i2s_dev)) {
        printk("ERROR: I2S device not ready!\n");
        return -1;
    } else {
        printk("I2S device is ready\n");
    }
    
    // Try basic I2S configuration - this is where the freeze might occur
    printk("Configuring I2S...\n");
    
    struct i2s_config config = {
        .word_size = 16,
        .channels = 2,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
        .frame_clk_freq = 16000,
        .mem_slab = NULL,  // No memory slab for this test
        .block_size = 0,   // No block size for this test
        .timeout = 1000
    };
    
    // Test configuration without starting transfers
    int ret = i2s_configure(i2s_dev, I2S_DIR_TX, &config);
    if (ret != 0) {
        printk("ERROR: I2S TX configuration failed: %d\n", ret);
        // Continue to see if we can still operate
    } else {
        printk("I2S TX configuration successful\n");
    }
    
    ret = i2s_configure(i2s_dev, I2S_DIR_RX, &config);
    if (ret != 0) {
        printk("ERROR: I2S RX configuration failed: %d\n", ret);
        // Continue to see if we can still operate
    } else {
        printk("I2S RX configuration successful\n");
    }
    
    printk("I2S basic configuration test completed\n");
    printk("Starting main loop - if you see this, I2S init didn't freeze the system\n");
    
    // Main loop with heartbeat
    int counter = 0;
    while (1) {
        printk("Counter: %d - System alive after I2S config", counter);
        
        if (led_available) {
            gpio_pin_toggle_dt(&led0);
            printk(" (LED toggled)");
        }
        
        printk("\n");
        counter++;
        k_msleep(2000);  // 2 second delay
        
        // Exit after 10 iterations for testing
        if (counter >= 10) {
            printk("I2S init test completed successfully!\n");
            break;
        }
    }
    
    printk("=== Test Complete ===\n");
    return 0;
}
