#!/bin/sh
# Forward stream through FFmpeg to clean it for Cloudflare

# Extract user and stream from path
USER_SANITIZED=$(echo $MTX_PATH | cut -d/ -f2)
STREAM_ID=$(echo $MTX_PATH | cut -d/ -f3)
USER_ID=${USER_SANITIZED/-/@}

# Get Cloudflare URL
CF_URL=$(wget -qO- "$CLOUD_API_URL/api/rtmp-relay/cf-url/$USER_ID/$STREAM_ID" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')

# If we got a URL, forward the stream with cleaning
if [ ! -z "$CF_URL" ]; then
  # Clean the stream for Cloudflare:
  # - Force 30fps output (duplicating frames from low FPS input)
  # - Set GOP to 2 seconds (60 frames at 30fps)
  # - Use baseline profile for compatibility
  # - Force keyframes every 2 seconds
  ffmpeg -re -i "rtmp://localhost:1935/$MTX_PATH" \
    -c:v libx264 -preset veryfast -tune zerolatency \
    -profile:v baseline -level 3.1 \
    -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
    -force_key_frames "expr:gte(t,n_forced*2)" \
    -b:v 2M -maxrate 2.5M -bufsize 4M \
    -pix_fmt yuv420p \
    -c:a aac -ar 48000 -ac 2 -b:a 128k \
    -f flv "$CF_URL"
 &
fi