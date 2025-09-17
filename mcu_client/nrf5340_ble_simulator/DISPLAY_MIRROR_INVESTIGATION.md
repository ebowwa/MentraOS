# Display Mirroring Issue Investigation
## HLS12VGA Projector Random Mirror State Bug Analysis

### 🔍 **Issue Description**
- **Problem**: Display occasionally appears mirrored and requires device reset to correct
- **Frequency**: Intermittent/random occurrence 
- **Current Workaround**: Device reset restores correct orientation
- **Impact**: User experience disruption in AR glasses deployment

### 🕵️ **Root Cause Analysis**

#### **1. Mirror Setting Architecture**
```c
// Current mirror configuration in LCD_CMD_OPEN
hls12vga_set_mirror(0x08);  // 0x08 = Horizontal mirror
// 0x00 = Normal, 0x10 = Vertical, 0x18 = Horizontal + Vertical
```

#### **2. Potential Failure Points Identified**

##### **A. SPI Communication Failure**
```c
// hls12vga_transmit_all() dual CS communication
gpio_pin_set_dt(&cfg->left_cs, 0);   // Left projector
spi_write_dt(&cfg->spi, &tx);        // Send mirror command
gpio_pin_set_dt(&cfg->right_cs, 0);  // Right projector  
spi_write_dt(&cfg->spi, &tx);        // Send mirror command
```

**Issue**: If SPI transmission fails to one side, mirror setting becomes inconsistent
- Left projector gets mirror setting: 0x08
- Right projector fails to receive: remains at default (possibly 0x00)
- **Result**: Asymmetric display causing perceived "mirroring"

##### **B. Power-On Reset Timing Race Condition**
```c
// Power-on sequence in hls12vga_power_on()
gpio_pin_set_dt(&cfg->reset, 0);  // Reset low
k_msleep(50);                      // Wait for reset
gpio_pin_set_dt(&cfg->reset, 1);  // Reset high  
k_msleep(200);                     // Wait for startup

// Mirror setting immediately after
hls12vga_set_mirror(0x08);         // May be too soon!
```

**Issue**: Mirror register write may occur before HLS12VGA firmware fully initializes
- Hardware may not be ready to accept configuration commands
- Mirror setting gets lost or corrupted during initialization
- **Result**: Random default mirror state

##### **C. Register State Persistence**
```c
// HLS12VGA_LCD_MIRROR_REG (0x1C) volatile state
cmd[0] = LCD_WRITE_ADDRESS;   // 0x78
cmd[1] = HLS12VGA_LCD_MIRROR_REG;  // 0x1C  
cmd[2] = value;               // 0x08
```

**Issue**: Mirror register may not persist through power cycles or resets
- Register resets to hardware default (unknown state)
- No verification that write was successful
- **Result**: Unpredictable mirror state on startup

##### **D. Display Initialization Order**
```c
// Current initialization sequence
hls12vga_power_on();          // Power and reset sequence
hls12vga_set_brightness(9);   // Set brightness first
hls12vga_set_mirror(0x08);    // Set mirror second  
hls12vga_open_display();      // Enable display third
```

**Issue**: Configuration order may matter for HLS12VGA firmware
- Mirror setting before display enable may be ignored
- No delay between power-on and configuration
- **Result**: Configuration commands processed incorrectly

### 🔧 **Solution Implementation**

#### **Priority 1: Add Mirror Setting Verification & Retry**
```c
// Enhanced mirror setting with verification
int hls12vga_set_mirror_robust(const uint8_t value) {
    int max_retries = 3;
    int err = -1;
    
    for (int i = 0; i < max_retries; i++) {
        err = hls12vga_set_mirror(value);
        if (err == 0) {
            BSP_LOGI(TAG, "✅ Mirror setting successful: 0x%02X (attempt %d)", value, i+1);
            k_msleep(10);  // Allow setting to take effect
            return 0;
        }
        BSP_LOGW(TAG, "⚠️ Mirror setting failed (attempt %d/%d): %d", i+1, max_retries, err);
        k_msleep(50);  // Wait before retry
    }
    
    BSP_LOGE(TAG, "❌ Mirror setting failed after %d attempts", max_retries);
    return err;
}
```

#### **Priority 2: Improved Initialization Timing**
```c
// Enhanced LCD_CMD_OPEN sequence
case LCD_CMD_OPEN:
    BSP_LOGI(TAG, "LCD_CMD_OPEN - Enhanced initialization");
    
    // Step 1: Power-on with extended delays
    hls12vga_power_on();
    k_msleep(100);  // Extended post-power delay
    
    // Step 2: Enable display first  
    hls12vga_open_display();
    k_msleep(50);   // Allow display to stabilize
    
    // Step 3: Configure settings with verification
    int brightness_err = hls12vga_set_brightness(9);
    BSP_LOGI(TAG, "Brightness setting: %s", brightness_err == 0 ? "OK" : "FAILED");
    
    int mirror_err = hls12vga_set_mirror_robust(0x08);
    BSP_LOGI(TAG, "Mirror setting: %s", mirror_err == 0 ? "OK" : "FAILED");
    
    // Step 4: Clear screen and show UI
    hls12vga_clear_screen(false);
    show_default_ui();
    
    state_type = LCD_STATE_ON;
    break;
```

