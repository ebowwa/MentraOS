# 📍 Positioned Text Implementation Plan for MentraOS NExFirmware

## 🎯 Objective
Implement positioned text display with font size control while preserving existing scrolling functionality for the welcome screen and container-based text processing.

## 📋 Current System Analysis

### Display Structure
- **Total Screen**: 640x480 pixels
- **Welcome Text**: Horizontally scrolling at center
- **Protobuf Container**: 600x440 px at position (20,20)
- **Available Fonts**: 12, 14, 16, 18, 24, 30, 48pt (Montserrat family)

### Current Functionality
1. **Welcome Screen**: Horizontal scrolling "Welcome to MentraOS NExFirmware!"
2. **Container Screen**: Scrollable text area for protobuf messages
3. **Screen Switching**: Between welcome animation and text container

## 🏗️ Implementation Design

### **Phase 1: Text Positioning System**

#### 1.1 Enhanced Display Message Structure
```c
// Enhanced message structure in display_manager.h
typedef struct {
    char text[256];          // Increased for longer messages
    uint16_t x;             // X position (0-600 within usable area)
    uint16_t y;             // Y position (0-440 within usable area)
    uint32_t color;         // RGB888 color
    uint16_t font_code;     // Font size code (12,14,16,18,24,30,48)
    uint8_t screen_mode;    // 0=welcome, 1=positioned, 2=container
    bool clear_previous;    // Clear previous text before displaying
} positioned_text_t;
```

#### 1.2 Coordinate System Mapping
```c
// Convert user coordinates (0,0) to screen coordinates within 600x440 area
typedef struct {
    uint16_t screen_x;  // Actual screen X (20 + user_x)
    uint16_t screen_y;  // Actual screen Y (20 + user_y)
    bool valid;         // Within bounds check
} screen_coords_t;

screen_coords_t map_user_to_screen_coords(uint16_t user_x, uint16_t user_y) {
    screen_coords_t coords;
    coords.screen_x = 20 + user_x;  // Add 20px margin offset
    coords.screen_y = 20 + user_y;  // Add 20px margin offset
    coords.valid = (user_x <= 600 && user_y <= 440);  // Bounds check
    return coords;
}
```

### **Phase 2: Screen Mode Management**

#### 2.1 Screen State Enum
```c
typedef enum {
    SCREEN_MODE_WELCOME,     // Horizontal scrolling welcome text
    SCREEN_MODE_POSITIONED,  // Fixed positioned text labels
    SCREEN_MODE_CONTAINER    // Scrollable text container
} screen_mode_t;

static screen_mode_t current_screen_mode = SCREEN_MODE_WELCOME;
static lv_obj_t *positioned_text_labels[10];  // Array for multiple text labels
static uint8_t active_label_count = 0;
```

#### 2.2 Screen Switching Logic
```c
void switch_to_screen_mode(screen_mode_t mode) {
    // Clear current screen content
    clear_current_screen();
    
    switch(mode) {
        case SCREEN_MODE_WELCOME:
            create_welcome_scrolling_text();
            break;
        case SCREEN_MODE_POSITIONED:
            prepare_positioned_text_screen();
            break;
        case SCREEN_MODE_CONTAINER:
            create_scrolling_text_container();
            break;
    }
    current_screen_mode = mode;
}
```

### **Phase 3: Welcome Screen Enhancement**

#### 3.1 Welcome Text Management
```c
void handle_welcome_screen_text(const positioned_text_t *text_msg) {
    if (current_screen_mode != SCREEN_MODE_WELCOME) {
        switch_to_screen_mode(SCREEN_MODE_WELCOME);
    }
    
    // Clear previous welcome text if requested
    if (text_msg->clear_previous && scrolling_welcome_label) {
        lv_obj_del(scrolling_welcome_label);
        scrolling_welcome_label = NULL;
        lv_anim_del(&welcome_scroll_anim, welcome_scroll_anim_cb);
    }
    
    // Create new positioned text on welcome screen
    create_positioned_welcome_text(text_msg);
}

void create_positioned_welcome_text(const positioned_text_t *text_msg) {
    // Map user coordinates to screen coordinates
    screen_coords_t coords = map_user_to_screen_coords(text_msg->x, text_msg->y);
    if (!coords.valid) {
        LOG_WRN("⚠️ Text position (%d,%d) outside usable area", text_msg->x, text_msg->y);
        return;
    }
    
    // Create new text label
    lv_obj_t *label = lv_label_create(lv_screen_active());
    lv_label_set_text(label, text_msg->text);
    
    // Set position within 600x440 area
    lv_obj_set_pos(label, coords.screen_x, coords.screen_y);
    
    // Set font with fallback to default
    const lv_font_t *font = display_manager_map_font(text_msg->font_code);
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
    
    // Set color
    lv_color_t color = display_manager_convert_color(text_msg->color);
    lv_obj_set_style_text_color(label, color, LV_PART_MAIN);
    
    // Store label reference
    if (active_label_count < 10) {
        positioned_text_labels[active_label_count++] = label;
    }
}
```

