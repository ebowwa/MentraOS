/*
 * @Author       : XK  
 * @Date         : 2025-01-12 00:00:00
 * @LastEditTime : 2025-01-12 00:00:00
 * @FilePath     : bsp_littlefs.h
 * @Description  : BSP LittleFS file system wrapper functions
 *
 * Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#ifndef __BSP_LITTLEFS_H__
#define __BSP_LITTLEFS_H__

#include <stdint.h>
#include <stddef.h>

// Image file operations
int image_save_to_file(uint16_t stream_id, const uint8_t *data, size_t len);
int image_read_from_file(uint16_t stream_id, uint8_t *buffer, size_t buffer_size);
int image_delete_file(uint16_t stream_id);
void image_list_files(void);
void image_delete_all(void);

// LittleFS initialization
int bsp_littlefs_init(void);

// Test function
void littlefs_test(void);

#endif /* __BSP_LITTLEFS_H__ */
