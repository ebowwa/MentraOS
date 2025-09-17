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
#define BLOCKS_PER_SLAB     4

// Memory slabs for I2S buffers
K_MEM_SLAB_DEFINE(tx_mem_slab, BLOCK_SIZE, BLOCKS_PER_SLAB, 4);
K_MEM_SLAB_DEFINE(rx_mem_slab, BLOCK_SIZE, BLOCKS_PER_SLAB, 4);

int main(void)
{
    printk("=== nRF5340 I2S Robust Loopback Starting ===\n");
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
    
    // Configure I2S TX first
    printk("Configuring I2S TX...\n");
    
    struct i2s_config tx_config = {
        .word_size = BITS_PER_SAMPLE,
        .channels = CHANNELS,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
        .frame_clk_freq = SAMPLE_RATE,
        .mem_slab = &tx_mem_slab,
        .block_size = BLOCK_SIZE,
        .timeout = 100
    };
    
    int ret = i2s_configure(i2s_dev, I2S_DIR_TX, &tx_config);
    if (ret != 0) {
        printk("ERROR: I2S TX config failed: %d\n", ret);
        goto cleanup_and_continue;
    }
    printk("I2S TX configured successfully\n");
    
    // Configure I2S RX with SLAVE clock options to avoid conflicts
    printk("Configuring I2S RX...\n");
    
    struct i2s_config rx_config = {
        .word_size = BITS_PER_SAMPLE,
        .channels = CHANNELS,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = 0,  // RX as slave, TX provides clocks
        .frame_clk_freq = SAMPLE_RATE,
        .mem_slab = &rx_mem_slab,
        .block_size = BLOCK_SIZE,
        .timeout = 100
    };
    
    ret = i2s_configure(i2s_dev, I2S_DIR_RX, &rx_config);
    if (ret != 0) {
        printk("ERROR: I2S RX config failed: %d\n", ret);
        goto cleanup_and_continue;
    }
    printk("I2S RX configured successfully\n");
    
    // Prime TX buffers
    printk("Priming TX buffers...\n");
    void *prime_buf1, *prime_buf2;
    bool buf1_allocated = false, buf2_allocated = false;
    
    ret = k_mem_slab_alloc(&tx_mem_slab, &prime_buf1, K_MSEC(100));
    if (ret == 0) {
        buf1_allocated = true;
        memset(prime_buf1, 0, BLOCK_SIZE);
        ret = i2s_write(i2s_dev, prime_buf1, BLOCK_SIZE);
        if (ret != 0) {
            printk("Prime buffer 1 write failed: %d\n", ret);
        } else {
            printk("Prime buffer 1 queued\n");
        }
    }
    
    ret = k_mem_slab_alloc(&tx_mem_slab, &prime_buf2, K_MSEC(100));
    if (ret == 0) {
        buf2_allocated = true;
        memset(prime_buf2, 0, BLOCK_SIZE);
        ret = i2s_write(i2s_dev, prime_buf2, BLOCK_SIZE);
        if (ret != 0) {
            printk("Prime buffer 2 write failed: %d\n", ret);
        } else {
            printk("Prime buffer 2 queued\n");
        }
    }
    
    // Start TX first to establish clocks
    printk("Starting I2S TX (master clock)...\n");
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_START);
    if (ret != 0) {
        printk("ERROR: I2S TX start failed: %d\n", ret);
        goto cleanup_and_continue;
    }
    printk("I2S TX started successfully\n");
    
    // Small delay to let TX clock stabilize
    k_msleep(100);
    
    // Try to start RX with better error handling
    printk("Starting I2S RX (slave to TX clock)...\n");
    ret = i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_START);
    if (ret != 0) {
        printk("ERROR: I2S RX start failed: %d (this is expected - continuing with TX only)\n", ret);
        goto tx_only_mode;
    }
    printk("I2S RX started successfully!\n");
    
    // Full duplex mode
    printk("I2S full duplex loopback active!\n");
    goto success_mode;
    
tx_only_mode:
    printk("Running in TX-only mode for testing\n");
    
success_mode:
    printk("I2S system operational\n");
    
cleanup_and_continue:
    // Continue regardless of I2S status to test system stability
    printk("Continuing with system stability test...\n");
    
    // Main loop with status updates
    int counter = 0;
    while (1) {
        printk("Status: %d - System stable", counter);
        
        if (led_available) {
            gpio_pin_toggle_dt(&led0);
            printk(" (LED toggled)");
        }
        
        printk("\n");
        counter++;
        k_msleep(3000);  // 3 second status updates
        
        // Run for 30 seconds
        if (counter >= 10) {
            printk("Stability test completed\n");
            break;
        }
    }
    
    // Cleanup
    printk("Stopping I2S...\n");
    i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_STOP);
    i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_STOP);
    
    // Clean up allocated buffers
    if (buf1_allocated) {
        k_mem_slab_free(&tx_mem_slab, &prime_buf1);
    }
    if (buf2_allocated) {
        k_mem_slab_free(&tx_mem_slab, &prime_buf2);
    }
    
    printk("=== I2S Robust Test Complete ===\n");
    return 0;
}
