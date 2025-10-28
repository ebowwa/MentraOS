# Changelog

All notable changes to the nRF5340 DK BLE Glasses Protobuf Simulator will be documented in this file.

## Unreleased

### 🔌 USB Cable Insertion/Removal Detection (Interrupt Mode) - 2024-12-XX

#### Features Added

- **USB Cable Detection**: Implement interrupt-driven USB cable insertion/removal detection
  - Use USBREGULATOR peripheral to detect USB connection status
  - Real-time interrupt-based detection without polling overhead
  - Immediate response to USB plug/unplug events

#### Technical Implementation

- **Interrupt Handler**: Use `usbreg_isr_handler()` to process USBREGULATOR interrupts
  - Detect `USBDETECTED` and `USBREMOVED` events
  - Clear event flags immediately in ISR to prevent retrigger
  - Submit work queue for handling state changes in thread context
- **State Management**: Check USBREGSTATUS.VBUSDETECT register to determine actual USB status
- **Debug Support**: Add debug logging with register state information
  - Enable `CONFIG_LOG_PRINTK=y` to allow shell control of printk output
  - Use `printk()` in ISR for safe debugging
- **Configuration**: Enable interrupts via INTENSET register
  - Register USBREGULATOR_IRQn interrupt handler
  - Clear pending events during initialization

#### Modified Files

- **src/main.c**: Add USB detection implementation
  - USBREGULATOR interrupt handler
  - Work queue handler for USB state changes
  - Initialization function with interrupt configuration
  - Move `hfclock_config_and_start` initialization to after LOG_MODULE_REGISTER
- **prj.conf**: Enable CONFIG_LOG_PRINTK for shell control of printk output
- **boards/nrf5340dk_nrf5340_cpuapp_ns.overlay**: Remove USB CDC configuration
  - Comment out USB CDC console/shell configuration
  - Remove zephyr_udc0 device tree node
  - Note: USB CDC functionality is removed from project configuration, usb_cdc.conf is not included

#### Testing Status

✅ Verified Working
- USB insertion detection functioning correctly
- USB removal detection functioning correctly
- No interrupt retrigger issues
- Debug logs showing correct USB state changes

---

### 🔌 USB CDC Virtual Serial Port for Shell Access - 2024-10-24

#### Features Added

- **USB CDC ACM Virtual Serial Port**: Enable Shell and console access via USB connection
  - Eliminates need for separate UART connection
  - Single USB cable for both power and communication
  - Operating system recognizes as standard serial device (`/dev/tty.usbmodem*` or `/dev/ttyACM*`)

#### Configuration Files

**New Files:**
- **usb_cdc.conf**: USB CDC driver configuration file
  - USB Device Stack enablement
  - Nordic official VID/PID (0x1915/0x530A)
  - CDC ACM class driver configuration
  - Auto-initialization at boot

**Modified Files:**
- **boards/nrf5340dk_nrf5340_cpuapp_ns.overlay**: USB device tree configuration
  - Console and shell redirection to USB CDC via `chosen` node
  - USB CDC ACM device definition (`cdc_acm_uart0`)
  - USB controller configuration (`&usbd`)

#### Technical Implementation

- **Device Tree Redirection**: Console/shell redirected through `chosen` nodes
- **UART Compatibility**: Maintains `CONFIG_UART_CONSOLE=y`, actual redirection via device tree
- **Transparent Interface**: USB CDC implements UART-compatible interface
- **Build Requirement**: ⚠️ **Must include usb_cdc.conf when building**

#### Hardware Connection

1. Connect nRF USB port on development board (not J-Link USB)
2. System will enumerate as "Nordic Semiconductor nRF5340 BLE Simulator"

#### Testing Status

✅ Verified Working
- macOS: Normal device recognition and connection
- Shell commands respond correctly
- Console output functioning properly

---

### 🌡️ A6N Temperature Control & Register Access Commands - 2025-10-24

#### 1. A6N Register Access Commands

##### 1.1 Direct Register Read/Write
- **Commands**: `display read <addr> [mode]` and `display write <addr> <value>`
- **Features**:
  - Support Bank0/Bank1 selection (use `bank1:` prefix, e.g., `bank1:0x55`)
  - Strict hexadecimal validation (requires `0x` prefix)
  - Engine selection for read operations (0=left, 1=right, default=left)
  - Comprehensive error handling with detailed feedback
- **Examples**:
  - `display read 0xBE` - Read display mode from left engine
  - `display read 0xBE 1` - Read from right engine
  - `display write 0xBE 0x84` - Set GRAY16 mode
  - `display read bank1:0x55` - Read Bank1 Demura control
