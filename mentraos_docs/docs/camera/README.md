# Camera Module Documentation

The Camera Module provides comprehensive camera functionality for MentraOS apps, including photo capture and video streaming capabilities.

## 📸 Available Features

### [Photo Capture](./photo-capture.md)
Take high-quality photos from smart glasses with options for gallery saving and raw buffer access.

**Key capabilities:**
- Request individual photos on demand
- Save to device gallery
- Access raw photo data for processing
- Handle timeouts and errors gracefully

### [RTMP Streaming](./rtmp-streaming.md)
Stream live video from smart glasses to custom RTMP endpoints:

**Key capabilities:**
- Full control over RTMP endpoints
- Exclusive camera access for your app
- Custom server integration
- Low latency streaming options
- Detailed stream status monitoring

## 🎯 Quick Start

### Taking a Photo
```typescript
const photo = await session.camera.requestPhoto({ saveToGallery: true });
console.log(`Photo captured: ${photo.mimeType}, ${photo.size} bytes`);
```

### Starting an RTMP Stream
```typescript
await session.camera.startStream({
  rtmpUrl: 'rtmp://your-server.com/live/stream-key'
});
```

## 📚 Documentation Structure

- **[Photo Capture Guide](./photo-capture.md)** - Complete guide for taking photos
- **[RTMP Streaming Guide](./rtmp-streaming.md)** - Comprehensive streaming documentation for RTMP streaming
- **[API Reference](/reference/managers/camera)** - Detailed API documentation for all camera methods

## 🎬 Common Use Cases

### Live Streaming
Stream to platforms like YouTube Live, X (Twitter), and TikTok using their RTMP endpoints:
```typescript
await session.camera.startStream({
  rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/your-stream-key'
});
```

### Security Camera App
Stream to local RTMP servers for security monitoring:
```typescript
await session.camera.startStream({
  rtmpUrl: 'rtmp://192.168.1.100/security/cam1'
});
```

### Photo Documentation App
Capture and save photos for documentation:
```typescript
const photo = await session.camera.requestPhoto({
  saveToGallery: true
});
await uploadToCloudStorage(photo.buffer);
```


## 🚨 Important Notes

- **Permissions**: Camera access requires the `camera` permission in your app manifest
- **Hardware**: Only available on camera-equipped glasses (e.g., Mentra Live)
- **Battery**: Extended streaming can drain battery quickly
- **Privacy**: Always notify users when camera is active

## 📖 See Also

- [Permissions Guide](/permissions) - Setting up camera permissions
- [Events Documentation](/events) - Handling camera-related events
- [API Reference](/reference/managers/camera) - Complete API documentation