# Usage Examples

This document provides practical examples of using the AugmentOS Cloud Client for various testing and development scenarios.

## Basic Examples

### Simple Connection Test
```typescript
import { MentraClient } from '@augmentos/cloud-client';

async function basicConnectionTest() {
  const client = new MentraClient({
    email: 'test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  try {
    console.log('Connecting...');
    await client.connect();
    console.log('Connected successfully!');
    
    console.log('Connection status:', client.isConnected());
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Disconnecting...');
    await client.disconnect();
    console.log('Disconnected.');
  } catch (error) {
    console.error('Connection failed:', error);
  }
}
```

### App Lifecycle Testing
```typescript
async function testAppLifecycle() {
  const client = new MentraClient({
    email: 'app-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  // Listen for app state changes
  client.on('app_state_change', (state) => {
    console.log('App state changed:', {
      running: state.userSession.activeAppSessions,
      loading: state.userSession.loadingApps
    });
  });

  // Test translator app
  console.log('Starting translator app...');
  await client.startApp('com.augmentos.translator');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('Running apps:', client.getRunningApps());
  
  console.log('Stopping translator app...');
  await client.stopApp('com.augmentos.translator');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await client.disconnect();
}
```

## Audio & Transcription Examples

### File-Based Audio Streaming
```typescript
async function testAudioFromFile() {
  const client = new MentraClient({
    email: 'audio-test@example.com',
    serverUrl: 'ws://localhost:3001',
    audio: {
      format: 'pcm16',
      sampleRate: 16000,
      chunkSize: 1600  // 100ms chunks
    }
  });

  await client.connect();

  console.log('Starting to speak from file...');
  const startTime = Date.now();
  
  // Stream 5-second audio file (will take ~5 seconds)
  await client.startSpeakingFromFile('./audio/hello-world-5sec.wav');
  
  const duration = Date.now() - startTime;
  console.log(`Audio streaming completed in ${duration}ms`);
  
  await client.disconnect();
}
```

### Stream-Based Audio (Microphone)
```typescript
import { recorder } from 'node-record-lpcm16';

async function testAudioFromMicrophone() {
  const client = new MentraClient({
    email: 'mic-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  // Set up microphone recording
  const mic = recorder.record({
    sampleRate: 16000,
    channels: 1,
    audioType: 'wav'
  });

  console.log('Starting microphone streaming...');
  client.startSpeakingFromStream(mic.stream());
  
  // Record for 10 seconds
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log('Stopping microphone...');
  client.stopSpeaking();
  mic.stop();
  
  await client.disconnect();
}
```

### VAD-Only Testing
```typescript
async function testVadOnly() {
  const client = new MentraClient({
    email: 'vad-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  console.log('Sending VAD signal only...');
  client.startSpeaking();  // VAD true, no audio chunks
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Stopping VAD signal...');
  client.stopSpeaking();  // VAD false
  
  await client.disconnect();
}
```

### Transcription Testing with Known Content
```typescript
async function testTranscriptionAccuracy() {
  const client = new MentraClient({
    email: 'transcription-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();
  
  // Start app that uses transcription
  await client.startApp('com.augmentos.translator');
  
  // Listen for display updates (transcription results)
  const transcriptionResults: string[] = [];
  client.on('display_event', (display) => {
    if (display.layout.content) {
      transcriptionResults.push(display.layout.content);
      console.log('Transcription result:', display.layout.content);
    }
  });

  // Test with known phrases
  const testPhrases = [
    './audio/hello-world.wav',
    './audio/how-are-you.wav',
    './audio/goodbye.wav'
  ];

  for (const audioFile of testPhrases) {
    console.log(`Testing with: ${audioFile}`);
    await client.startSpeakingFromFile(audioFile);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for transcription
  }

  console.log('All transcription results:', transcriptionResults);
  
  await client.disconnect();
}
```

## Dashboard & Display Examples

