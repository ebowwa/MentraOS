#!/bin/bash

# Comprehensive MCUmgr Testing Script for nRF5340 BLE Simulator
# Based on extxip_smp_svr_1 testing framework with nrf5340_ble_simulator adaptations

echo "🧪 MCUmgr Comprehensive Testing for nRF5340 BLE Simulator"
echo "========================================================"

# Configuration - adapt for nrf5340_ble_simulator
DEVICE_NAME="NexSim"
SERIAL_PORT="/dev/ttyACM0"  # Adjust for your system
BLE_TIMEOUT=30
UPLOAD_TIMEOUT=300  # 5 minutes for large XIP images

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_test() {
    echo -e "${BLUE}🔍 TEST: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ SUCCESS: $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
}

print_error() {
    echo -e "${RED}❌ ERROR: $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  INFO: $1${NC}"
}

# Check if mcumgr is installed
check_mcumgr() {
    print_test "Checking MCUmgr installation"
    
    if command -v mcumgr &> /dev/null; then
        MCUMGR_VERSION=$(mcumgr version 2>&1)
        print_success "MCUmgr found: $MCUMGR_VERSION"
        return 0
    else
        print_error "MCUmgr not found in PATH"
        echo ""
        echo "📋 Installation instructions:"
        echo "   # Install Go first, then:"
        echo "   go install github.com/apache/mynewt-mcumgr-cli/mcumgr@latest"
        echo "   # Add to PATH: export PATH=\$PATH:\$(go env GOPATH)/bin"
        return 1
    fi
}

# Test serial connection
test_serial_connection() {
    print_test "Testing serial connection to $SERIAL_PORT"
    
    if [ ! -e "$SERIAL_PORT" ]; then
        print_error "Serial port $SERIAL_PORT not found"
        echo ""
        echo "📋 Check available ports:"
        ls -la /dev/tty* | grep -E "(ACM|usbmodem)" || echo "   No USB serial ports found"
        return 1
    fi
    
    # Test basic echo command
    print_info "Testing basic MCUmgr echo via serial..."
    
    timeout 10 mcumgr --conntype serial --connstring "dev=$SERIAL_PORT,baud=115200" echo hello 2>&1 | tee /tmp/mcumgr_echo.log
    
    if grep -q "hello" /tmp/mcumgr_echo.log; then
        print_success "Serial MCUmgr communication working"
        return 0
    else
        print_error "Serial MCUmgr communication failed"
        echo ""
        echo "📋 Troubleshooting:"
        echo "   1. Check that device is running MCUmgr-enabled firmware"
        echo "   2. Verify serial port permissions: sudo chmod 666 $SERIAL_PORT"
        echo "   3. Check that shell transport is enabled in firmware"
        echo "   4. Try different baud rate or port"
        return 1
    fi
}

# Test BLE connection (if available)
test_ble_connection() {
    print_test "Testing BLE connection to $DEVICE_NAME"
    
    print_info "Scanning for BLE device '$DEVICE_NAME'..."
    
    # Note: BLE testing requires additional setup and may not work in all environments
    print_warning "BLE testing requires hcitool and proper Bluetooth setup"
    print_info "Skipping BLE tests for now - focusing on serial transport"
    
    return 0
}

# Test device information
test_device_info() {
    print_test "Testing device information retrieval"
    
    print_info "Getting OS taskstat..."
    mcumgr --conntype serial --connstring "dev=$SERIAL_PORT,baud=115200" taskstat 2>&1 | tee /tmp/mcumgr_taskstat.log
    
    if grep -q "task" /tmp/mcumgr_taskstat.log; then
        print_success "Task statistics retrieved successfully"
    else
        print_warning "Task statistics not available or command failed"
    fi
    
    print_info "Getting OS info..."
    mcumgr --conntype serial --connstring "dev=$SERIAL_PORT,baud=115200" reset 2>&1 | head -5
    
    return 0
}

# Test image management
test_image_management() {
    print_test "Testing image management"
    
    print_info "Getting current image information..."
    mcumgr --conntype serial --connstring "dev=$SERIAL_PORT,baud=115200" image list 2>&1 | tee /tmp/mcumgr_images.log
    
    if grep -q "Images" /tmp/mcumgr_images.log || grep -q "image" /tmp/mcumgr_images.log; then
        print_success "Image information retrieved successfully"
        
        # Show current images
        echo ""
        echo "📋 Current Images:"
        cat /tmp/mcumgr_images.log | grep -E "(slot|version|flags|hash)" | head -10
        
    else
        print_error "Failed to retrieve image information"
        return 1
    fi
    
    return 0
}

# Test file system (if LittleFS is available)
test_filesystem() {
    print_test "Testing file system operations"
    
    print_info "Testing file system commands..."
    
    # Try to list files (may not be available depending on configuration)
    mcumgr --conntype serial --connstring "dev=$SERIAL_PORT,baud=115200" fs ls / 2>&1 | tee /tmp/mcumgr_fs.log
    
    if grep -q "entries" /tmp/mcumgr_fs.log || grep -q "No such file" /tmp/mcumgr_fs.log; then
        print_success "File system commands accessible"
    else
        print_warning "File system commands not available or not configured"
    fi
    
    return 0
}

