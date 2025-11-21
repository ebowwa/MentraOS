/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file positioned_text_example.c
 * @brief Example demonstrating positioned text functionality
 * 
 * This file shows how to use the new positioned text features
 * for LiveCaption text display with precise positioning and font control.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>

#include "display_manager.h"

LOG_MODULE_REGISTER(positioned_text_example, LOG_LEVEL_INF);

/**
 * @brief Example 1: Simple positioned text at different locations
 */
void example_simple_positioned_text(void)
{
    LOG_INF("📍 Example 1: Simple positioned text");
    
    // Clear any existing text and switch to positioned mode
    display_manager_switch_to_positioned_mode();
    k_msleep(100);
    
    // Display title at top center (approximate)
    display_manager_show_positioned_text(200, 30, "Live Caption Demo", 30, 0xFFFFFF, true);
    k_msleep(500);
    
    // Display subtitle below
    display_manager_show_positioned_text(180, 80, "Text positioning test", 18, 0xCCCCCC, false);
    k_msleep(500);
    
    // Display content at left
    display_manager_show_positioned_text(50, 150, "English: Hello World", 16, 0x00FF00, false);
    k_msleep(500);
    
    // Display content at right  
    display_manager_show_positioned_text(350, 150, "العربية: مرحبا", 16, 0x00FFFF, false);
    k_msleep(500);
    
    // Display footer at bottom
    display_manager_show_positioned_text(100, 400, "Font sizes: 12,14,16,18,24,30,48pt", 12, 0x888888, false);
    
    LOG_INF("✅ Simple positioned text example complete");
}

/**
 * @brief Example 2: Font size demonstration
 */
void example_font_sizes(void)
{
    LOG_INF("📍 Example 2: Font size demonstration");
    
    // Clear previous content
    display_manager_show_positioned_text(0, 0, "", 12, 0xFFFFFF, true);
    k_msleep(100);
    
    // Available font sizes: 12, 14, 16, 18, 24, 30, 48
    struct {
        uint16_t size;
        uint16_t y_pos;
        uint32_t color;
    } font_tests[] = {
        {12, 50,  0xFF0000},   // Red
        {14, 80,  0xFF8800},   // Orange  
        {16, 110, 0xFFFF00},   // Yellow
        {18, 145, 0x00FF00},   // Green
        {24, 185, 0x00FFFF},   // Cyan
        {30, 235, 0x0088FF},   // Blue
        {48, 295, 0xFF00FF},   // Magenta
    };
    
    for (int i = 0; i < ARRAY_SIZE(font_tests); i++) {
        char text[64];
        snprintf(text, sizeof(text), "Font %upt", font_tests[i].size);
        
        display_manager_show_positioned_text(50, font_tests[i].y_pos, 
                                           text, font_tests[i].size, 
                                           font_tests[i].color, false);
        k_msleep(300);
    }
    
    // Test invalid font size (should fallback to 12pt)
    display_manager_show_positioned_text(350, 50, "Invalid size→12pt", 99, 0xFFFFFF, false);
    
    LOG_INF("✅ Font size demonstration complete");
}

/**
 * @brief Example 3: LiveCaption simulation with coordinate mapping
 */
void example_livecaption_simulation(void)
{
    LOG_INF("📍 Example 3: LiveCaption coordinate simulation");
    
    // Clear and start fresh
    display_manager_show_positioned_text(0, 0, "", 12, 0xFFFFFF, true);
    k_msleep(100);
    
    // Simulate LiveCaption messages with different coordinates
    // User coordinates (0,0) = top-left of 440x200 area
    // User coordinates (440,200) = bottom-right of 440x200 area
    
    // Top-left corner (0,0) should appear at screen (20,20)
    display_manager_show_positioned_text(0, 0, "TOP-LEFT (0,0)", 16, 0xFF0000, false);
    k_msleep(500);
    
    // Top-right corner (approximate)
    display_manager_show_positioned_text(450, 0, "TOP-RIGHT", 16, 0x00FF00, false);
    k_msleep(500);
    
    // Center (approximate)
    display_manager_show_positioned_text(250, 200, "CENTER", 24, 0xFFFFFF, false);
    k_msleep(500);
    
    // Bottom-left
    display_manager_show_positioned_text(0, 400, "BOTTOM-LEFT", 16, 0x00FFFF, false);
    k_msleep(500);
    
    // Bottom-right
    display_manager_show_positioned_text(450, 400, "BOTTOM-RIGHT", 16, 0xFF00FF, false);
    k_msleep(500);
    
    // Test boundary conditions - these should show warnings
    LOG_INF("Testing boundary conditions (should show warnings):");
    display_manager_show_positioned_text(700, 500, "OUT OF BOUNDS", 16, 0xFFFFFF, false);
    
    LOG_INF("✅ LiveCaption coordinate simulation complete");
}

