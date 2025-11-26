# Client SDK API Reference

This document provides a comprehensive reference for the `@mentra/client-sdk` API. It is intended for developers building tools, simulators, or stress tests using the headless client.

> [!NOTE]
> Some modules (Audio/Video) are currently in development. Their APIs are specified here as a contract for future implementation.

## `MentraClient`

The main entry point for the SDK. Manages the connection to MentraOS Cloud and coordinates all modules.

### Configuration

```typescript
interface ClientConfig {
  /** MentraOS Cloud host (e.g., "api.mentra.systems") */
  host: string;
  /** Authentication token (API Key or User Token) */
  token: string;
  /** Whether to use secure connection (wss/https). Default: true */
  secure?: boolean;
  /** Device information */
  deviceInfo?: {
    modelName: string;
    firmwareVersion: string;
  };
  /** Custom transport implementation (optional) */
  transport?: TransportLayer;
}
```

### Constructor

```typescript
const client = new MentraClient(config: ClientConfig);
```

### Methods

#### `connect()`
Establishes a connection to the MentraOS Cloud.
- **Returns**: `Promise<void>`
- **Throws**: Error if connection fails.

#### `disconnect()`
Closes the connection.
- **Returns**: `void`

### Events

The `MentraClient` extends `EventEmitter`.

- **`connected`**: Emitted when the connection is successfully established.
- **`disconnected`**: Emitted when the connection is closed. Payload: `{ code: number, reason: string }`.
- **`error`**: Emitted on connection or protocol errors. Payload: `Error`.
- **`message`**: Emitted for every incoming message. Payload: `CloudToGlassesMessage`.
- **`[message_type]`**: Emitted for specific message types (e.g., `display_event`).

---

## `HardwareModule` (`client.hardware`)

Simulates physical hardware interactions.

### Methods

#### `pressButton(buttonId: string, pressType?: "short" | "long")`
Simulates a button press.
- `buttonId`: ID of the button (e.g., "main", "volume_up").
- `pressType`: Default is "short".

#### `sendTouch(gestureName: string)`
Simulates a touch gesture.
- `gestureName`: e.g., "tap", "swipe_forward", "swipe_back".

#### `updateHeadPosition(position: "up" | "down")`
Simulates a head position change (e.g., looking up/down).

#### `setVadStatus(isSpeaking: boolean)`
Simulates Voice Activity Detection (VAD) status changes.

---

## `AppModule` (`client.apps`)

Manages installed and running applications. Designed to be reactive for UI binding.

### Properties

- `installed`: `AppInfo[]` (List of all available apps)
- `running`: `string[]` (List of package names currently running)
- `foreground`: `string | null` (Package name of the app currently on display)

### Methods

#### `listApps(): Promise<AppInfo[]>`
Refreshes the list of available applications from the Cloud.

#### `startApp(packageName: string): Promise<void>`
Starts an application.

#### `stopApp(packageName: string): Promise<void>`
Stops a running application.

#### `uninstallApp(packageName: string): Promise<void>`
Uninstalls an application.

### Events
- **`installed`**: Emitted when the installed app list changes.
- **`running`**: Emitted when the running app list changes.
- **`foreground`**: Emitted when the foreground app changes.

---

## `DeviceState` (`client.state`)

Manages the virtual device's state and reflects the current "world view" of the client.

### Properties
- `batteryLevel`: number (0-100)
- `isCharging`: boolean
- `wifi`: `{ connected: boolean, ssid?: string, ip?: string }`
- `display`: `{ view: "main" | "dashboard", layout?: Layout }`
- `microphone`: `{ bypassVad: boolean, requiredData: string[] }`
- `location`: `{ lat: number, lng: number } | null`

### Methods

#### `setBattery(level: number, charging: boolean)`
Updates battery state and sends an update to the Cloud.

#### `setWifi(connected: boolean, ssid?: string, ip?: string)`
Updates WiFi state and sends an update to the Cloud.

#### `setLocation(lat: number, lng: number)`
Updates location state and emits event.

---

## `AudioModule` (`client.audio`) [PLANNED]

Handles audio streaming via LiveKit. Designed to be environment-agnostic (Node.js, Browser, React Native).

### Interfaces

