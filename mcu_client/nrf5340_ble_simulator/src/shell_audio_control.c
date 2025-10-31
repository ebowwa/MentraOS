/*
 * Shell Audio Control Module
 * 
 * Audio/PDM microphone test commands (independent of BLE)
 * 
 * Commands:
 * - audio help        : Show help
 * - audio start       : Start complete audio system (PDM + LC3 + I2S loopback)
 * - audio stop        : Stop complete audio system
 * - audio status      : Show current audio/PDM status
 * 
 * Purpose: Test PDM microphone and audio pipeline without BLE connection
 * When I2S is enabled, audio will be played back via I2S for verification
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/logging/log.h>
#include <errno.h>

#include "pdm_audio_stream.h"

LOG_MODULE_REGISTER(shell_audio, LOG_LEVEL_INF);

static const char *state_to_str(pdm_audio_state_t state)
{
	switch (state)
	{
	case PDM_AUDIO_STATE_ENABLED:
		return "Enabled";
	case PDM_AUDIO_STATE_STREAMING:
		return "Streaming";
	case PDM_AUDIO_STATE_DISABLED:
		return "Disabled";
	default:
		return "Unknown";
	}
}

static int cmd_audio_help(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	shell_print(shell, "");
	shell_print(shell, "🎙 Audio Test Commands:");
	shell_print(shell, "");
	shell_print(shell, "  audio start               - Start PDM + I2S loopback test");
	shell_print(shell, "  audio stop                - Stop test and release hardware");
	shell_print(shell, "  audio status              - Show status and stats");
	shell_print(shell, "  audio help                - Show this help");
	shell_print(shell, "");
	shell_print(shell, "Test Flow:");
	shell_print(shell, "  1. audio start            - Auto init I2S + start loopback");
	shell_print(shell, "  2. Speak to microphone    - Hear PDM data via I2S");
	shell_print(shell, "  3. audio status           - Check frame stats");
	shell_print(shell, "  4. audio stop             - Stop + uninit I2S");
	shell_print(shell, "");
	shell_print(shell, "Pipeline:");
	shell_print(shell, "  Mic → PDM → LC3 Encode → BLE (normal)");
	shell_print(shell, "            ↓");
	shell_print(shell, "        LC3 Decode → I2S → Speaker (shell test only)");
	shell_print(shell, "");
	shell_print(shell, "Note: I2S is for shell test only, not used in normal BLE mode");
	shell_print(shell, "");
	return 0;
}

static int cmd_audio_start(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	extern bool audio_i2s_is_initialized(void);
	extern void audio_i2s_init(void);
	extern void audio_i2s_start(void);
	extern int lc3_decoder_start(void);

	/* Check if I2S test is already running / 检查 I2S 测试是否已运行 */
	extern bool audio_i2s_is_initialized(void);
	
	if (audio_i2s_is_initialized())
	{
		shell_print(shell, "");
		shell_warn(shell, "⚠️  Audio test system is already running");
		shell_print(shell, "");
		shell_print(shell, "Use 'audio stop' first to stop current test");
		shell_print(shell, "");
		return 0;
	}

	shell_print(shell, "");
	shell_print(shell, "🔧 Starting audio system for shell test...");
	
	/* Start PDM audio conversion /启动 PDM 音频转换 */
	int ret = pdm_audio_stream_set_enabled(true);
	if (ret == -EALREADY)
	{
		shell_warn(shell, "  ⚠️  PDM audio conversion already started");
		/* This shouldn't happen due to early check, but handle it / 由于早期检查这不应该发生，但仍需处理 */
		shell_print(shell, "");
		shell_print(shell, "Use 'audio stop' first");
		shell_print(shell, "");
		return 0;
	}
	else if (ret < 0)
	{
		shell_error(shell, "❌ Failed to start PDM audio: %d", ret);
		return ret;
	}
	shell_print(shell, "  ✅ PDM audio conversion started");
	
	/* Initialize I2S if needed /如果需要则初始化 I2S */
	if (!audio_i2s_is_initialized())
	{
		shell_print(shell, "  - Initializing I2S hardware...");
		audio_i2s_init();
		shell_print(shell, "  ✅ I2S hardware initialized");
	}
	else
	{
		shell_print(shell, "  ℹ️  I2S already initialized");
	}
	
	/* Start I2S playback /启动 I2S 播放 */
	shell_print(shell, "  - Starting I2S playback...");
	audio_i2s_start();
	lc3_decoder_start();
	pdm_audio_set_i2s_output(true);
	shell_print(shell, "  ✅ I2S loopback started");
	
	shell_print(shell, "");
	shell_print(shell, "✅ Audio test system ready");
	shell_print(shell, "   - PDM capture: Active");
	shell_print(shell, "   - LC3 encode/decode: Active");
	shell_print(shell, "   - I2S loopback: Active");
	shell_print(shell, "");
	shell_print(shell, "🎤 Speak to microphone to hear loopback via I2S");
	shell_print(shell, "");
	return 0;
}

