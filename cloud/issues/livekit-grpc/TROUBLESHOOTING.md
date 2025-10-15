# LiveKit gRPC Bridge - Troubleshooting Guide

## Common Issues and Solutions

### 1. "Dropping audio frame (channel full)" Messages

**Symptoms:**

```
livekit-bridge-1  | 2025/10/14 23:59:46 Dropping audio frame for user@example.com (channel full)
livekit-bridge-1  | 2025/10/14 23:59:46 Dropping audio frame for user@example.com (channel full)
```

**Root Cause:**
The Go bridge is receiving audio from LiveKit faster than the gRPC stream can send it to TypeScript. The channel buffer fills up and frames are dropped.

**Why This Happens:**

1. **Bursty LiveKit delivery**: Audio arrives in bursts (e.g., 10 chunks in 5ms, then 200ms gap)
2. **gRPC Send blocking**: If TypeScript is slow to read, `stream.Send()` blocks
3. **Channel fills up**: While send is blocked, LiveKit keeps pushing to channel
4. **Frames dropped**: When channel is full, new frames are dropped

**Solutions:**

#### Quick Fix: Increase Channel Buffer

Already done in latest code - buffer increased from 10 to 200 frames.

```go
// session.go
audioFromLiveKit: make(chan []byte, 200), // Was 10, now 200
```

This gives ~2 seconds of buffering at 100fps.

#### Check TypeScript Is Reading

Add debug logs to verify TypeScript is receiving audio:

```typescript
// LiveKitGrpcClient.ts - already added in latest code
let receivedChunks = 0;
this.audioStream?.on("data", (chunk: any) => {
  receivedChunks++;
  if (receivedChunks % 100 === 0) {
    this.logger.debug({ receivedChunks }, "Received audio from bridge");
  }
  // ... process audio
});
```

**What to Look For:**

- If you see "Received audio from bridge" logs in TypeScript → Good, data is flowing
- If you DON'T see these logs → TypeScript not reading, investigate why

#### Check AudioManager Is Processing

Verify audio reaches AudioManager:

```bash
# Look for these logs in cloud container
docker logs cloud | grep "AudioManager received PCM chunk"
```

Should see logs every 100 frames if audio is flowing.

#### Check Apps Are Subscribed

If apps aren't receiving audio, check subscriptions:

```bash
# In cloud logs, look for:
"AUDIO_CHUNK: no subscribed apps"  # Bad - no apps listening
"AUDIO_CHUNK: relaying to apps"   # Good - apps subscribed
```

**To subscribe an app to audio:**

```typescript
// In your MentraOS SDK app
session.subscribe(StreamType.AUDIO_CHUNK, (data) => {
  console.log("Received audio chunk:", data.length);
});
```

---

### 2. Apps Not Receiving Audio

**Symptoms:**

- Bridge logs show audio flowing
- TypeScript logs show audio received
- Apps don't get audio data

**Checklist:**

1. **Is app subscribed?**

   ```typescript
   session.subscribe(StreamType.AUDIO_CHUNK, handler);
   ```

2. **Is app WebSocket connected?**

   ```bash
   # In cloud logs
   grep "App connected" | grep your-package-name
   ```

3. **Check subscription logs:**

   ```bash
   # Should see in cloud logs:
   "AUDIO_CHUNK: relaying to apps"
   "AUDIO_CHUNK: sending to app"
   ```

4. **Verify app handler is called:**
   ```typescript
   session.subscribe(StreamType.AUDIO_CHUNK, (data) => {
     console.log("GOT AUDIO:", data.length); // Add this log
   });
   ```

---

### 3. gRPC Connection Failed

**Symptoms:**

```
Error: 14 UNAVAILABLE: Connection refused
```

**Solutions:**

1. **Check bridge is running:**

   ```bash
   docker ps | grep livekit-bridge
   ```

2. **Check port is correct:**

   ```bash
   # Should be 9090 for gRPC (not 8080)
   docker port livekit-bridge 9090
   ```

3. **Check environment variable:**

   ```bash
   # In cloud container
   docker exec cloud env | grep LIVEKIT_GRPC_BRIDGE_URL
   # Should be: livekit-bridge:9090
   ```

4. **Try localhost if running locally:**

   ```bash
   LIVEKIT_GRPC_BRIDGE_URL=localhost:9090 bun run dev
   ```

5. **Check Docker network:**
   ```bash
   docker network ls
   docker network inspect cloud_default
   # Verify both cloud and livekit-bridge are on same network
   ```

---

### 4. Proto File Not Found

**Symptoms:**

```
Error: ENOENT: no such file or directory, open '...livekit_bridge.proto'
```

**Solution:**

```bash
# Copy proto file to cloud package
cp cloud/packages/cloud-livekit-bridge/proto/livekit_bridge.proto \
   cloud/packages/cloud/proto/

# Verify
ls cloud/packages/cloud/proto/livekit_bridge.proto
```

---

### 5. Audio Latency / Delay

**Symptoms:**

- Audio transcription is delayed by 2+ seconds
- Apps receive audio slowly

**Possible Causes:**

1. **Channel buffer too large:**
   - 200 frame buffer = ~2 seconds at 100fps
   - Reduce if you need lower latency:

   ```go
   audioFromLiveKit: make(chan []byte, 50), // ~500ms buffer
   ```

2. **TypeScript processing slow:**
   - Check CPU usage in cloud container
   - Profile AudioManager.processAudioData()

3. **App processing slow:**
   - Check app's audio handler performance
   - Don't do heavy processing in the handler

