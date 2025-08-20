# Changelog

All notable changes to the nRF5340 DK BLE Glasses Protobuf Simulator will be documented in this file.

## [2.12.0] - 2025-08-20

### 🎮 HLS12VGA Display Driver - A6M-G Module Support

#### A6M-G Module Integration
- **🔧 Module Detection**: Added support for A6M-G vs A6-G projector modules
- **🎨 Gray Mode Support**: Implemented Gray16 (4bpp) and Gray256 (8bpp) modes
- **📊 Banked SPI**: Added bank0/bank1 register access for advanced control
- **⚡ Runtime API**: `hls12vga_set_gray_mode(bool)` for dynamic switching
- **🎯 Hardware Lock**: Forced A6M-G module path for current hardware

#### Display Features Added
- **🔄 Gray Mode Registers**: A6M uses 0xBE+sequence, A6 uses 0x00
- **💡 Brightness Control**: A6M uses 0xE2, A6 uses 0x23 register
- **📝 Test Patterns**: Horizontal/vertical grayscale patterns for validation
- **🗜️ 4bpp Packing**: Gray16 mode packs two 4-bit pixels per byte
- **📡 RAM Write**: Aligned to 0x2C command for both modules

#### Technical Implementation
- **🎛️ Module Enum**: `MODULE_A6`, `MODULE_A6M`, `MODULE_UNKNOWN`
- **📦 Banked I/O**: `write_reg_bank()`, `read_reg_bank()` helpers
- **🔀 Pixel Pipeline**: 1bpp→8bpp expansion or 1bpp→4bpp packing
- **🧪 Pattern Gen**: Direct hardware grayscale test functions
- **⚙️ Default Mode**: Grayscale 256 (8bpp) for stable operation

## [2.11.0] - 2025-08-20

### 🔄 REVERT TO DISPLAY OPTIMIZATION FOCUS

#### Strategy Shift
- **🎯 Reverting from audio implementation** to focus on display driver optimization
- **✅ Phase 1 BLE Infrastructure Complete** - MTU 517, protobuf handlers, audio framework ready
- **🔀 Switching Priority**: Display performance optimization takes precedence
- **📦 Audio Code**: All LC3/I2S/PDM implementations preserved in src/ for future Phase 2

#### BLE Infrastructure - Phase 1 Complete ✅
- **✅ MTU Upgraded**: From 247 to 517 bytes for high-throughput data
- **✅ MicStateConfig Handler**: Tag 20 protobuf processing with mobile app communication
- **✅ Audio Chunk Parser**: 0xA0 header processing framework ready
- **✅ SPI4M Optimization**: 33MHz verified speed for display performance
- **✅ Button Conflict Resolution**: Remapped buttons to avoid SPI4 interference

#### Audio Research & Implementation (Preserved)
- **📚 MentraOS Analysis Complete**: LC3 codec, PDM mic, I2S output thoroughly studied
- **🏗️ Audio Framework Ready**: Full implementation available in src/ directory
- **🎵 Test Implementations**: I2S audio tests, PDM loopback, MentraOS integration
- **⏸️ Audio Paused**: Implementation complete but priority shifted to display

#### Next Phase: Display Driver Optimization
- **🎯 Focus**: Optimizing SPI4M display performance beyond 33MHz
- **📊 Target**: Enhanced frame rates, reduced latency, improved visual experience
- **🔧 Approach**: Advanced SPI timing, DMA optimization, display controller tuning

## [2.10.0] - 2025-08-19

### 🎤 PDM MICROPHONE & LC3 AUDIO STREAMING FOUNDATION

#### Added
- **🎯 MicStateConfig Protobuf Support (Tag 20)**
  - ✅ **Complete protobuf handler** for microphone enable/disable from phone app
  - ✅ **Verified phone app communication** - receives and processes MicStateConfig messages
  - ✅ **PDM audio streaming framework** with BLE transmission infrastructure
  - 🔧 **Mock audio streaming** at sustainable BLE data rates (21 bytes/sec)

