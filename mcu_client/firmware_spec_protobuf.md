# 📦 MentraOS BLE Packet Format Specification - Protobuf Version (v2.0)

## 🔑 Overview

This specification uses Protocol Buffers (protobuf) for all control messages, providing:
- **5-10x smaller** message sizes compared to JSON
- **Forward/backward compatibility** for firmware updates
- **Type safety** and automatic validation
- **Efficient parsing** on resource-constrained MCUs

Binary streaming (audio/images) continues to use raw byte protocol for maximum efficiency.

---

## 🔐 GATT Service & Characteristic Definitions

| Role    | UUID                                   | Description                          |
| ------- | -------------------------------------- | ------------------------------------ |
| Service | `00004860-0000-1000-8000-00805f9b34fb` | MentraOS BLE Service                 |
| TX Char | `000071FF-0000-1000-8000-00805f9b34fb` | Phone (central) → Glasses (write)    |
| RX Char | `000070FF-0000-1000-8000-00805f9b34fb` | Glasses → Phone (notify or indicate) |
| CCCD    | `00002902-0000-1000-8000-00805f9b34fb` | Enable notify on RX Char             |

---

## 🔠 Packet Types

| Control Header Byte | Type             | Payload Format                                                |
| ------------------- | ---------------- | ------------------------------------------------------------- |
| `0x02`              | Protobuf message | Protobuf-encoded control message                              |
| `0xA0`              | Audio chunk      | `[A0][stream_id (1 byte)][LC3 frame data]`                   |
| `0xB0`              | Image chunk      | `[B0][stream_id (2 bytes)][chunk_index (1 byte)][chunk_data]`|

---

## 📊 Size Comparison Example

### Device Info Response
**JSON (246 bytes):**
```json
{
  "type": "device_info",
  "fw": "1.2.3",
  "hw": "MentraLive",
  "features": {
    "camera": true,
    "display": true,
    "audio_tx": true,
    "audio_rx": false,
    "imu": true,
    "vad": true,
    "mic_switching": true,
    "image_chunk_buffer": 12
  }
}
```

**Protobuf (~35 bytes):**
```
[0x02][protobuf bytes: fw_version="1.2.3" hw_model="MentraLive" features{...}]
```

---

## 🖼️ Image Transfer Protocol

Image transfers use a hybrid approach: protobuf for control, binary for data.

### 1. Initiate Transfer (Protobuf)
```
[0x02][PhoneToGlasses { display_image { 
  stream_id: "002A"
  x: 0
  y: 0
  width: 128
  height: 64
  encoding: "webp"
  total_chunks: 9
}}]
```

### 2. Send Binary Chunks
```
[0xB0][0x00][0x2A][0x00][chunk_data...]  // chunk 0
[0xB0][0x00][0x2A][0x01][chunk_data...]  // chunk 1
...
[0xB0][0x00][0x2A][0x08][chunk_data...]  // chunk 8
```

### 3. Receive Completion (Protobuf)
```
[0x02][GlassesToPhone { image_transfer_complete {
  stream_id: "002A"
  status: OK
}}]
```

Or if incomplete:
```
[0x02][GlassesToPhone { image_transfer_complete {
  stream_id: "002A"
  status: INCOMPLETE
  missing_chunks: [3, 4, 6]
}}]
```

---

## 🔊 Audio Streaming Protocol

Audio uses the same hybrid approach.

### 1. Configure Audio (Protobuf)
```
[0x02][PhoneToGlasses { mic_state { enabled: true }}]
```

### 2. Stream LC3 Audio (Binary)
```
[0xA0][0x01][LC3 frame data...]  // stream_id = 0x01 for microphone
[0xA0][0x01][LC3 frame data...]
[0xA0][0x01][LC3 frame data...]
```

---

## 💾 MCU Implementation Notes

### Recommended Protobuf Library
- **nanopb**: ~10KB footprint, perfect for MCUs
- Static memory allocation
- No dynamic memory required

### Example MCU Code
```c
// Receive and parse protobuf message
uint8_t buffer[256];
uint16_t len = ble_read_characteristic(buffer, sizeof(buffer));

if (buffer[0] == 0x02) {  // Protobuf message
    PhoneToGlasses msg = PhoneToGlasses_init_zero;
    pb_istream_t stream = pb_istream_from_buffer(buffer + 1, len - 1);
    
    if (pb_decode(&stream, PhoneToGlasses_fields, &msg)) {
        // Handle message based on which field is set
        if (msg.has_display_text) {
            display_text(msg.display_text.text, 
                        msg.display_text.x, 
                        msg.display_text.y);
        }
    }
}
```

---

## 🚀 Benefits Over JSON

1. **Size**: 35 bytes vs 246 bytes (7x reduction)
2. **Speed**: Binary parsing is much faster than JSON
3. **Memory**: No string allocation or parsing buffers needed
4. **Evolution**: Add new fields without breaking old firmware
5. **Validation**: Type checking at compile time

---

## 📝 Protobuf Schema

See `mentraos_ble.proto` for the complete message definitions. Key design principles:

- **Field numbers never change** (for compatibility)
- **Optional fields** for backward compatibility  
- **Enums** for type safety
- **Oneof** for message type discrimination
- **Repeated fields** for arrays (like missing_chunks)

This approach gives us the efficiency the ODM wants while maintaining the flexibility and safety of a proper protocol definition.