### **Phase 4: Font Size Validation & Fallback**

#### 4.1 Enhanced Font Mapping
```c
const lv_font_t *display_manager_map_font_with_fallback(uint16_t font_code) {
    // Available font sizes: 12, 14, 16, 18, 24, 30, 48
    for (int i = 0; i < ARRAY_SIZE(font_map); i++) {
        if (font_map[i].code == font_code) {
            LOG_INF("✅ Font size %u found", font_code);
            return font_map[i].font;
        }
    }
    
    // Fallback to closest available size or default 12pt
    LOG_WRN("⚠️ Font size %u not available, using 12pt default", font_code);
    return &lv_font_montserrat_12;
}
```

#### 4.2 Font Size Optimization
```c
typedef struct {
    uint16_t code;
    const lv_font_t *font;
    const char *description;
} font_info_t;

static const font_info_t available_fonts[] = {
    {12, &lv_font_montserrat_12, "Small text"},
    {14, &lv_font_montserrat_14, "Body text"},
    {16, &lv_font_montserrat_16, "Default size"},
    {18, &lv_font_montserrat_18, "Medium text"},
    {24, &lv_font_montserrat_24, "Large text"},
    {30, &lv_font_montserrat_30, "Title size"},
    {48, &lv_font_montserrat_48, "Display size"}
};

void log_available_fonts(void) {
    LOG_INF("📝 Available font sizes:");
    for (int i = 0; i < ARRAY_SIZE(available_fonts); i++) {
        LOG_INF("  - %upt: %s", available_fonts[i].code, available_fonts[i].description);
    }
}
```

### **Phase 5: Container Screen Preservation**

#### 5.1 Container Mode Switching
```c
void handle_container_screen_text(const char *text_content) {
    // Switch to container mode if not already active
    if (current_screen_mode != SCREEN_MODE_CONTAINER) {
        switch_to_screen_mode(SCREEN_MODE_CONTAINER);
    }
    
    // Use existing protobuf text update function
    display_update_protobuf_text(text_content);
    
    LOG_INF("📱 Container text updated: %.50s%s", 
            text_content, strlen(text_content) > 50 ? "..." : "");
}
```

#### 5.2 Screen State Persistence
```c
static struct {
    screen_mode_t last_mode;
    char last_text[256];
    uint32_t last_update_time;
} screen_state = {
    .last_mode = SCREEN_MODE_WELCOME,
    .last_text = "",
    .last_update_time = 0
};

void save_screen_state(screen_mode_t mode, const char *text) {
    screen_state.last_mode = mode;
    strncpy(screen_state.last_text, text, sizeof(screen_state.last_text) - 1);
    screen_state.last_update_time = k_uptime_get_32();
}
```

### **Phase 6: Text Management Functions**

#### 6.1 Text Clearing Logic
```c
void clear_positioned_text_labels(void) {
    for (int i = 0; i < active_label_count; i++) {
        if (positioned_text_labels[i]) {
            lv_obj_del(positioned_text_labels[i]);
            positioned_text_labels[i] = NULL;
        }
    }
    active_label_count = 0;
    LOG_INF("🧹 Cleared %d positioned text labels", active_label_count);
}

void clear_welcome_scrolling_text(void) {
    if (scrolling_welcome_label) {
        lv_anim_del(&welcome_scroll_anim, welcome_scroll_anim_cb);
        lv_obj_del(scrolling_welcome_label);
        scrolling_welcome_label = NULL;
        LOG_INF("🧹 Cleared welcome scrolling text");
    }
}

void clear_current_screen(void) {
    switch(current_screen_mode) {
        case SCREEN_MODE_WELCOME:
            clear_welcome_scrolling_text();
            break;
        case SCREEN_MODE_POSITIONED:
            clear_positioned_text_labels();
            break;
        case SCREEN_MODE_CONTAINER:
            // Container preserves text - only clear if explicitly requested
            break;
    }
}
```

