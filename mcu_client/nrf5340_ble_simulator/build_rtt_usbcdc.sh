#!/bin/bash

# Build Script for nRF5340 BLE Simulator with RTT + USB CDC Shell Backends
# Based on our XIP implementation + Cole's USB CDC implementation

echo "🔧 Setting up nRF Connect SDK environment for RTT + USB CDC build..."

# Set Nordic nCS environment variables (consistent with existing scripts)
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR=/opt/nordic/ncs/toolchains/ef4fc6722e/opt/zephyr-sdk
export ZEPHYR_BASE=/opt/nordic/ncs/v3.0.0/zephyr
export PATH=/opt/nordic/ncs/toolchains/ef4fc6722e/bin:$PATH

# Verify environment
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

if command -v cmake &> /dev/null; then
    echo "✅ cmake found: $(which cmake)"
    cmake --version | head -1
else
    echo "❌ cmake not found"
    exit 1
fi

echo ""
echo "🔍 Checking project configuration files..."
required_files=(
    "prj.conf"
    "prj_rtt_usbcdc.conf" 
    "boards/nrf5340dk_nrf5340_cpuapp_ns.overlay"
    "pm_static.yml"
    "CMakeLists.txt"
    "sysbuild.conf"
)

for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        echo "   ✅ $file"
    else
        echo "   ❌ $file (missing)"
        exit 1
    fi
done

echo ""
echo "📋 nRF5340 RTT + USB CDC Configuration:"
echo "   - Target Board: nrf5340dk/nrf5340/cpuapp"
echo "   - Shell Backends: UART, RTT, USB CDC"
echo "   - XIP Partition: 3MB external flash"
echo "   - Features: BLE, LVGL Display, Chinese Fonts, Audio, Protobuf"
echo "   - MCUmgr: Enabled (OTA updates via BLE/Shell)"
echo "   - MCUboot: Enabled (secure bootloader)"

echo ""
echo "🧹 Cleaning previous build..."
rm -rf build

echo "🚀 Building nRF5340 BLE Simulator with RTT + USB CDC..."

# Use overlay file for non-secure build (includes USB CDC configuration)
OVERLAY_FILE="boards/nrf5340dk_nrf5340_cpuapp_ns.overlay"
CONF_FILE="prj.conf;prj_rtt_usbcdc.conf"

echo "Command: west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp --sysbuild -- -DCONF_FILE=\"$CONF_FILE\" -DDTC_OVERLAY_FILE=\"$OVERLAY_FILE\""

west build --build-dir build . --pristine --board nrf5340dk/nrf5340/cpuapp --sysbuild -- -DCONF_FILE="$CONF_FILE" -DDTC_OVERLAY_FILE="$OVERLAY_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo ""
    echo "📁 Generated Files:"
    echo "   ✅ Main application: build/nrf5340_ble_simulator/zephyr/zephyr.hex"
    echo "   ✅ MCUboot bootloader: build/mcuboot/zephyr/zephyr.elf"
    echo ""

    # Memory usage analysis (optional)
    echo "🎯 Memory Usage Analysis:"
    echo "   📊 Generating ROM report..."
    west build --build-dir build --target rom_report
    echo "   📊 Generating RAM report..."  
    west build --build-dir build --target ram_report

    echo ""
    echo "📋 Next Steps:"
    echo "   1. 🔥 Flash firmware: ./flash_rtt_usbcdc.sh"
    echo "   2. 🔌 Connect nRF5340DK via USB"
    echo "   3. 📱 Test shell access via:"
    echo "      - UART: /dev/ttyACM0 (115200 baud)"
    echo "      - RTT: J-Link RTT Viewer"
    echo "      - USB CDC: /dev/ttyACM1 or /dev/tty.usbmodem*"
    echo "   4. 🧪 Test shell commands: 'xip info', 'xip test', 'shell backends'"
    echo "   5. 🔄 Test MCUmgr OTA updates"
    echo ""
    echo "✨ Build ready for triple shell backend deployment!"

else
    echo ""
    echo "❌ Build failed!"
    echo ""
    echo "🔍 Troubleshooting steps:"
    echo "   - Check that required files exist"
    echo "   - Verify Nordic nRF Connect SDK v3.0.0 is installed"
    echo "   - Check that west and cmake are in PATH"
    echo "   - Review build log above for specific errors"
    echo ""
    exit 1
fi