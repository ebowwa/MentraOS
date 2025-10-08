#
# Copyright (c) 2018 Nordic Semiconductor
#
# SPDX-License-Identifier: LicenseRef-Nordic-5-Clause

cmake_minimum_required(VERSION 3.20.0)

# Note: custom driver module registration enabled for HLS12VGA integration
set(ZEPHYR_EXTRA_MODULES ${CMAKE_CURRENT_SOURCE_DIR}/custom_driver_module)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(nrf5340_ble_simulator)

# Add nanopb support for protobuf
list(APPEND CMAKE_MODULE_PATH ${ZEPHYR_BASE}/modules/nanopb)
include(nanopb)

# Custom driver module picked up via ZEPHYR_EXTRA_MODULES (module.yml)
add_subdirectory(src/mos_components/mos_pdm)
add_subdirectory(src/mos_driver)

target_sources(app PRIVATE
    src/main.c
    src/extern_code.c
    src/xip_shell_commands.c
    src/protobuf_handler.c
    src/mentra_ble_service.c
    src/pdm_audio_stream.c
    src/lvgl_demo.c
    src/display_manager.c
    src/BspLog/bsp_log.c
    src/bsp_log_control.c
    src/shell_log_control.c
    src/shell_display_control.c
    src/mos_components/mos_sysport/src/bal_os.c
    src/mos_components/mos_lvgl_display/src/mos_lvgl_display.c
    src/mos_components/mos_lvgl_display/src/display_config.c
    # XIP Fonts - placed in external flash to save internal FLASH
    src/fonts/nrf5340_font_puhui_12_essential.c
    src/fonts/nrf5340_font_puhui_14_essential.c
    src/fonts/nrf5340_font_puhui_16_essential.c
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
    src/fonts
    src/mos_components/mos_sysport/include
    src/mos_components/mos_lvgl_display/include
    custom_driver_module/drivers
)


# Run extern_code from the external flash (XIP). No need to copy.
zephyr_code_relocate(FILES src/extern_code.c LOCATION EXTFLASH_TEXT NOCOPY)

# Relocate font data to external flash (XIP) to save internal FLASH memory
zephyr_code_relocate(FILES src/fonts/nrf5340_font_puhui_12_essential.c LOCATION EXTFLASH_TEXT NOCOPY)
zephyr_code_relocate(FILES src/fonts/nrf5340_font_puhui_14_essential.c LOCATION EXTFLASH_TEXT NOCOPY) 
zephyr_code_relocate(FILES src/fonts/nrf5340_font_puhui_16_essential.c LOCATION EXTFLASH_TEXT NOCOPY)

