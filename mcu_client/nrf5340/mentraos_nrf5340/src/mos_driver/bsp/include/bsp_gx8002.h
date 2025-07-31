/*** 
 * @Author       : Cole
 * @Date         : 2025-07-31 11:52:17
 * @LastEditTime : 2025-07-31 17:01:25
 * @FilePath     : bsp_gx8002.h
 * @Description  : 
 * @
 * @ Copyright (c) MentraOS Contributors 2025 
 * @ SPDX-License-Identifier: Apache-2.0
 */

#ifndef __BSP_GX8002_H__
#define __BSP_GX8002_H__

#include "bsp_log.h"

#define GX8002_I2C_ADDR 0x2f


extern struct gpio_dt_spec gx8002_int4;

int bsp_gx8002_init(void);

int gx8002_write_byte(uint8_t b);

int gx8002_read_byte(uint8_t *p, bool ack);

int gx8002_i2c_read_reg(uint8_t reg, uint8_t *pval);

int gx8002_i2c_write_reg(uint8_t reg, uint8_t val);

void gx8002_i2c_start(void);

void gx8002_i2c_stop(void);

void gx8002_int_isr_enable(void);
#endif // !__BSP_GX8002_H__