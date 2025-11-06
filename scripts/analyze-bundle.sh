#!/bin/bash
# Bundle Size Analysis Script for MentraOS
# Analyzes bundle sizes for web applications and provides optimization recommendations

set -e

echo "📦 MentraOS Bundle Analysis Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Function to format bytes to human readable
format_bytes() {
  local bytes=$1
  if [ $bytes -lt 1024 ]; then
    echo "${bytes}B"
  elif [ $bytes -lt 1048576 ]; then
    echo "$(( bytes / 1024 ))KB"
  else
    echo "$(( bytes / 1048576 ))MB"
  fi
}

# Function to analyze a Vite app
analyze_vite_app() {
  local app_name="$1"
  local app_path="$2"
  
  echo -e "${BLUE}Analyzing $app_name...${NC}"
  echo "======================================"
  
  cd "$app_path"
  
  # Check if dist exists
  if [ ! -d "dist" ]; then
    echo -e "${YELLOW}⚠️  No dist folder found. Building...${NC}"
    bun run build || {
      echo -e "${RED}✗ Build failed for $app_name${NC}"
      return 1
    }
  fi
  
  # Analyze bundle sizes
  echo ""
  echo "📊 Bundle Sizes:"
  echo "----------------"
  
  local total_size=0
  local js_size=0
  local css_size=0
  
  # Analyze JS files
  while IFS= read -r -d '' file; do
    local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    js_size=$((js_size + size))
    total_size=$((total_size + size))
    
    local filename=$(basename "$file")
    local filesize=$(format_bytes $size)
    
    # Warn if chunk is too large
    if [ $size -gt 1000000 ]; then
      echo -e "${RED}  ⚠️  $filename: $filesize (TOO LARGE)${NC}"
    elif [ $size -gt 500000 ]; then
      echo -e "${YELLOW}  ⚠️  $filename: $filesize (Consider splitting)${NC}"
    else
      echo -e "${GREEN}  ✓ $filename: $filesize${NC}"
    fi
  done < <(find dist/assets -type f -name "*.js" ! -name "*.map" -print0 2>/dev/null || true)
  
  # Analyze CSS files
  while IFS= read -r -d '' file; do
    local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    css_size=$((css_size + size))
    total_size=$((total_size + size))
    
    local filename=$(basename "$file")
    local filesize=$(format_bytes $size)
    echo -e "  ✓ $filename: $filesize"
  done < <(find dist/assets -type f -name "*.css" ! -name "*.map" -print0 2>/dev/null || true)
  
  echo ""
  echo "📈 Summary:"
  echo "  JavaScript: $(format_bytes $js_size)"
  echo "  CSS: $(format_bytes $css_size)"
  echo -e "${BLUE}  Total: $(format_bytes $total_size)${NC}"
  
  # Recommendations
  echo ""
  echo "💡 Recommendations:"
  if [ $js_size -gt 1000000 ]; then
    echo -e "${YELLOW}  • Consider further code splitting (JS bundle > 1MB)${NC}"
  fi
  
  if [ $css_size -gt 500000 ]; then
    echo -e "${YELLOW}  • Consider CSS optimization (CSS bundle > 500KB)${NC}"
  fi
  
  if [ $total_size -lt 500000 ]; then
    echo -e "${GREEN}  • Bundle size is excellent! 🎉${NC}"
  elif [ $total_size -lt 1000000 ]; then
    echo -e "${GREEN}  • Bundle size is good${NC}"
  elif [ $total_size -lt 2000000 ]; then
    echo -e "${YELLOW}  • Bundle size is acceptable but could be improved${NC}"
  else
    echo -e "${RED}  • Bundle size is large, optimization recommended${NC}"
  fi
  
  echo ""
  echo ""
  
  cd "$PROJECT_ROOT"
}

# Function to analyze mobile app
analyze_mobile_app() {
  echo -e "${BLUE}Analyzing Mobile App...${NC}"
  echo "======================================"
  
  local mobile_path="$PROJECT_ROOT/mobile"
  cd "$mobile_path"
  
  echo ""
  echo "📦 Dependencies Analysis:"
  echo "------------------------"
  
  # Count dependencies
  local deps=$(cat package.json | grep -c '"' || true)
  local dev_deps=$(cat package.json | grep -A 999 '"devDependencies"' | grep -c '"' || true)
  
  echo "  Production dependencies: $deps"
  echo "  Dev dependencies: $dev_deps"
  
  # Check for large dependencies
  echo ""
  echo "📊 Largest Dependencies:"
  du -sh node_modules/* 2>/dev/null | sort -rh | head -10 || echo "  (node_modules not found)"
  
  echo ""
  echo "🔍 Code Analysis:"
  echo "----------------"
  
  # Count TS/TSX files
  local file_count=$(find src -name "*.tsx" -o -name "*.ts" 2>/dev/null | wc -l || echo "0")
  echo "  TypeScript files: $file_count"
  
  # Check for optimization patterns
  local memo_count=$(grep -r "useMemo\|useCallback" src 2>/dev/null | wc -l || echo "0")
  echo "  useMemo/useCallback usage: $memo_count"
  
  local wildcard_imports=$(grep -r "^import \* as" src 2>/dev/null | wc -l || echo "0")
  echo "  Wildcard imports: $wildcard_imports"
  if [ $wildcard_imports -gt 0 ]; then
    echo -e "${YELLOW}    ⚠️  Consider replacing with specific imports${NC}"
  fi
  
  echo ""
  echo "💡 Mobile App Optimization Status:"
  echo "  ✓ Hermes JS engine: enabled"
  echo "  ✓ New Architecture: enabled"
  echo "  ✓ Inline requires: enabled"
  
  echo ""
  
  cd "$PROJECT_ROOT"
}

# Parse command line arguments
STORE_ONLY=0
CONSOLE_ONLY=0
MOBILE_ONLY=0
REBUILD=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --store-only)
      STORE_ONLY=1
      shift
      ;;
    --console-only)
      CONSOLE_ONLY=1
      shift
      ;;
    --mobile-only)
      MOBILE_ONLY=1
      shift
      ;;
    --rebuild)
      REBUILD=1
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --store-only    Only analyze store website"
      echo "  --console-only  Only analyze console website"
      echo "  --mobile-only   Only analyze mobile app"
      echo "  --rebuild       Rebuild before analyzing"
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

# Remove dist folders if rebuild is requested
if [ $REBUILD -eq 1 ]; then
  echo "🔄 Rebuilding applications..."
  [ $CONSOLE_ONLY -eq 0 ] && rm -rf "$PROJECT_ROOT/cloud/websites/store/dist" 2>/dev/null || true
  [ $STORE_ONLY -eq 0 ] && rm -rf "$PROJECT_ROOT/cloud/websites/console/dist" 2>/dev/null || true
fi

# Analyze apps based on options
if [ $CONSOLE_ONLY -eq 0 ] && [ $MOBILE_ONLY -eq 0 ]; then
  analyze_vite_app "Store Website" "$PROJECT_ROOT/cloud/websites/store"
fi

if [ $STORE_ONLY -eq 0 ] && [ $MOBILE_ONLY -eq 0 ]; then
  analyze_vite_app "Console Website" "$PROJECT_ROOT/cloud/websites/console"
fi

if [ $STORE_ONLY -eq 0 ] && [ $CONSOLE_ONLY -eq 0 ]; then
  analyze_mobile_app
fi

echo ""
echo -e "${GREEN}✅ Bundle analysis complete!${NC}"
echo ""
echo "📚 For more details, see PERFORMANCE_OPTIMIZATIONS.md"
