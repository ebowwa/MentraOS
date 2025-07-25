# BLE File Transfer Code Cleanup Guide

## Summary of Current Implementation

The BLE file transfer is working perfectly with the BES chip's auto-acknowledgment system. Here's what can be cleaned up to make the code production-ready.

## 1. Phone-Side ACK Code (Can Remove)

### In MentraLiveSGC.java:

```java
// REMOVE THIS METHOD - NOT NEEDED
private void sendFileTransferAck(int state, int index) {
    // BES chip handles ACKs automatically
}

// REMOVE THIS CALL in processFilePacket():
// sendFileTransferAck(1, packetInfo.packIndex);
```

### In K900ProtocolUtils.java:

```java
// KEEP but mark as "For testing/simulation only"
public static String createFileTransferAck(int state, int index) {
    // Only needed if simulating BES behavior for testing
}
```

## 2. Glasses-Side Simplifications

### In K900BluetoothManager.java:

**Can simplify or remove:**

- `FilePacketState` class - might not need retry tracking
- `pendingPackets` map - if BES is reliable
- `checkFilePacketAck()` method - complex timeout logic
- `FILE_TRANSFER_ACK_TIMEOUT_MS` constant
- `FILE_TRANSFER_MAX_RETRIES` constant

**Must keep:**

- BES ACK handling with index+1 behavior
- Fast mode switching
- Basic packet sending logic

## 3. Debug/Test Code to Clean

### Remove excessive logging:

```java
// Change from:
Log.e(TAG, "📦 JSON DATA BEFORE C-WRAPPING: " + originalData);
// To production-appropriate:
Log.d(TAG, "Wrapping JSON data");
```

### Make test method conditional:

```java
@DebugOnly  // or similar annotation
public boolean sendTestImageFromAssets(String assetFileName) {
    // Keep for development, remove from production
}
```

## 4. Byte Order Consolidation

### Create utility methods:

```java
public class ByteOrderUtils {
    // Consolidate all big-endian conversions
    public static int readBigEndianInt16(byte[] data, int offset) { }
    public static int readBigEndianInt32(byte[] data, int offset) { }
    public static void writeBigEndianInt16(byte[] data, int offset, int value) { }
    // etc.
}
```

### Remove little-endian file packet code:

- Keep little-endian only for phone-to-glasses JSON messages
- All file packets use big-endian exclusively

## 5. Essential Code to Keep

### K900ProtocolUtils.java:

- `packFilePacket()` - exactly as is
- `extractFilePacket()` - exactly as is
- `CMD_TYPE_PHOTO` and related constants
- `FilePacketInfo` class

### K900BluetoothManager.java:

- `sendImageFile()` core logic
- `sendNextFilePacket()` method
- `handleFileTransferAck()` with BES index+1 logic
- `FileTransferSession` class
- Fast mode switching

### MentraLiveSGC.java:

- File packet detection (0x31 type)
- `FileTransferSession` for reassembly
- `processFilePacket()` method
- File saving logic
- Duplicate packet detection

### ComManager.java:

- `sendFile()` method
- `setFastMode()` and fast/normal sleep modes

## 6. Recommended Refactoring

### Create dedicated file transfer classes:

```java
// New class for cleaner separation
public class BleFileTransferManager {
    // Move all file transfer logic here
    // Keep BluetoothManager focused on connection management
}

// New class for protocol handling
public class FileTransferProtocol {
    // Move packet creation/parsing here
    // Separate from general K900 protocol utils
}
```

### Add proper callbacks:

```java
public interface FileTransferListener {
    void onTransferStarted(String fileName, int totalPackets);
    void onPacketSent(int packetIndex, int totalPackets);
    void onTransferComplete(String fileName);
    void onTransferFailed(String fileName, String reason);
}
```

## 7. Production Checklist

- [ ] Remove all `Log.e()` calls used for debugging
- [ ] Add proper error handling with user-friendly messages
- [ ] Make logging level configurable
- [ ] Add file size limits and validation
- [ ] Implement transfer cancellation
- [ ] Add unit tests for packet creation/parsing
- [ ] Document BES chip behavior clearly
- [ ] Add integration tests with timeout handling
- [ ] Consider memory usage for large files
- [ ] Add progress notification to UI

## 8. Keep for Documentation

### Critical knowledge to preserve:

1. BES chip auto-ACKs with index = packet_index + 1
2. Big-endian byte order for file packets
3. 72FF characteristic for file transfer
4. Fast mode (5ms) critical for performance
5. No phone ACKs needed - BES handles everything

This cleanup will reduce code complexity while maintaining the working implementation.
