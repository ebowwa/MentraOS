#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/logging/log.h>
#include <zephyr/drivers/display.h>
#include <lvgl.h>

LOG_MODULE_REGISTER(lvgl_demo, CONFIG_LOG_DEFAULT_LEVEL);

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

    /* Turn off display blanking */
    display_blanking_off(disp);

    printk("✅ LVGL Display: Dummy display content created successfully!\n");
    printk("🔆 LVGL Display: Display active - ready for projector hardware\n");
    printk("🔄 LVGL Display: Starting main render loop...\n");
    printk("=== LVGL DEMO READY FOR PROTOBUF INTEGRATION ===\n\n");
    /* Main LVGL loop */
    for (;;) {
        lv_timer_handler();
        k_sleep(K_MSEC(5));
    }
}

// Thread definition with logging
static void lvgl_demo_thread_wrapper(void *arg1, void *arg2, void *arg3)
{
    printk("🚀 LVGL Display: Demo thread started (Priority 7, Stack 2048)\n");
    lvgl_demo_thread();
}

K_THREAD_DEFINE(lvgl_demo_tid, 2048, lvgl_demo_thread_wrapper, NULL, NULL, NULL,
                K_PRIO_PREEMPT(7), 0, 0);