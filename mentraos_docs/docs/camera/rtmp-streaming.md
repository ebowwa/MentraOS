# RTMP Streaming Guide

This guide covers how to stream video from smart glasses using MentraOS with RTMP streaming.

> **Note:** RTMP streaming requires smart glasses with a camera, such as [Mentra Live](https://mentra.glass/live).

## Overview

MentraOS supports RTMP streaming, allowing you to stream video from smart glasses to any RTMP server. This gives you full control over your streaming infrastructure.

### RTMP Streaming Features

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

## Important Notes

### 🔒 Exclusive Camera Lock

RTMP streaming **takes exclusive control of the device's camera**:

```typescript
// App A starts RTMP stream
await sessionA.camera.startStream({
  rtmpUrl: 'rtmp://myserver.com/live/key'
});

// App B tries to start ANY stream
await sessionB.camera.startStream({...});   // ❌ FAILS - Camera busy!
```

**Key points:**
- Only ONE RTMP stream can run at a time
- Blocks ALL other streaming
- The app must stop its stream before others can use the camera
- Use this when you need guaranteed exclusive camera access

## When to Use RTMP Streaming

Use RTMP streaming when:
- 🏠 **Local network only** - No internet required
- 🔒 **Need exclusive camera access** - No other apps can interfere
- ⚡ **Ultra-low latency critical** - Direct RTMP connection
- 🛠️ **Custom infrastructure** - You have specific RTMP requirements
- 🎮 **Full control required** - Custom encoding, protocols, etc.

## RTMP Streaming Guide

### Basic Example

```typescript
import { AppServer, AppSession, StreamType } from '@mentra/sdk';

class RTMPStreamingApp extends AppServer {
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    session.logger.info('🔧 RTMP streaming app session started');

    // Subscribe to RTMP stream status updates
    session.subscribe(StreamType.RTMP_STREAM_STATUS);

    // Set up stream status monitoring BEFORE starting
    const statusUnsubscribe = session.camera.onStreamStatus((status) => {
      console.log(`Stream status: ${status.status}`);

      if (status.status === 'active') {
        console.log('🟢 RTMP stream is live!');
        session.layouts.showTextWall('🟢 Stream is live!');

        if (status.stats) {
          console.log(`Stats:
            Bitrate: ${status.stats.bitrate} bps
            FPS: ${status.stats.fps}
            Duration: ${status.stats.duration}s
            Dropped Frames: ${status.stats.droppedFrames}
          `);
        }
      } else if (status.status === 'error') {
        console.error(`❌ Stream error: ${status.errorDetails}`);
        session.layouts.showTextWall(`❌ Stream Error\n\n${status.errorDetails || 'Unknown error'}`);
      } else if (status.status === 'initializing') {
        console.log('📡 Initializing RTMP connection...');
        session.layouts.showTextWall('📡 Connecting to RTMP server...');
      } else if (status.status === 'connecting') {
        console.log('🔗 Connecting to RTMP server...');
        session.layouts.showTextWall('🔗 Establishing connection...');
      } else if (status.status === 'stopped') {
        console.log('🔴 Stream stopped');
        session.layouts.showTextWall('🔴 Stream stopped');
      }
    });

    // Start RTMP stream
    try {
      await session.camera.startStream({
        rtmpUrl: 'rtmp://live.example.com/live/your-stream-key',
        video: {
          width: 1280,
          height: 720,
          bitrate: 2500000, // 2.5 Mbps
          frameRate: 30
        },
        audio: {
          bitrate: 128000, // 128 kbps
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true
        },
        stream: {
          durationLimit: 1800 // 30 minutes max
        }
      });

      console.log('🎥 RTMP stream request sent!');
      session.layouts.showTextWall('🎥 Starting RTMP stream...');

    } catch (error) {
      console.error('Failed to start RTMP stream:', error);
      session.layouts.showTextWall('❌ Failed to start RTMP stream');

      if (error.message.includes('Already streaming')) {
        session.layouts.showTextWall('❌ Camera is busy\n\nAnother stream is active');
      }
    }

    // Voice commands for stream control
    const transcriptionUnsubscribe = session.events.onTranscription(async (data) => {
      if (!data.isFinal) return;

      const command = data.text.toLowerCase().trim();

      if (command.includes('stop stream') || command.includes('end stream')) {
        await session.camera.stopStream();
        session.layouts.showTextWall('🛑 Stopping stream...');
      } else if (command.includes('stream status')) {
        const status = session.camera.getStreamStatus();
        if (status) {
          session.layouts.showTextWall(`Stream Status: ${status.status}`);
        } else {
          session.layouts.showTextWall('No active stream');
        }
      }
    });

    // Monitor stream health periodically
    const healthCheckInterval = setInterval(() => {
      if (session.camera.isCurrentlyStreaming()) {
        const status = session.camera.getStreamStatus();
        if (status?.stats) {
          // Alert if dropped frames are high
          const dropRate = (status.stats.droppedFrames / (status.stats.fps * status.stats.duration)) * 100;
          if (dropRate > 5) { // More than 5% dropped frames
            console.warn(`⚠️ High drop rate: ${dropRate.toFixed(1)}%`);
            session.layouts.showTextWall(`⚠️ Poor connection\n\nDropped frames: ${dropRate.toFixed(1)}%`);
          }
        }
      }
    }, 10000); // Check every 10 seconds

    // Clean up when session ends
    this.addCleanupHandler(statusUnsubscribe);
    this.addCleanupHandler(transcriptionUnsubscribe);
    this.addCleanupHandler(() => clearInterval(healthCheckInterval));
  }
}

// Bootstrap the server
new RTMPStreamingApp({
  packageName: process.env.PACKAGE_NAME ?? "com.example.rtmpstreaming",
  apiKey: process.env.MENTRAOS_API_KEY!,
  port: Number(process.env.PORT ?? "3000"),
}).start();
```

### Stream Status Monitoring

Monitor your RTMP stream with detailed statistics:

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

### Utility Methods for RTMP Streams

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

## Setting Up Your RTMP Server

For RTMP streaming, you'll need an RTMP server. Options include:

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
   - Consider using a transcoding service for better compatibility

## Error Handling

### RTMP Stream Errors

```typescript
try {
  await session.camera.startStream({ rtmpUrl });
} catch (error) {
  if (error.message.includes('Already streaming')) {
    // Another stream is active
  } else if (error.message.includes('Invalid URL')) {
    // RTMP URL format is incorrect
  } else if (error.message.includes('Network')) {
    // Can't connect to RTMP server
  }
}
```

## Troubleshooting

### Common Issues

**"Stream won't start"**
- Ensure glasses have camera (e.g., Mentra Live)
- Check network connectivity
- Verify API credentials
- Ensure no other stream is active

**"Viewers can't connect"**
- Check RTMP server is accessible
- Verify firewall settings
- Ensure correct playback URL

**"Poor quality or buffering"**
- Monitor dropped frames in stream stats
- Check network bandwidth (use lower bitrate)
- Verify server can handle the bitrate
- Consider network conditions between glasses and phone

**"Stream keeps dropping"**
- Check battery level on glasses and phone
- Reduce video quality settings
- Monitor temperature (extended streaming causes heating)

## API Reference

### RTMP Streaming

```typescript
// Start RTMP stream
session.camera.startStream(options: RtmpStreamOptions): Promise<void>

// Stop RTMP stream
session.camera.stopStream(streamId?: string): Promise<void>

// Types
interface RtmpStreamOptions {
  /** The RTMP URL to stream to (e.g., rtmp://server.example.com/live/stream-key) */
  rtmpUrl: string;
  
  /** Optional video configuration */
  video?: {
    width?: number;
    height?: number;
    bitrate?: number;
    frameRate?: number;
  };
  
  /** Optional audio configuration */
  audio?: {
    bitrate?: number;
    sampleRate?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
  };
  
  /** Optional stream configuration */
  stream?: {
    durationLimit?: number; // Maximum duration in seconds
  };
}
```

## Support

- [Discord Community](https://discord.gg/5ukNvkEAqT)