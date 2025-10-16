/*
 * Shell Display Control Module
 * 
 * Manual display control commands for nRF5340 BLE Simulator
 * Supporting both A6N projector and SSD1306 OLED displays
 * 
 * Available Commands:
 * - display help                    : Show all display commands
 * - display brightness <0-100>      : Set display brightness
 * - display clear                   : Clear display
 * - display text "string" <x> <y> <size> : Write text at position with font size
 * - display info                    : Show display information
 * - display test                    : Run display test patterns
 * 
 * Created: 2025-09-30
 * Author: MentraOS Team
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/logging/log.h>
#include <zephyr/device.h>
#include <string.h>
#include <stdlib.h>

// Include LVGL for text rendering
#include <lvgl.h>

// Include A6N driver for brightness control
#include "../custom_driver_module/drivers/display/lcd/a6n.h"

// Include display manager for font mapping
#include "display_manager.h"

// Include MOS LVGL display functions
#include "mos_lvgl_display.h"

// Include protobuf handler for battery functions
#include "protobuf_handler.h"

// External declaration for LVGL display message queue
extern struct k_msgq lvgl_display_msgq;

LOG_MODULE_REGISTER(shell_display, LOG_LEVEL_INF);

// Helper function to map font sizes to available fonts
static const lv_font_t *get_font_by_size(int size)
{
    switch (size) {
        case 12: return &lv_font_montserrat_12;
        case 14: return &lv_font_montserrat_14;
        default: return &lv_font_montserrat_14; // Default to 14
    }
}

/**
 * Display help command
 */
static int cmd_display_help(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "");
    shell_print(shell, "🖥️  Display Control Commands:");
    shell_print(shell, "");
    shell_print(shell, "📋 Basic Commands:");
    shell_print(shell, "  display help                     - Show this help menu");
    shell_print(shell, "  display info                     - Show display information");
    shell_print(shell, "  display clear                    - Clear entire display (black)");
    shell_print(shell, "  display fill                     - Fill entire display (white)");
    shell_print(shell, "");
    shell_print(shell, "🔆 Brightness Control:");
    shell_print(shell, "  display brightness <20|40|60|80|100> - Set display brightness (5 levels)");
    shell_print(shell, "");
    shell_print(shell, "🎨 Pattern Control:");
    shell_print(shell, "  display pattern <0-5>            - Select specific pattern:");
    shell_print(shell, "    • 0: Chess pattern");
    shell_print(shell, "    • 1: Horizontal zebra");
    shell_print(shell, "    • 2: Vertical zebra");
    shell_print(shell, "    • 3: Scrolling welcome text");
    shell_print(shell, "    • 4: Protobuf text container (default)");
    shell_print(shell, "    • 5: XY text positioning area");
    shell_print(shell, "");
    shell_print(shell, "✏️  Text Commands:");
    shell_print(shell, "  display text \"Hello\"              - Text overlay (center position, for patterns)");
    shell_print(shell, "  display text \"Hello\" <x> <y> <size> - Write text at specific position");
    shell_print(shell, "    • Text must be in quotes: \"Hello World\"");
    shell_print(shell, "    • x, y: pixel coordinates (0,0 = top-left)");
    shell_print(shell, "    • size: font size (12, 14) - only these sizes available");
    shell_print(shell, "");
    shell_print(shell, "🔋 Battery Control:");
    shell_print(shell, "  display battery <level> [charging] - Set battery level and charging state");
    shell_print(shell, "    • level: 0-100 (percentage)");
    shell_print(shell, "    • charging: true/false (optional, default: false)");
    shell_print(shell, "");
    shell_print(shell, "🧪 Test Commands:");
    shell_print(shell, "  display test                     - Run display test patterns");
    shell_print(shell, "");
    shell_print(shell, "Examples:");
    shell_print(shell, "  display brightness 60            - Set brightness to 60%%");
    shell_print(shell, "  display pattern 2                - Show vertical zebra pattern");
    shell_print(shell, "  display battery 65               - Set 65%% battery, not charging");
    shell_print(shell, "  display battery 85 true          - Set 85%% battery, charging");
    shell_print(shell, "  display text \"Pattern 3\"          - Overlay text on current pattern");
    shell_print(shell, "  display text \"MentraOS\" 10 20 14  - Write 'MentraOS' at (10,20) with size 14");
    shell_print(shell, "  display clear                    - Clear the screen");
    shell_print(shell, "  display fill                     - Fill screen with white");
    shell_print(shell, "");
    
    return 0;
}

