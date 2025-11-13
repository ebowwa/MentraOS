#!/bin/bash

# Flash Script for nRF5340 RTT + USB CDC Shell Backends

echo "🔧 Setting up nRF Connect SDK environment for flashing..."

# Set Nordic nCS environment variables
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR=/opt/nordic/ncs/toolchains/ef4fc6722e/opt/zephyr-sdk
export ZEPHYR_BASE=/opt/nordic/ncs/v3.0.0/zephyr
export PATH=/opt/nordic/ncs/toolchains/ef4fc6722e/bin:$PATH

echo "📍 ZEPHYR_BASE: $ZEPHYR_BASE"
echo "📍 ZEPHYR_SDK_INSTALL_DIR: $ZEPHYR_SDK_INSTALL_DIR"

echo ""
echo "🔍 Checking required tools..."
if command -v west &> /dev/null; then
    echo "✅ west found: $(which west)"
    west --version
else
    echo "❌ west not found"
    exit 1
fi

if command -v nrfjprog &> /dev/null; then
    echo "✅ nrfjprog found: $(which nrfjprog)"
    nrfjprog --version
else
    echo "❌ nrfjprog not found"
    exit 1
fi

echo ""
echo "🔍 Checking build files..."

# Check main application
if [[ -f "build/nrf5340_ble_simulator/zephyr/zephyr.hex" ]]; then
    echo "   🔍 Main application..."
    echo "      ✅ build/nrf5340_ble_simulator/zephyr/zephyr.hex"
    echo "         Size: $(stat -f%z build/nrf5340_ble_simulator/zephyr/zephyr.hex) bytes (~$(($(stat -f%z build/nrf5340_ble_simulator/zephyr/zephyr.hex)/1024))KB)"
else
    echo "   ❌ Main application not found. Run ./build_rtt_usbcdc.sh first"
    exit 1
fi

# Check MCUboot
if [[ -f "build/mcuboot/zephyr/zephyr.hex" ]]; then
    echo "   🔍 MCUboot bootloader..."
    echo "      ✅ build/mcuboot/zephyr/zephyr.hex"
    echo "      🔒 Secure bootloader enabled"
else
    echo "   ❌ MCUboot bootloader not found"
    exit 1
fi

echo ""
echo "🔍 Checking nRF5340DK connection..."
DEVICE_SNO=$(nrfjprog --ids 2>/dev/null | head -1)
if [[ -n "$DEVICE_SNO" ]]; then
    echo "   ✅ nRF5340DK detected: $DEVICE_SNO"
else
    echo "   ❌ nRF5340DK not detected. Please:"
    echo "      - Connect nRF5340DK via USB"
    echo "      - Ensure J-Link drivers are installed"
    echo "      - Check that device shows up with 'nrfjprog --ids'"
    exit 1
fi

echo ""
echo "📋 Flash Configuration:"
echo "   - Target: nRF5340DK (nrf5340dk/nrf5340/cpuapp)"
echo "   - Main App: BLE Simulator with LVGL + Audio + XIP"
echo "   - Shell Backends: UART, RTT, USB CDC"
echo "   - Bootloader: MCUboot (secure boot + OTA support)"
echo "   - OTA Support: MCUmgr via BLE and Shell"
echo "   - External Flash: QSPI XIP + LittleFS partitions"

echo ""
echo "⚠️  This will erase and reprogram the nRF5340DK"
echo ""
read -p "Continue with flashing? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Flashing cancelled"
    exit 0
fi

echo ""
echo "🚀 Flashing nRF5340 RTT + USB CDC Shell Backends..."
echo "Command: west flash --build-dir build"

west flash --build-dir build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Flash completed successfully!"
    echo ""
    echo "🎯 Post-Flash Verification:"
    echo "   ⏳ Waiting for device restart..."
    sleep 3
    echo "   🔍 Checking device status..."
    
    # Try to detect if device is running
    nrfjprog --readuicr 2>/dev/null >/dev/null
    if [ $? -eq 0 ]; then
        echo "      ✅ Device responding to debug interface"
    else
        echo "      ⚠️  Device status unknown"
    fi

    echo ""
    echo "🎉 nRF5340 RTT + USB CDC Shell Backends Ready!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. 🔌 Test Shell Access:"
    echo "      - UART Shell: screen /dev/ttyACM0 115200"
    echo "      - RTT Shell: Open J-Link RTT Viewer" 
    echo "      - USB CDC Shell: screen /dev/tty.usbmodem* 115200"
    echo ""
    echo "   2. 🧪 Test Shell Commands:"
    echo "      - 'shell backends' (should show: shell_uart, shell_rtt, shell_cdc_acm)"
    echo "      - 'xip info' (show XIP configuration)"
    echo "      - 'xip test' (test XIP execution)"
    echo "      - 'device list' (show device tree)"
    echo ""
    echo "   3. 📱 Test BLE connectivity and LVGL display"
    echo "   4. 🎵 Test audio system (PDM microphone)"
    echo "   5. 🔄 Test MCUmgr OTA updates:"
    echo "      - Via BLE: mcumgr -c ble -d [BLE_ADDRESS] image upload [firmware.bin]"
    echo "      - Via Shell: mcumgr -c serial -d /dev/ttyACM0 image upload [firmware.bin]"
    echo ""
    echo "📡 Expected BLE Device Name: NexSim"
    echo "🔧 Serial Console Options:"
    echo "   - UART: /dev/ttyACM0 (traditional)"
    echo "   - USB CDC: /dev/tty.usbmodem1050087978* (virtual serial port)"
    echo "   - RTT: J-Link RTT Viewer (debug interface)"
    echo ""
    echo "✨ Triple shell backend deployment complete!"

else
    echo ""
    echo "❌ Flash failed!"
    echo ""
    echo "🔍 Troubleshooting steps:"
    echo "   - Check nRF5340DK USB connection"
    echo "   - Verify J-Link drivers are working: 'nrfjprog --ids'"
    echo "   - Try erasing device: 'nrfjprog --eraseall'"
    echo "   - Check that build completed successfully"
    echo ""
    exit 1
fi