# BLE File Transfer Implementation for K900/Mentra Live Glasses

## Overview
This document tracks the implementation of BLE file transfer protocol for sending images from K900/Mentra Live glasses to phone.

## Protocol Documentation (from ODM)

### 1. BLE Service and Characteristics
- **Service UUID**: `00004860-0000-1000-8000-00805f9b34fb`
- **File Read UUID**: `000072FF-0000-1000-8000-00805f9b34fb` (BES → Phone)
- **File Write UUID**: `000073FF-0000-1000-8000-00805f9b34fb` (Phone → BES)
- **Normal TX/RX UUIDs**: `000070FF/000071FF`

### 2. File Transfer Protocol Format
```
head(2) + file_type(1) + pack_size(2) + pack_index(2) + file_size(4) + 
file_name(16) + flags(2) + data(n) + verify(1) + tail(2)
```
- **Head**: `##` (0x23, 0x23)
- **File type**: `0x31` for photos
- **Pack size**: 400 bytes per packet (except last)
- **Pack index**: Starting from 0
- **Verify**: Checksum of data bytes (sum & 0xFF)
- **Tail**: `$$` (0x24, 0x24)

### 3. Transfer Flow
1. MTK sends packet to BES via UART
2. BES forwards to phone via BLE
3. Phone sends acknowledgment: `{"C":"cs_flts", "V":1, "B":"{"state": 1, "index": 5}"}`
4. BES forwards ack back to MTK
5. MTK sends next packet

## Implementation Status

### ✅ Completed

1. **K900ProtocolUtils.java** (android_core)
   - Added file transfer constants (CMD_TYPE_PHOTO, etc.)
   - Implemented `packFilePacket()` for creating packets
   - Implemented `extractFilePacket()` for parsing packets
   - Added `createFileTransferAck()` for acknowledgments
   - Created `FilePacketInfo` class

2. **K900BluetoothManager.java** (asg_client)
   - Added `sendImageFile()` method
   - Implemented packet-by-packet transmission
   - Added retry logic with 5 attempts
   - Added `sendTestImageFromAssets()` for testing
   - Tracks transfer state with `FileTransferSession`

3. **MentraLiveSGC.java** (android_core)
   - Added file packet detection in `processReceivedData()`
   - Implemented `FileTransferSession` for reassembly
   - Added `processFilePacket()` method
   - Sends acknowledgments via `sendFileTransferAck()`
   - Saves files to `/MentraLive_Images/`

4. **ComManager.java** (asg_client)
   - Added `sendFile()` method (no logging)
   - Added `setFastMode()` method
   - Updated RecvThread to use 5ms/50ms sleep based on mode

5. **Test Integration**
   - Modified `cs_pho` button handler to send `test.jpg` from assets

### ❌ Current Issues

1. **Phone never receives file packets**
   - Glasses send 432-byte packets successfully
   - Phone receives normal messages (battery, ping/pong) fine
   - File packets are never received on any characteristic
   - No acknowledgments sent back
   - Glasses retry 5 times then fail

2. **Characteristics are discovered correctly**
   - All 4 characteristics found (70FF, 71FF, 72FF, 73FF)
   - Notifications enabled on both 70FF and 72FF
   - MTU negotiated to 512 bytes

### ✅ Fixed Issues

1. **Byte order mismatch (FIXED)**
   - **Problem**: Reference implementation uses big-endian for all multi-byte integers in file packets
   - **Our bug**: We were using little-endian byte order
   - **Impact**: BES chip couldn't parse packet structure (pack_size, pack_index, file_size, flags)
   - **Fix**: Updated `packFilePacket` and `extractFilePacket` to use big-endian byte order
   - **Note**: File packets are sent raw without K900 protocol wrapper (confirmed from reference)

## Debugging Findings

### What Works
- Normal JSON messages (< 100 bytes) work perfectly
- Both directions of communication work for small messages
- BLE connection is stable
- MTU negotiation succeeds (512 bytes)
- All characteristics are discovered and monitored

### What Doesn't Work
- 432-byte file packets are sent but never received
- No data arrives on ANY characteristic when file is sent
- BES chip doesn't forward acknowledgments back to MTK

### Logs Analysis

**Glasses (ASG Client)**:
```
D  🎾 TEST: Starting file transfer from assets: test.jpg (6570 bytes, 17 packets)
D  >>> sending 432 bytes
D  Sent file packet 0/16 (400 bytes)
W  Retrying file packet 0 (attempt 1)
W  Retrying file packet 0 (attempt 2)
...
E  File packet 0 failed after 5 retries
```

**Phone (Android Core)**:
- No logs about receiving file packets
- Only receives normal messages during this time

## Theories

### 1. BES Chip Packet Size Limitation
- BES chip might not handle 432-byte UART packets
- May need pre-fragmentation before sending to BES

### 2. Missing Initialization
- BES chip might need a command to enable file transfer mode
- Reference implementation might have initialization we're missing

### 3. Wrong Communication Path
- File packets might need different handling than regular messages
- BES chip might expect file data on different UART pins/mode

### 4. Timing Issues
- Even with fast mode (5ms), timing might be critical
- BES chip might drop packets if they arrive too fast

## Next Steps to Try

1. **Reduce packet size**
   - Try sending smaller packets (e.g., 100 bytes) to test
   - Check if there's a size threshold where packets stop working

2. **Check BES chip documentation**
   - Look for commands to enable file transfer mode
   - Check for UART buffer size limitations

3. **Analyze working implementation**
   - Run K900Server_common and capture BLE traffic
   - See if there's initialization we're missing

4. **Test with different data**
   - Send file packets as multiple smaller BLE writes
   - Try sending on different characteristics

5. **Protocol analysis**
   - Use BLE sniffer to see what's actually transmitted
   - Compare with reference implementation

## Key Code Locations

- **Protocol Utils**: `/android_core/.../utils/K900ProtocolUtils.java`
- **Glasses Send**: `/asg_client/.../bluetooth/K900BluetoothManager.java`
- **Phone Receive**: `/android_core/.../smartglassescommunicators/MentraLiveSGC.java`
- **Serial Comm**: `/asg_client/.../bluetooth/serial/ComManager.java`
- **Test Trigger**: `/asg_client/.../AsgClientService.java` (cs_pho handler)

## Test Setup

1. Place `test.jpg` in `/asg_client/app/src/main/assets/`
2. Press photo button on glasses
3. Check logs on both sides

## Important Notes

- File transfer uses same service but might use different characteristics (72FF/73FF)
- Fast mode is critical for acknowledgments to work
- BES chip acts as intermediary between MTK and phone
- Reference implementation uses 400-byte packets but this might be too large for BLE