/**
 * Display info command
 */
static int cmd_display_info(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "");
    shell_print(shell, "🖥️  Display Information:");
    shell_print(shell, "");
    shell_print(shell, "📱 System: MentraOS nRF5340 BLE Simulator");
    shell_print(shell, "📏 A6N Resolution: 640x480 pixels");
    shell_print(shell, "📏 SSD1306 Resolution: 128x64 pixels");
    shell_print(shell, "🎨 Pixel Format: MONO (1-bit)");
    shell_print(shell, "🔆 Brightness Support: Yes (A6N)");
    shell_print(shell, "� Available Fonts: 12px, 14px");
    shell_print(shell, "");
    
    return 0;
}

/**
 * Display brightness command
 */
/**
 * @brief 设置显示亮度 | Set display brightness
 * 
 * 根据A6N手册6.4节 | Per A6N manual section 6.4:
 * - 最大值为0xE2寄存器默认值（上电后读取）| Max value is 0xE2 register default (read after power-on)
 * - 相邻等级差值最小为2 | Minimum difference between adjacent levels is 2
 * - 最多支持64级亮度可调 | Up to 64 brightness levels supported
 * 
 * Shell命令将0-100%映射到实际寄存器值 | Shell command maps 0-100% to actual register value
 */
/**
 * @brief 设置显示亮度 (5档位) | Set display brightness (5 levels)
 * 
 * 支持的亮度档位 | Supported brightness levels:
 * - 20%  (0x33)
 * - 40%  (0x66)
 * - 60%  (0x99)
 * - 80%  (0xCC)
 * - 100% (0xFF)
 */
static int cmd_display_brightness(const struct shell *shell, size_t argc, char **argv)
{
    if (argc != 2)
    {
        shell_error(shell, "❌ Usage: display brightness <20|40|60|80|100>");
        shell_print(shell, "");
        shell_print(shell, "亮度档位 | Brightness Levels:");
        shell_print(shell, "  20%%  - 最暗 | Dimmest (0x33)");
        shell_print(shell, "  40%%  - 较暗 | Darker (0x66)");
        shell_print(shell, "  60%%  - 中等 | Medium (0x99)");
        shell_print(shell, "  80%%  - 较亮 | Brighter (0xCC)");
        shell_print(shell, "  100%% - 最亮 | Brightest (0xFF)");
        shell_print(shell, "");
        shell_print(shell, "Examples:");
        shell_print(shell, "  display brightness 20   - Set to 20%%");
        shell_print(shell, "  display brightness 60   - Set to 60%%");
        shell_print(shell, "  display brightness 100  - Set to 100%%");
        return -EINVAL;
    }
    
    int brightness_pct = atoi(argv[1]);
    
    // 支持的亮度档位映射 | Supported brightness level mapping
    uint8_t reg_value;
    switch (brightness_pct)
    {
        case 20:
            reg_value = 0x33;  // 20%
            break;
        case 40:
            reg_value = 0x66;  // 40%
            break;
        case 60:
            reg_value = 0x99;  // 60%
            break;
        case 80:
            reg_value = 0xCC;  // 80%
            break;
        case 100:
            reg_value = 0xFF;  // 100%
            break;
        default:
            shell_error(shell, "❌ Invalid brightness. Use: 20, 40, 60, 80, or 100");
            return -EINVAL;
    }
    
    // 设置亮度 | Set brightness
    int ret = a6n_set_brightness(reg_value);
    if (ret == 0)
    {
        shell_print(shell, "✅ A6N brightness set to %d%% (reg=0x%02X)", 
            brightness_pct, reg_value);
    }
    else
    {
        shell_error(shell, "❌ Failed to set brightness: %d", ret);
        return ret;
    }
    
    LOG_INF("Display brightness set to %d%% (0x%02X) via shell", brightness_pct, reg_value);
    return 0;
}

/**
 * Display clear command
 */
