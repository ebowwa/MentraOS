# Simulated Glasses Test Controls Implementation Plan

## Overview

This document outlines the plan to add test controls (head up/down events and button presses) to the fullscreen glasses mirror page when using Simulated Glasses. These controls will only appear for simulated glasses and will allow developers to test all glasses functionality without physical hardware.

## Current State Analysis

### Existing Components

1. **Simulated Glasses Detection**: Already implemented in native modules (iOS/Android)
2. **Glasses Mirror**: Full-screen view at `/mirror/fullscreen` with camera overlay
3. **Event Infrastructure**: WebSocket connections and event routing already exist
4. **Native Integration**: Both iOS and Android have structures for handling glasses events

### Key Findings

- **iOS**: Head position events are detected but NOT sent to the cloud (missing implementation)
- **Android**: Head position events are properly sent to the cloud via WebSocket
- **Button Press**: Both platforms support button press events and send them to the cloud
- **Simulated Glasses**: Currently bypasses hardware event handling

### Dashboard System Analysis

#### How Dashboard Works on Real Glasses

**iOS (Even Realities G1)**:

- Head up detection sets `isHeadUp = true` in `ERG1Manager`
- `AOSManager` observes this change and calls `sendCurrentState(true)`
- Switches to dashboard view state (`viewStates[1]`)
- Dashboard shows templated content: `"$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS"`
- Placeholders are replaced with actual values
- Content is sent directly to glasses via Bluetooth
- **NOTE**: Head position is NOT sent to server (missing implementation)

**Android**:

- Head up event triggers `onGlassesHeadUpEvent()` in `AugmentosService`
- Sends head position to server: `ServerComms.sendHeadPosition("up")`
- If `contextualDashboardEnabled`, calls `displayGlassesDashboardEvent()`
- Shows either cached dashboard data or fallback dashboard
- Uses `WindowManagerWithTimeouts` for layered display management
- Dashboard remains visible until head down or timeout

#### Glasses Mirror Behavior

- `GlassesDisplayMirror` component displays whatever it receives via `GLASSES_DISPLAY_EVENT`
- It's passive - doesn't differentiate between normal content and dashboard
- Display events are emitted by native modules when sending content to glasses
- The mirror automatically shows these events, creating the "mirror" effect

## Implementation Strategy

### Architecture Overview

```
React Native UI (Test Controls)
    ↓
Native Bridge (New Methods)
    ↓
Native Modules (iOS/Android)
    ↓
Existing WebSocket Infrastructure
    ↓
Cloud Backend
```

### Phase 1: Native Module Extensions

#### iOS Implementation (`mobile/ios`)

1. **Add to `ServerComms.swift`** (Fix missing head position sending):

```swift
func sendHeadPosition(isUp: Bool) {
    do {
        let event: [String: Any] = [
            "type": "head_position",
            "position": isUp ? "up" : "down",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000)
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: event)
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            wsManager.sendText(jsonString)
        }
    } catch {
        CoreCommsService.log("Error sending head position: \(error)")
    }
}

func sendSimulatedButtonPress(buttonId: String = "camera", pressType: String = "short") {
    do {
        let event: [String: Any] = [
            "type": "button_press",
            "buttonId": buttonId,
            "pressType": pressType,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000)
        ]

        let jsonData = try JSONSerialization.data(withJSONObject: event)
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            wsManager.sendText(jsonString)
        }
    } catch {
        CoreCommsService.log("Error sending button press: \(error)")
    }
}
```

2. **Update `AOSManager.swift`** (Add server notification for real glasses):

```swift
// In the existing head position observer
g1Manager!.$isHeadUp.sink { [weak self] (value: Bool) in
    guard let self = self else { return }
    self.sendCurrentState(value)
    // Add this line to send to server (currently missing)
    ServerComms.shared.sendHeadPosition(isUp: value)
}.store(in: &cancellables)
```

3. **Add to `CoreCommunicator.swift`** (React Native Bridge):

```swift
@objc(simulateHeadPosition:)
func simulateHeadPosition(_ position: String) {
    guard AOSManager.shared.connectedGlassesInfo?.modelName.contains("Simulated") == true else {
        return // Only allow for simulated glasses
    }

    // Send to server
    ServerComms.shared.sendHeadPosition(isUp: position == "up")

    // Trigger dashboard display locally
    AOSManager.shared.sendCurrentState(position == "up")
}

@objc(simulateButtonPress:pressType:)
func simulateButtonPress(_ buttonId: String, pressType: String) {
    guard AOSManager.shared.connectedGlassesInfo?.modelName.contains("Simulated") == true else {
        return // Only allow for simulated glasses
    }

    ServerComms.shared.sendSimulatedButtonPress(buttonId: buttonId, pressType: pressType)
}
```

