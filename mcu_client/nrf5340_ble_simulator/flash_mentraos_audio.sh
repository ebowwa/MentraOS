#!/bin/bash

# Flash script for MentraOS Audio System

echo "⚡⚡⚡ Flashing MentraOS Audio System to nRF5340DK ⚡⚡⚡"
echo "🎯 Target: nRF5340DK Application Core"
echo ""

# Set Nordic nCS environment variables
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR=/opt/nordic/ncs/toolchains/ef4fc6722e/opt/zephyr-sdk
export ZEPHYR_BASE=/opt/nordic/ncs/v3.0.0/zephyr
export PATH=/opt/nordic/ncs/toolchains/ef4fc6722e/bin:$PATH

# Check if build exists
if [ ! -d "build" ]; then
    echo "❌ Build directory not found. Please build first with: ./build_mentraos_audio.sh"
    exit 1
fi

# Flash the firmware
echo "📥 Flashing firmware to nRF5340DK..."
west flash

if [ $? -eq 0 ]; then
    echo ""
    echo "✅✅✅ MentraOS Audio System flashed successfully! ✅✅✅"
    echo ""
    echo "🎉 Hardware Setup Instructions:"
    echo "==============================================="
    echo "🎤 PDM Microphone:"
    echo "   - Connect PDM_CLK to P1.12"
    echo "   - Connect PDM_DIN to P1.11"
    echo "   - Connect VDD to 3.3V"
    echo "   - Connect GND to Ground"
    echo ""
    echo "🔊 MAX98357A I2S Audio Amplifier:"
    echo "   - Connect LRC to P1.06"
    echo "   - Connect BCLK to P1.07"
    echo "   - Connect DIN to P1.08"
    echo "   - Connect VDD to 3.3V"
    echo "   - Connect GND to Ground"
    echo "   - Connect speaker to OUT+ and OUT-"
    echo ""
    echo "💡 Status LED on nRF5340DK will indicate system status"
    echo ""
    echo "🎵 Audio Pipeline Active:"
    echo "   PDM Mic → nRF5340 Processing → I2S Speaker"
    echo ""
    echo "🔍 Monitor with: nrfjprog --term --baudrate 115200"
else
    echo ""
    echo "❌ Flash failed! Check the error messages above."
    echo "🔧 Troubleshooting:"
    echo "   1. Check nRF5340DK is connected via USB"
    echo "   2. Check board is powered on"
    echo "   3. Try: nrfjprog --recover"
    exit 1
fi
