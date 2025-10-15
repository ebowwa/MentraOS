# gRPC Bridge Reconnection Handling

## Current Behavior

### When Cloud Restarts

**What Happens:**

1. Cloud container restarts (code change, crash, or manual restart)
2. gRPC stream from bridge → cloud is broken
3. Bridge's `stream.Send()` fails with error
4. Send goroutine detects error and exits
5. Audio channel fills up (TypeScript not reading anymore)
6. Bridge starts dropping frames with "channel full" errors

**Timeline:**

```
T+0s:  Cloud restarts
T+0s:  gRPC stream breaks
T+0s:  Bridge send goroutine gets error → exits
T+0s:  Channel stops draining (no one reading)
T+0.2s: Audio channel fills up (200 frames)
T+0.2s: Bridge starts dropping frames
```

**Log Signature:**

```
livekit-bridge | StreamAudio send error for user@example.com: rpc error: code = Unavailable
livekit-bridge | StreamAudio send goroutine ended: user@example.com
livekit-bridge | Dropping audio frame for user@example.com (channel full)
livekit-bridge | Dropping audio frame for user@example.com (channel full)
livekit-bridge | Dropping audio frame for user@example.com (channel full)
```

---

## Why This Happens

### gRPC Stream Lifecycle

The gRPC `StreamAudio` is a **bidirectional stream** tied to a single connection:

```
┌─────────────┐                    ┌──────────────┐
│  TypeScript │◄──────stream──────►│  Go Bridge   │
│    Cloud    │                    │              │
└─────────────┘                    └──────────────┘
       │                                  │
       │ Cloud restarts                   │
       ▼                                  │
   Connection lost                        │
       │                                  │
       │                                  ▼
       │                        stream.Send() → error
       │                        Send goroutine exits
       │                        Channel fills up
       │                        Frames dropped
```

**Key Point:** When the cloud restarts, the existing gRPC stream is **not reconnected automatically**. The stream is tied to the connection, and the connection is dead.

---

## Current Reconnection Logic

### TypeScript Side (LiveKitGrpcClient.ts)

```typescript
// Handle stream errors
this.audioStream?.on("error", (error: Error) => {
  this.logger.error({ error, feature: "livekit-grpc" }, "Audio stream error");
  this.connected = false;

  // Attempt reconnection if not disposed
  if (!this.disposed && this.currentParams) {
    this.logger.info(
      { feature: "livekit-grpc" },
      "Attempting to reconnect after stream error",
    );
    setTimeout(() => {
      if (this.currentParams && !this.disposed) {
        this.connect(this.currentParams).catch((err) => {
          this.logger.error(
            { err, feature: "livekit-grpc" },
            "Reconnection failed",
          );
        });
      }
    }, 2000);
  }
});
```

**Problem:** This only handles errors detected by **TypeScript**. When cloud restarts, TypeScript is gone. The new cloud instance doesn't know about the old stream.

### Go Side (service.go)

```go
// Send goroutine
case err := <-sendDone:
    if err != nil {
        log.Printf("StreamAudio send error for %s: %v", userId, err)
        errChan <- fmt.Errorf("send error: %w", err)
        return  // Exit goroutine
    }
```

