# AppSession Self-Healing Resurrection - Design Document

**Status**: In Progress  
**Last Updated**: 2025-10-23  
**Author**: System Architecture Team

---

## Executive Summary

This document describes the refactoring of MentraOS Cloud's app lifecycle management from a centralized `AppManager` to a self-healing `AppSession` architecture. The primary goals are:

1. **Self-healing resurrection**: AppSession handles its own reconnection without external orchestration
2. **Registry persistence**: Keep sessions in registry even during failures to enable late connections
3. **Simplified architecture**: Remove complex orchestration between AppManager and AppSession
4. **Better timeout handling**: Adjust timeouts to match real-world latency (especially local development)

---

## Problem Statement

### Original Issue

User reported: _"Message send rejected - app is restarting"_ with app stuck in `RESURRECTING` state.

### Root Causes Discovered

#### 1. Session Deletion on Failure (Critical)

**Old Behavior:**

```typescript
// AppsManager.startApp() - OLD CODE
const result = await session.start()
if (!result.success) {
  this.appSessions.delete(packageName) // ❌ Session removed from registry!
}
```

**Problem**: When webhook times out or connection fails, the AppSession is deleted from the registry. If the app connects late (e.g., after 3.9 seconds when timeout was 3s), there's no session to receive it.

**Example from logs:**

```
14:18:38.960 - Cloud webhook timeout (3000ms exceeded)
14:18:38.961 - Cloud removes AppSession from registry
14:18:39.909 - App WebSocket connects (LATE!)
14:18:39.959 - Cloud: "No AppSession found for handleAppInit; ignoring"
```

#### 2. Complex Resurrection Flow (Architecture)

**Old Behavior:**

```
Grace Period Expires
  → triggerResurrection()
  → Calls appsManager.handleResurrection()
  → appsManager stops old session (with restart=true)
  → appsManager deletes session from registry
  → appsManager creates NEW session
  → appsManager starts new session
```

**Problems:**

- If resurrection fails between deletion and recreation, session is orphaned
- State transitions are complex (RESURRECTING but not in registry?)
- AppsManager needs to know about resurrection details
- Can get stuck in RESURRECTING state if new session creation fails

#### 3. Aggressive Timeouts (Performance)

**Old System (Legacy AppManager):**

- Webhook timeout: **10 seconds**
- Connection timeout: **5 seconds**

**New System (Initial Implementation):**

- Webhook timeout: **3 seconds** ❌ TOO SHORT!
- Connection timeout: **5 seconds**

**Problem**: Comment said "fail fast per architecture" but broke real-world usage. Flash app on a laptop waking from sleep takes ~3.8 seconds to respond, which worked with old 10s timeout but fails with 3s.

#### 4. SDK Webhook Handler Blocks (SDK Design Issue)

**Discovery**: The `@mentra/sdk` webhook handler waits for WebSocket connection before returning HTTP 200:

```typescript
// SDK: app/server/index.ts:541-545
try {
  await session.connect(sessionId);  // ← BLOCKS HERE!
  // ... only after WS connects:
  res.status(200).json({ status: "success" });
}
```

**Problem**: This creates a circular dependency when network is slow:

- Cloud sends webhook, waits for HTTP response
- Flash SDK waits for WebSocket to connect
- Cloud won't accept WebSocket until AppSession exists
- AppSession might be deleted if webhook times out!

**Race condition timeline:**

```
T+0ms:   Cloud sends webhook (5s timeout)
T+100ms: Flash receives webhook, starts WS connection
T+3800ms: WS connection completes
T+3850ms: Flash returns HTTP 200
T+5000ms: Cloud webhook times out ❌ (barely missed!)
```

---

## Solution: Self-Healing AppSession (Option A)

### Core Principle

**The AppSession object is the single source of truth for app lifecycle. It never leaves the registry until explicitly stopped by the user.**

### Key Changes

#### 1. Keep Sessions in Registry on Failure

```typescript
// AppsManager.startApp() - NEW CODE
const result = await session.start()
if (!result.success) {
  logger.warn("Session start failed, but keeping in registry for potential late connection")
  // DON'T delete session - app might connect late!
  // this.appSessions.delete(packageName);  ← COMMENTED OUT
}
```

**Benefits:**

- Late connections work (app can connect after webhook timeout)
- No orphaned sessions
- Apps stay discoverable in registry

#### 2. Self-Healing Resurrection

**New Behavior:**

```
Grace Period Expires
  → triggerResurrection() (internal to AppSession)
  → Close old WebSocket
  → Clear timers and subscriptions
  → Trigger new webhook (reuse triggerWebhook())
  → Wait for app to reconnect
  → On reconnection: transition RESURRECTING → RUNNING
  → On timeout: transition RESURRECTING → DISCONNECTED
```

**Code:**

