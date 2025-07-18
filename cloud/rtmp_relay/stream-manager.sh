#!/bin/sh
# Stream manager for MentraOS RTMP Relay
# Cleans stream with FFmpeg and notifies cloud when HLS is ready

# Extract user and stream from path
USER_SANITIZED=$(echo $MTX_PATH | cut -d/ -f2)
STREAM_ID=$(echo $MTX_PATH | cut -d/ -f3)
USER_ID=${USER_SANITIZED/-/@}

echo "Stream manager starting for user: $USER_ID, stream: $STREAM_ID"

# Wait for input stream to stabilize
echo "Waiting for stream to stabilize..."
sleep 2

# Create a cleaned path for the output
CLEAN_PATH="clean/$USER_SANITIZED/$STREAM_ID"

echo "Starting FFmpeg to clean stream..."
echo "Input: rtmp://localhost:1935/$MTX_PATH"
echo "Output: rtmp://localhost:1935/$CLEAN_PATH"

# Create directory for HLS files
HLS_DIR="/hls/$USER_SANITIZED/$STREAM_ID"
mkdir -p "$HLS_DIR"

# Use FFmpeg to clean AND generate HLS directly:
# - Force 30fps output (duplicating frames from low FPS input)
# - Set GOP to 2 seconds (60 frames at 30fps)
# - Use baseline profile for compatibility
# - Generate HLS with 2 second segments
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
  "$HLS_DIR/index.m3u8" &

FFMPEG_PID=$!
echo "FFmpeg started with PID: $FFMPEG_PID"

# Wait for cleaned stream to be available and HLS to be generated
echo "Waiting for HLS generation from cleaned stream..."
sleep 5

# Build HLS URLs from the FFmpeg output
# We'll serve these files via nginx or similar
HLS_URL="http://localhost:8888/hls/$USER_SANITIZED/$STREAM_ID/index.m3u8"
DASH_URL=""  # Not generating DASH with this approach

echo "HLS URL: $HLS_URL"
echo "DASH URL: $DASH_URL"

# Notify cloud that HLS is ready
echo "Notifying cloud of HLS availability..."
RESPONSE=$(wget -qO- -X POST "$CLOUD_API_URL/api/rtmp-relay/hls-ready" \
  --header="Content-Type: application/json" \
  --post-data="{\"userId\":\"$USER_ID\",\"streamId\":\"$STREAM_ID\",\"hlsUrl\":\"$HLS_URL\",\"dashUrl\":\"$DASH_URL\"}" 2>&1)

echo "Cloud notification response: $RESPONSE"

# Monitor FFmpeg process
echo "Stream manager running. Monitoring FFmpeg process..."
while true; do
  if ! kill -0 $FFMPEG_PID 2>/dev/null; then
    echo "FFmpeg process died! Stream ended for $USER_ID"
    exit 0
  fi
  sleep 10
done