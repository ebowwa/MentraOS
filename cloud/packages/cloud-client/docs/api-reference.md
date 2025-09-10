# API Reference

Complete API documentation for the AugmentOS Cloud Client.

## MentraClient

The main client class for connecting to and interacting with the AugmentOS cloud platform.

### Constructor

```typescript
constructor(config: ClientConfig)
```

Creates a new MentraClient instance with the specified configuration.

#### Parameters
- `config: ClientConfig` - Client configuration object

#### Example
```typescript
const client = new MentraClient({
  email: 'user@example.com',
  serverUrl: 'ws://localhost:3001'
});
```

---

### Connection Methods

#### connect()
```typescript
async connect(serverUrl?: string): Promise<void>
```

Establishes WebSocket connection to the AugmentOS cloud server.

**Parameters:**
- `serverUrl?: string` - Optional server URL to override the default from config

**Throws:**
- `Error` - If connection fails or authentication is invalid

**Example:**
```typescript
// Connect to default server
await client.connect();

// Connect to specific server
await client.connect('ws://staging.example.com');
```

#### disconnect()
```typescript
async disconnect(): Promise<void>
```

Closes the WebSocket connection and cleans up resources.

**Example:**
```typescript
await client.disconnect();
```

#### isConnected()
```typescript
isConnected(): boolean
```

Returns the current connection status.

**Returns:**
- `boolean` - True if connected, false otherwise

---

### Audio & Voice Methods

#### startSpeakingFromFile()
```typescript
async startSpeakingFromFile(filePath: string): Promise<void>
```

Streams audio from a file in real-time. The method waits for the entire file to finish streaming before resolving.

**Parameters:**
- `filePath: string` - Path to audio file to stream

**Example:**
```typescript
// Stream a 5-second audio file (takes ~5 seconds to complete)
await client.startSpeakingFromFile('./audio/test-phrase.wav');
console.log('Audio streaming completed');
```

#### startSpeakingFromStream()
```typescript
startSpeakingFromStream(stream: AudioStream): void
```

Streams audio from a provided audio stream. Works with any stream-like object.

**Parameters:**
- `stream: AudioStream` - Audio stream object with data events

**Example:**
```typescript
// Node.js microphone stream
const micStream = recorder.record({ sampleRate: 16000 });
client.startSpeakingFromStream(micStream.stream());

// File stream
const fileStream = fs.createReadStream('./audio/test.wav');
client.startSpeakingFromStream(fileStream);
```

#### startSpeaking()
```typescript
startSpeaking(): void
```

Sends VAD (Voice Activity Detection) signal only, without streaming audio chunks.

**Example:**
```typescript
// Send VAD true signal only
client.startSpeaking();
```

#### stopSpeaking()
```typescript
stopSpeaking(): void
```

Stops voice activity (VAD false) and ends audio streaming.

**Example:**
```typescript
client.stopSpeaking();
```

---

### Head Position & Display Methods

#### lookUp()
```typescript
lookUp(): void
```

Sends head position "up" event, switching to dashboard view if enabled.

**Example:**
```typescript
client.lookUp();
```

#### lookDown()
```typescript
lookDown(): void
```

Sends head position "down" event, switching to main view.

**Example:**
```typescript
client.lookDown();
```

#### getVisibleContent()
```typescript
getVisibleContent(): DisplayRequest | null
```

Returns the currently visible display content based on head position and dashboard state.

**Returns:**
- `DisplayRequest | null` - The visible display request, or null if nothing is displayed

**Example:**
```typescript
const content = client.getVisibleContent();
if (content) {
  console.log('Visible:', content.content);
}
```

---

### App Management Methods

#### startApp()
```typescript
async startApp(packageName: string): Promise<void>
```

Requests to start an app with the specified package name.

**Parameters:**
- `packageName: string` - The package name of the app to start

**Example:**
```typescript
await client.startApp('com.augmentos.translator');
```

#### stopApp()
```typescript
async stopApp(packageName: string): Promise<void>
```

Requests to stop an app with the specified package name.

**Parameters:**
- `packageName: string` - The package name of the app to stop

**Example:**
```typescript
await client.stopApp('com.augmentos.translator');
```

#### getRunningApps()
```typescript
getRunningApps(): string[]
```

Returns a list of currently running app package names.

**Returns:**
- `string[]` - Array of package names for running apps

**Example:**
```typescript
const apps = client.getRunningApps();
console.log('Running apps:', apps);
```

---

### Location Methods

#### updateLocation()
```typescript
updateLocation(lat: number, lng: number): void
```

Sends a location update with the specified coordinates.

**Parameters:**
- `lat: number` - Latitude coordinate
- `lng: number` - Longitude coordinate

**Example:**
```typescript
// Update location to San Francisco
client.updateLocation(37.7749, -122.4194);
```

---

### Event Handling

#### on()
```typescript
on(event: string, handler: Function): void
```

Registers an event handler for the specified event type.

**Parameters:**
- `event: string` - Event type to listen for
- `handler: Function` - Callback function to handle the event