```typescript
private async triggerResurrection(): Promise<void> {
  this.state = AppConnectionState.RESURRECTING;

  // 1. Clean up old connection
  if (this.ws) { this.ws.close(); this.ws = null; }
  this.cleanup(); // Clear timers

  // 2. Remove subscriptions
  await this.userSession.subscriptionManager.removeSubscriptions(this.packageName);

  // 3. Update UI
  this.userSession.displayManager.handleAppStart(this.packageName);

  // 4. Get app info
  const app = this.userSession.installedApps.get(this.packageName);

  // 5. Trigger new webhook (reuse existing method!)
  await this.triggerWebhook(app);

  // 6. Set up timeout
  this.connectionTimer = setTimeout(() => {
    // Failed to resurrect - clean up
    this.state = AppConnectionState.DISCONNECTED;
    this.userSession.runningApps.delete(this.packageName);
    this.userSession.loadingApps.delete(this.packageName);
    this.userSession.displayManager.handleAppStop(this.packageName);

    PosthogService.trackEvent("app_resurrection_failed", ...);
  }, CONNECTION_TIMEOUT_MS);
}
```

**Benefits:**

- AppSession stays in registry throughout resurrection
- No external orchestration needed
- Natural recovery path matches SDK reconnection expectations
- Simpler code (removed ~60 lines from AppsManager)

#### 3. Enhanced handleConnection for Resurrection

```typescript
async handleConnection(ws: WebSocket, initMessage: unknown): Promise<void> {
  // Check if this is a reconnection during grace period OR resurrection
  const isReconnection =
    this.state === AppConnectionState.GRACE_PERIOD ||
    this.state === AppConnectionState.RESURRECTING;

  if (isReconnection) {
    // Cancel timers
    if (this.graceTimer) { clearTimeout(this.graceTimer); }
    if (this.connectionTimer) { clearTimeout(this.connectionTimer); }

    // Track successful resurrection
    if (this.state === AppConnectionState.RESURRECTING) {
      PosthogService.trackEvent("app_resurrection_success", ...);
    }
  }

  // ... rest of connection handling
}
```

#### 4. Adjusted Timeouts

**Final Configuration:**

```typescript
const WEBHOOK_TIMEOUT_MS = 5000 // 5s - reasonable for webhook HTTP response
const CONNECTION_TIMEOUT_MS = 7000 // 7s - allows 5s webhook + 2s WS handshake
```

**Reasoning:**

- 5 seconds is reasonable for HTTP webhook response (production apps should be fast)
- 7 seconds total allows for webhook delay + WebSocket handshake
- Still "fail fast" but tolerates real-world network latency
- Registry persistence handles late connections beyond these timeouts

**Comparison:**
| System | Webhook Timeout | Connection Timeout | Total Max |
|--------|----------------|-------------------|-----------|
| Legacy | 10s | 5s (after webhook) | 15s |
| Initial New | 3s ❌ | 5s (parallel) | 5s |
| **Final New** | **5s** ✅ | **7s** (parallel) | **7s** |

#### 5. Simplified stop() Method

**Removed `restart` parameter:**

```typescript
// OLD
async stop(restart?: boolean): Promise<void> {
  this.state = restart ? AppConnectionState.RESURRECTING : AppConnectionState.STOPPING;
  // ... different tracking based on restart flag
}

// NEW
async stop(): Promise<void> {
  this.state = AppConnectionState.STOPPING;
  // ... always track as "app_stop"
  // Resurrection is tracked separately on successful reconnection
}
```

---

## State Machine

### AppConnectionState Enum

```typescript
enum AppConnectionState {
  DISCONNECTED = "disconnected", // Not connected
  CONNECTING = "connecting", // Initial connection in progress
  RUNNING = "running", // Active WebSocket connection
  GRACE_PERIOD = "grace_period", // Waiting for SDK reconnection (5s)
  RESURRECTING = "resurrecting", // System restarting app (self-healing)
  STOPPING = "stopping", // User/system initiated stop
}
```

### State Transitions

```
Initial Start:
  DISCONNECTED → CONNECTING → RUNNING

Normal Disconnection (Grace Period):
  RUNNING → GRACE_PERIOD → (reconnects) → RUNNING

Failed Grace Period (Resurrection):
  RUNNING → GRACE_PERIOD → RESURRECTING → (reconnects) → RUNNING

Failed Resurrection:
  RESURRECTING → (timeout) → DISCONNECTED

User Stop:
  RUNNING → STOPPING → DISCONNECTED
```

### Message Sending During States

```typescript
async sendMessage(message: any) {
  if (this.state === AppConnectionState.GRACE_PERIOD) {
    return { sent: false, error: "Connection lost, waiting for reconnection" };
  }

  if (this.state === AppConnectionState.RESURRECTING) {
    return { sent: false, error: "App is restarting" };
  }

  if (this.state === AppConnectionState.STOPPING) {
    return { sent: false, error: "App is being stopped" };
  }

  // ... send message
}
```

