/***
 * @Author       : XK
 * @Date         : 2025-05-10 14:20:34
 * @LastEditTime : 2025-07-04 11:30:43
 * @FilePath     : bal_os.h
 * @Description  :
 * @
 * @Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#ifndef __BAL_OS_H__
#define __BAL_OS_H__

#include <zephyr/types.h>
#include <zephyr/kernel.h>
#include "bsp_log.h"

#define TICK_OF_MS(ms)              k_ticks_to_ms_floor64(ms) // 将tick滴答的时间值转换为毫秒
#define TICK_OF_S(s)                k_ticks_to_ms_floor64(s)/1000
#define pdTICKS_TO_S(xTicks)        k_ticks_to_ms_floor64(xTicks)/1000
#define pdTICKS_TO_MS(xTicks)       k_ticks_to_ms_floor64(xTicks)
#define pdMS_TO_TICKS(xTimeInMs)    k_ms_to_ticks_ceil64(xTimeInMs)// 将毫秒转换为tick 滴答的时间值


typedef uint32_t xyzn_os_time_t;
typedef uint64_t xyzn_os_time_ms_t;
typedef uint64_t xyzn_os_time_us_t;
typedef uint64_t xyzn_os_tick_t;

#define XYZN_OS_WAIT_ON         0
#define XYZN_OS_WAIT_FOREVER    -1
#define XYZN_OS_MAX_DELAY       0xFFFFFFFF
#define XYZN_OS_NO_WAIT        K_NO_WAIT
#define XYZN_OS_FOREVER        K_FOREVER
typedef enum
{
    XYZN_OS_EOK = 0,
    XYZN_OS_ERROR = -1,
    XYZN_OS_TIMEOUT = -2
} OS_RET_CODE;

void xyzn_os_delay_ms(uint32_t ms);

void xyzn_os_delay_us(uint32_t us);

void xyzn_os_busy_wait(uint32_t us);

void xuzn_os_reset(void);

void xyzn_free(void *ptr);

void *xyzn_malloc(size_t size);

int64_t xyzn_os_uptime_get(void);

xyzn_os_tick_t xyzn_os_get_tick(void);

int xyzn_os_timer_stop(struct k_timer *timer_handle);

int xyzn_os_timer_start(struct k_timer *timer_handle, bool auto_reload, int64_t period);

int xyzn_os_timer_create(struct k_timer *timer_handle, void (*callback)(struct k_timer *timer));

int xyzn_os_mutex_create_init(struct k_mutex *mutex);

int xyzn_os_mutex_lock(struct k_mutex *mutex, int64_t time);

int xyzn_os_mutex_unlock(struct k_mutex *mutex);

int xyzn_os_sem_give(struct k_sem *sem);

int xyzn_os_sem_take(struct k_sem *sem, int64_t time);

int xyzn_os_msgq_receive(struct k_msgq *msgq, void *msg, int64_t timeout);

int xyzn_os_msgq_send(struct k_msgq *msgq, void *msg, int64_t timeout);
#endif // !__BAL_OS_H__