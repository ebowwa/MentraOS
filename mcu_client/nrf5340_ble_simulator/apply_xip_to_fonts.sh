#!/bin/bash
# Apply XIP attributes to font files

for font_file in src/fonts/*.c; do
    echo "Processing $font_file..."
    
    # Add XIP attribute to all static const arrays
    sed -i.bak 's/static const uint8_t glyph_bitmap\[\] = {/__attribute__((section(".extflash_text"))) static const uint8_t glyph_bitmap[] = {/g' "$font_file"
    sed -i.bak 's/static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc\[\] = {/__attribute__((section(".extflash_text"))) static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {/g' "$font_file"
    sed -i.bak 's/static const uint16_t unicode_list\[\] = {/__attribute__((section(".extflash_text"))) static const uint16_t unicode_list[] = {/g' "$font_file"
    sed -i.bak 's/static const lv_font_fmt_txt_cmap_t cmaps\[\] = {/__attribute__((section(".extflash_text"))) static const lv_font_fmt_txt_cmap_t cmaps[] = {/g' "$font_file"
    sed -i.bak 's/static const lv_font_fmt_txt_dsc_t font_dsc = {/__attribute__((section(".extflash_text"))) static const lv_font_fmt_txt_dsc_t font_dsc = {/g' "$font_file"
    sed -i.bak 's/^const lv_font_t font_puhui/__attribute__((section(".extflash_text"))) const lv_font_t font_puhui/g' "$font_file"
    
    # Clean up backup files
    rm -f "$font_file.bak"
done

echo "XIP attributes applied to all font files!"