- **File**: `src/shell_display_control.c`

#### 2. A6N Temperature Monitoring & Protection

##### 2.1 Temperature Reading
- **Command**: `display get_temp`
- **Features**:
  - 9-step hardware sequence to read panel temperature
  - Automatic conversion to Celsius: `T = (val × 5 / 7) - 50`
  - Display current temperature and protection thresholds
  - Compare against high/low limits with warnings
- **Registers**: 0xD0, 0xD8 (temperature data)

##### 2.2 Temperature Protection Control
- **Commands**:
  - `display min_temp_limit set <°C>` - Set low temperature recovery threshold
  - `display min_temp_limit get` - Read low temperature threshold
  - `display max_temp_limit set <°C>` - Set high temperature protection threshold
  - `display max_temp_limit get` - Read high temperature threshold
- **Temperature Range**: -30°C to +70°C (per A6N specification)
- **Hardware Registers**:
  - 0xF7: High temperature protection threshold (default: 0xB6 = 80°C)
  - 0xF8: Low temperature recovery threshold (default: 0x8C = 50°C)
- **Conversion Formula**: `reg_value = (temp + 50) × 7 / 5`
- **Examples**:
  - `display min_temp_limit set 0` - Set low recovery to 0°C
  - `display max_temp_limit set 65` - Set high protection to 65°C

##### 2.3 Helper Functions
- `a6n_read_temperature()`: Complete 9-step temperature reading sequence
  - Returns temperature in Celsius
  - Standard error code handling (-EINVAL, -EIO)
- Temperature range validation: -30°C to +70°C (A6N operating range)

#### 3. A6N Initialization Sequence Updates

##### 3.1 Recommended Configuration
- Added Hongshi FAE recommended register setting:
  - Bank0 0xD0 = 0x0A (optimization configuration)

##### 3.2 Register Status Reads During Init
- Added temperature protection register reads:
  - 0xF7: High temperature protection threshold
  - 0xF8: Low temperature recovery threshold
  - 0xE2: Brightness setting
- **Purpose**: Verify hardware configuration at startup
- **File**: `src/mos_components/mos_lvgl_display/src/mos_lvgl_display.c`

#### 4. Code Optimization

##### 4.1 Use Existing Definitions from a6n.h
- Removed duplicate macro definitions from `shell_display_control.c`
- Unified register definitions:
  - `A6N_LCD_TEMP_HIGH_REG` (0xF7) for high temperature protection
  - `A6N_LCD_TEMP_LOW_REG` (0xF8) for low temperature recovery

##### 4.2 Enhanced Help System
- Detailed parameter descriptions:
  - Register address range and format (0x00-0xFF)
  - Temperature range with A6N specification reference
  - Engine mode selection (left/right)
  - Bank selection usage
- Comprehensive examples for all new commands
- Temperature examples within valid operating range

#### 5. Technical Details

##### 5.1 Temperature Conversion
- **Read Formula**: `T(°C) = (register_value × 5 / 7) - 50`
- **Write Formula**: `register_value = (T(°C) + 50) × 7 / 5`
- **Valid Range**: -30°C to +70°C (A6N operating temperature range)
- **Register Range**: 0-255 (8-bit)

##### 5.2 Files Modified
- `src/shell_display_control.c`: +508 lines
  - Register access commands
  - Temperature control functions
  - Shell command definitions
  - Enhanced help system
- `src/mos_components/mos_lvgl_display/src/mos_lvgl_display.c`: +10 lines
  - FAE recommended configuration
  - Temperature register reads during init

---

### 🌞 A6N Display Driver Optimization + OPT3006 Ambient Light Sensor Driver - 2025-10-16

#### 1. A6N Display Driver Improvements

##### 1.1 Fixed Left/Right Optical Engine Display Inconsistency
- **Issue**: Left and right optical engines sometimes displayed inconsistent data
- **Root Cause**: CS (Chip Select) timing not synchronized
- **Fix**: Added 1μs delays in `a6n_transmit_all()` and `a6n_write_reg_bank()`
  - CS setup time: `k_busy_wait(1)` after pulling CS low
  - CS hold time: `k_busy_wait(1)` after SPI transfer, before pulling CS high
- **File**: `custom_driver_module/drivers/display/lcd/a6n.c`

##### 1.2 Unified Register Write Interface
- **Change**: `a6n_write_reg()` signature changed from `(uint8_t reg, uint8_t param)` to `(uint8_t bank_id, uint8_t reg, uint8_t param)`
- **Purpose**: Unified Bank0/Bank1 register operations using broadcast mode for both engines
- **Impact**: All calls to `a6n_write_reg()` updated
- **Files**: `a6n.c`, `a6n.h`, `mos_lvgl_display.c`

