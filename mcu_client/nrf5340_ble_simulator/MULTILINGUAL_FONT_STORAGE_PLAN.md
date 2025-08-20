# 🌍 Multilingual External Font Storage Plan for nRF5340

## 📝 **Overview**

This document outlines the complete architecture for implementing multilingual font support using external NOR flash storage on the nRF5340 platform. The system is designed to handle text in multiple languages (English, Arabic, Chinese, Hebrew, etc.) from LiveCaption protobuf messages.

## 🎯 **Problem Statement**

**Current Constraints:**
- **nRF5340 Flash**: 1MB total
- **Current fonts**: ~500KB (Montserrat 12-48pt)
- **Chinese CJK fonts**: 8-15MB (thousands of characters)
- **Arabic/Hebrew fonts**: 2-5MB (complex script support)
- **Total needed**: 20-25MB for full multilingual support

**Challenge:** LiveCaption protobuf messages contain text in any language based on what the app hears, requiring comprehensive Unicode support.

## 💡 **Solution: External NOR Flash Storage**

Use external 8MB NOR flash to store multilingual fonts with intelligent caching and language detection.

---

## 🔧 **Implementation Plan**

### **Phase 1: Hardware Setup - External NOR Flash**

#### **1.1 Add NOR Flash Device Tree Configuration**

Create `external_flash.overlay`:

```dts
&pinctrl {
    qspi_default: qspi_default {
        group1 {
            psels = <NRF_PSEL(QSPI_SCK, 0, 17)>,
                    <NRF_PSEL(QSPI_IO0, 0, 18)>,
                    <NRF_PSEL(QSPI_IO1, 0, 19)>,
                    <NRF_PSEL(QSPI_IO2, 0, 20)>,
                    <NRF_PSEL(QSPI_IO3, 0, 21)>,
                    <NRF_PSEL(QSPI_CSN, 0, 22)>;
        };
    };
    
    qspi_sleep: qspi_sleep {
        group1 {
            psels = <NRF_PSEL(QSPI_SCK, 0, 17)>,
                    <NRF_PSEL(QSPI_IO0, 0, 18)>,
                    <NRF_PSEL(QSPI_IO1, 0, 19)>,
                    <NRF_PSEL(QSPI_IO2, 0, 20)>,
                    <NRF_PSEL(QSPI_IO3, 0, 21)>,
                    <NRF_PSEL(QSPI_CSN, 0, 22)>;
            low-power-enable;
        };
    };
};

&qspi {
    status = "okay";
    pinctrl-0 = <&qspi_default>;
    pinctrl-1 = <&qspi_sleep>;
    pinctrl-names = "default", "sleep";
    
    external_flash: mx25r6435f@0 {
        compatible = "nordic,qspi-nor";
        reg = <0>;
        spi-max-frequency = <8000000>;  /* 8MHz for stability */
        
        jedec-id = [c2 28 17];  /* MX25R6435F 8MB NOR Flash */
        sfdp-bfp = [
            e5 20 f1 ff  ff ff ff 03  44 eb 08 6b  08 3b 04 bb
            ee ff ff ff  ff ff 00 ff  ff ff 00 ff  0c 20 0f 52
            10 d8 00 ff  23 72 f5 00  82 ed 04 cc  44 83 68 44
            30 b0 30 b0  f7 c4 d5 5c  00 be 29 ff  f0 d0 ff ff
        ];
        
        size = <67108864>;  /* 64MB (8MB x 8) */
        has-dpd;
        t-enter-dpd = <10000>;
        t-exit-dpd = <35000>;
    };
};
```

#### **1.2 Update Project Configuration**

Add to `prj.conf`:

```properties
# External NOR Flash Support
CONFIG_FLASH=y
CONFIG_FLASH_PAGE_LAYOUT=y
CONFIG_FLASH_MAP=y
CONFIG_NORDIC_QSPI_NOR=y
CONFIG_NORDIC_QSPI_NOR_FLASH_LAYOUT_PAGE_SIZE=4096

# File System Support for Fonts
CONFIG_FILE_SYSTEM=y
CONFIG_FILE_SYSTEM_LITTLEFS=y
CONFIG_FS_LITTLEFS_FC_HEAP_SIZE=4096

# External Storage for Fonts
CONFIG_DISK_ACCESS=y
CONFIG_DISK_ACCESS_FLASH=y
```

---

### **Phase 2: Font Storage Architecture**

