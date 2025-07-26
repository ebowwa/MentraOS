# MentraOS ASG Client Development Guidelines

This guide provides an overview and development guidelines for the MentraOS ASG (Android Smart Glasses) Client, which runs on Android-based smart glasses like Mentra Live.

## Overview

The MentraOS ASG Client is an Android application that runs directly on Android-based smart glasses hardware. It serves as the bridge between the glasses' hardware capabilities and the MentraOS ecosystem, enabling features like camera capture, display rendering, Bluetooth communication, and network management.

## Architecture

### Core Components

1. **AsgClientService** - The main service that coordinates all functionality:
   - Manages WebSocket connection to MentraOS Cloud
   - Handles command processing from the cloud
   - Integrates with augmentos_core via AIDL binding
   - Coordinates camera capture and media upload
   - Manages RTMP streaming

2. **Manager Systems** - Interface-based factory pattern for device abstraction:
   - **NetworkManager** - WiFi and hotspot control
   - **BluetoothManager** - BLE communication with phone app
   - **MediaCaptureService** - Photo/video capture and upload
   - **RtmpStreamingService** - Live video streaming

### Network Manager System

The NetworkManager uses a factory pattern to support different device types:

```java
// Interface defining network operations
public interface INetworkManager {
    void setWifiEnabled(boolean enabled);
    void connectToWifi(String ssid, String password);
    void startHotspot(String ssid, String password);
    // ... other network operations
}
```

**Implementations:**

- **K900NetworkManager** - For Mentra Live (K900) devices using proprietary broadcasts
- **SystemNetworkManager** - For devices with system permissions using reflection
- **FallbackNetworkManager** - For regular devices, prompts user for manual configuration

### Bluetooth Manager System

Similarly structured for Bluetooth/BLE operations:

```java
// Interface for Bluetooth operations
public interface IBluetoothManager {
    void initialize();
    void startAdvertising();
    void sendData(byte[] data);
    boolean isConnected();
    // ... other BLE operations
}
```

**Implementations:**

- **K900BluetoothManager** - Uses serial port communication with BES2700 chip
- **StandardBluetoothManager** - Full BLE GATT server implementation for standard Android devices

### Media System

The media system handles camera button presses and media capture:

1. **Button Press Flow**:
   - Physical button press detected
   - Event sent to MentraOS Cloud
   - Cloud checks if any Apps want to handle it
   - If not, default action (take photo/video)

2. **Media Upload Queue**:
   - Reliable upload with retry logic
   - Persists across app restarts
   - Handles offline scenarios

### RTMP Streaming

Supports live video streaming with:

- Direct streaming to App-provided URLs
- Keep-alive mechanism with 60-second timeout
- ACK-based reliability system
- Automatic cleanup on connection loss

## Development Guidelines

### Code Style

- **Java**:
  - Use Java SDK 17
  - Classes: PascalCase
  - Methods: camelCase
  - Constants: UPPER_SNAKE_CASE
  - Member variables: mCamelCase (with m prefix)
  - 2-space indentation
  - EventBus for component communication

### Adding Support for New Glasses

To add support for new Android-based smart glasses:

1. **Fix Device Detection** (REQUIRED):

   ```java
   // In NetworkManagerFactory.java and BluetoothManagerFactory.java
   // Change this:
   if (true || isK900Device()) {  // Currently forced to K900

   // To this:
   if (isK900Device()) {  // Proper device detection
   ```

2. **Create a SmartGlassesCommunicator** in augmentos_core:
   - Extend `SmartGlassesCommunicator` base class
   - Implement BLE client to connect to StandardBluetoothManager
   - Handle display, audio, and sensor capabilities
   - See `ANDROID_FIRMWARE_GUIDE.md` for detailed instructions

3. **Update Device Detection**:

   ```java
   private boolean isYourGlassesDevice() {
       String model = Build.MODEL.toLowerCase();
       return model.contains("your-device-identifier");
   }
   ```

4. **Configure Manager Selection**:
   - StandardBluetoothManager will work for most devices
   - Choose appropriate NetworkManager based on permissions
   - Test with both System and Fallback network managers

### Important Notes on Current State

