# RTMP Relay Architecture Design

## Overview

This document outlines the architecture for handling "dirty" RTMP streams from Android smart glasses and converting them to "clean" streams for Cloudflare Live distribution.

## Current Problem

- Android smart glasses produce inconsistent RTMP streams
- Cloudflare Live is too strict and rejects these streams
- Issues include: irregular GOPs, timestamp problems, variable frame rates
- Current workaround attempts (frame throttling removal, keyframe forcing) haven't solved the issue

## Solution: RTMP Relay Layer

Simple architecture: **Android Glasses → MediaMTX Relay → Cloudflare Live → HLS to Apps**

This keeps our existing infrastructure while solving the stream compatibility issue.

## Current System Analysis

### Existing Flow
1. **App requests managed stream** via `ManagedStreamingExtension.startManagedStream()`
2. **CloudflareStreamService** creates a new live input
3. **Glasses receive RTMP URL** directly to Cloudflare
4. **Stream fails** due to compatibility issues

### Key Components
- **CloudflareStreamService**: Manages Cloudflare Live API interactions
- **ManagedStreamingExtension**: Handles managed streaming logic
- **StreamStateManager**: Tracks active streams and enforces single-stream-per-user

## Relay Integration Plan

### Architecture Changes

```
Current (Broken):
[Glasses] → [Cloudflare Live] ❌

New (Working):
[Glasses] → [Relay Pool] → [Cloudflare Live] ✅
```

### Minimal Code Changes Required

1. **Add RelayService** alongside CloudflareStreamService
2. **Modify one line** in ManagedStreamingExtension
3. **No changes** to apps, glasses firmware, or client code

## Implementation Details

### 1. MediaMTX Relay Configuration

```yaml
# relay/mediamtx.yml
logLevel: info
logDestinations: [stdout]

api:
  address: :9997

rtmp:
  address: :1935

paths:
  # Intake from glasses: /live/{userId}/{streamId}
  live/(.+)/(.+):
    source: publisher
    sourceProtocol: rtmp
    
    # Clean and forward to Cloudflare on publish
    runOnPublish: |
      #!/bin/bash
      USER_ID=$1
      STREAM_ID=$2
      
      # Get Cloudflare URL from our API
      CF_URL=$(curl -s $CLOUD_API_URL/api/relay/cf-url/$USER_ID/$STREAM_ID)
      
      # Transcode to clean stream
      ffmpeg -i rtmp://localhost:1935/live/$USER_ID/$STREAM_ID \
        -c:v libx264 -preset veryfast -tune zerolatency \
        -g 30 -keyint_min 30 -sc_threshold 0 \
        -b:v 2M -maxrate 2.5M -bufsize 4M \
        -c:a aac -ar 44100 -ac 1 -b:a 128k \
        -f flv $CF_URL
        
    runOnPublishRestart: yes
```

### 2. RelayService (New)

```typescript
// packages/cloud/src/services/streaming/RelayService.ts

export interface RelayEndpoint {
  relayId: string;
  rtmpUrl: string;
  hostname: string;
  port: number;
}

export class RelayService {
  private logger: Logger;
  private relays: RelayEndpoint[] = [];
  
  constructor(logger: Logger) {
    this.logger = logger.child({ service: 'RelayService' });
    this.initializeRelays();
  }
  
  private initializeRelays() {
    // In production, use environment variables for relay discovery
    // Format: RELAY_URLS="rtmp-relay-uscentral.mentra.glass:1935"
    const relayUrls = process.env.RELAY_URLS?.split(',') || [
      'rtmp-relay-uscentral.mentra.glass:1935'
    ];
    
    this.relays = relayUrls.map((url, index) => {
      const [hostname, port] = url.split(':');
      return {
        relayId: `relay-${index}`,
        hostname,
        port: parseInt(port) || 1935,
        rtmpUrl: `rtmp://${hostname}:${port}`
      };
    });
  }
  
  /**
   * Get relay endpoint for a user using consistent hashing
   */
  getRelayForUser(userId: string): RelayEndpoint {
    // Simple consistent hashing
    const hash = crypto.createHash('md5').update(userId).digest();
    const index = hash.readUInt32BE(0) % this.relays.length;
    return this.relays[index];
  }
  
  /**
   * Build RTMP URL for glasses to connect to relay
   */
  buildRelayUrl(userId: string, streamId: string): string {
    const relay = this.getRelayForUser(userId);
    return `${relay.rtmpUrl}/live/${userId}/${streamId}`;
  }
}
```

### 3. Modified ManagedStreamingExtension

Only ONE line needs to change:

```typescript
// In startManagedStream() method, around line 176

