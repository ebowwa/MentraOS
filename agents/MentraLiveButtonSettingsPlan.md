# Mentra Live Button Settings Implementation Plan

## Overview

This plan outlines how to implement configurable button behavior for Mentra Live/asg_client glasses. Currently, the camera button always takes a photo locally. We want to allow users to configure the button to:

1. Take a photo (current behavior)
2. Send button press to apps (for app interaction)
3. Both (take photo AND send to apps)

## Current State Analysis

### Button Press Flow (asg_client)

1. Hardware button press → MCU sends `cs_pho` command
2. `AsgClientService.parseK900Command()` receives the command
3. Currently calls `mMediaCaptureService.takePhotoLocally()` directly
4. The old `handleButtonPress()` method (which sends to phone) is commented out

### Settings Flow (phone → glasses)

1. React Native UI (`DeviceSettings.tsx`) → `coreCommunicator.sendSetPreferredMic()`
2. Native bridge → `AugmentosService.setPreferredMic()`
3. Saved to SharedPreferences on phone
4. Currently NOT sent to glasses (only used locally on phone)

### Connection Flow

1. BLE connection established
2. Phone sends `phone_ready` repeatedly
3. Glasses respond with `glasses_ready` when SOC is booted
4. Phone then sends: battery request, WiFi status request, version request, core token
5. No settings are currently sent during this initialization

## Proposed Implementation

### 1. Settings Structure

#### Phone Side (mobile/)

```typescript
// Add to glassesFeatures.ts
export interface GlassesFeatureSet {
  // ... existing features
  configurableButton: boolean // Does the device support button configuration?
}

// Update Mentra Live entry
"Mentra Live": {
  // ... existing features
  configurableButton: true,
}

// New type for button settings
export type ButtonPressMode = "photo" | "apps" | "both"
```

#### Glasses Side (asg_client)

```java
// New settings class
public class AsgSettings {
  private static final String PREFS_NAME = "asg_settings";
  private static final String KEY_BUTTON_MODE = "button_press_mode";

  public enum ButtonPressMode {
    PHOTO("photo"),      // Take photo only
    APPS("apps"),        // Send to apps only
    BOTH("both");        // Both photo and apps

    private final String value;
    ButtonPressMode(String value) { this.value = value; }
    public String getValue() { return value; }

    public static ButtonPressMode fromString(String value) {
      for (ButtonPressMode mode : values()) {
        if (mode.value.equals(value)) return mode;
      }
      return PHOTO; // default
    }
  }

  private SharedPreferences prefs;

  public AsgSettings(Context context) {
    prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
  }

  public ButtonPressMode getButtonPressMode() {
    String value = prefs.getString(KEY_BUTTON_MODE, ButtonPressMode.PHOTO.getValue());
    return ButtonPressMode.fromString(value);
  }

  public void setButtonPressMode(ButtonPressMode mode) {
    prefs.edit().putString(KEY_BUTTON_MODE, mode.getValue()).apply();
  }
}
```

### 2. UI Implementation (React Native)

#### DeviceSettings.tsx

```typescript
// Add button mode state
const [buttonMode, setButtonMode] = useState(status.glasses_settings?.button_mode || "photo")

// Add UI similar to preferred mic dropdown
{status.glasses_info?.model_name &&
 glassesFeatures[status.glasses_info.model_name]?.configurableButton && (
  <View style={themed($settingsGroup)}>
    <Text style={themed($settingLabel)}>Camera Button Action</Text>

    <TouchableOpacity onPress={() => setButtonModeWithSave("photo")}>
      <Text>Take Photo</Text>
      <MaterialCommunityIcons
        name="check"
        color={buttonMode === "photo" ? theme.colors.checkmark : "transparent"}
      />
    </TouchableOpacity>

    <TouchableOpacity onPress={() => setButtonModeWithSave("apps")}>
      <Text>Use in Apps</Text>
      <MaterialCommunityIcons
        name="check"
        color={buttonMode === "apps" ? theme.colors.checkmark : "transparent"}
      />
    </TouchableOpacity>

    <TouchableOpacity onPress={() => setButtonModeWithSave("both")}>
      <Text>Both</Text>
      <MaterialCommunityIcons
        name="check"
        color={buttonMode === "both" ? theme.colors.checkmark : "transparent"}
      />
    </TouchableOpacity>
  </View>
)}

// Handler function
const setButtonModeWithSave = async (mode: string) => {
  setButtonMode(mode)
  await coreCommunicator.sendSetButtonMode(mode)
}
```

### 3. Communication Implementation

#### CoreCommunicator.tsx

```typescript
async sendSetButtonMode(mode: string) {
  return await this.sendData({
    command: "set_button_mode",
    params: {
      mode: mode,
    },
  })
}
```

#### AugmentOsManagerMessageParser.java (android_core)

```java
case "set_button_mode":
    String mode = commandObject.getJSONObject("params").getString("mode");
    callback.setButtonMode(mode);
    break;
```

#### AugmentosService.java (android_core)

