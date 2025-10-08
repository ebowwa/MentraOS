/*
 * XIP (Execute-in-Place) Shell Commands for nRF5340
 * 
 * This file provides Zephyr shell commands to test and demonstrate
 * XIP functionality on the nRF5340 with external SPI NOR flash.
 * 
 * Commands available:
 * - xip test      - Test XIP function execution
 * - xip memcheck  - Validate XIP memory ranges  
 * - xip perf      - XIP performance test
 * - xip vartest   - XIP variable access test
 * - xip info      - Show XIP system information
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/printk.h>
#include <stdlib.h>
#include <string.h>

LOG_MODULE_REGISTER(xip_shell, LOG_LEVEL_INF);

// External references to XIP functions and variables from extern_code.c
extern void function_in_extern_flash(void);
extern void test_extern_flash(void);
extern uint32_t var_ext_sram_data;

// XIP memory range definitions (from pm_static.yml)
#define XIP_FLASH_START_ADDR    0x80000000  // External flash XIP region start
#define XIP_FLASH_SIZE          0x800000    // 8MB external flash
#define XIP_FLASH_END_ADDR      (XIP_FLASH_START_ADDR + XIP_FLASH_SIZE - 1)

/**
 * @brief Test basic XIP function execution
 */
static int cmd_xip_test(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "🧪 XIP Function Execution Test");
    shell_print(sh, "================================");
    
    // Get function addresses
    void *func1_addr = (void*)&function_in_extern_flash;
    void *func2_addr = (void*)&test_extern_flash;
    
    shell_print(sh, "📍 Function addresses:");
    shell_print(sh, "   function_in_extern_flash: %p", func1_addr);
    shell_print(sh, "   test_extern_flash: %p", func2_addr);
    
    // Check if functions are in XIP range
    bool func1_in_xip = ((uintptr_t)func1_addr >= XIP_FLASH_START_ADDR) && 
                        ((uintptr_t)func1_addr <= XIP_FLASH_END_ADDR);
    bool func2_in_xip = ((uintptr_t)func2_addr >= XIP_FLASH_START_ADDR) && 
                        ((uintptr_t)func2_addr <= XIP_FLASH_END_ADDR);
    
    shell_print(sh, "📊 Memory location analysis:");
    shell_print(sh, "   function_in_extern_flash in XIP: %s", func1_in_xip ? "✅ YES" : "❌ NO");
    shell_print(sh, "   test_extern_flash in XIP: %s", func2_in_xip ? "✅ YES" : "❌ NO");
    
    if (!func1_in_xip && !func2_in_xip) {
        shell_print(sh, "⚠️  Functions not in XIP range - they may be copied to RAM");
        shell_print(sh, "   Expected XIP range: 0x%08X - 0x%08X", 
                   XIP_FLASH_START_ADDR, XIP_FLASH_END_ADDR);
    }
    
    shell_print(sh, "🚀 Executing XIP functions...");
    
    // Execute the functions
    function_in_extern_flash();
    test_extern_flash();
    
    shell_print(sh, "✅ XIP function execution completed successfully!");
    return 0;
}

/**
 * @brief Validate XIP memory ranges and configuration
 */
static int cmd_xip_memcheck(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "🔍 XIP Memory Range Validation");
    shell_print(sh, "==============================");
    
    shell_print(sh, "📋 XIP Configuration:");
    shell_print(sh, "   XIP Flash Start: 0x%08X", XIP_FLASH_START_ADDR);
    shell_print(sh, "   XIP Flash Size:  0x%08X (%d MB)", XIP_FLASH_SIZE, XIP_FLASH_SIZE / (1024*1024));
    shell_print(sh, "   XIP Flash End:   0x%08X", XIP_FLASH_END_ADDR);
    
    // Test memory access in XIP range
    shell_print(sh, "🧪 Testing XIP memory access...");
    
    // Try to read from XIP region (this should work if XIP is properly configured)
    volatile uint32_t *xip_ptr = (volatile uint32_t*)XIP_FLASH_START_ADDR;
    
    shell_print(sh, "📖 Reading from XIP start address 0x%08X...", XIP_FLASH_START_ADDR);
    
    // Note: This might cause a fault if XIP is not properly set up
    // In a real implementation, you'd want to use a fault handler
    uint32_t test_value = *xip_ptr;
    shell_print(sh, "   Value read: 0x%08X", test_value);
    
    shell_print(sh, "✅ XIP memory validation completed");
    return 0;
}

/**
 * @brief XIP performance test
 */
