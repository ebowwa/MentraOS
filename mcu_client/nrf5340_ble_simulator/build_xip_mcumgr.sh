#!/bin/bash

# Build Script for nRF5340 BLE Simulator with 3MB XIP + MCUmgr + LittleFS
# Based on lessons learned from extxip_smp_svr_1 optimization

echo "🔧 Setting up nRF Connect SDK environment for XIP + MCUmgr build..."

# Set Nordic nCS environment variables (consistent with existing scripts)
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
    exit 1
fi

if command -v cmake &> /dev/null; then
    echo "✅ cmake found: $(which cmake)"
    cmake --version | head -1
else
    echo "❌ cmake not found"
    exit 1
fi

# Check project files
echo ""
echo "🔍 Checking project configuration files..."
REQUIRED_FILES=(
    "prj.conf"
    "pm_static.yml"
    "app.overlay"
    "CMakeLists.txt"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file (missing)"
        exit 1
    fi
done

# Check if sysbuild.conf exists (required for MCUmgr)
if [ -f "sysbuild.conf" ]; then
    echo "   ✅ sysbuild.conf (MCUboot enabled)"
    SYSBUILD_FLAG="--sysbuild"
else
    echo "   ⚠️  sysbuild.conf (missing - basic build without MCUboot)"
    SYSBUILD_FLAG=""
fi

# Project configuration summary
echo ""
echo "📋 nRF5340 BLE Simulator Configuration:"
echo "   - Target Board: nrf5340dk/nrf5340/cpuapp"
echo "   - XIP Partition: 3MB external flash (when optimized)"
echo "   - Features: BLE, LVGL Display, Chinese Fonts, Audio, Protobuf"
if [ -f "sysbuild.conf" ]; then
    echo "   - MCUmgr: Enabled (OTA updates via BLE/Shell)"
    echo "   - MCUboot: Enabled (secure bootloader)"
else
    echo "   - MCUmgr: Not configured (basic build)"
fi
echo ""

# Clean previous build
if [ -d "build" ]; then
    echo "🧹 Cleaning previous build..."
    rm -rf build
fi

echo "🚀 Building nRF5340 BLE Simulator with XIP + MCUmgr..."
if [ -n "$SYSBUILD_FLAG" ]; then
    echo "Command: west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp --sysbuild"
else
    echo "Command: west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp"
fi
echo ""

# Build with conditional sysbuild for MCUboot support
if [ -n "$SYSBUILD_FLAG" ]; then
    west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp --sysbuild
else
    west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp
fi

BUILD_RESULT=$?

if [ $BUILD_RESULT -eq 0 ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo ""
    echo "📁 Generated Files:"
    if [ -f "build/zephyr/zephyr.elf" ]; then
        echo "   ✅ Main application: build/zephyr/zephyr.elf"
        APP_SIZE=$(stat -c%s "build/zephyr/zephyr.elf" 2>/dev/null || stat -f%z "build/zephyr/zephyr.elf" 2>/dev/null)
        echo "      Size: $APP_SIZE bytes (~$((APP_SIZE/1024))KB)"
    fi
    if [ -f "build/zephyr/zephyr.hex" ]; then
        echo "   ✅ Hex file: build/zephyr/zephyr.hex"
    fi
    if [ -f "build/zephyr/qspi_flash_update.bin" ]; then
        echo "   ✅ XIP update image: build/zephyr/qspi_flash_update.bin"
        XIP_SIZE=$(stat -c%s "build/zephyr/qspi_flash_update.bin" 2>/dev/null || stat -f%z "build/zephyr/qspi_flash_update.bin" 2>/dev/null)
        echo "      Size: $XIP_SIZE bytes (~$((XIP_SIZE/1024))KB)"
    fi
    if [ -f "build/mcuboot/zephyr/zephyr.elf" ]; then
        echo "   ✅ MCUboot bootloader: build/mcuboot/zephyr/zephyr.elf"
    fi
    if [ -f "build/hci_ipc/zephyr/net_core_app_update.bin" ]; then
        echo "   ✅ Network core: build/hci_ipc/zephyr/net_core_app_update.bin"
    fi
    
    echo ""
    echo "🎯 Memory Usage Analysis:"
    echo "   📊 Generating ROM report..."
    west build --build-dir build --target rom_report 2>/dev/null | tail -10 || echo "   ROM report not available"
    echo "   📊 Generating RAM report..."
    west build --build-dir build --target ram_report 2>/dev/null | tail -10 || echo "   RAM report not available"
    
    echo ""
    echo "📋 Next Steps:"
    echo "   1. 🔥 Flash firmware: ./flash_xip_mcumgr.sh"
    echo "   2. 🔌 Connect nRF5340DK via USB"
    echo "   3. 📱 Test BLE connectivity and LVGL display"
    if [ -f "sysbuild.conf" ]; then
        echo "   4. 🔄 Test MCUmgr OTA updates (via BLE or shell)"
        echo "   5. 🧪 Run comprehensive testing: ./test_mcumgr_comprehensive.sh"
    fi
    echo ""
    echo "✨ Build ready for deployment!"
else
    echo ""
    echo "❌ Build failed! Exit code: $BUILD_RESULT"
    echo ""
    echo "🔍 Common issues:"
    echo "   - Check that prj.conf has valid configurations"
    echo "   - Verify pm_static.yml partition layout is correct"
    echo "   - Ensure all required overlays are present"
    echo "   - Check that custom drivers compile correctly"
    if [ -f "sysbuild.conf" ]; then
        echo "   - Verify sysbuild.conf MCUboot settings are valid"
    fi
    echo ""
    echo "📋 Debug steps:"
    echo "   1. Check build logs above for specific errors"
    echo "   2. Verify nRF Connect SDK environment setup"
    echo "   3. Test with basic configuration first"
    echo ""
    exit $BUILD_RESULT
fi