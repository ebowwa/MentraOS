# Changelog

All notable changes to the nRF5340 DK BLE Glasses Protobuf Simulator will be documented in this file.

## [1.4.0] - 2025-08-05

### Added
- **Enhanced protobuf decode failure analysis** with comprehensive wire format debugging
  - Detailed wire format analysis showing field tags, wire types, and protobuf structure
  - LENGTH_DELIMITED field detection for text message identification
  - Comprehensive error reporting with nanopb stream state information
  - Hex dump analysis for first 20 bytes of failed decode attempts
- **Improved message parsing robustness** for debugging long message failures
  - Fallback parsing attempts for messages with unknown control headers
  - Enhanced debugging output for protobuf structure analysis
  - Wire type name resolution (VARINT, LENGTH_DELIMITED, FIXED64, etc.)
- **Local development script suite** for efficient firmware iteration
  - Complete set of quick build/flash/monitor scripts (7 shell scripts)
  - RTT logging support with JLinkRTTClient and JLinkRTTLogger integration
  - Automated device detection and build optimization
  - Git ignore configuration for local development tools

### Enhanced Debugging
- **Comprehensive protobuf analysis** to identify why short messages decode successfully while long messages fail
- **Stream state reporting** with bytes consumed and error context
- **Pattern detection** for LENGTH_DELIMITED fields and protobuf validation
- **Detailed wire format breakdown** for manual protobuf debugging

### Development Tools
- **Persistent local scripts** not tracked in Git for consistent development workflow
- **RTT logging infrastructure** for detailed embedded debugging
- **Automated build and flash** processes with error handling
- **Documentation** for quick script usage and development setup

### Technical Improvements
- **Logging consistency** with emoji removal for RTT compatibility
- **Enhanced error context** with nanopb stream debugging information
- **Fallback parsing logic** for robust message handling
- **Memory efficient analysis** with bounded iteration and safe string handling

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
