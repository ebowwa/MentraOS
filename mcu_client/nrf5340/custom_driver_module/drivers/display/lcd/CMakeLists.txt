zephyr_library()
zephyr_library_sources(hls12vga.c)

# zephyr_library_include_directories(
#     ${CMAKE_CURRENT_SOURCE_DIR}
#     ${CMAKE_CURRENT_SOURCE_DIR}/../../../../K901_NRF5340/src/BspLog
# )

set(BSP_LOG_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../K901_NRF5340/src/BspLog)
message(STATUS "BspLog directory: ${BSP_LOG_DIR}")

if(EXISTS ${BSP_LOG_DIR}/bsp_log.h)
    message(STATUS "✅ Found bsp_log.h")
else()
    message(FATAL_ERROR "❌ bsp_log.h not found at: ${BSP_LOG_DIR}")
endif()

zephyr_library_include_directories(${BSP_LOG_DIR})

# zephyr_library_include_directories(
#     ${CMAKE_CURRENT_SOURCE_DIR}
#     ${BSP_LOG_DIR}
# )