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
#define BLOCKS_PER_SLAB     4  // Reduced from 8 to 4

// Memory slabs for I2S buffers
K_MEM_SLAB_DEFINE(tx_mem_slab, BLOCK_SIZE, BLOCKS_PER_SLAB, 4);
K_MEM_SLAB_DEFINE(rx_mem_slab, BLOCK_SIZE, BLOCKS_PER_SLAB, 4);

// Working thread for I2S processing
static K_THREAD_STACK_DEFINE(i2s_thread_stack, 2048);
static struct k_thread i2s_thread_data;
static k_tid_t i2s_thread_id;

static volatile bool i2s_running = false;

void i2s_processing_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);
    
    void *rx_buf, *tx_buf;
    size_t rx_size, tx_size;
    int ret;
    
    printk("I2S processing thread started\n");
    
    while (i2s_running) {
        // Try to read audio data
        ret = i2s_read(i2s_dev, &rx_buf, &rx_size);
        if (ret == 0 && rx_buf != NULL) {
            printk("Read %d bytes from I2S\n", rx_size);
            
            // Get a TX buffer 
            ret = k_mem_slab_alloc(&tx_mem_slab, &tx_buf, K_MSEC(100));
            if (ret == 0) {
                // Copy RX data to TX buffer (simple loopback)
                memcpy(tx_buf, rx_buf, rx_size);
                
                // Write to I2S
                ret = i2s_write(i2s_dev, tx_buf, rx_size);
                if (ret != 0) {
                    printk("I2S write failed: %d\n", ret);
                    k_mem_slab_free(&tx_mem_slab, &tx_buf);
                }
            } else {
                printk("TX buffer allocation failed: %d\n", ret);
            }
            
            // Return RX buffer to pool
            k_mem_slab_free(&rx_mem_slab, &rx_buf);
        } else if (ret != -EAGAIN) {
            printk("I2S read failed: %d\n", ret);
            k_msleep(10);  // Small delay on error
        }
        
        // Small yield to prevent tight loop
        k_yield();
    }
    
    printk("I2S processing thread ended\n");
}

int main(void)
{
    printk("=== nRF5340 I2S Working Loopback Starting ===\n");
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
    
    // Configure I2S with smaller timeout and proper settings
    printk("Configuring I2S...\n");
    
    struct i2s_config config = {
        .word_size = BITS_PER_SAMPLE,
        .channels = CHANNELS,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER,
        .frame_clk_freq = SAMPLE_RATE,
        .mem_slab = &tx_mem_slab,
        .block_size = BLOCK_SIZE,
        .timeout = 100  // Reduced timeout
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
    
    // Pre-allocate and prime TX buffers
    printk("Priming TX buffers...\n");
    for (int i = 0; i < 2; i++) {
        void *prime_buf;
        ret = k_mem_slab_alloc(&tx_mem_slab, &prime_buf, K_MSEC(100));
        if (ret == 0) {
            memset(prime_buf, 0, BLOCK_SIZE);  // Silent audio
            ret = i2s_write(i2s_dev, prime_buf, BLOCK_SIZE);
            if (ret != 0) {
                printk("Failed to prime TX buffer %d: %d\n", i, ret);
                k_mem_slab_free(&tx_mem_slab, &prime_buf);
                break;
            }
        }
    }
    
    // Start I2S transfers
    printk("Starting I2S transfers...\n");
    
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_START);
    if (ret != 0) {
        printk("ERROR: I2S TX start failed: %d\n", ret);
        return -1;
    }
    printk("I2S TX started\n");
    
    ret = i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_START);
    if (ret != 0) {
        printk("ERROR: I2S RX start failed: %d\n", ret);
        return -1;
    }
    printk("I2S RX started successfully!\n");
    
    // Start processing thread
    i2s_running = true;
    i2s_thread_id = k_thread_create(&i2s_thread_data, i2s_thread_stack,
                                    K_THREAD_STACK_SIZEOF(i2s_thread_stack),
                                    i2s_processing_thread,
                                    NULL, NULL, NULL,
                                    K_PRIO_PREEMPT(5), 0, K_NO_WAIT);
    
    printk("I2S loopback system started! Speaking into mic should be heard on speaker.\n");
    
    // Main loop with status updates
    int counter = 0;
    while (1) {
        printk("Status: %d - I2S loopback running", counter);
        
        if (led_available) {
            gpio_pin_toggle_dt(&led0);
            printk(" (LED toggled)");
        }
        
        printk("\n");
        counter++;
        k_msleep(5000);  // 5 second status updates
        
        // Run for 60 seconds for testing
        if (counter >= 12) {
            printk("Test period completed, stopping I2S...\n");
            break;
        }
    }
    
    // Stop I2S and cleanup
    i2s_running = false;
    k_thread_join(i2s_thread_id, K_FOREVER);
    
    i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_STOP);
    i2s_trigger(i2s_dev, I2S_DIR_RX, I2S_TRIGGER_STOP);
    
    printk("=== I2S Loopback Test Complete ===\n");
    return 0;
}
