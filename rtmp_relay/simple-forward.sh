#!/bin/sh
# Forward stream through FFmpeg to clean it for Cloudflare

# Extract user and stream from path
USER_SANITIZED=$(echo $MTX_PATH | cut -d/ -f2)
STREAM_ID=$(echo $MTX_PATH | cut -d/ -f3)
USER_ID=${USER_SANITIZED/-/@}

echo "Stream relay starting for user: $USER_ID, stream: $STREAM_ID"

# First, reset the Cloudflare stream to ensure fresh ingest worker
echo "Resetting Cloudflare stream to ensure clean connection..."
RESET_RESPONSE=$(wget -qO- -X POST "$CLOUD_API_URL/api/rtmp-relay/cf-reset/$USER_ID/$STREAM_ID" 2>&1)
echo "Reset response: $RESET_RESPONSE"

# Check if reset was successful
if echo "$RESET_RESPONSE" | grep -q '"url"'; then
  echo "Cloudflare stream reset successful"
  CF_URL=$(echo "$RESET_RESPONSE" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
  CF_LIVE_INPUT_ID=$(echo "$RESET_RESPONSE" | sed -n 's/.*"cfLiveInputId":"\([^"]*\)".*/\1/p')
else
  echo "Reset failed or not available, falling back to regular URL request"
  echo "Reset error: $RESET_RESPONSE"
  # Fallback to regular URL request
  CF_RESPONSE=$(wget -qO- "$CLOUD_API_URL/api/rtmp-relay/cf-url/$USER_ID/$STREAM_ID" 2>&1)
  CF_URL=$(echo "$CF_RESPONSE" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
  CF_LIVE_INPUT_ID=$(echo "$CF_RESPONSE" | sed -n 's/.*"cfLiveInputId":"\([^"]*\)".*/\1/p')
fi

echo "Got CF Live Input ID: $CF_LIVE_INPUT_ID"
echo "Got CF URL: $CF_URL"

# Wait for stream to stabilize and Cloudflare to be ready
echo "Waiting for stream to stabilize..."
sleep 5

# If we got a URL, forward the stream with cleaning
if [ ! -z "$CF_URL" ]; then
  # Clean the stream for Cloudflare:
  # - Force 30fps output (duplicating frames from low FPS input)
  # - Set GOP to 2 seconds (60 frames at 30fps)
  # - Use baseline profile for compatibility
  # - Force keyframes every 2 seconds
  # Start FFmpeg with options to handle initial stream issues
  # -fflags +genpts: Generate missing timestamps
  # -use_wallclock_as_timestamps 1: Use wall clock for timestamps
  # -analyzeduration 3M: Analyze stream for 3 seconds before starting
  ffmpeg -fflags +genpts+igndts \
    -use_wallclock_as_timestamps 1 \
    -analyzeduration 3M \
    -re -i "rtmp://localhost:1935/$MTX_PATH" \
    -c:v libx264 -preset veryfast -tune zerolatency \
    -profile:v baseline -level 3.1 \
    -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
    -force_key_frames "expr:gte(t,n_forced*2)" \
    -b:v 2M -maxrate 2.5M -bufsize 4M \
    -pix_fmt yuv420p \
    -c:a aac -ar 48000 -ac 2 -b:a 128k \
    -reset_timestamps 1 \
    -f flv "$CF_URL"
 
fi