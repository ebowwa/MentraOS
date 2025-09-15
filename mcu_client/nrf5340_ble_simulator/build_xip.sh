#!/bin/bash

# XIP Build Script for nRF5340 BLE Simulator
# Builds firmware with XIP support for external SPI NOR flash

set -e

echo "🚀 Building nRF5340 BLE Simulator with XIP Support"
echo "=================================================="

# Configuration
BOARD="nrf5340dk_nrf5340_cpuapp_ns"
CONF_FILE="prj_xip.conf"
OVERLAY_FILE="xip_flash.overlay"
BUILD_DIR="build_xip"

# Clean previous build
if [ -d "$BUILD_DIR" ]; then
    echo "🧹 Cleaning previous build..."
    rm -rf "$BUILD_DIR"
fi

# Build with XIP configuration
echo "🔨 Building with XIP configuration..."
west build -p auto -b "$BOARD" -d "$BUILD_DIR" \
    -- -DCONF_FILE="$CONF_FILE" \
    -DDTC_OVERLAY_FILE="$OVERLAY_FILE"

# Check build result
if [ $? -eq 0 ]; then
    echo "✅ XIP build successful!"
    echo "📁 Build output: $BUILD_DIR/"
    echo "📄 Binary: $BUILD_DIR/zephyr/zephyr.hex"
    echo "📄 Binary: $BUILD_DIR/zephyr/zephyr.bin"
    echo ""
    echo "🔧 XIP Configuration Summary:"
    echo "  - External Flash: MX25R6435F (8MB)"
    echo "  - XIP Partition: 4MB (0x000000-0x3FFFFF)"
    echo "  - LittleFS Partition: 4MB (0x400000-0x7FFFFF)"
    echo "  - QSPI Interface: 80MHz"
    echo ""
    echo "📋 Next Steps:"
    echo "  1. Flash the firmware to nRF5340DK"
    echo "  2. Test XIP execution from external flash"
    echo "  3. Verify LittleFS file system functionality"
else
    echo "❌ XIP build failed!"
    exit 1
fi
