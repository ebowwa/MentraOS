# Camera Module Reference

The Camera Module provides comprehensive camera functionality, including photo capture and RTMP streaming capabilities. It allows apps to request photos from connected smart glasses and stream live camera feeds to custom RTMP endpoints.

## Overview

The Camera Module is part of the App Session and provides two main capabilities:

- **📸 Photo Capture**: Request individual photos from smart glasses
- **🔧 RTMP Streaming**: Full-control streaming to custom RTMP endpoints

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

RTMP streaming provides full control over streaming endpoints but requires your own streaming infrastructure. Only one stream can be active at a time, and it blocks other apps from using the camera.

### startStream()

Start an RTMP stream to a specific URL.

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
}
```


#### Example

```typescript
// Basic streaming
await session.camera.startStream({
  rtmpUrl: 'rtmp://live.example.com/stream/key'
});
```

### stopStream()

Stop the current RTMP stream.

```typescript
async stopStream(): Promise<void>
```

#### Example

```typescript
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
  status: 'initializing' | 'connecting' | 'reconnecting' | 'streaming' | 'error' | 'stopped' | 'active' | 'stopping' | 'disconnected' | 'timeout';
  errorDetails?: string;
  appId?: string;
  stats?: {
    bitrate: number;
    fps: number;
    droppedFrames: number;
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
      console.log(`Dropped frames: ${status.stats.droppedFrames}`);
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

- **Already Streaming**: Cannot start while another stream is active
- **Invalid URL**: RTMP URL validation failures
- **Network Issues**: Connection problems to RTMP endpoint
- **Device Limitations**: Hardware doesn't support requested configuration

