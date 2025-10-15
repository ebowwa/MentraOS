# Static Audio Fix - Endianness Issue

## Issue: Apps Receiving Static/Garbled Audio

### Symptoms

- Apps receive audio data via `StreamType.AUDIO_CHUNK`
- Audio is completely static/garbled/unusable
- No clear audio at all, just noise

### Root Cause

**Endianness mismatch!**

The audio coming from LiveKit DataChannel may be in **big-endian** format, but apps expect **little-endian** PCM16.

### Why This Happened

When we migrated from WebSocket to gRPC:

**Old WebSocket Client (`LiveKitClient.ts`):**

- ✅ Had endianness detection and byte swapping
- ✅ Used `LIVEKIT_PCM_ENDIAN` environment variable
- ✅ Auto-detected and swapped bytes if needed

**New gRPC Client (`LiveKitGrpcClient.ts`):**

- ❌ Did NOT have endianness handling (initially)
- ❌ Passed through raw bytes from proto
- ❌ Apps received big-endian when expecting little-endian

**Result:** Every 16-bit sample had its bytes backwards → complete garbage audio.

---

## The Fix

Added the same endianness detection and byte swapping logic to the gRPC client.

### Code Changes

**File:** `cloud/packages/cloud/src/services/session/livekit/LiveKitGrpcClient.ts`

```typescript
// Added endianness handling fields
private readonly endianMode: "auto" | "swap" | "off";
private endianSwapDetermined = false;
private shouldSwapBytes = false;

// In constructor
const mode = (process.env.LIVEKIT_PCM_ENDIAN || "auto").toLowerCase();
this.endianMode = mode as "auto" | "swap" | "off";

// In audio stream handler
let pcmData = Buffer.from(chunk.pcm_data);

// Handle endianness if needed
if (this.endianMode !== "off" && pcmData.length >= 2) {
  pcmData = this.handleEndianness(pcmData, receivedChunks);
}

// Forward to AudioManager
this.userSession.audioManager.processAudioData(pcmData);
```

### How It Works

#### 1. Auto-Detection (Default)

On the first audio frame, analyzes byte patterns:

```typescript
// Count sign-extension patterns
for (let i = 0; i < 16 samples; i++) {
  const b0 = buf[2 * i];     // LSB if LE, MSB if BE
  const b1 = buf[2 * i + 1]; // MSB if LE, LSB if BE

  if (b0 === 0x00 || b0 === 0xff) evenAreMostlyFFor00++;
  if (b1 === 0x00 || b1 === 0xff) oddAreMostlyFFor00++;
}

// If upper byte has more sign-extension → probably big-endian
if (oddAreMostlyFFor00 >= evenAreMostlyFFor00 + 6) {
  this.shouldSwapBytes = true;
}
```

**Logic:** In PCM16, the sign bit (MSB) often extends across the whole byte (0x00 or 0xFF). If the second byte of each pair has this pattern more than the first byte, it's likely big-endian.

#### 2. Byte Swapping

If swap is needed:

```typescript
const swapped = Buffer.allocUnsafe(buf.length);
for (let i = 0; i + 1 < buf.length; i += 2) {
  swapped[i] = buf[i + 1]; // Swap bytes
  swapped[i + 1] = buf[i];
}
```

**Example:**

```
Big-endian input:    [0x12, 0x34, 0x56, 0x78]
Little-endian output: [0x34, 0x12, 0x78, 0x56]
```

---

## Environment Variable

Control endianness behavior with `LIVEKIT_PCM_ENDIAN`:

```bash
# Auto-detect (recommended, default)
LIVEKIT_PCM_ENDIAN=auto

# Force byte swapping
LIVEKIT_PCM_ENDIAN=swap

# No swapping (assume already little-endian)
LIVEKIT_PCM_ENDIAN=off
```

---

## Testing

### Test 1: Verify Detection

Start system and look for this log:

```bash
docker logs cloud | grep "PCM endianness detection"
```

**Expected output:**

```json
{
  "feature": "livekit-grpc",
  "oddFF00": 14,
  "evenFF00": 2,
  "willSwap": true
}
```

- `oddFF00 > evenFF00` → Will swap (big-endian input)
- `evenFF00 > oddFF00` → Won't swap (little-endian input)

### Test 2: Check Sample Values

```bash
docker logs cloud | grep "Received audio chunks from gRPC bridge"
```

**Expected output:**

```json
{
  "headBytes": [54, 255, 12, 0, 89, 255, ...],
  "headSamples": [-202, 12, -167, -45, 134, -98, 67, -123]
}
```

**Good signs:**

- `headSamples` range: -32768 to +32767 (valid PCM16)
- Values are distributed (not all 0 or all max)
- Positive and negative values mixed

**Bad signs (still wrong endianness):**

- All values near 0 or near ±32768
- Patterns like [256, 512, 1024, ...] (powers of 256)

### Test 3: Listen to Audio in App

In your MentraOS SDK app:

