/*
 * @Author       : Cole
 * @Date         : 2025-07-31 10:40:40
 * @LastEditTime : 2025-08-19 14:15:07
 * @FilePath     : task_ble_receive.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include <pb_encode.h>
#include <pb_decode.h>
#include "mentraos_ble.pb.h"
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/sys/ring_buffer.h>
#include "main.h"
#include "mos_crc.h"

#include "mos_ble_service.h"
#include "mos_lvgl_display.h"
#include "task_ble_receive.h"

#define TAG "TASK_BLE_RECEIVE"
#define TASK_NAME "TASK_BLE"

#define TASK_BLE_THREAD_STACK_SIZE (4096)
#define TASK_BLE_THREAD_PRIORITY 4
K_THREAD_STACK_DEFINE(task_ble_stack_area, TASK_BLE_THREAD_STACK_SIZE);
static struct k_thread task_ble_thread_data;
k_tid_t task_ble_thread_handle;

K_SEM_DEFINE(my_ble_data_sem, 0, 1);

#define BLE_RINGBUF_SIZE 2048
RING_BUF_DECLARE(my_ble_ringbuf, BLE_RINGBUF_SIZE);

#define BLE_CACHE_SIZE 1024
static uint8_t cache_buf[BLE_CACHE_SIZE]; // ble cache buffer

static pb_cb_t g_pb_cb = NULL;
static audio_cb_t g_audio_cb = NULL;
static image_cb_t g_image_cb = NULL;

/**
 * @brief ble send data function
 * @param data Pointer to the data to send
 * @param len Length of the data to send
 * @return 0 on success, -1 on failure
 */
int ble_send_data(const uint8_t *data, uint16_t len)
{
    if ((!data || len == 0) || !get_ble_connected_status())
    // if ((!data || len == 0))
    {
        BSP_LOGE(TAG, "Invalid data or length || ble not connected");
        return -1;
    }
    BSP_LOGI(TAG, "<--Sending data to BLE-->: len=%d", len);
    // BSP_LOGI(TAG, "Data: %s", data);
    // BSP_LOG_BUFFER_HEXDUMP(TAG, data, len, 0);
    uint16_t offset = 0;
    uint16_t mtu = get_ble_payload_mtu();
    while (offset < len)
    {
        uint16_t chunk_len = MIN(len - offset, mtu);
        int retry = 0;
        int err;
        do
        {
            err = custom_nus_send(NULL, &data[offset], chunk_len);
            if (err == 0)
                break;
            BSP_LOGE(TAG, " Chunk send failed (offset=%u len=%u), retry %d", offset, chunk_len, retry);
        } while (++retry < 3); // max 3 retries
        // BSP_LOG_BUFFER_HEXDUMP(TAG, &data[offset], chunk_len, 0);
        if (err != 0)
        {
            BSP_LOGE(TAG, "Final failure at offset=%u", offset);
            return -1;
        }
        offset += chunk_len;
        k_msleep(1); // delay 2ms to avoid flooding the BLE interface
    }

    return 0;
}

/**
 * @brief 将接收到的BLE数据放入环形缓冲区- Put the received BLE data into the circular buffer.
 * @param data 接收到的数据- Pointer to the received data
 * @param len 数据长度- Length of the data
 */
void ble_receive_fragment(const uint8_t *data, uint32_t len)
{
    // 检查BLE环形缓冲区是否有足够的空间来存储接收到的数据
    // check if the ring buffer has enough space to store the received data
    if (len == 0 || data == NULL)
    {
        BSP_LOGE(TAG, "Invalid data or length");
        return;
    }
    if (ring_buf_space_get(&my_ble_ringbuf) < len)
    {
        BSP_LOGI(TAG, "BLE ring buffer overflow");
        return;
    }
    ring_buf_put(&my_ble_ringbuf, data, len);
    k_sem_give(&my_ble_data_sem);
}

/**
 * @brief 重新启动广播并设置新的间隔 - Restart advertising and set new interval
 * @param min_interval_ms 最小间隔（毫秒） - Minimum interval (ms)
 * @param max_interval_ms 最大间隔（毫秒）- Maximum interval (ms)
 */
void restart_adv_with_new_interval(uint16_t min_interval_ms, uint16_t max_interval_ms)
{
    BSP_LOGI(TAG, "Restart advertising with new interval: %d ms - %d ms", min_interval_ms, max_interval_ms);

    ble_interval_set(min_interval_ms, max_interval_ms);
    int err = bt_le_adv_stop();
    if (err != 0)
    {
        BSP_LOGE(TAG, "Advertising failed to stop (err %d)", err);
    }
}

