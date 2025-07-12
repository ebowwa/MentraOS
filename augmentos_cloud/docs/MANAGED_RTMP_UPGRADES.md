# Managed RTMP Streaming Upgrades

This document outlines two approaches for adding RTMP re-streaming capabilities to the MentraOS managed streaming system.

## Current Architecture

```
SDK → Cloud → Glasses → Relay → Cloudflare → Apps
```

- **SDK** requests managed stream
- **Cloud** creates Cloudflare Live Input and returns relay URL
- **Glasses** stream to RTMP relay
- **Relay** cleans stream and forwards to Cloudflare
- **Cloudflare** provides HLS/DASH URLs
- **Apps** consume the HLS/DASH streams

## Option A: Long-term Solution (Relay-centric)

### Architecture
```
SDK → Cloud → Glasses → Relay → Apps/Re-streams
                           ↓
                     HLS URLs → Cloud
```

### Implementation Details

1. **MediaMTX as Primary Streaming Server**
   - Relay receives RTMP from glasses
   - MediaMTX automatically generates HLS at `http://relay:8888/live/{userId}/{streamId}/index.m3u8`
   - Relay notifies cloud of available HLS URL
   - Relay handles all re-streaming to external RTMP endpoints

2. **New Cloud Endpoints Required**
   ```
   POST /api/rtmp-relay/hls-ready
   {
     "userId": "user@example.com",
     "streamId": "abc123",
     "hlsUrl": "http://relay-server:8888/live/user-example-com/abc123/index.m3u8",
     "dashUrl": "http://relay-server:8888/live/user-example-com/abc123/index.mpd"
   }
   
   GET /api/rtmp-relay/restream-destinations/{userId}/{streamId}
   Response: {
     "destinations": [
       { "url": "rtmp://youtube.com/live/KEY", "name": "YouTube" },
       { "url": "rtmp://twitch.tv/app/KEY", "name": "Twitch" }
     ]
   }
   
   POST /api/rtmp-relay/stream-status
   {
     "userId": "user@example.com",
     "streamId": "abc123",
     "status": "active|error|stopped",
     "viewers": 42,
     "bitrate": 2100000
   }
   ```

3. **Modified Relay Script**
   ```bash
   # Get restream destinations from cloud
   DESTINATIONS=$(curl -s "$CLOUD_API_URL/api/rtmp-relay/restream-destinations/$USER_ID/$STREAM_ID")
   
   # Build FFmpeg command with multiple outputs
   ffmpeg -i rtmp://localhost:1935/$MTX_PATH \
     [encoding options] \
     -f flv $DESTINATION_1 \
     -f flv $DESTINATION_2 \
     ...
   
   # Notify cloud of HLS availability
   curl -X POST "$CLOUD_API_URL/api/rtmp-relay/hls-ready" \
     -d "{\"userId\":\"$USER_ID\",\"streamId\":\"$STREAM_ID\",\"hlsUrl\":\"$HLS_URL\"}"
   ```

4. **Benefits**
   - Complete control over streaming infrastructure
   - Lower latency (no Cloudflare processing)
   - No external dependencies
   - Can add WebRTC for ultra-low latency
   - Direct bandwidth control and optimization

5. **Drawbacks**
   - Must handle bandwidth for all viewers
   - Need CDN for global distribution
   - More complex scaling requirements
   - No built-in recording (must implement)

## Option B: Short-term Solution (Cloudflare Outputs)

### Architecture
```
SDK → Cloud → Glasses → Relay → Cloudflare → Apps
                                      ↓
                                 Re-streams → YouTube/Twitch/etc
```

### Implementation Details

1. **SDK Changes**
   ```typescript
   // Add to ManagedStreamRequest interface
   export interface ManagedStreamRequest {
     // ... existing fields ...
     restreamDestinations?: {
       url: string;      // rtmp://youtube.com/live/KEY
       name?: string;    // "YouTube"
     }[];
   }
   ```

2. **Cloud Changes**
   - When creating Cloudflare Live Input, also create Outputs
   - Store output configurations with stream state
   - Return output status in ManagedStreamStatus

3. **Cloudflare API Integration**
   ```typescript
   // In CloudflareStreamService
   async createLiveInputWithOutputs(userId: string, outputs: RestreamDestination[]) {
     // 1. Create Live Input
     const liveInput = await this.createLiveInput(userId);
     
     // 2. Create Outputs for each destination
     for (const output of outputs) {
       await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${liveInput.uid}/outputs`, {
         method: 'POST',
         headers: this.headers,
         body: JSON.stringify({
           url: output.url,
           streamKey: this.extractStreamKey(output.url),
           enabled: true
         })
       });
     }
     
     return liveInput;
   }
   ```

4. **Benefits**
   - Cloudflare handles all transcoding/distribution
   - No additional CPU/bandwidth costs
   - Built-in global CDN
   - Automatic recording
   - Simple implementation

5. **Drawbacks**
   - Dependent on Cloudflare
   - Less control over encoding
   - Additional latency
   - Cloudflare API rate limits

## Migration Path

1. **Phase 1**: Implement Option B (Cloudflare Outputs)
   - Quick to implement
   - Immediate value for users
   - Learn usage patterns

2. **Phase 2**: Build Option A infrastructure
   - Deploy relay servers globally
   - Implement CDN/caching strategy
   - Add monitoring and analytics

3. **Phase 3**: Gradual migration
   - Offer both options to users
   - A/B test performance
   - Migrate based on user needs

## Decision Matrix

| Feature | Option A (Relay) | Option B (Cloudflare) |
|---------|------------------|----------------------|
| Implementation Time | 2-4 weeks | 3-5 days |
| Latency | Lower | Higher |
| Bandwidth Costs | Higher | Lower |
| Control | Full | Limited |
| Scalability | Complex | Simple |
| Recording | Must build | Built-in |
| Global Distribution | Must build | Built-in |
| Multi-platform Streaming | Yes | Yes |

## Recommendation

**Short term**: Implement Option B to quickly deliver value to users while learning usage patterns.

**Long term**: Build Option A infrastructure for users who need lower latency and more control, while keeping Option B for users who prefer simplicity.