#### 6.2 API Functions for External Use
```c
// New API functions for positioned text
int display_manager_show_positioned_text(uint16_t x, uint16_t y, 
                                        const char *text, 
                                        uint16_t font_code, 
                                        uint32_t color,
                                        bool clear_previous);

int display_manager_switch_to_welcome_mode(void);
int display_manager_switch_to_container_mode(void);
int display_manager_get_current_mode(void);
```

## 🔧 Implementation Steps

### **Step 1: Enhanced Message Structure** (30 minutes)
1. Update `display_manager.h` with new positioned text structure
2. Add screen mode enum and management functions
3. Update message queue handling

### **Step 2: Coordinate Mapping System** (45 minutes)
1. Implement user-to-screen coordinate mapping
2. Add bounds checking for 600x440 area
3. Add margin offset calculations (20px)

### **Step 3: Screen Mode Management** (60 minutes)
1. Implement screen switching logic
2. Add state preservation between modes
3. Update existing welcome and container functions

### **Step 4: Positioned Text Implementation** (75 minutes)
1. Create positioned text rendering functions
2. Implement text label array management
3. Add clearing and updating logic

### **Step 5: Font System Enhancement** (30 minutes)
1. Add font validation and fallback logic
2. Implement font availability logging
3. Test all font sizes (12-48pt)

### **Step 6: Integration & Testing** (60 minutes)
1. Update protobuf message handlers
2. Test screen switching between modes
3. Verify coordinate mapping accuracy
4. Test font fallback behavior

## 📱 Usage Examples

### Example 1: Simple Positioned Text
```c
// Display "Hello World" at position (100, 50) with 24pt font
display_manager_show_positioned_text(100, 50, "Hello World", 24, 0xFFFFFF, true);
```

### Example 2: Multiple Text Labels
```c
// Title at top
display_manager_show_positioned_text(50, 30, "Live Caption", 30, 0xFFFFFF, true);
// Content below
display_manager_show_positioned_text(50, 100, "Speech recognition text here...", 16, 0xCCCCCC, false);
```

### Example 3: Screen Mode Control
```c
// Switch to positioned text mode
display_manager_switch_to_welcome_mode();
// Add text to welcome screen
display_manager_show_positioned_text(200, 240, "Custom Message", 18, 0x00FF00, true);

// Switch to container mode for scrolling
display_manager_switch_to_container_mode();
```

## 🎨 Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│                     640x480 Total Screen                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                600x440 Usable Area                  │   │
│  │  (0,0)                                   (600,0)   │   │
│  │    ┌─────────────────────────────────┐              │   │
│  │    │  Positioned Text Labels         │              │   │
│  │    │  Font sizes: 12,14,16,18,24,30,48pt            │   │
│  │    │  Colors: RGB888 format         │              │   │
│  │    │  Coordinates: User (0,0)→(600,440)             │   │
│  │    └─────────────────────────────────┘              │   │
│  │                                                     │   │
│  │  Welcome Mode: Horizontal scrolling text           │   │
│  │  Positioned Mode: Fixed positioned labels          │   │
│  │  Container Mode: Scrollable text area              │   │
│  │                                                     │   │
│  │  (0,440)                              (600,440)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## ⚡ Performance Considerations

1. **Maximum 10 positioned text labels** to prevent memory overflow
2. **Font caching** - reuse font objects for same sizes
3. **Coordinate validation** before object creation
4. **Screen clearing optimization** - only clear when switching modes
5. **Memory management** - proper cleanup of LVGL objects

## 🔍 Testing Strategy

### Test Cases
1. **Coordinate bounds**: Test (0,0), (600,440), and out-of-bounds positions
2. **Font sizes**: Test all available sizes (12-48pt) and invalid sizes
3. **Screen switching**: Verify clean transitions between welcome/positioned/container
4. **Memory usage**: Monitor LVGL object creation/deletion
5. **Performance**: Measure text rendering speed with multiple labels

### Expected Results
- **Position accuracy**: Text appears exactly at specified coordinates within 600x440 area
- **Font fallback**: Invalid font sizes default to 12pt gracefully
- **Screen preservation**: Container mode maintains text when switching modes
- **Memory stability**: No memory leaks during screen transitions

This implementation will provide flexible positioned text control while maintaining the existing welcome scrolling and container functionality, with robust coordinate mapping and font management.
