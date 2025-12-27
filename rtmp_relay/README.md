# RTMP Relay for MentraOS

This relay accepts RTMP streams from Android smart glasses and cleans them before forwarding to Cloudflare Live.

## Architecture

```
[Glasses] --RTMP--> [MediaMTX Relay] --Clean RTMP--> [Cloudflare Live]
```

## Components

- **MediaMTX**: Lightweight RTMP server that accepts incoming streams
- **FFmpeg**: Transcodes streams to ensure Cloudflare compatibility
- **API Integration**: Queries MentraOS Cloud API for Cloudflare URLs

## Configuration

The relay is configured via `mediamtx.yml`:
- Accepts streams at: `rtmp://relay-host:1935/live/{userId}/{streamId}`
- Automatically transcodes with FFmpeg when stream starts
- Forces consistent GOP, mono audio, and stable bitrates

## Deployment

### Local Testing
```bash
# Build and run locally
docker build -t rtmp-relay .
docker run -p 1935:1935 -p 9997:9997 \
  -e CLOUD_API_URL="https://api.mentra.glass" \
  rtmp-relay

# Test stream
ffmpeg -re -i test.mp4 -c copy -f flv rtmp://localhost:1935/live/testuser/teststream
```

### Production (Porter)
```bash
# Deploy to Porter
porter apply -f porter.yaml

# The relay will be available at:
# rtmp://rtmp-relay-uscentral.mentra.glass:1935/live/{userId}/{streamId}
```

## Monitoring

- Health check endpoint: `http://relay-host:9997/v3/config/get`
- Logs show all stream connections and FFmpeg output
- MediaMTX API provides stream statistics at `http://relay-host:9997/v3/paths/list`

## FFmpeg Settings

The relay uses these settings to ensure Cloudflare compatibility:
- **Video**: 
  - H.264 baseline profile, 2Mbps
  - **Forces 30fps output** (duplicates frames if input is lower)
  - Consistent 60-frame GOP (2 seconds at 30fps)
  - Handles any input framerate (9fps, 15fps, etc.)
- **Audio**: AAC mono, 44.1kHz, 128kbps
- **Container**: FLV format

### Frame Rate Handling

If your glasses stream at 15fps, FFmpeg will:
1. Accept the 15fps input
2. Duplicate frames to create 30fps output
3. Send clean 30fps stream to Cloudflare

This ensures Cloudflare always receives a consistent 30fps stream regardless of input framerate.

## Environment Variables

- `CLOUD_API_URL`: URL of MentraOS Cloud API (default: https://api.mentra.glass)

## Troubleshooting

1. **Stream not forwarding**: Check logs for curl errors fetching Cloudflare URL
2. **Cloudflare rejecting stream**: Check FFmpeg logs for encoding errors
3. **High CPU usage**: Normal during transcoding, consider scaling replicas

## Future Enhancements

- [ ] Add stream recording capability
- [ ] Implement fallback relay servers
- [ ] Add detailed metrics/monitoring
- [ ] Support for WebRTC ingestion