### Dashboard View Switching
```typescript
async function testDashboardSwitching() {
  const client = new MentraClient({
    email: 'dashboard-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  // Track display changes
  client.on('display_event', (display) => {
    console.log(`Display update - View: ${display.layout.view || 'main'}`);
    console.log(`Content: ${display.layout.content}`);
    console.log(`Currently visible: ${client.getVisibleContent()?.content || 'nothing'}`);
  });

  // Test dashboard switching
  console.log('Looking up (dashboard view)...');
  client.lookUp();
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Looking down (main view)...');
  client.lookDown();
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test with app running
  await client.startApp('com.augmentos.translator');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Looking up with app running...');
  client.lookUp();
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Looking down with app running...');
  client.lookDown();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await client.disconnect();
}
```

### Display Content Monitoring
```typescript
async function monitorDisplayContent() {
  const client = new MentraClient({
    email: 'display-monitor@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  // Track all display updates
  const displayHistory: any[] = [];
  
  client.on('display_event', (display) => {
    const event = {
      timestamp: new Date(),
      view: display.layout.view || 'main',
      content: display.layout.content,
      type: display.layout.type,
      currentlyVisible: client.getVisibleContent()?.content
    };
    
    displayHistory.push(event);
    console.log('Display event:', event);
  });

  // Start multiple apps to see different displays
  const apps = [
    'com.augmentos.translator',
    'com.augmentos.livecaptions',
    'com.augmentos.navigation'
  ];

  for (const app of apps) {
    console.log(`Starting ${app}...`);
    await client.startApp(app);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test both views
    client.lookUp();
    await new Promise(resolve => setTimeout(resolve, 1000));
    client.lookDown();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await client.stopApp(app);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\nDisplay History Summary:');
  displayHistory.forEach((event, index) => {
    console.log(`${index + 1}. ${event.timestamp.toISOString()} - ${event.view}: ${event.content}`);
  });

  await client.disconnect();
}
```

## Location & Movement Examples

### Static Location Testing
```typescript
async function testLocationUpdates() {
  const client = new MentraClient({
    email: 'location-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();
  
  // Start navigation app
  await client.startApp('com.augmentos.navigation');
  
  // Test different locations
  const locations = [
    { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
    { name: 'New York', lat: 40.7128, lng: -74.0060 },
    { name: 'London', lat: 51.5074, lng: -0.1278 }
  ];

  for (const location of locations) {
    console.log(`Updating location to ${location.name}...`);
    client.updateLocation(location.lat, location.lng);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  await client.disconnect();
}
```

### Movement Simulation
```typescript
async function simulateWalking() {
  const client = new MentraClient({
    email: 'walking-test@example.com',
    serverUrl: 'ws://localhost:3001',
    behavior: {
      locationUpdateInterval: 1000,  // Update every second
      statusUpdateInterval: 5000,
      reconnectOnDisconnect: true
    }
  });

  await client.connect();
  await client.startApp('com.augmentos.navigation');

  // Simulate walking from Golden Gate Bridge to Pier 39
  const route = [
    { lat: 37.8199, lng: -122.4783 },  // Golden Gate Bridge
    { lat: 37.8150, lng: -122.4750 },
    { lat: 37.8100, lng: -122.4700 },
    { lat: 37.8050, lng: -122.4650 },
    { lat: 37.8000, lng: -122.4600 },
    { lat: 37.8085, lng: -122.4098 }   // Pier 39
  ];

  console.log('Starting walk simulation...');
  
  for (let i = 0; i < route.length; i++) {
    const point = route[i];
    console.log(`Step ${i + 1}/${route.length}: ${point.lat}, ${point.lng}`);
    
    client.updateLocation(point.lat, point.lng);
    
    // Walk for 30 seconds between points
    await new Promise(resolve => setTimeout(resolve, 30000));
  }

  console.log('Walk completed!');
  await client.disconnect();
}
```

## Multi-Server Testing

