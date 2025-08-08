#
# Copyright (c) 2018 Nordic Semiconductor
#
# SPDX-License-Identifier: LicenseRef-Nordic-5-Clause

cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(nrf5340_ble_simulator)

# Add custom driver module for HLS12VGA display - TEMPORARILY DISABLED
# list(APPEND DTS_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/custom_driver_module)
# add_subdirectory(custom_driver_module)

# Include nanopb - TEMPORARILY COMMENTED FOR LVGL TESTING
# find_package(nanopb REQUIRED)

# Generate nanopb files - TEMPORARILY COMMENTED
# zephyr_nanopb_sources(app proto/mentraos_ble.proto)

target_sources(app PRIVATE
    src/main.c
    # src/protobuf_handler.c    # TEMPORARILY COMMENTED FOR LVGL TESTING
    src/mentra_ble_service.c
    src/lvgl_demo.c
    src/BspLog/bsp_log.c
    src/mos_components/mos_sysport/src/bal_os.c
)

target_include_directories(app PRIVATE
    src
    src/BspLog
    src/mos_components/mos_sysport/include
    proto
)