/**
 * @brief Example 4: Screen mode switching demonstration
 */
void example_screen_mode_switching(void)
{
    LOG_INF("📍 Example 4: Screen mode switching");
    
    // Start with positioned mode
    display_manager_switch_to_positioned_mode();
    k_msleep(100);
    display_manager_show_positioned_text(200, 200, "POSITIONED MODE", 24, 0x00FF00, true);
    k_msleep(2000);
    
    // Switch to welcome mode
    LOG_INF("Switching to welcome mode...");
    display_manager_switch_to_welcome_mode();
    k_msleep(3000);
    
    // Switch to container mode  
    LOG_INF("Switching to container mode...");
    display_manager_switch_to_container_mode();
    k_msleep(2000);
    
    // Back to positioned mode
    LOG_INF("Back to positioned mode...");
    display_manager_switch_to_positioned_mode();
    k_msleep(100);
    display_manager_show_positioned_text(150, 200, "BACK TO POSITIONED", 20, 0xFF8800, true);
    
    LOG_INF("✅ Screen mode switching demonstration complete");
}

/**
 * @brief Example 5: Multiple text labels management
 */
void example_multiple_text_labels(void)
{
    LOG_INF("📍 Example 5: Multiple text labels (max 10)");
    
    // Clear and prepare
    display_manager_switch_to_positioned_mode();
    k_msleep(100);
    
    // Add multiple labels without clearing
    for (int i = 0; i < 8; i++) {
        char text[32];
        snprintf(text, sizeof(text), "Label %d", i + 1);
        
        uint16_t x = 50 + (i % 4) * 120;  // 4 columns
        uint16_t y = 100 + (i / 4) * 100; // 2 rows
        uint32_t color = 0xFF0000 + (i * 0x202020); // Gradient colors
        
        display_manager_show_positioned_text(x, y, text, 16, color, false);
        k_msleep(200);
    }
    
    // Add more to test the 10-label limit
    display_manager_show_positioned_text(250, 300, "Label 9", 16, 0x00FF00, false);
    k_msleep(200);
    display_manager_show_positioned_text(350, 300, "Label 10", 16, 0x0000FF, false);
    k_msleep(200);
    
    // This should trigger a warning and clear all labels
    display_manager_show_positioned_text(450, 300, "Label 11 (overflow)", 16, 0xFFFFFF, false);
    
    LOG_INF("✅ Multiple text labels demonstration complete");
}

/**
 * @brief Main function to run all examples
 */
void run_positioned_text_examples(void)
{
    LOG_INF("🚀 Starting positioned text examples");
    
    // Wait for display manager to be ready
    k_msleep(1000);
    
    // Run examples with delays between them
    example_simple_positioned_text();
    k_msleep(3000);
    
    example_font_sizes();  
    k_msleep(4000);
    
    example_livecaption_simulation();
    k_msleep(4000);
    
    example_screen_mode_switching();
    k_msleep(2000);
    
    example_multiple_text_labels();
    k_msleep(3000);
    
    LOG_INF("🎉 All positioned text examples completed!");
    
    // Return to welcome mode
    display_manager_switch_to_welcome_mode();
}

/**
 * @brief Thread entry point for examples
 */
void positioned_text_example_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);
    
    LOG_INF("📍 Positioned text example thread started");
    
    // Wait for system to be ready
    k_msleep(2000);
    
    // Run examples
    run_positioned_text_examples();
    
    LOG_INF("📍 Positioned text example thread completed");
}

// Thread definition for the example
#define EXAMPLE_THREAD_STACK_SIZE 2048
#define EXAMPLE_THREAD_PRIORITY 7

K_THREAD_STACK_DEFINE(example_stack_area, EXAMPLE_THREAD_STACK_SIZE);
static struct k_thread example_thread_data;

/**
 * @brief Initialize and start the positioned text examples
 * Call this from main() or another initialization function
 */
void positioned_text_examples_init(void)
{
    k_thread_create(&example_thread_data,
                   example_stack_area,
                   K_THREAD_STACK_SIZEOF(example_stack_area),
                   positioned_text_example_thread,
                   NULL, NULL, NULL,
                   EXAMPLE_THREAD_PRIORITY, 0, K_NO_WAIT);
    
    k_thread_name_set(&example_thread_data, "pos_text_example");
    
    LOG_INF("📍 Positioned text examples initialized");
}
