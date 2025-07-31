/*
 * @Author       : Cole
 * @Date         : 2025-07-31 10:40:40
 * @LastEditTime : 2025-07-31 17:05:10
 * @FilePath     : bsp_board_mcu.c
 * @Description  : 
 * 
 *  Copyright (c) MentraOS Contributors 2025 
 *  SPDX-License-Identifier: Apache-2.0
 */

#include "bsp_log.h"
#include "bsp_littlefs.h"
#include "mos_fuel_gauge.h"
#include "bsp_icm42688p.h"
// #include "bsp_ict_15318.h"
#include "bsp_gx8002.h"
#include "bsp_key.h"
#include "bspal_watchdog.h"
#include "bsp_jsa_1147.h"

#define TAG "BSP_BOARD_MCU"
void my_assert_mcu(int err)
{
    if (err == 0)
    {
        BSP_LOGI(TAG, "\t- OK");
    }
    else
    {
        BSP_LOGE(TAG, "\t- FAIL(%d)", err);
    }
    while (err)
        ;
}

void bsp_board_mcu_init(void)
{
    int err = 0;
    BSP_LOGE(TAG, "-- MCU IO Initialize...");

    BSP_LOGI(TAG, "+ bspal_watchdog_init...");
    err = bspal_watchdog_init();
    my_assert_mcu(err);

    BSP_LOGI(TAG, "+ littlefs...");
    err = bsp_littlefs_init();
    my_assert_mcu(err);

    BSP_LOGI(TAG, "+ pm1300...");
    err = pm1300_init();
    my_assert_mcu(err);

    BSP_LOGI(TAG, "+ icm42688p...");
    err = bsp_icm42688p_init();
    my_assert_mcu(err);

    // BSP_LOGI(TAG, "+ ict_15318...");
    // err = bsp_ict_15318_iic_init();
    // my_assert_mcu(err);

    BSP_LOGI(TAG, "+ GX8002...");
    err = bsp_gx8002_init();
    my_assert_mcu(err);

    BSP_LOGI(TAG, "+ jsa_1147...");
    err = bsp_jsa_1147_init();
    my_assert_mcu(err);

    BSP_LOGI(TAG, "+ KEY...");
    err = bsp_key_init();
    my_assert_mcu(err);
}