#### **2.1 Font File Structure on External Flash**

```
/fonts/
├── latin/
│   ├── montserrat_16.fnt
│   ├── montserrat_24.fnt
│   └── montserrat_48.fnt
├── chinese/
│   ├── simsun_common_2000.fnt      # Top 2000 Chinese chars
│   ├── simsun_extended_3000.fnt    # Additional 3000 chars
│   └── traditional_1000.fnt        # Traditional Chinese
├── arabic/
│   ├── noto_arabic_16.fnt
│   ├── noto_arabic_24.fnt
│   └── arabic_complex.fnt          # Complex script support
├── hebrew/
│   ├── david_16.fnt
│   └── david_24.fnt
└── emoji/
    └── noto_emoji_16.fnt
```

#### **2.2 Font Manager with External Storage**

Create `src/font_manager_external.c`:

```c
#include <zephyr/fs/fs.h>
#include <zephyr/storage/flash_map.h>

#define FONT_STORAGE_PARTITION_ID FIXED_PARTITION_ID(external_font_storage)
#define MAX_FONT_CACHE_SIZE (128 * 1024)  // 128KB RAM cache

typedef struct {
    char language[8];        // "en", "zh", "ar", "he", etc.
    uint16_t size;          // Font size (16, 24, 48)
    char filename[32];      // Font file path
    uint32_t flash_offset;  // Offset in external flash
    uint32_t file_size;     // Font file size
    bool cached;            // Is font loaded in RAM cache?
    lv_font_t *lvgl_font;   // LVGL font object
} font_descriptor_t;

typedef struct {
    uint32_t magic;         // 0xF0A7DA7A
    uint16_t version;       // Font table version
    uint16_t count;         // Number of fonts
    font_descriptor_t fonts[];
} font_table_t;

static font_table_t *font_table = NULL;
static uint8_t font_cache[MAX_FONT_CACHE_SIZE];
static struct fs_mount_t littlefs_mount = {
    .type = FS_LITTLEFS,
    .fs_data = &littlefs_mount,
    .storage_dev = (void *)FONT_STORAGE_PARTITION_ID,
    .mnt_point = "/fonts",
};

int font_manager_init(void)
{
    int err;
    
    // Mount external flash filesystem
    err = fs_mount(&littlefs_mount);
    if (err) {
        LOG_ERR("Failed to mount font filesystem: %d", err);
        return err;
    }
    
    // Load font table from external flash
    struct fs_file_t file;
    fs_file_t_init(&file);
    
    err = fs_open(&file, "/fonts/font_table.bin", FS_O_READ);
    if (err) {
        LOG_ERR("Failed to open font table: %d", err);
        return err;
    }
    
    // Read font table header
    font_table_t header;
    ssize_t bytes_read = fs_read(&file, &header, sizeof(header));
    if (bytes_read != sizeof(header) || header.magic != 0xF0A7DA7A) {
        LOG_ERR("Invalid font table");
        fs_close(&file);
        return -EINVAL;
    }
    
    // Allocate and read full font table
    size_t table_size = sizeof(font_table_t) + 
                       (header.count * sizeof(font_descriptor_t));
    font_table = k_malloc(table_size);
    if (!font_table) {
        LOG_ERR("Failed to allocate font table memory");
        fs_close(&file);
        return -ENOMEM;
    }
    
    fs_seek(&file, 0, FS_SEEK_SET);
    bytes_read = fs_read(&file, font_table, table_size);
    fs_close(&file);
    
    if (bytes_read != table_size) {
        LOG_ERR("Failed to read font table");
        k_free(font_table);
        return -EIO;
    }
    
    LOG_INF("🎨 Font manager initialized: %d fonts available", 
            font_table->count);
    return 0;
}

const lv_font_t *font_manager_get_font(const char *language, uint16_t size)
{
    if (!font_table) {
        return &lv_font_montserrat_16;  // Fallback
    }
    
    // Search for matching font
    for (int i = 0; i < font_table->count; i++) {
        font_descriptor_t *font = &font_table->fonts[i];
        
        if (strcmp(font->language, language) == 0 && font->size == size) {
            // Check if font is already cached
            if (font->cached && font->lvgl_font) {
                return font->lvgl_font;
            }
            
            // Load font from external flash
            return load_font_from_flash(font);
        }
    }
    
    // Fallback to Latin font of requested size
    return font_manager_get_font("latin", size);
}

static const lv_font_t *load_font_from_flash(font_descriptor_t *font)
{
    struct fs_file_t file;
    fs_file_t_init(&file);
    
    char full_path[64];
    snprintf(full_path, sizeof(full_path), "/fonts/%s", font->filename);
    
    int err = fs_open(&file, full_path, FS_O_READ);
    if (err) {
        LOG_ERR("Failed to open font file: %s", full_path);
        return &lv_font_montserrat_16;
    }
    
    // Check if we have space in cache
    if (font->file_size > MAX_FONT_CACHE_SIZE) {
        LOG_WRN("Font too large for cache: %s (%u bytes)", 
                font->filename, font->file_size);
        fs_close(&file);
        return &lv_font_montserrat_16;
    }
    
    // Read font data into cache
    ssize_t bytes_read = fs_read(&file, font_cache, font->file_size);
    fs_close(&file);
    
    if (bytes_read != font->file_size) {
        LOG_ERR("Failed to read font data: %s", font->filename);
        return &lv_font_montserrat_16;
    }
    
    // Parse LVGL font format and create font object
    font->lvgl_font = parse_lvgl_font(font_cache, font->file_size);
    if (font->lvgl_font) {
        font->cached = true;
        LOG_INF("🎯 Loaded font: %s (%s, %upt)", 
                font->filename, font->language, font->size);
    }
    
    return font->lvgl_font ? font->lvgl_font : &lv_font_montserrat_16;
}
```

