#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/i2s.h>
#include <zephyr/device.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

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
#define BLOCKS_PER_SLAB     10  // Plenty of buffers

// Memory slabs for I2S buffers
K_MEM_SLAB_DEFINE(tx_mem_slab, BLOCK_SIZE, BLOCKS_PER_SLAB, 4);

// Tone generation
static uint32_t tone_phase = 0;
#define TONE_FREQ_HZ        440  // A4 note
#define AMPLITUDE           4096 // 12.5% of max 16-bit

void generate_tone_buffer(int16_t *buffer, size_t samples)
{
    for (size_t i = 0; i < samples; i += 2) {
        // Generate sine wave
        double phase_rad = (double)tone_phase * 2.0 * M_PI / SAMPLE_RATE;
        int16_t sample = (int16_t)(AMPLITUDE * sin(phase_rad * TONE_FREQ_HZ));
        
        // Stereo - same sample for both channels
        buffer[i] = sample;     // Left channel
        buffer[i + 1] = sample; // Right channel
        
        tone_phase++;
        if (tone_phase >= SAMPLE_RATE) {
            tone_phase = 0;
        }
    }
}

int main(void)
{
    printk("=== nRF5340 I2S TX Simple Continuous Audio ===\n");
    printk("Board: %s\n", CONFIG_BOARD);
    printk("Hardware: I2S Speaker on P1.05(MCLK), P1.06(LRK), P1.07(BCLK), P1.08(DIN)\n");
    printk("Generating %dHz tone on I2S TX output\n", TONE_FREQ_HZ);
    printk("Block size: %d bytes (%d samples)\n", BLOCK_SIZE, BLOCK_SIZE / BYTES_PER_SAMPLE);
    
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
    
    // Configure I2S TX with master clock enabled
    printk("Configuring I2S TX with master clock...\n");
    
    struct i2s_config tx_config = {
        .word_size = BITS_PER_SAMPLE,
        .channels = CHANNELS,
        .format = I2S_FMT_DATA_FORMAT_I2S,
        .options = I2S_OPT_BIT_CLK_MASTER | I2S_OPT_FRAME_CLK_MASTER | I2S_OPT_PINGPONG,
        .frame_clk_freq = SAMPLE_RATE,
        .mem_slab = &tx_mem_slab,
        .block_size = BLOCK_SIZE,
        .timeout = 1000
    };
    
    int ret = i2s_configure(i2s_dev, I2S_DIR_TX, &tx_config);
    if (ret != 0) {
        printk("ERROR: I2S TX config failed: %d\n", ret);
        return -1;
    }
    printk("I2S TX configured successfully\n");
    
    // Pre-fill some buffers
    printk("Pre-filling audio buffers...\n");
    
    for (int i = 0; i < 6; i++) {
        void *buf;
        ret = k_mem_slab_alloc(&tx_mem_slab, &buf, K_MSEC(100));
        if (ret == 0) {
            generate_tone_buffer((int16_t *)buf, BLOCK_SIZE / BYTES_PER_SAMPLE);
            ret = i2s_write(i2s_dev, buf, BLOCK_SIZE);
            if (ret == 0) {
                printk("Pre-filled buffer %d\n", i);
            } else {
                printk("Failed to pre-fill buffer %d: %d\n", i, ret);
                k_mem_slab_free(&tx_mem_slab, &buf);
                return -1;
            }
        } else {
            printk("Failed to allocate pre-fill buffer %d: %d\n", i, ret);
            return -1;
        }
    }
    
    // Start I2S TX
    printk("Starting I2S TX...\n");
    ret = i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_START);
    if (ret != 0) {
        printk("ERROR: I2S TX start failed: %d\n", ret);
        return -1;
    }
    printk("I2S TX started successfully!\n");
    printk("Audio should be playing on I2S speaker now...\n");
    
    // Simple continuous operation without buffer recycling
    int counter = 0;
    int total_buffers_sent = 6; // Already sent 6 pre-fill buffers
    
    while (counter < 100) { // Run for 10 seconds
        // Try to keep feeding new buffers
        void *buf;
        ret = k_mem_slab_alloc(&tx_mem_slab, &buf, K_NO_WAIT);
        if (ret == 0) {
            generate_tone_buffer((int16_t *)buf, BLOCK_SIZE / BYTES_PER_SAMPLE);
            ret = i2s_write(i2s_dev, buf, BLOCK_SIZE);
            if (ret == 0) {
                total_buffers_sent++;
            } else {
                k_mem_slab_free(&tx_mem_slab, &buf);
                // Don't print errors unless they're persistent
                if (counter % 10 == 0 && ret != -EAGAIN) {
                    printk("I2S write warning: %d (this may be normal for TX-only)\n", ret);
                }
            }
        }
        
        // Status update every second
        if (counter % 10 == 0) {
            printk("Status: %d sec - Sent %d buffers total", counter / 10, total_buffers_sent);
            if (led_available) {
                gpio_pin_toggle_dt(&led0);
                printk(" (LED toggled)");
            }
            printk("\n");
        }
        
        counter++;
        k_msleep(100);  // 100ms loop
    }
    
    // Stop I2S
    printk("Stopping I2S TX...\n");
    i2s_trigger(i2s_dev, I2S_DIR_TX, I2S_TRIGGER_STOP);
    
    printk("Audio test completed. Sent %d total buffers.\n", total_buffers_sent);
    
    if (total_buffers_sent > 20) {
        printk("SUCCESS: I2S TX working! Audio should have played.\n");
    } else {
        printk("LIMITED: Only %d buffers sent. May indicate hardware/config issue.\n", total_buffers_sent);
    }
    
    printk("=== I2S TX Simple Audio Test Complete ===\n");
    
    // Keep running to maintain I2S state for debugging
    printk("Keeping system running for debugging...\n");
    while (1) {
        if (led_available) {
            gpio_pin_toggle_dt(&led0);
        }
        k_msleep(1000);
    }
    
    return 0;
}
