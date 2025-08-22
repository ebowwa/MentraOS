# Brilliant Labs Frame Support Implementation Plan for MentraOS

## Overview

This document outlines the implementation plan for adding Brilliant Labs Frame glasses support to MentraOS. This is v1 implementation focusing on core functionality.

## Frame Glasses Specifications

- **BLE Service UUID**: `7A230001-5475-A6A4-654C-8431F6AD49C4`
- **TX Characteristic UUID**: `7A230002-5475-A6A4-654C-8431F6AD49C4` (Phone → Frame)
- **RX Characteristic UUID**: `7A230003-5475-A6A4-654C-8431F6AD49C4` (Frame → Phone)
- **Communication Protocol**: Lua commands sent as UTF-8 strings, raw data with 0x01 prefix
- **Display**: Yes (640x400 pixels)
- **Camera**: Yes
- **Microphone**: Yes
- **Speakers**: No (uses phone audio)

## Implementation Components

### 1. Android Core Native Module (`android_core/`)

#### 1.1 Add Frame OS Enum

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/supportedglasses/SmartGlassesOperatingSystem.java`

- Add: `FRAME_OS_GLASSES` to the enum

#### 1.2 Create Frame Device Class

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/supportedglasses/BrilliantLabsFrame.java`

```java
public class BrilliantLabsFrame {
    public static SmartGlassesDevice createDevice() {
        SmartGlassesDevice device = new SmartGlassesDevice();
        device.deviceModelName = "Brilliant Labs Frame";
        device.deviceIconName = "frame_icon";
        device.anySupport = true;
        device.fullSupport = false; // v1 implementation
        device.glassesOs = SmartGlassesOperatingSystem.FRAME_OS_GLASSES;
        device.hasDisplay = true;
        device.hasSpeakers = false; // Uses phone for audio
        device.hasCamera = true;
        device.hasInMic = true;
        device.hasOutMic = false;
        device.useScoMic = false; // Uses custom mic implementation
        device.weight = 39.0; // grams
        return device;
    }
}
```

#### 1.3 Create Frame Smart Glasses Communicator

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/smartglassescommunicators/FrameSGC.java`

Key Implementation Points:

- Extend `SmartGlassesCommunicator` base class
- Implement BLE connection using UUIDs specified above
- Core methods to implement:
  - `findCompatibleDeviceNames()` - Scan for devices with Frame service UUID
  - `connectToSmartGlasses()` - Establish BLE connection
  - `displayTextWall(String text)` - Send Lua command to display text
  - `displayBitmap(Bitmap bmp)` - Convert to appropriate format and send (stub for v1)
  - `blankScreen()` - Clear display
  - `destroy()` - Clean up connections

Communication Flow:

1. Scan for BLE devices advertising Frame service UUID
2. Connect and discover services
3. Enable notifications on RX characteristic
4. Send Lua commands via TX characteristic
5. Handle responses from RX characteristic

Text Display Implementation:

```java
public void displayTextWall(String text) {
    // Lua command to display text on Frame
    String luaCommand = String.format(
        "frame.display.text('%s', 50, 100)",
        escapeString(text)
    );
    sendLuaCommand(luaCommand);
}

private void sendLuaCommand(String command) {
    byte[] data = command.getBytes(StandardCharsets.UTF_8);
    // Write to TX characteristic
    if (txCharacteristic != null && bluetoothGatt != null) {
        txCharacteristic.setValue(data);
        bluetoothGatt.writeCharacteristic(txCharacteristic);
    }
}
```

#### 1.4 Update SmartGlassesRepresentative

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/smartglassesconnection/SmartGlassesRepresentative.java`

Add case in `createCommunicator()` method:

```java
case FRAME_OS_GLASSES:
    communicator = new FrameSGC(context, smartGlassesDevice);
    break;
```

#### 1.5 Update SmartGlassesManager

**File**: `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/SmartGlassesManager.java`

- Add Frame device to supported glasses list
- Import `BrilliantLabsFrame` class

### 2. Mobile Frontend (`mobile/`)

#### 2.1 Add Frame to Glasses Features

**File**: `mobile/src/config/glassesFeatures.ts`

```typescript
"Brilliant Labs Frame": {
  camera: true,
  speakers: false, // Uses phone audio
  display: true,
  binocular: false,
  wifi: false,
  wifiSelfOtaUpdate: false,
  imu: true,
  micTypes: ["custom"],
  powerSavingMode: false,
  gallery: false, // v1: No on-device gallery
  configurableButton: false,
}
```

#### 2.2 Add Frame Pairing Guide Component

**File**: `mobile/src/components/misc/GlassesPairingGuides.tsx`