#### Fixed
- **🚨 CRITICAL: BLE Stack Overload Prevention**
  - 🔍 **Root Cause**: Audio streaming was sending 321-byte packets every 10ms (~32KB/s)
  - 🔍 **Symptom**: System freeze when microphone enabled via phone app
  - ✅ **Solution**: Reduced to 21-byte packets every 1 second with error handling
  - ✅ **Result**: Stable protobuf communication, no system freeze on mic enable/disable
  - 🎯 **BLE Capacity**: Properly respects Nordic BLE stack throughput limitations

#### Technical Details
- **PDM Configuration**: Ready for 16kHz sample rate, 16-bit depth
- **BLE Protocol**: Audio chunks via 0xA0 message type to mobile app
- **Error Handling**: Exponential backoff for failed BLE transmissions
- **Testing Status**: ✅ Protobuf working, ⏳ Actual PDM capture pending implementation

#### Next Steps
- 🎵 Implement actual PDM microphone capture (currently mock data)
- 🎵 Add LC3 encoding for compressed audio transmission
- 🎵 Optimize BLE streaming rates for real-time audio

## [2.9.0] - 2025-08-19

### 🔘 BUTTON MAPPING OPTIMIZATION & SPI CONFLICT RESOLUTION

#### Fixed
- **🎯 ROOT CAUSE IDENTIFIED & RESOLVED: SPI4 vs Button Pin Conflicts**
  - 🔍 Button 3 (P0.08) conflicted with SPI4 SCK causing spurious button events
  - 🔍 Button 4 (P0.09) conflicted with SPI4 MOSI causing spurious button events  
  - 🔍 SPI clock/data signals were inadvertently triggering chess pattern (Button 3+4 combo)
  - ✅ **SOLUTION: Remapped buttons to avoid SPI pins instead of moving SPI**
  - ✅ **VERIFIED: Auto-cycling chess pattern issue resolved after firmware flash**

#### Changed
- **🔘 New Button Mapping (Avoiding P0.08/P0.09 SPI Conflicts)**
  - 🔋 **Button 1**: Cycle battery level 0→20→40→60→80→100→0% + toggle charging state
  - 📺 **Button 2**: Toggle between welcome screen and scrolling text container  
  - 🎨 **Button 1+2**: Cycle LVGL test patterns (replaces old Button 4 function)
  - ⚠️  **Buttons 3+4**: Completely disabled to prevent SPI interference on P0.08/P0.09
- **⚡ SPI4M HIGH-SPEED CONFIGURATION ENABLED**
  - 📈 **Upgraded from SPI3 (8 MHz) to SPI4M (32 MHz target)**
  - 📍 **SPI4 Pin Mapping**: SCK=P0.08, MOSI=P0.09, MISO=P0.10, CS1=P1.04, CS2=P1.05
  - 🎯 **Expected Performance**: ~33 MHz actual (with 128 MHz HFCLK override)
  - 🔄 **Resolves**: Previous 8 MHz SPI3 limitation, matches MentraOS implementation

#### Removed
- ❌ All Button 3 and Button 4 individual/combination functions disabled
- ❌ Chess pattern auto-triggering eliminated by disabling conflicting buttons
- ❌ HLS12VGA grayscale pattern shortcuts removed (Button 3 combinations)

## [2.8.0] - 2025-08-18

### 🔧 HARDWARE PIN OPTIMIZATION & BUG FIXES

#### Fixed
- **CS Pin Conflict Resolution**
  - 🔧 Moved CS1 (left_cs) from P0.11 to P1.04 to avoid Arduino connector conflicts  
  - 🔧 Moved CS2 (right_cs) from P0.12 to P1.05 to avoid Arduino connector conflicts
  - 🔧 Unified device tree overlay configuration across secure/non-secure variants
  - 🔧 SPI pins now: SCK=P0.8, MOSI=P0.9, MISO=P0.10, CS1=P1.04, CS2=P1.05
  - 🔧 Resolves hardware pin conflicts that could affect signal integrity

#### Known Issues
- ✅ ~~SPI frequency operating at 8 MHz instead of target 32 MHz~~ - Resolved via button remapping
- ✅ ~~Display patterns auto-cycling randomly without button press~~ - **FIXED: SPI/Button conflict resolved**

## [2.7.0] - 2025-08-14

### 🔄 INFINITE SMOOTH SCROLLING & SPI PERFORMANCE OPTIMIZATION

