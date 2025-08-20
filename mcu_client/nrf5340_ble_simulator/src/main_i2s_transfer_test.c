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

// Audio configuration
#define SAMPLE_RATE         16000
#define CHANNELS            2
#define BITS_PER_SAMPLE     16
#define BYTES_PER_SAMPLE    (BITS_PER_SAMPLE / 8)
#define BLOCK_SIZE          (SAMPLE_RATE / 100 * CHANNELS * BYTES_PER_SAMPLE)  // 10ms blocks
#define BLOCKS_PER_SLAB     8

// Memory slabs for I2S buffers
K_MEM_SLAB_DEFINE(tx_mem_slab, BLOCK_SIZE, BLOCKS_PER_SLAB, 4);
K_MEM_SLAB_DEFINE(rx_mem_slab, BLOCK_SIZE, BLOCKS_PER_SLAB, 4);

int main(void)
{
    printk("=== nRF5340 I2S Transfer Test Starting ===\n");
    printk("Board: %s\n", CONFIG_BOARD);
    printk("Block size: %d bytes, Blocks per slab: %d\n", BLOCK_SIZE, BLOCKS_PER_SLAB);
    
    // Initialize LED
    bool led_available = false;
    if (gpio_is_ready_dt(&led0)) {
        int ret = gpio_pin_configure_dt(&led0, GPIO_OUTPUT_ACTIVE);
        if (ret == 0) {
            led_available = true;
            printk("LED initialized successfully\n");
        }
    }
    
    // Check I2S device
    if (!device_is_ready(i2s_dev)) {
        printk("ERROR: I2S device not ready!\n");
        return -1;
    }
    printk("I2S device is ready\n");
    
    // Configure I2S with memory slabs
    printk("Configuring I2S with memory slabs...\n");
    
    struct i2s_config config = {
        .word_size = BITS_PER_SAMPLE,
        .channels = CHANNELS,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
        .frame_clk_freq = SAMPLE_RATE,
        .mem_slab = &tx_mem_slab,
        .block_size = BLOCK_SIZE,
        .timeout = 1000
    };
    
    int ret = i2s_configure(i2s_dev, I2S_DIR_TX, &config);
    if (ret != 0) {
        printk("ERROR: I2S TX config failed: %d\n", ret);
        return -1;
    }
    printk("I2S TX configured\n");
    
    config.mem_slab = &rx_mem_slab;
    ret = i2s_configure(i2s_dev, I2S_DIR_RX, &config);
    if (ret != 0) {
        printk("ERROR: I2S RX config failed: %d\n", ret);
        return -1;
    }
    printk("I2S RX configured\n");
    
    // Test 1: Try to trigger TX start
    printk("TEST 1: Starting I2S TX trigger...\n");
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_START);
    if (ret != 0) {
        printk("ERROR: I2S TX trigger start failed: %d\n", ret);
    } else {
        printk("I2S TX trigger start successful\n");
    }
    
    printk("System alive after TX trigger - LED should blink\n");
    if (led_available) {
        gpio_pin_toggle_dt(&led0);
    }
    k_msleep(1000);
    
    // Test 2: Try to trigger RX start
    printk("TEST 2: Starting I2S RX trigger...\n");
    ret = i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_START);
    if (ret != 0) {
        printk("ERROR: I2S RX trigger start failed: %d\n", ret);
    } else {
        printk("I2S RX trigger start successful\n");
    }
    
    printk("System alive after RX trigger - LED should blink\n");
    if (led_available) {
        gpio_pin_toggle_dt(&led0);
    }
    k_msleep(1000);
    
    // Test 3: Try to read from RX
    printk("TEST 3: Attempting I2S read...\n");
    void *rx_buf;
    size_t rx_size;
    ret = i2s_read(i2s_dev, &rx_buf, &rx_size);
    if (ret != 0) {
        printk("ERROR: I2S read failed: %d\n", ret);
    } else {
        printk("I2S read successful, size: %d\n", rx_size);
        // Return buffer to slab
        k_mem_slab_free(&rx_mem_slab, &rx_buf);
    }
    
    printk("System alive after I2S read - LED should blink\n");
    if (led_available) {
        gpio_pin_toggle_dt(&led0);
    }
    k_msleep(1000);
    
    // Test 4: Stop triggers
    printk("TEST 4: Stopping I2S triggers...\n");
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_STOP);
    if (ret != 0) {
        printk("ERROR: I2S TX stop failed: %d\n", ret);
    } else {
        printk("I2S TX stopped\n");
    }
    
    ret = i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_STOP);
    if (ret != 0) {
        printk("ERROR: I2S RX stop failed: %d\n", ret);
    } else {
        printk("I2S RX stopped\n");
    }
    
    printk("I2S transfer tests completed!\n");
    printk("Starting main loop to confirm system stability...\n");
    
    // Main loop with heartbeat
    int counter = 0;
    while (1) {
        printk("Counter: %d - System alive after I2S transfer tests", counter);
        
        if (led_available) {
            gpio_pin_toggle_dt(&led0);
            printk(" (LED toggled)");
        }
        
        printk("\n");
        counter++;
        k_msleep(2000);
        
        // Exit after 5 iterations for testing
        if (counter >= 5) {
            printk("I2S transfer test completed successfully!\n");
            break;
        }
    }
    
    printk("=== Test Complete ===\n");
    return 0;
}
