# Camera Module Reference

The Camera Module provides camera functionality, including both photo capture and RTMP streaming capabilities. It allows apps to request photos from connected smart glasses and stream live camera feeds to RTMP endpoints.

## Overview

The Camera Module is part of the App Session and provides two main capabilities:

- **📸 Photo Capture**: Request individual photos from smart glasses
- **📹 RTMP Streaming**: Stream live camera feed to RTMP endpoints

Access the camera module through your app session:

```typescript
const photo = await session.camera.requestPhoto();
await session.camera.startStream({ rtmpUrl: 'rtmp://example.com/live/key' });
```

## Photo Functionality

### requestPhoto()

Request a photo from the connected smart glasses.

```typescript
async requestPhoto(options?: PhotoRequestOptions): Promise<PhotoData>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `PhotoRequestOptions` | Optional configuration for the photo request |

#### PhotoRequestOptions

```typescript
interface PhotoRequestOptions {
  /** Whether to save the photo to the device gallery */
  saveToGallery?: boolean;
}
```

#### Returns

Returns a `Promise<PhotoData>` that resolves with the captured photo data.

#### PhotoData Interface

```typescript
interface PhotoData {
  /** The actual photo file as a Buffer */
  buffer: Buffer;
  /** MIME type of the photo (e.g., 'image/jpeg') */
  mimeType: string;
  /** Original filename from the camera */
  filename: string;
  /** Unique request ID that correlates to the original request */
  requestId: string;
  /** Size of the photo in bytes */
  size: number;
  /** Timestamp when the photo was captured */
  timestamp: Date;
}
```

#### Example

```typescript
// Basic photo request
const photo = await session.camera.requestPhoto();
console.log(`Photo taken at timestamp: ${photo.timestamp}`);
console.log(`MIME type: ${photo.mimeType}, size: ${photo.size} bytes`);

// Access raw photo data
const photoBuffer = photo.buffer;
const base64Photo = photo.buffer.toString('base64');

// Save to gallery
const photoWithSave = await session.camera.requestPhoto({
  saveToGallery: true
});
```

## RTMP Streaming Functionality

### startStream()

Start an RTMP stream to the specified URL.

```typescript
async startStream(options: RtmpStreamOptions): Promise<void>
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `RtmpStreamOptions` | Configuration options for the stream |

#### RtmpStreamOptions

```typescript
interface RtmpStreamOptions {
  /** The RTMP URL to stream to (e.g., rtmp://server.example.com/live/stream-key) */
  rtmpUrl: string;
  /** Optional video configuration settings */
  video?: VideoConfig;
  /** Optional audio configuration settings */
  audio?: AudioConfig;
  /** Optional stream configuration settings */
  stream?: StreamConfig;
}
```

#### VideoConfig

```typescript
interface VideoConfig {
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** Video bitrate in bits per second */
  bitrate?: number;
  /** Frames per second */
  frameRate?: number;
}
```

#### AudioConfig

```typescript
interface AudioConfig {
  /** Audio bitrate in bits per second */
  bitrate?: number;
  /** Audio sample rate in Hz */
  sampleRate?: number;
  /** Enable echo cancellation */
  echoCancellation?: boolean;
  /** Enable noise suppression */
  noiseSuppression?: boolean;
}
```

#### StreamConfig

```typescript
interface StreamConfig {
  /** Maximum stream duration in seconds */
  durationLimit?: number;
}
```

#### Example

```typescript
// Basic streaming
await session.camera.startStream({
  rtmpUrl: 'rtmp://live.example.com/stream/key'
});

// Advanced configuration
await session.camera.startStream({
  rtmpUrl: 'rtmp://live.example.com/stream/key',
  video: {
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    frameRate: 30
  },
  audio: {
    bitrate: 128000,
    sampleRate: 44100,
    echoCancellation: true,
    noiseSuppression: true
  },
  stream: {
    durationLimit: 1800 // 30 minutes
  }
});
```

### stopStream()

Stop the current RTMP stream.

```typescript
async stopStream(): Promise<void>
```

#### Example

```typescript
// Stop the current stream
await session.camera.stopStream();
```

### Stream Status Monitoring

#### onStreamStatus()

Subscribe to stream status updates.

```typescript
onStreamStatus(handler: StreamStatusHandler): () => void
```

#### StreamStatusHandler

```typescript
type StreamStatusHandler = (status: RtmpStreamStatus) => void;
```

#### RtmpStreamStatus

```typescript
interface RtmpStreamStatus {
  type: string;
  streamId?: string;
  status: 'initializing' | 'active' | 'busy' | 'error' | 'stopped' | 'timeout';
  errorDetails?: string;
  appId?: string;
  stats?: {
    bitrate: number;
    fps: number;
    duration: number;
  };
  timestamp: Date;
}
```

#### Example