```java
@Override
public void setButtonMode(String mode) {
    Log.d("AugmentOsService", "Setting button mode: " + mode);
    // Save locally
    SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);
    prefs.edit().putString("button_press_mode", mode).apply();

    // Send to glasses if connected
    if (smartGlassesManager != null && smartGlassesManagerBound) {
        smartGlassesManager.sendButtonModeSetting(mode);
    }
}
```

#### MentraLiveSGC.java (android_core)

```java
// Add method to send settings
public void sendButtonModeSetting(String mode) {
    if (!isConnected()) {
        Log.w(TAG, "Cannot send button mode - not connected");
        return;
    }

    try {
        JSONObject json = new JSONObject();
        json.put("type", "button_mode_setting");
        json.put("mode", mode);
        sendJson(json);
    } catch (JSONException e) {
        Log.e(TAG, "Error creating button mode message", e);
    }
}

// Send settings after glasses_ready
case "glasses_ready":
    // ... existing initialization

    // Send user settings to glasses
    sendUserSettings();
    break;

private void sendUserSettings() {
    // Send button mode setting
    SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
    String buttonMode = prefs.getString("button_press_mode", "photo");
    sendButtonModeSetting(buttonMode);
}
```

### 4. Glasses Implementation (asg_client)

#### AsgClientService.java

```java
// Add settings instance
private AsgSettings asgSettings;

@Override
public void onCreate() {
    super.onCreate();
    // ... existing initialization
    asgSettings = new AsgSettings(this);
}

// Update JSON parsing
private void parseMessage(String jsonString) {
    try {
        JSONObject json = new JSONObject(jsonString);
        String type = json.optString("type", "");

        switch (type) {
            case "button_mode_setting":
                String mode = json.getString("mode");
                Log.d(TAG, "Received button mode setting: " + mode);
                asgSettings.setButtonPressMode(AsgSettings.ButtonPressMode.fromString(mode));
                break;
            // ... other cases
        }
    } catch (JSONException e) {
        Log.e(TAG, "Error parsing JSON message", e);
    }
}

// Update button press handling
public void parseK900Command(JSONObject json) {
    try {
        String command = json.optString("C", "");

        switch (command) {
            case "cs_pho":
                handleConfigurableButtonPress();
                break;
            // ... other cases
        }
    } catch (Exception e) {
        Log.e(TAG, "Error processing command", e);
    }
}

private void handleConfigurableButtonPress() {
    AsgSettings.ButtonPressMode mode = asgSettings.getButtonPressMode();

    switch (mode) {
        case PHOTO:
            // Current behavior - take photo only
            if (mMediaCaptureService != null) {
                mMediaCaptureService.takePhotoLocally();
            }
            break;

        case APPS:
            // Send to apps only
            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                sendButtonPressToPhone();
            }
            break;

        case BOTH:
            // Both actions
            if (mMediaCaptureService != null) {
                mMediaCaptureService.takePhotoLocally();
            }
            if (bluetoothManager != null && bluetoothManager.isConnected()) {
                sendButtonPressToPhone();
            }
            break;
    }
}

private void sendButtonPressToPhone() {
    try {
        JSONObject buttonObject = new JSONObject();
        buttonObject.put("type", "button_press");
        buttonObject.put("buttonId", "camera");
        buttonObject.put("pressType", "short");
        buttonObject.put("timestamp", System.currentTimeMillis());

        String jsonString = buttonObject.toString();
        Log.d(TAG, "Sending button press to phone: " + jsonString);
        bluetoothManager.sendData(jsonString.getBytes());
    } catch (JSONException e) {
        Log.e(TAG, "Error creating button press message", e);
    }
}
```

### 5. iOS Implementation

#### MentraLiveManager.swift

```swift
// Add after glasses_ready handling
private func sendUserSettings() {
    // Get button mode from UserDefaults
    let buttonMode = UserDefaults.standard.string(forKey: "button_press_mode") ?? "photo"
    sendButtonModeSetting(buttonMode)
}

private func sendButtonModeSetting(_ mode: String) {
    let json: [String: Any] = [
        "type": "button_mode_setting",
        "mode": mode
    ]
    sendJson(json)
}
```

#### AOSManager.swift

```swift
// Add command handling
case "set_button_mode":
    if let params = params, let mode = params["mode"] as? String {
        UserDefaults.standard.set(mode, forKey: "button_press_mode")
        // Forward to glasses if Mentra Live
        if let mentraLiveManager = smartGlassesManager as? MentraLiveManager {
            mentraLiveManager.sendButtonModeSetting(mode)
        }
    }
```

### 6. Status Reporting

Update status JSON to include button mode setting:

#### AugmentosService.java

```java
// In generateStatusJson()
if (glassesSettings != null) {
    // ... existing settings
    SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);
    glassesSettings.put("button_mode", prefs.getString("button_press_mode", "photo"));
}
```

#### AugmentOSStatusParser.tsx

```typescript
export interface GlassesSettings {
  // ... existing fields
  button_mode?: string
}
```

## Implementation Order

1. **Phase 1: Glasses Side (asg_client)**
   - Create AsgSettings class
   - Update button press handling logic
   - Add JSON message parsing for settings
   - Test with hardcoded values

