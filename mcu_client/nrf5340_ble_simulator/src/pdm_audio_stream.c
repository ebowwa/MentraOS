/*
 * PDM Audio Stream Implementation
 * Simple stub implementation for protobuf MicStateConfig testing
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include "pdm_audio_stream.h"
#include "mentra_ble_service.h"

LOG_MODULE_REGISTER(pdm_audio_stream, LOG_LEVEL_INF);

// Simple audio streaming state
static bool pdm_enabled = false;
static bool pdm_initialized = false;
static uint32_t streaming_errors = 0;
static uint32_t frames_transmitted = 0;

// Mock audio processing thread
static K_THREAD_STACK_DEFINE(audio_thread_stack, 1024);
static struct k_thread audio_thread_data;
static k_tid_t audio_thread_tid;

// Simple audio processing function
static void audio_processing_thread(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2); 
    ARG_UNUSED(p3);

    LOG_INF("🎤 Audio processing thread started");

    while (1) {
        if (pdm_enabled) {
            // Much slower test rate to avoid overwhelming BLE stack
            // Send a small test audio packet every 1 second instead of 10ms
            k_sleep(K_MSEC(1000));
            
            // Small mock audio data for testing (much smaller than real audio)
            uint8_t mock_audio_data[20]; // Only 20 bytes for testing
            
            // Fill with some test pattern
            for (int i = 0; i < 20; i++) {
                mock_audio_data[i] = (uint8_t)(0xAA + (i % 8)); // Simple test pattern
            }
            
            // Prepare audio chunk message with 0xA0 tag
            uint8_t ble_buffer[21]; // 1 byte tag + 20 bytes test data
            ble_buffer[0] = 0xA0; // Audio chunk message tag
            memcpy(&ble_buffer[1], mock_audio_data, sizeof(mock_audio_data));
            
            // Send via BLE with error handling
            int ret = mentra_ble_send(NULL, ble_buffer, sizeof(ble_buffer));
            if (ret == 0) {
                frames_transmitted++;
                LOG_INF("📊 Test audio packet %u sent (%u bytes)", frames_transmitted, sizeof(ble_buffer));
            } else {
                streaming_errors++;
                LOG_ERR("❌ Failed to send test audio packet: %d (error %u)", ret, streaming_errors);
                // Back off on errors to prevent flooding
                k_sleep(K_MSEC(5000));
            }
        } else {
            // Sleep when disabled
            k_sleep(K_MSEC(500));
        }
    }
}

int pdm_audio_stream_init(void)
{
    if (pdm_initialized) {
        LOG_WRN("⚠️ PDM audio stream already initialized");
        return 0;
    }

    LOG_INF("🔧 Initializing PDM audio stream...");

    // Create audio processing thread
    audio_thread_tid = k_thread_create(&audio_thread_data, audio_thread_stack,
                                       K_THREAD_STACK_SIZEOF(audio_thread_stack),
                                       audio_processing_thread,
                                       NULL, NULL, NULL,
                                       K_PRIO_COOP(7), 0, K_NO_WAIT);

    if (audio_thread_tid) {
        k_thread_name_set(audio_thread_tid, "audio_proc");
        pdm_initialized = true;
        LOG_INF("✅ PDM audio stream initialized successfully");
        return 0;
    } else {
        LOG_ERR("❌ Failed to create audio processing thread");
        return -1;
    }
}

int pdm_audio_stream_set_enabled(bool enabled)
{
    if (!pdm_initialized) {
        LOG_ERR("❌ PDM audio stream not initialized");
        return -ENODEV;
    }

    if (pdm_enabled == enabled) {
        LOG_INF("ℹ️ PDM already %s", enabled ? "enabled" : "disabled");
        return 0;
    }

    pdm_enabled = enabled;
    LOG_INF("🎤 PDM audio streaming %s", enabled ? "enabled" : "disabled");

    if (enabled) {
        // Reset counters when enabling
        frames_transmitted = 0;
        streaming_errors = 0;
        LOG_INF("📡 Starting test audio streaming (1 packet/sec to avoid BLE overload)");
    } else {
        LOG_INF("⏹️ Stopped test audio streaming");
    }

    return 0;
}

pdm_audio_state_t pdm_audio_stream_get_state(void)
{
    if (!pdm_initialized) {
        return PDM_AUDIO_STATE_DISABLED;
    }
    return pdm_enabled ? PDM_AUDIO_STATE_STREAMING : PDM_AUDIO_STATE_ENABLED;
}

void pdm_audio_stream_get_stats(uint32_t *frames_captured, uint32_t *frames_encoded,
                                uint32_t *frames_transmitted_out, uint32_t *errors)
{
    if (frames_captured) {
        *frames_captured = frames_transmitted; // Mock: captured == transmitted
    }
    if (frames_encoded) {
        *frames_encoded = frames_transmitted; // Mock: encoded == transmitted  
    }
    if (frames_transmitted_out) {
        *frames_transmitted_out = frames_transmitted;
    }
    if (errors) {
        *errors = streaming_errors;
    }
}