---

### **Phase 3: Smart Language Detection & Font Selection**

#### **3.1 Unicode Range-Based Language Detection**

```c
typedef enum {
    LANG_LATIN = 0,     // English, European
    LANG_CHINESE,       // Chinese (Simplified/Traditional)
    LANG_ARABIC,        // Arabic
    LANG_HEBREW,        // Hebrew
    LANG_EMOJI,         // Emoji/Symbols
    LANG_UNKNOWN
} language_t;

language_t detect_text_language(const char *utf8_text)
{
    uint32_t chinese_chars = 0;
    uint32_t arabic_chars = 0;
    uint32_t hebrew_chars = 0;
    uint32_t latin_chars = 0;
    uint32_t total_chars = 0;
    
    const char *p = utf8_text;
    while (*p) {
        uint32_t codepoint;
        int bytes = utf8_to_codepoint(p, &codepoint);
        if (bytes <= 0) break;
        
        total_chars++;
        
        // Classify character by Unicode range
        if (codepoint >= 0x4E00 && codepoint <= 0x9FFF) {
            chinese_chars++;  // CJK Unified Ideographs
        } else if (codepoint >= 0x0600 && codepoint <= 0x06FF) {
            arabic_chars++;   // Arabic block
        } else if (codepoint >= 0x0590 && codepoint <= 0x05FF) {
            hebrew_chars++;   // Hebrew block
        } else if (codepoint <= 0x024F) {
            latin_chars++;    // Latin blocks
        }
        
        p += bytes;
    }
    
    if (total_chars == 0) return LANG_LATIN;
    
    // Determine primary language (>30% threshold)
    float chinese_ratio = (float)chinese_chars / total_chars;
    float arabic_ratio = (float)arabic_chars / total_chars;
    float hebrew_ratio = (float)hebrew_chars / total_chars;
    
    if (chinese_ratio > 0.3) return LANG_CHINESE;
    if (arabic_ratio > 0.3) return LANG_ARABIC;
    if (hebrew_ratio > 0.3) return LANG_HEBREW;
    
    return LANG_LATIN;  // Default to Latin
}
```

#### **3.2 Enhanced Display Manager with Language Support**

```c
int display_manager_show_multilingual_text(const char *utf8_text, 
                                          uint16_t font_size,
                                          uint32_t x, uint32_t y)
{
    // Detect primary language
    language_t lang = detect_text_language(utf8_text);
    
    const char *lang_code;
    switch (lang) {
        case LANG_CHINESE: lang_code = "zh"; break;
        case LANG_ARABIC:  lang_code = "ar"; break;
        case LANG_HEBREW:  lang_code = "he"; break;
        default:           lang_code = "latin"; break;
    }
    
    // Get appropriate font
    const lv_font_t *font = font_manager_get_font(lang_code, font_size);
    
    // Create LVGL label with correct font
    lv_obj_t *label = lv_label_create(lv_screen_active());
    lv_label_set_text(label, utf8_text);
    lv_obj_set_style_text_font(label, font, 0);
    lv_obj_set_pos(label, x, y);
    
    // Handle RTL languages (Arabic, Hebrew)
    if (lang == LANG_ARABIC || lang == LANG_HEBREW) {
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_RIGHT, 0);
        lv_obj_set_style_base_dir(label, LV_BASE_DIR_RTL, 0);
    }
    
    LOG_INF("📝 Displayed %s text: %.30s%s", 
            lang_code, utf8_text, strlen(utf8_text) > 30 ? "..." : "");
    
    return 0;
}
```