2. **Phase 2: Phone Native (android_core & iOS)**
   - Add command parsing
   - Implement settings storage
   - Add BLE message sending
   - Send settings after glasses_ready

3. **Phase 3: React Native UI**
   - Update glassesFeatures.ts
   - Add UI to DeviceSettings.tsx
   - Implement CoreCommunicator method
   - Update status parsing

4. **Phase 4: Testing & Polish**
   - Test all three modes
   - Verify settings persist across restarts
   - Test iOS implementation
   - Add proper error handling

## Future Extensibility

This settings system can be extended for:

- Long press behavior configuration
- Different actions for different buttons
- Custom app-specific button mappings
- Gesture configurations
- Display brightness settings (already exists)
- Power management settings
- Audio routing preferences

The key is establishing the settings infrastructure first, then adding new settings becomes straightforward.

## Testing Plan

1. **Unit Tests**
   - Test AsgSettings class
   - Test button mode parsing
   - Test settings persistence

2. **Integration Tests**
   - Test BLE message flow
   - Test settings sync on connection
   - Test mode switching

3. **End-to-End Tests**
   - Change setting in app, verify behavior on glasses
   - Test all three modes
   - Test persistence across app/glasses restarts
   - Test behavior when disconnected

## Settings Loading Flow (App Startup)

When the app starts up, settings need to be loaded from native storage and made available to React Native through the status object. Here's how it works:

### 1. Android Native Loading

#### AugmentosService.java

```java
// In onCreate() or initialization
preferredMic = SmartGlassesManager.getPreferredMic(this);
// Also load button mode
buttonPressMode = SmartGlassesManager.getButtonPressMode(this);

// In generateStatusJson() - around line 1563 where glasses_settings is created
JSONObject glassesSettings = new JSONObject();
glassesSettings.put("auto_brightness", autoBrightness);
glassesSettings.put("brightness", brightnessLevel);
glassesSettings.put("head_up_angle", headUpAngle);
// Add button mode to settings
glassesSettings.put("button_mode", buttonPressMode != null ? buttonPressMode : "photo");
status.put("glasses_settings", glassesSettings);
```

#### SmartGlassesManager.java

```java
// Add new method similar to getPreferredMic
public static String getButtonPressMode(Context context) {
    return PreferenceManager.getDefaultSharedPreferences(context)
            .getString("button_press_mode", "photo");
}

public static void setButtonPressMode(Context context, String mode) {
    PreferenceManager.getDefaultSharedPreferences(context)
            .edit()
            .putString("button_press_mode", mode)
            .apply();
}
```

### 2. iOS Native Loading

#### AOSManager.swift

```swift
// Add property
private var buttonPressMode = "photo"

// In init() or viewDidLoad equivalent
buttonPressMode = UserDefaults.standard.string(forKey: "button_press_mode") ?? "photo"

// In getStatus() method where glasses_settings is built
let glassesSettings: [String: Any] = [
    "auto_brightness": autoBrightness,
    "brightness": brightnessLevel,
    "head_up_angle": headUpAngle ?? 20,
    "button_mode": buttonPressMode
]
```

### 3. React Native Status Parsing

#### AugmentOSStatusParser.tsx

```typescript
// Update GlassesSettings interface (around line 46)
interface GlassesSettings {
  brightness: number
  auto_brightness: boolean
  head_up_angle: number | null
  dashboard_height: number
  dashboard_depth: number
  button_mode?: string  // Add this field
}

// Update defaultStatus (around line 127)
glasses_settings: {
  brightness: 50,
  auto_brightness: false,
  dashboard_height: 4,
  dashboard_depth: 5,
  head_up_angle: 30,
  button_mode: "photo",  // Add default
}
```

### 4. React Native UI Update

#### DeviceSettings.tsx

```typescript
// Initialize from status instead of hardcoded value
const [buttonMode, setButtonMode] = useState(status.glasses_settings?.button_mode || "photo")

// Update whenever status changes
useEffect(() => {
  if (status.glasses_settings?.button_mode) {
    setButtonMode(status.glasses_settings.button_mode)
  }
}, [status.glasses_settings?.button_mode])
```

### Complete Data Flow

1. **App Startup**:
   - Native modules load settings from SharedPreferences/UserDefaults
   - Settings are included in status JSON via `generateStatusJson()`
2. **Status Updates**:
   - CoreCommunicator receives status updates from native
   - StatusProvider parses and distributes status
   - DeviceSettings component receives updated settings
3. **Setting Changes**:
   - User changes setting in UI
   - CoreCommunicator sends command to native
   - Native saves to SharedPreferences/UserDefaults
   - Native sends setting to glasses via BLE
   - Glasses save to their SharedPreferences
4. **Glasses Connection**:
   - On `glasses_ready`, phone sends all settings to glasses
   - Ensures glasses always have latest user preferences

This ensures settings are properly persisted and synchronized across app restarts, phone restarts, and glasses reconnections.

## Notes

- Default behavior should remain "photo" for backward compatibility
- Settings should persist on both phone and glasses
- If glasses are reset, phone should re-send settings on next connection
- Consider adding a "reset to defaults" option in the UI
- May want to add visual/audio feedback when mode changes
