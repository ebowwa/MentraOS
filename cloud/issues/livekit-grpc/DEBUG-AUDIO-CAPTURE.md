# Debug Audio Capture - Analyzing Static Audio Issues

## Quick Start

Enable audio capture to save the first 5 seconds of audio to a file for analysis:

```bash
# Add to .env
DEBUG_CAPTURE_AUDIO=true

# Restart cloud
docker-compose restart cloud

# Start a session (connect mobile, enable mic)
# Audio will be captured automatically

# Check logs for file location
docker logs cloud | grep "Audio capture saved"

# Copy file from container
docker cp cloud:/tmp/livekit-audio-user@example.com-1234567890.raw ./
docker cp cloud:/tmp/livekit-audio-user@example.com-1234567890.txt ./
```

---

## What Gets Captured

### Files Created

1. **`.raw` file** - Raw PCM16 audio data (before endianness handling)
2. **`.txt` file** - Detailed analysis report

**Location:** `/tmp/livekit-audio-<userId>-<timestamp>.raw`

### Capture Details

- **Duration:** First 5 seconds only
- **Format:** Raw PCM16 (no header)
- **Sample Rate:** 16kHz
- **Channels:** 1 (mono)
- **Byte Order:** As received from bridge (before swap)

---

## Analysis Report

The `.txt` file contains:

### 1. Statistics

```
Samples: 80000
Duration: ~5.00 seconds @ 16kHz
Min value: -15234
Max value: 14567
Average absolute: 3452
Zeros: 1234 (1.54%)
Maxed out (>30000): 45 (0.06%)
```

### 2. Sample Data

```
First 100 samples (as little-endian):
-202, 12, -167, -45, 134, -98, 67, -123, ...

First 64 bytes (hex):
36 ff 0c 00 59 ff d3 ff 86 00 9e ff 43 00 85 ff ...
```

### 3. Quality Analysis

```
Audio looks HEALTHY - good amplitude range, no obvious issues

OR

POTENTIAL ISSUES DETECTED:
- LOW AMPLITUDE BUT NOT SILENCE - Possible endianness issue (try swapping)
```

### 4. Playback Commands

```bash
# If little-endian (standard)
ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw audio.wav

# If big-endian
ffmpeg -f s16be -ar 16000 -ac 1 -i audio.raw audio-be.wav
```

---

## Interpreting Results

### Healthy Audio

**Characteristics:**

- Min/Max: ±5,000 to ±20,000 range
- Average absolute: 1,000 to 10,000
- Zeros: <5%
- Maxed out: <1%

**Example:**

```
Min value: -15234
Max value: 14567
Average absolute: 3452
Zeros: 123 (0.15%)
```

**Action:** Audio is good, issue is elsewhere (not endianness)

---

### Wrong Endianness

**Characteristics:**

- Very low amplitude (<500)
- But not silence (zeros <10%)
- Max values rarely reached

**Example:**

```
Min value: -456
Max value: 389
Average absolute: 178
Zeros: 234 (0.29%)
```

**What's happening:** Bytes are swapped, so `[0x12, 0x34]` reads as `0x3412` instead of `0x1234`.

**Action:** Force byte swapping

```bash
LIVEKIT_PCM_ENDIAN=swap
```

---

### Silence

**Characteristics:**

- All or mostly zeros (>50%)
- Min and max near 0

**Example:**

```
Min value: 0
Max value: 0
Average absolute: 0
Zeros: 79900 (99.88%)
```

**What's happening:** No audio is being sent from mobile, or audio path is broken before reaching cloud.

**Action:** Check mobile client is sending audio via DataChannel

---

### Clipping

**Characteristics:**

- Many values at max (>10% maxed out)
- Max near ±32768

**Example:**

```
Min value: -32768
Max value: 32767
Average absolute: 25000
Maxed out: 8500 (10.63%)
```

**What's happening:** Audio is too loud, hitting limits.

**Action:** Reduce volume at source (mobile) or apply gain control

---

### Random Noise (Static)

**Characteristics:**

- Wide range but random distribution
- High amplitude but no pattern
- Sounds like static when played

**Example:**

```
Min value: -28543
Max value: 31245
Average absolute: 15000
```

**What's happening:**

1. Wrong format (not PCM16)
2. Corrupted data
3. Wrong endianness with additional issues

**Action:**

1. Try byte swapping first
2. Verify mobile sends PCM16
3. Check for data corruption in transit

---

## Converting to WAV for Listening

### Method 1: Try Little-Endian First

```bash
ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw audio-le.wav

# Listen to audio-le.wav
# If it sounds clear → was little-endian (correct)
# If it sounds garbled → try big-endian
```

### Method 2: Try Big-Endian

```bash
ffmpeg -f s16be -ar 16000 -ac 1 -i audio.raw audio-be.wav

# Listen to audio-be.wav
# If it sounds clear → was big-endian (needs swap)
# If it sounds garbled → was little-endian
```

### Method 3: Try Both and Compare

```bash
# Convert both ways
ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw audio-le.wav
ffmpeg -f s16be -ar 16000 -ac 1 -i audio.raw audio-be.wav

# Play both
# Whichever sounds clear is the correct endianness
```

---

## Log Output

### During Capture

