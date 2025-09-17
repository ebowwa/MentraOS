#!/bin/bash
# Build script for I2S Simple Loopback Test
# This builds a simple I2S loopback without LC3 or BLE to avoid conflicts

set -e

echo "=== Building nRF5340 I2S Simple Loopback Test ==="

# Backup original files
if [ -f "CMakeLists.txt" ]; then
    cp CMakeLists.txt CMakeLists.txt.backup_$(date +%s)
fi

if [ -f "prj.conf" ]; then
    cp prj.conf prj.conf.backup_$(date +%s)
fi

# Use our I2S loopback configuration
cp CMakeLists_i2s_loopback.txt CMakeLists.txt
cp prj_i2s_loopback.conf prj.conf

echo "Building with I2S loopback configuration..."

# Clean and build
rm -rf build/
west build -b nrf5340dk_nrf5340_cpuapp_ns . -- -DDTC_OVERLAY_FILE=i2s_loopback.overlay

echo "=== Build Complete ==="
echo "Flash with: west flash"
echo "To restore original configuration:"
echo "  cp CMakeLists.txt.backup_* CMakeLists.txt"
echo "  cp prj.conf.backup_* prj.conf"