##### 1.3 Register Initialization Timing Optimization
- **Change**: Moved all A6N register initialization from `a6n_init()` to `LCD_CMD_OPEN`
- **Reason**: Ensures register configuration occurs after display power-on
- **Configuration**:
  - Bank1 0x55 = 0x00 (Disable Demura function)
  - Bank0 0xBE = 0x84 (GRAY16 4-bit grayscale mode)
  - Bank0 0x60 = 0x80 (Function TBD)
  - Bank0 0x78 = 0x0E, 0x7C = 0x13 (90Hz self-refresh rate, SPI≤32MHz)
  - Horizontal mirror mode
- **File**: `mos_lvgl_display.c`

##### 1.4 Shell Command Help Update
- Fixed `display brightness` command help text to accurately reflect 5-level support (20/40/60/80/100)
- **File**: `shell_display_control.c`

---

#### 2. New OPT3006 Ambient Light Sensor Driver ⭐

##### 2.1 Driver Implementation
- I2C: Address 0x44 (7-bit), Speed 100kHz (standard mode)
- Device ID: 0x3001
- Illuminance calculation: lux = 0.01 × 2^E × R[11:0] (per datasheet Equation 3)
- Default config: Continuous mode, 800ms, auto-range (0xCC10)
- Files: opt3006.c (440 lines), opt3006.h (219 lines)

##### 2.2 Configuration Register (Per Datasheet)
- Bit 15:12=RN, 11=CT, 10:9=M, 8-5=Flags(RO), 4=L, 3=POL, 2=ME, 1:0=FC
- Reset default: 0xC810
- Driver config: 0xCC10

##### 2.3 API Functions
- Initialization: `opt3006_init()`, `opt3006_check_id()`
- Reading: `opt3006_read_lux()`, `opt3006_read_lux_ex()`
- Configuration: `opt3006_set_mode()`, `opt3006_set_conversion_time()`, `opt3006_set_range()`
- Query: `opt3006_get_config()`, `opt3006_is_ready()`
- Register access: `opt3006_read_reg()`, `opt3006_write_reg()`

##### 2.4 Shell Commands (525 lines)
- Basic: help, info, read, config, test [count]
- Config: mode <continuous|single|shutdown>, ct <100|800>
- Debug: read_reg <addr>, write_reg <addr> <val>
- File: shell_opt3006.c

##### 2.5 Device Tree Configuration
- I2C3 bus: SDA=P1.03, SCL=P1.02, Drive=NRF_DRIVE_S0D1
- Alias: `myals = &i2c3`
- File: `boards/nrf5340dk_nrf5340_cpuapp_ns.overlay`

##### 2.6 Build System
- mos_driver/CMakeLists.txt: Added opt3006.c
- CMakeLists.txt: Added shell_opt3006.c  
- main.c: Added #include "opt3006.h"

---

#### 3. Testing & Verification

##### 3.1 A6N Display Driver
- ✅ CS timing fix: Left/right display consistency issue resolved
- ✅ Register init: All configs executed in LCD_CMD_OPEN
- ✅ Demura: Bank1 0x55 = 0x00 disabled

##### 3.2 OPT3006 Sensor
- ✅ I2C comm: Successfully read Manufacturer ID (0x5449) and Device ID (0x3001)
- ✅ Illuminance: Office environment reads 300-400 lux (matches standards)
- ✅ Config verification: 0xCC10 written and read back correctly
- ✅ Calculation accuracy: Raw=0x4938, E=4, M=2360 → 377.60 lux ✓
- ✅ Shell commands: All functions working

---

#### Breaking Changes

- `a6n_write_reg()` function signature changed, all call sites updated
- A6N register initialization timing moved from `a6n_init()` to `LCD_CMD_OPEN`

---

#### Test Commands

**A6N Display:**
```bash
display help                # View all display commands
display brightness 80       # Set brightness to 80%
display pattern 4           # Switch to pattern 4
```

**OPT3006 Sensor:**
```bash
# Basic commands
opt3006 help                # View all commands
opt3006 info                # Sensor information
opt3006 read                # Read illuminance (with Raw/E/M)
opt3006 test 10             # Test 10 samples
opt3006 config              # Show config details

# Configuration commands  
opt3006 mode continuous     # Set continuous mode
opt3006 ct 100              # Set 100ms conversion time

# Advanced debug commands
opt3006 read_reg 0x01       # Read config register (auto-parse fields)
opt3006 read_reg 0x7F       # Read device ID
opt3006 write_reg 0x01 0xCC10  # Write config (auto read-back verify)
```

