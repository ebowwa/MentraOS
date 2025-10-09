/*
 * Simple logging helper commands 
 * Uses Zephyr's built-in log commands for most functionality
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/logging/log_ctrl.h>
#include <zephyr/logging/log.h>
#include <stdlib.h>

LOG_MODULE_REGISTER(log_helper, LOG_LEVEL_DBG);

// External reference to BSP log level
extern int bsp_log_runtime_level;

// External reference to ping logging control
extern bool ping_logging_enabled;

/**
 * Command: log_help
 * Shows how to use Zephyr's built-in logging commands
 */
static int cmd_log_help(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "=== ZEPHYR LOGGING QUICK REFERENCE ===");
    shell_print(shell, "");
    shell_print(shell, "🔧 Built-in Zephyr log commands (use these!):");
    shell_print(shell, "  log status                    - Show current log configuration");
    shell_print(shell, "  log halt                      - Stop all logging (clean shell!)");
    shell_print(shell, "  log go                        - Resume logging"); 
    shell_print(shell, "  log level set <level>         - Set global log level");
    shell_print(shell, "    Levels: none, err, wrn, inf, dbg");
    shell_print(shell, "  log enable <module> <level>   - Enable specific module");
    shell_print(shell, "  log disable <module>          - Disable specific module");
    shell_print(shell, "");
    shell_print(shell, "📱 Common modules in your project:");
    shell_print(shell, "  peripheral_uart, protobuf_handler, mentra_ble");
    shell_print(shell, "  pdm_audio_stream, bt_hci_core, bt_gatt");
    shell_print(shell, "");
    shell_print(shell, "🎯 Quick Solutions:");
    shell_print(shell, "  log halt                      - CLEAN SHELL (no logs)");
    shell_print(shell, "  log level set err             - Only errors");
    shell_print(shell, "  log level set wrn             - Errors + warnings");
    shell_print(shell, "  log level set inf             - Normal logging");
    shell_print(shell, "  log go                        - Resume after halt");
    shell_print(shell, "");
    shell_print(shell, "🛠️  BSP log level: %d (0=off, 1=err, 2=warn, 3=info, 4=dbg, 5=verbose)", 
                bsp_log_runtime_level);
    shell_print(shell, "");
    shell_print(shell, "🔔 Ping/Pong Control Commands:");
    shell_print(shell, "  ping_disable                  - Stop ping/pong logs (functionality remains)");
    shell_print(shell, "  ping_enable                   - Enable ping/pong logs");
    shell_print(shell, "  ping_status                   - Show ping logging status");
    shell_print(shell, "");
    shell_print(shell, " extern_xip                    - Test extern_xip function");
    shell_print(shell, " littlefs_shell                - Test littlefs shell");

    return 0;
}

/**
 * Command: bsp_level <level>
 * Sets BSP logging level (0-5) for legacy BSP logs
 */
static int cmd_bsp_level(const struct shell *shell, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(shell, "Usage: bsp_level <0-5>");
        shell_print(shell, "  0=off, 1=error, 2=warn, 3=info, 4=debug, 5=verbose");
        return -EINVAL;
    }
    
    int level = atoi(argv[1]);
    
    if (level < 0 || level > 5) {
        shell_error(shell, "Invalid level %d. Must be 0-5", level);
        return -EINVAL;
    }
    
    bsp_log_runtime_level = level;
    shell_print(shell, "✅ BSP log level set to %d", level);
    
    return 0;
}

/**
 * Command: ping_disable  
 * Disable ping/pong logging (keeps functionality but stops logs)
 */
static int cmd_ping_disable(const struct shell *shell, size_t argc, char **argv)
{
    ping_logging_enabled = false;
    shell_print(shell, "🔇 Ping/pong logging disabled (connectivity monitoring still active)");
    return 0;
}

/**
 * Command: ping_enable
 * Enable ping/pong logging
 */
static int cmd_ping_enable(const struct shell *shell, size_t argc, char **argv)
{
    ping_logging_enabled = true;
    shell_print(shell, "🔊 Ping/pong logging enabled");
    return 0;
}

/**
 * Command: ping_status
 * Show ping logging status
 */
static int cmd_ping_status(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "📊 Ping logging status: %s", 
                ping_logging_enabled ? "ENABLED" : "DISABLED");
    return 0;
}
/**
 * Command: extern_xip
 * Test extern_xip function
 */
static int cmd_extern_xip(const struct shell *shell, size_t argc, char **argv)
{
    extern void function_in_extern_flash(void);
    extern void test_extern_flash(void);
    shell_print(shell, "📊 test_extern_xip");
    test_extern_flash();
    function_in_extern_flash();
    return 0;
}
/**
 * Command: littlefs_shell
 * Test littlefs shell
 */
static int cmd_littlefs_shell(const struct shell *shell, size_t argc, char **argv)
{
    extern int littlefs_test(void);
    shell_print(shell, "📊 littlefs shell");
    littlefs_test();
    return 0;
}
// Register simple helper commands
SHELL_CMD_REGISTER(log_help, NULL, "Show Zephyr logging help", cmd_log_help);
SHELL_CMD_REGISTER(bsp_level, NULL, "Set BSP log level (0-5)", cmd_bsp_level);
SHELL_CMD_REGISTER(ping_disable, NULL, "Disable ping/pong logging", cmd_ping_disable);
SHELL_CMD_REGISTER(ping_enable, NULL, "Enable ping/pong logging", cmd_ping_enable);
SHELL_CMD_REGISTER(ping_status, NULL, "Show ping logging status", cmd_ping_status);
SHELL_CMD_REGISTER(extern_xip, NULL, "test extern_xip ", cmd_extern_xip);
SHELL_CMD_REGISTER(littlefs_shell, NULL, "littlefs shell", cmd_littlefs_shell);