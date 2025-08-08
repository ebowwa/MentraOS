#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/logging/log.h>
#include <zephyr/drivers/display.h>
#include <lvgl.h>
#include "lvgl_interface.h"

LOG_MODULE_REGISTER(lvgl_demo, CONFIG_LOG_DEFAULT_LEVEL);

// Global LVGL objects for protobuf integration
static lv_obj_t *protobuf_text_label = NULL;
static bool display_ready = false;
static K_MUTEX_DEFINE(lvgl_mutex);

static void lvgl_demo_thread(void)
{
    printk("\n=== LVGL DUMMY DISPLAY DEMO ===\n");
    printk("🎨 LVGL Display: Starting demo thread...\n");
    
    const struct device *disp = DEVICE_DT_GET(DT_CHOSEN(zephyr_display));
    
    if (!device_is_ready(disp)) {
        printk("❌ LVGL Display: Device not ready!\n");
        return;
    }

    printk("✅ LVGL Display: Device ready - %s\n", disp->name);
    printk("📱 LVGL Display: Resolution 640x480, 16-bit color\n");

    /* Ensure the display driver finished init */
    k_sleep(K_MSEC(500));

    printk("🎨 LVGL Display: Creating widgets on dummy display...\n");
    
    /* Create a simple label */
    lv_obj_t *label = lv_label_create(lv_scr_act());
    lv_label_set_text(label, "Hello, LVGL on Mentra!");
    lv_obj_set_style_text_color(label, lv_color_white(), 0);
    lv_obj_align(label, LV_ALIGN_CENTER, 0, -50);
    printk("   📝 Created main label: 'Hello, LVGL on Mentra!'\n");

    /* Create a second label with project info */
    lv_obj_t *info_label = lv_label_create(lv_scr_act());
    lv_label_set_text(info_label, "MentraOS Smart Glasses\nProjector Test");
    lv_obj_set_style_text_color(info_label, lv_color_hex(0x00FF00), 0);
    lv_obj_align(info_label, LV_ALIGN_CENTER, 0, 50);
    printk("   📝 Created info label: 'MentraOS Smart Glasses\\nProjector Test'\n");

    /* Create protobuf text label for dynamic content */
    protobuf_text_label = lv_label_create(lv_scr_act());
    lv_label_set_text(protobuf_text_label, "Waiting for protobuf messages...");
    lv_obj_set_style_text_color(protobuf_text_label, lv_color_hex(0xFFFF00), 0);
    lv_obj_align(protobuf_text_label, LV_ALIGN_CENTER, 0, 120);
    printk("   📱 Created protobuf label: Ready for DisplayText messages\n");

    /* Turn off display blanking */
    display_blanking_off(disp);

    printk("✅ LVGL Display: Dummy display content created successfully!\n");
    printk("🔆 LVGL Display: Display active - ready for projector hardware\n");
    printk("🔄 LVGL Display: Starting main render loop...\n");
    printk("=== LVGL DEMO READY FOR PROTOBUF INTEGRATION ===\n\n");
    
    /* Mark display as ready for protobuf integration */
    display_ready = true;
    
    /* Main LVGL loop */
    for (;;) {
        lv_timer_handler();
        k_sleep(K_MSEC(5));
    }
}

// Implementation of LVGL interface functions
void lvgl_update_text_display(const char *text, uint32_t color, uint32_t x, uint32_t y, uint32_t size)
{
    if (!display_ready || !protobuf_text_label) {
        printk("⚠️ LVGL: Display not ready\n");
        return;
    }

    k_mutex_lock(&lvgl_mutex, K_FOREVER);
    
    lv_label_set_text(protobuf_text_label, text);
    lv_obj_set_style_text_color(protobuf_text_label, lv_color_hex(color), 0);
    lv_obj_set_pos(protobuf_text_label, x, y);
    
    k_mutex_unlock(&lvgl_mutex);
}

void lvgl_display_protobuf_text(const char *text, uint32_t color, uint32_t x, uint32_t y, uint32_t size)
{
    // Concise logging for protobuf DisplayText
    printk("📱 LVGL: '%s' | X:%d Y:%d | Color:0x%04X Size:%d\n", 
           text, x, y, color, size);
    
    lvgl_update_text_display(text, color, x, y, size);
}

bool lvgl_is_display_ready(void)
{
    return display_ready;
}

// Thread definition with logging
static void lvgl_demo_thread_wrapper(void *arg1, void *arg2, void *arg3)
{
    printk("🚀 LVGL Display: Demo thread started (Priority 7, Stack 2048)\n");
    lvgl_demo_thread();
}

K_THREAD_DEFINE(lvgl_demo_tid, 2048, lvgl_demo_thread_wrapper, NULL, NULL, NULL,
                K_PRIO_PREEMPT(7), 0, 0);