/*
 * Shell Display Control Module
 * 
 * Manual display control commands for nRF5340 BLE Simulator
 * Supporting both HLS12VGA projector and SSD1306 OLED displays
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

// Include HLS12VGA driver for brightness control
#include "../custom_driver_module/drivers/display/lcd/hls12vga.h"

// Include display manager for font mapping
#include "display_manager.h"

// Include MOS LVGL display functions
#include "mos_lvgl_display.h"
#include "xip_fonts.h"  // Include XIP font definitions

// Include protobuf handler for battery functions
#include "protobuf_handler.h"

// External declaration for LVGL display message queue
extern struct k_msgq lvgl_display_msgq;

LOG_MODULE_REGISTER(shell_display, LOG_LEVEL_INF);

// Helper function to map font sizes to available XIP fonts
static const lv_font_t *get_font_by_size(int size)
{
    return xip_get_font_by_size(size);  // Use XIP font mapping function
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
    shell_print(shell, "  display brightness <0-100>       - Set display brightness (0-100%%)");
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
    shell_print(shell, "  display brightness 75            - Set brightness to 75%%");
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
    shell_print(shell, "📏 HLS12VGA Resolution: 640x480 pixels");
    shell_print(shell, "📏 SSD1306 Resolution: 128x64 pixels");
    shell_print(shell, "🎨 Pixel Format: MONO (1-bit)");
    shell_print(shell, "🔆 Brightness Support: Yes (HLS12VGA)");
    shell_print(shell, "� Available Fonts: 12px, 14px");
    shell_print(shell, "");
    
    return 0;
}

/**
 * Display brightness command
 */
static int cmd_display_brightness(const struct shell *shell, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(shell, "❌ Usage: display brightness <0-100>");
        return -EINVAL;
    }
    
    int brightness = atoi(argv[1]);
    if (brightness < 0 || brightness > 100) {
        shell_error(shell, "❌ Brightness must be 0-100%%");
        return -EINVAL;
    }
    
    // Convert 0-100% to 0-9 levels for HLS12VGA
    uint8_t projector_level = (brightness * 9) / 100;
    
#ifdef CONFIG_CUSTOM_HLS12VGA
    // Set HLS12VGA brightness
    int ret = hls12vga_set_brightness(projector_level);
    if (ret == 0) {
        shell_print(shell, "✅ HLS12VGA projector brightness set to %d%% (level %d/9)", 
            brightness, projector_level);
    } else {
        shell_error(shell, "❌ Failed to set brightness: %d", ret);
        return ret;
    }
#else
    shell_print(shell, "✅ Dummy brightness set to %d%% (level %d/9) - HLS12VGA disabled", 
        brightness, projector_level);
#endif
    
    LOG_INF("Display brightness set to %d%% via shell command", brightness);
    return 0;
}

/**
 * Display clear command
 */
static int cmd_display_clear(const struct shell *shell, size_t argc, char **argv)
{
#ifdef CONFIG_CUSTOM_HLS12VGA
    // Use HLS12VGA driver's clear screen function
    // color_on = false means clear to black (background color)
    int ret = hls12vga_clear_screen(false);
    
    if (ret == 0) {
        shell_print(shell, "✅ Display cleared to black");
        LOG_INF("Display cleared via shell command using hls12vga_clear_screen()");
    } else {
        shell_error(shell, "❌ Failed to clear display (error: %d)", ret);
        LOG_ERR("Failed to clear display: %d", ret);
    }
    
    return ret;
#else
    shell_print(shell, "✅ Dummy display cleared - HLS12VGA disabled");
    return 0;
#endif
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
#ifdef CONFIG_CUSTOM_HLS12VGA
    // Use HLS12VGA driver's clear screen function with white fill
    // color_on = true means fill with white (foreground color)
    int ret = hls12vga_clear_screen(true);
    
    if (ret == 0) {
        shell_print(shell, "✅ Display filled with white");
        LOG_INF("Display filled via shell command using hls12vga_clear_screen(true)");
    } else {
        shell_error(shell, "❌ Failed to fill display (error: %d)", ret);
        LOG_ERR("Failed to fill display: %d", ret);
    }
    
    return ret;
#else
    shell_print(shell, "✅ Dummy display filled - HLS12VGA disabled");
    return 0;
#endif
}

