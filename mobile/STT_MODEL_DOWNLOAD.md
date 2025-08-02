# STT Model On-Demand Download

## Overview

MentraOS now supports on-demand downloading of Speech-to-Text (STT) models instead of bundling them with the app. This reduces app size and allows users to choose when to enable local transcription.

## How It Works

1. **No Pre-installed Model**: The app no longer includes STT models by default
2. **Download on Demand**: Users can download models through Settings → Transcription
3. **Dynamic Model Loading**: Native code loads models from the downloaded location

## User Experience

### First Time Setup

1. Navigate to Settings → Transcription
2. You'll see a "Speech Recognition Model" section
3. Click "Download Model" to download the NVIDIA NeMo Conformer model (~45MB)
4. Progress is shown for both download and extraction
5. Once complete, enable "Force Local Transcription"

### Model Management

- **Delete Model**: Remove the downloaded model to free up space
- **Cancel Download**: Stop an in-progress download
- **Automatic Validation**: The app verifies the model after download

## Technical Implementation

### React Native Layer

- `STTModelManager`: Handles download, extraction, and validation
- Models stored in app's document directory
- Progress tracking for download and extraction

### iOS

- Models stored in `Documents/stt_models/`
- `UserDefaults` stores the model path
- Falls back to bundle resources if available

### Android

- Models stored in internal app files directory
- SharedPreferences and System properties store the path
- Falls back to assets if available

## Model Details

**Current Model**: `sherpa-onnx-nemo-streaming-fast-conformer-ctc-en-80ms-int8`

- Size: ~45MB compressed, ~80-100MB extracted
- Language: English
- Latency: 80ms
- Type: Streaming conformer with CTC
- Optimization: INT8 quantized

## Migration from Bundled Models

For backwards compatibility:

- Existing bundled models still work
- Dynamic models take precedence when available
- No action required for existing users

## Development

### Testing Without Pre-downloaded Models

1. Remove `/mobile/ios/Packages/SherpaOnnx/Model/` directory
2. Remove `/android_core/app/src/main/assets/sherpa_onnx/` directory
3. Build and run the app
4. Test the download flow

### Adding New Models

1. Update `currentModel` in `STTModelManager`
2. Ensure model follows the same file structure
3. Update UI to show model details