### Server Switching
```typescript
async function testMultipleServers() {
  const servers = [
    'ws://localhost:3001',     // Local dev
    'ws://staging.company.com', // Staging
    'ws://prod.company.com'    // Production
  ];

  const client = new MentraClient({
    email: 'multi-server-test@example.com',
    serverUrl: servers[0]  // Default to first server
  });

  for (const server of servers) {
    try {
      console.log(`Testing connection to ${server}...`);
      
      await client.connect(server);
      console.log(`✅ Connected to ${server}`);
      
      // Basic functionality test
      await client.startApp('com.augmentos.translator');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await client.stopApp('com.augmentos.translator');
      
      console.log(`✅ Basic functionality works on ${server}`);
      
      await client.disconnect();
      console.log(`✅ Disconnected from ${server}`);
      
    } catch (error) {
      console.error(`❌ Failed with ${server}:`, error.message);
    }
  }
}
```

## Advanced Audio Examples

### Custom Audio Stream
```typescript
import { Readable } from 'stream';

async function testCustomAudioStream() {
  const client = new MentraClient({
    email: 'custom-stream-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  // Create custom audio stream (generates sine wave)
  class SineWaveStream extends Readable {
    private frequency = 440; // A note
    private sampleRate = 16000;
    private samples = 0;

    _read() {
      const chunkSize = 1600; // 100ms at 16kHz
      const chunk = Buffer.alloc(chunkSize * 2); // 16-bit samples
      
      for (let i = 0; i < chunkSize; i++) {
        const sample = Math.sin(2 * Math.PI * this.frequency * this.samples / this.sampleRate);
        const value = Math.floor(sample * 32767);
        chunk.writeInt16LE(value, i * 2);
        this.samples++;
      }
      
      this.push(chunk);
      
      // Stop after 5 seconds
      if (this.samples > this.sampleRate * 5) {
        this.push(null);
      }
    }
  }

  const sineStream = new SineWaveStream();
  
  console.log('Streaming custom sine wave audio...');
  client.startSpeakingFromStream(sineStream);
  
  // Wait for stream to complete
  await new Promise((resolve) => {
    sineStream.on('end', resolve);
  });
  
  console.log('Custom audio stream completed');
  await client.disconnect();
}
```

### Multiple Audio Sources
```typescript
async function testMultipleAudioSources() {
  const client = new MentraClient({
    email: 'multi-audio-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();
  await client.startApp('com.augmentos.translator');

  // Test different audio sources
  console.log('1. Testing file-based audio...');
  await client.startSpeakingFromFile('./audio/english-phrase.wav');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('2. Testing VAD-only...');
  client.startSpeaking();
  await new Promise(resolve => setTimeout(resolve, 2000));
  client.stopSpeaking();

  console.log('3. Testing microphone stream...');
  if (process.platform !== 'darwin' || process.env.ALLOW_MIC) {
    const mic = recorder.record({ sampleRate: 16000 });
    client.startSpeakingFromStream(mic.stream());
    await new Promise(resolve => setTimeout(resolve, 5000));
    client.stopSpeaking();
    mic.stop();
  } else {
    console.log('   Skipped (microphone not available)');
  }

  await client.disconnect();
}
```

## Integration Testing Examples

### End-to-End Translation Test
```typescript
async function testTranslationWorkflow() {
  const client = new MentraClient({
    email: 'translation-e2e@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  console.log('Starting translation workflow test...');

  // 1. Start translator app
  await client.startApp('com.augmentos.translator');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 2. Set up result tracking
  const results: string[] = [];
  client.on('display_event', (display) => {
    if (display.layout.content && display.layout.content.includes('translation')) {
      results.push(display.layout.content);
    }
  });

  // 3. Look up to see dashboard
  client.lookUp();
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 4. Send English phrase for Spanish translation
  await client.startSpeakingFromFile('./audio/hello-how-are-you.wav');

  // 5. Wait for translation result
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 6. Look down to see main view
  client.lookDown();
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 7. Verify we got results
  if (results.length > 0) {
    console.log('✅ Translation workflow successful');
    console.log('Results:', results);
  } else {
    console.log('❌ No translation results received');
  }

  await client.disconnect();
}
```