#define MAX_TEXT_LEN 128
static char text_buf[MAX_TEXT_LEN + 1];
static bool decode_string(pb_istream_t *stream, const pb_field_t *field, void **arg)
{
    // BSP_LOGI(TAG, ">>> decode_string called, bytes_left=%zu\n", stream->bytes_left);
    // char *buf = *(char **)arg;
    char *buf = (char *)(*arg);
    size_t to_read = stream->bytes_left;
    if (to_read > MAX_TEXT_LEN)
    {
        to_read = MAX_TEXT_LEN;
    }
    if (!pb_read(stream, (uint8_t *)buf, to_read))
    {
        return false;
    }
    buf[to_read] = '\0';
    BSP_LOGI(TAG, "Decoded string: %s", buf);
    return true;
}

void my_protobuf_handler(const uint8_t *data, size_t len)
{

    mentraos_ble_PhoneToGlasses msg = mentraos_ble_PhoneToGlasses_init_zero;
    msg.payload.display_text.text.funcs.decode = decode_string;
    msg.payload.display_text.text.arg = text_buf;

    pb_istream_t stream = pb_istream_from_buffer(data, len);
    if (!pb_decode(&stream, mentraos_ble_PhoneToGlasses_fields, &msg))
    {
        BSP_LOGE(TAG, "Protobuf decode failed!");
        return;
    }
    switch (msg.which_payload)
    {
    case mentraos_ble_PhoneToGlasses_display_text_tag:
    {
  
        mentraos_ble_DisplayText dt = mentraos_ble_DisplayText_init_zero;
        dt.text.funcs.decode = decode_string;
        dt.text.arg = text_buf;
        stream = pb_istream_from_buffer(data + 3, len - 3); // 跳过前3个字节 ,skip the first 3 bytes
        if (!pb_decode(&stream, mentraos_ble_DisplayText_fields, &dt))
        {
            BSP_LOGE(TAG, "Protobuf decode failed: %s", PB_GET_ERROR(&stream));
            return;
        }
        BSP_LOGI(TAG, "DisplayText: x=%u y=%u size=%u color=0x%X text=%s\n",
                 msg.payload.display_text.x,
                 msg.payload.display_text.y,
                 msg.payload.display_text.size,
                 msg.payload.display_text.color,
                 text_buf);
        BSP_LOGI(TAG, "DISPLAY_TEXT:X=%u y=%u size=%u color=0x%x, text=%s\n", dt.x, dt.y, dt.size, dt.color, (char *)dt.text.arg);
        // BSP_LOGI(TAG, "Neither PhoneToGlasses nor DisplayText decode succeeded!");
        // handle_display_text(&msg.payload.display_text);
        handle_display_text(&dt);
    }
    break;

    case mentraos_ble_PhoneToGlasses_display_image_tag:
        // handle_display_image(&msg.payload.display_image);
        break;

    case mentraos_ble_PhoneToGlasses_mic_state_tag:
        // handle_set_mic_state(&msg.payload.mic_state);
        break;

    default:
        // BSP_LOGW(TAG, "Unknown PhoneToGlasses tag: %d", msg.which_payload);
        break;
    }
}
void register_ble_cbs(pb_cb_t pb_cb,
                      audio_cb_t audio_cb,
                      image_cb_t image_cb)
{
    g_pb_cb = pb_cb;
    g_audio_cb = audio_cb;
    g_image_cb = image_cb;
}

