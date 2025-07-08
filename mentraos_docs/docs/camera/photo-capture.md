# Photo Capture Guide

This guide covers how to capture photos from smart glasses using the MentraOS Camera Module.

## Overview

Photo capture allows your app to request individual photos from connected smart glasses. This is perfect for:
- Documentation and note-taking apps
- Visual assistance applications
- Inventory management
- Social sharing features
- Accessibility tools

## Basic Usage

### Simple Photo Capture

```typescript
// Request a photo from the smart glasses
const photo = await session.camera.requestPhoto();

console.log(`Photo captured: ${photo.filename}`);
console.log(`Size: ${photo.size} bytes`);
console.log(`Type: ${photo.mimeType}`);
```

### Save to Gallery

```typescript
// Request a photo and save it to the device gallery
const photo = await session.camera.requestPhoto({
  saveToGallery: true
});

console.log('Photo saved to gallery!');
```

## API Reference

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

## Working with Photo Data

### Converting to Base64

```typescript
const photo = await session.camera.requestPhoto();

// Convert to base64 for display or transmission
const base64Photo = photo.buffer.toString('base64');
const dataUrl = `data:${photo.mimeType};base64,${base64Photo}`;

// Use in HTML img tag
// <img src={dataUrl} alt="Captured photo" />
```

### Saving to File System (Node.js)

```typescript
import fs from 'fs/promises';

const photo = await session.camera.requestPhoto();

// Save to local file system
await fs.writeFile(`photos/${photo.filename}`, photo.buffer);
console.log(`Photo saved as ${photo.filename}`);
```

### Uploading to Cloud Storage

```typescript
// Example: Upload to S3
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const photo = await session.camera.requestPhoto();

const s3Client = new S3Client({ region: 'us-east-1' });
const command = new PutObjectCommand({
  Bucket: 'my-photos-bucket',
  Key: `captures/${photo.timestamp.toISOString()}-${photo.filename}`,
  Body: photo.buffer,
  ContentType: photo.mimeType
});

await s3Client.send(command);
```

## Error Handling

### Timeout Handling

Photo requests automatically timeout after 30 seconds:

```typescript
try {
  const photo = await session.camera.requestPhoto();
  // Process photo
} catch (error) {
  if (error.message.includes('timeout')) {
    console.error('Photo request timed out after 30 seconds');
    // Retry or notify user
  }
}
```

### Cancellation

Photo requests are automatically cancelled when:
- The session is disconnected
- The app is stopped
- A new photo request is made (previous one is cancelled)

```typescript
// Manual cancellation example
const photoPromise = session.camera.requestPhoto();

// Cancel after 5 seconds
setTimeout(() => {
  // Start a new request (cancels the previous one)
  session.camera.requestPhoto();
}, 5000);
```

### Device Errors

Handle cases where the camera is unavailable:

```typescript
try {
  const photo = await session.camera.requestPhoto();
} catch (error) {
  if (error.message.includes('Camera unavailable')) {
    console.error('Camera is not available on this device');
  } else if (error.message.includes('Permission denied')) {
    console.error('Camera permission not granted');
  }
}
```

## Best Practices

### 1. Memory Management

Process photo buffers promptly to avoid memory issues:

```typescript
async function processAndCleanup() {
  const photo = await session.camera.requestPhoto();
  
  // Process immediately
  await processPhoto(photo.buffer);
  
  // Clear reference to allow garbage collection
  photo.buffer = null;
}
```

### 2. User Feedback

Provide visual feedback during photo capture:

```typescript
// Show loading state
setLoading(true);

try {
  const photo = await session.camera.requestPhoto();
  // Show success
  showNotification('Photo captured successfully!');
  displayPhoto(photo);
} catch (error) {
  // Show error
  showNotification('Failed to capture photo');
} finally {
  setLoading(false);
}
```

### 3. Gallery Saves

Use `saveToGallery: true` when users expect photos to persist:

```typescript
// For user-initiated captures
const photo = await session.camera.requestPhoto({ 
  saveToGallery: true 
});

// For temporary/processing captures
const tempPhoto = await session.camera.requestPhoto({ 
  saveToGallery: false 
});
```

### 4. Request Queuing

Avoid rapid consecutive requests:

```typescript
let isCapturing = false;

async function capturePhoto() {
  if (isCapturing) {
    console.log('Already capturing, please wait...');
    return;
  }

  isCapturing = true;
  try {
    const photo = await session.camera.requestPhoto();
    processPhoto(photo);
  } finally {
    isCapturing = false;
  }
}
```

## Complete Example

Here's a complete example with error handling and UI feedback:

```typescript
import { useMentraOS } from '@mentra/sdk-react';
import { useState } from 'react';

export function PhotoCaptureExample() {
  const { session } = useMentraOS();
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capturePhoto = async () => {
    setIsCapturing(true);
    setError(null);

    try {
      const photo = await session.camera.requestPhoto({
        saveToGallery: true
      });

      // Convert to displayable format
      const base64 = photo.buffer.toString('base64');
      const dataUrl = `data:${photo.mimeType};base64,${base64}`;
      
      setLastPhoto(dataUrl);
      
      console.log(`Photo captured: ${photo.filename}`);
      console.log(`Size: ${(photo.size / 1024).toFixed(2)} KB`);
      
    } catch (err) {
      console.error('Photo capture failed:', err);
      setError(err.message || 'Failed to capture photo');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div>
      <h2>Photo Capture</h2>
      
      <button 
        onClick={capturePhoto} 
        disabled={isCapturing}
      >
        {isCapturing ? 'Capturing...' : 'Take Photo'}
      </button>

      {error && (
        <div style={{ color: 'red' }}>
          Error: {error}
        </div>
      )}

      {lastPhoto && (
        <div>
          <h3>Last Captured Photo:</h3>
          <img 
            src={lastPhoto} 
            alt="Captured" 
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </div>
      )}
    </div>
  );
}
```

## Limitations

- **Timeout**: Photo requests timeout after 30 seconds
- **Format**: Photo format depends on device capabilities (usually JPEG)
- **Concurrency**: Only one photo request can be active at a time
- **Size**: Large photos may cause memory pressure on mobile devices
- **Availability**: Requires camera-equipped smart glasses

## Troubleshooting

### "Camera unavailable"
- Ensure the smart glasses have a camera
- Check that the glasses are properly connected
- Verify camera permissions are granted

### "Request timeout"
- Check network connection between glasses and phone
- Ensure the glasses are responsive
- Try reducing other concurrent operations

### "Permission denied"
- Add `camera` permission to your app manifest
- Ensure user has granted camera permission
- Check system-level camera permissions

## See Also

- [Camera API Reference](../reference/camera.md) - Complete API documentation
- [RTMP Streaming Guide](./rtmp-streaming.md) - Live video streaming
- [Permissions Guide](../permissions.md) - Setting up camera permissions
- [Events Documentation](../events.md) - Camera-related events