/*
 * @Author       : XK
 * @Date         : 2025-06-18 16:50:43
 * @LastEditTime : 2025-06-26 15:19:03
 * @FilePath     : xyzn_ble.c
 * @Description  :
 *
 * Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */
#include "cJSON.h"
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/sys/ring_buffer.h>
#include "main.h"
#include "xyzn_crc.h"
#include "xyzn_ble.h"
#include "xyzn_ble_service.h"

#include "protocol_image_stream.h"

#define TAG "XYZN_BLE"
#define TASK_NAME "XYZN_BLE"

#define XYZN_BLE_THREAD_STACK_SIZE (4096)
#define XYZN_BLE_LVGL_THREAD_PRIORITY 4
K_THREAD_STACK_DEFINE(xyzl_ble_stack_area, XYZN_BLE_THREAD_STACK_SIZE);
static struct k_thread xyzl_ble_thread_data;
k_tid_t xyzl_ble_thread_handle;

K_SEM_DEFINE(my_ble_data_sem, 0, 1);

#define BLE_RINGBUF_SIZE 2048
RING_BUF_DECLARE(my_ble_ringbuf, BLE_RINGBUF_SIZE);

#define BLE_CACHE_SIZE 1024
static uint8_t cache_buf[BLE_CACHE_SIZE]; // ble 缓存数据
/**
 * @brief 发送数据到ble
 * @param data 数据
 * @param len 数据长度
 * @return int 0:成功，其他:失败
 */
int ble_send_data(const uint8_t *data, uint16_t len)
{
    if ((!data || len == 0)) //|| !get_ble_connected_status())
    {
        BSP_LOGE(TAG, "Invalid data or length || ble not connected");
        return -1;
    }
    BSP_LOGI(TAG, "<--Sending data to BLE-->: len=%d", len);
    // BSP_LOGI(TAG, "Data: %s", data);
    BSP_LOG_BUFFER_HEXDUMP(TAG, data, len, 0);
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
        } while (++retry < 3); // 重试3次
        // BSP_LOG_BUFFER_HEXDUMP(TAG, &data[offset], chunk_len, 0);
        if (err != 0)
        {
            BSP_LOGE(TAG, "Final failure at offset=%u", offset);
            return -1;
        }
        offset += chunk_len;
        k_msleep(2); // 节流（可根据接收端能力调整）
    }

    return 0;
}
uint32_t parse_single_packet(const uint8_t *data, uint32_t len, ble_packet *out)
{
    // 检查输入参数是否合法
    if (len < 1 || !data || !out)
    {
        DUG;
        return 0;
    }
    memset(out, 0, sizeof(*out));

    BSP_LOGI(TAG, "Received opcode: %d", data[0]);
    switch (data[0])
    {
    case BLE_OPCODE_PING:
    {
        if (len < 2 || data[1] != CMD_START)
            return 0;

        uint32_t json_start = 1;
        bool parsing = false;
        int brace_count = 0;
        for (uint32_t i = 1; i < len; i++)
        {
            if (data[i] == CMD_START) // 如果遇到CMD_START，表示开始解析JSON
            {
                if (!parsing)
                {
                    parsing = true;
                    json_start = i;
                }
                brace_count++;
            }
            else if (data[i] == CMD_END) // 如果遇到CMD_END，表示结束解析JSON
            {
                brace_count--;
                // 如果解析状态为true，并且括号计数为0，表示JSON解析完成
                if (parsing && brace_count == 0 && i + 1 <= len)
                {
                    uint32_t json_len = i - json_start + 1; // 计算JSON长度

                    if (json_len >= sizeof(out->payload.ping.raw_json)) // 检查JSON长度是否超过最大长度
                        return 0;

                    memcpy(out->payload.ping.raw_json, &data[json_start], json_len); // 复制JSON数据到输出参数
                    out->payload.ping.raw_json[json_len] = 0;
                    out->raw_len = json_len + json_start;

                    cJSON *root = cJSON_Parse(out->payload.ping.raw_json);
                    if (!root)
                    {
                        BSP_LOGE(TAG, "cJSON parse error");
                        return 0;
                    }
                    cJSON *type = cJSON_GetObjectItem(root, "type");
                    cJSON *msg_id = cJSON_GetObjectItem(root, "msg_id");

                    if (!cJSON_IsString(type) || !cJSON_IsString(msg_id))
                    {
                        cJSON_Delete(root);
                        BSP_LOGE(TAG, "Missing or invalid type/msg_id error !!!");
                        return 0;
                    }
                    out->opcode = data[0];
                    strncpy(out->payload.ping.type, type->valuestring, sizeof(out->payload.ping.type) - 1);
                    strncpy(out->payload.ping.msg_id, msg_id->valuestring, sizeof(out->payload.ping.msg_id) - 1);
                    cJSON_Delete(root);
                    return out->raw_len;
                }
            }
        }
        return 0;
    }
    case BLE_OPCODE_AUDIO_BLOCK:
    {
        // 解析音频数据包
        if (len < 2)
            return 0;
        // 设置音频流ID
        out->payload.audio.stream_id = data[1];
        // 设置LC3数据长度
        out->payload.audio.lc3_len = len - 2;
        // 检查LC3数据长度是否超过最大长度
        if (out->payload.audio.lc3_len > MAX_LC3_FRAME_SIZE)
            return 0;
        out->opcode = data[0];
        // 复制LC3数据到输出参数
        memcpy(out->payload.audio.lc3_data, &data[2], out->payload.audio.lc3_len);
        // 设置原始数据长度
        out->raw_len = len;
        return len;
    }
    case BLE_OPCODE_IMAGE_BLOCK:
    {
        // [0xB0][stream_id_hi][stream_id_lo][CRC16_H][CRC16_L][chunk_index][chunk_data...]
        if (len < 6) // 最小长度：1+2+2+1 = 6 字节
        {
            DUG;
            return 0;
        }
        uint8_t chunk_len = len - 6; // 数据包长度减去固定头部长度
        if (chunk_len > MAX_IMAGE_CHUNK_SIZE)
        {
            DUG;
            return 0;
        }
        // 先校验 CRC
        uint16_t crc16 = (data[3] << 8) | data[4];
        uint16_t crc_host = xyzn_crc16_ccitt(data + 5, chunk_len);
        if (crc_host != crc16)
        {
            BSP_LOGW(TAG, "CRC error: got 0x%04X, expect 0x%04X", crc16, crc_host);
            return 0; // 丢弃
        }

        // 校验通过后，才填充 out
        out->payload.image.stream_id = (data[1] << 8) | data[2];
        out->opcode = data[0];
        out->payload.image.crc16 = crc16;
        out->payload.image.chunk_index = data[5];
        out->payload.image.chunk_len = chunk_len;
        memcpy(out->payload.image.chunk_data, &data[6], chunk_len);
        out->raw_len = len;
        return len;
    }

    default:
        DUG;
        return 0;
    }
}