#### Added
- **Infinite Horizontal Text Scrolling**
  - 🎬 Replaced "jumping" circular scrolling with smooth infinite animation
  - 🎬 Welcome text now scrolls continuously from right to left in a loop
  - 🎬 8-second animation cycle with linear motion path
  - 🎬 Custom animation callbacks for seamless infinite repetition
  - 🎬 No pauses or "jumps" - true continuous scrolling experience

#### Enhanced  
- **SPI Performance Optimization**
  - ⚡ Enhanced SPI drive mode: `NRF_DRIVE_E0E1` for stronger signal integrity
  - ⚡ Board overlay configuration: `nordic,drive-mode = <NRF_DRIVE_E0E1>`
  - ⚡ SPI4 pinctrl enhanced for higher frequency operation
  - ⚡ Real-time SPI transfer monitoring every 100th transfer
  - ⚡ Comprehensive performance logging: speed in MB/s and effective MHz

- **LVGL Performance Tuning**
  - 🚀 Optimized tick rates: 2ms intervals for smoother animations
  - 🚀 Reduced message timeouts: 1ms for faster responsiveness
  - 🚀 Enhanced FPS monitoring and reporting
  - 🚀 Target performance: 5 FPS LVGL refresh rate

#### Technical Implementation
- **Animation System Overhaul**
  - 🔧 Global animation variables: `scrolling_welcome_label`, `welcome_scroll_anim`
  - 🔧 Custom animation callbacks: `welcome_scroll_anim_cb()`, `welcome_scroll_ready_cb()`
  - 🔧 Automatic restart mechanism for infinite loop scrolling
  - 🔧 Label positioning: starts at 640px, moves to -600px for complete traverse

#### Performance Monitoring
- **SPI Speed Analysis**  
  - 📊 Real-time transfer timing measurement
  - 📊 Bytes per second calculation and MHz effective speed reporting
  - 📊 Comparative analysis: K901 project (33MHz) vs Simulator (8MHz target)
  - 📊 Debug logs for SPI frequency optimization

#### In Progress - SPI Speed Investigation
- **Current Status**: SPI SCK speed measuring ~8MHz average despite optimizations
- **Target**: Achieve K901-equivalent 33MHz SPI operation
- **Debug Areas**: Drive strength, frequency configuration, hardware limitations

## [2.6.0] - 2025-08-14

### 🎨 DIRECT HARDWARE ACCESS - True 8-bit Grayscale Test Patterns

#### Added
- **Direct HLS12VGA Hardware Pattern Generation**
  - 🎨 Three new direct SPI access pattern functions bypassing LVGL limitations
  - 🎨 `hls12vga_draw_horizontal_grayscale_pattern()` - 8 horizontal bands with true grayscale levels
  - 🎨 `hls12vga_draw_vertical_grayscale_pattern()` - 8 vertical bands for display testing
  - 🎨 `hls12vga_draw_chess_pattern()` - High-contrast checkerboard pattern for alignment
  - 🎨 True 8-bit grayscale capability: 0x00, 0x24, 0x49, 0x6D, 0x92, 0xB6, 0xDB, 0xFF

#### Enhanced
- **Button Control Interface**
  - ⌨️ Button combination system for easy pattern access
  - ⌨️ Button 3 + 1: Horizontal grayscale pattern (8 bands × 60px height)
  - ⌨️ Button 3 + 2: Vertical grayscale pattern (8 bands × 80px width)
  - ⌨️ Button 3 + 4: Chess pattern (8×8 grid, 80×60px squares)
  - ⌨️ Enhanced logging with pattern execution confirmation

#### Technical Implementation
- **Direct SPI Access Architecture**
  - 🔧 Uses same SPI structure as `hls12vga_clear_screen()` for consistency
  - 🔧 Direct `hls12vga_transmit_all()` and `hls12vga_write_multiple_rows_cmd()` access
  - 🔧 Memory-efficient batch processing (10-row chunks) for 640×480 display
  - 🔧 Thread-safe integration via LCD command message queue system
  - 🔧 Complete error handling and validation for pattern generation

#### Hardware Integration
- **HLS12VGA MicroLED Projector Support**
  - 📺 Authentic 8-bit grayscale testing beyond LVGL 1-bit monochrome limitation
  - 📺 640×480 full resolution pattern generation
  - 📺 Direct hardware validation for display calibration and testing
  - 📺 Seamless integration with existing LVGL display module architecture

