/*** 
 * @Author       : Cole
 * @Date         : 2025-07-31 10:45:58
 * @LastEditTime : 2025-07-31 17:26:06
 * @FilePath     : protocol_ble_process.h
 * @Description  : 
 * @
 * @ Copyright (c) MentraOS Contributors 2025 
 * @ SPDX-License-Identifier: Apache-2.0
 */


#ifndef _PROTOCOL_BLE_PROCESS_H_
#define _PROTOCOL_BLE_PROCESS_H_

#include "protocol_image_stream.h"

typedef struct
{
    uint16_t stream_id;
    image_stream_type_t type;
    image_metadata_t meta; /* metadata 联合体会被浅拷贝 */
    uint8_t *image_buffer; /* 指向 stream->image_buffer 注意这是拷贝的是地址 用完记得释放*/
    uint32_t length;         /* 从 meta.total_length 得到 */
} image_msg_t;

bool enqueue_completed_stream(image_stream *stream);
void protocol_ble_process_thread(void);

#endif // !_PROTOCOL_BLE_PROCESS_H_