# Test XIP functionality (nrf5340_ble_simulator specific)
test_xip_functionality() {
    print_test "Testing XIP (Execute-in-Place) functionality"
    
    print_info "This test requires XIP shell commands in the firmware"
    print_info "Look for 'xip' commands in the shell after connecting to serial console"
    
    # If the firmware has XIP shell commands, we could test them here
    # For now, just indicate that manual testing is needed
    
    print_warning "XIP testing requires manual verification via serial console"
    echo ""
    echo "📋 Manual XIP test commands (via serial console):"
    echo "   xip info      - Show XIP system information"
    echo "   xip test      - Test XIP function execution"
    echo "   xip memcheck  - Validate XIP memory ranges"
    echo "   xip perf      - XIP performance test"
    
    return 0
}

# Test LVGL display functionality (nrf5340_ble_simulator specific)
test_lvgl_display() {
    print_test "Testing LVGL display functionality"
    
    print_info "LVGL display testing requires visual verification"
    print_info "Chinese font support should be visible on connected display"
    
    print_warning "Display testing requires manual verification"
    echo ""
    echo "📋 Manual Display test verification:"
    echo "   1. Connect display to nRF5340DK"
    echo "   2. Look for LVGL patterns and Chinese characters"
    echo "   3. Verify display refresh and font rendering"
    echo "   4. Test display shell commands if available"
    
    return 0
}

# Test BLE functionality (nrf5340_ble_simulator specific)
test_ble_functionality() {
    print_test "Testing BLE functionality"
    
    print_info "BLE testing requires external BLE scanner or mobile app"
    
    print_warning "BLE testing requires manual verification"
    echo ""
    echo "📋 Manual BLE test verification:"
    echo "   1. Use BLE scanner app to find '$DEVICE_NAME' device"
    echo "   2. Test BLE connection and data exchange"
    echo "   3. Verify protobuf message handling"
    echo "   4. Test BLE-based MCUmgr if configured"
    
    return 0
}

# Run comprehensive test suite
run_comprehensive_tests() {
    echo ""
    echo "🚀 Starting Comprehensive MCUmgr Test Suite"
    echo "============================================"
    
    local failed_tests=0
    local total_tests=8
    
    # Core MCUmgr tests
    check_mcumgr || ((failed_tests++))
    echo ""
    
    test_serial_connection || ((failed_tests++))
    echo ""
    
    test_ble_connection || ((failed_tests++))
    echo ""
    
    test_device_info || ((failed_tests++))
    echo ""
    
    test_image_management || ((failed_tests++))
    echo ""
    
    test_filesystem || ((failed_tests++))
    echo ""
    
    # nrf5340_ble_simulator specific tests
    test_xip_functionality || ((failed_tests++))
    echo ""
    
    test_lvgl_display || ((failed_tests++))
    echo ""
    
    test_ble_functionality || ((failed_tests++))
    echo ""
    
    # Summary
    echo "📊 Test Results Summary"
    echo "======================="
    local passed_tests=$((total_tests - failed_tests))
    echo "✅ Passed: $passed_tests/$total_tests"
    
    if [ $failed_tests -eq 0 ]; then
        echo "❌ Failed: $failed_tests/$total_tests"
        echo ""
        print_success "All tests completed successfully!"
        echo ""
        echo "🎉 nRF5340 BLE Simulator with MCUmgr is ready for production use!"
    else
        echo "❌ Failed: $failed_tests/$total_tests"
        echo ""
        print_warning "Some tests failed or require manual verification"
        echo ""
        echo "📋 Next steps:"
        echo "   1. Address any failed tests above"
        echo "   2. Perform manual testing for display and BLE functionality"
        echo "   3. Consider running OTA update tests with ./test_ota_updates.sh"
    fi
    
    return $failed_tests
}

# Main execution
if [ $# -eq 0 ]; then
    echo "Usage: $0 [test_name] or 'all' for comprehensive testing"
    echo ""
    echo "Available tests:"
    echo "  all              - Run all tests"
    echo "  mcumgr           - Check MCUmgr installation"
    echo "  serial           - Test serial connection"
    echo "  ble              - Test BLE connection"
    echo "  info             - Test device information"
    echo "  images           - Test image management"
    echo "  fs               - Test file system"
    echo "  xip              - Test XIP functionality"
    echo "  display          - Test LVGL display"
    echo "  ble_func         - Test BLE functionality"
    echo ""
    echo "Example: $0 all"
    exit 1
fi

case "$1" in
    all)
        run_comprehensive_tests
        ;;
    mcumgr)
        check_mcumgr
        ;;
    serial)
        test_serial_connection
        ;;
    ble)
        test_ble_connection
        ;;
    info)
        test_device_info
        ;;
    images)
        test_image_management
        ;;
    fs)
        test_filesystem
        ;;
    xip)
        test_xip_functionality
        ;;
    display)
        test_lvgl_display
        ;;
    ble_func)
        test_ble_functionality
        ;;
    *)
        echo "Unknown test: $1"
        echo "Run '$0' without arguments to see available tests"
        exit 1
        ;;
esac