# Hardware Requirements

The hardware requirements feature allows app developers to specify what hardware components their app needs to function properly. This ensures users are informed about compatibility before installing apps and prevents incompatible apps from launching.

## Overview

1. **Developer Declaration**: Developers specify hardware requirements in the developer portal
2. **Installation Check**: The system checks compatibility when users try to install apps
3. **Launch Validation**: Apps are validated for hardware compatibility before starting
4. **User Feedback**: Clear messages inform users about compatibility issues

## Supported Hardware Types

The following hardware components can be specified as requirements:

| Hardware Type | Description                                  |
| ------------- | -------------------------------------------- |
| `CAMERA`      | Device camera for photo/video capture        |
| `DISPLAY`     | Screen for visual output                     |
| `MICROPHONE`  | Microphone for audio input                   |
| `SPEAKER`     | Speaker for audio output                     |
| `IMU`         | Inertial Measurement Unit for motion sensing |
| `BUTTON`      | Physical buttons for user interaction        |
| `LIGHT`       | LED lights for indicators                    |
| `WIFI`        | WiFi connectivity                            |

## Requirement Levels

Each hardware requirement has a level that determines how the app behaves:

### Required Hardware

- **Level**: `REQUIRED`
- **Behavior**: App cannot install or run without this hardware
- **User Experience**: Installation blocked with error message
- **Use Case**: Essential functionality that app cannot work without

### Optional Hardware

- **Level**: `OPTIONAL`
- **Behavior**: App can install and run but may have limited functionality
- **User Experience**: Installation/launch allowed
- **Use Case**: Enhanced features that improve the experience but aren't essential

## Setting Hardware Requirements

### In the Developer Portal

1. Navigate to your app in the developer portal
2. Go to the "App Details" section
3. Find the "Hardware Requirements" section
4. Click "Add Hardware Requirement"
5. Select the hardware type, requirement level, and add a description
6. Save your changes

### Example Requirements

**Camera App Requirements:**

```
- Camera: REQUIRED - "Needed to capture photos and videos"
- Button: OPTIONAL - "For easier photo capture"
```

**Notification Reader:**

```
- Display: REQUIRED - "Needed to show notifications"
- Speaker: OPTIONAL - "For audio notifications"
```

**Fitness Tracker:**

```
- Display: OPTIONAL - "Shows workout metrics"
- IMU: REQUIRED - "Tracks movement and activity"
```

## User Experience

### App Store

- Hardware requirements are displayed as badges on app cards
- Required hardware shown in red, optional in yellow
- Detailed requirements visible on app details page
- Compatibility status shown based on connected glasses

### Installation

When users try to install an incompatible app:

```
Hardware Incompatible

This app requires hardware that is not available on your connected glasses:
- Camera: Needed to capture photos and videos
- Microphone: Required for voice commands

[OK]
```

### App Launch

When users try to launch an incompatible app:

```
Hardware Incompatible

MyApp requires a camera which is not available on your connected glasses

[OK]
```

## Best Practices

### For Developers

1. **Be Specific**: Add clear descriptions explaining why hardware is needed
2. **Minimize Requirements**: Only mark hardware as REQUIRED if absolutely necessary
3. **Graceful Degradation**: Use OPTIONAL for non-essential features
4. **Test Compatibility**: Test your app on different glasses models
5. **Update Requirements**: Keep requirements current as your app evolves

### Description Guidelines

Good descriptions:

- ✅ "Camera required to scan QR codes"
- ✅ "Microphone needed for voice commands"
- ✅ "Button enables quick photo capture"

Poor descriptions:

- ❌ "App needs camera"
- ❌ "Required for functionality"
- ❌ "Hardware needed"

## Technical Implementation

### API Fields

Hardware requirements are stored as an array in the app model:

```typescript
interface HardwareRequirement {
  type: HardwareType
  level: HardwareRequirementLevel
  description?: string
}

interface App {
  // ... other fields
  hardwareRequirements?: HardwareRequirement[]
}
```

### Compatibility Checking

The system automatically checks compatibility:

1. **Installation**: Before allowing app installation
2. **Launch**: Before starting an app
3. **Display**: When showing apps in the store

## Supported Glasses Models

Hardware capabilities are defined for:

- **Even Realities G1**
- **Vuzix Z100**
- **Mentra Live**
- **Simulated Glasses**
