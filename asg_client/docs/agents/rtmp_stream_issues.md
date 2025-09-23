# RTMP Streaming Issues Analysis

## Overview

This document analyzes the RTMP streaming implementation across the MentraOS codebase, identifying state reporting issues and retry mechanism problems that cause streams to fail or become unreliable when WiFi connections are unstable.

## System Architecture

### Components Involved

1. **asg_client** - Android Smart Glasses client that runs the actual RTMP streaming
2. **android_core** - Mobile app that relays messages between glasses and cloud
3. **cloud** - Backend that manages stream sessions and keep-alive
4. **SDK** - App-facing API for controlling streams

### Message Flow

```
App → Cloud → Mobile (WebSocket) → Glasses (BLE) → RTMP Server
         ↑                              ↓
         └── Status Updates ────────────┘
```

## Detailed Flow Analysis

### 1. Stream Initiation

1. **App → Cloud:** App requests stream via SDK `camera.startStream()`
   - File: `/cloud/packages/sdk/src/app/session/modules/camera.ts:382`
   - Sends `RTMP_STREAM_REQUEST` message

2. **Cloud → Glasses:** Cloud sends `START_RTMP_STREAM` command
   - File: `/cloud/packages/cloud/src/services/session/VideoManager.ts:191`
   - Generates streamId, starts keep-alive timer

3. **Glasses Receive:** asg_client processes command
   - File: `/asg_client/app/src/main/java/com/augmentos/asg_client/service/core/handlers/RtmpCommandHandler.java:63`
   - Validates WiFi, checks camera availability

4. **Streaming Starts:** RtmpStreamingService begins
   - File: `/asg_client/app/src/main/java/com/augmentos/asg_client/io/streaming/services/RtmpStreamingService.java:637`
   - Uses StreamPack library for RTMP connection

### 2. State Updates

Status updates flow back through callbacks:

```java
StreamingStatusCallback → MediaManager → BLE → Mobile → WebSocket → Cloud → App
```

Key files:

- `/asg_client/app/src/main/java/com/augmentos/asg_client/service/media/managers/MediaManager.java:276`
- `/android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/smartglassescommunicators/MentraLiveSGC.java:1541`

### 3. Keep-Alive Mechanism

- Cloud sends keep-alive every 15 seconds
- Glasses must ACK within 10 seconds
- Stream times out after 60 seconds of no activity

Files:

- Cloud: `/cloud/packages/cloud/src/services/session/VideoManager.ts:361`
- Glasses: `/asg_client/app/src/main/java/com/augmentos/asg_client/service/core/handlers/RtmpCommandHandler.java:147`

## Critical Issues Identified

### Issue 1: Initial State Reporting Gap

**Problem:**
When streaming starts, if connection fails immediately (WiFi drops, wrong URL), the failure notification is delayed by 1+ seconds.

**Location:**
`RtmpStreamingService.java:473-498`

**Details:**

- `onFailed()` callback fires in 17-100ms after failure
- Code waits 1 second for library internal recovery before scheduling reconnect
- During this gap, cloud/app think stream is still initializing

**Impact:**

- User sees "connecting" spinner for 1+ seconds after stream already failed
- Delayed error reporting affects user experience

### Issue 2: Inconsistent State Mapping

**Problem:**
State names don't align between components.

**State Mappings:**

| asg_client       | Cloud Expected | Issue               |
| ---------------- | -------------- | ------------------- |
| initializing     | initializing   | ✓ OK                |
| streaming        | active         | Requires mapping    |
| reconnecting     | initializing   | Confusing           |
| reconnected      | ?              | No mapping defined  |
| stopped          | stopped        | ✓ OK                |
| error            | stopped        | Loses error context |
| reconnect_failed | timeout        | Misleading          |

**Location:**
`VideoManager.ts:619-656`

**Impact:**

- Apps receive inconsistent status updates
- `reconnected` and `reconnect_failed` are treated as unknown and dropped, so the cloud never reflects successful or failed recoveries
- Error payloads use the `error` key while the cloud expects `errorDetails`, so the descriptive text is stripped even when the packet arrives

### Issue 3: Retry Mechanism Reliability

#### 3a. Race Condition on Quick Failures

**Problem:**
Stale reconnection handlers can fire after stream is cancelled.

**Location:**
`RtmpStreamingService.java:1034-1055`

**Details:**