---

### **Phase 4: Font Generation & Deployment Tools**

#### **4.1 Font Subset Generation Script**

```python
# tools/generate_font_subsets.py
import os
import subprocess
from collections import Counter

def generate_chinese_subset():
    """Generate Chinese font with most common 2000 characters"""
    common_chars = load_common_chinese_chars("data/chinese_frequency.txt", 2000)
    
    # Use LVGL font converter
    cmd = [
        "lv_font_conv",
        "--font", "fonts/SimSun.ttf",
        "--size", "16",
        "--range", chars_to_range(common_chars),
        "--format", "lvgl",
        "--output", "fonts/chinese/simsun_common_2000.c"
    ]
    subprocess.run(cmd)

def generate_arabic_font():
    """Generate Arabic font with proper complex script support"""
    cmd = [
        "lv_font_conv", 
        "--font", "fonts/NotoSansArabic-Regular.ttf",
        "--size", "16",
        "--range", "0x0600-0x06FF,0x0750-0x077F",  # Arabic blocks
        "--format", "lvgl",
        "--bpp", "4",  # 4-bit for better Arabic rendering
        "--output", "fonts/arabic/noto_arabic_16.c"
    ]
    subprocess.run(cmd)

def load_common_chinese_chars(filename, count):
    """Load most common Chinese characters from frequency file"""
    with open(filename, 'r', encoding='utf-8') as f:
        chars = []
        for i, line in enumerate(f):
            if i >= count:
                break
            char = line.strip().split()[0]
            chars.append(char)
    return chars

def chars_to_range(chars):
    """Convert character list to Unicode range string"""
    codepoints = [ord(char) for char in chars]
    return ','.join([f"0x{cp:04X}" for cp in codepoints])

if __name__ == "__main__":
    generate_chinese_subset()
    generate_arabic_font()
    print("✅ Font subsets generated successfully")
```

#### **4.2 Font Packaging Tool**

```bash
# tools/package_fonts.sh
#!/bin/bash

echo "🔧 Generating font subsets..."

# Generate Chinese fonts
python3 tools/generate_font_subsets.py

# Generate Arabic fonts
lv_font_conv \
  --font fonts/NotoSansArabic-Regular.ttf \
  --size 16 \
  --range 0x0600-0x06FF,0x0750-0x077F \
  --format lvgl \
  --bpp 4 \
  --output fonts/arabic/noto_arabic_16.c

# Generate Hebrew fonts
lv_font_conv \
  --font fonts/David-Regular.ttf \
  --size 16 \
  --range 0x0590-0x05FF \
  --format lvgl \
  --output fonts/hebrew/david_16.c

echo "📦 Creating font table binary..."

# Generate font table binary
python3 tools/create_font_table.py \
  --output fonts/font_table.bin \
  --fonts fonts/*/

echo "🗃️ Creating LittleFS filesystem image..."

# Create LittleFS image with all fonts
mkdir -p build/font_filesystem
cp -r fonts/* build/font_filesystem/

# Generate filesystem image
mklittlefs \
  -c build/font_filesystem \
  -s 0x800000 \
  -p 4096 \
  -b 4096 \
  build/font_storage.bin

echo "✅ Font filesystem created: build/font_storage.bin"
echo "📊 Font storage size: $(ls -lh build/font_storage.bin | awk '{print $5}')"
```

---

### **Phase 5: Memory Optimization Strategies**

#### **5.1 Intelligent Caching (LRU - Least Recently Used)**

