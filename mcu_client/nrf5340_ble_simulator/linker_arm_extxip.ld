
/**
 * @file
 * @brief Linker command/script file
 *
 * Linker script for the Cortex-M platforms.
 */

#include <zephyr/linker/sections.h>
#include <zephyr/devicetree.h>

#include <zephyr/linker/linker-defs.h>
#include <zephyr/linker/linker-tool.h>

/* Let SystemInit() be called in place of z_arm_platform_init() by default. */
PROVIDE(z_arm_platform_init = SystemInit);

/*
 * nRF5340dk is shipping a QSPI external flash mapped at 0x1000_0000 that can
 * be used for XIP
 * nRF5340dk 附带一个 QSPI 外部闪存，映射在 0x1000_0000，可用于 XIP
 */

MEMORY
{
    EXTFLASH (rwx) : ORIGIN = 0x10000000, LENGTH = 0x4000000
}

#include <zephyr/arch/arm/cortex_m/scripts/linker.ld>