```java
// Reconnection sequence counter helps but doesn't fully prevent race
final int currentSequence = mReconnectionSequence;
mReconnectHandler.postDelayed(() -> {
    if (currentSequence != mReconnectionSequence) {
        Log.d(TAG, "Ignoring stale reconnection handler");
        return;
    }
    // ... attempt reconnect
}, delay);
```

**Scenario:**

1. Stream fails, schedules reconnect in 2 seconds
2. User stops stream (increments sequence)
3. User starts new stream (increments sequence again)
4. Old reconnect handler fires, sees different sequence, ignores (✓ works)
5. BUT: If WiFi reconnects during 1-second wait, state becomes inconsistent

#### 3b. State Machine Gaps

**Problem:**
Dual state tracking causes confusion.

**Location:**
`RtmpStreamingService.java:102-109`

**Details:**

```java
private enum StreamState {
    IDLE, STARTING, STREAMING, STOPPING
}
private volatile StreamState mStreamState = StreamState.IDLE;
private boolean mReconnecting = false;  // Separate flag!
```

**Issues:**

- Can be in STARTING state while mReconnecting=true
- Can be IDLE with mReconnecting=true
- No single source of truth for current state

#### 3c. Reconnection Not Always Triggered

**Problem:**
Reconnection can fail to start under certain conditions.

**Location:**
`RtmpStreamingService.java:991-1010`

**Scenario:**

1. First failure sets `mReconnecting = true`
2. Reconnect handler cancelled due to stop command
3. New stream started
4. New failure occurs but `mReconnecting` still true
5. `scheduleReconnect()` early returns, no reconnection

#### 3d. Reconnect Attempt Counter Reset Too Early

**Problem:**
`mReconnectAttempts` is reset to `0` inside `onSuccess()` before the status callback fires (`RtmpStreamingService.java:403-416`).

**Impact:**

- The `reconnected` status reports `attempt: 0`, masking how many retries actually occurred.
- Cloud-side heuristics can never react to high retry counts because the signal is lost at the source.

### Issue 4: Keep-Alive ACK Issues

#### 4a. BLE Connection Drops

**Problem:**
Keep-alive ACKs lost when BLE disconnects temporarily.

**Location:**
`MediaManager.java:233-271`

**Current Mitigation:**

```java
// Retry once after 1.5 seconds
new Handler(Looper.getMainLooper()).postDelayed(() -> {
    if (serviceManager.getBluetoothManager().isConnected()) {
        // Retry sending ACK
    }
}, 1500);
```

**Issues:**

- Single retry insufficient for longer BLE drops
- No exponential backoff
- Cloud times out after 3 missed ACKs (45 seconds)

#### 4b. Timing Mismatch

**Problem:**
Different timeout values across system.

| Component | Keep-Alive Interval | ACK Timeout             | Stream Timeout |
| --------- | ------------------- | ----------------------- | -------------- |
| Cloud     | 15 seconds          | 10 seconds              | 60 seconds     |
| Glasses   | N/A (receives)      | N/A (sends immediately) | 60 seconds     |

**Impact:**

- If BLE has 11-second gap, ACK times out even though stream is healthy
- 3 consecutive 11-second gaps = stream cancelled (33 seconds < 60 second timeout)

#### 4c. First Keep-Alive Race

**Problem:**
The cloud schedules the first keep-alive one second after sending `START_RTMP_STREAM`, but the glasses only set `mCurrentStreamId` after the RTMP socket connects (`RtmpStreamingService.java:425`). Until that happens, `resetStreamTimeout()` returns `false`, so the keep-alive handler assumes the stream is unknown and force-stops it (`RtmpCommandHandler.java:152-160`).

**Impact:**

- Slow RTMP handshakes or high-latency networks consistently trigger an immediate stop/retry loop on the very first attempt.
- Users hit "maximum reconnection attempts" without ever completing the initial connection.

### Issue 5: Error Classification Issues

#### 5a. Retryable vs Fatal Errors

**Problem:**
Error classification too rigid.

**Location:**
`RtmpStreamingService.java:1294-1346`

**Current Classification:**

| Error Type        | Classification | Issue                       |
| ----------------- | -------------- | --------------------------- |
| Camera busy       | Fatal          | Could become available soon |
| Invalid URL       | Fatal          | ✓ Correct                   |
| Network timeout   | Retryable      | Could be wrong URL          |
| Permission denied | Fatal          | ✓ Correct                   |
| Unknown host      | Retryable      | Could be typo in URL        |