// OLD:
rtmpUrl: liveInput.rtmpUrl, // Direct to Cloudflare

// NEW:
rtmpUrl: this.relayService.buildRelayUrl(userId, managedStream.streamId), // Via relay
```

### 4. Relay Endpoint for Cloudflare URL Lookup

```typescript
// Add to existing Express routes

app.get('/api/relay/cf-url/:userId/:streamId', async (req, res) => {
  const { userId, streamId } = req.params;
  
  // Get stream state
  const streamState = streamStateManager.getStreamStateByStreamId(streamId);
  if (!streamState || streamState.type !== 'managed') {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  // Return Cloudflare ingest URL
  res.json({ url: streamState.cfIngestUrl });
});
```

### 5. Porter Deployment

```yaml
# porter.yaml
services:
  rtmp-relay:
    build: ./relay
    replicas: 2  # Start with 2, autoscale later
    cpu:
      request: 0.5
      limit: 2
    memory:
      request: 512Mi
      limit: 1Gi
    ports:
      - containerPort: 1935
        name: rtmp
        protocol: TCP
      - containerPort: 9997
        name: api
        protocol: TCP
    env:
      - name: CLOUD_API_URL
        value: "https://api.mentra.glass"  # Or use ${CLOUD_API_URL} from Porter env
    healthCheck:
      path: /v3/config/get
      port: 9997
      initialDelaySeconds: 10
      periodSeconds: 10
```

### 6. Relay Dockerfile

```dockerfile
# relay/Dockerfile
FROM bluenviron/mediamtx:latest-ffmpeg

# Copy our config
COPY mediamtx.yml /mediamtx.yml

# Add curl for health checks and API calls
RUN apk add --no-cache curl

EXPOSE 1935 9997

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD curl -f http://localhost:9997/v3/config/get || exit 1
```

## Benefits of This Approach

1. **Minimal Changes**: Only modify one line in existing code
2. **No Client Updates**: Glasses/apps don't need changes
3. **Proven Solution**: FFmpeg transcoding is battle-tested
4. **Easy Rollback**: Can switch back to direct Cloudflare if needed
5. **Future Flexibility**: Relay can later add features like recording, analytics

## Deployment Steps

### Phase 1: Single Relay Test
1. Deploy one MediaMTX instance
2. Test with single stream
3. Verify Cloudflare accepts cleaned stream
4. Monitor latency and quality

### Phase 2: Production Rollout
1. Deploy relay instance in US Central region
2. Set CLOUD_API_URL to point to corresponding regional API
3. Update ManagedStreamingExtension
4. Monitor and scale based on load

### Phase 3: Optimization
1. Add autoscaling based on CPU/streams
2. Implement health checks and failover
3. Add monitoring/metrics
4. Deploy additional regions (EU, Asia) with corresponding CLOUD_API_URL settings

## Monitoring & Operations

### Key Metrics
- **Relay → Cloudflare success rate**: Should be 100%
- **Added latency**: Target < 300ms
- **CPU per stream**: ~5-10% per 720p stream
- **Memory usage**: ~50MB base + 10MB per stream

### Health Checks
- MediaMTX API endpoint for liveness
- Active stream count for load balancing
- FFmpeg process monitoring

### Debugging
- MediaMTX logs show connection/disconnection
- FFmpeg logs show transcoding issues
- Cloudflare dashboard shows final stream status

## Cost Estimate

- **1 relay instance (US Central)**: ~$25/month on Azure Container Apps
- **Bandwidth**: Negligible (relay to Cloudflare is minimal)
- **Total added cost**: ~$25/month initially
- **Future regions**: +$25/month per region
- **Value**: Streams actually work!

## Summary

This relay approach:
- Solves the immediate problem with minimal changes
- Preserves existing Cloudflare integration
- Adds < 300ms latency
- Costs ~$50/month extra
- Can be implemented in 1-2 days

The key insight: Instead of fighting with Android encoders or Cloudflare requirements, we add a thin translation layer that speaks both languages.