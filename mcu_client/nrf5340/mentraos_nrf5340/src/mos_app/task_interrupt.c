/*
 * @Author       : Cole
 * @Date         : 2025-07-31 10:40:40
 * @LastEditTime : 2025-07-31 17:23:48
 * @FilePath     : task_interrupt.c
 * @Description  :
 *
 *  Copyright (c) MentraOS Contributors 2025
 *  SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include "bal_os.h"
#include "bsp_gx8002.h"
#include "bspal_gx8002.h"
#include "bsp_jsa_1147.h"
#include "bsp_key.h"
#include "bspal_key.h"
#include "task_interrupt.h"

#define TAG "TASK_INTERRUPT"
#define TASK_NAME "TASK_INTERRUPT"

#define TASK_INTERRUPT_THREAD_STACK_SIZE (4096)
#define TASK_INTERRUPT_THREAD_PRIORITY 5
K_THREAD_STACK_DEFINE(task_interrupt_stack_area, TASK_INTERRUPT_THREAD_STACK_SIZE);
static struct k_thread task_interrupt_thread_data;
k_tid_t task_interrupt_thread_handle;

K_MSGQ_DEFINE(bsp_interrupt_queue, sizeof(mos_interrupt_queue), 10, 4);

volatile bool debouncing = false;

void gx8002_int_isr(const struct device *dev,
                    struct gpio_callback *cb,
                    uint32_t pins)
{
    BSP_LOGI(TAG, "external interrupt occurs at %x", pins);
    mos_interrupt_queue event;
#if 1
    gpio_pin_interrupt_configure_dt(&gx8002_int4, GPIO_INT_DISABLE);
#endif
    event.event = BSP_TYPE_GX8002_INT4;                           
    event.tick = mos_get_tick();                                  
    mos_msgq_send(&bsp_interrupt_queue, &event, MOS_OS_WAIT_ON); 
    BSP_LOGI(TAG, "gx8002_int_isr event: %d, tick: %lld", event.event, event.tick);
}
void jsa_1147_int_isr(const struct device *dev,
                      struct gpio_callback *cb,
                      uint32_t pins)
{
    BSP_LOGI(TAG, "external interrupt occurs at %x", pins);
    mos_interrupt_queue event;
#if 1
    gpio_pin_interrupt_configure_dt(&jsa_1147_int1, GPIO_INT_DISABLE);
#endif
    event.event = BSP_TYPE_JSA_1147_INT1;                         
    event.tick = mos_get_tick();                                  
    mos_msgq_send(&bsp_interrupt_queue, &event, MOS_OS_WAIT_ON); 
    BSP_LOGI(TAG, "jsa_1147_int event: %d, tick: %lld", event.event, event.tick);
}

void gpio_key1_int_isr(const struct device *dev,
                       struct gpio_callback *cb,
                       uint32_t pins)
{
    BSP_LOGI(TAG, "external interrupt occurs at %x", pins);
    if (debouncing)
    {
        BSP_LOGI(TAG, "Debouncing in progress, ignoring interrupt");
        return; 
    }
    debouncing = true; 
    mos_interrupt_queue event;
#if 0
    gpio_pin_interrupt_configure_dt(&gpio_key1, GPIO_INT_DISABLE);
#endif
    event.event = BSP_TYPE_KEY1;                                 
    event.tick = mos_get_tick();                                  
    mos_msgq_send(&bsp_interrupt_queue, &event, MOS_OS_WAIT_ON); 
    BSP_LOGI(TAG, "gpio_key1_int_isr event: %d, tick: %lld", event.event, event.tick);
}

void task_interrupt(void *p1, void *p2, void *p3)
{
    mos_interrupt_queue event; 
    uint64_t tick;
    bspal_key_init();
    BSP_LOGI(TAG, "task_interrupt start");
    while (1)
    {
        if (mos_msgq_receive(&bsp_interrupt_queue, &event, MOS_OS_WAIT_FOREVER) == MOS_OS_EOK)
        {
            // BSP_LOGI(TAG, "event: %d, tick: %llu", event.event, event.tick);
            tick = mos_get_tick(); 

            switch (event.event)
            {
            case BSP_TYPE_GX8002_INT4:
            {
                gx8002_int_isr_enable();
                int event_id = gx8002_read_voice_event();
                if (event_id <= 0)
                {
                    BSP_LOGE(TAG, "gx8002 int4 err event_id:%d", event_id);
                }
                else
                {
                    BSP_LOGI(TAG, "gx8002 int4 ok event_id:%d", event_id);
                }
                BSP_LOGI(TAG, "gx8002 int4  tick[%lld]:%lld", tick, event.tick);
            }
            break;

            case BSP_TYPE_JSA_1147_INT1:
            {
                jsa_1147_int1_isr_enable();
                uint8_t flags;
                if (read_jsa_1147_int_flag(&flags) != 0)
                {
                    BSP_LOGE(TAG, "jsa_1147 int1 err flags:%d", flags);
                }
                else
                {
                    BSP_LOGI(TAG, "jsa_1147 int1 ok flags:%d", flags);
                    write_jsa_1147_int_flag(&flags);
                }
                BSP_LOGI(TAG, "jsa_1147 int1 tick[%lld]:%lld", tick, event.tick);
            }
            break;
            case BSP_TYPE_KEY1:
            {
                // gpio_key1_int_isr_enable();

                bspal_debounce_timer_start();
                BSP_LOGI(TAG, "gpio_key1_int_isr tick[%lld]:%lld", tick, event.tick);
            }
            break;

            default:
                break;
            }
        }
    }
}
void task_interrupt_thread(void)
{
    task_interrupt_thread_handle = k_thread_create(&task_interrupt_thread_data,
                                                   task_interrupt_stack_area,
                                                   K_THREAD_STACK_SIZEOF(task_interrupt_stack_area),
                                                   task_interrupt,
                                                   NULL,
                                                   NULL,
                                                   NULL,
                                                   TASK_INTERRUPT_THREAD_PRIORITY,
                                                   0,
                                                   MOS_OS_NO_WAIT);
    k_thread_name_set(task_interrupt_thread_handle, TASK_NAME);
}
