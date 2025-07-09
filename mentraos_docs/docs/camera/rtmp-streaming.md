# RTMP Streaming Guide

This guide covers how to stream video from smart glasses using MentraOS. We offer two streaming approaches: **Managed Streaming** (recommended) and **Unmanaged Streaming**.

> **Note:** RTMP streaming requires smart glasses with a camera, such as [Mentra Live](https://mentra.glass/live).

## Quick Start: Managed Streaming (Recommended)

Managed streaming handles all the infrastructure for you - no RTMP servers needed!

```typescript
// Start streaming
const result = await session.camera.startManagedStream();

// IMPORTANT: URLs are returned immediately but may not be ready yet!
// Listen for status updates to know when stream is actually live
session.camera.onManagedStreamStatus((status) => {
  if (status.status === 'active') {
    console.log('Stream is now live! Share this URL:', status.hlsUrl);
  }
});

// Stop when done
await session.camera.stopManagedStream();
```

## Streaming Options Comparison

### 🚀 Managed Streaming (Recommended for Most Users)

**Perfect for:**
- Social media streaming (X, YouTube Live, TikTok Live)
- Multi-app scenarios where multiple apps need video access
- Quick prototypes and demos
- Production apps without existing infrastructure
- Global content distribution

**Pros:**
- ✅ **Zero infrastructure** - No RTMP server needed
- ✅ **Multi-app support** - Multiple apps can subscribe to the same stream
- ✅ **Non-blocking** - Other apps can still access video data
- ✅ **Automatic retries** - Handles connection issues gracefully
- ✅ **Global CDN** - Viewers worldwide get low latency
- ✅ **Multiple formats** - HLS, DASH, and WebRTC URLs provided
- ✅ **Social media compatible** - Proper bitrates/resolutions for platforms
- ✅ **EZPZ mode** - Just call `startManagedStream()` and go!

**Cons:**
- ❌ Requires internet connection
- ❌ URLs aren't immediately usable (wait for 'active' status)
- ❌ Small processing delay (typically 2-5 seconds)
- ❌ Less control over encoding parameters

### 🔧 Unmanaged Streaming

**Perfect for:**
- Exclusive camera access requirements
- Local network streaming
- Custom RTMP servers
- Ultra-low latency requirements
- Full control scenarios

**Pros:**
- ✅ **Full control** - You manage everything
- ✅ **Exclusive access** - Guaranteed camera control
- ✅ **Local network** - Can stream without internet
- ✅ **Custom endpoints** - Use any RTMP server
- ✅ **Lower latency** - Direct connection to your server

**Cons:**
- ❌ **Blocks other apps** - No other app can stream while active
- ❌ **Infrastructure required** - You need an RTMP server
- ❌ **No automatic retries** - You handle connection issues
- ❌ **Social media issues** - Glasses may not output expected bitrates/resolutions
- ❌ **More complex** - You handle distribution, transcoding, etc.

## Feature Comparison Table

| Feature | Managed Streaming | Unmanaged Streaming |
|---------|------------------|---------------------|
| **Infrastructure Required** | ❌ None | ✅ RTMP Server |
| **Multiple Apps Can Stream** | ✅ Yes | ❌ No (Exclusive) |
| **Blocks Other Apps** | ❌ No | ✅ Yes |
| **Setup Complexity** | 🟢 Easy | 🔴 Complex |
| **Internet Required** | ✅ Yes | ❌ No |
| **Viewer URLs Provided** | ✅ HLS/DASH/WebRTC | ❌ You manage |
| **Automatic Retries** | ✅ Yes | ❌ No |
| **Social Media Compatible** | ✅ Optimized | ⚠️ May have issues |
| **Latency** | 🟡 2-5 seconds | 🟢 < 1 second |
| **Custom RTMP Server** | ❌ No | ✅ Yes |
| **Recording Option** | ✅ Available | ❌ You implement |
| **Global CDN** | ✅ Included | ❌ You manage |
| **Bandwidth Adaptive** | ✅ Yes | ❌ No |
| **Camera Access** | 🤝 Shared | 🔒 Exclusive |

## Important Nuances

### ⏳ Managed Streaming: Asynchronous URL Availability

With managed streaming, the URLs returned by `startManagedStream()` are **not immediately usable**. Here's why:

1. **Initial Response**: When you call `startManagedStream()`, you get URLs immediately
2. **Status: 'initializing'**: Stream setup begins, but URLs aren't functional yet
3. **Processing Time**: Cloudflare needs 2-5 seconds to process the incoming RTMP stream
4. **Status: 'active'**: Stream is live and URLs are now functional
5. **Ready to Share**: Only share URLs with viewers after status is `'active'`

```typescript
// ❌ DON'T DO THIS - URLs might not work yet!
const result = await session.camera.startManagedStream();
shareUrlWithViewers(result.hlsUrl); // Too early!

// ✅ DO THIS - Wait for active status
const result = await session.camera.startManagedStream();
session.camera.onManagedStreamStatus((status) => {
  if (status.status === 'active') {
    shareUrlWithViewers(status.hlsUrl); // Now it works!
  }
});
```

### 🤝 Managed Streaming: Collaborative by Design

With managed streaming, **multiple MentraOS apps can access the video stream simultaneously**. This enables powerful multi-app scenarios:

```typescript
// App A: Live captioning app
await sessionA.camera.startManagedStream({ quality: '720p' });

// App B: Can ALSO access the same video stream!
// (e.g., for AI analysis, recording, effects, etc.)
await sessionB.camera.startManagedStream({ quality: '720p' });

// Both apps receive the video data without conflict
```

This is perfect when you want multiple apps to work together, each adding their own functionality to the live stream.

### 🔒 Unmanaged Streaming: Exclusive Camera Lock

Unmanaged streaming **takes exclusive control of the device's camera**:

```typescript
// App A starts unmanaged stream
await sessionA.camera.startStream({
  rtmpUrl: 'rtmp://myserver.com/live/key'
});

// App B tries to start ANY stream (managed or unmanaged)
await sessionB.camera.startManagedStream(); // ❌ FAILS - Camera busy!
await sessionB.camera.startStream({...});   // ❌ FAILS - Camera busy!
```

**Key points:**
- Only ONE unmanaged stream can run at a time
- Blocks ALL other streaming (managed or unmanaged)
- The app must stop its stream before others can use the camera
- Use this when you need guaranteed exclusive camera access

## When to Use Each Approach

### Use Managed Streaming When:
- 📱 **Building social media integrations** - Optimized for platforms
- 🤝 **Multiple apps need video** - AI assistants + live captions + streaming
- 🌍 **Global audience** - Built-in CDN handles distribution
- 🚀 **Quick prototyping** - No infrastructure setup needed
- 📊 **Building collaborative apps** - Multiple apps enhancing one stream

### Use Unmanaged Streaming When:
- 🏠 **Local network only** - No internet required
- 🔒 **Need exclusive camera access** - No other apps can interfere
- ⚡ **Ultra-low latency critical** - Direct RTMP connection
- 🛠️ **Custom infrastructure** - You have specific RTMP requirements
- 🎮 **Full control required** - Custom encoding, protocols, etc.

## Managed Streaming Guide

### Basic Example

```typescript
import { AppSession, StreamType } from '@mentra/sdk';

const session = new AppSession({
  packageName: 'com.example.livestream',
  apiKey: 'your-api-key',
  userId: 'user@example.com'
});

await session.connect('session-123');

// Subscribe to stream status updates
session.subscribe(StreamType.MANAGED_STREAM_STATUS);

// IMPORTANT: Set up status listener BEFORE starting stream
session.camera.onManagedStreamStatus((status) => {
  console.log('Stream status:', status.status);
  
  if (status.status === 'active') {
    // NOW the URLs are ready to share!
    console.log('🟢 Stream is live!');
    console.log('Share these URLs with viewers:');
    console.log('HLS URL:', status.hlsUrl);
    console.log('DASH URL:', status.dashUrl);
  }
});

// Start managed streaming
try {
  const result = await session.camera.startManagedStream();
  
  console.log('🎥 Stream request sent!');
  console.log('⏳ Waiting for stream to go live...');
  // NOTE: URLs are returned but may not work until status is 'active'
  
} catch (error) {
  console.error('Failed to start stream:', error);
}

// Stop streaming
await session.camera.stopManagedStream();
```

### Enable WebRTC for Low Latency

If you need ultra-low latency viewing:

```typescript
const result = await session.camera.startManagedStream({
  enableWebRTC: true
});
console.log('WebRTC URL:', result.webrtcUrl); // ~2-3 second latency
```

### Status Handling

```typescript
session.on(StreamType.MANAGED_STREAM_STATUS, (status) => {
  switch (status.status) {
    case 'initializing':
      console.log('📡 Setting up stream...');
      // URLs exist but won't work until 'active' status
      break;
      
    case 'active':
      console.log('🟢 Stream is live!');
      console.log('Share these URLs:');
      console.log('- HLS:', status.hlsUrl);
      console.log('- Low latency:', status.webrtcUrl);
      // NOW viewers can connect to these URLs
      break;
      
    case 'stopping':
      console.log('🟡 Stream is stopping...');
      break;
      
    case 'stopped':
      console.log('🔴 Stream stopped');
      break;
      
    case 'error':
      console.error('❌ Stream error:', status.message);
      break;
  }
});
```

### Sharing with Viewers

**⚠️ IMPORTANT**: Wait for the stream status to be `'active'` before sharing URLs with viewers! The URLs are returned immediately but won't work until Cloudflare has processed the incoming stream.

Once your stream status is `'active'`, share the provided URLs:

- **HLS URL** (`hlsUrl`) - Best compatibility, works everywhere
- **DASH URL** (`dashUrl`) - Alternative adaptive format
- **WebRTC URL** (`webrtcUrl`) - Lowest latency (2-3 seconds)

Viewers can watch using any HLS-compatible player:
- Web: [Video.js](https://videojs.com/), [HLS.js](https://github.com/video-dev/hls.js)
- Mobile: Native video players
- VLC, ffplay, etc.

## Unmanaged Streaming Guide

For full control over your streaming infrastructure, use unmanaged streaming.

### Example (from [rtmp-streaming-example.ts](../packages/sdk/src/examples/rtmp-streaming-example.ts))

```typescript
import { AppSession, StreamType } from '@mentra/sdk';

const session = new AppSession({
  packageName: 'com.example.streaming-demo',
  apiKey: 'your-api-key',
  userId: 'user@example.com'
});

await session.connect('streaming-demo-session');

// Subscribe to stream status updates
session.subscribe(StreamType.RTMP_STREAM_STATUS);

// Set up status handler
session.camera.onStreamStatus((status) => {
  console.log(`Stream status: ${status.status}`);
  
  if (status.stats) {
    console.log(`Stats:
      Bitrate: ${status.stats.bitrate} bps
      FPS: ${status.stats.fps}
      Duration: ${status.stats.duration}s
    `);
  }
});

// Start unmanaged stream to your RTMP server
await session.camera.startStream({
  rtmpUrl: 'rtmp://your-server.com/live/stream-key'
});

// Stop when done
await session.camera.stopStream();
```

### Stream Status Monitoring

Monitor your unmanaged stream with detailed statistics:

```typescript
session.camera.onStreamStatus((status) => {
  console.log(`Stream status: ${status.status}`);
  
  if (status.stats) {
    console.log(`Stats:
      Bitrate: ${status.stats.bitrate} bps
      FPS: ${status.stats.fps}
      Duration: ${status.stats.duration}s
      Dropped Frames: ${status.stats.droppedFrames} // Monitor for quality issues
    `);
  }
});
```

### Utility Methods for Unmanaged Streams

```typescript
// Check if currently streaming
if (session.camera.isCurrentlyStreaming()) {
  console.log('Stream is active');
}

// Get current stream URL
const currentUrl = session.camera.getCurrentStreamUrl();
console.log('Streaming to:', currentUrl);

// Get detailed stream status
const status = session.camera.getStreamStatus();
if (status) {
  console.log('Status:', status.status);
  console.log('Stream ID:', status.streamId);
}
```

### Setting Up Your RTMP Server

For unmanaged streaming, you'll need an RTMP server. Options include:

1. **Local Development**: [Node Media Server](https://github.com/illuspas/Node-Media-Server)
   ```bash
   npm install -g node-media-server
   node-media-server
   ```

2. **Production**: 
   - [nginx-rtmp](https://github.com/arut/nginx-rtmp-module)
   - [Amazon IVS](https://aws.amazon.com/ivs/)
   - [Wowza Streaming Engine](https://www.wowza.com/)

3. **Social Media Direct** (Not Recommended):
   - The glasses may not output the exact format expected
   - Use managed streaming for better compatibility

## Migration Guide

### Moving from Unmanaged to Managed

Replace this:
```typescript
// Old unmanaged approach
await session.camera.startStream({
  rtmpUrl: 'rtmp://myserver.com/live/key',
  video: { width: 1280, height: 720 }
});
```

With this:
```typescript
// New managed approach
const result = await session.camera.startManagedStream({
  quality: '720p'
});
// Share result.hlsUrl with viewers
```

## Best Practices

### For Managed Streaming
1. **Start with defaults** - The system optimizes settings automatically
2. **Share HLS URL** - Best compatibility for viewers
3. **Handle errors** - Network issues can interrupt streams
4. **Clean shutdown** - Always call `stopManagedStream()`
5. **Monitor status** - React to stream state changes appropriately

### For Unmanaged Streaming
1. **Test locally first** - Ensure your RTMP server works
2. **Monitor connection** - Handle disconnections gracefully
3. **Match platform requirements** - Social media platforms have specific requirements
4. **Consider managed instead** - Especially for social media streaming

### RTMP Streaming Best Practices

#### Network & Performance
- **Use appropriate bitrates**: Start with 1.5-2 Mbps for 720p
- **Monitor dropped frames**: > 5% indicates network issues
- **Test on different networks**: WiFi vs cellular performance varies
- **Implement retry logic**: Networks can be unstable

```typescript
// Adaptive bitrate based on network
const bitrate = await detectNetworkSpeed() > 5 ? 2500000 : 1500000;
```

#### Battery & Heat Management
- **Set duration limits**: Extended streaming drains battery rapidly
- **Monitor device temperature**: Pause if overheating detected
- **Warn users about battery**: Show battery level in UI
- **Provide charging reminder**: For streams > 30 minutes

```typescript
// Implement duration limits
const MAX_STREAM_DURATION = 30 * 60; // 30 minutes
setTimeout(() => {
  notifyUser('Stream ending to preserve battery');
  session.camera.stopStream();
}, MAX_STREAM_DURATION * 1000);
```

#### User Experience
- **Show streaming indicator**: Users should know when camera is active
- **Provide quality options**: Let users choose based on their needs
- **Buffer status updates**: Don't overwhelm UI with every status change
- **Save stream settings**: Remember user preferences

```typescript
// Debounce status updates
let statusBuffer = [];
const updateInterval = setInterval(() => {
  if (statusBuffer.length > 0) {
    updateUI(statusBuffer[statusBuffer.length - 1]);
    statusBuffer = [];
  }
}, 1000);

## Error Handling

### Managed Stream Errors

```typescript
try {
  await session.camera.startManagedStream();
} catch (error) {
  if (error.message.includes('Already streaming')) {
    // Another managed stream is active
  } else if (error.message.includes('Cloud service error')) {
    // MentraOS streaming service issue
  } else if (error.message.includes('timeout')) {
    // Stream initialization timeout (30s)
  }
}
```

### Unmanaged Stream Errors

```typescript
try {
  await session.camera.startStream({ rtmpUrl });
} catch (error) {
  if (error.message.includes('Already streaming')) {
    // Another stream is active (managed or unmanaged)
  } else if (error.message.includes('Invalid URL')) {
    // RTMP URL format is incorrect
  } else if (error.message.includes('Network')) {
    // Can't connect to RTMP server
  } else if (error.message.includes('managed stream active')) {
    // A managed stream is blocking this request
  }
}
```

## Troubleshooting

### Common Issues

**"Stream won't start"**
- Ensure glasses have camera (e.g., Mentra Live)
- Check network connectivity
- Verify API credentials
- For unmanaged: Ensure no managed stream is active

**"Viewers can't connect"**
- For managed: Ensure you're sharing the correct URL
- For unmanaged: Check RTMP server is accessible

**"Poor quality or buffering"**
- Monitor dropped frames in stream stats
- Check network bandwidth (use lower bitrate)
- For unmanaged: Verify server can handle the bitrate
- Consider network conditions between glasses and phone

**"Stream keeps dropping"**
- Check battery level on glasses and phone
- Reduce video quality settings
- Monitor temperature (extended streaming causes heating)

## Examples & Integration

### Quick Examples

```typescript
// Managed Streaming - Zero Config (but async URL availability!)
const result = await session.camera.startManagedStream();

// Wait for stream to be active before sharing URLs
session.camera.onManagedStreamStatus((status) => {
  if (status.status === 'active') {
    console.log('Share:', status.hlsUrl);
  }
});

// Unmanaged Streaming - Your Server
await session.camera.startStream({
  rtmpUrl: 'rtmp://your-server.com/live/key'
});
```

### Full Examples

- 📘 [React Streaming Dashboard](./examples/streaming-react.md) - Complete React component with UI
- 📗 [Managed Streaming Example](../packages/sdk/src/examples/managed-rtmp-streaming-example.ts) - Zero-config streaming
- 📗 [Unmanaged Streaming Example](../packages/sdk/src/examples/rtmp-streaming-example.ts) - Custom RTMP server

## API Reference

### Managed Streaming

```typescript
// Start managed stream - all parameters are optional!
camera.startManagedStream(options?: ManagedStreamOptions): Promise<ManagedStreamResult>

// Stop managed stream
camera.stopManagedStream(): Promise<void>

// Types
interface ManagedStreamOptions {
  enableWebRTC?: boolean;          // Optional, enables low-latency WebRTC URL
}

interface ManagedStreamResult {
  streamId: string;
  hlsUrl: string;                  // Always provided
  dashUrl: string;                 // Always provided
  webrtcUrl?: string;              // Only if enableWebRTC: true
}

// Simplest usage - zero config!
const result = await camera.startManagedStream();
```

### Unmanaged Streaming

```typescript
// Start unmanaged stream
camera.startStream(options: RtmpStreamOptions): Promise<void>

// Stop unmanaged stream
camera.stopStream(streamId?: string): Promise<void>

// Types
interface RtmpStreamOptions {
  /** The RTMP URL to stream to (e.g., rtmp://server.example.com/live/stream-key) */
  rtmpUrl: string;
}
```

## Support

- [Discord Community](https://discord.gg/5ukNvkEAqT)
- [GitHub Issues](https://github.com/Mentra-Community/augmentos_cloud/issues)
- Email: support@mentra.me