**Impact:**

- Camera busy during photo capture kills stream permanently
- Wrong RTMP URL retries 10 times before giving up

#### 5b. Missing Status Updates

**Problem:**
No proactive status updates for state changes.

**Examples:**

- WiFi disconnects during stream → No "wifi_lost" status
- Camera becomes available after being busy → No "camera_ready" status
- Battery low affecting stream quality → No warning

**Location:**
Status callbacks only triggered by StreamPack library events, not system events.

## Areas Where State Gets Out of Sync

### 1. During Rapid WiFi Fluctuations

**Scenario:**

```
T+0ms: Stream starts
T+100ms: WiFi drops
T+117ms: onFailed() called
T+200ms: WiFi returns
T+1117ms: Reconnect handler fires (unnecessary, already reconnected)
```

**Result:** Duplicate connection attempts, confused state

### 2. BLE Handoffs

**Scenario:**
Mobile app switches from BLE to WiFi direct mode during stream.

**Issues:**

- Keep-alive ACKs lost during transition
- Cloud thinks stream dead, glasses still streaming
- No mechanism to resync state

### 3. Camera Resource Conflicts

**Scenario:**

```
1. RTMP streaming active
2. User takes photo (camera busy)
3. RTMP fails with "camera_busy"
4. Photo completes, camera available
5. No mechanism to restart RTMP
```

**Location:**
`RtmpStreamingService.java:670-681`

### 4. Incomplete Status Propagation

**Chain of Failure Points:**

```
asg_client → [BLE] → android_core → [WebSocket] → cloud → [WebSocket] → app
           ↑                      ↑                     ↑
        Can fail                Can fail             Can fail
```

**Issues:**

- No acknowledgment that status was received
- Any break in chain loses status update permanently
- No retry mechanism for status updates

### 5. Missing Stream ID Coordination

**Problem:**
Stream ID not always properly tracked.

**Location:**
`RtmpStreamingService.java:286`

**Issues:**

```java
String streamId = RtmpStreamingService.getCurrentStreamId();
if (streamId != null && !streamId.isEmpty()) {
    status.put("streamId", streamId);
}
// streamId can be null, causing keep-alive mismatches
```

- Terminal status payloads (`stopped`, `error`, `reconnect_failed`) never add `streamId` (`MediaManager.java:327-404`), so when they reach the cloud `handleRtmpStreamStatus` marks them as "unknown stream" and ignores them. Sessions stay stuck in the previous state and stop/ error events never reach apps.

## Recommendations

### 1. Add State Acknowledgments

**Implementation:**

- Cloud sends ACK when status update received
- Glasses retry status update if no ACK within 2 seconds
- Maximum 3 retries with exponential backoff

### 2. Unified State Machine

**Proposed States:**

```java
enum StreamState {
    IDLE,
    INITIALIZING,
    CONNECTING,
    STREAMING,
    RECONNECTING,
    STOPPING,
    STOPPED,
    ERROR
}
```

Remove separate `mReconnecting` flag, integrate into state machine.

### 3. Proactive Status Updates

**New Status Events:**

- `wifi_lost` - WiFi disconnected
- `wifi_restored` - WiFi reconnected
- `camera_available` - Camera ready for streaming
- `battery_low` - May affect stream quality
- `thermal_throttling` - Device too hot

### 4. Shorter Initial Retry

**Current:**

```java
// Wait 1 second for library internal recovery
mReconnectHandler.postDelayed(() -> {
    // Try reconnect
}, 1000);
```

**Proposed:**

```java
// Quick retry for network issues
mReconnectHandler.postDelayed(() -> {
    // Try reconnect
}, 200);
```

### 5. Queue Pending Operations

**Implementation:**

```java
class StreamRequestQueue {
    Queue<StreamRequest> pending = new LinkedList<>();

    void onCameraAvailable() {
        StreamRequest next = pending.poll();
        if (next != null) {
            processRequest(next);
        }
    }
}
```

### 6. Better Error Context

**Enhanced Error Info:**

```json
{
  "type": "rtmp_stream_status",
  "status": "error",
  "error": {
    "code": "NETWORK_ERROR",
    "message": "Connection timeout",
    "details": {
      "wifi_ssid": "Office_5G",
      "signal_strength": -72,
      "retry_count": 3,
      "last_successful_frame": "2024-01-17T10:23:45Z"
    }
  }
}
```

