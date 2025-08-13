cmake_minimum_required(VERSION 3.18.1)

project("sneak_peek")

# Set compiler flags
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wno-double-promotion -Wno-unused-variable -Wno-float-conversion -Wno-sign-compare -Wno-narrowing")

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/Common
    ${CMAKE_CURRENT_SOURCE_DIR}/Common/Tables
    ${CMAKE_CURRENT_SOURCE_DIR}/Api
    ${CMAKE_CURRENT_SOURCE_DIR}/api_process
    ${CMAKE_CURRENT_SOURCE_DIR}/Encoder
    ${CMAKE_CURRENT_SOURCE_DIR}/Decoder
    ${CMAKE_CURRENT_SOURCE_DIR}/TestSupport
)

# Common source files
set(COMMON_SOURCES
    Common/DctIV.cpp
    Common/Lc3Base.cpp
    Common/Lc3Config.cpp
    Common/cfft.cpp
)

# Encoder source files
set(ENCODER_SOURCES
    Encoder/AttackDetector.cpp
    Encoder/BandwidthDetector.cpp
    Encoder/BitstreamEncoding.cpp
    Encoder/EncoderFrame.cpp
    Encoder/Lc3Encoder.cpp
    Encoder/Lc3EncoderEnergyBand.cpp
    Encoder/Lc3EncoderResidual.cpp
    Encoder/LongTermPostfilterEnc.cpp
    Encoder/MdctEnc.cpp
    Encoder/NoiseLevelEstimation.cpp
    Encoder/SnsQuantization.cpp
    Encoder/SpectralNoiseShapingEnc.cpp
    Encoder/SpectralQuantization.cpp
    Encoder/TemporalNoiseShaping.cpp
)

# Decoder source files
set(DECODER_SOURCES
    Decoder/ArithmeticDec.cpp
    Decoder/BitReader.cpp
    Decoder/DecoderFrame.cpp
    Decoder/Lc3Decoder.cpp
    Decoder/Lc3DecoderLtpf.cpp
    Decoder/Lc3DecoderLtpfData.cpp
    Decoder/Lc3DecoderNoiseFilling.cpp
    Decoder/Lc3DecoderTns.cpp
    Decoder/LongTermPostfilter.cpp
    Decoder/MPVQ.cpp
    Decoder/MdctDec.cpp
    Decoder/PacketLossConcealment.cpp
    Decoder/ResidualSpectrum.cpp
    Decoder/SideInformation.cpp
    Decoder/SpectralNoiseShaping.cpp
)

# API Process source files
set(API_PROCESS_SOURCES
    api_process/Lc3Pool.cpp
    api_process/lc3_api_decode.cpp
    api_process/lc3_api_encode.cpp
)

# Test Support source files
set(TEST_SUPPORT_SOURCES
    TestSupport/DatapointsAndroid.cpp
)

# Create the library
add_library(${CMAKE_PROJECT_NAME} STATIC
    ${COMMON_SOURCES}
    ${ENCODER_SOURCES}
    ${DECODER_SOURCES}
    ${API_PROCESS_SOURCES}
    ${TEST_SUPPORT_SOURCES}
)

# Set include directories for the target
target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/Common
    ${CMAKE_CURRENT_SOURCE_DIR}/Common/Tables
    ${CMAKE_CURRENT_SOURCE_DIR}/Api
    ${CMAKE_CURRENT_SOURCE_DIR}/api_process
    ${CMAKE_CURRENT_SOURCE_DIR}/Encoder
    ${CMAKE_CURRENT_SOURCE_DIR}/Decoder
    ${CMAKE_CURRENT_SOURCE_DIR}/TestSupport
)
