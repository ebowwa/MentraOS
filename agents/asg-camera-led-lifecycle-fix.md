# ASG Camera LED Control - Tied to Camera Lifecycle

## Date: 2025-08-17

## Problem Identified

User reported that during rapid photo capture:

- Single photo: LED works properly
- Rapid photos (spam button): LED never turns on

### Root Cause

The LED was being controlled individually for each photo request:

1. Turn on LED before photo
2. Turn off LED after 1 second delay
3. During rapid capture, overlapping on/off commands caused LED to flicker or not turn on at all

## Solution Implemented

Tied LED control to the camera lifecycle instead of individual photos:

- **LED ON**: When camera opens (if any photo request has LED enabled)
- **LED OFF**: When camera closes (after keep-alive timer expires)

This leverages the existing 3-second camera keep-alive timer, so:

- Camera opens → LED turns on
- Rapid photos taken → LED stays on
- 3 seconds after last photo → Camera closes → LED turns off

## Implementation Details

### 1. Updated PhotoRequest Class (CameraNeo.java)

Added `enableLed` field to track LED state per request:

```java
private static class PhotoRequest {
    String requestId;
    String filePath;
    String size;
    PhotoCaptureCallback callback;
    boolean enableLed;  // NEW: Whether to use LED flash
    // ...
}
```

### 2. Updated enqueuePhotoRequest Method

Added LED parameter:

```java
public static void enqueuePhotoRequest(
    Context context,
    String filePath,
    String size,
    boolean enableLed,  // NEW parameter
    PhotoCaptureCallback callback)
```

### 3. LED Control in Camera Callbacks

```java
// When camera opens:
public void onOpened(@NonNull CameraDevice camera) {
    if (pendingLedEnabled && hardwareManager != null && hardwareManager.supportsRecordingLed()) {
        Log.d(TAG, "📸 Turning on camera LED (camera opened)");
        hardwareManager.setRecordingLedOn();
    }
}

// When camera closes:
private void closeCamera() {
    if (pendingLedEnabled && hardwareManager != null && hardwareManager.supportsRecordingLed()) {
        Log.d(TAG, "📸 Turning off camera LED (camera closed)");
        hardwareManager.setRecordingLedOff();
        pendingLedEnabled = false;
    }
}
```

### 4. Removed Individual LED Control from MediaCaptureService

- Removed all LED on/off calls from MediaCaptureService
- LED is now fully managed by CameraNeo

## Files Modified

1. **CameraNeo.java**
   - Added LED support to PhotoRequest class
   - Added enableLed parameter to enqueuePhotoRequest
   - Added IHardwareManager field
   - LED control in camera open/close callbacks
   - Track pendingLedEnabled state

2. **MediaCaptureService.java**
   - Pass enableLed flag to CameraNeo.enqueuePhotoRequest
   - Removed all direct LED control (on/off calls)
   - Added comments explaining LED is managed by CameraNeo

## Benefits

1. **No LED Flickering**: LED stays on continuously during rapid capture
2. **Simpler Logic**: One place controls LED (camera lifecycle)
3. **Better Performance**: No overlapping LED commands
4. **Energy Efficient**: LED stays on for exactly as long as camera is active

## Testing

### Expected Behavior:

1. **Single Photo**:
   - Press button → Camera opens → LED ON
   - Photo taken
   - Wait 3 seconds → Camera closes → LED OFF

2. **Rapid Photos**:
   - Press button 5 times quickly
   - Camera opens → LED ON (stays on)
   - All 5 photos taken with LED continuously on
   - Wait 3 seconds after last photo → Camera closes → LED OFF

### Log Messages to Verify:

```
📸 Turning on camera LED (camera opened)
Camera keep-alive timer for 3000ms
📸 Turning off camera LED (camera closed)
```

## Build Status

✅ **BUILD SUCCESSFUL** - All changes compile without errors

## Conclusion

The LED flash now works correctly during rapid photo capture by being tied to the camera lifecycle. This provides a better user experience with consistent LED behavior and no flickering during rapid shots.
