# Channel Full Issue - Root Cause and Fix

## Issue Description

After implementing the gRPC bridge, we observed massive frame dropping with logs like:

```
livekit-bridge-1  | 2025/10/14 23:59:46 Dropping audio frame for user@example.com (channel full)
livekit-bridge-1  | 2025/10/14 23:59:46 Dropping audio frame for user@example.com (channel full)
livekit-bridge-1  | 2025/10/14 23:59:46 Dropping audio frame for user@example.com (channel full)
```

Additionally, apps using the MentraOS SDK were not receiving audio at all.

---

## Root Cause Analysis

### The Problem

The gRPC bridge has two goroutines per session:

1. **Receive Goroutine**: Receives audio FROM LiveKit → puts in channel
2. **Send Goroutine**: Reads from channel → sends TO TypeScript via gRPC

The flow is:

```
LiveKit → OnDataPacket → channel → stream.Send() → TypeScript → AudioManager → Apps
```

### Why Frames Were Dropped

1. **Bursty Audio Delivery**: LiveKit sends audio in bursts (network buffering)
   - Example: 10 frames arrive in 5ms, then 200ms gap
   - This is normal network behavior

2. **gRPC Send is Synchronous and Blocking**:
   - `stream.Send()` blocks until TypeScript reads from the stream
   - If TypeScript is slow, the send goroutine stalls

3. **Channel Fills Up While Blocked**:
   - While send is blocked, LiveKit keeps calling OnDataPacket
   - Audio frames are pushed to channel
   - Channel was only 10 frames deep (100ms of audio)
   - Channel fills in milliseconds during burst

4. **Frames Dropped**:
   - When channel is full, new frames are dropped
   - Non-blocking send in OnDataPacket uses `select default` to drop

### Why Apps Didn't Receive Audio

Separate issue from dropping - need to verify:

1. Apps are properly subscribed to `StreamType.AUDIO_CHUNK`
2. App WebSocket connection is established
3. AudioManager is relaying to apps (not just transcription)

---

## Fixes Applied

### Fix 1: Increased Channel Buffer (session.go)

**Before:**

```go
audioFromLiveKit: make(chan []byte, 10)  // Only 100ms buffer
```

**After:**

```go
audioFromLiveKit: make(chan []byte, 200)  // ~2 seconds buffer
```

**Impact:**

- Can handle much larger bursts without dropping
- 200 frames @ 100fps = 2 seconds of buffering
- Enough to absorb network jitter and bursty delivery

**Trade-off:**

- Increased latency (up to 2s in worst case)
- But this is better than dropping frames entirely
- Can be tuned down later if latency is an issue

### Fix 2: Added Send Timeout (service.go)

**Problem:** If TypeScript completely stops reading, send goroutine blocks forever.

**Solution:** Added 2-second timeout to send operation:

```go
sendDone := make(chan error, 1)
go func() {
    sendDone <- stream.Send(&pb.AudioChunk{...})
}()

select {
case err := <-sendDone:
    // Send succeeded
case <-time.After(2 * time.Second):
    // TypeScript is stuck, abort
    return fmt.Errorf("send timeout")
case <-session.ctx.Done():
    // Session closed
    return
}
```

**Impact:**

- Prevents goroutine leaks if TypeScript hangs
- Provides clear error when client is stuck
- Allows session to clean up properly

### Fix 3: Added Comprehensive Debug Logging

**Go Bridge (service.go):**

```go
// Log every 100 packets
if receivedPackets%100 == 0 {
    log.Printf("Audio flowing for %s: received=%d, dropped=%d, channelLen=%d",
        userId, receivedPackets, droppedPackets, len(session.audioFromLiveKit))
}

// Log drops periodically (not every drop)
if droppedPackets%50 == 0 {
    log.Printf("Dropping audio frames for %s: total_dropped=%d",
        userId, droppedPackets)
}

// Log sends periodically
if sentPackets%100 == 0 {
    log.Printf("Sent %d audio chunks to TypeScript for user %s (channelLen=%d)",
        sentPackets, userId, len(session.audioFromLiveKit))
}
```

**TypeScript Client (LiveKitGrpcClient.ts):**

```typescript
let receivedChunks = 0;
this.audioStream?.on("data", (chunk: any) => {
  receivedChunks++;
  if (receivedChunks % 100 === 0) {
    this.logger.debug(
      {
        receivedChunks,
        chunkSize: pcmData.length,
      },
      "Received audio chunks from gRPC bridge",
    );
  }
  // ...
});
```

**Impact:**

- Can now observe audio flow through entire pipeline
- Easy to spot where audio stops flowing
- Minimal performance impact (logs every 100 frames = once per second)

---

## Verification Steps

### 1. Check Bridge is Receiving from LiveKit