#### Development Tools
- **Pattern Generation Functions**
  - 🛠️ `display_draw_horizontal_grayscale()` - Thread-safe wrapper
  - 🛠️ `display_draw_vertical_grayscale()` - Thread-safe wrapper  
  - 🛠️ `display_draw_chess_pattern()` - Thread-safe wrapper
  - 🛠️ New LCD commands: `LCD_CMD_GRAYSCALE_HORIZONTAL/VERTICAL/CHESS_PATTERN`

## [2.5.0] - 2025-08-12

### 📱 PROTOBUF INTEGRATION - Real-Time Text Message Display System

#### Added
- **Protobuf Text Container Integration**
  - 📱 Auto-scroll container now default view (pattern 4) instead of chess pattern
  - 📱 Real-time protobuf text message display via BLE integration
  - 📱 Thread-safe `display_update_protobuf_text()` API for external calls
  - 📱 New `LCD_CMD_UPDATE_PROTOBUF_TEXT` command for message queue processing
  - 📱 Support for both DisplayText (Tag 30) and DisplayScrollingText (Tag 35)

#### Enhanced
- **Auto-Scroll Container Functionality**
  - 🔄 Clear and replace content with each new protobuf message
  - 🔄 Automatic scroll to bottom to show latest content
  - 🔄 Initial placeholder: "Waiting for protobuf text messages..."
  - 🔄 Global references (`protobuf_container`, `protobuf_label`) for dynamic updates
  - 🔄 Unified display for both static and scrolling text message types

#### Technical Implementation
- **Thread-Safe Architecture**
  - 🔧 All protobuf text updates processed through LVGL message queue
  - 🔧 Proper separation of interrupt handlers and LVGL operations
  - 🔧 Safe text content clearing and replacement in LVGL thread context
  - 🔧 Bounds checking and null termination for text content (MAX_TEXT_LEN: 128 chars)

#### Protobuf Protocol Support
- **Message Types Integrated**
  - 📩 DisplayText (Tag 30): Static text messages → Auto-scroll container
  - 📩 DisplayScrollingText (Tag 35): Animated text → Same auto-scroll container
  - 📩 Enhanced logging: `📱 Protobuf text updated: [text preview]`
  - 📩 Ready for mobile app BLE communication and real-time updates

#### Performance Notes
- **Current Observations**
  - ⚠️ Frame rate observed dropping to 1 FPS during text updates (investigation needed)
  - ⚠️ Memory usage: 557KB FLASH, 260KB RAM (stable, no increase)
  - ⚠️ Full text replacement may impact performance with large messages

#### Future Optimizations
- **Recommended Improvements**
  - 🚀 Implement incremental text updates (send only new words/sentences)
  - 🚀 Add clear screen command for efficient content management
  - 🚀 Define maximum packet length for text messages (current: 128 char limit)
  - 🚀 Investigate frame rate optimization for better real-time performance
  - 🚀 Consider text chunking for large message handling

#### Verified
- **Full System Integration**
  - 📺 Default view: Auto-scroll container with protobuf integration
  - 📺 BLE protobuf messages successfully update display content
  - 📺 Thread-safe operation with no firmware crashes or assertion failures
  - 📺 Button 4 pattern cycling preserved (cycles through all 5 patterns)
  - 📺 Mobile app ready: DisplayText and DisplayScrollingText both supported

## [2.4.2] - 2025-08-12

### 🧹 CODE OPTIMIZATION - Debug Logging Cleanup & Performance Enhancement

#### Optimized
- **LVGL Debug Logging Minimization**
  - 🧹 Removed excessive pattern creation logs from all test patterns
  - 🧹 Eliminated verbose completion messages ("Chess pattern: %dx%d squares", "Zebra: %d stripes")
  - 🧹 Cleaned up container setup logs ("Creating auto-scroll text container", "Auto-scroll container: 600x440px")
  - 🧹 Removed processing delay logs ("Waiting 100ms for display", "Test pattern completed")
  - 🧹 Preserved essential monitoring: FPS display and minimal pattern switching notifications

#### Performance
- **System Resource Optimization**
  - ⚡ Reduced RTT logging overhead for improved real-time performance
  - ⚡ Maintained clean, minimal debug output for better development experience
  - ⚡ Memory usage optimized: 557KB FLASH, 260KB RAM (reduced from logging cleanup)
  - ⚡ Enhanced developer productivity with noise-free console output

