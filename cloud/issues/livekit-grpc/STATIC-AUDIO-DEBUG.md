# Static Audio Debug - Quick Guide

## Problem

Apps are receiving static/garbled audio instead of clear voice.

## Solution: Capture & Analyze Audio

### Step 1: Enable Audio Capture

Add to your `.env` file:

```bash
DEBUG_CAPTURE_AUDIO=true
```

Restart cloud:

```bash
docker-compose restart cloud
```

### Step 2: Generate Capture

1. Connect mobile app
2. Enable microphone
3. Wait 5 seconds (auto-captures)

Watch logs:

```bash
docker logs -f cloud | grep "Audio capture"
```

You'll see:

```
INFO: Audio capture ENABLED - will save first 5 seconds to file
INFO: Started audio capture (5 seconds)
INFO: Audio capture saved - check files for analysis
  rawFile: /tmp/livekit-audio-user@example.com-1234567890.raw
  analysisFile: /tmp/livekit-audio-user@example.com-1234567890.txt
```

### Step 3: Extract Files

```bash
# Get the raw audio
docker cp cloud:/tmp/livekit-audio-*.raw ./audio.raw

# Get the analysis
docker cp cloud:/tmp/livekit-audio-*.txt ./audio.txt
```

### Step 4: Check Analysis

```bash
cat audio.txt
```

Look for:

```
POTENTIAL ISSUES DETECTED:
- LOW AMPLITUDE BUT NOT SILENCE - Possible endianness issue (try swapping)
```

### Step 5: Listen to Audio

Convert to WAV and listen:

```bash
# Try as little-endian (standard)
ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw audio-le.wav

# Try as big-endian
ffmpeg -f s16be -ar 16000 -ac 1 -i audio.raw audio-be.wav

# Play both and see which sounds clear
```

### Step 6: Fix Endianness

If **big-endian** (audio-be.wav) sounds clear:

```bash
# Add to .env
LIVEKIT_PCM_ENDIAN=swap

# Restart
docker-compose restart cloud
```

If **little-endian** (audio-le.wav) sounds clear:

```bash
# Add to .env
LIVEKIT_PCM_ENDIAN=off

# Restart
docker-compose restart cloud
```

If **both sound bad**:

- Check mobile is sending PCM16 (not compressed)
- Verify sample rate is 16kHz
- Check for data corruption

## Quick Checks

### Check Stats (from audio.txt)

**Good audio:**

```
Average absolute: 3452
Zeros: 1.54%
Maxed out: 0.06%
```

**Wrong endianness:**

```
Average absolute: 178 (TOO LOW)
Zeros: 0.29%
Maxed out: 0.00%
```

**Silence:**

```
Average absolute: 0
Zeros: 99.88% (TOO HIGH)
```

### Check First Chunk

Look in logs for:

```json
{
  "asLittleEndian": [-202, 12, -167, -45, 134],
  "asBigEndian": [-2305, 3084, -1689, -11521]
}
```

- If LE values are in ±10,000 range → probably correct
- If BE values are in ±10,000 range → needs swapping

## One-Liner Script

```bash
#!/bin/bash
# analyze-audio-quick.sh

# Find and copy latest capture
FILE=$(docker exec cloud ls -t /tmp/livekit-audio-*.raw 2>/dev/null | head -1)
docker cp cloud:$FILE ./audio.raw
docker cp cloud:${FILE/.raw/.txt} ./audio.txt

# Convert both ways
ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw le.wav -y 2>/dev/null
ffmpeg -f s16be -ar 16000 -ac 1 -i audio.raw be.wav -y 2>/dev/null

echo "Files created:"
echo "  le.wav - as little-endian"
echo "  be.wav - as big-endian"
echo ""
echo "Listen to both and see which is clear"
echo ""
cat audio.txt
```

Usage:

```bash
chmod +x analyze-audio-quick.sh
./analyze-audio-quick.sh
```

## Expected Result

After setting correct endianness:

- Apps receive clear audio
- No more static
- Transcription continues to work

## Cleanup

Disable capture when done:

```bash
# Remove from .env or set:
DEBUG_CAPTURE_AUDIO=false

# Restart
docker-compose restart cloud
```

## Troubleshooting

**No capture file found?**

- Check `DEBUG_CAPTURE_AUDIO=true` is in .env
- Verify cloud container restarted
- Check logs: `docker logs cloud | grep capture`

**Both WAV files sound bad?**

- Not an endianness issue
- Check mobile sends PCM16, not compressed
- Verify sample rate (try 8000 or 32000)
- Check for data corruption

**Capture stops immediately?**

- Check disk space: `docker exec cloud df -h /tmp`
- Check permissions: `docker exec cloud ls -la /tmp`

## Summary

1. **Enable:** `DEBUG_CAPTURE_AUDIO=true` in `.env`
2. **Capture:** Connect mobile + mic for 5 seconds
3. **Extract:** `docker cp cloud:/tmp/livekit-audio-*.raw ./`
4. **Convert:** `ffmpeg -f s16le/s16be -ar 16000 -ac 1 -i audio.raw out.wav`
5. **Listen:** Play both LE and BE versions
6. **Fix:** Set `LIVEKIT_PCM_ENDIAN=swap` or `off` based on which sounds clear

The capture happens automatically, saves to `/tmp`, includes detailed analysis, and helps you determine the correct endianness setting.
