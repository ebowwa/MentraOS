#!/bin/bash

# Flash Script for nRF5340 BLE Simulator with XIP + MCUmgr + LittleFS
# Based on lessons learned from extxip_smp_svr_1 optimization

echo "🔧 Setting up nRF Connect SDK environment for flashing..."

# Set Nordic nCS environment variables (consistent with build script)
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

if command -v nrfjprog &> /dev/null; then
    echo "✅ nrfjprog found: $(which nrfjprog)"
    nrfjprog --version 2>/dev/null | head -1 || echo "   Version check failed"
else
    echo "⚠️  nrfjprog not found - using west flash only"
fi

# Check if build exists
if [ ! -d "build" ]; then
    echo "❌ Build directory not found! Run ./build_xip_mcumgr.sh first"
    exit 1
fi

# Check for required build files
echo ""
echo "🔍 Checking build files..."
MAIN_APP_FILE="build/zephyr/zephyr.hex"
MCUBOOT_FILE="build/mcuboot/zephyr/zephyr.hex"

echo "   🔍 Main application..."
if [ -f "$MAIN_APP_FILE" ]; then
    echo "      ✅ $MAIN_APP_FILE"
    APP_SIZE=$(stat -c%s "$MAIN_APP_FILE" 2>/dev/null || stat -f%z "$MAIN_APP_FILE" 2>/dev/null)
    echo "         Size: $APP_SIZE bytes (~$((APP_SIZE/1024))KB)"
else
    echo "      ❌ $MAIN_APP_FILE (missing)"
    echo ""
    echo "Build files not found! Available files:"
    find build -name "*.hex" -o -name "*.elf" | head -10
    exit 1
fi

echo "   🔍 MCUboot bootloader..."
if [ -f "$MCUBOOT_FILE" ]; then
    echo "      ✅ $MCUBOOT_FILE"
    echo "      🔒 Secure bootloader enabled"
    MCUBOOT_ENABLED=true
else
    echo "      ⚠️  MCUboot not found - basic flash without bootloader"
    MCUBOOT_ENABLED=false
fi

# Check nRF5340DK connection
echo ""
echo "🔍 Checking nRF5340DK connection..."
if command -v nrfjprog &> /dev/null; then
    nrfjprog --ids 2>/dev/null | grep -E "[0-9]+" > /dev/null
    if [ $? -eq 0 ]; then
        DEVICE_ID=$(nrfjprog --ids 2>/dev/null | head -1)
        echo "   ✅ nRF5340DK detected: $DEVICE_ID"
    else
        echo "   ⚠️  nRF5340DK not detected via nrfjprog"
        echo "      Make sure the device is connected and in DFU mode"
    fi
else
    echo "   ⚠️  Cannot check device connection (nrfjprog not available)"
fi

# Show what will be flashed
echo ""
echo "📋 Flash Configuration:"
echo "   - Target: nRF5340DK (nrf5340dk/nrf5340/cpuapp)"
echo "   - Main App: BLE Simulator with LVGL + Audio + XIP"
if [ "$MCUBOOT_ENABLED" = true ]; then
    echo "   - Bootloader: MCUboot (secure boot + OTA support)"
    echo "   - OTA Support: MCUmgr via BLE and Shell"
else
    echo "   - Bootloader: None (direct flash)"
fi
echo "   - External Flash: QSPI XIP + LittleFS partitions"
echo ""

# Confirm flash operation
echo "⚠️  This will erase and reprogram the nRF5340DK"
echo ""
read -p "Continue with flashing? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Flash operation cancelled"
    exit 1
fi

echo ""
echo "🚀 Flashing nRF5340 BLE Simulator..."

# Flash using west (handles both MCUboot and non-MCUboot builds)
echo "Command: west flash --build-dir build"
echo ""

west flash --build-dir build

FLASH_RESULT=$?

if [ $FLASH_RESULT -eq 0 ]; then
    echo ""
    echo "✅ Flash completed successfully!"
    echo ""
    echo "🎯 Post-Flash Verification:"
    
    # Brief wait for device to restart
    echo "   ⏳ Waiting for device restart..."
    sleep 3
    
    # Check if device is responding
    if command -v nrfjprog &> /dev/null; then
        echo "   🔍 Checking device status..."
        nrfjprog --readuicr 2>/dev/null > /dev/null
        if [ $? -eq 0 ]; then
            echo "      ✅ Device is responding"
        else
            echo "      ⚠️  Device status unknown"
        fi
    fi
    
    echo ""
    echo "🎉 nRF5340 BLE Simulator Ready!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. 🔌 Connect to serial console (115200 baud)"
    echo "   2. 📱 Test BLE advertising and connectivity"
    echo "   3. 🖥️  Verify LVGL display functionality"
    echo "   4. 🎵 Test audio system (PDM microphone)"
    echo "   5. 📝 Test shell commands and XIP functions"
    
    if [ "$MCUBOOT_ENABLED" = true ]; then
        echo "   6. 🔄 Test MCUmgr OTA updates:"
        echo "      - Via BLE: mcumgr -c ble -d [BLE_ADDRESS] image upload [firmware.bin]"
        echo "      - Via Shell: mcumgr -c serial -d /dev/ttyACM0 image upload [firmware.bin]"
        echo "   7. 🧪 Run comprehensive testing: ./test_mcumgr_comprehensive.sh"
    fi
    
    echo ""
    echo "📡 Expected BLE Device Name: NexSim"
    echo "🔧 Serial Console: /dev/ttyACM0 or /dev/tty.usbmodem*"
    echo ""
    echo "✨ Firmware deployment complete!"
    
else
    echo ""
    echo "❌ Flash failed! Exit code: $FLASH_RESULT"
    echo ""
    echo "🔍 Troubleshooting:"
    echo "   1. Check nRF5340DK USB connection"
    echo "   2. Verify device is in DFU mode (reset while holding DFU button)"
    echo "   3. Try manual erase: nrfjprog --eraseall"
    echo "   4. Check that build completed successfully"
    echo "   5. Verify nRF Connect SDK tools are properly installed"
    echo ""
    echo "📋 Manual flash commands:"
    echo "   # Erase device"
    echo "   nrfjprog --eraseall"
    echo "   # Flash main application"
    echo "   west flash --build-dir build"
    echo ""
    exit $FLASH_RESULT
fi