/*
 * BSP Log Runtime Control
 * Provides runtime control over BSP logging levels
 */

#include "BspLog/bsp_log.h"
#include <zephyr/kernel.h>

// Runtime BSP log level control
// Default to level 0 (DISABLED) since BSP logs should have been migrated to Zephyr logging
int bsp_log_runtime_level = 0;

// Initialize BSP logging system
void bsp_log_init(void)
{
    // Set initial log level to disabled since BSP logging migration should be complete
    bsp_log_runtime_level = 0;
}

// Runtime level control functions
void bsp_log_set_level(int level)
{
    if (level >= 0 && level <= 5) {
        bsp_log_runtime_level = level;
    }
}

int bsp_log_get_level(void)
{
    return bsp_log_runtime_level;
}