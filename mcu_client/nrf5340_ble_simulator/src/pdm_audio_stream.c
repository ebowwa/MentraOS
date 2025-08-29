/*
 * PDM Audio Stream Implementation
 * Simple stub implementation for protobuf MicStateConfig testing
 */

#include "pdm_audio_stream.h"

#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "bspal_audio_i2s.h"
#include "mentra_ble_service.h"
#include "mos_pdm.h"
#include "sw_codec_lc3.h"
static bool audio_system_enabled = false;

LOG_MODULE_REGISTER(pdm_audio_stream, LOG_LEVEL_INF);
extern int      ble_send_data(const uint8_t *data, uint16_t len);
extern uint16_t get_ble_payload_mtu(void);
// Simple audio streaming state
static bool     pdm_enabled        = false;
static bool     pdm_initialized    = false;
static uint32_t streaming_errors   = 0;
static uint32_t frames_transmitted = 0;
static uint16_t pcm_bytes_req_enc;
// Mock audio processing thread
static K_THREAD_STACK_DEFINE(audio_thread_stack, 1024 * 4);
static struct k_thread audio_thread_data;
static k_tid_t         audio_thread_tid;

#define BLE_AUDIO_HDR 0xA0
uint8_t stream_id = 0;  // 0=MIC, 1=TTS
#define BLE_AUDIO_HDR_LEN 1
#define STREAM_ID_LEN     1

#define MAX_FRAMES_PER_PACKET 5  // 8 // 每个 BLE 包最多包含的 LC3 帧数;Maximum number of LC3 frames per BLE packet
static inline uint8_t get_frames_per_packet(void)
{
    // 可用空间 = MTU - 包头（type+stream_id）;
    // Available space = MTU - packet header (type + stream_id)
    uint16_t payload_space = get_ble_payload_mtu() - BLE_AUDIO_HDR_LEN - STREAM_ID_LEN;
    uint8_t  frames        = payload_space / LC3_FRAME_LEN;
    if (frames > MAX_FRAMES_PER_PACKET)
    {
        frames = MAX_FRAMES_PER_PACKET;
    }
    return frames > 0 ? frames : 1;  // 最少1帧;minimum 1 frame
}
void send_lc3_multi_frame_packet(const uint8_t *frames, uint8_t num_frames, uint8_t stream_id)
{
    static uint8_t buf[517];
    uint16_t       offset = 0;
    memset(buf, 0, sizeof(buf));
    buf[offset++] = BLE_AUDIO_HDR;
    buf[offset++] = stream_id;

    // frames 是连续 num_frames * LC3_FRAME_LEN 的数据
    // frames is a continuous data of num_frames * LC3_FRAME_LEN
    memcpy(&buf[offset], frames, num_frames * LC3_FRAME_LEN);
    offset += num_frames * LC3_FRAME_LEN;
    // LOG_INF("Sending %d frames, total length: %d", num_frames, offset);
    // 实际最大长度不能超过当前协商MTU的payload空间
    // The actual maximum length cannot exceed the payload space of the
    // currently negotiated MTU
    uint16_t notify_len = offset;
    ble_send_data(buf, notify_len);
}

int user_sw_codec_lc3_init(void)
{
    sw_codec_lc3_init(NULL, NULL, LC3_FRAME_DURATION_US);
}
int lc3_encoder_start(void)
{
    int ret = sw_codec_lc3_enc_init(PDM_SAMPLE_RATE, PDM_BIT_DEPTH, LC3_FRAME_DURATION_US, LC3_BITRATE_DEFAULT,
                                    PDM_CHANNELS, &pcm_bytes_req_enc);
    if (ret < 0)
    {
        LOG_ERR("LC3 encoder initialization failed with error: %d", ret);
        return -1;
    }
    LOG_INF("LC3 encoder pcm_bytes_req_enc:%d", pcm_bytes_req_enc);
    return 0;
}
int lc3_decoder_start(void)
{
    int ret = sw_codec_lc3_dec_init(PDM_SAMPLE_RATE, PDM_BIT_DEPTH, LC3_FRAME_DURATION_US, PDM_CHANNELS);
    if (ret < 0)
    {
        LOG_ERR("LC3 encoder initialization failed with error: %d", ret);
        return -1;
    }
    LOG_INF("LC3 decoder initialized successfully");
    return 0;
}
int lc3_encoder_stop(void)
{
    int ret = sw_codec_lc3_enc_uninit_all();
    if (ret < 0)
    {
        LOG_ERR("LC3 encoder uninitialization failed with error: %d", ret);
        return -1;
    }
    LOG_INF("LC3 encoder uninitialized successfully");
    return 0;
}
int lc3_decoder_stop(void)
{
    int ret = sw_codec_lc3_dec_uninit_all();
    if (ret < 0)
    {
        LOG_ERR("LC3 decoder uninitialization failed with error: %d", ret);
        return -1;
    }
    LOG_INF("LC3 decoder uninitialized successfully");
    return 0;
}
// Simple audio processing function
static void audio_processing_thread(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1);
    ARG_UNUSED(p2);
    ARG_UNUSED(p3);

    LOG_INF("🎤 Audio processing thread started");
    int             ret;
    int16_t         pcm_req_buffer[PDM_PCM_REQ_BUFFER_SIZE]  = {0};
    int16_t         pcm_req_buffer1[PDM_PCM_REQ_BUFFER_SIZE] = {0};
    static uint16_t encoded_bytes_written_l;
    static uint16_t decoded_bytes_written_l;
    uint8_t         lc3_frame_buffer[MAX_FRAMES_PER_PACKET][LC3_FRAME_LEN];
    uint8_t         frame_count = 0;
    uint8_t         max_frames_per_packet;
    pdm_init();
    audio_i2s_init();
    user_sw_codec_lc3_init();
    while (1)
    {
        if (!get_pdm_sample(pcm_req_buffer, PDM_PCM_REQ_BUFFER_SIZE))
        {
            if (pdm_enabled)
            {
                ret = sw_codec_lc3_enc_run(pcm_req_buffer, sizeof(pcm_req_buffer), LC3_USE_BITRATE_FROM_INIT, 0,
                                           LC3_FRAME_LEN, lc3_frame_buffer[frame_count], &encoded_bytes_written_l);
                if (ret < 0)
                {
                    LOG_ERR("LC3 encoding failed with error: %d", ret);
                    continue;
                }
                else
                {
                    LOG_INF("LC3 encoding successful, bytes written: %d", encoded_bytes_written_l);
                    // LOG_HEXDUMP_INF(lc3_frame_buffer[frame_count], encoded_bytes_written_l,"Hexdump");
#if 1  // test lc3 decode
                    ret = sw_codec_lc3_dec_run(lc3_frame_buffer[frame_count], encoded_bytes_written_l,
                                               PDM_PCM_REQ_BUFFER_SIZE * 2, 0, pcm_req_buffer1,
                                               &decoded_bytes_written_l, false);
                    if (ret < 0)
                    {
                        LOG_ERR("LC3 decoding failed with error: %d", ret);
                        continue;
                    }
                    else
                    {
                        LOG_INF("LC3 decoding successful, bytes written: %d", decoded_bytes_written_l);
                        {
                            i2s_pcm_player((void *)pcm_req_buffer1, decoded_bytes_written_l / 2, 0);
                        }
                    }
#endif
                    if (get_ble_payload_mtu() < 202)
                    {
                        continue;
                    }
                    frame_count++;
                    max_frames_per_packet = get_frames_per_packet();
                    if (frame_count >= max_frames_per_packet)
                    {
                        send_lc3_multi_frame_packet((uint8_t *)lc3_frame_buffer, frame_count, stream_id);
                        frame_count = 0;
                    }
                }
            }
        }
    }
}