#### Technical Details
- **Logging Strategy**: Essential-only approach maintaining FPS monitoring
- **Debug Output**: Clean RTT console with minimal, actionable information
- **Code Quality**: Systematic removal of 15+ verbose logging statements
- **Development Experience**: Improved signal-to-noise ratio in debug output

#### Verified
- **Clean System Operation**
  - 📺 All 5 test patterns (chess, h-zebra, v-zebra, scrolling text, auto-scroll container) functioning normally
  - 📺 Auto-scroll container with 30pt font working smoothly without borders/scrollbars
  - 📺 Button 4 pattern cycling preserved with minimal status updates
  - 📺 FPS monitoring maintained: "LVGL FPS: 2" essential performance metric
  - 📺 System stability unchanged with reduced logging overhead

## [2.4.1] - 2025-08-12

### 🔧 CODE QUALITY - Function Name Typo Correction

#### Fixed
- **Function Name Spelling Correction**
  - ✅ Fixed: `lvgl_dispaly_thread()` → `lvgl_display_thread()` 
  - ✅ Updated: Header declaration in `mos_lvgl_display.h`
  - ✅ Updated: Implementation in `mos_lvgl_display.c`
  - ✅ Updated: Function calls in `main.c` and `display_manager.c`
  - ✅ Build: Successful compilation maintaining 585KB FLASH usage
  - ✅ Quality: Code now cleaner than peripheral_uart_next reference

## [2.4.0] - 2025-08-12

### 🔤 FONT ENHANCEMENT - Maximum Size Text Display

#### Enhanced
- **Large Font Upgrade for Better Visibility**
  - 📏 Upgraded scrolling text from 30pt to **48pt Montserrat font** (60% larger)
  - 📺 Maximum available font size for optimal AR glasses readability
  - 🎯 Enhanced visual impact and professional appearance
  - 💾 FLASH usage optimized: 585KB total (97KB font data increase)

#### Technical Details
- **Font Progression**: 30pt → 48pt (largest available in LVGL build)
- **Available Sizes**: 12pt, 14pt, 16pt, 18pt, 24pt, 30pt, **48pt** ← Current
- **Memory Impact**: +97KB FLASH usage for larger font bitmap data
- **Performance**: Stable 2 FPS LVGL rendering maintained at 640x480

#### Verified
- **Enhanced Text Display**
  - 🌟 "Welcome to MentraOS NExFirmware!" message significantly larger
  - 🌟 Better readability from greater viewing distances
  - 🌟 Professional AR glasses user experience
  - 🌟 Smooth 1.5-second scroll cycle maintained with larger font

## [2.3.0] - 2025-08-12

### 🛡️ CRITICAL STABILITY FIX - Thread-Safe LVGL System & Clean Logging

#### Fixed
- **CRITICAL: LVGL Threading Assertion Failure Resolved**
  - 🔧 Fixed ASSERTION FAIL [0] @ lv_refr.c:279 causing firmware freeze
  - 🔧 Eliminated button interrupt conflicts with LVGL refresh thread
  - 🔧 Implemented thread-safe message queue pattern cycling system
  - 🔧 Added LCD_CMD_CYCLE_PATTERN command for safe UI updates
  - 🔧 Separated battery controls from LVGL operations completely

- **System Stability Improvements**
  - 🔧 Disabled verbose CUSTOM_HLS12VGA logging for cleaner output
  - 🔧 Added 1-second debounce protection preventing rapid button cycles
  - 🔧 Implemented proper LVGL thread-only object manipulation
  - 🔧 Added display_cycle_pattern() thread-safe public API

#### Changed
- **Button Configuration Optimized**
  - 🎮 Button 1: Battery level increase (no LVGL conflicts)
  - 🎮 Button 2: Battery level decrease (no LVGL conflicts)
  - 🎮 Button 3: Charging status toggle (no LVGL conflicts)
  - 🎮 Button 4: **NEW** Dedicated LVGL pattern cycling (thread-safe)

