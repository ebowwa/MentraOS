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
Stream live video from smart glasses with two powerful options:

**🚀 Managed Streaming (Recommended)**
- Zero infrastructure required
- Automatic HLS/DASH URL generation
- Multi-app support - multiple apps can access the same stream
- Perfect for social media integration

**🔧 Unmanaged Streaming**
- Full control over RTMP endpoints
- Exclusive camera access
- Custom server integration
- Ultra-low latency options

## 🎯 Quick Start

### Taking a Photo
```typescript
const photo = await session.camera.requestPhoto({ saveToGallery: true });
console.log(`Photo captured: ${photo.mimeType}, ${photo.size} bytes`);
```

### Starting a Managed Stream (Easy Mode)
```typescript
// Start streaming with zero configuration!
const result = await session.camera.startManagedStream();
console.log('Share this URL with viewers:', result.hlsUrl);
```

### Starting an Unmanaged Stream (Full Control)
```typescript
await session.camera.startStream({
  rtmpUrl: 'rtmp://your-server.com/live/stream-key',
  video: { width: 1280, height: 720, bitrate: 2000000 }
});
```

## 📚 Documentation Structure

- **[Photo Capture Guide](./photo-capture.md)** - Complete guide for taking photos
- **[RTMP Streaming Guide](./rtmp-streaming.md)** - Comprehensive streaming documentation covering both managed and unmanaged options
- **[API Reference](/reference/managers/camera)** - Detailed API documentation for all camera methods

## 🎬 Common Use Cases

### Social Media Streaming
Use managed streaming for easy integration with platforms like YouTube Live, X (Twitter), and TikTok:
```typescript
const stream = await session.camera.startManagedStream();
// Share stream.hlsUrl with your viewers!
```

### Security Camera App
Use unmanaged streaming for full control and local network streaming:
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

## 🔑 Key Differences: Managed vs Unmanaged Streaming

| Feature | Managed Streaming | Unmanaged Streaming |
|---------|------------------|---------------------|
| **Infrastructure Required** | ❌ None | ✅ RTMP Server |
| **Multiple Apps Can Stream** | ✅ Yes | ❌ No (Exclusive) |
| **Setup Complexity** | 🟢 Easy | 🔴 Complex |
| **Best For** | Social media, demos, prototypes | Custom servers, local networks |

## 🚨 Important Notes

- **Permissions**: Camera access requires the `CAMERA` permission in your app manifest. See [Permissions Guide](/permissions) for setup instructions.
- **Hardware**: Only available on camera-equipped glasses (e.g., Mentra Live)
- **Battery**: Extended streaming can drain battery quickly
- **Privacy**: Always notify users when camera is active

## 📖 See Also

- [Permissions Guide](/permissions) - Setting up camera permissions
- [Events Documentation](/events) - Handling camera-related events
- [API Reference](/reference/managers/camera) - Complete API documentation