**Behavior:** When send fails, goroutine exits. Session remains in memory but is effectively dead (can't send audio anymore).

---

## The Missing Piece

### Go Bridge Doesn't Clean Up Session

When the gRPC stream breaks:

- ✅ Send goroutine exits
- ✅ Error is logged
- ❌ Session is **NOT** removed from `s.sessions` map
- ❌ LiveKit room is **NOT** disconnected
- ❌ Audio channel keeps receiving from LiveKit
- ❌ Channel fills up → frames dropped

**Result:** Zombie session keeps receiving audio but can't send it anywhere.

---

## Solution: Proper Session Cleanup

### Fix 1: Clean Up on Stream Error (Go)

When gRPC stream breaks, clean up the entire session:

```go
// In service.go StreamAudio()
select {
case err := <-errChan:
    log.Printf("StreamAudio error for userId=%s: %v", userId, err)

    // IMPORTANT: Clean up session on stream error
    session.Close()
    s.sessions.Delete(userId)

    return err
case <-session.ctx.Done():
    // ... existing code
}
```

**Impact:**

- Session properly closed on stream break
- LiveKit room disconnected
- Audio channel closed → no more fills up
- No more "channel full" errors

### Fix 2: Health Check from TypeScript (Future Enhancement)

TypeScript sends periodic "heartbeat" messages to verify stream health:

```typescript
// In LiveKitGrpcClient.ts
private startHeartbeat() {
  this.heartbeatTimer = setInterval(() => {
    if (this.audioStream && this.connected) {
      // Send empty chunk as heartbeat
      this.audioStream.write({
        user_id: this.userSession.userId,
        pcm_data: Buffer.alloc(0),
        sample_rate: 16000,
        channels: 1,
        timestamp_ms: Date.now(),
      });
    }
  }, 5000); // Every 5 seconds
}
```

**Impact:**

- Detects dead connections faster
- TypeScript can reconnect proactively

### Fix 3: Session Timeout (Go)

If no audio sent for N seconds, assume connection dead:

```go
// In service.go StreamAudio()
lastSendTime := time.Now()
timeoutTimer := time.NewTimer(30 * time.Second)

for {
    select {
    case audioData := <-session.audioFromLiveKit:
        // ... send logic ...
        lastSendTime = time.Now()
        timeoutTimer.Reset(30 * time.Second)

    case <-timeoutTimer.C:
        log.Printf("StreamAudio timeout for %s (no activity for 30s)", userId)
        session.Close()
        s.sessions.Delete(userId)
        return fmt.Errorf("stream timeout")
    }
}
```

**Impact:**

- Zombie sessions cleaned up automatically
- No manual intervention needed

---

## Reconnection Flow (Ideal)

### When Cloud Restarts

```
T+0s:  Cloud restarts
       - Old gRPC streams are dead

T+0s:  Go bridge detects send error
       - Cleans up session (session.Close())
       - Removes from sessions map
       - Disconnects from LiveKit room
       - Closes audio channel

T+2s:  Cloud comes back online
       - User reconnects WebSocket to cloud
       - Cloud calls liveKitManager.handleLiveKitInit()
       - New gRPC stream created to bridge

T+2s:  Bridge accepts new JoinRoom request
       - Creates fresh session
       - Connects to LiveKit room
       - New audio stream established

T+2s:  Audio flows again
       - No dropped frames (channel not full)
       - Clean state all around
```

---

## Implementation Priority

### Phase 1: Essential (Do Now)

- ✅ Increase channel buffer (200 frames) - **DONE**
- ✅ Add send timeout (2s) - **DONE**
- ✅ Add debug logging - **DONE**
- 🔄 **Clean up session on stream error** - **TODO**

### Phase 2: Robustness (Do Soon)

- 🔄 Add session timeout (30s inactivity)
- 🔄 Add heartbeat/keepalive from TypeScript
- 🔄 Exponential backoff on reconnect

### Phase 3: Polish (Do Later)

- 🔄 Metrics on reconnection rate
- 🔄 Alert on excessive reconnections
- 🔄 Graceful degradation (continue without bridge)

---

## Testing Reconnection

### Test 1: Cloud Restart

```bash
# Start system
docker-compose up

# Establish session
# (connect mobile, enable mic)

# Restart cloud
docker restart cloud

# Expected:
# - Bridge logs "StreamAudio send error"
# - Bridge logs "Closing room session"
# - Cloud comes back, user reconnects
# - New stream established
# - Audio flows again
```

### Test 2: Bridge Restart

```bash
# Start system
docker-compose up

# Establish session
# (connect mobile, enable mic)

# Restart bridge
docker restart livekit-bridge

# Expected:
# - TypeScript logs "Audio stream error"
# - TypeScript logs "Attempting to reconnect"
# - New stream established
# - Audio flows again
```

### Test 3: Network Partition

```bash
# Simulate network issues
docker network disconnect cloud_default cloud
sleep 5
docker network connect cloud_default cloud

# Expected:
# - Stream breaks detected
# - Automatic reconnection
# - Audio resumes
```

---

## Current Limitations

### What Doesn't Reconnect Automatically

1. **Go bridge session** - Must be manually cleaned up
2. **LiveKit room** - Not disconnected on stream break
3. **Audio channel** - Keeps filling up with no reader

### What Does Reconnect

1. **TypeScript gRPC client** - Has error handler with retry
2. **Mobile WebSocket** - Has reconnection logic
3. **User session** - Recreated on WebSocket reconnect

---

## Recommended Immediate Fix

Add to `service.go` in the `StreamAudio()` method:

```go
// Wait for error or cancellation
select {
case err := <-errChan:
    log.Printf("StreamAudio error for userId=%s: %v", userId, err)

    // CRITICAL: Clean up session on stream error
    // This prevents zombie sessions and "channel full" errors
    log.Printf("Cleaning up session for %s due to stream error", userId)
    session.Close()
    s.sessions.Delete(userId)

    return err

case <-session.ctx.Done():
    log.Printf("StreamAudio context done: userId=%s", userId)
    return nil
}
```

**Impact:**

- Fixes "channel full" errors after cloud restart
- Prevents zombie sessions
- Enables clean reconnection

---

## Summary

**Problem:** Cloud restart → gRPC stream breaks → Go session becomes zombie → channel fills up → frames dropped

**Root Cause:** Go bridge doesn't clean up session when gRPC stream breaks

**Solution:** Add session cleanup on stream error

**Result:** Clean reconnection, no frame drops, no zombie sessions
