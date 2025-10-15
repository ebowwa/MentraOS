#!/bin/bash
# Simple script to extract captured audio from cloud container

echo "=========================================="
echo "Audio Debug - File Extractor"
echo "=========================================="
echo ""

# Find container
CONTAINER=$(docker ps --filter "name=cloud" --format "{{.Names}}" | head -1)

if [ -z "$CONTAINER" ]; then
    echo "ERROR: Cloud container not found"
    echo "Is docker-compose running?"
    exit 1
fi

echo "Using container: $CONTAINER"
echo ""

# Find latest audio capture
echo "Looking for captured audio files..."
RAW_FILE=$(docker exec "$CONTAINER" ls -t /tmp/livekit-audio-*.raw 2>/dev/null | head -1)

if [ -z "$RAW_FILE" ]; then
    echo ""
    echo "ERROR: No audio capture found!"
    echo ""
    echo "Make sure:"
    echo "  1. DEBUG_CAPTURE_AUDIO=true in docker-compose.dev.yml"
    echo "  2. Cloud container restarted"
    echo "  3. Mobile connected + microphone enabled for 5+ seconds"
    echo ""
    echo "Check logs: docker logs $CONTAINER | grep -i capture"
    exit 1
fi

echo "Found: $RAW_FILE"
echo ""

# Create output directory
OUTPUT_DIR="./audio-debug-output"
mkdir -p "$OUTPUT_DIR"

# Extract all related files
echo "Copying files..."
docker cp "$CONTAINER:$RAW_FILE" "$OUTPUT_DIR/"
docker cp "$CONTAINER:${RAW_FILE/.raw/.txt}" "$OUTPUT_DIR/" 2>/dev/null
docker cp "$CONTAINER:${RAW_FILE/.raw/-le.wav}" "$OUTPUT_DIR/" 2>/dev/null
docker cp "$CONTAINER:${RAW_FILE/.raw/-be.wav}" "$OUTPUT_DIR/" 2>/dev/null

echo ""
echo "=========================================="
echo "Files extracted to: $OUTPUT_DIR/"
echo "=========================================="
ls -lh "$OUTPUT_DIR/"
echo ""

# Show analysis if available
TXT_FILE="$OUTPUT_DIR/$(basename ${RAW_FILE/.raw/.txt})"
if [ -f "$TXT_FILE" ]; then
    echo "=========================================="
    echo "ANALYSIS REPORT"
    echo "=========================================="
    cat "$TXT_FILE"
    echo ""
fi

# Check for WAV files
LE_WAV="$OUTPUT_DIR/$(basename ${RAW_FILE/.raw/-le.wav})"
BE_WAV="$OUTPUT_DIR/$(basename ${RAW_FILE/.raw/-be.wav})"

if [ -f "$LE_WAV" ] && [ -f "$BE_WAV" ]; then
    echo "=========================================="
    echo "NEXT STEP: Listen to the audio!"
    echo "=========================================="
    echo ""
    echo "Play the files to hear which one is clear:"
    echo ""
    echo "  # macOS:"
    echo "  afplay $LE_WAV"
    echo "  afplay $BE_WAV"
    echo ""
    echo "  # Linux:"
    echo "  aplay $LE_WAV"
    echo "  aplay $BE_WAV"
    echo ""
    echo "  # Or open both in your audio player"
    echo ""
    echo "Then apply the fix based on which sounds clear!"
    echo ""
else
    echo "Note: WAV files not created (ffmpeg may not be available in container)"
    echo "You can still manually convert the .raw file"
fi