### Multi-App Interaction Test
```typescript
async function testMultiAppInteraction() {
  const client = new MentraClient({
    email: 'multi-app-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  await client.connect();

  // Track all display updates
  const displayUpdates: any[] = [];
  client.on('display_event', (display) => {
    displayUpdates.push({
      timestamp: Date.now(),
      view: display.layout.view,
      content: display.layout.content,
      visible: client.getVisibleContent()?.content
    });
  });

  // Start multiple apps in sequence
  const apps = [
    'com.augmentos.livecaptions',
    'com.augmentos.translator',
    'com.augmentos.navigation'
  ];

  for (const app of apps) {
    console.log(`Starting ${app}...`);
    await client.startApp(app);
    
    // Send some audio to trigger transcription
    await client.startSpeakingFromFile('./audio/test-phrase.wav');
    
    // Test dashboard switching
    client.lookUp();
    await new Promise(resolve => setTimeout(resolve, 1000));
    client.lookDown();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update location for navigation app
    if (app.includes('navigation')) {
      client.updateLocation(37.7749 + Math.random() * 0.01, -122.4194 + Math.random() * 0.01);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Stop all apps
  for (const app of apps) {
    await client.stopApp(app);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`Received ${displayUpdates.length} display updates`);
  console.log('Final running apps:', client.getRunningApps());

  await client.disconnect();
}
```

## Error Handling Examples

### Connection Recovery
```typescript
async function testConnectionRecovery() {
  const client = new MentraClient({
    email: 'recovery-test@example.com',
    serverUrl: 'ws://localhost:3001',
    behavior: {
      reconnectOnDisconnect: true,
      statusUpdateInterval: 5000,
      locationUpdateInterval: 5000
    }
  });

  let reconnectCount = 0;
  
  client.on('connection_ack', () => {
    if (reconnectCount > 0) {
      console.log(`✅ Reconnected successfully (attempt ${reconnectCount})`);
    }
  });

  client.on('error', (error) => {
    console.log('❌ Connection error:', error.message);
    reconnectCount++;
  });

  try {
    await client.connect();
    console.log('Initial connection successful');
    
    // Simulate some activity
    await client.startApp('com.augmentos.translator');
    
    // The connection might drop and recover automatically
    // Let the test run for 2 minutes to see recovery behavior
    await new Promise(resolve => setTimeout(resolve, 120000));
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.disconnect();
  }
}
```

### Graceful Error Handling
```typescript
async function testGracefulErrorHandling() {
  const client = new MentraClient({
    email: 'error-test@example.com',
    serverUrl: 'ws://localhost:3001'
  });

  try {
    await client.connect();
    
    // Test invalid app
    try {
      await client.startApp('com.invalid.app');
      console.log('⚠️ Invalid app started (unexpected)');
    } catch (error) {
      console.log('✅ Invalid app rejected as expected');
    }
    
    // Test valid app
    try {
      await client.startApp('com.augmentos.translator');
      console.log('✅ Valid app started successfully');
    } catch (error) {
      console.log('❌ Valid app failed:', error.message);
    }
    
    // Test invalid audio file
    try {
      await client.startSpeakingFromFile('./audio/nonexistent.wav');
      console.log('⚠️ Nonexistent audio file accepted (unexpected)');
    } catch (error) {
      console.log('✅ Nonexistent audio file rejected as expected');
    }
    
  } catch (error) {
    console.error('Connection failed:', error);
  } finally {
    await client.disconnect();
  }
}
```

These examples demonstrate the full range of capabilities with the updated audio API, showing realistic file streaming, stream-based input, and VAD-only scenarios.