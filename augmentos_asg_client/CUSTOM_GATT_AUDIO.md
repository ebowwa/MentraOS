# Custom GATT Audio Implementation for Mentra Live

## Overview

This document outlines the implementation of custom LC3 GATT audio for Mentra Live smart glasses, providing an alternative to the standard HFP (Hands-Free Profile) audio system.

## Why Custom GATT Audio?

### Current HFP Limitations

The existing HFP implementation has several significant drawbacks:

1. **Audio System Hijacking**: HFP takes control of the entire phone's audio system
2. **Concurrent Audio Conflicts**: Cannot play audio from multiple apps simultaneously
   - Example: Playing music while using MentraOS to play audio (ex: text-to-speech) causes one to stop the other
   - Example: Using the microphone in another app prevents MentraOS from using the microphone
   - Standard Android/iOS behavior prevents multiple audio streams
3. **User Experience Impact**: Forces users to choose between MentraOS audio and other apps

### Custom GATT Audio Benefits

1. **Non-Disruptive**: Android/iOS doesn't recognize custom GATT audio as a system audio device
2. **Concurrent Audio Support**: Users can play music while MentraOS audio plays through glasses. Users can use the microphone in other apps while MentraOS uses the microphone from the glasses.
3. **Flexible Control**: App-level control over audio routing and processing
4. **Better User Experience**: No conflicts with other audio apps

## Implementation Requirements

### Toggle System

The implementation should provide runtime toggles for different audio modes:

```json
{
  "C": "enable_custom_audio_rx",
  "B": true/false
}
```

```json
{
  "C": "enable_custom_audio_tx", 
  "B": true/false
}
```

```json
{
  "C": "enable_hfp_audio_server",
  "B": true/false
}
```

### Audio Direction Support

- **RX (Receive)**: Phone → Glasses audio streaming
- **TX (Transmit)**: Glasses → Phone microphone audio

### Compatibility

- **Maintain HFP**: Keep existing HFP system for compatibility
- **Runtime Switching**: Allow toggling between HFP and custom GATT

## Technical Implementation

> **Note**: The following technical details are based on the Even Realities G1 smart glasses implementation found in `EvenRealitiesG1SGC.java`, which serves as a reference example for custom LC3 GATT audio.

### GATT Service Structure

```
Service UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E (UART Service)
├── TX Characteristic: 6E400002-B5A3-F393-E0A9-E50E24DCCA9E (Phone → Glasses)
├── RX Characteristic: 6E400003-B5A3-F393-E0A9-E50E24DCCA9E (Glasses → Phone)
└── Descriptor: 00002902-0000-1000-8000-00805f9b34fb (Notifications)
```

### LC3 Audio Packet Format

```
Packet Structure (202 bytes total):
├── Byte 0: 0xF1 (Audio data identifier)
├── Byte 1: Sequence number (0-255)
└── Bytes 2-201: LC3 encoded audio data (200 bytes)
```

### Control Commands

```
Microphone Control:
├── Enable: 0x0E 0x01
├── Disable: 0x0E 0x00
└── Heartbeat: Periodic keep-alive commands
```

### Audio Processing Flow

1. **Outgoing Audio (Phone → Glasses)**:
   - Package LC3 audio into GATT packets with sequence numbers
   - Send via TX characteristic

2. **Incoming Audio (Glasses → Phone)**:
   - Receive LC3 packets via RX characteristic
   - Validate sequence numbers
   - Decode LC3 to PCM for processing

## Reference Implementation: Even Realities G1 Smart Glasses

### Overview

The Even Realities G1 implementation in `EvenRealitiesG1SGC.java` provides a working example of custom LC3 GATT audio.

### Key Implementation Details

#### Audio Data Detection
```java
// Detect audio packets by header byte
if (data[0] == (byte) 0xF1) {
    byte sequenceNumber = data[1];
    byte[] lc3Data = Arrays.copyOfRange(data, 2, 202);
    
    // Decode LC3 to PCM
    byte[] pcmData = L3cCpp.decodeLC3(lc3DecoderPtr, lc3Data);
}
```
