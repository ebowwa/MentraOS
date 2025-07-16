# Managed RTMP Streaming - Relay Architecture

This document outlines the relay-centric architecture for MentraOS managed streaming, designed to handle low-quality streams from smart glasses and provide clean HLS output for apps.

## Current Architecture

```
SDK → Cloud → Glasses → Relay → HLS → Apps
```

- **SDK** requests managed stream
- **Cloud** assigns relay and returns relay URL
- **Glasses** stream low-quality RTMP to relay
- **Relay** cleans stream with FFmpeg and generates HLS
- **Apps** consume the HLS streams directly from relay

## Implementation Details

### Relay Components

1. **MediaMTX** - RTMP server that receives streams from glasses
2. **FFmpeg** - Cleans dirty streams (fixes timestamps, forces consistent framerate)
3. **Nginx** - Serves HLS files on port 8888
4. **Container** - All components run in a single Docker container

### Stream Processing Flow

1. Glasses connect to `rtmp://relay:1935/live/{userId}/{streamId}`
2. MediaMTX triggers `stream-manager.sh` script
3. FFmpeg cleans the stream:
   - Fixes timestamp issues (`-fflags +genpts+igndts`)
   - Forces 30fps output (duplicates frames as needed)
   - Re-encodes to H.264 baseline profile
   - Generates HLS segments directly
4. Nginx serves HLS at `http://relay:8888/hls/{userId}/{streamId}/index.m3u8`
5. Cloud is notified of HLS availability

### Current Implementation

```bash
# stream-manager.sh - Core processing logic
ffmpeg -fflags +genpts+igndts \
  -use_wallclock_as_timestamps 1 \
  -analyzeduration 3M \
  -loglevel error \
  -i "rtmp://localhost:1935/$MTX_PATH" \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -profile:v baseline -level 3.1 \
  -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
  -b:v 2M -maxrate 2.5M -bufsize 4M \
  -pix_fmt yuv420p \
  -c:a aac -ar 48000 -ac 2 -b:a 128k \
  -reset_timestamps 1 \
  -f hls \
  -hls_time 2 \
  -hls_list_size 5 \
  -hls_flags delete_segments \
  -hls_segment_filename "$HLS_DIR/segment_%03d.ts" \
  "$HLS_DIR/index.m3u8"
```

## Cloud Endpoints

```
POST /api/rtmp-relay/hls-ready
{
  "userId": "user@example.com",
  "streamId": "abc123",
  "hlsUrl": "http://localhost:8888/hls/user/stream/index.m3u8",
  "dashUrl": ""  // Not implemented
}
```

## Scaling Architecture

### Current Limitations
- Each stream requires ~50-100% of one CPU core
- FFmpeg transcoding is CPU intensive
- Memory usage ~100-200MB per stream
- Single server can handle ~10-20 concurrent streams

### Horizontal Scaling Strategy

1. **Multiple Relay Instances**
   - Deploy multiple relay containers
   - Each handles subset of streams
   - RtmpRelayService uses consistent hashing for assignment

2. **Ephemeral Design**
   - No shared storage required
   - HLS segments are temporary (not recorded)
   - When relay dies, streams reconnect to new relay
   - Truly stateless architecture

3. **Auto-scaling with Porter.run**
   ```yaml
   # Scaling rules
   - CPU > 70%: Add relay instance
   - CPU < 30%: Remove relay instance
   - Each relay: ~10-20 streams capacity
   ```

4. **Service Discovery**
   - New relays register with cloud on startup
   - Cloud tracks available relays and their load
   - Users directed to least loaded relay

### Scaling Flow

```
1. User requests stream → Cloud checks relay capacity
2. If current relays full → Porter spins up new relay
3. New relay registers → Cloud adds to available pool
4. User gets assigned → Connects directly to relay
5. If relay dies → Stream ends, user reconnects to new relay
```

### Key Design Decisions

1. **Why FFmpeg Re-encoding?**
   - Smart glasses send "dirty" streams with broken timestamps
   - Low/variable framerates (9-15fps) incompatible with HLS
   - Must normalize to standard format for reliable playback

2. **Why No Shared Storage?**
   - HLS segments are temporary (live streaming only)
   - Simplifies architecture - each relay is independent
   - Enables true horizontal scaling without coordination

3. **Why Direct HLS from FFmpeg?**
   - MediaMTX's HLS generation fails with low FPS streams
   - FFmpeg handles timestamp fixing and HLS generation together
   - More reliable for poor quality input streams

### Future Optimizations

1. **GPU Acceleration**
   - Use NVIDIA GPUs for transcoding
   - 1 GPU can handle 20-50 streams
   - Much more cost-effective at scale

2. **Reduce Transcoding**
   - Only fix what's broken (timestamps)
   - Use `-c:v copy` when possible
   - Adaptive quality based on input

3. **Edge Distribution**
   - Deploy relays geographically
   - Route users to nearest relay
   - Reduce latency and bandwidth costs

4. **Re-streaming Support** (Future)
   - Add capability to forward to YouTube/Twitch
   - Modify stream-manager.sh to output multiple destinations
   - Track restream status and report to cloud

## Benefits

- **Handles poor quality streams** from smart glasses
- **No external dependencies** (no Cloudflare)
- **Horizontally scalable** with Porter.run
- **Simple architecture** - stateless relays
- **Low latency** - direct HLS serving
- **Full control** over stream processing

## Deployment

```bash
# Build relay container
cd rtmp_relay
docker build -t rtmp-relay .

# Deploy to Porter
porter app create rtmp-relay
porter app deploy

# Configure environment
CLOUD_API_URL=https://api.mentra.glass

# Scale as needed
porter app scale --instances 5
```