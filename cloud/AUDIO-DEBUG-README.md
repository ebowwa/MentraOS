# Audio Debug - Fix Static Audio Issue

## Quick Start

Audio capture is already enabled. Just follow these steps:

### Step 1: Capture Audio

1. Connect your mobile device to MentraOS
2. Enable the microphone
3. Talk for at least 5 seconds
4. Audio will be **automatically captured** and analyzed

### Step 2: Extract Files

Run this command:

```bash
cd cloud
./get-audio-debug.sh
```

This will:

- Find the captured audio
- Copy all files to `./audio-debug-output/`
- Show you the analysis report
- Tell you which files to listen to

### Step 3: Listen to Audio

The script creates two WAV files:

- `*-le.wav` - Little-endian (standard format)
- `*-be.wav` - Big-endian (byte-swapped)

Listen to both:

```bash
# macOS
afplay audio-debug-output/*-le.wav
afplay audio-debug-output/*-be.wav

# Linux
aplay audio-debug-output/*-le.wav
aplay audio-debug-output/*-be.wav
```

### Step 4: Apply Fix

**If the LE (little-endian) file sounds clear:**

```bash
# Add to cloud/.env
echo "LIVEKIT_PCM_ENDIAN=off" >> .env

# Restart
docker-compose -f docker-compose.dev.yml restart
```

**If the BE (big-endian) file sounds clear:**

```bash
# Add to cloud/.env
echo "LIVEKIT_PCM_ENDIAN=swap" >> .env

# Restart
docker-compose -f docker-compose.dev.yml restart
```

**If BOTH sound like static:**

- Not an endianness issue
- Check mobile is sending PCM16 format (not compressed)
- Verify 16kHz mono audio
- Check for data corruption

## That's It!

The system will automatically:

1. ✅ Capture first 5 seconds of audio
2. ✅ Analyze the data
3. ✅ Convert to WAV (both endianness)
4. ✅ Generate detailed report
5. ✅ Save everything to `/tmp/` in container

You just need to:

1. Run `./get-audio-debug.sh`
2. Listen to the WAV files
3. Set the correct `LIVEKIT_PCM_ENDIAN` value

## Files Created

In `audio-debug-output/`:

- `livekit-audio-*.raw` - Raw PCM16 data
- `livekit-audio-*.txt` - Analysis report
- `livekit-audio-*-le.wav` - Little-endian WAV
- `livekit-audio-*-be.wav` - Big-endian WAV

## Troubleshooting

**No audio captured?**

```bash
# Check logs
docker logs $(docker ps --filter "name=cloud" --format "{{.Names}}" | head -1) | grep -i capture

# Verify DEBUG_CAPTURE_AUDIO is set
docker exec $(docker ps --filter "name=cloud" --format "{{.Names}}" | head -1) printenv | grep DEBUG
```

**Script fails?**

```bash
# Make it executable
chmod +x get-audio-debug.sh

# Run with bash explicitly
bash get-audio-debug.sh
```

**WAV files not created?**

- Container may not have ffmpeg installed
- Check the `.txt` analysis file instead
- Manually convert: `ffmpeg -f s16le -ar 16000 -ac 1 -i audio.raw output.wav`

## What the Analysis Tells You

Check the `.txt` file for:

**Healthy Audio:**

```
Average absolute: 3000-10000
Zeros: <5%
Maxed out: <1%
```

**Wrong Endianness:**

```
Average absolute: <500 (TOO LOW)
Zeros: <10%
→ Likely needs byte swapping
```

**Silence:**

```
Average absolute: 0
Zeros: >90%
→ No audio being sent
```

## Summary

1. Mobile sends audio → Cloud captures automatically
2. Run `./get-audio-debug.sh` → Files extracted
3. Listen to both WAV files → One should be clear
4. Set `LIVEKIT_PCM_ENDIAN` → Restart cloud
5. Done! Audio should be clear now

The whole process takes ~2 minutes.