static int cmd_display_clear(const struct shell *shell, size_t argc, char **argv)
{
    // Use A6N driver's clear screen function
    // color_on = false means clear to black (background color)
    int ret = a6n_clear_screen(false);
    
    if (ret == 0) {
        shell_print(shell, "✅ Display cleared to black");
        LOG_INF("Display cleared via shell command using a6n_clear_screen()");
    } else {
        shell_error(shell, "❌ Failed to clear display (error: %d)", ret);
        LOG_ERR("Failed to clear display: %d", ret);
    }
    
    return ret;
}

/**
 * Display text command - supports both full parameters and text-only for pattern overlays
 */
static int cmd_display_text(const struct shell *shell, size_t argc, char **argv)
{
    const char *text;
    int x, y, size;
    
    // Support flexible parameter count:
    // - 2 args: display text "string" (for pattern overlays - uses defaults)
    // - 5 args: display text "string" <x> <y> <size> (full control)
    if (argc == 2) {
        // Text-only mode for pattern overlays (pattern 3, etc.)
        text = argv[1];
        x = 320;    // Center X for 640px width
        y = 240;    // Center Y for 480px height
        size = 14;  // Default font size
        shell_print(shell, "📝 Text overlay mode - using center position (320,240) with 14px font");
    } else if (argc == 5) {
        // Full parameter mode
        text = argv[1];
        x = atoi(argv[2]);
        y = atoi(argv[3]);
        size = atoi(argv[4]);
    } else {
        shell_error(shell, "❌ Usage:");
        shell_print(shell, "  display text \"string\"                    - Text overlay (center position)");
        shell_print(shell, "  display text \"string\" <x> <y> <size>      - Full control");
        shell_print(shell, "Examples:");
        shell_print(shell, "  display text \"Test Pattern 3\"           - Overlay on current pattern");
        shell_print(shell, "  display text \"Hello\" 10 20 14           - Specific position");
        return -EINVAL;
    }
    
    // Remove quotes from text if present
    static char clean_text[256]; // Make static to avoid stack issues
    if (text[0] == '"' && text[strlen(text)-1] == '"') {
        strncpy(clean_text, text + 1, sizeof(clean_text) - 1);
        clean_text[strlen(text) - 2] = '\0';
        text = clean_text;
    }
    
    // Validate position (basic bounds for both displays)
    if (x < 0 || x > 640 || y < 0 || y > 480) {
        shell_error(shell, "❌ Position (%d,%d) outside reasonable bounds (0,0)-(640,480)", x, y);
        return -EINVAL;
    }
    
    // Validate font size
    if (size != 12 && size != 14) {
        shell_print(shell, "⚠️  Font size %d not available, using 14px", size);
        size = 14;
    }
    
    // Use the same API as protobuf handler - display_update_xy_text
    // White color (0xFFFF in RGB565 format)
    display_update_xy_text(x, y, text, size, 0xFFFF);
    
    shell_print(shell, "✅ Text \"%s\" written at (%d,%d) with font %dpx", text, x, y, size);
    LOG_INF("Text displayed: \"%s\" at (%d,%d) size %d", text, x, y, size);
    
    return 0;
}

/**
 * Display pattern selection command
 */
static int cmd_display_pattern(const struct shell *shell, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(shell, "❌ Usage: display pattern <id>");
        shell_print(shell, "Available patterns:");
        shell_print(shell, "  0 - Chess pattern");
        shell_print(shell, "  1 - Horizontal zebra");
        shell_print(shell, "  2 - Vertical zebra");
        shell_print(shell, "  3 - Scrolling welcome text");
        shell_print(shell, "  4 - Protobuf text container (default)");
        shell_print(shell, "  5 - XY text positioning area");
        return -EINVAL;
    }
    
    int pattern_id = atoi(argv[1]);
    
    if (pattern_id < 0 || pattern_id > 5) {
        shell_error(shell, "❌ Pattern ID must be 0-5");
        return -EINVAL;
    }
    
    // Send pattern change command to LVGL thread
    display_cmd_t cmd = {
        .type = LCD_CMD_SHOW_PATTERN,
        .p.pattern = {.pattern_id = pattern_id}
    };
    
    // Use the existing display message queue function
    if (k_msgq_put(&lvgl_display_msgq, &cmd, K_NO_WAIT) != 0) {
        shell_error(shell, "❌ Display command queue full");
        return -EBUSY;
    }
    
    shell_print(shell, "✅ Switched to pattern %d", pattern_id);
    LOG_INF("Display pattern changed to %d via shell command", pattern_id);
    
    return 0;
}