### 7. Implement Circuit Breaker Pattern

**Concept:**
After N failures within time window, stop retrying temporarily.

```java
class CircuitBreaker {
    int failureCount = 0;
    long windowStart = System.currentTimeMillis();
    static final int THRESHOLD = 5;
    static final long WINDOW_MS = 30000;

    boolean shouldAttempt() {
        long now = System.currentTimeMillis();
        if (now - windowStart > WINDOW_MS) {
            reset();
        }
        return failureCount < THRESHOLD;
    }
}
```

### 8. Add Stream Health Metrics

**Track and Report:**

- Frames per second
- Bitrate achieved vs target
- Packet loss percentage
- Round-trip time to RTMP server
- Upload bandwidth available

### 9. Implement Graceful Degradation

**When Network Degrades:**

1. Reduce video resolution (1080p → 720p → 480p)
2. Reduce framerate (30fps → 15fps → 10fps)
3. Reduce audio bitrate (128kbps → 64kbps)
4. Switch to audio-only if video impossible

### 10. Add Testing Hooks

**Debug Commands:**

```java
// Force state transitions for testing
RtmpStreamingService.forceState(StreamState.RECONNECTING);

// Simulate network conditions
RtmpStreamingService.simulatePacketLoss(0.1); // 10% loss

// Inject fake keep-alive delays
RtmpStreamingService.delayKeepAlive(5000); // 5 second delay
```

## Testing Scenarios

### Scenario 1: Rapid WiFi Toggle

1. Start stream
2. Disable WiFi for 2 seconds
3. Re-enable WiFi
4. Verify stream recovers without duplicate connections

### Scenario 2: BLE Disconnection During Stream

1. Start stream
2. Move phone out of BLE range
3. Keep phone disconnected for 20 seconds
4. Bring phone back
5. Verify keep-alives resume and stream continues

### Scenario 3: Camera Resource Competition

1. Start RTMP stream
2. Trigger photo capture
3. Verify stream pauses gracefully
4. Verify stream resumes after photo

### Scenario 4: Wrong RTMP URL

1. Start stream with invalid URL
2. Verify fails quickly (not 10 retries)
3. Verify error message indicates bad URL

### Scenario 5: Extended Stream

1. Start stream
2. Stream for 10 minutes
3. Verify no timeout despite long duration
4. Verify keep-alives maintained throughout

## Monitoring & Alerting

### Key Metrics to Track

1. **Stream Success Rate**
   - Successful starts / total attempts
   - Target: >95%

2. **Mean Time to Recovery (MTTR)**
   - Average time from failure to successful reconnection
   - Target: <5 seconds

3. **Keep-Alive Success Rate**
   - ACKs received / keep-alives sent
   - Target: >98%

4. **State Sync Accuracy**
   - States matching between glasses and cloud
   - Target: >99%

5. **Reconnection Attempts**
   - Average reconnections per stream
   - Target: <0.5

### Alert Conditions

- Stream success rate <90% over 5 minutes
- MTTR >10 seconds for 3 consecutive streams
- Keep-alive success <95% for any stream
- > 5 reconnection attempts for single stream
- State mismatch detected between components

## Implementation Priority

### Phase 1: Critical Fixes (1 week)

1. Fix reconnection state management (Issue 3b)
2. Add stream ID validation (Issue 5)
3. Reduce initial retry delay (Recommendation 4)

### Phase 2: Reliability Improvements (2 weeks)

1. Implement state acknowledgments (Recommendation 1)
2. Unify state machine (Recommendation 2)
3. Fix BLE keep-alive retries (Issue 4a)

### Phase 3: Enhanced Monitoring (1 week)

1. Add proactive status updates (Recommendation 3)
2. Implement health metrics (Recommendation 8)
3. Add debug/testing hooks (Recommendation 10)

### Phase 4: Advanced Features (2 weeks)

1. Queue pending operations (Recommendation 5)
2. Implement circuit breaker (Recommendation 7)
3. Add graceful degradation (Recommendation 9)

## Conclusion

The RTMP streaming system has multiple points where state can become inconsistent, particularly during network instability. The primary issues stem from:

1. Separate state tracking mechanisms that can conflict
2. Lack of acknowledgment for status updates
3. Rigid error classification without context
4. Missing proactive status updates for system events
5. Timeout mismatches between components

Implementing the recommended fixes in priority order will significantly improve streaming reliability and provide better visibility into stream health for both developers and end users.
