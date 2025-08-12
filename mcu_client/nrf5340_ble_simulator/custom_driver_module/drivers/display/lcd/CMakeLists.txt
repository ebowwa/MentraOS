# @Author       : Cole
# @Date         : 2025-07-31 10:40:40
# @LastEditTime : 2025-07-31 17:33:11
# @FilePath     : CMakeLists.txt
# @Description  : this file is part of the LCD driver module for the nRF5340 MCU client.

# Copyright (c) MentraOS Contributors 2025 
# SPDX-License-Identifier: Apache-2.0


zephyr_library()
zephyr_library_sources(hls12vga.c)

# zephyr_library_include_directories(
#     ${CMAKE_CURRENT_SOURCE_DIR}
#     ${CMAKE_CURRENT_SOURCE_DIR}/../../../../mentraos_nrf5340/src/BspLog
# )

# Point to the application's BspLog directory
set(BSP_LOG_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../src/BspLog)
if(EXISTS ${BSP_LOG_DIR}/bsp_log.h)
    zephyr_library_include_directories(${BSP_LOG_DIR})
else()
    message(FATAL_ERROR "bsp_log.h not found at: ${BSP_LOG_DIR}")
endif()
# zephyr_library_include_directories(
#     ${CMAKE_CURRENT_SOURCE_DIR}
#     ${BSP_LOG_DIR}
# )