int pdm_audio_stream_init(void)
{
    if (pdm_initialized)
    {
        LOG_WRN("⚠️ PDM audio stream already initialized");
        return 0;
    }

    LOG_INF("🔧 Initializing PDM audio stream...");

    // Create audio processing thread
    audio_thread_tid = k_thread_create(&audio_thread_data, audio_thread_stack,
                                       K_THREAD_STACK_SIZEOF(audio_thread_stack), audio_processing_thread, NULL, NULL,
                                       NULL, 3, 0, K_NO_WAIT);

    if (audio_thread_tid)
    {
        k_thread_name_set(audio_thread_tid, "audio_proc");
        pdm_initialized = true;
        LOG_INF("✅ PDM audio stream initialized successfully");
        return 0;
    }
    else
    {
        LOG_ERR("❌ Failed to create audio processing thread");
        return -1;
    }
}
int enable_audio_system(bool enable)
{
    if (enable && !audio_system_enabled)  // Start audio system
    {
        pdm_start();
        audio_i2s_start();
        lc3_encoder_start();
        lc3_decoder_start();
        audio_system_enabled = true;
        LOG_INF("▶️ Started test audio streaming");
    }
    else if (!enable && audio_system_enabled)  // Stop audio system
    {
        audio_i2s_stop();
        pdm_stop();
        lc3_encoder_stop();
        lc3_decoder_stop();
        audio_system_enabled = false;
        LOG_INF("⏹️ Stopped test audio streaming");
    }
    return 0;
}
int pdm_audio_stream_set_enabled(bool enabled)
{
    if (!pdm_initialized)
    {
        LOG_ERR("❌ PDM audio stream not initialized");
        return -ENODEV;
    }

    if (pdm_enabled == enabled)
    {
        LOG_INF("ℹ️ PDM already %s", enabled ? "enabled" : "disabled");
        return 0;
    }

    pdm_enabled = enabled;
    LOG_INF("🎤 PDM audio streaming %s", enabled ? "enabled" : "disabled");
    enable_audio_system(enabled);
    if (enabled)
    {
        // Reset counters when enabling
        frames_transmitted = 0;
        streaming_errors   = 0;
        LOG_INF("📡 Starting test audio streaming (1 packet/sec to avoid BLE overload)");
    }
    else
    {
        LOG_INF("⏹️ Stopped test audio streaming");
    }

    return 0;
}

pdm_audio_state_t pdm_audio_stream_get_state(void)
{
    if (!pdm_initialized)
    {
        return PDM_AUDIO_STATE_DISABLED;
    }
    return pdm_enabled ? PDM_AUDIO_STATE_STREAMING : PDM_AUDIO_STATE_ENABLED;
}

void pdm_audio_stream_get_stats(uint32_t *frames_captured, uint32_t *frames_encoded, uint32_t *frames_transmitted_out,
                                uint32_t *errors)
{
    if (frames_captured)
    {
        *frames_captured = frames_transmitted;  // Mock: captured == transmitted
    }
    if (frames_encoded)
    {
        *frames_encoded = frames_transmitted;  // Mock: encoded == transmitted
    }
    if (frames_transmitted_out)
    {
        *frames_transmitted_out = frames_transmitted;
    }
    if (errors)
    {
        *errors = streaming_errors;
    }
}
