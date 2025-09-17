/***
 * @Author       : XK
 * @Date         : 2025-07-02 14:07:24
 * @LastEditTime : 2025-07-02 14:13:34
 * @FilePath     : xyzn_fuel_gauge.h
 * @Description  :
 * @
 * @Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#ifndef __XYZN_FUEL_GAUGE_H__
#define __XYZN_FUEL_GAUGE_H__

int fuel_gauge_init(const struct device *charger);

int fuel_gauge_update(const struct device *charger, bool vbus_connected);

int pm1300_init(void);

void batter_monitor(void);
#endif /* __XYZN_FUEL_GAUGE_H__ */