---

### 6. Memory Still Growing

**Symptoms:**

- Memory increases over time
- More than 10MB per active session

**Debug Steps:**

1. **Check goroutine count:**

   ```bash
   # Add to Go bridge health check
   curl http://localhost:9090/debug/pprof/goroutine
   ```

   Expected: 5-10 base + 2-3 per session

2. **Check channel isn't leaking:**
   - Ensure session.Close() is called on disconnect
   - Check logs for "Closing room session" messages

3. **Verify old WebSocket bridge isn't running:**

   ```bash
   # Should be empty
   docker ps | grep 8080

   # Verify gRPC port
   docker ps | grep 9090
   ```

4. **Check for stuck goroutines:**
   ```bash
   docker exec livekit-bridge pgrof
   ```

---

### 7. Send Timeout Errors

**Symptoms:**

```
StreamAudio send timeout for user@example.com after 2s
```

**Meaning:**
TypeScript client is completely stuck and not reading from gRPC stream.

**Possible Causes:**

1. **TypeScript event loop blocked:**
   - Heavy synchronous processing in audio handler
   - Solution: Use async processing or worker threads

2. **AudioManager.processAudioData() is slow:**
   - Profile this method
   - Check transcription/translation services

3. **Network issues:**
   - Check latency between cloud and bridge
   - Verify both containers are healthy

**Fix:**
Make audio processing async:

```typescript
this.audioStream?.on("data", async (chunk: any) => {
  const pcmData = Buffer.from(chunk.pcm_data);

  // Don't block the event loop
  setImmediate(() => {
    this.userSession.audioManager.processAudioData(pcmData);
  });
});
```

---

## Diagnostic Commands

### Check Audio Flow (Go Side)

```bash
# Watch for audio flow logs
docker logs -f livekit-bridge | grep "Audio flowing"

# Expected output every second:
# Audio flowing for user@example.com: received=100, dropped=0, channelLen=5
```

### Check Audio Flow (TypeScript Side)

```bash
# Watch for TypeScript receive logs
docker logs -f cloud | grep "Received audio chunks from gRPC bridge"

# Expected output every second:
# Received audio chunks from gRPC bridge | receivedChunks: 100
```

### Check Audio Flow (AudioManager)

```bash
# Watch for AudioManager logs
docker logs -f cloud | grep "AudioManager received PCM chunk"

# Expected output every second:
# AudioManager received PCM chunk | frames: 100, bytes: 320
```

### Check Apps Receiving Audio

```bash
# Watch for app relay logs
docker logs -f cloud | grep "AUDIO_CHUNK: sending to app"

# Should see regular messages if apps subscribed
```

### Performance Monitoring

```bash
# Memory usage
docker stats --no-stream

# Expected:
# livekit-bridge: <50MB idle, <10MB per session
# cloud: varies by load

# CPU usage
docker stats livekit-bridge

# Expected: <10% CPU per session
```

---

## Common Misconfigurations

### Wrong Port

```bash
# WRONG
LIVEKIT_GRPC_BRIDGE_URL=livekit-bridge:8080  # WebSocket port

# CORRECT
LIVEKIT_GRPC_BRIDGE_URL=livekit-bridge:9090  # gRPC port
```

### Missing Dependencies

```bash
# Did you run?
cd cloud/packages/cloud
bun install  # Installs @grpc/grpc-js
```

### Old Bridge Running

```bash
# Check for old WebSocket bridge
docker-compose down
docker-compose up --build  # Force rebuild
```

### Proto Path Wrong

```typescript
// WRONG (looking in wrong directory)
const PROTO_PATH = path.resolve(__dirname, "../proto/livekit_bridge.proto");

// CORRECT (from LiveKitGrpcClient.ts)
const PROTO_PATH = path.resolve(
  __dirname,
  "../../../../proto/livekit_bridge.proto",
);
```

---

## Success Indicators

✅ **Bridge is healthy:**

- Logs show "gRPC server listening on :9090"
- No "channel full" errors
- "Audio flowing" logs appear regularly

✅ **TypeScript is receiving:**

- "Received audio chunks from gRPC bridge" logs
- "AudioManager received PCM chunk" logs
- No timeout errors

✅ **Apps are receiving:**

- "AUDIO_CHUNK: sending to app" logs
- App handlers are called
- Audio data arrives in app

✅ **Performance is good:**

- Memory: <10MB per session
- CPU: <10% per session
- Latency: <100ms end-to-end
- No dropped frames

---

## Still Having Issues?

1. **Enable full debug logging:**

   ```bash
   # Go bridge
   LOG_LEVEL=debug docker-compose up livekit-bridge

   # TypeScript cloud
   LOG_LEVEL=debug bun run dev
   ```

2. **Collect full logs:**

   ```bash
   docker logs livekit-bridge > bridge.log 2>&1
   docker logs cloud > cloud.log 2>&1
   ```

3. **Check Discord:**
   https://discord.gg/5ukNvkEAqT

4. **Create GitHub Issue:**
   Include:
   - Full error messages
   - Bridge logs (bridge.log)
   - Cloud logs (cloud.log)
   - Docker stats output
   - Environment variables (redact secrets)

---

## Quick Recovery

If everything is broken:

```bash
# Nuclear option: clean restart
cd cloud
docker-compose down -v
docker system prune -f
docker-compose up --build

# Should see:
# livekit-bridge | gRPC server listening on :9090
# cloud | gRPC client initialized
```

Then test with a fresh session.
