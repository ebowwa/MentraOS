# STT Model Architecture Differences

## Overview

Sherpa ONNX supports multiple model architectures for speech recognition. The key difference lies in how the models are structured and what files they require.

## Model Architectures

### 1. Transducer Models (3-file architecture)

**Example**: `sherpa-onnx-streaming-zipformer-en-2023-06-21-mobile`

**Files required**:

- `encoder.onnx` - Encodes audio features
- `decoder.onnx` - Language model component
- `joiner.onnx` - Joins encoder and decoder outputs
- `tokens.txt` - Token vocabulary

**Configuration in code**:

```java
OnlineTransducerModelConfig transducer = new OnlineTransducerModelConfig();
transducer.setEncoder("path/to/encoder.onnx");
transducer.setDecoder("path/to/decoder.onnx");
transducer.setJoiner("path/to/joiner.onnx");
```

**Characteristics**:

- More complex architecture
- Generally better accuracy
- Larger total model size
- Used in the current MentraOS implementation

### 2. CTC Models (single-file architecture)

**Example**: `sherpa-onnx-nemo-streaming-fast-conformer-ctc-en-80ms-int8`

**Files required**:

- `model.int8.onnx` - Single model file
- `tokens.txt` - Token vocabulary

**Configuration in code**:

```java
OnlineCtcModelConfig ctc = new OnlineCtcModelConfig();
ctc.setModel("path/to/model.int8.onnx");
```

**Characteristics**:

- Simpler architecture
- Smaller model size
- Faster inference
- May have lower accuracy than transducer models

## Implementation Considerations

### Current Implementation

The current MentraOS implementation is hardcoded for transducer models:

- Expects 3 separate model files
- Uses `OnlineTransducerModelConfig`
- File validation checks for encoder/decoder/joiner

### Supporting Multiple Architectures

To support both model types, the code would need to:

1. **Detect model type** based on available files:

   ```java
   if (new File(modelPath, "model.int8.onnx").exists()) {
       // CTC model
   } else if (new File(modelPath, "encoder.onnx").exists()) {
       // Transducer model
   }
   ```

2. **Configure appropriately**:

   ```java
   if (isCTCModel) {
       OnlineCtcModelConfig ctc = new OnlineCtcModelConfig();
       ctc.setModel(modelPath + "/model.int8.onnx");
       modelConfig.setCtc(ctc);
   } else {
       OnlineTransducerModelConfig transducer = new OnlineTransducerModelConfig();
       // ... set encoder/decoder/joiner
       modelConfig.setTransducer(transducer);
   }
   ```

3. **Update validation** to check for either set of files

4. **Update extraction** to handle different file naming conventions

## Model Selection Guide

**Choose Transducer models when**:

- Accuracy is the top priority
- Device has sufficient storage (300MB+)
- Battery life is less critical

**Choose CTC models when**:

- App size is critical
- Need faster inference
- Battery efficiency is important
- Slightly lower accuracy is acceptable

## File Size Comparison

| Model Type | Compressed | Extracted | Example Model                   |
| ---------- | ---------- | --------- | ------------------------------- |
| Transducer | ~349MB     | ~500MB    | zipformer-en-2023-06-21-mobile  |
| CTC        | ~95MB      | ~150MB    | nemo-conformer-ctc-en-80ms-int8 |

## Future Improvements

To support multiple model architectures:

1. Add model type detection in `STTModelManager`
2. Update native modules to handle both configurations
3. Allow users to choose between models based on their needs
4. Display model type in the UI
5. Add model-specific configuration options