#### Android Implementation (`augmentos_core`)

1. **Add to `CoreCommunicator.java`** (React Native Module):

```java
@ReactMethod
public void simulateHeadPosition(String position) {
    AugmentosService service = AugmentosService.getInstance();
    if (service != null && service.getConnectedGlassesModelName().contains("Simulated")) {
        // Send to server
        ServerComms.getInstance().sendHeadPosition(position);

        // Trigger dashboard display locally
        if (position.equals("up")) {
            service.onGlassesHeadUpEvent(new GlassesHeadUpEvent());
        } else {
            service.onGlassesHeadDownEvent(new GlassesHeadDownEvent());
        }
    }
}

@ReactMethod
public void simulateButtonPress(String buttonId, String pressType) {
    AugmentosService service = AugmentosService.getInstance();
    if (service != null && service.getConnectedGlassesModelName().contains("Simulated")) {
        JSONObject event = new JSONObject();
        try {
            event.put("type", "button_press");
            event.put("buttonId", buttonId);
            event.put("pressType", pressType);
            event.put("timestamp", System.currentTimeMillis());
            ServerComms.getInstance().sendButtonPress(event);

            // Also post to EventBus for local handling
            EventBus.getDefault().post(new ButtonPressEvent(buttonId, pressType));
        } catch (JSONException e) {
            Log.e(TAG, "Error creating button press event", e);
        }
    }
}
```

### Phase 2: React Native UI Components

1. **Create Test Controls Component** (`src/components/misc/SimulatedGlassesControls.tsx`):

```typescript
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { NativeModules } from 'react-native';

const { CoreCommunicator } = NativeModules;

export const SimulatedGlassesControls: React.FC = () => {
  const handleHeadUp = () => {
    CoreCommunicator.simulateHeadPosition('up');
  };

  const handleHeadDown = () => {
    CoreCommunicator.simulateHeadPosition('down');
  };

  const handleButtonPress = (pressType: 'short' | 'long') => {
    CoreCommunicator.simulateButtonPress('camera', pressType);
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Head Position</Text>
        <TouchableOpacity onPress={handleHeadUp} style={styles.button}>
          <Text>Head Up</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleHeadDown} style={styles.button}>
          <Text>Head Down</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Button Press</Text>
        <TouchableOpacity onPress={() => handleButtonPress('short')} style={styles.button}>
          <Text>Short Press</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleButtonPress('long')} style={styles.button}>
          <Text>Long Press</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
```

2. **Update Fullscreen Mirror** (`src/app/mirror/fullscreen.tsx`):

- Add state to track if simulated glasses are connected
- Conditionally render `SimulatedGlassesControls` component
- Position controls as floating overlay on camera view

### Phase 3: Integration and Testing

1. **Test Event Flow**:
   - Verify events reach the cloud backend
   - Ensure Apps subscribed to head position and button press streams receive events
   - Test that controls only appear for simulated glasses

2. **UI/UX Refinements**:
   - Add visual feedback when buttons are pressed
   - Consider adding gesture controls (swipe up/down for head position)
   - Add option to hide/show controls

3. **Documentation**:
   - Update developer documentation
   - Add examples of testing with simulated glasses

## Implementation Timeline

1. **Week 1**: Implement native module extensions (iOS & Android)
2. **Week 2**: Create React Native UI components and integrate with fullscreen mirror
3. **Week 3**: Testing, refinement, and documentation

## Considerations

### Security

- Controls only work when simulated glasses are connected
- Native modules verify glasses type before sending events

### Performance

- Events use existing WebSocket infrastructure
- No additional overhead for real glasses

### Future Enhancements

1. Add more button types (volume, power)
2. Support continuous head tracking (angles)
3. Add gesture recognition for more natural testing
4. Record and replay test sequences

## Success Criteria

1. ✅ Head up/down events can be triggered from UI
2. ✅ Dashboard appears/disappears on head up/down in glasses mirror
3. ✅ Head position events reach server (fixing iOS implementation)
4. ✅ Button press events (short/long) can be triggered from UI
5. ✅ Controls only appear for simulated glasses
6. ✅ Events reach cloud and subscribed Apps
7. ✅ No impact on real glasses functionality

## Important Implementation Notes

### Dashboard Display Flow

When implementing head up/down simulation, ensure:

1. **Server notification**: Head position is sent to cloud (currently missing on iOS)
2. **Local dashboard trigger**: Native dashboard display logic is triggered
3. **Mirror update**: Dashboard content flows to `GlassesDisplayMirror` via display events

### Key Differences Between Platforms

- **iOS**: Needs both `sendHeadPosition()` implementation and server notification in head observer
- **Android**: Already sends to server, just need to trigger local event handlers
- Both platforms should trigger their existing dashboard display logic for proper mirror behavior
