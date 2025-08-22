# RTMP Relay Implementation Archive

## Overview

This document archives the RTMP relay implementation that was temporarily used in MentraOS to handle "dirty" RTMP streams from Android smart glasses. The relay was introduced in PR #698 when Cloudflare Stream Live was rejecting our streams due to irregular GOPs, variable frame rates, and timestamp issues.

**Status**: REMOVED from codebase (but relay infrastructure preserved for potential future use)
**Removal Date**: 2025-08-04
**Original PR**: #698 (July 2025)

## Why It Was Created

### The Problem

- Android smart glasses produced inconsistent RTMP streams
- Issues included:
  - Irregular GOPs (Group of Pictures) - sometimes as short as 0.0685 seconds
  - Variable frame rates (9-15 fps instead of stable 24-30 fps)
  - Timestamp discontinuities
  - Non-constant frame rate behavior
- Cloudflare Stream Live is strict and rejected these "dirty" streams
- Streams would show as "connected" but never start playing

### The Solution

Created an intermediary RTMP relay using MediaMTX + FFmpeg to:

1. Accept dirty streams from glasses
2. Clean/transcode them to Cloudflare-compatible format
3. Generate HLS directly (bypassing Cloudflare entirely)
4. Notify cloud when HLS was ready

## Architecture

```
Original (Broken):
[Glasses] → [Cloudflare Live] ❌

With Relay (Working):
[Glasses] → [MediaMTX Relay] → [FFmpeg cleaning] → [HLS files]
                                                  ↓
                                        [Cloud gets notified]
```

## Components Removed from Cloud

### 1. RtmpRelayService (`/cloud/packages/cloud/src/services/streaming/RtmpRelayService.ts`)

```typescript
import { Logger } from "pino";
import crypto from "crypto";

export interface RtmpRelayEndpoint {
  relayId: string;
  rtmpUrl: string;
  hlsBaseUrl?: string;
  hostname: string;
  port: number;
}

export class RtmpRelayService {
  private logger: Logger;
  private relays: RtmpRelayEndpoint[] = [];

  constructor(logger: Logger) {
    this.logger = logger.child({ service: "RtmpRelayService" });
    this.initializeRelays();
  }

  private initializeRelays() {
    // Use environment variable or default to US Central relay
    const relayUrls = process.env.RTMP_RELAY_URLS?.split(",") || [
      "rtmp-relay-uscentral.mentra.glass:1935",
    ];

    const hlsUrls = process.env.RTMP_RELAY_HLS_URLS?.split(",") || [];

    this.relays = relayUrls.map((url, index) => {
      const [hostname, port] = url.split(":");
      const hlsBaseUrl = hlsUrls[index] || `http://${hostname}:8888`;

      return {
        relayId: `relay-${index}`,
        hostname,
        port: parseInt(port) || 1935,
        rtmpUrl: `rtmp://${hostname}:${port}`,
        hlsBaseUrl,
      };
    });
  }

  getRelayForUser(userId: string): RtmpRelayEndpoint {
    if (this.relays.length === 0) {
      throw new Error("No relay endpoints configured");
    }

    if (this.relays.length === 1) {
      return this.relays[0];
    }

    // Consistent hashing for multiple relays
    const hash = crypto.createHash("md5").update(userId).digest();
    const index = hash.readUInt32BE(0) % this.relays.length;
    return this.relays[index];
  }

  buildRelayUrl(userId: string, streamId: string): string {
    const relay = this.getRelayForUser(userId);
    const sanitizedUserId = userId.replace("@", "-");
    const url = `${relay.rtmpUrl}/live/${sanitizedUserId}/${streamId}`;

    this.logger.debug(
      {
        userId,
        sanitizedUserId,
        streamId,
        relay: relay.relayId,
        url,
      },
      "Built relay URL for stream",
    );

    return url;
  }

  getRelays(): RtmpRelayEndpoint[] {
    return [...this.relays];
  }
}
```

### 2. RTMP Relay Routes (`/cloud/packages/cloud/src/routes/rtmp-relay.routes.ts`)

This file handled:

- `/api/rtmp-relay/cf-url/:userId/:streamId` - Relay lookup of Cloudflare URLs
- `/api/rtmp-relay/hls-ready` - Notification when HLS was ready
- `/api/rtmp-relay/health` - Health check endpoint

### 3. ManagedStreamingExtension Changes

#### Removed Imports

```typescript
import { RtmpRelayService } from "./RtmpRelayService";
```

#### Removed Class Members

```typescript
private rtmpRelayService: RtmpRelayService;
```

#### Removed from Constructor

```typescript
this.rtmpRelayService = new RtmpRelayService(logger);
```

#### Changed in `startManagedStream()` (around line 132-200)

**What was changed TO (relay version):**

```typescript
// Generate stream ID (no Cloudflare)
const streamId = crypto.randomBytes(8).toString("hex");

// Create placeholder live input data (no Cloudflare)
const liveInput: LiveInputResult = {
  liveInputId: streamId,
  rtmpUrl: "", // Will use relay URL
  hlsUrl: "", // Will be set by relay
  dashUrl: "", // Will be set by relay
  webrtcUrl: undefined,
};

// Send to relay instead of Cloudflare
const relayUrl = this.rtmpRelayService.buildRelayUrl(
  userId,
  managedStream.streamId,
);

