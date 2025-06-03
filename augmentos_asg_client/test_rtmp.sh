#!/bin/bash

# Mentra Live Stream Viewer with Auto-Reconnect

STREAM_URL="rtmp://0.0.0.0:1935/s/streamKey"

echo "🎥 Starting Mentra Live viewer..."
echo "🔁 Auto-reconnect enabled. Press Ctrl+C to stop."

while true; do
  ffplay -hide_banner -loglevel warning \
    -fflags nobuffer \
    -flags low_delay \
    -framedrop \
    -strict experimental \
    -infbuf \
    -listen 1 \
    -i "$STREAM_URL"

  echo "⚠️ Stream disconnected. Reconnecting in 1 second..."
  sleep 1
done