```typescript
// Monitor stream status
const unsubscribe = session.camera.onStreamStatus((status) => {
  console.log(`Stream status: ${status.status}`);

  if (status.status === 'active') {
    console.log('Stream is live!');
    if (status.stats) {
      console.log(`Bitrate: ${status.stats.bitrate} bps`);
      console.log(`FPS: ${status.stats.fps}`);
      console.log(`Duration: ${status.stats.duration}s`);
    }
  } else if (status.status === 'error') {
    console.error(`Stream error: ${status.errorDetails}`);
  }
});

// Later, unsubscribe
unsubscribe();
```

### Stream Utility Methods

#### isCurrentlyStreaming()

Check if currently streaming.

```typescript
isCurrentlyStreaming(): boolean
```

#### getCurrentStreamUrl()

Get the URL of the current stream.

```typescript
getCurrentStreamUrl(): string | undefined
```

#### getStreamStatus()

Get the current stream status.

```typescript
getStreamStatus(): RtmpStreamStatus | undefined
```

## Error Handling

### Photo Errors

- **Timeout**: Photo requests timeout after 30 seconds
- **Cancellation**: Requests can be cancelled manually or during session cleanup
- **Device Errors**: Camera unavailable or hardware issues

### Stream Errors

- **Already Streaming**: Cannot start a new stream while one is active
- **Invalid URL**: RTMP URL validation failures
- **Network Issues**: Connection problems to RTMP endpoint
- **Device Limitations**: Hardware doesn't support requested configuration

## Best Practices

### Photo Capture

1. **Handle Timeouts**: Always wrap photo requests in try-catch blocks
2. **Memory Management**: Process photo buffers promptly to avoid memory issues
3. **Gallery Saves**: Use `saveToGallery: true` when users expect photos to be saved

```typescript
try {
  const photo = await session.camera.requestPhoto({ saveToGallery: true });
  // Process photo immediately
  processPhoto(photo.buffer);
} catch (error) {
  console.error('Photo capture failed:', error);
}
```

### RTMP Streaming

1. **Network Conditions**: Use appropriate bitrates for network conditions
2. **Battery Usage**: Set duration limits for battery conservation
3. **User Privacy**: Always notify users when streaming is active
4. **Error Handling**: Monitor stream status and handle errors gracefully

```typescript
// Start streaming with conservative settings
await session.camera.startStream({
  rtmpUrl: 'rtmp://example.com/live/key',
  video: { bitrate: 2000000 }, // 2 Mbps for good compatibility
  stream: { durationLimit: 1800 } // 30 minute limit
});

// Monitor for issues
const unsubscribe = session.camera.onStreamStatus((status) => {
  if (status.status === 'error') {
    // Handle stream errors
    notifyUser('Streaming stopped due to error');
  }
});
```

## Limitations

### Photo Capture

- Maximum 30-second timeout per request
- Photo format depends on device capabilities
- Concurrent photo requests are queued

### RTMP Streaming

- Only one stream can be active per session
- Configuration options depend on device capabilities
- Network bandwidth affects streaming quality
- Extended streaming may cause battery drain and device heating

## Complete Example

Here's a complete example showing both photo capture and streaming:

```typescript
import { useMentraOS } from '@mentra/sdk-react';

export function CameraExample() {
  const { session } = useMentraOS();

  const takePhoto = async () => {
    try {
      const photo = await session.camera.requestPhoto({ saveToGallery: true });
      console.log(`Photo captured: ${photo.mimeType}, ${photo.size} bytes`);

      // Convert to base64 for display
      const base64 = photo.buffer.toString('base64');
      const dataUrl = `data:${photo.mimeType};base64,${base64}`;

      // Display or process the photo
      displayPhoto(dataUrl);
    } catch (error) {
      console.error('Photo capture failed:', error);
    }
  };

  const startStreaming = async () => {
    try {
      await session.camera.startStream({
        rtmpUrl: 'rtmp://your-server.com/live/stream-key',
        video: { width: 1280, height: 720, bitrate: 2000000 },
        audio: { bitrate: 128000, echoCancellation: true }
      });

      // Monitor stream status
      const unsubscribe = session.camera.onStreamStatus((status) => {
        console.log(`Stream status: ${status.status}`);

        if (status.status === 'error') {
          console.error('Stream error:', status.errorDetails);
          unsubscribe();
        }
      });

    } catch (error) {
      console.error('Failed to start streaming:', error);
    }
  };

  const stopStreaming = async () => {
    try {
      await session.camera.stopStream();
      console.log('Streaming stopped');
    } catch (error) {
      console.error('Failed to stop streaming:', error);
    }
  };

  return (
    <div>
      <button onClick={takePhoto}>Take Photo</button>
      <button onClick={startStreaming}>Start Streaming</button>
      <button onClick={stopStreaming}>Stop Streaming</button>
    </div>
  );
}
```