```
INFO: Audio capture ENABLED - will save first 5 seconds to file
  path: /tmp/livekit-audio-user@example.com-1234567890.raw

INFO: Started audio capture (5 seconds)

INFO: First audio chunk received - raw bytes
  length: 320
  firstBytes: [54, 255, 12, 0, 89, 255, ...]

INFO: First chunk - interpreted both ways
  asLittleEndian: [-202, 12, -167, -45, 134, ...]
  asBigEndian: [-2305, 3084, -1689, -11521, ...]

INFO: Saving captured audio to file
  chunks: 500
  totalBytes: 160000
  path: /tmp/livekit-audio-user@example.com-1234567890.raw

INFO: Audio capture complete - statistics
  samples: 80000
  min: -15234
  max: 14567
  avgAbsolute: 3452
  zerosPercent: 1.54
  maxedOutPercent: 0.06

INFO: Audio capture saved - check files for analysis
  rawFile: /tmp/livekit-audio-user@example.com-1234567890.raw
  analysisFile: /tmp/livekit-audio-user@example.com-1234567890.txt
```

### Key Info to Look For

**First chunk comparison:**

```json
{
  "asLittleEndian": [-202, 12, -167, -45, 134, -98],
  "asBigEndian": [-2305, 3084, -1689, -11521, -25086, -25217]
}
```

- If `asLittleEndian` looks reasonable (-10000 to +10000) → correct
- If `asBigEndian` looks reasonable → needs swapping

---

## Common Scenarios

### Scenario 1: Audio is Static

**Steps:**

1. Enable capture: `DEBUG_CAPTURE_AUDIO=true`
2. Get audio: `docker cp cloud:/tmp/livekit-audio-*.raw ./`
3. Convert both ways:
   ```bash
   ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw le.wav
   ffmpeg -f s16be -ar 16000 -ac 1 -i audio.raw be.wav
   ```
4. Listen to both
5. If BE sounds good → Force swap: `LIVEKIT_PCM_ENDIAN=swap`
6. If LE sounds good → Turn off swap: `LIVEKIT_PCM_ENDIAN=off`
7. If both sound bad → Different issue (check format)

---

### Scenario 2: Apps Get Audio but Transcription Works

**This suggests:**

- Transcription service handles endianness
- Apps receive raw bytes (wrong endianness)

**Steps:**

1. Check if transcription is swapping bytes internally
2. Verify apps expect little-endian PCM16
3. Force swap in cloud: `LIVEKIT_PCM_ENDIAN=swap`

---

### Scenario 3: Audio Looks Good in Stats but Sounds Bad

**Possible causes:**

1. **Wrong sample rate:** Audio at 8kHz played as 16kHz (sounds fast)
2. **Wrong channels:** Stereo as mono or vice versa
3. **Bit depth:** PCM8 as PCM16 (half volume, weird artifacts)

**Check:**

- Verify mobile sends 16kHz mono PCM16
- Check logs for sample rate in proto messages
- Try different sample rates in ffmpeg:
  ```bash
  ffmpeg -f s16le -ar 8000 -ac 1 -i audio.raw test-8k.wav
  ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw test-16k.wav
  ffmpeg -f s16le -ar 32000 -ac 1 -i audio.raw test-32k.wav
  ```

---

## Automation Script

Save as `analyze-audio.sh`:

```bash
#!/bin/bash
# Usage: ./analyze-audio.sh

# Find latest capture file
CONTAINER="cloud"
RAW_FILE=$(docker exec $CONTAINER ls -t /tmp/livekit-audio-*.raw 2>/dev/null | head -1)

if [ -z "$RAW_FILE" ]; then
  echo "No audio capture found. Is DEBUG_CAPTURE_AUDIO=true?"
  exit 1
fi

echo "Found: $RAW_FILE"

# Copy files
docker cp $CONTAINER:$RAW_FILE ./audio.raw
docker cp $CONTAINER:${RAW_FILE/.raw/.txt} ./audio.txt

echo "Files copied to current directory"

# Convert to WAV both ways
ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw audio-le.wav -y 2>/dev/null
ffmpeg -f s16be -ar 16000 -ac 1 -i audio.raw audio-be.wav -y 2>/dev/null

echo ""
echo "Created:"
echo "  audio.raw - Raw PCM data"
echo "  audio.txt - Analysis report"
echo "  audio-le.wav - As little-endian"
echo "  audio-be.wav - As big-endian"
echo ""
echo "Listen to both WAV files to determine correct endianness"

# Show analysis
cat audio.txt
```

---

## Cleanup

```bash
# Disable capture
# Remove from .env or set to false
DEBUG_CAPTURE_AUDIO=false

# Remove captured files
docker exec cloud rm /tmp/livekit-audio-*.raw
docker exec cloud rm /tmp/livekit-audio-*.txt
```

---

## Summary

1. **Enable:** `DEBUG_CAPTURE_AUDIO=true`
2. **Capture:** First 5 seconds saved automatically
3. **Extract:** `docker cp cloud:/tmp/livekit-audio-*.raw ./`
4. **Analyze:** Check `.txt` file for statistics
5. **Listen:** Convert to WAV and play
6. **Fix:** Set `LIVEKIT_PCM_ENDIAN` based on results

**Goal:** Determine if audio needs byte swapping to fix static issue.
