cmake_minimum_required(VERSION 3.18.1)

# Include Project 1
#add_subdirectory(${CMAKE_SOURCE_DIR}/google_opus_stuff)

# Include Project 2 - Replace liblc3 with lc3_codec
#add_subdirectory(${CMAKE_SOURCE_DIR}/liblc3)

# Include lc3_codec
add_subdirectory(${CMAKE_SOURCE_DIR}/lc3_codec)

# Add the wrapper source file
add_library(lc3_codec_wrapper SHARED
    lc3_codec_wrapper.cpp
)

# Link against lc3_codec
target_link_libraries(lc3_codec_wrapper
    lc3_codec
)

# Set include directories
target_include_directories(lc3_codec_wrapper PRIVATE
    ${CMAKE_SOURCE_DIR}/lc3_codec/inc
)

