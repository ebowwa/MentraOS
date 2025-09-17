#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

int main(void)
{
    // Simplest possible test - just UART output with printk
    printk("=== nRF5340 UART Test Starting ===\n");
    printk("Board: %s\n", CONFIG_BOARD);
    printk("Simple counter test - if you see this, UART is working\n");
    
    // Simple counter loop
    int counter = 0;
    while (1) {
        printk("Counter: %d - System is alive\n", counter++);
        k_msleep(2000);  // 2 second delay
        
        // Exit after 10 iterations for testing
        if (counter >= 10) {
            printk("Test completed successfully!\n");
            break;
        }
    }
    
    printk("=== Test Complete ===\n");
    return 0;
}