---

## Implementation Summary

### Files Changed

1. **AppSession.ts**
   - Removed `appsManager` field dependency
   - Implemented self-healing `triggerResurrection()`
   - Enhanced `handleConnection()` to detect resurrection reconnections
   - Simplified `stop()` method (removed restart parameter)
   - Adjusted timeouts (5s webhook, 7s connection)
   - Added PostHog tracking for resurrection success/failure

2. **AppsManager.ts**
   - Removed `handleResurrection()` method entirely (~60 lines deleted)
   - Updated `startApp()` to keep sessions in registry on failure
   - Updated `stopApp()` to not pass restart flag
   - Updated `AppSessionI` interface to remove restart parameter

3. **websocket-glasses.service.ts**
   - No changes needed (immediate call to `handleConnectionInit` is correct for header-based auth)
   - Old CONNECTION_INIT message handler remains for backwards compatibility

### Code Statistics

- **Lines removed**: ~80 lines (AppsManager.handleResurrection + complexity)
- **Lines added**: ~70 lines (self-healing resurrection logic)
- **Net change**: Simpler, more robust architecture

---

## Testing Scenarios

### Scenario 1: Normal Start (Fast Connection)

**Expected:**

1. Mobile calls `/start` endpoint
2. Cloud triggers webhook (< 1s)
3. App connects via WebSocket (< 1s)
4. State: CONNECTING → RUNNING
5. Duration: ~1-2 seconds total

### Scenario 2: Slow Start (Laptop Waking from Sleep)

**Expected:**

1. Mobile calls `/start` endpoint
2. Cloud triggers webhook
3. Laptop is slow, webhook takes 4s
4. Webhook times out at 5s (or succeeds at 4s)
5. **AppSession stays in registry** ✅
6. App connects at 4.5s
7. `handleConnection()` finds session and accepts it ✅
8. State: CONNECTING → RUNNING
9. Duration: ~4-5 seconds total

### Scenario 3: Grace Period Reconnection

**Expected:**

1. App is running
2. Network disconnects (code 1006)
3. State: RUNNING → GRACE_PERIOD
4. App reconnects within 5s
5. State: GRACE_PERIOD → RUNNING
6. No webhook sent, seamless reconnection ✅

### Scenario 4: Resurrection (Failed Grace Period)

**Expected:**

1. App is running
2. Network disconnects
3. State: RUNNING → GRACE_PERIOD
4. 5 seconds pass with no reconnection
5. State: GRACE_PERIOD → RESURRECTING
6. `triggerResurrection()` sends new webhook
7. App reconnects within 7s
8. `handleConnection()` recognizes RESURRECTING state
9. PostHog tracks "app_resurrection_success"
10. State: RESURRECTING → RUNNING
11. Duration: 5s grace + ~2s resurrection = ~7s

### Scenario 5: Failed Resurrection

**Expected:**

1. Resurrection triggered
2. Webhook fails or times out
3. No connection within 7s
4. State: RESURRECTING → DISCONNECTED
5. AppSession stays in registry ✅
6. PostHog tracks "app_resurrection_failed"
7. User can manually restart app

### Scenario 6: Multiple Start Calls (Idempotent)

**Expected:**

1. Call `/start` for app
2. Call `/start` again while CONNECTING
3. `AppsManager.startApp()` checks registry
4. Returns `{ success: true }` immediately (idempotent)
5. No duplicate sessions created ✅

---

## Known Issues & Future Work

### Issue 1: SDK Webhook Handler Blocks on Connection

**Problem**: The SDK's `handleSessionRequest` waits for WebSocket connection before returning HTTP 200, creating a circular dependency.

**Impact**: Apps on slow networks race against timeouts. Our fixes (registry persistence + adjusted timeouts) mitigate this but don't solve the root cause.

**Future Fix**: SDK should return HTTP 200 immediately and connect asynchronously:

```typescript
// PROPOSED SDK FIX
private async handleSessionRequest(request, res): Promise<void> {
  const session = new AppSession({...});

  // Return immediately
  res.status(200).json({ status: "success" });

  // Connect asynchronously
  session.connect(sessionId)
    .then(() => {
      this.activeSessions.set(sessionId, session);
      this.onSession(session, sessionId, userId);
    })
    .catch(error => {
      this.logger.error(error, "Failed to connect after webhook");
    });
}
```

**Tracking**: Create separate issue for SDK refactor

### Issue 2: UserSession Initialization Timing

**Context**: When mobile client reconnects (e.g., after laptop sleep), `startPreviouslyRunningApps()` is called immediately during connection initialization.