static int cmd_audio_stop(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	/* Check if I2S test is already stopped / 检查 I2S 测试是否已停止 */
	extern bool audio_i2s_is_initialized(void);
	extern void audio_i2s_uninit(void);
	
	bool i2s_initialized = audio_i2s_is_initialized();
	
	/* Early detection: I2S not initialized means test is stopped / 早期检测：I2S 未初始化表示测试已停止 */
	if (!i2s_initialized)
	{
		shell_print(shell, "");
		shell_warn(shell, "⚠️  Audio test system is already stopped");
		shell_print(shell, "");
		shell_print(shell, "Use 'audio start' to begin testing");
		shell_print(shell, "");
		return 0;
	}

	shell_print(shell, "");
	shell_print(shell, "⏹️  Stopping audio test system...");
	
	/* Step 1: Stop PDM audio (will trigger fade-out + tail drop) / 步骤 1：停止 PDM 音频（会触发淡出+尾巴丢弃） */
	shell_print(shell, "  - Stopping PDM audio (fade-out + tail drop)...");
	shell_print(shell, "  - Waiting for audio thread to complete stop sequence...");
	int ret = pdm_audio_stream_set_enabled(false);
	if (ret == 0)
	{
		k_msleep(100);  /* Wait for fade-out (8ms) + tail drop (80ms) + margin / 等待淡出+尾巴丢弃+余量 */
		shell_print(shell, "  ✅ PDM audio stopped");
	}
	else if (ret < 0 && ret != -EALREADY)
	{
		shell_error(shell, "  ❌ Failed to stop PDM audio: %d", ret);
		return ret;
	}
	
	/* Step 2: Uninitialize I2S hardware if used / 步骤 2：如果使用了 I2S 硬件则反初始化 */
	if (i2s_initialized)
	{
		shell_print(shell, "  - Uninitializing I2S hardware...");
		audio_i2s_uninit();
		shell_print(shell, "  ✅ I2S hardware released");
	}
	
	shell_print(shell, "");
	shell_print(shell, "✅ Audio test system stopped");
	shell_print(shell, "");
	return 0;
}

static int cmd_audio_status(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	extern bool audio_i2s_is_initialized(void);
	
	pdm_audio_state_t state = pdm_audio_stream_get_state();
	bool i2s_output = pdm_audio_get_i2s_output();
	bool i2s_initialized = audio_i2s_is_initialized();

	uint32_t frames_captured = 0;
	uint32_t frames_encoded = 0;
	uint32_t frames_transmitted = 0;
	uint32_t errors = 0;
	pdm_audio_stream_get_stats(&frames_captured, &frames_encoded, &frames_transmitted, &errors);

	shell_print(shell, "");
	shell_print(shell, "🎙 Audio System Status:");
	shell_print(shell, "  State           : %s", state_to_str(state));
	shell_print(shell, "  I2S Loopback    : %s", i2s_output ? "Enabled" : "Disabled");
	shell_print(shell, "  I2S Hardware    : %s", i2s_initialized ? "Initialized" : "Not initialized");
	shell_print(shell, "");
	shell_print(shell, "📊 Statistics:");
	shell_print(shell, "  Frames Captured : %u", (unsigned)frames_captured);
	shell_print(shell, "  Frames Encoded  : %u", (unsigned)frames_encoded);
	shell_print(shell, "  Frames Sent     : %u", (unsigned)frames_transmitted);
	shell_print(shell, "  Errors          : %u", (unsigned)errors);
	shell_print(shell, "");
	shell_print(shell, "🔧 LC3 Codec Configuration:");
	shell_print(shell, "  Sample Rate     : %d Hz", PDM_SAMPLE_RATE);
	shell_print(shell, "  Bit Depth       : %d bits", PDM_BIT_DEPTH);
	shell_print(shell, "  Channels        : %d (Mono)", PDM_CHANNELS);
	shell_print(shell, "  Frame Duration  : %d us (%d ms)", LC3_FRAME_DURATION_US, LC3_FRAME_DURATION_US/1000);
	shell_print(shell, "  Bitrate         : %d bps (%d kbps)", LC3_BITRATE_DEFAULT, LC3_BITRATE_DEFAULT/1000);
	shell_print(shell, "  Frame Size      : %d bytes", LC3_FRAME_LEN);
	shell_print(shell, "");
	return 0;
}

/* Audio control commands / 音频控制命令 */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_audio,
	SHELL_CMD(help,   NULL, "Show audio help",    cmd_audio_help),
	SHELL_CMD(start,  NULL, "Start audio test",   cmd_audio_start),
	SHELL_CMD(stop,   NULL, "Stop audio test",    cmd_audio_stop),
	SHELL_CMD(status, NULL, "Show audio status",  cmd_audio_status),
	SHELL_SUBCMD_SET_END
);

SHELL_CMD_REGISTER(audio, &sub_audio, "Audio test commands (PDM + I2S loopback)", cmd_audio_help);