```bash
docker logs -f livekit-bridge | grep "Audio flowing"

# Expected every second:
# Audio flowing for user@example.com: received=100, dropped=0, channelLen=5
```

**Good Signs:**

- `received` counter increasing
- `dropped` stays at 0 or very low (<1%)
- `channelLen` stays low (<50 frames)

**Bad Signs:**

- `dropped` increasing rapidly
- `channelLen` always at 200 (channel always full)

### 2. Check TypeScript is Receiving from Bridge

```bash
docker logs -f cloud | grep "Received audio chunks from gRPC bridge"

# Expected every second:
# Received audio chunks from gRPC bridge | receivedChunks: 100
```

**Good Signs:**

- Counter increases every second
- No timeout errors

**Bad Signs:**

- No logs (TypeScript not reading)
- "send timeout" errors in bridge logs

### 3. Check AudioManager is Processing

```bash
docker logs -f cloud | grep "AudioManager received PCM chunk"

# Expected every second:
# AudioManager received PCM chunk | frames: 100, bytes: 320
```

**Good Signs:**

- Regular logs every second
- Frame counter increasing

**Bad Signs:**

- No logs
- Long gaps between logs

### 4. Check Apps are Receiving

```bash
docker logs -f cloud | grep "AUDIO_CHUNK"

# Expected:
# AUDIO_CHUNK: relaying to apps | subscribers: ["com.example.app"]
# AUDIO_CHUNK: sending to app | packageName: com.example.app
```

**Good Signs:**

- Shows subscribed apps
- "sending to app" logs appear

**Bad Signs:**

- "no subscribed apps" (app not subscribed)
- No relay logs (AudioManager not calling relay)

---

## If Still Seeing Drops

### Scenario 1: Small Amount of Drops (<1%)

**Acceptable** - Network jitter is normal

- If `dropped=5` and `received=10000` → 0.05% drop rate is fine
- Most transcription services handle this

### Scenario 2: Constant Drops (>10%)

**Problem** - TypeScript can't keep up

- Check CPU usage of cloud container
- Profile AudioManager.processAudioData()
- Check transcription service performance
- Consider making audio processing async

### Scenario 3: Channel Always Full

**Problem** - TypeScript completely blocked or disconnected

- Check for "send timeout" errors
- Verify gRPC connection is healthy
- Check TypeScript event loop isn't blocked
- Look for heavy synchronous processing in audio handlers

---

## Performance Tuning

### If Latency is Too High

Reduce channel buffer:

```go
// Lower latency, less burst tolerance
audioFromLiveKit: make(chan []byte, 50)  // ~500ms buffer
```

**Trade-off:** More frame drops during bursts

### If Still Dropping Frames

Increase channel buffer further:

```go
// Higher latency, more burst tolerance
audioFromLiveKit: make(chan []byte, 500)  // ~5 seconds buffer
```

**Trade-off:** Higher latency, more memory usage

### If TypeScript is Slow

Make audio processing async:

```typescript
this.audioStream?.on("data", (chunk: any) => {
  const pcmData = Buffer.from(chunk.pcm_data);

  // Don't block gRPC event loop
  setImmediate(() => {
    this.userSession.audioManager.processAudioData(pcmData);
  });
});
```

---

## App Audio Reception Fix

If apps still not receiving audio after fixes:

### Check 1: App Subscription

```typescript
// In your MentraOS SDK app
session.subscribe(StreamType.AUDIO_CHUNK, (data: Uint8Array) => {
  console.log("Received audio:", data.length, "bytes");
});
```

### Check 2: Subscription Manager

Verify `SubscriptionManager.getSubscribedApps()` returns your app:

```typescript
// In AudioManager
const subscribers = this.userSession.subscriptionManager.getSubscribedApps(
  StreamType.AUDIO_CHUNK,
);
console.log("Audio subscribers:", subscribers);
// Should include your app's package name
```

### Check 3: WebSocket Connection

```typescript
// Check app WebSocket exists and is open
const ws = this.userSession.appWebsockets.get(packageName);
console.log("App WS state:", ws?.readyState); // Should be 1 (OPEN)
```

---

## Summary

**Problem:** Channel buffer too small + gRPC send blocking = massive frame drops

**Solution:**

1. ✅ Increased channel buffer from 10 to 200 frames
2. ✅ Added 2s timeout to prevent goroutine leaks
3. ✅ Added comprehensive debug logging
4. 🔄 Verify apps are properly subscribed to audio

**Expected Result:**

- Drop rate <1%
- Audio flows smoothly to TypeScript
- Apps receive audio if subscribed
- No goroutine leaks

**Next Steps:**

1. Deploy updated code
2. Monitor logs for "Audio flowing" messages
3. Verify drop rate is <1%
4. Check apps are receiving audio
5. Tune buffer size if needed for latency
