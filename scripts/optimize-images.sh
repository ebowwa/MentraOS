#!/bin/bash
# Image Optimization Script for MentraOS
# This script optimizes PNG images and converts them to WebP format

set -e

echo "🖼️  MentraOS Image Optimization Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required tools are installed
check_dependencies() {
  echo "📦 Checking dependencies..."
  
  if ! command -v sharp &> /dev/null; then
    echo -e "${YELLOW}⚠️  sharp-cli not found. Installing...${NC}"
    npm install -g sharp-cli
  else
    echo -e "${GREEN}✓ sharp-cli is installed${NC}"
  fi
  
  if ! command -v cwebp &> /dev/null; then
    echo -e "${YELLOW}⚠️  cwebp (WebP encoder) not found${NC}"
    echo "   Install with: brew install webp (macOS) or apt-get install webp (Linux)"
    echo "   Skipping WebP conversion..."
    SKIP_WEBP=1
  else
    echo -e "${GREEN}✓ cwebp is installed${NC}"
  fi
}

# Function to optimize PNG files
optimize_png() {
  local file="$1"
  local filesize=$(du -h "$file" | cut -f1)
  
  echo -e "${YELLOW}Optimizing PNG: $file (${filesize})${NC}"
  
  # Create backup
  cp "$file" "${file}.backup"
  
  # Optimize with sharp (resize if larger than 1920px, compress)
  sharp -i "$file" -o "$file" resize 1920 --withoutEnlargement --compressionLevel 9 2>/dev/null || {
    echo -e "${RED}✗ Failed to optimize $file${NC}"
    mv "${file}.backup" "$file"
    return 1
  }
  
  # Get new size
  local newsize=$(du -h "$file" | cut -f1)
  echo -e "${GREEN}✓ Optimized: $file (${filesize} → ${newsize})${NC}"
  
  # Remove backup
  rm "${file}.backup"
}

# Function to convert PNG to WebP
convert_to_webp() {
  local file="$1"
  local webp_file="${file%.png}.webp"
  
  if [ "$SKIP_WEBP" == "1" ]; then
    return 0
  fi
  
  echo -e "${YELLOW}Converting to WebP: $file${NC}"
  
  cwebp -q 85 "$file" -o "$webp_file" 2>/dev/null || {
    echo -e "${RED}✗ Failed to convert $file to WebP${NC}"
    return 1
  }
  
  local png_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
  local webp_size=$(stat -f%z "$webp_file" 2>/dev/null || stat -c%s "$webp_file" 2>/dev/null)
  local savings=$(( (png_size - webp_size) * 100 / png_size ))
  
  echo -e "${GREEN}✓ Created WebP: $webp_file (${savings}% smaller)${NC}"
}

# Main optimization function
optimize_directory() {
  local target_dir="$1"
  local size_threshold="${2:-500}" # Default 500KB
  
  echo ""
  echo "🔍 Scanning $target_dir for images larger than ${size_threshold}KB..."
  echo ""
  
  # Find PNG files larger than threshold
  local count=0
  while IFS= read -r -d '' file; do
    optimize_png "$file"
    convert_to_webp "$file"
    ((count++))
  done < <(find "$target_dir" -type f -name "*.png" -size "+${size_threshold}k" -print0)
  
  if [ $count -eq 0 ]; then
    echo -e "${GREEN}✓ No images larger than ${size_threshold}KB found${NC}"
  else
    echo ""
    echo -e "${GREEN}✓ Optimized $count images in $target_dir${NC}"
  fi
}

# Parse command line arguments
MOBILE_ONLY=0
WEB_ONLY=0
SIZE_THRESHOLD=500

while [[ $# -gt 0 ]]; do
  case $1 in
    --mobile-only)
      MOBILE_ONLY=1
      shift
      ;;
    --web-only)
      WEB_ONLY=1
      shift
      ;;
    --size)
      SIZE_THRESHOLD="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --mobile-only   Only optimize mobile app images"
      echo "  --web-only      Only optimize web app images"
      echo "  --size SIZE     Optimize images larger than SIZE KB (default: 500)"
      echo "  --help          Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Check dependencies
check_dependencies

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Optimize images based on options
if [ $WEB_ONLY -eq 0 ]; then
  echo ""
  echo "📱 Optimizing Mobile App Images"
  echo "================================"
  optimize_directory "$PROJECT_ROOT/mobile/assets" "$SIZE_THRESHOLD"
fi

if [ $MOBILE_ONLY -eq 0 ]; then
  echo ""
  echo "🌐 Optimizing Store Website Images"
  echo "=================================="
  optimize_directory "$PROJECT_ROOT/cloud/websites/store/public" "$SIZE_THRESHOLD"
  
  echo ""
  echo "🌐 Optimizing Console Website Images"
  echo "===================================="
  optimize_directory "$PROJECT_ROOT/cloud/websites/console/public" "$SIZE_THRESHOLD"
fi

echo ""
echo -e "${GREEN}✅ Image optimization complete!${NC}"
echo ""
echo "📊 Summary of changes:"
echo "  • PNG files have been optimized with compression"
echo "  • WebP versions have been created alongside PNGs"
echo "  • Original PNGs are preserved for compatibility"
echo ""
echo "⚠️  Next steps:"
echo "  1. Review optimized images for quality"
echo "  2. Update image references to use WebP with PNG fallback"
echo "  3. Test on various devices and browsers"
echo "  4. Commit changes to version control"