void handle_ble_packet(const ble_packet *pkt)
{
    // 根据数据包的操作码进行不同的处理
    switch (pkt->opcode)
    {
    case BLE_OPCODE_PING:
        BSP_LOGI(TAG, "JSON: type=%s, msg_id=%s", pkt->payload.ping.type, pkt->payload.ping.msg_id);

        if (strcmp(pkt->payload.ping.type, "disconnect") == 0)
        {
            // 终止连接并清理资源
            BSP_LOGI(TAG, "ble master Disconnecting...");
            // handle_disconnect();
        }
        else if (strcmp(pkt->payload.ping.type, "request_battery_state") == 0)
        {
            // 报告当前电池百分比，以及是否立即充电
            BSP_LOGI(TAG, "request_battery_state");
        }
        else if (strcmp(pkt->payload.ping.type, "request_device_info") == 0)
        {
            // 报告设备信息
            BSP_LOGI(TAG, "request_device_info");
        }
        else if (strcmp(pkt->payload.ping.type, "enter_pairing_mode") == 0)
        {
            // 进入配对状态
            BSP_LOGI(TAG, "enter_pairing_mode");
        }
        else if (strcmp(pkt->payload.ping.type, "request_head_position") == 0)
        {
            // 报告佩戴者当前的头部倾斜角度（以度为单位）
            BSP_LOGI(TAG, "request_head_position");
        }
        else if (strcmp(pkt->payload.ping.type, "set_head_up_angle") == 0)
        {
            // 配置平视检测角度（以度为单位）
            BSP_LOGI(TAG, "request_head_orientation");
        }
        else if (strcmp(pkt->payload.ping.type, "ping") == 0)
        {
            // 验证连接是否仍处于活动状态
            BSP_LOGI(TAG, "ping");

            static uint8_t data[600] = {0}; // test
            for (uint32_t i = 0; i < 600; i++)
            {
                data[i] = i;
            }
            ble_send_data(data, sizeof(data));
        }
        else if (strcmp(pkt->payload.ping.type, "set_mic_state") == 0)
        {
            // 设置麦克风状态 打开或关闭板载麦克风
            BSP_LOGI(TAG, "set_mic_state");
        }
        else if (strcmp(pkt->payload.ping.type, "set_vad_enabled") == 0)
        {
            // 启用或禁用语音活动检测（VAD）
            BSP_LOGI(TAG, "set_vad_enabled");
        }
        else if (strcmp(pkt->payload.ping.type, "configure_vad") == 0)
        {
            // 调整 VAD 灵敏度阈值 （0–100）
            BSP_LOGI(TAG, "configure_vad");
        }
        else if (strcmp(pkt->payload.ping.type, "display_text") == 0)
        {
            // 显示文本
            BSP_LOGI(TAG, "display_text");
        }
        else if (strcmp(pkt->payload.ping.type, "display_image") == 0)
        {
            // 发送要在显示器上渲染的位图图像
            BSP_LOGI(TAG, "display_image");
            image_register_stream_from_json(pkt->payload.ping.raw_json);
        }
        else if (strcmp(pkt->payload.ping.type, "preload_image") == 0)
        {
            // 将图像预加载到flash中以供以后使用
            BSP_LOGI(TAG, "preload_image");
            image_register_stream_from_json(pkt->payload.ping.raw_json);
        }
        else if (strcmp(pkt->payload.ping.type, "display_cached_image") == 0)
        {
            // 显示先前预加载的图像
            BSP_LOGI(TAG, "display_cached_image");
        }
        else if (strcmp(pkt->payload.ping.type, "clear_cached_image") == 0)
        {
            // 清除先前预加载的图像
            BSP_LOGI(TAG, "clear_cached_image");
        }
        break;
    case BLE_OPCODE_AUDIO_BLOCK:
        BSP_LOGI(TAG, "AUDIO: stream_id=%u, len=%u",
                 pkt->payload.audio.stream_id,
                 (unsigned)pkt->payload.audio.lc3_len);
        break;
    case BLE_OPCODE_IMAGE_BLOCK:
    {
        // [0xB0][stream_id_hi][stream_id_lo][CRC16_H][CRC16_L][chunk_index][chunk_data...]
        BSP_LOGI(TAG, "IMAGE: stream_id=0x%04X, crc = %d chunk=%u, len=%u",
                 pkt->payload.image.stream_id,
                 pkt->payload.image.crc16,
                 pkt->payload.image.chunk_index,
                 pkt->payload.image.chunk_len);
        image_chunk_handler(&pkt->payload.image);
    }
    break;
    default:
        BSP_LOGI(TAG, "Unknown packet");
        break;
    }
}
/**
 * @brief 将接收到的BLE数据放入环形缓冲区
 * @param data 接收到的数据
 * @param len 数据长度
 */