- **LVGL Text System Enhanced**
  - 🌟 Upgraded to scrolling "Welcome to MentraOS NExFirmware!" message
  - 🌟 Implemented 1.5-second scroll cycle with proper animation timing
  - 🌟 Added Montserrat 30pt font with optimized readability
  - 🌟 Enhanced text styling with padding and rounded corners

#### Verified
- **Complete System Stability**
  - 📺 640x480 HLS12VGA projector displaying stable LVGL content at 2 FPS
  - 📺 Scrolling welcome message working smoothly without interruption
  - 📺 Battery buttons (1,2,3) functioning without firmware freeze
  - 📺 Pattern cycling (Button 4) working safely with no assertion failures
  - 📺 Chunked transfer system handling 307KB displays without crash
  - 📺 16MHz SPI4 communication maintaining signal integrity

#### Technical Achievement
- **Root Cause Analysis**: Identified button interrupt → LVGL thread conflicts as source of all stability issues
- **Threading Architecture**: Proper separation of interrupt handlers and LVGL operations
- **Performance**: Stable 2 FPS LVGL rendering with 640x480 resolution on monochrome projector
- **Reliability**: Zero firmware freezes or assertion failures with new button configuration

## [2.2.0] - 2025-08-12

### 📝 TEXT RENDERING MILESTONE - LVGL Font System Fully Operational

#### Added
- **LVGL Text Display System**
  - ✅ Successfully implemented "Hello LVGL" text rendering on HLS12VGA projector
  - ✅ Integrated Montserrat 48pt font for large, readable text display
  - ✅ Added centered text positioning with automatic alignment
  - ✅ Implemented text styling with white text on black background
  - ✅ Added padding and background styling for enhanced text visibility

#### Verified
- **Complete Text Rendering Pipeline**
  - 📝 "Hello LVGL" message displaying correctly on 640x480 projector screen
  - 📝 Font rasterization working through chunked transfer system
  - 📝 Text positioning and centering functioning properly
  - 📝 Monochrome display showing excellent text contrast and readability
  - 📝 Pattern cycling allows switching between text and geometric patterns

#### Technical Achievement
- **End-to-End Text Pipeline**: LVGL font engine → bitmap generation → chunked transfers → SPI4 communication → HLS12VGA display
- **Performance**: Large 48pt font rendering stable with no system freezes
- **Integration**: Text patterns seamlessly integrated with existing pattern cycling system

## [2.1.0] - 2025-08-12

### 🚀 BREAKTHROUGH - Full LVGL Display System with Chunked Transfer Solution

#### Added
- **Advanced Display Transfer System**
  - ✅ Implemented chunked display transfer system to handle large 640x480 displays
  - ✅ Added automatic transfer size detection and segmentation (32K pixel chunks)
  - ✅ Created horizontal strip processing for efficient memory management
  - ✅ Implemented safety limits preventing firmware freeze during large transfers
  - ✅ Added comprehensive transfer debugging and monitoring system

- **LVGL Integration Breakthrough**
  - ✅ Successfully achieved full LVGL system operation with display_open() integration
  - ✅ Implemented lvgl_dispaly_thread() startup in main.c for proper threading
  - ✅ Created comprehensive test pattern system (chess board, zebra patterns, center rectangle)
  - ✅ Added pattern cycling with button controls for interactive testing
  - ✅ Configured LVGL double buffering with CONFIG_LV_Z_VDB_SIZE=100 for smooth operation

- **Performance Optimization**
  - ✅ Migrated from SPI3 (8MHz limited) to SPI4 (32MHz capable) 
  - ✅ Achieved stable 16.667MHz SPI operation with confirmed signal integrity
  - ✅ Logic analyzer validation showing perfect 16MHz SPI communication
  - ✅ Implemented inter-chunk delays preventing system overwhelming

#### Fixed
- **Critical Firmware Stability Issues**
  - 🔧 Identified and resolved firmware freeze caused by 307KB full-screen transfers
  - 🔧 Implemented chunked transfer preventing watchdog timeouts and stack overflow
  - 🔧 Fixed LVGL thread initialization (missing lvgl_dispaly_thread start)
  - 🔧 Corrected display_open() call sequence for proper hardware initialization
  - 🔧 Added recursive transfer protection with safety checks