/**
 * Display battery level and charging state command
 */
static int cmd_display_battery(const struct shell *shell, size_t argc, char **argv)
{
    if (argc < 2 || argc > 3) {
        shell_error(shell, "❌ Usage: display battery <level> [charging]");
        shell_print(shell, "Parameters:");
        shell_print(shell, "  level    : 0-100 (battery percentage)");
        shell_print(shell, "  charging : true/false (optional, charging state)");
        shell_print(shell, "");
        shell_print(shell, "Examples:");
        shell_print(shell, "  display battery 85           - Set battery to 85%%, not charging");
        shell_print(shell, "  display battery 65 true      - Set battery to 65%%, charging");
        shell_print(shell, "  display battery 25 false     - Set battery to 25%%, not charging");
        return -EINVAL;
    }
    
    int battery_level = atoi(argv[1]);
    
    if (battery_level < 0 || battery_level > 100) {
        shell_error(shell, "❌ Battery level must be 0-100");
        return -EINVAL;
    }
    
    // Parse charging state (optional parameter)
    bool charging = false;  // Default to not charging
    if (argc == 3) {
        if (strcmp(argv[2], "true") == 0 || strcmp(argv[2], "1") == 0) {
            charging = true;
        } else if (strcmp(argv[2], "false") == 0 || strcmp(argv[2], "0") == 0) {
            charging = false;
        } else {
            shell_error(shell, "❌ Charging state must be 'true' or 'false'");
            return -EINVAL;
        }
    }
    
    // Update the protobuf battery system (this will also send notifications to mobile app)
    protobuf_set_battery_level(battery_level);
    protobuf_set_charging_state(charging);
    
    // Create battery level display text with charging indicator
    static char battery_text[80];
    const char *battery_icon;
    const char *charging_indicator;
    
    // Select battery icon based on level
    if (battery_level >= 75) {
        battery_icon = "🔋";  // Full
    } else if (battery_level >= 50) {
        battery_icon = "🔋";  // Medium-high
    } else if (battery_level >= 25) {
        battery_icon = "🪫";  // Medium-low
    } else {
        battery_icon = "🪫";  // Low/Critical
    }
    
    // Add charging indicator
    charging_indicator = charging ? " ⚡" : "";
    
    snprintf(battery_text, sizeof(battery_text), "%s %d%%%s", 
             battery_icon, battery_level, charging_indicator);
    
    // Show confirmation in shell only - don't interfere with active display pattern
    // The protobuf functions above already handle mobile app notifications automatically
    
    shell_print(shell, "✅ Battery: %d%% %s", battery_level, charging ? "(Charging ⚡)" : "(Not Charging)");
    shell_print(shell, "📡 Battery status sent to mobile app via protobuf"); 
    shell_print(shell, "ℹ️  Battery icon: %s", battery_text);
    shell_print(shell, "💡 Tip: Use 'display text' command to show battery on screen if needed");
    LOG_INF("Battery set: %d%% %s via shell command", battery_level, charging ? "charging" : "not charging");
    
    return 0;
}

/**
 * Display fill command (opposite of clear - fill with white)
 */
static int cmd_display_fill(const struct shell *shell, size_t argc, char **argv)
{
    // Use A6N driver's clear screen function with white fill
    // color_on = true means fill with white (foreground color)
    int ret = a6n_clear_screen(true);
    
    if (ret == 0) {
        shell_print(shell, "✅ Display filled with white");
        LOG_INF("Display filled via shell command using a6n_clear_screen(true)");
    } else {
        shell_error(shell, "❌ Failed to fill display (error: %d)", ret);
        LOG_ERR("Failed to fill display: %d", ret);
    }
    
    return ret;
}

/**
 * 显示测试命令 | Display test command
 */