const startMessage: StartRtmpStream = {
  type: CloudToGlassesMessageType.START_RTMP_STREAM,
  sessionId: userSession.sessionId,
  rtmpUrl: relayUrl, // RELAY URL instead of Cloudflare
  // ...
};

// No polling needed - relay will notify us when HLS is ready
// this.startPlaybackUrlPolling() was removed
```

**What it should be changed BACK TO (Cloudflare version):**

```typescript
// Create new Cloudflare live input
let liveInput;
try {
  liveInput = await this.cloudflareService.createLiveInput(userId, {
    quality,
    enableWebRTC,
    enableRecording: false,
    requireSignedURLs: false,
  });

  this.logger.info(
    {
      userId,
      packageName,
      liveInput: JSON.stringify(liveInput, null, 2),
    },
    "✅ Cloudflare live input created successfully",
  );
} catch (cfError) {
  this.logger.error(
    { userId, packageName, error: cfError },
    "❌ Failed to create Cloudflare live input",
  );
  throw cfError;
}

const startMessage: StartRtmpStream = {
  type: CloudToGlassesMessageType.START_RTMP_STREAM,
  sessionId: userSession.sessionId,
  rtmpUrl: liveInput.rtmpUrl, // Cloudflare ingest URL
  // ...
};

// Start polling for playback URLs
this.startPlaybackUrlPolling(userId, packageName, managedStream);
```

#### Removed Methods

```typescript
getStreamByStreamId(streamId: string) { /* used by relay to lookup streams */ }
getRelayForUser(userId: string) { /* exposed relay service */ }
updateStreamUrls(streamId: string, hlsUrl: string, dashUrl?: string): boolean { /* updated when relay notified */ }
```

### 4. Main App Changes (`/cloud/packages/cloud/src/index.ts`)

**Removed:**

```typescript
import rtmpRelayRoutes from "./routes/rtmp-relay.routes";
app.use("/api/rtmp-relay", rtmpRelayRoutes);
```

## How the Relay Worked

### MediaMTX Configuration (`mediamtx.yml`)

- Accepted streams at: `rtmp://relay-host:1935/live/{userId}/{streamId}`
- Triggered `stream-manager.sh` when stream started
- No built-in HLS (handled by FFmpeg)

### Stream Manager Script (`stream-manager.sh`)

The script:

1. Extracted userId and streamId from the path
2. Used FFmpeg to clean the stream:
   - Forced 30fps output (duplicated frames from 9-15fps input)
   - Set consistent 2-second GOP (60 frames at 30fps)
   - H.264 baseline profile for compatibility
   - Generated HLS with 2-second segments
3. Notified cloud at `/api/rtmp-relay/hls-ready` with HLS URLs
4. Monitored FFmpeg process lifetime

### FFmpeg Settings Used

```bash
ffmpeg -fflags +genpts+igndts \
  -use_wallclock_as_timestamps 1 \
  -analyzeduration 3M \
  -i "rtmp://localhost:1935/$MTX_PATH" \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -profile:v baseline -level 3.1 \
  -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
  -b:v 2M -maxrate 2.5M -bufsize 4M \
  -pix_fmt yuv420p \
  -c:a aac -ar 48000 -ac 2 -b:a 128k \
  -f hls \
  -hls_time 2 \
  -hls_list_size 5 \
  -hls_flags delete_segments \
  "$HLS_DIR/index.m3u8"
```

## How to Restore the Relay

If you need to bring back the relay implementation:

1. **Copy back RtmpRelayService.ts** from this document to `/cloud/packages/cloud/src/services/streaming/`

2. **Add relay routes** - Create `/cloud/packages/cloud/src/routes/rtmp-relay.routes.ts` (see PR #698 for full implementation)

3. **Modify ManagedStreamingExtension**:
   - Add `RtmpRelayService` import and initialization
   - Replace Cloudflare live input creation with relay URL generation
   - Remove polling, add `updateStreamUrls()` method for relay notifications

4. **Register routes** in main app:

   ```typescript
   import rtmpRelayRoutes from "./routes/rtmp-relay.routes";
   app.use("/api/rtmp-relay", rtmpRelayRoutes);
   ```

5. **Deploy relay infrastructure**:
   - Use existing Docker setup in this folder
   - Deploy to Porter with `porter.yaml`
   - Set `RTMP_RELAY_URLS` environment variable in cloud

## Environment Variables

When relay is active, cloud needs:

- `RTMP_RELAY_URLS`: Comma-separated list of relay endpoints (e.g., `rtmp-relay-uscentral.mentra.glass:1935`)
- `RTMP_RELAY_HLS_URLS`: Comma-separated list of HLS base URLs

## Why We're Removing It

- Fixed the "dirty RTMP" issue in Android glasses firmware
- Cloudflare now accepts our streams directly
- Relay adds complexity and latency
- Cloudflare provides better features (recording, outputs, global CDN)

## Benefits of Keeping Relay Infrastructure

- Fallback option if Cloudflare has issues
- Could be used for on-premise deployments
- Enables custom stream processing (filters, overlays, etc.)
- Provides full control over HLS generation

## Notes

- The relay was working perfectly but added 2-5 seconds of latency
- FFmpeg transcoding used significant CPU (5-10% per stream)
- HLS files were stored locally (not on CDN)
- No DASH support was implemented (HLS only)