void ble_receive_fragment(const uint8_t *data, uint32_t len)
{
    // 检查BLE环形缓冲区是否有足够的空间来存储接收到的数据
    if (ring_buf_space_get(&my_ble_ringbuf) < len)
    {
        BSP_LOGI(TAG, "BLE ring buffer overflow");
        return;
    }
    ring_buf_put(&my_ble_ringbuf, data, len);
    k_sem_give(&my_ble_data_sem);
}

/**
 * @brief 重新启动广播并设置新的间隔
 * @param min_interval_ms 最小间隔（毫秒）
 * @param max_interval_ms 最大间隔（毫秒）
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
void ble_thread_entry(void *p1, void *p2, void *p3)
{
    uint32_t buflen = 0;
    int64_t last_active = 0;
    uint32_t count = 0;

    if (ble_init_sem_take() != 0) // 等待BLE初始化完成
    {
        BSP_LOGE(TAG, "Failed to initialize BLE err");
        return;
    }
    // 无限循环
    while (1)
    {
        // BSP_LOGI(TAG, "ble_process_thread %d", count++);
        // if (10 == count)
        // {
        //     restart_adv_with_new_interval(500, 500);

        //     ble_name_update_data("xyzn_test_01");
        // }
        k_sem_take(&my_ble_data_sem, K_FOREVER); // 等待数据到来

        while (buflen < BLE_CACHE_SIZE)
        {
            uint32_t read = ring_buf_get(&my_ble_ringbuf, &cache_buf[buflen], sizeof(cache_buf) - buflen);
            if (read <= 0)
                break;
            buflen += read;
            last_active = k_uptime_get();
        }
        BSP_LOGI(TAG, "Total buffered length: %u [%d]", (unsigned)buflen, ring_buf_space_get(&my_ble_ringbuf));
        BSP_LOG_BUFFER_HEXDUMP(TAG, cache_buf, buflen, 0);

        uint32_t offset = 0;
        while (offset < buflen)
        {
            ble_packet pkt;
            uint32_t parsed = parse_single_packet(&cache_buf[offset], buflen - offset, &pkt);
            if (parsed == 0)
            {
                offset += 1; // 如果解析失败，则跳过第一个字节并检查是否超时
                if ((k_uptime_get() - last_active > 200) || (offset >= buflen))
                {
                    BSP_LOGE(TAG, "Timeout with unparseable data, clearing buffer err");
                    buflen = 0;
                    break;
                }
                continue;
            }
            handle_ble_packet(&pkt);
            offset += parsed;
            last_active = k_uptime_get();
        }
        if (offset < buflen)
        {
            memmove(cache_buf, &cache_buf[offset], buflen - offset);
            buflen -= offset;
        }
        else
        {
            buflen = 0;
        }
    }
}
void ble_protocol_receive_thread(void)
{
    xyzl_ble_thread_handle = k_thread_create(&xyzl_ble_thread_data,
                                             xyzl_ble_stack_area,
                                             K_THREAD_STACK_SIZEOF(xyzl_ble_stack_area),
                                             ble_thread_entry,
                                             NULL,
                                             NULL,
                                             NULL,
                                             XYZN_BLE_LVGL_THREAD_PRIORITY,
                                             0,
                                             K_NO_WAIT);
    k_thread_name_set(xyzl_ble_thread_handle, TASK_NAME);
}
