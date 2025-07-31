/*** 
 * @Author       : Cole
 * @Date         : 2025-07-31 10:45:58
 * @LastEditTime : 2025-07-31 17:27:44
 * @FilePath     : protocol_image_flash.h
 * @Description  : 
 * @
 * @ Copyright (c) MentraOS Contributors 2025 
 * @ SPDX-License-Identifier: Apache-2.0
 */


#ifndef _PROTOCOL_IMAGE_FLASH_H_
#define _PROTOCOL_IMAGE_FLASH_H_



#include <stddef.h>
#include "protocol_image_stream.h"

void image_flash_save(const preload_image_metadata_t *meta, const uint8_t *data, size_t len);
bool image_flash_load(int image_id, uint8_t *buf, size_t buf_size, size_t *out_len);
void image_flash_remove(int image_id);
void image_flash_clear_all(void);


#endif // _PROTOCOL_IMAGE_FLASH_H_