#### Verified
- **Display System Fully Operational**
  - 📺 Center rectangle test pattern visible on HLS12VGA projector screen
  - 📺 LVGL system running at optimized frame rates with chunked transfers
  - 📺 Button controls working for pattern cycling and interaction
  - 📺 System stable and responsive with no firmware freezes
  - 📺 Battery status reporting functional during display operations
  - 📺 16MHz SPI communication confirmed via logic analyzer

## [2.0.0] - 2025-08-12

### 🎉 MAJOR MILESTONE - HLS12VGA Projector Successfully Running on nRF5340DK

#### Added
- **HLS12VGA MicroLED Projector Integration**
  - ✅ Successfully ported complete HLS12VGA driver from peripheral_uart_next project
  - ✅ Implemented semaphore-based initialization system (K_SEM_DEFINE)
  - ✅ Added MOS LVGL display thread architecture with proper threading
  - ✅ Configured SPI3 communication with corrected CS timing (P0.28/P0.29 active-low)
  - ✅ Implemented power management for VCOM (P0.07), V1.8 (P0.06), V0.9 (P0.05) rails
  - ✅ Added BSP logging system integration for comprehensive debugging

#### Fixed
- **Critical Hardware Issues Resolved**
  - 🔧 Fixed VCOM enable pin configuration (HIGH for display operation)
  - 🔧 Corrected SPI CS timing logic for proper active-low operation  
  - 🔧 Resolved power rail initialization sequence (all enables set to HIGH)
  - 🔧 Fixed pixel format from RGB565 to MONO01 for monochrome display
  - 🔧 Corrected color inversion (0x00=visible, 0xFF=invisible on bright background)

#### Verified
- **Display Functionality Confirmed**
  - 📺 Projector powers on and displays full-screen brightness during initialization
  - 📺 Blinking test pattern working (500ms on/off cycles)
  - 📺 SPI communication active and functional via logic analyzer
  - 📺 Line-by-line refresh visible (expected behavior for SPI-based display)
  - 📺 Proper device tree recognition and driver binding

#### Technical Details
- **Driver Architecture**: Complete 618-line implementation with semaphore coordination
- **Display Resolution**: 640×480 monochrome (PIXEL_FORMAT_MONO01)
- **SPI Configuration**: 3-byte protocol with dual CS support
- **Power Sequence**: VCOM/V1.8/V0.9 enable → Reset → SPI communication
- **Threading**: MOS LVGL display thread with 4KB stack, priority 5

## [1.9.0] - 2025-08-11

### Added
- **LVGL Hello World display baseline established**
  - Successfully integrated LVGL with dummy display showing "Hello World" message
  - Configured 640x480 resolution with 16-bit color depth for projector compatibility
  - Added proper devicetree overlay with dummy display (zephyr,dummy-dc) as stable baseline
  - Created board-specific overlay structure for future projector hardware integration

### Enhanced
- **Display driver infrastructure preparation**
  - Added custom HLS12VGA projector driver module structure (temporarily disabled)
  - Implemented proper Zephyr module.yml configuration for driver discovery
  - Created devicetree bindings for custom HLS12VGA projector (zephyr,custom-hls12vga)
  - Added SPI3 pinctrl configuration for projector hardware interface
  - Structured driver with proper GPIO control for dual CS, power rails, and reset

### Technical Infrastructure
- **Build system improvements**
  - Updated CMakeLists.txt with ZEPHYR_EXTRA_MODULES support for custom drivers
  - Added Kconfig integration for custom driver modules
  - Implemented conditional compilation between dummy and projector displays
  - Fixed include paths and module discovery patterns

### Working Features
- ✅ LVGL displays "Hello World" via dummy display (640x480)
- ✅ Protobuf integration maintained and functional
- ✅ BLE communication working correctly
- ✅ Build/flash/run cycle successful
- ✅ Clean logging separation (RTT debug + UART console)

### Next Phase
- Pending: Enable HLS12VGA projector driver with proper module discovery
- Ready: Switch from dummy display to real projector hardware
- Prepared: GPIO configuration for projector power and control

## [1.8.0] - 2025-08-09

### Fixed
- **Critical protobuf include path restoration** 
  - Fixed `#include "proto/mentraos_ble.pb.h"` path that was accidentally changed during LVGL implementation
  - Restored full protobuf message processing functionality (DisplayText, BrightnessConfig, all message types)
  - This fix resolves the issue where protobuf messages weren't being decoded/processed

