# Camera Tutorial

Learn how to use the camera functionality in your Mentra Live apps to take photos and stream video from smart glasses.

> 📚 **New Camera Documentation Available!**
> - [📸 Photo Capture Guide](./camera/photo-capture.md) - Comprehensive photo capture documentation
> - [📹 RTMP Streaming Guide](./camera/rtmp-streaming.md) - Complete streaming guide with managed and unmanaged options
> - [🔧 Camera API Reference](./reference/camera.md) - Full API documentation

## Overview

The camera module lets you:
- 📸 **Take photos** from the smart glasses camera
- 📹 **Stream live video** using managed streaming (zero-config) or unmanaged streaming (full control)

All camera functionality is accessed through your app session: `session.camera`

```typescript
// Take a photo
const photo = await session.camera.requestPhoto();

// Start managed streaming (NEW - Zero infrastructure required!)
const stream = await session.camera.startManagedStream();
console.log('Share with viewers:', stream.hlsUrl);

// Or use unmanaged streaming for full control
await session.camera.startStream({ rtmpUrl: 'rtmp://example.com/live/key' });
```

## Taking Photos

### Basic Photo Capture

Taking a photo is simple - just call `requestPhoto()`:

```typescript
import { AppServer, AppSession } from '@mentra/sdk';

class PhotoApp extends AppServer {
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    session.logger.info('Photo app session started');

    // check if we have a camera
    if (!session.capabilities?.hasCamera) {
        this.logger.warn('Camera not available');
        return;
    }

    // Take a photo when the session starts
    await this.takePhoto(session);

    // Take a photo when the user presses a button
    session.events.onButtonPress(async (button) => {
      this.logger.info(`Button pressed: ${button.buttonId}, type: ${button.pressType}`);
      await this.takePhoto(session);
    });
  }

  private async takePhoto(session: AppSession): Promise<void> {
    try {
      const photo = await session.camera.requestPhoto();

      // Photo information
      session.logger.info(`Photo taken at: ${photo.timestamp}`);
      session.logger.info(`File type: ${photo.mimeType}`);
      session.logger.info(`Size: ${photo.size} bytes`);

      // The actual photo data is in photo.buffer
      const photoData = photo.buffer;
      session.logger.info(`Photo buffer length: ${photoData.length}`);

    } catch (error) {
      session.logger.error('Failed to take photo:', error);
    }
  }
}
```

### Working with Photo Data

The photo is returned as a `Buffer` object. Here are common ways to use it:

```typescript
private async processPhoto(session: AppSession): Promise<void> {
  try {
    const photo = await session.camera.requestPhoto();

    // Convert to base64 for storage or transmission
    const base64String = photo.buffer.toString('base64');
    session.logger.info(`Photo as base64 (first 50 chars): ${base64String.substring(0, 50)}...`);

    // Save to file (Node.js)
    import fs from 'fs';
    const filename = `photo_${Date.now()}.jpg`;
    fs.writeFileSync(filename, photo.buffer);
    session.logger.info(`Photo saved to file: ${filename}`);

    // Send to external API
    await this.uploadPhotoToAPI(photo.buffer, photo.mimeType);
  } catch (error) {
    session.logger.error('Failed to process photo:', error);
  }
}

private async uploadPhotoToAPI(buffer: Buffer, mimeType: string): Promise<void> {
  // Example: Upload to your backend API
  // const formData = new FormData();
  // formData.append('photo', new Blob([buffer], { type: mimeType }));
  // await fetch('/api/upload', { method: 'POST', body: formData });
}
```

## RTMP Streaming

### Basic Streaming

To start streaming to an RTMP endpoint:

```typescript
import { AppServer, AppSession } from '@mentra/sdk';

class StreamingApp extends AppServer {
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    session.logger.info('Streaming app session started');

    // Start streaming automatically when session begins
    await this.startStream(session);

    // Listen for stream status updates
    this.setupStreamMonitoring(session);
  }

  private async startStream(session: AppSession): Promise<void> {
    try {
      await session.camera.startStream({
        rtmpUrl: 'rtmp://live.youtube.com/live2/YOUR_STREAM_KEY'
      });
      session.logger.info('Streaming started successfully!');
    } catch (error) {
      session.logger.error('Failed to start stream:', error);
    }
  }

  private async stopStream(session: AppSession): Promise<void> {
    try {
      await session.camera.stopStream();
      session.logger.info('Streaming stopped successfully!');
    } catch (error) {
      session.logger.error('Failed to stop stream:', error);
    }
  }

  private setupStreamMonitoring(session: AppSession): void {
    // Monitor stream status changes
    const unsubscribe = session.camera.onStreamStatus((status) => {
      session.logger.info(`Stream status changed: ${status.status}`);

      if (status.stats) {
        session.logger.info(`Stream stats - Bitrate: ${status.stats.bitrate}, FPS: ${status.stats.fps}`);
      }
    });

    // Clean up when session ends
    this.addCleanupHandler(unsubscribe);
  }
}
```

### Popular Streaming Platforms

#### YouTube Live
```typescript
await session.camera.startStream({
  rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY'
});
```

#### Twitch
```typescript
await session.camera.startStream({
  rtmpUrl: 'rtmp://live.twitch.tv/live/YOUR_STREAM_KEY'
});
```

#### Facebook Live
```typescript
await session.camera.startStream({
  rtmpUrl: 'rtmp://live-api-s.facebook.com:80/rtmp/YOUR_STREAM_KEY'
});
```

### Monitoring Stream Status

Stay informed about your stream's status:

```typescript
class StreamMonitoringApp extends AppServer {
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    session.logger.info('Stream monitoring app started');

    // Set up stream status monitoring
    this.setupStreamStatusMonitoring(session);
  }

  private setupStreamStatusMonitoring(session: AppSession): void {
    // Listen for stream status updates
    const unsubscribe = session.camera.onStreamStatus((status) => {
      session.logger.info(`Current stream status: ${status.status}`);

      if (status.status === 'active') {
        session.logger.info('🎉 Stream is live!');

        if (status.stats) {
          session.logger.info(`Stream performance: ${status.stats.bitrate} bps, ${status.stats.fps} fps`);
        }
      } else if (status.status === 'error') {
        session.logger.error(`❌ Stream error: ${status.errorDetails}`);
      } else if (status.status === 'stopped') {
        session.logger.info('Stream has stopped');
      }
    });

    // Cleanup when session ends
    this.addCleanupHandler(unsubscribe);
  }
}
```

## Next Steps

- Check out the [Camera Reference](/reference/camera) for complete API documentation
- Check out [Device Capabilities](/capabilities) to check if your device has a camera