---

### 🖥️ A6N Display Driver Implementation & Brightness Control - 2025-10-13

#### A6N Display Driver Migration
- **✅ NEW**: Complete A6N display driver replacing HLS12VGA
- **📺 Resolution**: 640×480 GRAY16 (4-bit grayscale) mode @ 90Hz refresh rate
- **⚡ Performance**: SPI 32MHz communication, optimized I1→I4 LUT conversion
- **🔧 Architecture**: Dual optical engine support (left_cs + right_cs) with synchronized control
- **📋 Files**: Added a6n.c (1313 lines), a6n.h (246 lines), removed hls12vga.c/h

#### 5-Level Brightness Control System
- **✅ FEATURE**: Implemented 5-level brightness adjustment via Bank0 0xE2 register
- **🎚️ Levels**: 20% (0x33), 40% (0x66), 60% (0x99), 80% (0xCC), 100% (0xFF)
- **🎯 API**: `a6n_set_brightness()` for direct register control
- **🔧 Helper**: `a6n_get_max_brightness()` returns maximum brightness (0xFF)
- **📱 Shell Command**: `display brightness <20|40|60|80|100>` for user-friendly control

#### Horizontal Mirror Fix
- **🐛 FIXED**: Left optical engine mirror inversion issue
- **🔧 Root Cause**: Left/right engines had opposite mirror polarity settings
- **✅ Solution**: Unified both engines to use identical mirror configuration
- **📊 Register**: 0xEF configured with bit7=1 (mirror), bit[6:5]=10 (reserved), bit[4:0]=8 (center)
- **🎯 Result**: Both left and right engines now display correctly without inversion

#### Reset IO Configuration Update
- **🔧 CRITICAL**: Reset pin configuration changed from GPIO_INPUT to GPIO_OUTPUT
- **⚡ Timing**: Added hardware reset sequence in a6n_power_on()
  - Power sequence: v0.9 → 10ms → v1.8 → 10ms → reset low → 5ms → reset high → 300ms
- **✅ Stability**: Ensures A6N chip properly resets before register configuration
- **🎯 Impact**: Improved display initialization reliability

#### Bank0/Bank1 Register Access
- **✅ FEATURE**: Full support for Bank0 and Bank1 register operations
- **📝 Commands**: 
  - Bank0 Write: 0x78, Read: 0x79
  - Bank1 Write: 0x7A, Read: 0x7B
- **🔧 API**: `a6n_write_reg_bank()` and `a6n_read_reg()` with bank_id parameter
- **🎯 Use Cases**: Self-test patterns require Bank1 register initialization

#### Display Initialization Optimization
- **✅ SIMPLIFIED**: LCD_CMD_OPEN initialization sequence optimized
- **📋 Sequence**: 
  1. a6n_power_on() - Power rails and reset
  2. set_display_onoff(true) - Enable VCOM
  3. a6n_set_gray16_mode() - Set 0xBE=0x84
  4. a6n_set_mirror(MIRROR_HORZ) - Configure horizontal mirror
  5. Configure refresh rate (0x78=0x0E, 0x7C=0x13 for 90Hz)
  6. a6n_open_display() and a6n_clear_screen()
- **⚡ Timing**: Added appropriate delays (6us) between register operations

#### Shell Command Enhancement
- **🎮 Brightness Control**: `display brightness <20|40|60|80|100>`
- **📋 Help System**: Comprehensive usage examples and level descriptions
- **✅ Validation**: Input range checking with friendly error messages
- **🔍 Feedback**: Displays percentage and register value (e.g., "60%, reg=0x99")

#### Test Script & Documentation
- **📝 NEW**: a6n_display_test.sh - Comprehensive bilingual test guide
- **🧪 Content**: Test steps, expected results, register configuration reference
- **🐛 Debugging**: Known issues and solutions documented
- **🌐 Bilingual**: All content in Chinese | English format

#### Technical Specifications
- **Display Mode**: GRAY16 (4-bit), 2 pixels per byte
- **Data Size**: 320 bytes/row, 153,600 bytes/frame
- **Batch Size**: 192 rows/batch (61,440 bytes)
- **SPI Speed**: 32MHz actual operation
- **Frame Rate**: 90Hz self-refresh
- **Brightness Range**: 0x00-0xFF (64 levels supported by hardware)

