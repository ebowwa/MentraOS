# MicrophoneManager Documentation

## Overview

MicrophoneManager handles all microphone state management for user sessions in MentraOS. It controls when the glasses' microphone is enabled/disabled based on app subscriptions and provides a keep-alive mechanism to ensure the client maintains microphone access.

## Core Responsibilities

1. **State Management**: Tracks microphone enabled/disabled state
2. **Debounced Updates**: Prevents rapid state changes from overwhelming the client
3. **Keep-Alive Messages**: Sends periodic reminders to maintain microphone access
4. **Subscription Coordination**: Responds to app audio subscription changes
5. **WebSocket Communication**: Sends state changes to glasses client

## Key Features

### Debounced State Updates

The manager implements intelligent debouncing to handle rapid state changes:
- **First Update**: Sent immediately
- **Subsequent Updates**: Debounced with configurable delay (default 1000ms)
- **Smart Coalescing**: Multiple rapid changes result in a single final update
- **State Tracking**: Only sends if final state differs from last sent state

### Microphone Keep-Alive

**Purpose**: Some glasses clients may release microphone access when the app goes to background (to allow other apps to use the mic). The keep-alive ensures the client maintains microphone access continuously, even while in the background.

**Behavior**:
- Sends `MICROPHONE_STATE_CHANGE` message every 10 seconds
- Only active when:
  - Microphone is enabled
  - WebSocket connection is open
  - Active media/audio subscriptions exist
- Automatically stops when conditions are no longer met
- Keeps the microphone active even when the app is backgrounded

### Subscription-Based Activation

The microphone automatically activates based on app needs:
- **PCM Audio**: Apps needing raw audio data
- **Transcription**: Apps needing speech-to-text
- **PCM or Transcription**: Apps that can work with either

The manager calculates the optimal `requiredData` array based on all active subscriptions.

## Message Protocol

### Outgoing Messages

**MICROPHONE_STATE_CHANGE**
```typescript
{
  type: CloudToGlassesMessageType.MICROPHONE_STATE_CHANGE,
  sessionId: string,
  userSession: {
    sessionId: string,
    userId: string,
    startTime: Date,
    activeAppSessions: string[],
    loadingApps: Set<string>,
    isTranscribing: boolean
  },
  isMicrophoneEnabled: boolean,
  requiredData: Array<'pcm' | 'transcription' | 'pcm_or_transcription'>,
  bypassVad: boolean,  // Bypass Voice Activity Detection for PCM
  timestamp: Date
}
```

## Edge Cases Handled

1. **Rapid Subscription Changes**
   - Debounced to prevent excessive state changes
   - Final state always reflects actual subscription needs

2. **WebSocket Disconnection**
   - Keep-alive pauses when connection is lost
   - Resumes automatically on reconnection

3. **Session Cleanup**
   - All timers properly cleared on disposal
   - Prevents memory leaks

4. **Glasses Connection State**
   - Checks subscriptions when glasses connect
   - Ensures proper initial microphone state

5. **VAD Bypass**
   - Automatically bypasses Voice Activity Detection when apps need PCM data
   - Ensures continuous audio stream for apps that process raw audio

## Integration Points

1. **UserSession**: Created and owned by each user session
2. **SubscriptionService**: Queries to determine if audio subscriptions exist
3. **WebSocket**: Sends state changes to glasses client
4. **AppManager**: Notified via subscription changes

## Usage Example

```typescript
// When app subscribes to audio
userSession.microphoneManager.handleSubscriptionChange();

// When glasses connect
userSession.microphoneManager.handleConnectionStateChange('CONNECTED');

// Manual state update
const requiredData = ['pcm', 'transcription'];
userSession.microphoneManager.updateState(true, requiredData, 1000);

// Cleanup
userSession.microphoneManager.dispose();
```

## Why This Design?

1. **Centralized Control**: All microphone logic in one place
2. **Reliability**: Keep-alive ensures consistent microphone access
3. **Efficiency**: Debouncing prevents unnecessary messages
4. **Flexibility**: Supports various audio processing needs
5. **Maintainability**: Clear separation of concerns

The keep-alive mechanism specifically addresses real-world issues where glasses clients lose microphone access when backgrounded, ensuring continuous audio capture even while the app remains in the background.