/*
 * XIP Font Definitions for nRF5340 BLE Simulator
 * 
 * This header provides access to PuHui fonts stored in external flash
 * using XIP (Execute In Place) for memory optimization.
 *
 * Fonts are placed in external QSPI flash to save internal FLASH memory.
 * Total FLASH savings: ~85KB+ (MONTSERRAT + SIMSUN fonts replaced)
 */

#ifndef XIP_FONTS_H
#define XIP_FONTS_H

#ifdef __cplusplus
extern "C" {
#endif

#include "lvgl.h"

/* XIP External Flash Fonts - Chinese + English Support */
extern const lv_font_t font_puhui_12_essential;  /* 12pt: Small text, UI elements */
extern const lv_font_t font_puhui_14_essential;  /* 14pt: Body text, default size */
extern const lv_font_t font_puhui_16_essential;  /* 16pt: Headings, emphasis */

/*
 * Font Size Mapping for Display Manager
 * Maps font size codes to XIP font pointers
 */
typedef struct {
    uint16_t size;
    const lv_font_t *font;
    const char *description;
} xip_font_map_t;

/* Available XIP Font Sizes */
static const xip_font_map_t xip_fonts[] = {
    {12, &font_puhui_12_essential, "Small text (XIP)"},
    {14, &font_puhui_14_essential, "Body text (XIP)"},
    {16, &font_puhui_16_essential, "Headers (XIP)"},
};

#define XIP_FONT_COUNT (sizeof(xip_fonts) / sizeof(xip_font_map_t))

/*
 * Get XIP font by size
 * @param size Font size (12, 14, 16)
 * @return Font pointer or NULL if not found
 */
static inline const lv_font_t* xip_get_font_by_size(uint16_t size) {
    for (int i = 0; i < XIP_FONT_COUNT; i++) {
        if (xip_fonts[i].size == size) {
            return xip_fonts[i].font;
        }
    }
    return &font_puhui_14_essential; /* Default fallback */
}

/* Convenience macros for common font sizes */
#define XIP_FONT_SMALL  (&font_puhui_12_essential)
#define XIP_FONT_NORMAL (&font_puhui_14_essential)  
#define XIP_FONT_LARGE  (&font_puhui_16_essential)

#ifdef __cplusplus
}
#endif

#endif /* XIP_FONTS_H */