#### Files Changed
```
18 files changed, 1907 insertions(+), 1231 deletions(-)

New Files:
  + a6n.c (1313 lines)
  + a6n.h (246 lines)
  + a6n_display_test.sh (106 lines)

Removed Files:
  - hls12vga.c (942 lines)
  - hls12vga.h (105 lines)

Modified Files:
  - mos_lvgl_display.c (initialization sequence)
  - shell_display_control.c (brightness command)
  - CMakeLists.txt (driver references)
  - prj.conf (configuration updates)
```

#### Testing & Verification
- **✅ Display Init**: Power-on initialization successful
- **✅ Mirror Fix**: Both left/right engines display correctly
- **✅ Brightness**: All 5 levels (20%/40%/60%/80%/100%) verified working
- **✅ Shell Commands**: Response and feedback correct
- **✅ Hardware Reset**: Reset timing sequence verified
- **✅ Register Config**: 0xBE, 0xE2, 0xEF, 0x78, 0x7C all configured correctly

#### Status: ✅ Production Ready
- **Display System**: A6N driver fully operational
- **Brightness Control**: 5-level adjustment working
- **Mirror Correction**: Left/right engines synchronized
- **Reset Sequence**: Hardware initialization stable
- **Documentation**: Test script and CHANGELOG updated

## Previous Releases

### �️ Comprehensive Shell Display Command System - 2025-09-30

#### Major Shell Display Control Implementation
- **✅ NEW**: `src/shell_display_control.c` — Complete shell command system for manual display control
- **🎯 Features**: Manual brightness control, clear/fill display, text positioning, pattern selection, battery management
- **📋 Commands Added**:
  - `display brightness 0-255` — Set HLS12VGA projector brightness
  - `display clear` — Clear display to black using HLS12VGA driver
  - `display fill` — Fill display with white (opposite of clear)
  - `display text "Hello" 100 200 16` — Position text with font size control
  - `display pattern 0-5` — Switch between 6 display patterns (chess, zebra, scrolling, protobuf, XY positioning)
  - `display battery 85 true` — Set battery level (0-100%) with optional charging state
  - `display help` — Comprehensive help system with examples

#### Shell Architecture & Integration
- **🔧 Stack Configuration**: Increased `CONFIG_SHELL_STACK_SIZE=8192` to prevent stack overflow in display commands
- **🛡️ Driver Integration**: Uses proper HLS12VGA driver functions instead of direct LVGL calls to avoid assertion failures
- **📱 Protobuf Integration**: Battery command integrates with protobuf system for automatic mobile app notifications
- **🌐 CJK Font Support**: All text commands use CJK font for Chinese character support
- **⚡ Pattern Switching**: Dynamic pattern selection with 6 test patterns plus protobuf/XY text containers

#### Critical Display Context Fix
- **🐛 FIXED**: Battery command display interference issue
- **❌ Issue**: `display battery` command was creating persistent XY text elements that interfered with normal text rendering
- **✅ Solution**: Removed display interference, battery command now only updates protobuf system and mobile app notifications
- **🎯 Result**: All display patterns and text commands work normally without positioning conflicts

#### Text Overlay System Enhancement
- **✅ Pattern 4 Support**: Modified `update_xy_positioned_text()` to handle scrolling text container (protobuf messages)
- **✅ Pattern 5 Support**: Full XY text positioning with coordinate validation and bounds checking
- **🔧 Flexible Text API**: `display text` command supports both overlay mode and positioned mode
- **🌏 Font Consistency**: Unified CJK font usage across shell commands and protobuf text rendering

### �🔆 Display Brightness Control Fix - 2025-09-30

#### Fixed HLS12VGA Projector Brightness Control
- **✅ FIXED**: `src/protobuf_handler.c` — Restored `hls12vga_set_brightness()` function call that was commented out
- **✅ FIXED**: Uncommented HLS12VGA header include to enable projector brightness control
- **🎯 Issue**: Phone app BrightnessConfig messages were only controlling PWM LED3, not display projector
- **🔧 Solution**: Enabled dual brightness control - both LED backlight and projector display brightness now respond to phone app commands
- **📱 Functionality**: BrightnessConfig protobuf messages now control:
  - PWM LED3 brightness (0-100% → PWM duty cycle) 
  - HLS12VGA projector brightness (0-100% → 0-9 brightness levels)

### 🛠️ Previous Changes

- `prj.conf` — Update Bluetooth L2CAP/ATT buffer and MTU settings for the simulator target (CONFIG_BT_L2CAP_TX_MTU=247).
- `proto/mentraos_ble.options` — Adjust nanopb string max_size fields (e.g. DisplayText/DisplayScrollingText = 247).
- `src/proto/mentraos_ble.pb.c`, `src/proto/mentraos_ble.pb.h` — Regenerate nanopb bindings; widen fieldinfo (PB_BIND) for large text fields to avoid static assertions.


