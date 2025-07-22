# RTMP Relay Architecture

This document describes the complete RTMP relay system for MentraOS managed streaming.

## Overview

The relay system handles low-quality, unstable streams from smart glasses and converts them to clean HLS streams for app consumption.

```
Glasses → RTMP Relay → Clean HLS → Apps
```

## Components

### 1. Docker Container (`rtmp_relay/`)

- **MediaMTX**: RTMP server (port 1935)
- **FFmpeg**: Stream cleaning and HLS generation
- **Nginx**: HLS file serving (port 8888)

### 2. Stream Processing (`stream-manager.sh`)

```bash
# Core FFmpeg command that fixes dirty streams
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

### 3. Cloud Integration

- `/api/rtmp-relay/hls-ready` - Relay notifies when HLS is available
- `RtmpRelayService` - Assigns users to relays
- `ManagedStreamingExtension` - Manages stream lifecycle

## Production Scaling with Porter.run

### 1. Porter Configuration

```yaml
# porter.yaml
services:
  rtmp-relay:
    autoscaling:
      min_instances: 2
      max_instances: 20
      target_cpu_percent: 70
      target_memory_percent: 80

    ports:
      - port: 1935
        protocol: TCP # TCP load balancing for RTMP
      - port: 8888
        protocol: HTTP # HTTP for HLS
      - port: 9997
        protocol: HTTP # MediaMTX API

    health_check:
      http_path: /health
      interval_seconds: 10
      timeout_seconds: 5

    env:
      CLOUD_API_URL: ${CLOUD_API_URL}
      RELAY_PUBLIC_URL: ${PORTER_SERVICE_URL}
```

### 2. Service Discovery

Add to `start.sh`:

```bash
#!/bin/sh
# Start nginx
nginx

# Register with cloud
RELAY_ID="${HOSTNAME:-$(hostname)}"
PUBLIC_URL="${PORTER_SERVICE_URL:-localhost}"

curl -X POST "$CLOUD_API_URL/api/relay/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"relayId\": \"$RELAY_ID\",
    \"rtmpUrl\": \"rtmp://$PUBLIC_URL:1935\",
    \"hlsUrl\": \"http://$PUBLIC_URL:8888\",
    \"maxStreams\": 20
  }"

# Add health endpoint
cat > /etc/nginx/http.d/health.conf << EOF
server {
    listen 80;
    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF
nginx -s reload

# Start MediaMTX
exec /mediamtx
```

### 3. Dynamic Relay Assignment

Cloud endpoints for service discovery:

```typescript
// Store active relays in Redis
app.post("/api/relay/register", async (req, res) => {
  const { relayId, rtmpUrl, hlsUrl, maxStreams } = req.body;

  await redis.setex(
    `relay:${relayId}`,
    300, // 5 minute TTL
    JSON.stringify({
      rtmpUrl,
      hlsUrl,
      maxStreams,
      currentStreams: 0,
      lastSeen: Date.now(),
    }),
  );

  res.json({ success: true });
});

// Track stream counts
app.post("/api/relay/stream-started", async (req, res) => {
  const { relayId, userId, streamId } = req.body;
  const relay = await redis.get(`relay:${relayId}`);

  if (relay) {
    const data = JSON.parse(relay);
    data.currentStreams++;
    await redis.setex(`relay:${relayId}`, 300, JSON.stringify(data));
  }

  res.json({ success: true });
});
```

Update `RtmpRelayService`:

```typescript
async getRelayForUser(userId: string): Promise<RtmpRelayEndpoint> {
  const keys = await redis.keys('relay:*');
  const relays = [];

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const relay = JSON.parse(data);
      if (Date.now() - relay.lastSeen < 60000) {
        relays.push({
          relayId: key.replace('relay:', ''),
          ...relay
        });
      }
    }
  }

  // Find least loaded relay with capacity
  const available = relays
    .filter(r => r.currentStreams < r.maxStreams)
    .sort((a, b) => a.currentStreams - b.currentStreams);

  if (available.length === 0) {
    throw new Error('No available relays');
  }

  return available[0];
}
```

## Local Development with ngrok

### Setup

1. **RTMP Tunnel** (TCP):

   ```bash
   ngrok tcp 1935
   # Note the URL: tcp://5.tcp.ngrok.io:26780
   ```

2. **Environment Variables**:

   ```bash
   export RTMP_RELAY_URLS="5.tcp.ngrok.io:26780"
   export RTMP_RELAY_HLS_URLS="http://localhost:8888"
   ```

3. **Run Relay**:

   ```bash
   cd rtmp_relay
   ./rebuild.sh
   ```

4. **Test Stream**:

   ```bash
   # Stream to relay
   ffmpeg -re -i test.mp4 -f flv rtmp://5.tcp.ngrok.io:26780/live/test@user.com/stream123

   # Play HLS
   ffplay http://localhost:8888/hls/test-user.com/stream123/index.m3u8
   ```

### Troubleshooting

- **"Low-Latency HLS requires at least 7 segments"**: MediaMTX can't handle low FPS directly, that's why we use FFmpeg
- **Timestamp errors**: The glasses send broken timestamps, FFmpeg fixes them
- **Frozen frames**: Usually means FFmpeg died, check Docker logs

## Capacity Planning

### Per-Stream Resources

- **CPU**: ~50-100% of one core
- **Memory**: ~100-200MB
- **Bandwidth**: 2Mbps output + overhead
- **Disk I/O**: Constant segment writes

### Server Sizing

- **Small** (4 cores, 8GB RAM): ~5-8 streams
- **Medium** (8 cores, 16GB RAM): ~10-15 streams
- **Large** (16 cores, 32GB RAM): ~20-30 streams
- **GPU** (1x T4): ~50-100 streams

### Scaling Strategy

1. Start with 2 medium instances
2. Auto-scale based on 70% CPU
3. Add GPU instances for high load
4. Consider geographic distribution

## Future Enhancements

### 1. GPU Acceleration

Replace CPU encoding with GPU:

```bash
ffmpeg -hwaccel cuda -i input \
  -c:v h264_nvenc -preset p4 -tune ll \
  -b:v 2M -maxrate 2.5M -bufsize 4M \
  ...
```

### 2. Adaptive Bitrate

Generate multiple qualities:

```bash
# 480p @ 1Mbps
-map 0:v -c:v:0 libx264 -b:v:0 1M -s:v:0 854x480 \
# 720p @ 2Mbps
-map 0:v -c:v:1 libx264 -b:v:1 2M -s:v:1 1280x720 \
```

### 3. Re-streaming

Add to stream-manager.sh:

```bash
# Get destinations from cloud
DESTINATIONS=$(curl -s "$CLOUD_API_URL/api/relay/destinations/$USER_ID/$STREAM_ID")

# Add outputs to FFmpeg
for dest in $DESTINATIONS; do
  FFMPEG_CMD="$FFMPEG_CMD -f flv $dest"
done
```

### 4. Edge Caching

Use CDN for HLS distribution:

- CloudFront/Fastly in front of relay HLS
- Cache segments at edge
- Reduce relay bandwidth

## Monitoring

Key metrics to track:

- **Stream count** per relay
- **CPU/Memory** usage
- **FFmpeg crashes**
- **HLS request latency**
- **Segment generation time**

Add Prometheus metrics:

```go
// In MediaMTX config
metrics: yes
metricsAddress: :9998
```

Porter.run provides:

- CPU/Memory graphs
- Instance count
- Request latency
- Error rates
