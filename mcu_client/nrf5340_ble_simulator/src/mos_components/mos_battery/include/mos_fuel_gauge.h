/*** 
 * @Author       : Cole
 * @Date         : 2025-08-25 19:49:31
 * @LastEditTime : 2025-09-08 15:53:59
 * @FilePath     : mos_fuel_gauge.h
 * @Description  : 
 * @
 * @ Copyright (c) MentraOS Contributors 2025 
 * @ SPDX-License-Identifier: Apache-2.0
 */

#ifndef _MOS_FUEL_GAUGE_H_
#define _MOS_FUEL_GAUGE_H_
#include "bsp_log.h"

int fuel_gauge_init(const struct device *charger);

int fuel_gauge_update(const struct device *charger, bool vbus_connected);

int pm1300_init(void);

void batter_monitor(void);
#endif /* _MOS_FUEL_GAUGE_H_ */
