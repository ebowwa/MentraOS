# Changelog

All notable changes to the nRF5340 DK BLE Glasses Protobuf Simulator will be documented in this file.

## [1.6.0] - 2025-08-05

### Added
- **Battery charging status toggle with Button 3** 
  - DK_BTN3_MSK button mapping for charging state control
  - protobuf_toggle_charging_state() function to switch between charging/not charging
  - protobuf_get_charging_state() and protobuf_set_charging_state() for state management
  - Automatic BLE notification transmission when charging state changes
  - Professional logging with 🔋⚡ emoji for visual identification
  - Integration with existing battery notification system (BatteryStatus protobuf message)
- **Dynamic charging state in protobuf messages**
  - Replaced hard-coded charging=false with dynamic current_charging_state variable
  - Updated all BatteryStatus message responses to reflect actual charging state
  - Enhanced battery notification logging with charging status details

### Enhanced
- **Button control system expansion**
  - Button 1: Increase battery level (+5%)
  - Button 2: Decrease battery level (-5%) 
  - Button 3: Toggle charging status (charging ↔ not charging)
- **Comprehensive battery state management**
  - Global charging state persistence across all battery operations
  - Proactive notifications on both level and charging state changes
  - Professional directional logging for all battery-related operations

### Notes for Mobile App Team
- **Battery Charging Status Implementation**: Need to verify mobile app parsing of `BatteryStatus.charging` field
  - Current firmware correctly sends charging state in protobuf messages (Tag 10)
  - Mobile app may only show charging logo regardless of actual charging state
  - **Action Required**: Please confirm mobile app implementation handles both `level` and `charging` fields
  - **Test Message**: `BatteryStatus { level: 85, charging: true/false }` via Button 3 toggle

## [1.5.0] - 2025-08-05

### Added
- **AutoBrightnessConfig protobuf message support** (Tag 38)
  - Automatic brightness adjustment based on ambient light sensor
  - bool enabled field for toggling auto brightness mode
  - Manual override logic that disables auto mode when manual brightness is set
  - State management with global auto_brightness_enabled flag
- **Enhanced directional logging system** with professional UART tags
  - [Phone->Glasses] prefix for incoming messages (control commands, requests)
  - [Glasses->Phone] prefix for outgoing messages (notifications, responses)
  - Removed all emoji characters for clean professional logging output
  - Accurate message direction indicators for debugging clarity
- **Comprehensive auto brightness implementation**
  - protobuf_process_auto_brightness_config() function with detailed analysis
  - protobuf_get_auto_brightness_enabled() getter function
  - Auto brightness state preservation and manual override detection
  - Protocol compliance validation and error reporting
- **Light sensor integration preparation**
  - TODO markers for light sensor driver integration
  - Brightness algorithm placeholders for automatic adjustment curves
  - Real-time sensor monitoring architecture planning

### Enhanced Message Support
- **AutoBrightnessConfig message recognition** for mobile app auto brightness toggle (0x02 0xB2 0x02 0x02 0x08 0x01)
- **Manual brightness override logic** automatically disables auto mode when BrightnessConfig messages received
- **State transition logging** with detailed before/after analysis
- **Protocol documentation** updated with AutoBrightnessConfig details

### Logging Improvements
- **Professional debugging output** with emoji-free messages
- **Directional UART tags** clearly indicating message flow direction
- **Battery notification direction correction** from [Phone->Glasses] to [Glasses->Phone]
- **Comprehensive message analysis** with field-by-field breakdown
- **Enhanced protocol compliance reporting** for all message types

### Technical Implementation
- **Global state management** for auto brightness mode
- **PWM brightness control** with automatic override detection
- **Message handler architecture** supporting both manual and automatic brightness
- **Protocol compliance validation** for AutoBrightnessConfig messages
- **Memory efficient implementation** with minimal RAM overhead

### Memory Usage & Performance
- **Firmware Size**: 220,620 bytes (21.37% of 1008KB available FLASH)
  - .text (code): 171,708 bytes (77.8% of used FLASH)
  - .rodata (constants): 44,252 bytes (20.1% of used FLASH)
  - .data (initialized): 3,055 bytes (1.4% of used FLASH)
- **RAM Usage**: 38,478 bytes (8.92% of 448KB available RAM)
- **Application Code Breakdown**:
  - protobuf_handler.c: 19,767 bytes (largest application component)
  - main.c: 5,058 bytes
  - mentraos_ble.pb.c: 2,492 bytes (generated protobuf definitions)
  - mentra_ble_service.c: 614 bytes
- **Major System Components**:
  - Bluetooth Host Stack: ~70KB (libsubsys__bluetooth__host.a: 3.2MB archived)
  - Security & Crypto: ~40KB (PSA crypto, mbedTLS, Oberon drivers)
  - Zephyr RTOS Core: ~50KB (kernel, drivers, logging)
  - Nordic HAL: ~30KB (nrfx peripheral drivers)
- **Remaining Capacity**: 792KB FLASH (78.6%) available for future features
- **Memory Efficiency**: Excellent headroom for display drivers, light sensors, OTA updates

### Bug Fixes
- **Corrected battery notification direction** in UART logging tags
- **Fixed directional message flow indicators** for accurate debugging
- **Resolved auto brightness message recognition** for mobile app integration

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