**Current Behavior**: This is correct for header-based auth (new way). The old CONNECTION_INIT message handler is for backwards compatibility.

**No Action Needed**: Working as designed.

### Issue 3: isAppRunning() Bridge to Legacy State

**Current Implementation:**

```typescript
isAppRunning(packageName: string): boolean {
  // Bridge to legacy state during migration
  return this.userSession.runningApps.has(packageName);
}
```

**Future**: Once migration is complete, use `AppSession.isRunning()` directly:

```typescript
isAppRunning(packageName: string): boolean {
  const session = this.appSessions.get(packageName);
  return session?.isRunning() ?? false;
}
```

**Note**: Apps in RESURRECTING state would show as "not running" which may confuse users. Consider adding a "reconnecting" state in the UI.

---

## Migration Notes

### Backwards Compatibility

- ✅ Old CONNECTION_INIT message handler still works
- ✅ Existing apps continue to function
- ✅ No database schema changes required
- ✅ No mobile client changes required

### Deployment Steps

1. Deploy cloud changes
2. Restart cloud containers to pick up new code
3. Monitor PostHog for resurrection success/failure rates
4. Monitor logs for "keeping in registry for potential late connection"
5. If issues arise, timeouts can be adjusted via environment variables (future enhancement)

### Rollback Plan

If critical issues are discovered:

1. Revert `AppsManager.startApp()` to delete sessions on failure
2. Revert timeouts to 3s webhook / 5s connection
3. Re-add `AppsManager.handleResurrection()` method
4. Revert `AppSession.stop()` to accept restart parameter

All changes are isolated to AppSession/AppsManager classes.

---

## Metrics & Observability

### PostHog Events

**New Events:**

- `app_resurrection_success` - App successfully reconnected during resurrection
  - Fields: `packageName`, `userId`, `sessionId`, `resurrectionDuration`
- `app_resurrection_failed` - Resurrection timed out or failed
  - Fields: `packageName`, `userId`, `sessionId`, `reason`

**Existing Events:**

- `app_start` - App successfully started
- `app_stop` - App stopped by user

### Logs to Monitor

**Success Indicators:**

```
"Session start failed, but keeping in registry for potential late connection"
"App reconnected during resurrecting!"
"✅ App resurrection successful"
```

**Failure Indicators:**

```
"Resurrection timeout - app did not reconnect"
"❌ App resurrection failed"
"No AppSession found for handleAppInit"  ← Should be rare now!
```

### Dashboard Queries

**Resurrection Success Rate:**

```
(app_resurrection_success) / (app_resurrection_success + app_resurrection_failed) * 100
```

**Late Connection Rate:**

```
Count of "keeping in registry for potential late connection" log entries
```

**Average Resurrection Duration:**

```
AVG(app_resurrection_success.resurrectionDuration)
```

---

## Performance Impact

### Memory

- **Before**: AppSession deleted on failure (freed memory)
- **After**: AppSession kept in registry (small memory increase)
- **Impact**: Negligible (AppSession is ~1KB, max ~10-20 failed sessions per user)

### Network

- **No change**: Same number of webhook calls and WebSocket connections

### Database

- **Slight reduction**: Fewer DB writes for removing/re-adding running apps during resurrection

---

## Questions & Decisions

### Q: Should apps show as "running" during resurrection?

**Current**: Apps are removed from `runningApps` during resurrection, so `getAppsForHomeScreen()` shows them as not running.

**Options:**

- A) Show as stopped (current behavior)
- B) Show as running with "reconnecting" indicator
- C) New state "restarting" in UI

**Decision**: Keep current behavior (A) for now. Future enhancement can add visual indicator.

### Q: What if resurrection fails repeatedly?

**Current**: App transitions to DISCONNECTED. User must manually restart.

**Future Enhancement**: Add retry logic with exponential backoff (e.g., try 3 times over 5 minutes).

### Q: Should webhook timeout be configurable?

**Current**: Hardcoded to 5 seconds.

**Future Enhancement**: Add environment variable `APP_WEBHOOK_TIMEOUT_MS` for flexibility.

---

## Conclusion

The self-healing AppSession architecture provides a more robust, simpler, and more maintainable approach to app lifecycle management. By keeping sessions in the registry and allowing AppSession to manage its own resurrection, we eliminate race conditions and orphaned sessions while providing better tolerance for real-world network latency.

**Key Wins:**

- ✅ No more orphaned sessions in RESURRECTING state
- ✅ Late connections work (flash app on slow laptop)
- ✅ Simpler code (~10 net lines removed)
- ✅ Self-healing without external orchestration
- ✅ Better observability (PostHog resurrection tracking)

**Next Steps:**

1. Deploy and monitor resurrection metrics
2. File SDK issue for non-blocking webhook handler
3. Consider UI enhancements for "reconnecting" state
4. Add configurable timeout environment variables
