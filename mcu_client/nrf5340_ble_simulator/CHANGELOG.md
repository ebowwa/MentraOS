# Changelog

All notable changes to the nRF5340 DK BLE Glasses Protobuf Simulator will be documented in this file.

## [1.3.0] - 2025-08-04

### Added
- **Full protobuf text message parsing** using nanopb with direct string support
  - Successfully parsing DisplayText (tag 30) and DisplayScrollingText (tag 35) messages
  - Extracted text content with length calculation and full message details
  - Added nanopb options file for direct char arrays instead of callbacks
  - Regenerated protobuf files with proper string handling configuration
- **Protocol compliance verification** for text messaging functionality
  - Confirmed Hello World messages parse correctly from mobile app
  - Comprehensive text field extraction including color, position, font details
  - UART output showing parsed text content and message length
- **Debug infrastructure improvements** for protocol analysis
  - Enhanced hex dump output for message inspection
  - ASCII string representation for non-protobuf message debugging
  - Protocol header detection (0x02 for protobuf, 0xA0 for audio, 0xB0 for image)

### Protocol Standards
- **Official protobuf message support** for BrightnessConfig (tag 37)
- **Text brightness parsing disabled** pending mobile app team discussion
  - Mobile app currently sends debug text instead of official protobuf
  - Text parsing code preserved but commented for future protocol alignment
  - Clear documentation for mobile app team regarding protocol compliance

### Technical Improvements
- **nanopb configuration optimized** for embedded string handling
  - Created proto/mentraos_ble.options for direct string field configuration
  - Updated CMakeLists.txt to use new protobuf generation path
  - Resolved protobuf file conflicts between callback and direct string versions
- **Memory efficient text processing** with 128-character string limits
- **Build system cleanup** removing duplicate protobuf definitions

### Testing Status
- ✅ **DisplayText messages working**: Hello World messages successfully parsed
- ✅ **Brightness control working**: Official protobuf brightness messages functional
- ⚠️ **Live captions not available**: Cannot test longer text messages currently
- 📝 **Protocol discussion needed**: Text brightness vs official BrightnessConfig

## [1.2.0] - 2025-08-04

### Added
- **PWM-based LED brightness control** for LED3 on nRF5340DK
  - Supports 0-100% brightness levels via BLE protobuf messages
  - Uses PWM1 controller on GPIO P0.31 with 50Hz frequency (20ms period)
  - Implements BrightnessConfig message handling with tag 37
- **Enhanced protobuf message processing** for brightness commands
  - Added `protobuf_set_brightness_level()` function for PWM control
  - Added `protobuf_process_brightness_config()` for message parsing
  - Current brightness level tracking and validation (0-100% range)
- **Device tree PWM configuration** for LED brightness control
  - PWM inverted polarity support for active-low LED behavior
  - Proper pinctrl configuration for PWM1 controller

### Features
- **Intuitive brightness mapping**: 0% = LED off, 100% = full brightness
- **Real-time brightness control** via mobile app BLE commands
- **PWM hardware acceleration** for smooth dimming transitions
- **Brightness level persistence** with current state tracking
- **Debug logging** for PWM operations and brightness changes

### Technical Improvements
- **PWM subsystem integration** with CONFIG_PWM=y configuration
- **Direct duty cycle mapping** removing double inversion logic
- **Hardware polarity inversion** handling active-low LED behavior
- **Memory efficient implementation** maintaining current build size
- **Robust error handling** for PWM device initialization and control

### Bug Fixes
- **Fixed brightness polarity inversion** where 100% was turning LED off
- **Corrected PWM duty cycle calculation** for proper brightness mapping
- **Resolved double inversion issue** between software and hardware polarity

## [1.1.0] - 2025-08-01

### Added
- **Dynamic battery level control** using nRF5340 DK buttons
  - Button 1: Increase battery level by 5% (up to 100%)
  - Button 2: Decrease battery level by 5% (down to 0%)
- **Real-time battery state management** with range validation
- **Proactive battery notifications** automatically sent to mobile app on level changes
- **Interactive protobuf responses** with current battery level
- **Startup battery information** logging with button instructions
- **nanopb protobuf library integration** for reliable message encoding/decoding

### Features
- **Button-controlled battery simulation** for mobile app testing
- **Automatic range clamping** (0-100%) prevents invalid battery levels
- **Smart button handling** with authentication mode awareness
- **Enhanced logging** with emoji indicators for battery operations
- **Dynamic protobuf generation** using actual battery state
- **Push notifications** via BLE when battery level changes (no polling required)

### Technical Improvements
- **Global battery state variable** with thread-safe access
- **Modular battery control functions** in protobuf_handler.c
- **Enhanced button callback system** supporting multiple use cases
- **Improved protobuf message parsing** with union-based field access
- **Memory-efficient implementation** (+584 bytes FLASH, +8 bytes RAM)
- **Proactive BLE notifications** using GlassesToPhone::BatteryStatus messages

### Bug Fixes
- **Fixed nanopb struct field access errors** using correct union patterns
- **Corrected protobuf message structure usage** with which_payload discriminator
- **Resolved compilation issues** with protobuf generated code

## [1.0.0] - 2025-07-31

### Added
- **Initial nRF5340 DK port** of ESP32-C3 BLE glasses simulator
- **Custom BLE service** implementation with MentraOS UUIDs:
  - Service: `00004860-0000-1000-8000-00805f9b34fb`
  - TX Characteristic: `000071FF-0000-1000-8000-00805f9b34fb`
  - RX Characteristic: `000070FF-0000-1000-8000-00805f9b34fb`
- **Protobuf message handler** with support for:
  - Control messages (header 0x02)
  - Audio chunks (header 0xA0) 
  - Image chunks (header 0xB0)
- **Dynamic device naming** with MAC address suffix (`NexSim XXXXXX`)
- **Echo response functionality** for testing bidirectional communication
- **Comprehensive logging** with hex dumps and protocol analysis
- **ASCII visualization** of received data
- **Zephyr RTOS integration** replacing Arduino framework
- **Nordic SoftDevice BLE stack** replacing ESP32 BLE

### Features
- **Protocol-aware message parsing** with detailed logging
- **Real-time hex dump output** for debugging
- **Automatic connection management** with proper callbacks
- **Buffer size optimization** for protobuf messages (240 bytes)
- **MTU configuration** optimized for large data transfers
- **Background advertising** with automatic restart on disconnect

### Technical Details
- **Target Platform**: nRF5340 DK (PCA10095)
- **Build System**: Zephyr CMake + Kconfig
- **BLE Stack**: Nordic SoftDevice Controller
- **Memory**: 240-byte UART buffers, 2048-byte thread stacks
- **Logging**: Zephyr LOG framework with RTT backend

### Compatibility
- **Fully compatible** with existing ESP32-C3 Python test scripts
- **Same BLE service UUIDs** as original ESP32 implementation
- **Identical protocol behavior** for seamless testing
- **Cross-platform testing** support

### Documentation
- **Comprehensive README.md** with setup and usage instructions
- **Protocol specification** reference
- **Troubleshooting guide** for common issues
- **Comparison table** with ESP32-C3 version

### Development Notes
- Replaced Nordic UART Service (NUS) with custom Mentra BLE service
- Removed ESP32-specific dependencies (Arduino.h, BLEDevice.h)
- Added Zephyr-native BLE GATT service implementation
- Fixed buffer size configuration issues
- Implemented proper MAC address extraction for device naming
- Added comprehensive error handling and logging