/**
 * Display test command
 */
static int cmd_display_test(const struct shell *shell, size_t argc, char **argv)
{
    shell_print(shell, "🧪 Running display test patterns...");
    
#ifdef CONFIG_CUSTOM_HLS12VGA
    int ret;
    
    // Test 1: Horizontal grayscale pattern
    shell_print(shell, "  📊 Running horizontal grayscale pattern...");
    ret = hls12vga_draw_horizontal_grayscale_pattern();
    if (ret != 0) {
        shell_error(shell, "❌ Horizontal pattern failed (error: %d)", ret);
        return ret;
    }
    k_sleep(K_MSEC(2000));  // Display for 2 seconds
    
    // Test 2: Vertical grayscale pattern  
    shell_print(shell, "  📊 Running vertical grayscale pattern...");
    ret = hls12vga_draw_vertical_grayscale_pattern();
    if (ret != 0) {
        shell_error(shell, "❌ Vertical pattern failed (error: %d)", ret);
        return ret;
    }
    k_sleep(K_MSEC(2000));  // Display for 2 seconds
    
    // Test 3: Chess pattern
    shell_print(shell, "  ♟️  Running chess pattern...");
    ret = hls12vga_draw_chess_pattern();
    if (ret != 0) {
        shell_error(shell, "❌ Chess pattern failed (error: %d)", ret);
        return ret;
    }
    k_sleep(K_MSEC(2000));  // Display for 2 seconds
    
    // Clear screen after tests
    hls12vga_clear_screen(false);
    
    shell_print(shell, "✅ Display test completed");
    shell_print(shell, "🎨 Patterns: Horizontal grayscale, vertical grayscale, chess pattern");
    shell_print(shell, "📐 Using native HLS12VGA driver test patterns");
    
    LOG_INF("Display test patterns completed using HLS12VGA driver functions");
    return 0;
#else
    // Dummy test patterns when HLS12VGA is disabled
    shell_print(shell, "  📊 Dummy horizontal grayscale pattern...");
    k_sleep(K_MSEC(500));
    
    shell_print(shell, "  📊 Dummy vertical grayscale pattern...");
    k_sleep(K_MSEC(500));
    
    shell_print(shell, "  ♟️  Dummy chess pattern...");
    k_sleep(K_MSEC(500));
    
    shell_print(shell, "✅ Dummy display test completed - HLS12VGA disabled");
    return 0;
#endif
}

/* Shell command definitions */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_display,
    SHELL_CMD(help, NULL, "Show display commands help", cmd_display_help),
    SHELL_CMD(info, NULL, "Show display information", cmd_display_info),
    SHELL_CMD_ARG(brightness, NULL, "Set display brightness (0-100)", cmd_display_brightness, 2, 0),
    SHELL_CMD(clear, NULL, "Clear display", cmd_display_clear),
    SHELL_CMD(fill, NULL, "Fill display with white", cmd_display_fill),
    SHELL_CMD_ARG(text, NULL, "Write text: \"string\" [x y size] (overlay or positioned)", cmd_display_text, 2, 3),
    SHELL_CMD_ARG(pattern, NULL, "Select pattern (0-5): 0=chess, 1=h-zebra, 2=v-zebra, 3=scroll, 4=container, 5=xy", cmd_display_pattern, 2, 0),
    SHELL_CMD_ARG(battery, NULL, "Set battery level & charging: <level> [true/false]", cmd_display_battery, 2, 1),
    SHELL_CMD(test, NULL, "Run display test patterns", cmd_display_test),
    SHELL_SUBCMD_SET_END /* Array terminated. */
);

SHELL_CMD_REGISTER(display, &sub_display, "Display control commands", cmd_display_help);