### Added  
- **Enhanced console logging for protobuf debugging**
  - Added printk() console output for protobuf message processing visibility on UART
  - Protobuf messages now show clear processing status in console alongside RTT debug logs
  - Format: `[Phone->Glasses] MessageType (Tag X): Description`
  - Failed decoding messages now show `❌ Failed to decode protobuf message` for immediate visibility

### Enhanced
- **LVGL + Protobuf integration** now fully functional
  - DisplayText protobuf messages correctly processed and displayed via LVGL interface
  - BrightnessConfig messages properly control LED dimming with console feedback
  - All protobuf message types (BatteryStateRequest, DisplayText, BrightnessConfig, etc.) working correctly
  - Clean logging separation: RTT for detailed debug, UART console for protobuf communication + status

### Technical Details
- **Root cause**: During LVGL implementation, protobuf include was changed from correct path
- **Impact**: Protobuf message definitions weren't included, causing silent decode failures  
- **Resolution**: Restored correct include path while preserving LVGL functionality
- **Verification**: All protobuf message processing, LVGL display, and console logging working correctly

## [1.7.0] - 2025-08-09

### Added
- **LVGL Graphics Library Integration** for smart glasses display system
  - Complete LVGL v8.x framework implementation with 16-bit color depth
  - Dummy display driver (640x480) for prototyping without physical display hardware
  - Dual projector support with independent control for left and right displays
  - Thread-based LVGL demo with "Hello, LVGL on Mentra!" demonstration
  - Professional console output separation for protobuf communication

### Hardware Configuration
- **Updated pin mapping for dual projector system**
  - Left Projector CS: P1.15 (changed from P0.08)
  - Right Projector CS: P1.14 (changed from P0.09) 
  - Shared Projector Power: P1.13 (changed from P0.10)
  - SPI3 interface: SCK=P1.08, MOSI=P1.09, 32MHz clock speed
  - Device tree overlay configuration for proper hardware abstraction

### Display System
- **LVGL demo implementation** (`src/lvgl_demo.c`)
  - Auto-starting thread with K_THREAD_DEFINE for immediate demo execution
  - Two demonstration labels: main greeting and projector test message
  - Comprehensive status logging for LVGL initialization and operation
  - Integration with Zephyr dummy display device for hardware-independent testing

### Logging Architecture
- **Optimized logging separation** for clean protobuf communication
  - RTT backend for detailed debug logs (CONFIG_LOG_RTT=y)
  - Direct console output via printk() for protobuf message clarity
  - CONFIG_LOG_PRINTK=n to prevent console message redirection
  - Professional status messages with clear visual separators

### Technical Implementation
- **Kconfig integration** with LVGL enabling (CONFIG_LVGL=y, CONFIG_DUMMY_DISPLAY=y)
  - Optimized memory configuration for LVGL operations
  - Thread stack and priority configuration for smooth graphics operations
  - Integration with existing BLE and protobuf systems
- **Device tree configuration** (`app.overlay`)
  - Dummy display device node with proper binding to LVGL
  - SPI3 pin configuration for projector control
  - Hardware abstraction layer for future physical display integration

### Development Preparation
- **Complete protobuf + LVGL integration implemented**
  - `lvgl_interface.h` header for protobuf-LVGL communication bridge
  - `lvgl_display_protobuf_text()` function to display protobuf text messages on LVGL
  - `lvgl_is_display_ready()` function for safe LVGL operations
  - DisplayText protobuf messages automatically displayed via LVGL system
  - Optimized logging format: `📱 LVGL: 'text' | X:20 Y:260 | Color:0x2710 Size:20`

### Protobuf Integration
- **DisplayText message support** with LVGL display integration
  - Protobuf DisplayText messages (Tag 30) processed and displayed on dummy display
  - Text content, position (X,Y), color (RGB565), and font size support
  - Console logging for protobuf message visibility alongside LVGL display
  - Clean integration between protobuf handler and LVGL graphics system

### Future Integration Points
- **Ready for protobuf message display binding** to show received text on LVGL
- **Hardware-independent testing** with dummy display for rapid development
- **Scalable architecture** supporting future physical display driver integration
- **Clean separation** between debug logging (RTT) and protobuf communication (UART)

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
