/*
 * @Author       : XK  
 * @Date         : 2025-01-12 00:00:00
 * @LastEditTime : 2025-01-12 00:00:00
 * @FilePath     : bsp_board_mcu.h
 * @Description  : Board level MCU driver collection
 *
 * Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#ifndef __BSP_BOARD_MCU_H__
#define __BSP_BOARD_MCU_H__

// MCU board initialization function
void bsp_board_mcu_init(void);

// Helper assertion function
void my_assert_mcu(int err);

#endif /* __BSP_BOARD_MCU_H__ */