static int detect_and_process_packet(const uint8_t *buf, unsigned int len)
{
    if (len < 3)
    {
        BSP_LOGE(TAG, "Received empty BLE packet error !!!");
        return 0;
    }

    uint8_t hdr = buf[0];
    const uint8_t *payload = buf + 1;
    size_t payload_len = len - 1;

    switch (hdr)
    {
    case BLE_PROTOBUF_HDR:
        if (g_pb_cb)
        {
            g_pb_cb(payload, payload_len);
        }
        else
        {
            BSP_LOGW(TAG, "No Protobuf CB registered");
        }
        break;

    case BLE_AUDIO_HDR:
        if (payload_len < 1)
        {
            BSP_LOGE(TAG, "Audio packet too short");
            return 0;
        }
        if (g_audio_cb)
        {
            uint8_t stream_id = payload[0];
            g_audio_cb(stream_id, payload + 1, payload_len - 1);
        }
        else
        {
            BSP_LOGW(TAG, "No Audio CB registered");
        }
        break;

    case BLE_IMAGE_HDR:
        if (payload_len < 3)
        {
            BSP_LOGE(TAG, "Image packet too short");
            return 0;
        }
        if (g_image_cb)
        {
            uint16_t stream_id = (payload[0] << 8) | payload[1];
            uint8_t idx = payload[2];
            g_image_cb(stream_id, idx, payload + 3, payload_len - 3);
        }
        else
        {
            BSP_LOGW(TAG, "No Image CB registered");
        }
        break;

    default:
        BSP_LOGW(TAG, "Unknown BLE header: 0x%02X", hdr);
        return -1;
        break;
    }
    return len; // return the length of the processed packet
}

void ble_thread_entry(void *p1, void *p2, void *p3)
{
    uint32_t buflen = 0;
    int64_t last_active = 0;
    uint32_t count = 0;

    if (ble_init_sem_take() != 0) // wiait for BLE initialization
    {
        BSP_LOGE(TAG, "Failed to initialize BLE err");
        return;
    }
    // ble_data_test1(); // test function to send data

    register_ble_cbs(my_protobuf_handler, NULL, NULL); // my_audio_handler, my_image_handler);
    while (1)
    {
        // BSP_LOGI(TAG, "ble_process_thread %d", count++);
        // if (10 == count)
        // {
        //     restart_adv_with_new_interval(500, 500);

        //     ble_name_update_data("mos_test_01");
        // }
        k_sem_take(&my_ble_data_sem, K_FOREVER);

        while (buflen < BLE_CACHE_SIZE)
        {
            uint32_t read = ring_buf_get(&my_ble_ringbuf, &cache_buf[buflen], BLE_CACHE_SIZE - buflen);
            if (read <= 0)
                break;
            buflen += read;
            last_active = k_uptime_get();
        }
        BSP_LOGI(TAG, "Total buffered length: %u [%d]", (unsigned)buflen, ring_buf_space_get(&my_ble_ringbuf));
        BSP_LOG_BUFFER_HEXDUMP(TAG, cache_buf, buflen, 0);
        unsigned int offset = 0;
#if 0 // test
        uint8_t buff1[] = {
            0x02, 0xf2, 0x01, 0x24, 0x0a, 0x16, 0x48, 0x65,
            0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c,
            0x64, 0x20, 0x31, 0x35, 0x34, 0x33, 0x38, 0x38,
            0x35, 0x35, 0x35, 0x37, 0x10, 0x90, 0x4e, 0x18,
            0x14, 0x20, 0x14, 0x28, 0x84, 0x02, 0x30, 0x14};
        memcpy(cache_buf, buff1, sizeof(buff1));
        buflen = sizeof(buff1);
#endif
        while (offset < buflen)
        {
            int ret = detect_and_process_packet(cache_buf + offset, buflen - offset);
            if (ret > 0)
            {
                // 成功处理一个完整包
                // successful processing of a complete packet
                offset += ret;
            }
            else if (ret == 0)
            {
                // 半包：剩余字节不足，等下次继续读
                // half packet: remaining bytes are insufficient, continue reading next time
                break;
            }
            else
            {
                // ret < 0：头部非法，跳过一个字节重试
                // ret < 0: illegal header, skip one byte and retry
                BSP_LOGW(TAG, "Illegal header at offset %u, skipping one byte", offset);
                offset += 1;
            }
        }

        // 将剩余的半包搬到缓冲区头部
        // Move the remaining half packet to the buffer head
        if (offset > 0)
        {
            memmove(cache_buf, cache_buf + offset, buflen - offset);
            buflen -= offset;
        }
    }
}
void ble_protocol_receive_thread(void)
{
    task_ble_thread_handle = k_thread_create(&task_ble_thread_data,
                                             task_ble_stack_area,
                                             K_THREAD_STACK_SIZEOF(task_ble_stack_area),
                                             ble_thread_entry,
                                             NULL,
                                             NULL,
                                             NULL,
                                             TASK_BLE_THREAD_PRIORITY,
                                             0,
                                             K_NO_WAIT);
    k_thread_name_set(task_ble_thread_handle, TASK_NAME);
}
