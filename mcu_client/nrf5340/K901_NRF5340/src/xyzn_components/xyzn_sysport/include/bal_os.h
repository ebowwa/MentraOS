/*
 * @Author       : XK  
 * @Date         : 2025-01-12 00:00:00
 * @LastEditTime : 2025-01-12 00:00:00
 * @FilePath     : bal_os.h
 * @Description  : Basic Abstraction Layer for OS functions
 *
 * Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#ifndef __BAL_OS_H__
#define __BAL_OS_H__

#include <zephyr/kernel.h>
#include <zephyr/sys/reboot.h>
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "bsp_log.h"

// Return codes
#define XYZN_OS_EOK         0
#define XYZN_OS_ERROR       -1

// Timeout values
#define XYZN_OS_NO_WAIT     K_NO_WAIT
#define XYZN_OS_FOREVER     K_FOREVER
#define XYZN_OS_WAIT_FOREVER    -1
#define XYZN_OS_WAIT_ON         0

// Type definitions
typedef int64_t xyzn_os_tick_t;

// Function declarations
void xyzn_os_busy_wait(uint32_t us);
void xyzn_os_delay_ms(uint32_t ms);
void xyzn_os_delay_us(uint32_t us);
xyzn_os_tick_t xyzn_os_get_tick(void);
int64_t xyzn_os_uptime_get(void);
void xuzn_os_reset(void);

// Memory management
void *xyzn_malloc(size_t size);
void xyzn_free(void *ptr);

// Timer functions
int xyzn_os_timer_start(struct k_timer *timer_handle, bool auto_reload, int64_t period);
int xyzn_os_timer_stop(struct k_timer *timer_handle);
int xyzn_os_timer_create(struct k_timer *timer_handle, void (*callback)(struct k_timer *timer));

// Mutex functions
int xyzn_os_mutex_create_init(struct k_mutex *mutex);
int xyzn_os_mutex_lock(struct k_mutex *mutex, int64_t time);
int xyzn_os_mutex_unlock(struct k_mutex *mutex);

// Semaphore functions
int xyzn_os_sem_give(struct k_sem *sem);
int xyzn_os_sem_take(struct k_sem *sem, int64_t time);

// Message queue functions
int xyzn_os_msgq_receive(struct k_msgq *msgq, void *msg, int64_t timeout);
int xyzn_os_msgq_send(struct k_msgq *msgq, void *msg, int64_t timeout);

#endif /* __BAL_OS_H__ */