## [2.18.0] - 2025-09-17

### 🔧 Git Branch Reorganization & Complete Display System Validation

#### Major Git Workflow Restructuring
- **🌳 nexfirmware Branch**: Established as primary firmware development branch
- **🔄 Branch Migration**: Successfully merged `dev-loay-nexfirmware` → `nexfirmware`
- **🏷️ Naming Integration**: Integrated Cole's updated naming conventions (mentraos_nrf5340/mos_*)
- **📋 Legacy Cleanup**: Replaced old K901_NRF5340/xyzn_* OEM naming throughout codebase
- **🔗 Feature Branch Targets**: Updated dev-nexfirmware-* branches to target nexfirmware

#### Complete Display System Testing & Validation
- **✅ HLS12VGA Verification**: Successfully tested 640×480 projector display functionality
- **✅ SSD1306 Compatibility**: Maintained full 128×64 OLED display support
- **🎨 LVGL Optimization**: Confirmed 1-bit color depth works optimally for both displays
- **🔧 Configuration Validation**: Tested display switching between SSD1306 and HLS12VGA

#### Display Switching Instructions

##### Quick Switch: HLS12VGA ↔ SSD1306
**Step 1: Device Tree Changes** (`boards/nrf5340dk_nrf5340_cpuapp_ns.overlay`)

For **HLS12VGA Projector**:
```dts
/ {
    chosen {
        zephyr,display = &hls12vga;  // Point to HLS12VGA
    };
};

&spi4 {
    hls12vga: hls12vga@0 {
        status = "okay";  // Enable HLS12VGA
    };
};

&i2c2 {
    ssd1306: ssd1306@3c {
        status = "disabled";  // Disable SSD1306
    };
};
```

For **SSD1306 OLED**:
```dts
/ {
    chosen {
        zephyr,display = &ssd1306;  // Point to SSD1306
    };
};

&spi4 {
    hls12vga: hls12vga@0 {
        status = "disabled";  // Disable HLS12VGA
    };
};

&i2c2 {
    ssd1306: ssd1306@3c {
        status = "okay";  // Enable SSD1306
    };
};
```

**Step 2: Optional Configuration** (`prj.conf`)
```properties
# For HLS12VGA (current):
CONFIG_CUSTOM_HLS12VGA=y    # Enable HLS12VGA driver
CONFIG_SSD1306=y            # Keep SSD1306 available

# For SSD1306 only (flash optimization):
CONFIG_CUSTOM_HLS12VGA=n    # Disable HLS12VGA to save flash
CONFIG_SSD1306=y            # Enable SSD1306 driver

# Common (works for both):
CONFIG_LV_COLOR_DEPTH_1=y   # 1-bit monochrome optimal for both
```

**Step 3: Build & Flash**
```bash
./build_firmware.sh
./flash_firmware.sh
```

#### Technical Specifications

##### Hardware Interfaces
- **HLS12VGA**: SPI4 @ 32MHz, 640×480, multiple GPIO control lines
- **SSD1306**: I2C2 @ 1MHz, 128×64, simple 2-wire interface

##### Memory Usage
- **HLS12VGA**: ~38KB framebuffer (640×480 @ 1-bit)
- **SSD1306**: ~1KB framebuffer (128×64 @ 1-bit)

##### Display Capabilities
- **Both displays**: 1-bit monochrome, LVGL compatible
- **HLS12VGA**: Projector output, hardware mirroring correction
- **SSD1306**: OLED panel, direct pixel mapping

#### Development Workflow Changes
- **Primary Branch**: `nexfirmware` (replaces dev-loay-nexfirmware)
- **Feature Branches**: `dev-nexfirmware-*` → target nexfirmware
- **Integration**: All Cole's mentraos_nrf5340 work preserved and integrated
- **Build System**: Full nRF Connect SDK v3.0.0 compatibility maintained

#### Status: ✅ Production Ready
- **Git Workflow**: Reorganized and documented for team collaboration
- **Display System**: Both HLS12VGA and SSD1306 fully tested and working
- **Build System**: Zero compilation errors, optimized configurations
- **Hardware Validation**: Real-world testing completed successfully

## [2.17.0] - 2025-09-16

### 🖥️ HLS12VGA Projector Display Support & Modular Display System

#### Complete HLS12VGA Integration
- **📺 HLS12VGA 640x480 Support**: Full hardware support for TI DLP2000 projector module
- **🔧 Modular Display Configuration**: Centralized display-specific settings system
- **🎨 Adaptive Color Management**: Dynamic color handling for different display technologies
- **🔄 Hardware Mirroring Correction**: Fixed horizontal display flipping for HLS12VGA
- **🎭 Color Inversion Fix**: Proper white-on-black text display for projector hardware

