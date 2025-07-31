/***
 * @Author       : XK
 * @Date         : 2025-06-18 16:51:22
 * @LastEditTime : 2025-06-23 10:47:53
 * @FilePath     : xyzn_ble.h
 * @Description  :
 * @
 * @Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#ifndef __XYZN_BLE_H__
#define __XYZN_BLE_H__
#include "bsp_log.h"


#define BLE_OPCODE_PING         0x01 // JSON message
#define BLE_OPCODE_AUDIO_BLOCK  0xA0 // Audio chunk
#define BLE_OPCODE_IMAGE_BLOCK  0xB0 // Image chunk

#define MAX_LC3_FRAME_SIZE      120
#define MAX_IMAGE_CHUNK_SIZE    512 // MTU MAX:517-6=511
#define BLE_MAX_TYPE_SIZE       32
#define BLE_MAX_MSG_ID_SIZE     32
#define BLE_MAX_RAW_JSON_SIZE   256

#define CMD_START       '{'
#define CMD_END         '}'

// Parsed structures
struct ble_ping_msg_t
{
    char type[BLE_MAX_TYPE_SIZE];
    char msg_id[BLE_MAX_MSG_ID_SIZE];
    char raw_json[BLE_MAX_RAW_JSON_SIZE];
};

struct ble_audio_block_t
{
    uint8_t stream_id;
    uint8_t lc3_data[MAX_LC3_FRAME_SIZE];
    uint16_t lc3_len;
};

struct ble_image_block_t
{
    uint16_t stream_id;
    uint16_t crc16;
    uint8_t chunk_index;
    uint8_t chunk_data[MAX_IMAGE_CHUNK_SIZE];
    uint16_t chunk_len; // 每块图像数据包长度
};

struct ble_packet_t
{
    uint8_t opcode;   // Opcode of the packet
    uint16_t raw_len; // Length of the raw packet
    union
    {
        struct ble_ping_msg_t ping;
        struct ble_audio_block_t audio;
        struct ble_image_block_t image;
    } payload;
};

typedef struct ble_packet_t ble_packet;
typedef struct ble_image_block_t ble_image_block;
typedef struct ble_audio_block_t ble_audio_block;
typedef struct ble_ping_msg_t ble_ping_msg;

void ble_protocol_receive_thread(void);

int ble_send_data(const uint8_t *data, uint16_t len);

void ble_receive_fragment(const uint8_t *data, size_t len);

#endif // __XYZN_BLE_H__