Add new component:

```typescript
export function BrilliantLabsFramePairingGuide() {
  const {theme} = useAppTheme()

  return (
    <View style={styles.guideContainer}>
      <Text text="Brilliant Labs Frame" style={[styles.guideTitle, {color: theme.colors.text}]} />

      {/* Placeholder image */}
      <Image
        source={require("../../../assets/glasses/frame_placeholder.png")}
        style={styles.guideImage}
      />

      <GlassesFeatureList glassesModel="Brilliant Labs Frame" />

      <Text
        text="1. Make sure your Frame is charged and powered on"
        style={[styles.guideStep, {color: theme.colors.text}]}
      />
      <Text
        text="2. Frame will appear in the device list when scanning"
        style={[styles.guideStep, {color: theme.colors.text}]}
      />
      <Text
        text="3. Select your Frame to connect"
        style={[styles.guideStep, {color: theme.colors.text}]}
      />

      <Text
        text="Brilliant Labs Frame brings AI-powered AR to everyday eyewear. With an integrated display and camera, Frame enables real-time visual augmentation and AI assistance."
        style={[styles.guideDescription, {color: theme.colors.text}]}
      />
    </View>
  )
}
```

#### 2.3 Update Glasses Selection Screen

**File**: `mobile/src/app/pairing/select-glasses-model.tsx`

Add Frame to glasses options:

```typescript
const glassesOptions =
  Platform.OS === "ios"
    ? [
        // existing options...
        {modelName: "Brilliant Labs Frame", key: "frame"},
      ]
    : [
        // existing options...
        {modelName: "Brilliant Labs Frame", key: "frame"},
      ]
```

#### 2.4 Add Frame Image Placeholder

**File**: `mobile/assets/glasses/frame_placeholder.png`

- Add placeholder image for Frame glasses
- Can be replaced with actual image later

#### 2.5 Update getGlassesImage Helper

**File**: `mobile/src/utils/getGlassesImage.tsx`

Add Frame case:

```typescript
case "Brilliant Labs Frame":
  return require("../../assets/glasses/frame_placeholder.png")
```

### 3. Testing Checklist

1. **BLE Scanning**
   - [ ] Frame appears in device list when scanning
   - [ ] Correct device name displayed

2. **Connection**
   - [ ] Can establish BLE connection
   - [ ] Connection remains stable
   - [ ] Reconnection works after disconnect

3. **Display Functions**
   - [ ] Text displays correctly on Frame
   - [ ] Screen can be cleared
   - [ ] Special characters handled properly

4. **Frontend Integration**
   - [ ] Frame appears in glasses selection
   - [ ] Pairing guide displays correctly
   - [ ] Features list is accurate

### 4. Known Limitations (v1)

1. **Bitmap display**: Stubbed, will be implemented in v2
2. **Photo capture**: Not implemented, planned for v2
3. **Audio streaming**: Not implemented, planned for v2
4. **Advanced Lua scripting**: Only basic text display
5. **Gallery**: No on-device photo storage/retrieval

### 5. v2 Features (Future)

1. **Full bitmap/image display support**
   - Convert bitmaps to appropriate format
   - Send via raw data protocol

2. **Camera integration**
   - Capture photos from Frame camera
   - Stream to MentraOS backend

3. **Audio support**
   - Receive audio from Frame microphone
   - Process through MentraOS ASR

4. **Advanced display features**
   - Graphics rendering
   - Custom UI layouts
   - Animation support

### 6. Dependencies

- No additional dependencies required
- Uses existing Android BLE APIs
- Compatible with current MentraOS architecture

### 7. Implementation Order

1. Create Frame device class and enum
2. Implement basic FrameSGC with BLE connection
3. Add text display functionality
4. Update SmartGlassesRepresentative
5. Add frontend components
6. Test BLE scanning and connection
7. Test text display
8. Polish and debug

### 8. Notes

- Frame uses Lua scripting for display control
- No need for special pairing mode - standard BLE connection
- Display resolution: 640x400 pixels
- Communication is via UTF-8 Lua commands over BLE
- Use existing BLE patterns from EvenRealitiesG1SGC and MentraLiveSGC as reference
- Frame has no speakers, audio output goes through phone

### 9. Reference Implementation

The FrameSGC implementation should follow similar patterns to:

- `EvenRealitiesG1SGC.java` - For BLE connection handling
- `MentraLiveSGC.java` - For device discovery and characteristic setup

Key differences:

- Frame uses Lua commands instead of binary protocols
- Single device connection (not left/right like G1)
- Different service/characteristic UUIDs
- No speaker output capability