#### Display Configuration System
- **⚙️ display_config.h/c**: Centralized configuration with display-type detection
- **🎨 Adaptive Color Functions**: `display_get_text_color()`, `display_get_background_color()`, `display_get_adjusted_color()`
- **🔧 Hardware-Level Fixes**: Direct pixel processing corrections in HLS12VGA driver
- **🔀 Cross-Display Compatibility**: Maintains SSD1306 functionality while adding HLS12VGA support

#### Technical Implementation
- **🖥️ SPI Interface**: High-speed SPI communication for 640x480 projector data
- **⚡ Performance Optimized**: Efficient pixel processing with hardware mirroring correction
- **🎯 LVGL Integration**: Seamless integration with existing LVGL graphics system
- **📋 Conditional Compilation**: Clean build system supporting multiple display types

#### Multi-Display Architecture
- **🔧 Display Type Detection**: Automatic configuration based on connected hardware
- **🎨 Color Inversion Support**: Hardware-level bit mapping respects display configuration
- **🔄 Mirroring Support**: Configurable horizontal mirroring for different display orientations
- **✅ Backward Compatibility**: Preserves all existing SSD1306 OLED functionality

## [2.16.0] - 2025-09-02

### 🎵 LC3 Audio Codec Integration & Live Caption System

#### Complete Audio Streaming Implementation
- **🎤 PDM Microphone Integration**: Full digital microphone capture via P1.11/P1.12 pins
- **🔊 LC3 Audio Codec**: Low Complexity Communication Codec for efficient voice streaming
- **📡 BLE Audio Streaming**: Real-time audio transmission via protobuf 0xA0 audio chunks
- **⚙️ MicStateConfig Control**: Enable/disable microphone via protobuf Tag 20 messages

#### Audio System Architecture
- **📊 Sample Rate**: 16 kHz voice optimized with 16-bit PCM depth
- **⏱️ Frame Duration**: 10ms LC3 frames for minimal latency
- **🔀 Bitrate**: Configurable encoding (default 32 kbps for voice)
- **🎯 Integration**: Seamless integration with live caption display system

#### SPI Bus Optimization
- **🔧 Dual CS Control**: Modified SPI usage to simultaneously control two CS lines
- **📈 Thread Stack Increase**: LVGL thread stack expanded to 4096 bytes
- **⚖️ Priority Balancing**: Adjusted LC3 thread priority to prevent LVGL starvation
- **🔇 Noise Reduction**: Implemented noise handling for microphone open/close operations

#### Live Caption + Audio Integration
- **📱 Mobile App Ready**: Complete protobuf integration for Mentra Nex app testing
- **✅ Voice Functionality**: Normal voice operation confirmed on nRF5340DK
- **🎮 Pattern Support**: Maintains Pattern 4 & 5 text display functionality
- **🔗 Connectivity**: Compatible with ping/pong connectivity monitoring

#### Technical Implementation
- **📋 API Functions**: `enable_audio_system()`, `lc3_encoder_start()`, `lc3_decoder_start()`, `lc3_encoder_stop()`, `lc3_decoder_stop()`
- **🎛️ Protobuf Tag 20**: Fully enabled MicStateConfig message processing
- **🏗️ Display Integration**: Modified display logic for audio-caption coordination
- **🐛 Bug Fixes**: Resolved LC3 voice function issues and IIS/PCM peripheral setup

#### Hardware Compatibility
- **🔌 nRF5340DK**: Full support and testing completed
- **📡 BLE Streaming**: 40x5=200B audio block transmission
- **🎤 Digital PDM**: Compatible with standard PDM microphones
- **⚡ Performance**: Optimized for real-time audio processing

#### Status: ✅ Production Ready
- **Mobile App Integration**: Successfully tested with Mentra Nex app
- **Audio Quality**: Normal voice transmission confirmed
- **System Stability**: Live caption and audio streaming work simultaneously
- **Developer Ready**: Ready for integration into main development branch

## [2.14.0] - 2025-08-22

### 🔄 Ping/Pong Connectivity Monitoring Implementation

#### Glasses-Initiated Connectivity Monitoring
- **📡 Reversed Protocol Direction**: Glasses now send periodic ping messages to phone (every 10 seconds)
- **⏱️ Timer-Based System**: Robust 10-second ping interval with 3-second timeout detection
- **🔄 Retry Logic**: 3-attempt retry mechanism before declaring phone disconnected
- **💤 Sleep Mode Detection**: Automatic sleep/disconnect state when phone becomes unresponsive
- **🏷️ Protobuf Tag Adaptation**: Uses `GlassesToPhone.pong` (tag 15) for pings, expects `PhoneToGlasses.ping` (tag 16) for responses

