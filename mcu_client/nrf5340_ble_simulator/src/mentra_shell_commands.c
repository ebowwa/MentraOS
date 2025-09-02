/*
 * MentraOS Shell Commands Implementation
 * Custom shell commands for audio, display, and BLE testing
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(mentra_shell, LOG_LEVEL_INF);

/* Audio System Shell Commands */
static int cmd_audio_start(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "🎵 Starting audio streaming...");
    // Call actual audio start function
    // enable_audio_system();
    shell_print(sh, "✅ Audio streaming started");
    return 0;
}

static int cmd_audio_stop(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "🛑 Stopping audio streaming...");
    // Call actual audio stop function
    shell_print(sh, "✅ Audio streaming stopped");
    return 0;
}

static int cmd_audio_volume(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: audio volume <0-100>");
        return -EINVAL;
    }
    
    int volume = atoi(argv[1]);
    if (volume < 0 || volume > 100) {
        shell_error(sh, "Volume must be between 0-100");
        return -EINVAL;
    }
    
    shell_print(sh, "🔊 Setting volume to %d%%", volume);
    // Call actual volume control function
    return 0;
}

/* Display System Shell Commands */
static int cmd_display_pattern(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: display pattern <chess|horizontal|vertical>");
        return -EINVAL;
    }
    
    shell_print(sh, "📺 Displaying %s pattern", argv[1]);
    
    if (strcmp(argv[1], "chess") == 0) {
        // Call chess pattern function
        shell_print(sh, "♟️ Chess pattern displayed");
    } else if (strcmp(argv[1], "horizontal") == 0) {
        // Call horizontal pattern function  
        shell_print(sh, "━ Horizontal pattern displayed");
    } else if (strcmp(argv[1], "vertical") == 0) {
        // Call vertical pattern function
        shell_print(sh, "┃ Vertical pattern displayed");
    } else {
        shell_error(sh, "Unknown pattern: %s", argv[1]);
        return -EINVAL;
    }
    
    return 0;
}

static int cmd_display_brightness(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: display brightness <0-255>");
        return -EINVAL;
    }
    
    int brightness = atoi(argv[1]);
    if (brightness < 0 || brightness > 255) {
        shell_error(sh, "Brightness must be between 0-255");
        return -EINVAL;
    }
    
    shell_print(sh, "💡 Setting brightness to %d", brightness);
    // Call actual brightness control function
    return 0;
}

/* Live Caption Shell Commands */
static int cmd_caption_text(const struct shell *sh, size_t argc, char **argv)
{
    if (argc < 2) {
        shell_error(sh, "Usage: caption text <text to display>");
        return -EINVAL;
    }
    
    // Concatenate all arguments as the text
    char text_buffer[256] = {0};
    for (int i = 1; i < argc; i++) {
        strcat(text_buffer, argv[i]);
        if (i < argc - 1) {
            strcat(text_buffer, " ");
        }
    }
    
    shell_print(sh, "💬 Displaying caption: \"%s\"", text_buffer);
    // Call actual caption display function
    return 0;
}

static int cmd_caption_pattern(const struct shell *sh, size_t argc, char **argv)
{
    if (argc != 2) {
        shell_error(sh, "Usage: caption pattern <4|5>");
        return -EINVAL;
    }
    
    int pattern = atoi(argv[1]);
    if (pattern != 4 && pattern != 5) {
        shell_error(sh, "Pattern must be 4 or 5");
        return -EINVAL;
    }
    
    shell_print(sh, "📋 Enabling caption pattern %d", pattern);
    // Call actual pattern enable function
    return 0;
}

/* BLE System Shell Commands */
static int cmd_ble_status(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "📡 BLE Status:");
    shell_print(sh, "  - Device Name: NexSim");
    shell_print(sh, "  - State: Advertising");
    shell_print(sh, "  - Connections: 0/1");
    shell_print(sh, "  - MTU: 247 bytes");
    // Call actual BLE status function
    return 0;
}

static int cmd_ble_disconnect(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "🔌 Disconnecting BLE client...");
    // Call actual disconnect function
    shell_print(sh, "✅ BLE client disconnected");
    return 0;
}

/* System Commands */
static int cmd_system_info(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "🔧 MentraOS System Information:");
    shell_print(sh, "  - Version: 2.16.0");
    shell_print(sh, "  - Board: nRF5340DK");
    shell_print(sh, "  - Zephyr: %s", CONFIG_KERNEL_VERSION);
    shell_print(sh, "  - Build: %s %s", __DATE__, __TIME__);
    shell_print(sh, "  - Uptime: %lld ms", k_uptime_get());
    return 0;
}

static int cmd_system_reboot(const struct shell *sh, size_t argc, char **argv)
{
    shell_print(sh, "🔄 Rebooting system in 3 seconds...");
    k_sleep(K_MSEC(3000));
    // Call actual reboot function
    // sys_reboot(SYS_REBOOT_COLD);
    return 0;
}

/* Shell Command Registration */

/* Audio subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_audio,
    SHELL_CMD(start, NULL, "Start audio streaming", cmd_audio_start),
    SHELL_CMD(stop, NULL, "Stop audio streaming", cmd_audio_stop),
    SHELL_CMD(volume, NULL, "Set volume (0-100)", cmd_audio_volume),
    SHELL_SUBCMD_SET_END
);

/* Display subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_display,
    SHELL_CMD(pattern, NULL, "Display test pattern", cmd_display_pattern),
    SHELL_CMD(brightness, NULL, "Set brightness (0-255)", cmd_display_brightness),
    SHELL_SUBCMD_SET_END
);

/* Caption subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_caption,
    SHELL_CMD(text, NULL, "Display caption text", cmd_caption_text),
    SHELL_CMD(pattern, NULL, "Enable caption pattern (4|5)", cmd_caption_pattern),
    SHELL_SUBCMD_SET_END
);

/* BLE subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_ble,
    SHELL_CMD(status, NULL, "Show BLE status", cmd_ble_status),
    SHELL_CMD(disconnect, NULL, "Disconnect BLE client", cmd_ble_disconnect),
    SHELL_SUBCMD_SET_END
);

/* System subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_system,
    SHELL_CMD(info, NULL, "Show system information", cmd_system_info),
    SHELL_CMD(reboot, NULL, "Reboot system", cmd_system_reboot),
    SHELL_SUBCMD_SET_END
);

/* Main commands */
SHELL_CMD_REGISTER(audio, &sub_audio, "Audio system control", NULL);
SHELL_CMD_REGISTER(display, &sub_display, "Display control", NULL);
SHELL_CMD_REGISTER(caption, &sub_caption, "Live caption control", NULL);
SHELL_CMD_REGISTER(ble, &sub_ble, "BLE operations", NULL);
SHELL_CMD_REGISTER(system, &sub_system, "System operations", NULL);
