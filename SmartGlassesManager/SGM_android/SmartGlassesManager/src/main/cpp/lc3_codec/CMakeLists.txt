cmake_minimum_required(VERSION 3.18.1)

project("lc3_codec")

# Set compiler flags
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wno-multichar -Wno-sign-compare -Wno-unused-variable -Wno-unused-but-set-variable -Wno-float-conversion")

# Define LC3_ENABLE and LC3PLUS_ENABLE
add_definitions(-DLC3_ENABLE=1)
add_definitions(-DLC3PLUS_ENABLE=0)

# Include directories
include_directories(inc)

# Add source files
set(LC3_CODEC_SOURCES
    lc3_api.cpp
    lc3_api_enc.cpp
    lc3_api_dec.cpp
)

# Add sneak_peek subdirectory (LC3 core implementation)
add_subdirectory(sneak_peek)

# Create the main library
add_library(${CMAKE_PROJECT_NAME} SHARED ${LC3_CODEC_SOURCES})

# Link against sneak_peek (core LC3 implementation)
target_link_libraries(${CMAKE_PROJECT_NAME} sneak_peek)

# Set include directories for the target
target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/inc
)

# Link against required system libraries
target_link_libraries(${CMAKE_PROJECT_NAME}
    android
    log
)
