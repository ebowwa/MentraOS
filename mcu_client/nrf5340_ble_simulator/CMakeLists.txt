#
# Copyright (c) 2018 Nordic Semiconductor
#
# SPDX-License-Identifier: LicenseRef-Nordic-5-Clause

cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(nrf5340_ble_simulator)

# Add nanopb support for protobuf
list(APPEND CMAKE_MODULE_PATH ${ZEPHYR_BASE}/modules/nanopb)
include(nanopb)

# Add custom driver module for HLS12VGA display - TEMPORARILY DISABLED
# list(APPEND DTS_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/custom_driver_module)
# add_subdirectory(custom_driver_module)

target_sources(app PRIVATE
    src/main.c
    src/protobuf_handler.c
    src/mentra_ble_service.c
    src/lvgl_demo.c
    src/BspLog/bsp_log.c
    src/mos_components/mos_sysport/src/bal_os.c
)

# Add protobuf sources when available
if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/src/proto/mentraos_ble.pb.c)
  target_sources(app PRIVATE src/proto/mentraos_ble.pb.c)
  target_include_directories(app PRIVATE src/proto)
elseif(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/src/mentraos_ble.pb.c)
  target_sources(app PRIVATE src/mentraos_ble.pb.c)
endif()

target_include_directories(app PRIVATE
    src
    src/BspLog
    src/mos_components/mos_sysport/include
)
