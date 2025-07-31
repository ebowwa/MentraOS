/*** 
 * @Author       : Cole
 * @Date         : 2025-07-31 10:45:58
 * @LastEditTime : 2025-07-31 17:27:10
 * @FilePath     : protocol_image_cache.h
 * @Description  : 
 * @
 * @ Copyright (c) MentraOS Contributors 2025 
 * @ SPDX-License-Identifier: Apache-2.0
 */


#ifndef _PROTOCOL_IMAGE_CACHE_H
#define _PROTOCOL_IMAGE_CACHE_H

#include "protocol_image_stream.h"
#define IMAGE_CACHE_SLOTS 5                   // 最大缓存图片数
#define IMAGE_CACHE_IMAGE_MAX_SIZE (10 * 1024) // 每张图片最大字节数

typedef struct
{
    bool used; // 是否被占用
    uint16_t stream_id;
    uint8_t buffer[IMAGE_CACHE_IMAGE_MAX_SIZE];
    uint32_t length;
    display_image_metadata_t meta; // 只缓存display类型
} image_cache_slot_t;

void image_cache_init(void);

const image_cache_slot_t *image_cache_get(uint16_t stream_id);

bool image_cache_remove(uint16_t stream_id);

void image_cache_clear_all(void);

uint32_t image_cache_count(void);

const image_cache_slot_t *image_cache_get_slot(int idx);
bool image_cache_insert(uint16_t stream_id, const uint8_t *data, uint32_t len, const display_image_metadata_t *meta);

#endif // _PROTOCOL_IMAGE_CACHE_H