**Supported Events:**
- `'display_event'` - Display/layout updates from cloud
- `'app_state_change'` - App lifecycle state changes
- `'connection_ack'` - Connection acknowledgment
- `'settings_update'` - Settings updates from cloud
- `'microphone_state_change'` - Microphone state changes

**Example:**
```typescript
client.on('display_event', (display) => {
  console.log('New display:', display.content);
});

client.on('app_state_change', (state) => {
  console.log('App state changed:', state);
});
```

---

## Configuration Interfaces

### ClientConfig

```typescript
interface ClientConfig {
  // Required
  email: string;
  serverUrl: string;
  
  // Optional
  coreToken?: string;
  audio?: AudioConfig;
  device?: DeviceConfig;
  behavior?: BehaviorConfig;
  debug?: DebugConfig;
}
```

#### Required Properties

**email**: `string`
- User email for authentication and account creation

**serverUrl**: `string`
- WebSocket URL for the AugmentOS cloud server
- Example: `'ws://localhost:3001'`

#### Optional Properties

**coreToken**: `string`
- Pre-existing core token for authentication
- If not provided, will attempt to create account automatically

**audio**: `AudioConfig`
- Audio streaming configuration

**device**: `DeviceConfig`
- Device simulation parameters

**behavior**: `BehaviorConfig`
- Client behavior settings

**debug**: `DebugConfig`
- Debugging and logging options

---

### AudioConfig

```typescript
interface AudioConfig {
  format: 'pcm16' | 'wav';
  sampleRate: 16000 | 48000;
  chunkSize: number;
}
```

**format**: `'pcm16' | 'wav'`
- Audio format for streaming
- Default: `'pcm16'`

**sampleRate**: `16000 | 48000`
- Audio sample rate in Hz
- Default: `16000`

**chunkSize**: `number`
- Size of audio chunks in bytes
- Default: `1600` (100ms at 16kHz)


---

### DeviceConfig

```typescript
interface DeviceConfig {
  model: string;
  batteryLevel: number;
  brightness: number;
}
```

**model**: `string`
- Smart glasses model name
- Default: `'Even Realities G1'`

**batteryLevel**: `number`
- Simulated battery level (0-100)
- Default: `85`

**brightness**: `number`
- Simulated brightness level (0-100)
- Default: `50`

---

### BehaviorConfig

```typescript
interface BehaviorConfig {
  statusUpdateInterval: number;
  locationUpdateInterval: number;
  reconnectOnDisconnect: boolean;
}
```

**statusUpdateInterval**: `number`
- Milliseconds between automatic status updates
- Default: `10000` (10 seconds)

**locationUpdateInterval**: `number`
- Milliseconds between automatic location updates
- Default: `5000` (5 seconds)

**reconnectOnDisconnect**: `boolean`
- Automatically reconnect if connection drops
- Default: `true`

---

### DebugConfig

```typescript
interface DebugConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  saveMetrics: boolean;
  logWebSocketMessages: boolean;
}
```

**logLevel**: `'debug' | 'info' | 'warn' | 'error'`
- Minimum log level to output
- Default: `'info'`

**saveMetrics**: `boolean`
- Save performance and usage metrics
- Default: `false`

**logWebSocketMessages**: `boolean`
- Log all WebSocket messages for debugging
- Default: `false`

---

## Event Types

### DisplayEvent
Fired when the cloud sends a display/layout update.

```typescript
interface DisplayEvent {
  view: 'dashboard' | 'main';
  content: string;
  layout: Layout;
  timestamp: Date;
}
```

### AppStateChange
Fired when an app's lifecycle state changes.

```typescript
interface AppStateChange {
  packageName: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  timestamp: Date;
}
```

### ConnectionAck
Fired when the connection is acknowledged by the server.

```typescript
interface ConnectionAck {
  sessionId: string;
  userSession: any;
  timestamp: Date;
}
```

---

## Error Handling

The client throws errors for various failure conditions:

### Connection Errors
```typescript
try {
  await client.connect();
} catch (error) {
  if (error.message.includes('authentication')) {
    // Handle auth failure
  } else if (error.message.includes('connection')) {
    // Handle connection failure
  }
}
```

### Common Error Types
- **Authentication errors**: Invalid token or account creation failure
- **Connection errors**: Network issues or server unavailable
- **Protocol errors**: Invalid message format or unsupported operation
- **Audio errors**: Audio file not found or invalid format

---

## Best Practices

### Connection Management
```typescript
// Always disconnect when done
try {
  await client.connect();
  // ... do work
} finally {
  await client.disconnect();
}
```

### Event Handling
```typescript
// Set up event handlers before connecting
client.on('display_event', handleDisplay);
client.on('app_state_change', handleAppState);
await client.connect();
```

### Error Recovery
```typescript
client.on('error', (error) => {
  console.error('Client error:', error);
  // Implement retry logic
});
```

### Resource Cleanup
```typescript
// Clean up resources
await client.disconnect();
// Remove event listeners if needed
```