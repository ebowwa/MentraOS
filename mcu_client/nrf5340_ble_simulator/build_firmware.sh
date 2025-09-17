#!/bin/bash

# nRF Connect SDK Environment Setup and Build Script
echo "🔧 Setting up nRF Connect SDK environment..."

# Set Nordic nCS environment variables
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR=/opt/nordic/ncs/toolchains/ef4fc6722e/opt/zephyr-sdk
export ZEPHYR_BASE=/opt/nordic/ncs/v3.0.0/zephyr
export PATH=/opt/nordic/ncs/toolchains/ef4fc6722e/bin:$PATH

# Verify environment
echo "📍 ZEPHYR_BASE: $ZEPHYR_BASE"
echo "📍 ZEPHYR_SDK_INSTALL_DIR: $ZEPHYR_SDK_INSTALL_DIR"
echo "📍 PATH includes: $(echo $PATH | tr ':' '\n' | grep nordic | head -2)"

# Check if tools exist
echo ""
echo "🔍 Checking required tools..."
if command -v west &> /dev/null; then
    echo "✅ west found: $(which west)"
    west --version
else
    echo "❌ west not found"
fi

if command -v cmake &> /dev/null; then
    echo "✅ cmake found: $(which cmake)"
    cmake --version | head -1
else
    echo "❌ cmake not found"
fi

echo ""
echo "🚀 Attempting to build..."
echo "Command: west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp/ns"
west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp/ns

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo "🔗 Build files available in build/ directory"
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
