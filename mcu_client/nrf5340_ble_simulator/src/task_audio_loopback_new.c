/*
 * @file task_audio_loopback.c
 * @brief Simple MentraOS-style audio loopback system using proven NRFX I2S
 * 
 * Based on proven MentraOS architecture from bspal_audio_i2s.c
 * Real-time test tone generation → I2S audio output
 */

#include "task_audio_loopback.h"
#include "bspal_audio_i2s.h"
#include "BspLog/bsp_log.h"
#include <math.h>

#define TAG "AUDIO_LOOPBACK"

#define TASK_AUDIO_LOOPBACK_STACK_SIZE  4096
#define TASK_AUDIO_LOOPBACK_PRIORITY    4

// Audio task thread
K_THREAD_STACK_DEFINE(audio_loopback_stack, TASK_AUDIO_LOOPBACK_STACK_SIZE);
static struct k_thread audio_loopback_thread;
static bool audio_task_running = false;

// Test tone generation
static float tone_phase = 0.0f;
static const float tone_freq = 440.0f;  // 440Hz A note
static const float sample_rate = 16000.0f;

/**
 * Generate a test sine wave tone
 */
static void generate_test_tone(int16_t *buffer, size_t samples)
{
    const float phase_increment = 2.0f * M_PI * tone_freq / sample_rate;
    
    for (size_t i = 0; i < samples; i++) {
        float sample = sinf(tone_phase) * 0.3f;  // 30% volume
        buffer[i] = (int16_t)(sample * 32767.0f);
        
        tone_phase += phase_increment;
        if (tone_phase >= 2.0f * M_PI) {
            tone_phase -= 2.0f * M_PI;
        }
    }
}

/**
 * Audio processing task - MentraOS style real-time loop
 */
static void audio_loopback_task(void *arg1, void *arg2, void *arg3)
{
    BSP_LOGI(TAG, "🎵 Audio Loopback Task Started (Test Mode)");
    
    // Initialize MentraOS I2S system
    audio_i2s_init();
    audio_i2s_start();
    
    BSP_LOGI(TAG, "✅ MentraOS I2S initialized: 16kHz, stereo, NRFX driver");
    BSP_LOGI(TAG, "🔊 Audio Test Pipeline: Test Tone Generator → I2S Output → Audio Hardware");
    BSP_LOGI(TAG, "🎯 Audio Configuration: 16kHz, 16-bit, stereo, 440Hz test tone");
    
    audio_task_running = true;
    
    // Test tone buffer
    int16_t test_tone_buffer[PDM_PCM_REQ_BUFFER_SIZE];
    
    // Real-time audio processing loop
    while (audio_task_running) {
        // Generate test tone (simulating PDM input)
        generate_test_tone(test_tone_buffer, PDM_PCM_REQ_BUFFER_SIZE);
        
        // Send to I2S using MentraOS player function
        i2s_pcm_player(test_tone_buffer, PDM_PCM_REQ_BUFFER_SIZE, 1);
        
        // Real-time timing: 10ms frame period (160 samples at 16kHz)
        k_sleep(K_MSEC(10));
    }
    
    // Stop I2S
    audio_i2s_stop();
    BSP_LOGI(TAG, "🛑 Audio Loopback Task Stopped");
}

void task_audio_loopback_init(void)
{
    // Create audio processing task
    k_thread_create(&audio_loopback_thread, 
        audio_loopback_stack, 
        TASK_AUDIO_LOOPBACK_STACK_SIZE,
        audio_loopback_task, 
        NULL, NULL, NULL,
        TASK_AUDIO_LOOPBACK_PRIORITY,
        0, K_NO_WAIT);
    
    k_thread_name_set(&audio_loopback_thread, "audio_loopback");
    
    BSP_LOGI(TAG, "🎵 Audio Loopback Task Created (Priority: %d)", TASK_AUDIO_LOOPBACK_PRIORITY);
}

/**
 * Check if audio task is running
 */
bool task_audio_loopback_is_running(void)
{
    return audio_task_running;
}

/**
 * Stop audio task
 */
void task_audio_loopback_stop(void)
{
    audio_task_running = false;
}
