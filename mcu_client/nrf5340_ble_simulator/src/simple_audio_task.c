/*
 * Simple Audio Task using Zephyr I2S API
 * Generates 440Hz test tone output
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "simple_audio_i2s.h"

LOG_MODULE_REGISTER(simple_audio_task, LOG_LEVEL_INF);

static void audio_task_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);
    
    LOG_INF("Simple audio task starting...");
    
    // Initialize I2S audio
    int ret = simple_audio_i2s_init();
    if (ret < 0) {
        LOG_ERR("Failed to initialize I2S audio: %d", ret);
        return;
    }
    
    // Start audio streaming
    ret = simple_audio_i2s_start();
    if (ret < 0) {
        LOG_ERR("Failed to start I2S audio: %d", ret);
        return;
    }
    
    LOG_INF("Audio task running - generating 440Hz test tone");
    
    // Main audio processing loop
    while (1) {
        // Process audio buffers
        simple_audio_i2s_process();
        
        // Small delay to prevent excessive CPU usage
        k_sleep(K_MSEC(5));
    }
}

K_THREAD_DEFINE(audio_task, 2048, audio_task_thread, NULL, NULL, NULL, 
                5, 0, 0);

void simple_audio_task_start(void)
{
    LOG_INF("Simple audio task initialized");
    // Thread starts automatically with K_THREAD_DEFINE
}
