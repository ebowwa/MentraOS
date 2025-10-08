/*
 * Copyright (c) 2022 Carlo Caione <ccaione@baylibre.com>
 * Copyright# Copyright (c) 2024 Nordic Semiconductor
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-5-Clause
 */

/**
 * @file
 * @brief External QSPI flash Linker command/script file (3MB XIP)
 *
 * Linker script for moving desired .text and .data to the external
 * memory space. Optimized for 3MB XIP application partition.
 */

#include <zephyr/linker/sections.h>
#include <zephyr/devicetree.h>

#include <zephyr/linker/linker-defs.h>
#include <zephyr/linker/linker-tool.h>


/* Let SystemInit() be called in place of z_arm_platform_init() by default. */
PROVIDE(z_arm_platform_init = SystemInit);

/*
 * nRF5340dk and thingy53 are shipping QSPI external flashes.
 * These memories are mapped beginning from 0x1000_0000 internal SoC memory
 * address. This addressing space can be used for XIP and direct data access.
 */
MEMORY
{
#if CONFIG_NCS_IS_VARIANT_IMAGE
     /* This maps in mcuboot_secondary_2 partition for direct-XIP mode
      * components for ORIGIN calculation:
      *  - 0x10000000: offset of QSPI external memory in SoC memory mapping.
      *  - 0x414000: mcuboot_secondary_2 offset in QSPI external memory (3MB update slot)
      *  - 0x200: image header size.
      * The size of this region is 3MB reduced by the image header size.
      */
     EXTFLASH (wx) : ORIGIN = 0x10414200, LENGTH = 0x2ffe00
#else
     /* This maps in mcuboot_primary_2 partition for normal XIP mode
      * components for ORIGIN calculation:
      *  - 0x10000000: offset of QSPI external memory in SoC memory mapping.
      *  - 0x114000: mcuboot_primary_2 offset in QSPI external memory (after MCUboot slots)
      *  - 0x200: image header size.
      * The size of this region is 3MB reduced by the image header size.
      */
     EXTFLASH (wx) : ORIGIN = 0x10114200, LENGTH = 0x2ffe00
#endif
}

#include <zephyr/arch/arm/cortex_m/scripts/linker.ld>