#### Technical Implementation
- **🎯 Ping Timer**: `k_timer` with 10-second intervals for periodic connectivity checks
- **⏳ Timeout Timer**: 3-second timeout detection per ping attempt
- **📊 Retry Counter**: Tracks failed attempts (1/3, 2/3, 3/3) before disconnect
- **🔗 Connection Status**: `phone_connected` flag for system-wide connectivity awareness
- **🚨 Failure Handling**: Comprehensive logging and placeholder sleep mode implementation

#### Protobuf Protocol Adaptation
- **📤 Outgoing**: Glasses send `mentraos_ble_GlassesToPhone` with `pong` payload (tag 15)
- **📥 Incoming**: Glasses expect `mentraos_ble_PhoneToGlasses` with `ping` payload (tag 16)
- **🔀 Message Processing**: Case 16 handler processes phone responses as pong acknowledgments
- **🏗️ Initialization**: `protobuf_init_ping_monitoring()` called during main system startup

#### System Integration
- **⚡ Power Management Ready**: Placeholder sleep functions prepared for low-power implementation
- **🔁 Reconnection Logic**: System continues monitoring for phone reconnection after disconnect
- **📋 Comprehensive Logging**: Detailed debug output for ping/pong state transitions
- **🛠️ Build Verification**: Successfully compiled and tested with Nordic nRF Connect SDK v3.0.0

#### App Developer Integration Required
> **⚠️ VERIFICATION NEEDED**: Phone app developer must implement:
> 1. **Listen for tag 15** (`GlassesToPhone.pong`) messages from glasses
> 2. **Respond with tag 16** (`PhoneToGlasses.ping`) messages back to glasses  
> 3. **Treat pong as ping requests** and **ping as pong responses**
> 4. **Test connectivity monitoring** with glasses firmware

#### Status: ✅ Firmware Ready, Pending App Integration

## [2.13.0] - 2025-08-22

### 🎯 Pattern 5 - XY Text Positioning Implementation

#### New Pattern 5 Features
- **🖼️ Bordered Viewing Area**: 600x440 pixel container with white border for precise positioning
- **📍 XY Text Positioning**: Direct coordinate-based text placement within viewing area
- **🎨 Font System Integration**: Support for all available Montserrat font sizes
- **🧹 Clear Behavior**: Automatic clearing of previous text on new message display
- **🔧 Button Controls**: Button 2 now cycles through all patterns (0-5) including Pattern 5

#### Font Values Available
- **12pt** - `lv_font_montserrat_12` - Small text, footnotes
- **14pt** - `lv_font_montserrat_14` - Secondary content  
- **16pt** - `lv_font_montserrat_16` - **Default size**, normal body text
- **18pt** - `lv_font_montserrat_18` - Medium text, emphasized content
- **24pt** - `lv_font_montserrat_24` - Large text, headings
- **30pt** - `lv_font_montserrat_30` - Title size, main headers
- **48pt** - `lv_font_montserrat_48` - Display size, large banners

#### Technical Implementation
- **🏗️ Container System**: `create_xy_text_positioning_area()` creates 600x440 bordered container
- **📝 Text Rendering**: `update_xy_positioned_text()` handles XY positioning with font mapping
- **⚪ Color System**: Uses `lv_color_white()` for consistent text color matching Pattern 4
- **🗑️ Clear Function**: `lv_obj_clean()` removes all previous text before new display
- **🔍 Enhanced Debugging**: Comprehensive logging for coordinate validation and LVGL object creation
- **↩️ Font Fallback**: Invalid font sizes automatically default to 12pt

#### Protobuf Integration
- **🔀 Conditional Routing**: Pattern 5 uses `display_update_xy_text()`, others use `display_update_protobuf_text()`
- **📐 Coordinate Validation**: XY coordinates validated within 600x440 viewing area bounds
- **💬 Message Format**: xy_text protobuf with x, y, text, font_size, and color parameters

#### Testing & Validation
- **✅ Empty Start**: Container starts empty with no default text
- **✅ XY Positioning**: Text appears at exact specified coordinates
- **✅ Font Rendering**: All 7 font sizes (12,14,16,18,24,30,48pt) working correctly
- **✅ Color Display**: White text rendering properly on 1-bit display
- **✅ Clear Functionality**: Previous text cleared on each new message
- **✅ Pattern Cycling**: Button 2 successfully cycles through patterns including Pattern 5

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
