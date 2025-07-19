#!/bin/bash

# Setup script for large files not included in git
# Run this after cloning the repository

set -e

echo "🚀 Setting up large files for AugmentOS iOS..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "Podfile" ]; then
    echo -e "${RED}❌ Error: Please run this script from the mobile/ios directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📁 Creating necessary directories...${NC}"
mkdir -p Packages/SherpaOnnx/Model

echo -e "${YELLOW}📥 Downloading Sherpa-ONNX XCFramework...${NC}"
# Download from official Sherpa-ONNX releases
SHERPA_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.6/sherpa-onnx-v1.12.6-ios.tar.bz2"

# Extracting creates a folder name build-ios
if [ ! -d "Packages/SherpaOnnx/sherpa-onnx.xcframework" ]; then
    echo "Downloading Sherpa-ONNX XCFramework..."
    curl -L "$SHERPA_URL" -o sherpa-onnx-ios.tar.bz2
    tar -xjf sherpa-onnx-ios.tar.bz2
    mv build-ios/sherpa-onnx.xcframework Packages/SherpaOnnx/
    rm -rf sherpa-onnx-ios.tar.bz2 build-ios
    echo -e "${GREEN}✅ Sherpa-ONNX XCFramework downloaded${NC}"
else
    echo -e "${GREEN}✅ Sherpa-ONNX XCFramework already exists${NC}"
fi

echo -e "${YELLOW}📥 Downloading model files...${NC}"
# Download small English model
MODEL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile.tar.bz2"


if [ ! -f "Packages/SherpaOnnx/Model/encoder.onnx" ]; then
    echo "Downloading Sherpa-ONNX model files..."
    curl -L "$MODEL_URL" -o model.tar.bz2
    tar -xjf model.tar.bz2
    mv sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile/decoder-epoch-99-avg-1.onnx Packages/SherpaOnnx/Model/decoder.onnx
    mv sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile/encoder-epoch-99-avg-1.onnx Packages/SherpaOnnx/Model/encoder.onnx
    mv sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile/joiner-epoch-99-avg-1.int8.onnx Packages/SherpaOnnx/Model/joiner.onnx
    mv sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile/tokens.txt Packages/SherpaOnnx/Model/
    rm -rf model.tar.bz2 sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile
    echo -e "${GREEN}✅ Model files downloaded${NC}"
else
    echo -e "${GREEN}✅ Model files already exist${NC}"
fi

echo -e "${GREEN}🎉 Setup complete! You can now build the iOS app.${NC}"
echo -e "${YELLOW}💡 Note: These large files are excluded from git to keep the repository size manageable.${NC}"