static int cmd_display_test(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "🧪 运行 A6N 硬件自测试图案 | Running A6N hardware self-test patterns...");
    
    int ret;
    
    // 测试 1: 全黑 | Test 1: All black (0x80)
    shell_print(shell, "  ⬛ 测试图案 0x00: 全黑 | Pattern 0x00: All black (0x80)");
    ret = a6n_enable_selftest(true, 0x00);
    if (ret != 0)
    {
        shell_error(shell, "❌ 全黑图案失败 | Black pattern failed (error: %d)", ret);
        return ret;
    }
    k_sleep(K_MSEC(2000));  // 显示 2 秒 | Display for 2 seconds
    
    // 测试 2: 全亮 | Test 2: All white (0x81)
    shell_print(shell, "  ⬜ 测试图案 0x01: 全亮 | Pattern 0x01: All white (0x81)");
    ret = a6n_enable_selftest(true, 0x01);
    if (ret != 0)
    {
        shell_error(shell, "❌ 全亮图案失败 | White pattern failed (error: %d)", ret);
        return ret;
    }
    k_sleep(K_MSEC(2000));  // 显示 2 秒 | Display for 2 seconds
    
    // 测试 3: 2x2 棋盘格 | Test 3: 2x2 checkerboard (0x88)
    shell_print(shell, "  ♟️  测试图案 0x08: 2x2棋盘格 | Pattern 0x08: 2x2 checkerboard (0x88)");
    ret = a6n_enable_selftest(true, 0x08);
    if (ret != 0)
    {
        shell_error(shell, "❌ 2x2棋盘格失败 | 2x2 checkerboard failed (error: %d)", ret);
        return ret;
    }
    k_sleep(K_MSEC(2000));  // 显示 2 秒 | Display for 2 seconds
    
    // 测试 4: 4x4 棋盘格 | Test 4: 4x4 checkerboard (0x89)
    shell_print(shell, "  ♟️  测试图案 0x09: 4x4棋盘格 | Pattern 0x09: 4x4 checkerboard (0x89)");
    ret = a6n_enable_selftest(true, 0x09);
    if (ret != 0)
    {
        shell_error(shell, "❌ 4x4棋盘格失败 | 4x4 checkerboard failed (error: %d)", ret);
        return ret;
    }
    k_sleep(K_MSEC(2000));  // 显示 2 秒 | Display for 2 seconds
    
    // 关闭自测试模式 | Disable self-test mode
    shell_print(shell, "  🔄 关闭自测试模式 | Disabling self-test mode");
    ret = a6n_enable_selftest(false, 0x00);
    if (ret != 0)
    {
        shell_error(shell, "❌ 关闭自测试失败 | Failed to disable self-test (error: %d)", ret);
        return ret;
    }
    
    // 清屏 | Clear screen
    a6n_clear_screen(false);
    
    shell_print(shell, "✅ 显示测试完成 | Display test completed");
    shell_print(shell, "🎨 测试图案 | Test patterns: 全黑(0x80)/全亮(0x81)/2x2棋盘(0x88)/4x4棋盘(0x89)");
    shell_print(shell, "📐 使用 A6N 硬件自测试 (Bank1初始化 + Bank0 0x8F) | Using A6N hardware self-test (Bank1 init + Bank0 0x8F)");
    shell_print(shell, "⚠️  注意: 内部测试图 APL 较高，已使用较低亮度和短时间显示 | Note: High APL patterns, using low brightness and short duration");
    
    LOG_INF("A6N hardware self-test patterns completed");
    return 0;
}

/* Shell command definitions */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_display,
    SHELL_CMD(help, NULL, "Show display commands help", cmd_display_help),
    SHELL_CMD(info, NULL, "Show display information", cmd_display_info),
    SHELL_CMD_ARG(brightness, NULL, "Set brightness (20/40/60/80/100%)", cmd_display_brightness, 2, 0),
    SHELL_CMD(clear, NULL, "Clear display", cmd_display_clear),
    SHELL_CMD(fill, NULL, "Fill display with white", cmd_display_fill),
    SHELL_CMD_ARG(text, NULL, "Write text: \"string\" [x y size] (overlay or positioned)", cmd_display_text, 2, 3),
    SHELL_CMD_ARG(pattern, NULL, "Select pattern (0-5): 0=chess, 1=h-zebra, 2=v-zebra, 3=scroll, 4=container, 5=xy", cmd_display_pattern, 2, 0),
    SHELL_CMD_ARG(battery, NULL, "Set battery level & charging: <level> [true/false]", cmd_display_battery, 2, 1),
    SHELL_CMD(test, NULL, "Run display test patterns", cmd_display_test),
    SHELL_SUBCMD_SET_END /* Array terminated. */
);

SHELL_CMD_REGISTER(display, &sub_display, "Display control commands", cmd_display_help);