static int cmd_xip_perf(const struct shell *sh, size_t argc, char **argv)
{
    uint32_t iterations = 1000;
    
    if (argc > 1) {
        iterations = strtoul(argv[1], NULL, 10);
        if (iterations == 0 || iterations > 100000) {
            shell_error(sh, "Invalid iterations. Use 1-100000");
            return -EINVAL;
        }
    }

    shell_print(sh, "⚡ XIP Performance Test");
    shell_print(sh, "======================");
    shell_print(sh, "📊 Running %u iterations...", iterations);
    
    // Get start time
    uint32_t start_time = k_cycle_get_32();
    
    // Execute XIP function multiple times
    for (uint32_t i = 0; i < iterations; i++) {
        function_in_extern_flash();
    }
    
    // Get end time
    uint32_t end_time = k_cycle_get_32();
    uint32_t cycles = end_time - start_time;
    
    // Calculate timing
    uint32_t freq = sys_clock_hw_cycles_per_sec();
    uint32_t total_us = (cycles * 1000000UL) / freq;
    uint32_t avg_us = total_us / iterations;
    
    shell_print(sh, "📈 Performance Results:");
    shell_print(sh, "   Total cycles: %u", cycles);
    shell_print(sh, "   Total time: %u μs", total_us);
    shell_print(sh, "   Average per call: %u μs", avg_us);
    shell_print(sh, "   Frequency: %u Hz", freq);
    
    if (avg_us < 10) {
        shell_print(sh, "🚀 Excellent XIP performance!");
    } else if (avg_us < 50) {
        shell_print(sh, "👍 Good XIP performance");
    } else {
        shell_print(sh, "⚠️  Slower XIP performance - check flash speed");
    }
    
    return 0;
}

/**
 * @brief Test XIP variable access
 */
static int cmd_xip_vartest(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "📝 XIP Variable Access Test");
    shell_print(sh, "===========================");
    
    // Get variable address
    void *var_addr = (void*)&var_ext_sram_data;
    shell_print(sh, "📍 Variable address: %p", var_addr);
    
    // Check if variable is in expected range (external SRAM/flash)
    bool var_in_xip = ((uintptr_t)var_addr >= XIP_FLASH_START_ADDR) && 
                      ((uintptr_t)var_addr <= XIP_FLASH_END_ADDR);
    
    shell_print(sh, "📊 Variable location:");
    shell_print(sh, "   var_ext_sram_data in XIP range: %s", var_in_xip ? "✅ YES" : "❌ NO");
    
    // Read current value
    uint32_t current_value = var_ext_sram_data;
    shell_print(sh, "📖 Current value: 0x%08X (%u)", current_value, current_value);
    
    // Test write/read (if variable is in writable memory)
    shell_print(sh, "🧪 Testing variable modification...");
    uint32_t test_value = 0xDEADBEEF;
    uint32_t original_value = var_ext_sram_data;
    
    var_ext_sram_data = test_value;
    uint32_t read_back = var_ext_sram_data;
    
    shell_print(sh, "   Wrote: 0x%08X", test_value);
    shell_print(sh, "   Read:  0x%08X", read_back);
    
    if (read_back == test_value) {
        shell_print(sh, "✅ Variable write/read successful!");
    } else {
        shell_print(sh, "❌ Variable write/read failed (may be in read-only memory)");
    }
    
    // Restore original value
    var_ext_sram_data = original_value;
    shell_print(sh, "🔄 Restored original value: 0x%08X", original_value);
    
    return 0;
}

/**
 * @brief Show XIP system information
 */
static int cmd_xip_info(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);

    shell_print(sh, "ℹ️  XIP System Information");
    shell_print(sh, "==========================");
    
    shell_print(sh, "🔧 XIP Configuration:");
    shell_print(sh, "   External Flash Base: 0x%08X", XIP_FLASH_START_ADDR);
    shell_print(sh, "   Flash Size: %d MB", XIP_FLASH_SIZE / (1024*1024));
    shell_print(sh, "   Address Range: 0x%08X - 0x%08X", 
               XIP_FLASH_START_ADDR, XIP_FLASH_END_ADDR);
    
    shell_print(sh, "📋 Available XIP Functions:");
    shell_print(sh, "   function_in_extern_flash() - Test function in external flash");
    shell_print(sh, "   test_extern_flash() - Extended XIP test function");
    
    shell_print(sh, "📋 Available XIP Variables:");
    shell_print(sh, "   var_ext_sram_data - Test variable in external memory");
    
    shell_print(sh, "🎯 XIP Benefits:");
    shell_print(sh, "   • Reduces RAM usage by executing code from flash");
    shell_print(sh, "   • Enables larger applications on MCUs");
    shell_print(sh, "   • Transparent execution - no code changes needed");
    
    shell_print(sh, "⚙️  Implementation Details:");
    shell_print(sh, "   • Uses nRF5340 QSPI for external flash access");
    shell_print(sh, "   • Code relocated via Zephyr CMake directives");
    shell_print(sh, "   • Memory management via partition manager");
    
    return 0;
}

// XIP shell command structure
SHELL_STATIC_SUBCMD_SET_CREATE(xip_cmds,
    SHELL_CMD(test, NULL, "Test XIP function execution", cmd_xip_test),
    SHELL_CMD(memcheck, NULL, "Validate XIP memory ranges", cmd_xip_memcheck),
    SHELL_CMD(perf, NULL, "XIP performance test [iterations]", cmd_xip_perf),
    SHELL_CMD(vartest, NULL, "Test XIP variable access", cmd_xip_vartest),
    SHELL_CMD(info, NULL, "Show XIP system information", cmd_xip_info),
    SHELL_SUBCMD_SET_END
);

SHELL_CMD_REGISTER(xip, &xip_cmds, "XIP (Execute-in-Place) test commands", NULL);