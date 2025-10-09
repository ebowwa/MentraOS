/*
 * @Author       : Cole
 * @Date         : 2025-04-24 23:29:30
 * @LastEditTime : 2025-10-09 10:44:33
 * @FilePath     : extern_code.c
 * @Description  : 
 * 
 *  Copyright (c) MentraOS Contributors 2025 
 *  SPDX-License-Identifier: Apache-2.0
 */
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(ext_code, LOG_LEVEL_INF);

uint32_t var_ext_sram_data = 10U;

void function_in_extern_flash(void)
{
	LOG_INF("Address of %s %p", __func__, &function_in_extern_flash);
	LOG_INF("Address of var_ext_sram_data %p (value: %d)", (void *)&var_ext_sram_data, var_ext_sram_data);

}
void test_extern_flash(void)
{
	LOG_INF("Address of %s %p", __func__, &test_extern_flash);
}