```typescript
interface AudioSource {
  /**
   * Called when the source should start producing data.
   * @param onData Callback to receive PCM data (Int16Array, 16kHz, Mono)
   */
  start(onData: (data: Int16Array) => void): void;
  
  /**
   * Called when the source should stop.
   */
  stop(): void;
}

interface AudioSink {
  /**
   * Called when new audio data is received from the Cloud.
   * @param data PCM data (Int16Array, 16kHz, Mono)
   */
  write(data: Int16Array): void;
  
  close(): void;
}
```

### Methods

#### `setInputSource(source: AudioSource)`
Sets the custom audio input source. The SDK will provide built-in implementations:
- `MicrophoneSource` (Node.js/Browser/React Native)
- `FileSource` (Stream from .wav file)
- `SilenceSource` (Generate silence)

#### `setOutputSink(sink: AudioSink)`
Sets the custom audio output sink. The SDK will provide built-in implementations:
- `SpeakerSink` (Node.js/Browser/React Native)
- `FileSink` (Write to .wav file)

---

## `VideoModule` (`client.video`) [PLANNED]

---

## `VideoModule` (`client.video`) [PLANNED]

Handles video streaming via RTMP.

### Interfaces

```typescript
interface VideoSource {
  /**
   * Called when the Cloud requests a video stream.
   * @param rtmpUrl The destination URL to stream to.
   */
  startStream(rtmpUrl: string): Promise<void>;
  
  /**
   * Called when the stream should stop.
   */
  stopStream(): Promise<void>;
}
```

### Methods

#### `setVideoSource(source: VideoSource)`
Sets the custom video source. Built-in implementations:
- `FFmpegSource` (Node.js: Captures camera/screen and streams via ffmpeg)
- `FileSource` (Node.js: Streams a video file via ffmpeg)
- `MockSource` (Logs requests, simulates status updates)

---

## Authentication
The SDK requires a **Core Token** to connect. You can obtain this using your API Key or User Token.

### Static Methods

#### `MentraClient.exchangeToken(host: string, token: string, provider: 'supabase' | 'authing'): Promise<string>`
Exchanges a third-party token for a Core Token.

```typescript
const coreToken = await MentraClient.exchangeToken("api.mentra.glass", "my-supabase-token", "supabase");
const client = new MentraClient({ host: "api.mentra.glass", token: coreToken });
await client.connect();
```

---

## `LocationModule` (`client.location`)

Manages location updates and tiers.

### Methods

#### `setTier(tier: "realtime" | "tenMeters" | "hundredMeters" | "kilometer" | "threeKilometers" | "reduced")`
Sets the location tracking tier.

#### `requestSingleLocation(accuracy: string, correlationId: string)`
Requests a single location update with specified accuracy.

---

## `CalendarModule` (`client.calendar`)

Manages calendar synchronization.

### Methods

#### `syncEvents(events: CalendarEvent[])`
Sends calendar events to the Cloud.
- `CalendarEvent`: Standard calendar event object (title, start, end, etc.)

---

## `AudioPlayerModule` (`client.audioPlayer`)

Handles requests from the Cloud to play specific audio files (e.g., TTS, sound effects).

### Methods

#### `onPlayRequest(callback: (url: string, requestId: string) => Promise<void>)`
Register a handler for audio play requests. The SDK provides a default implementation using standard web/node APIs, but this can be overridden.

---

## `SystemModule` (`client.system`)

Handles system-level reporting.

### Methods

#### `sendErrorReport(error: any)`
Reports an error to the Cloud.

#### `sendFeedback(text: string)`
Sends user feedback to the Cloud.


---

## `SettingsModule` (`client.settings`)

Manages user and app settings.

### Methods

#### `updateSettings(settings: any): Promise<void>`
Updates global user settings.

#### `getAppSettings(appName: string): Promise<any>`
Retrieves settings for a specific app.

#### `updateAppSettings(appName: string, settings: any): Promise<void>`
Updates settings for a specific app.

---

## `NotificationModule` (`client.notifications`)

Handles sending notifications from the client (e.g., phone notifications) to the Cloud.

### Methods

#### `sendNotification(notification: NotificationData): Promise<void>`
Sends a notification to the Cloud.
- `NotificationData`: `{ title: string, body: string, appName: string, ... }`

