#!/bin/bash

# Build script for MentraOS Audio System
# Complete PDM microphone + I2S output pipeline

echo "🎵🎵🎵 Building MentraOS Audio System for nRF5340 🎵🎵🎵"
echo "🎯 Hardware: MAX98357A I2S + PDM Microphone"
echo "📍 PDM Pins: CLK=P1.12, DIN=P1.11"  
echo "📍 I2S Pins: SDOUT=P1.06, SCK_M=P1.07, LRCK_M=P1.08"
echo ""

# Set Nordic nCS environment variables
echo "🔧 Setting up nRF Connect SDK environment..."
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR=/opt/nordic/ncs/toolchains/ef4fc6722e/opt/zephyr-sdk
export ZEPHYR_BASE=/opt/nordic/ncs/v3.0.0/zephyr
export PATH=/opt/nordic/ncs/toolchains/ef4fc6722e/bin:$PATH

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf build/
echo "✅ Build directory cleaned"

# Build with audio configuration
echo "🔨 Building MentraOS Audio System..."

# Create temporary project configuration
cat > prj_temp.conf << 'EOF'
# Console and logging
CONFIG_CONSOLE=y
CONFIG_UART_CONSOLE=y
CONFIG_PRINTK=y
CONFIG_LOG=y
CONFIG_LOG_DEFAULT_LEVEL=3

# Audio subsystem - matching MentraOS config
CONFIG_AUDIO=y
CONFIG_AUDIO_DMIC=y
CONFIG_AUDIO_DMIC_NRFX_PDM=y

# I2S Audio output driver
CONFIG_I2S=y

# Memory configuration
CONFIG_MAIN_STACK_SIZE=4096
CONFIG_HEAP_MEM_POOL_SIZE=8192

# GPIO for pin control  
CONFIG_GPIO=y
EOF

# Use west build command (uses main app.overlay automatically)
echo "🔨 Building MentraOS Audio System..."
west build -b nrf5340dk/nrf5340/cpuapp . -- \
    -DCONF_FILE=prj_temp.conf

BUILD_RESULT=$?

# Clean up temporary config
rm -f prj_temp.conf

if [ $BUILD_RESULT -eq 0 ]; then
    echo ""
    echo "✅✅✅ MentraOS Audio System build completed successfully! ✅✅✅"
    echo "🎧 Audio Pipeline: PDM Mic → Processing → I2S Speaker"
    echo "📊 Audio format: 16kHz, 16-bit, 10ms frames"
    echo ""
    echo "🚀 Ready to flash! Use: ./flash_mentraos_audio.sh"
else
    echo ""
    echo "❌ Build failed! Check the error messages above."
    exit 1
fi