```c
#define FONT_CACHE_SLOTS 3  // Cache 3 fonts simultaneously

typedef struct {
    language_t language;
    uint16_t size;
    lv_font_t *font;
    uint32_t last_used;
    bool dirty;
} font_cache_slot_t;

static font_cache_slot_t font_cache_slots[FONT_CACHE_SLOTS];

static lv_font_t *get_cached_font_lru(language_t lang, uint16_t size)
{
    uint32_t current_time = k_uptime_get_32();
    
    // Check if font is already cached
    for (int i = 0; i < FONT_CACHE_SLOTS; i++) {
        if (font_cache_slots[i].language == lang && 
            font_cache_slots[i].size == size) {
            font_cache_slots[i].last_used = current_time;
            return font_cache_slots[i].font;
        }
    }
    
    // Find least recently used slot
    int lru_slot = 0;
    uint32_t oldest_time = font_cache_slots[0].last_used;
    
    for (int i = 1; i < FONT_CACHE_SLOTS; i++) {
        if (font_cache_slots[i].last_used < oldest_time) {
            oldest_time = font_cache_slots[i].last_used;
            lru_slot = i;
        }
    }
    
    // Evict old font and load new one
    if (font_cache_slots[lru_slot].font) {
        unload_font(font_cache_slots[lru_slot].font);
    }
    
    font_cache_slots[lru_slot].language = lang;
    font_cache_slots[lru_slot].size = size;
    font_cache_slots[lru_slot].font = load_font_from_flash(lang, size);
    font_cache_slots[lru_slot].last_used = current_time;
    
    return font_cache_slots[lru_slot].font;
}
```

#### **5.2 Character Frequency-Based Font Subsets**

```c
// Character frequency data for optimized font subsets
typedef struct {
    uint32_t codepoint;
    float frequency;     // 0.0 to 1.0
    bool included;       // Is this character in current subset?
} char_frequency_t;

// Top 2000 most common Chinese characters (covers 98% of usage)
static const char_frequency_t chinese_common_chars[] = {
    {0x7684, 0.0271},  // 的 (most common Chinese character)
    {0x4E00, 0.0178},  // 一 
    {0x662F, 0.0154},  // 是
    {0x4E86, 0.0148},  // 了
    // ... continue with frequency data
};

// Load optimized character subset based on usage frequency
static int load_optimized_chinese_subset(uint16_t max_chars)
{
    int loaded = 0;
    
    for (int i = 0; i < ARRAY_SIZE(chinese_common_chars) && loaded < max_chars; i++) {
        if (chinese_common_chars[i].frequency > 0.0001) {  // 0.01% threshold
            // Include this character in subset
            loaded++;
        }
    }
    
    LOG_INF("📊 Loaded Chinese subset: %d chars (covers %.1f%% of usage)", 
            loaded, calculate_coverage(loaded) * 100);
    
    return loaded;
}
```

---

## 🚀 **Deployment Strategy**

### **Step 1: Hardware Integration**
1. **Add MX25R6435F 8MB NOR Flash** to your hardware design
2. **Connect via QSPI** (6 pins total: SCK, IO0-IO3, CSN)
3. **Update device tree** with external flash configuration
4. **Verify electrical connections** and power supply (3.3V)

### **Step 2: Font Assets Preparation**
1. **Generate subset fonts** for common characters in each language
2. **Create frequency analysis** from LiveCaption usage data
3. **Package fonts** into LittleFS filesystem image
4. **Flash filesystem image** to external NOR flash via programming interface

### **Step 3: Software Integration**
1. **Add external flash drivers** to Zephyr project configuration
2. **Implement font manager** with LRU caching system
3. **Update display manager** to use automatic language detection
4. **Test with multilingual protobuf messages** from LiveCaption

### **Step 4: Optimization & Tuning**
1. **Character Frequency Analysis**: Use real LiveCaption data to optimize character subsets
2. **Font Compression**: Implement compression for rarely used characters
3. **Streaming Fonts**: Load character bitmaps on-demand for very large fonts
4. **Performance Profiling**: Measure font loading times and optimize cache policy

---

## 📊 **Memory Footprint Estimation**

| Component | Current | With External Fonts | Change |
|-----------|---------|-------------------|---------|
| **Internal Flash** | 500KB fonts | 200KB (reduced) | **-300KB** |
| **External Flash** | 0MB | 8MB (multilingual) | **+8MB** |
| **RAM Cache** | 0KB | 128KB (active fonts) | **+128KB** |
| **Code Overhead** | 0KB | 50KB (font manager) | **+50KB** |
| **Total System Impact** | — | — | **+178KB RAM, -250KB internal flash** |

## 🎯 **Expected Benefits**

