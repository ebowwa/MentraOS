# Cloud Client Documentation

The Cloud Client is a pure TypeScript SDK for connecting to and interacting with the AugmentOS cloud platform. It provides a clean, production-ready interface that can be used for testing, development, and real applications.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [API Reference](#api-reference)
- [Testing Utilities](#testing-utilities)
- [Examples](#examples)

## Quick Start

```typescript
import { MentraClient } from '@augmentos/cloud-client';

const client = new MentraClient({
  email: 'user@example.com',
  serverUrl: 'ws://localhost:3001'
});

// Connect and interact
await client.connect();
await client.startApp('com.augmentos.translator');
client.lookUp();
await client.startSpeakingFromFile('./audio/hello-world.wav');
client.lookDown();
await client.disconnect();
```

## Architecture Overview

The Cloud Client mirrors the AugmentOS cloud architecture with clean separation of concerns:

### Core Client
- **MentraClient**: Main client class with clean public API
- Pure SDK that could be used in production applications

### Internal Managers
- **WebSocketManager**: Handles connection and message protocol
- **AudioManager**: Manages audio streaming and VAD
- **AppManager**: Tracks app lifecycle and state
- **LocationManager**: Handles GPS and location updates
- **DisplayManager**: Tracks dashboard/main view state

### External Testing Utilities
- **TranscriptionBenchmark**: Performance and accuracy testing
- **StressTestRunner**: Multi-client load testing
- **AudioSynthesizer**: Text-to-speech and test audio generation
- **AuthService**: Test account creation

## API Reference

### Core Methods

#### Connection Management
```typescript
await client.connect(serverUrl?: string)    // Connect to server (optional override)
await client.disconnect()                   // Disconnect from server
client.isConnected(): boolean               // Check connection status
```

#### Audio & Voice
```typescript
await client.startSpeakingFromFile(filePath: string)  // Stream audio file (real-time)
client.startSpeakingFromStream(stream: AudioStream)   // Stream from audio source
client.startSpeaking()                                // VAD signal only (no audio)
client.stopSpeaking()                                 // Stop VAD + audio streaming
```

#### Head Position & Display
```typescript
client.lookUp()                             // Switch to dashboard view
client.lookDown()                           // Switch to main view
client.getVisibleContent(): DisplayRequest  // Get currently visible content
```

#### App Management
```typescript
await client.startApp(packageName: string)  // Launch app
await client.stopApp(packageName: string)   // Stop app
client.getRunningApps(): string[]           // Get active apps
```

#### Location
```typescript
client.updateLocation(lat: number, lng: number)  // Send GPS coordinates
```

#### Event Handling
```typescript
client.on('display_event', (layout) => {    // Listen for display updates
  console.log('New content:', layout.content);
});

client.on('app_state_change', (state) => {  // Listen for app lifecycle
  console.log('App state:', state);
});
```

### Configuration

```typescript
interface ClientConfig {
  // Required
  email: string;
  serverUrl: string;
  
  // Optional
  coreToken?: string;                        // Skip if you want auto-account creation
  
  // Audio settings
  audio?: {
    format: 'pcm16' | 'wav';
    sampleRate: 16000 | 48000;
    chunkSize: number;                       // bytes per chunk
  };
  
  // Device simulation
  device?: {
    model: string;                           // 'Even Realities G1'
    batteryLevel: number;                    // 0-100
    brightness: number;                      // 0-100
  };
  
  // Behavior
  behavior?: {
    statusUpdateInterval: number;            // ms between status updates
    locationUpdateInterval: number;          // ms between location updates
    reconnectOnDisconnect: boolean;          // auto-reconnect on drop
  };
  
  // Debugging
  debug?: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    saveMetrics: boolean;
    logWebSocketMessages: boolean;
  };
}
```

## Testing Utilities

### Transcription Benchmarking
```typescript
import { TranscriptionBenchmark } from '@augmentos/cloud-client/testing';

const benchmark = new TranscriptionBenchmark(client);

// Measure transcription latency and accuracy
const result = await benchmark.measureLatency('./test-audio.wav', {
  expectedWords: [
    { text: 'hello', startTime: 1000, endTime: 1500 },
    { text: 'world', startTime: 2000, endTime: 2500 }
  ]
});

console.log('Average latency:', result.averageLatency);
console.log('Accuracy:', result.accuracy);
```

### Stress Testing
```typescript
import { StressTestRunner } from '@augmentos/cloud-client/testing';

// Spawn multiple clients
const clients = await StressTestRunner.spawnClients(1000, {
  email: 'stress-test-{id}@example.com',
  serverUrl: 'ws://localhost:3001'
});

// Run coordinated test
await StressTestRunner.coordinatedTest(clients, {
  name: 'Audio Flood Test',
  duration: 300000,  // 5 minutes
  actions: [
    { type: 'startSpeaking', delay: 0 },
    { type: 'stopSpeaking', delay: 10000 }
  ]
});
```

### Audio Synthesis
```typescript
import { AudioSynthesizer } from '@augmentos/cloud-client/testing';

// Generate speech for testing
const audioFile = await AudioSynthesizer.generateSpeech(
  'Hello, this is a test transcript',
  { voice: 'en-US-male', speed: 1.0 }
);

// Create benchmark audio with known timestamps
const benchmarkAudio = await AudioSynthesizer.createBenchmarkAudio([
  { text: 'hello', startTime: 0, duration: 500 },
  { text: 'world', startTime: 1000, duration: 500 }
]);
```

## Examples

### Basic App Testing
```typescript
const client = new MentraClient({
  email: 'test@example.com',
  serverUrl: 'ws://localhost:3001'
});

await client.connect();

// Test translator app
await client.startApp('com.augmentos.translator');

client.on('display_event', (display) => {
  if (display.content.includes('Hola')) {
    console.log('Translation successful!');
  }
});

client.startSpeaking('./audio/english-phrase.wav');
await new Promise(resolve => setTimeout(resolve, 5000));
client.stopSpeaking();

await client.disconnect();
```

### Dashboard Interaction
```typescript
// Test dashboard switching
await client.connect();

client.on('display_event', (display) => {
  console.log(`Display update - View: ${display.view}, Content: ${display.content}`);
});

// Look up to see dashboard
client.lookUp();
await new Promise(resolve => setTimeout(resolve, 1000));

// Look down to see main view
client.lookDown();
await new Promise(resolve => setTimeout(resolve, 1000));

console.log('Currently visible:', client.getVisibleContent());
```

### Location-Based Testing
```typescript
// Test location-aware apps
await client.connect();
await client.startApp('com.augmentos.navigation');

// Simulate walking route
const route = [
  { lat: 37.7749, lng: -122.4194 },  // Start
  { lat: 37.7849, lng: -122.4094 },  // Middle
  { lat: 37.7949, lng: -122.3994 }   // End
];

for (const point of route) {
  client.updateLocation(point.lat, point.lng);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
```

### Multi-Server Testing
```typescript
const client = new MentraClient({
  email: 'test@example.com',
  serverUrl: 'ws://localhost:3001'  // Default server
});

// Test against development server
await client.connect('ws://dev-server.com');
// ... run tests

// Switch to staging server
await client.disconnect();
await client.connect('ws://staging-server.com');
// ... run tests

// Back to production
await client.disconnect();
await client.connect();  // Uses default from config
```

## Design Principles

### 1. **Pure SDK**
- Clean, focused API without testing utilities
- Could be used in production applications
- No dependencies on testing frameworks

### 2. **Separation of Concerns**
- Core client handles protocol and state
- Testing utilities are separate modules
- Each manager handles specific domain logic

### 3. **Extensible Architecture**
- Easy to add new message types
- Modular manager system
- Event-driven for flexibility

### 4. **Production Ready**
- Proper error handling and logging
- Configurable behavior and debugging
- Robust connection management

The Cloud Client provides a solid foundation for both testing AugmentOS infrastructure and building real applications that interact with the platform.