#### **Priority 3: Diagnostic Logging Enhancement**
```c
// Add comprehensive SPI transaction logging
static int hls12vga_transmit_all_with_logging(const struct device *dev, 
                                             const uint8_t *data, size_t size, int retries) {
    BSP_LOGI(TAG, "📡 SPI TX: [0x%02X 0x%02X 0x%02X] (%zu bytes)", 
             data[0], data[1], data[2], size);
    
    int err = hls12vga_transmit_all(dev, data, size, retries);
    
    if (err != 0) {
        BSP_LOGE(TAG, "🚨 SPI TX FAILED: err=%d, retries=%d", err, retries);
        // Log CS states for debugging
        const hls12vga_config *cfg = dev->config;
        bool left_cs = gpio_pin_get_dt(&cfg->left_cs);
        bool right_cs = gpio_pin_get_dt(&cfg->right_cs);
        BSP_LOGE(TAG, "CS States: LEFT=%d, RIGHT=%d", left_cs, right_cs);
    } else {
        BSP_LOGI(TAG, "✅ SPI TX SUCCESS");
    }
    
    return err;
}
```

#### **Priority 4: Mirror State Monitoring**
```c
// Add mirror state tracking and verification
static uint8_t current_mirror_state = 0xFF;  // Invalid initial state

void hls12vga_monitor_mirror_state(void) {
    // Called periodically or after display operations
    if (current_mirror_state != 0x08) {
        BSP_LOGW(TAG, "⚠️ Mirror state mismatch! Expected: 0x08, Current: 0x%02X", 
                 current_mirror_state);
        
        // Attempt to restore correct mirror setting
        int err = hls12vga_set_mirror_robust(0x08);
        if (err == 0) {
            BSP_LOGI(TAG, "🔧 Mirror state restored successfully");
            current_mirror_state = 0x08;
        }
    }
}
```

### 🧪 **Testing & Validation Plan**

#### **Test Cases**
1. **Power Cycle Test**: 50x power on/off cycles with mirror verification
2. **SPI Stress Test**: Continuous mirror setting under high SPI load  
3. **Timing Variation Test**: Different delays between power-on and configuration
4. **Dual Display Test**: Verify both left/right projectors have consistent mirror settings

#### **Success Metrics**
- **Target**: 0% mirror state failures over 100 power cycles
- **SPI Reliability**: 100% successful mirror setting transmission
- **Recovery**: Automatic detection and correction of mirror state issues
- **Logging**: Clear diagnostic information for any failures

### 📊 **Monitoring Implementation**

#### **Add to LVGL Display Thread**
```c
// In lvgl_display_thread() main loop
static uint32_t mirror_check_counter = 0;

while (1) {
    // ... existing message processing ...
    
    // Periodic mirror state verification (every 10 seconds)
    if (++mirror_check_counter >= (10000 / LVGL_TICK_MS)) {
        hls12vga_monitor_mirror_state();
        mirror_check_counter = 0;
    }
}
```

#### **Enhanced Status Reporting**
```c
// Add to FPS timer callback
static void fps_timer_cb(struct k_timer *timer_id) {
    uint32_t fps = frame_count;
    frame_count = 0;
    
    // Enhanced status with mirror state
    BSP_LOGI(TAG, "LVGL FPS: %d | Mirror: 0x%02X | Display: %s", 
             fps, current_mirror_state, get_display_onoff() ? "ON" : "OFF");
}
```

### 🎯 **Implementation Priority**

#### **Phase 1 (Immediate)**
1. ✅ Add robust mirror setting function with retry logic
2. ✅ Enhance initialization timing with proper delays
3. ✅ Add comprehensive SPI transaction logging

#### **Phase 2 (Short-term)**  
1. 🔄 Implement mirror state monitoring and auto-recovery
2. 🔄 Add periodic verification in LVGL thread
3. 🔄 Enhanced diagnostic reporting

#### **Phase 3 (Long-term)**
1. 🚀 Investigate HLS12VGA register read capability for verification
2. 🚀 Implement configuration backup/restore mechanism
3. 🚀 Add advanced SPI error recovery strategies

---

**Status**: Investigation complete - Multiple potential root causes identified  
**Next Action**: Implement Phase 1 robust mirror setting with enhanced logging  
**Target**: Eliminate intermittent mirror state issues through improved initialization reliability
