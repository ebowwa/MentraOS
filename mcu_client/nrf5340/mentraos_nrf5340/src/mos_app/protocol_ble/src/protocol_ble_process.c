/*
 * @Author       : Cole
 * @Date         : 2025-07-31 10:40:40
 * @LastEditTime : 2025-08-01 17:17:17
 * @FilePath     : protocol_ble_process.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include "protocol_ble_process.h"
#include "bsp_log.h"

#define TAG "PROTOCOL_BLE_PROCESS"
#define TASK_NAME "PROTOCOL_BLE_PROCESS"

#define PROCESS_THREAD_STACK_SIZE (4096)
#define PROCESS_THREAD_PRIORITY 5
K_THREAD_STACK_DEFINE(process_stack_area, PROCESS_THREAD_STACK_SIZE);
static struct k_thread process_thread_data;
k_tid_t process_thread_handle;

#define IMG_MSGQ_SIZE 5
K_MSGQ_DEFINE(img_msgq, sizeof(image_msg_t), IMG_MSGQ_SIZE, 4);
#if 0
bool enqueue_completed_stream(image_stream *stream)
{
    if (!stream || !stream->image_buffer)
    {
        return false;
    }
    image_msg_t msg = {
        .stream_id = stream->stream_id,
        .type = stream->meta.type,
        .meta = stream->meta,
        .image_buffer = stream->image_buffer,
        .length = (stream->meta.type == IMAGE_TYPE_DISPLAY
                       ? stream->meta.display.total_length
                       : stream->meta.preload.total_length),
    };

    int ret = k_msgq_put(&img_msgq, &msg, K_NO_WAIT);
    if (ret != 0)
    {
        BSP_LOGE(TAG, "ERROR: k_msgq_put failed with code %d", ret);
        return false;
    }
    BSP_LOGI(TAG, "enqueue: type=%d, length=%u", msg.type, msg.length);

    return true;
}
#endif
void protocol_ble_process_init(void *p1, void *p2, void *p3)
{
    BSP_LOGI(TAG, "protocol_ble_process_thread start!!!");
    image_msg_t msg;
    while (1)
    {
        k_msgq_get(&img_msgq, &msg, K_FOREVER);
#if 0
        if (msg.type == IMAGE_TYPE_PRELOAD)
        {

            // preload_image_metadata_t *p = &msg.meta.preload;
            // image_stream_write_to_flash(
            //     p->stream_id,
            //     msg.image_buffer,
            //     msg.length);
        }
        else if (msg.type == IMAGE_TYPE_DISPLAY)
        {

            // image_display_directly(
            //     msg.image_buffer,
            //     msg.length,
            //     msg.length,
            //     msg.meta.display.x,
            //     msg.meta.display.y,
            //     msg.meta.display.width,
            //     msg.meta.display.height,
            //     msg.meta.display.encoding);

            image_cache_insert(msg.stream_id, msg.image_buffer, msg.length, &msg.meta.display);
        }

        /* 处理完毕，释放底层 stream 资源 */
        image_stream *stream = image_stream_get(msg.stream_id);
        if (stream)
        {
            free_image_stream(stream);
                }
        else
        {
            BSP_LOGE(TAG, "ERROR: stream not found for stream_id %d", msg.stream_id);
        }
#endif
    }
}
void protocol_ble_process_thread(void)
{
    process_thread_handle = k_thread_create(&process_thread_data,
                                            process_stack_area,
                                            K_THREAD_STACK_SIZEOF(process_stack_area),
                                            protocol_ble_process_init,
                                            NULL,
                                            NULL,
                                            NULL,
                                            PROCESS_THREAD_PRIORITY,
                                            0,
                                            K_NO_WAIT);
    k_thread_name_set(process_thread_handle, TASK_NAME);
}