```typescript
let chunks = 0;
session.subscribe(StreamType.AUDIO_CHUNK, (data: Uint8Array) => {
  chunks++;

  // Check sample values
  const i16 = new Int16Array(data.buffer);
  const samples = Array.from(i16.slice(0, 8));

  console.log("Audio chunk", chunks, "samples:", samples);

  // Play in browser (if testing in web app)
  // playPCM16(data, 16000, 1);
});
```

**Good:** Clear voice, no static
**Bad:** Static/garbled → endianness still wrong

---

## Debugging Static Audio

### Step 1: Check Logs

```bash
# Did endianness detection run?
docker logs cloud | grep "endianness detection"

# What did it decide?
# willSwap: true  → Swapping bytes
# willSwap: false → Not swapping
```

### Step 2: Force Swap Mode

If auto-detection got it wrong:

```bash
# In .env
LIVEKIT_PCM_ENDIAN=swap

# Restart
docker-compose restart cloud
```

### Step 3: Check Sample Values

```bash
docker logs cloud | grep "headSamples"
```

**Valid PCM16 range:** -32768 to +32767

**If you see values like:**

- `[256, 512, 1024, 2048, ...]` → Still big-endian, force swap
- `[-32768, -32768, -32768, ...]` → All silence (different issue)
- `[-202, 12, -167, -45, ...]` → Looks good!

### Step 4: Visual Check

In your app, log raw bytes:

```typescript
session.subscribe(StreamType.AUDIO_CHUNK, (data: Uint8Array) => {
  const bytes = Array.from(data.slice(0, 20));
  console.log("Raw bytes:", bytes);

  const i16 = new Int16Array(data.buffer);
  const samples = Array.from(i16.slice(0, 10));
  console.log("As Int16:", samples);
});
```

**Compare:**

- Raw bytes: `[0x12, 0x34, 0x56, 0x78, ...]`
- As Int16 LE: `[0x3412, 0x7856, ...]` → 13330, 30806
- As Int16 BE: `[0x1234, 0x5678, ...]` → 4660, 22136

If Int16 values look wrong, endianness is off.

---

## Common Issues

### Issue 1: Still Static After Fix

**Possible causes:**

1. **Endianness detection wrong:**
   - Force swap: `LIVEKIT_PCM_ENDIAN=swap`

2. **Audio format not PCM16:**
   - Check mobile client sends PCM16, not compressed

3. **Sample rate mismatch:**
   - Verify both sides use 16kHz

4. **Channel count mismatch:**
   - Verify both sides use mono (1 channel)

### Issue 2: Detection Says "willSwap: false" but Audio is Static

Auto-detection failed. Force swap:

```bash
LIVEKIT_PCM_ENDIAN=swap
```

### Issue 3: Audio Works in Transcription but Not Apps

Different issue! Check:

- Apps are subscribed: `session.subscribe(StreamType.AUDIO_CHUNK, ...)`
- Apps WebSocket is connected
- AudioManager is relaying: Look for "AUDIO_CHUNK: relaying to apps" in logs

---

## Technical Details

### Why LiveKit DataChannel Might Be Big-Endian

LiveKit uses WebRTC DataChannel, which has no mandated byte order for raw data. The mobile client (Android/iOS) may send in native byte order:

- **Android (ARM):** Usually little-endian
- **iOS (ARM):** Usually little-endian
- **But:** If mobile client uses certain audio APIs, might get big-endian

The Go bridge receives raw bytes and passes them through unchanged. TypeScript must handle endianness.

### PCM16 Format

- **16-bit signed integer** per sample
- **Range:** -32768 to +32767
- **Two bytes per sample**

**Little-endian (LE):**

```
Sample: -202 (0xFFF6 in hex)
Bytes: [0xF6, 0xFF]  (LSB first)
```

**Big-endian (BE):**

```
Sample: -202 (0xFFF6 in hex)
Bytes: [0xFF, 0xF6]  (MSB first)
```

If you read BE bytes as LE (or vice versa):

```
BE bytes [0xFF, 0xF6] read as LE = 0xF6FF = -2305 (wrong!)
```

This causes the static/garbled audio.

---

## Summary

**Problem:** Apps received static audio because of endianness mismatch

**Cause:** gRPC client didn't have byte swapping (old WebSocket client did)

**Fix:** Added endianness detection and byte swapping to gRPC client

**Configuration:**

- Default: Auto-detect (recommended)
- Force swap: `LIVEKIT_PCM_ENDIAN=swap`
- No swap: `LIVEKIT_PCM_ENDIAN=off`

**Verification:**

- Check logs for "endianness detection result"
- Verify `headSamples` in range -32768 to +32767
- Test audio in app (should be clear, not static)

**Next Steps:**

1. Rebuild: `docker-compose build cloud`
2. Restart: `docker-compose restart cloud`
3. Test: Connect app and check audio
4. Verify: Look for "willSwap: true/false" in logs