**StandardBluetoothManager**: A fully implemented BLE GATT server exists with:

- Complete BLE GATT server functionality
- Auto-pairing capabilities
- MTU negotiation
- Serial-like data exchange over characteristics

However, it's not currently used because:

- The K900 (Mentra Live) uses proprietary serial communication via K900BluetoothManager
- The MentraLiveSGC.java in augmentos_core is designed specifically for K900's serial protocol
- To use StandardBluetoothManager, you'd need a new SmartGlassesCommunicator that acts as a BLE client

### Building and Testing

1. **Environment Setup**:

   ```bash
   # Copy environment file
   cp .env.example .env

   # For local development, modify .env:
   MENTRAOS_HOST=localhost  # or your computer's IP
   MENTRAOS_PORT=8002
   MENTRAOS_SECURE=false
   ```

2. **Build Requirements**:
   - Android Studio with Java SDK 17
   - Set Gradle JDK to version 17 in Android Studio settings

3. **Testing on Mentra Live**:

   To build and run on actual Mentra Live glasses:

   a. **Connect glasses via WiFi ADB**:

   ```bash
   # First, pair glasses with MentraOS app and connect to WiFi
   # Find the Local IP Address shown on the "Glasses" screen in the app
   # Connect via ADB (your computer must be on same network)
   adb connect {localip}:5555

   # Verify connection
   adb devices
   ```

   b. **Build and install**:

   ```bash
   # Build the APK
   ./gradlew assembleDebug

   # Install on glasses
   adb install app/build/outputs/apk/debug/app-debug.apk

   # For localhost connection (if testing with local server)
   adb reverse tcp:8002 tcp:8002
   ```

### Message Processing

The client processes JSON commands from the cloud:

```java
// Example command processing in AsgClientService
switch (type) {
    case "take_photo":
        String requestId = dataToProcess.optString("requestId", "");
        mMediaCaptureService.takePhotoAndUpload(photoFilePath, requestId);
        break;

    case "start_rtmp_stream":
        String streamId = dataToProcess.optString("streamId", "");
        String rtmpUrl = dataToProcess.optString("rtmpUrl", "");
        RtmpStreamingService.startStreaming(this, rtmpUrl);
        RtmpStreamingService.startStreamTimeout(streamId);
        break;

    case "display_text":
        // For glasses with displays
        showTextOnDisplay(text);
        break;
}
```

### EventBus Communication

The client uses EventBus for internal communication:

```java
// Send events
EventBus.getDefault().post(new StreamingEvent.Started());
EventBus.getDefault().post(new PhotoCapturedEvent(filePath));

// Subscribe to events
@Subscribe(threadMode = ThreadMode.MAIN)
public void onStreamingError(StreamingEvent.Error event) {
    Log.e(TAG, "Streaming error: " + event.getMessage());
}
```

### Debugging

1. **Enable Debug Mode**:
   - The client includes debug notification support
   - Network operations show user-friendly notifications
   - Check logcat for detailed logs

2. **Common Issues**:
   - **K900 Mode Forced**: Remember to fix the factory detection
   - **Bluetooth Pairing**: StandardBluetoothManager advertises as "Xy_A"
   - **Network Permissions**: Some devices need system permissions for WiFi control

## Compatible Devices

Currently supported:

- Mentra Live (K900)

Could be supported with the changes above:

- TCL Rayneo X2/X3
- INMO Air 2/3
- Other Android-based smart glasses

## Next Steps for Contributors

1. **Fix the K900 detection** in both factory classes
2. **Create device-specific SmartGlassesCommunicators** in augmentos_core
3. **Add device detection** for your specific glasses model
4. **Test the StandardBluetoothManager** with your device
5. **Submit PRs** with your device support additions

## Resources

- [ANDROID_FIRMWARE_GUIDE.md](../../mcu_client/ANDROID_FIRMWARE_GUIDE.md) - Guide for creating SmartGlassesCommunicators
- [ASG_MEDIA_SYSTEM.md](../../asg_client/ASG_MEDIA_SYSTEM.md) - Detailed media system documentation
- [MentraOS Mobile App Guidelines](/contributing/mentraos-manager-guidelines) - Mobile app development guide