### **Language Support**
- ✅ **Full Unicode Coverage**: Support for all languages LiveCaption can detect
- ✅ **Automatic Detection**: Smart language detection from text content
- ✅ **RTL Support**: Proper right-to-left rendering for Arabic and Hebrew
- ✅ **Complex Scripts**: Support for Arabic ligatures and Chinese character variants

### **Performance**
- ⚡ **Fast Font Switching**: LRU cache keeps frequently used fonts in RAM
- 🔄 **Streaming Loading**: Load fonts on-demand to minimize memory usage
- 📊 **Optimized Subsets**: Character frequency analysis reduces font sizes by 80-90%
- 🎯 **Responsive UI**: Font caching prevents display delays during language switches

### **Scalability**
- 📈 **Future-Proof**: Easy addition of new languages and fonts
- 🔧 **Configurable**: Adjustable cache sizes and character subsets
- 📦 **Modular**: Independent font packages for different language combinations
- 🌍 **Global Ready**: Support for all major world languages and scripts

---

## 🔍 **Technical Considerations**

### **Hardware Requirements**
- **External NOR Flash**: MX25R6435F (8MB) or similar QSPI-compatible device
- **Additional PCB Area**: ~5x5mm for flash IC + decoupling
- **Power Consumption**: +2-5mA during font loading operations
- **Pin Usage**: 6 additional GPIO pins for QSPI interface

### **Software Dependencies**
- **Zephyr QSPI Driver**: Nordic nRF QSPI NOR support
- **LittleFS**: Filesystem for font organization and management
- **LVGL Font Support**: Compatible with LVGL 8.x font format
- **UTF-8 Processing**: Unicode text parsing and character classification

### **Development Tools**
- **LVGL Font Converter**: Generate fonts from TTF/OTF sources
- **LittleFS Tools**: Create filesystem images for external flash
- **Python Scripts**: Character frequency analysis and subset generation
- **Flash Programming**: Nordic nRF Connect tools for external flash

---

## 📝 **Next Steps for Implementation**

### **Immediate Actions (Week 1)**
1. **Order Hardware**: MX25R6435F NOR flash ICs
2. **PCB Modification**: Add external flash to hardware design
3. **Device Tree Setup**: Create QSPI overlay configuration
4. **Basic Driver Test**: Verify external flash communication

### **Development Phase (Week 2-3)**
1. **Font Manager Implementation**: Core external font loading system
2. **Language Detection**: Unicode range-based text classification
3. **LVGL Integration**: Seamless font switching in display pipeline
4. **Memory Management**: LRU caching and font eviction policies

### **Asset Preparation (Week 3-4)**
1. **Font Subset Generation**: Create optimized character sets for each language
2. **Filesystem Creation**: Package fonts into LittleFS images
3. **Character Frequency Analysis**: Optimize subsets based on real usage data
4. **Testing Assets**: Multilingual test strings for validation

### **Integration & Testing (Week 4-5)**
1. **Protobuf Integration**: Connect to LiveCaption message processing
2. **Performance Testing**: Measure font loading times and memory usage
3. **Language Coverage Testing**: Verify support for all target languages
4. **User Experience Testing**: Ensure smooth language transitions

---

## 🎓 **Learning Resources**

### **LVGL Font System**
- [LVGL Font Documentation](https://docs.lvgl.io/master/overview/font.html)
- [LVGL Font Converter Tool](https://lvgl.io/tools/fontconverter)
- [Custom Font Integration Guide](https://github.com/lvgl/lvgl/blob/master/docs/overview/font.md)

### **Zephyr External Storage**
- [Zephyr Flash Map Documentation](https://docs.zephyrproject.org/latest/services/storage/flash_map/flash_map.html)
- [LittleFS on Zephyr](https://docs.zephyrproject.org/latest/services/storage/flash_filesystems/index.html)
- [Nordic QSPI NOR Driver](https://docs.zephyrproject.org/latest/build/dts/api/bindings/flash_controller/nordic,nrf-qspi-nor.html)

### **Unicode & Internationalization**
- [Unicode Character Database](https://www.unicode.org/ucd/)
- [Unicode Blocks and Scripts](https://www.unicode.org/standard/supported.html)
- [UTF-8 Encoding Reference](https://en.wikipedia.org/wiki/UTF-8)

---

**Document Version**: 1.0  
**Last Updated**: August 20, 2025  
**Author**: MentraOS Development Team  
**Status**: Planning Phase - Ready for Implementation
