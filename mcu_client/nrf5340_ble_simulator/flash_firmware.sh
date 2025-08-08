#!/bin/bash

# nRF Connect SDK Environment Setup and Flash Script
echo "🔧 Setting up nRF Connect SDK environment..."

# Set Nordic nCS environment variables
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR=/opt/nordic/ncs/toolchains/ef4fc6722e/opt/zephyr-sdk
export ZEPHYR_BASE=/opt/nordic/ncs/v3.0.0/zephyr
export PATH=/opt/nordic/ncs/toolchains/ef4fc6722e/bin:$PATH

# Verify environment
echo "📍 ZEPHYR_BASE: $ZEPHYR_BASE"
echo "📍 ZEPHYR_SDK_INSTALL_DIR: $ZEPHYR_SDK_INSTALL_DIR"

# Check if tools exist
echo ""
echo "🔍 Checking required tools..."
if command -v west &> /dev/null; then
    echo "✅ west found: $(which west)"
    west --version
else
    echo "❌ west not found in PATH"
    exit 1
fi

echo ""
echo "🚀 Flashing firmware..."
echo "Command: west flash --build-dir build"

# Flash the firmware
west flash --build-dir build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Firmware flashed successfully!"
    echo "🔌 Connect to the device to see logs"
else
    echo ""
    echo "❌ Flash failed!"
    exit 1
fi
