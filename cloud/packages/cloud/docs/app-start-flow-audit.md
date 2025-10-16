# App Start Flow Audit & Performance Analysis

**Created:** 2024
**Purpose:** Document complete app start flow from API → SDK → Cloud, identify bottlenecks, and guide optimization
**Status:** 🔍 Audit Phase - Profiling logs to be added

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Complete Flow Diagram](#complete-flow-diagram)
3. [Phase-by-Phase Breakdown](#phase-by-phase-breakdown)
4. [Database Calls Audit](#database-calls-audit)
5. [Network Calls Audit](#network-calls-audit)
6. [Profiling Log Strategy](#profiling-log-strategy)
7. [Timing Expectations](#timing-expectations)
8. [Actual Timing Data](#actual-timing-data)
9. [Bottleneck Analysis](#bottleneck-analysis)
10. [Recommendations](#recommendations)

---

## 🎯 Executive Summary

### Current State

- **Entry Point:** `POST /apps/:packageName/start` (deprecated route)
- **Target Location:** `src/api/client/apps.api.ts` (to be created)
- **Total DB Calls:** 8 (6 reads, 2 writes)
- **Network Calls:** 1 HTTP webhook + 1 WebSocket connection
- **Estimated Total Time:** 500-2000ms (highly variable)

### Key Issues Identified

1. ❌ **Duplicate DB calls** - App details fetched twice
2. ❌ **Blocking operations** - `updateAppLastActive` blocks start
3. ❌ **Sequential execution** - No parallelization opportunities used
4. ⚠️ **Webhook variability** - External HTTP call blocks entire flow

### Quick Wins

- Make `updateAppLastActive` async (save ~50-200ms)
- Eliminate duplicate `getApp()` call (save ~10-50ms)
- Cache app type for foreground checks (save ~10-30ms)

---

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. CLIENT REQUEST                                                    │
│    POST /apps/:packageName/start                                     │
│    └─ apps.routes.ts:startApp()                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. ROUTE HANDLER (apps.routes.ts)                                   │
│    ├─ Validate session                                              │
│    ├─ 🗄️ DB CALL #1: appService.getApp(packageName)                │
│    │   └─ Purpose: Validate app exists                              │
│    │   └─ Expected: 10-50ms                                         │
│    └─ Call AppManager.startApp(packageName)                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. APP MANAGER START (AppManager.ts:237)                            │
│    ├─ Check if already running (in-memory)                          │
│    ├─ 🗄️ DB CALL #2: appService.getApp(packageName) [DUPLICATE!]   │
│    │   └─ Purpose: Get app details                                  │
│    │   └─ Expected: 10-50ms                                         │
│    │   └─ ❌ WASTE: Already fetched in route handler                │
│    ├─ Check hardware compatibility (in-memory)                      │
│    │   └─ Expected: <1ms                                            │
│    ├─ If STANDARD app:                                              │
│    │   ├─ 🗄️ DB CALL #3: App.find({ appType: STANDARD })           │
│    │   │   └─ Purpose: Find other foreground apps                   │
│    │   │   └─ Expected: 10-30ms                                     │
│    │   └─ If found, stop foreground app (recursive)                 │
│    ├─ 🗄️ DB CALL #4+5: updateAppLastActive()                       │
│    │   ├─ User.findByEmail(userId)                                  │
│    │   │   └─ Expected: 20-100ms                                    │
│    │   ├─ user.updateAppLastActive() + save()                       │
│    │   │   └─ Expected: 30-100ms                                    │
│    │   │   └─ Has retry logic (3 attempts with backoff!)            │
│    │   └─ ❌ BLOCKS: Should be async/fire-and-forget                │
│    ├─ Create pending connection promise                             │
│    └─ triggerAppWebhookInternal()                                   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. WEBHOOK TRIGGER (AppManager.ts:507)                              │
│    ├─ displayManager.handleAppStart() (boot screen)                 │
│    │   └─ Expected: <5ms                                            │
│    ├─ 🌐 HTTP POST: app.publicUrl/webhook                           │
│    │   └─ Purpose: Notify app to connect                            │
│    │   └─ Expected: 100-500ms (network + app cold start)            │
│    │   └─ ⚠️ VARIABLE: Depends on app server location/load          │
│    │   └─ Has retry logic (2 attempts with 1s delay)                │
│    └─ Wait for app WebSocket connection (timeout: 30s)              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. APP SERVER (SDK Side)                                            │
│    ├─ Receives webhook                                              │
│    ├─ SDK: AppSession.connect()                                     │
│    │   ├─ Parse webhook payload                                     │
│    │   ├─ Initialize WebSocket connection                           │
│    │   └─ Expected: 50-200ms                                        │
│    └─ 🌐 WS CONNECT: wss://cloud/app-ws                             │
│        └─ Send APP_CONNECTION_INIT message                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 6. APP INIT (AppManager.ts:842)                                     │
│    ├─ Receive APP_CONNECTION_INIT                                   │
│    ├─ 🗄️ DB CALL #6: developerService.validateApiKey()             │
│    │   └─ Internally: App.findOne({ packageName })                  │
│    │   └─ Purpose: Security check                                   │
│    │   └─ Expected: 10-30ms                                         │
│    ├─ Store WebSocket connection (in-memory)                        │
│    ├─ Setup heartbeat                                               │
│    ├─ 🗄️ DB CALL #7: User.findOrCreateUser()                       │
│    │   └─ Purpose: Get user settings                                │
│    │   └─ Expected: 20-100ms                                        │
│    ├─ 🗄️ DB CALL #8: user.addRunningApp() + save()                 │
│    │   └─ Purpose: Update user.runningApps array                    │
│    │   └─ Expected: 30-100ms                                        │
│    │   └─ ❌ BLOCKS: Could be async                                 │
│    ├─ Send CONNECTION_ACK to app                                    │
│    │   └─ Includes: settings, augmentosSettings, capabilities       │
│    │   └─ Expected: <5ms                                            │
│    ├─ Resolve pending connection promise                            │
│    └─ broadcastAppState() to client                                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 7. APP FULLY STARTED                                                │
│    ├─ App in userSession.runningApps                                │
│    ├─ App WebSocket connected                                       │
│    ├─ App receiving data streams                                    │
│    └─ Client receives APP_STATE_CHANGE                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Phase-by-Phase Breakdown

### Phase 1: Route Entry (apps.routes.ts)

**Location:** `cloud/packages/cloud/src/routes/apps.routes.ts:666`

**Operations:**

- Validate userSession exists
- DB: Fetch app to validate existence
- Delegate to AppManager

**Expected Duration:** 10-50ms (mostly DB query)

**Profiling Logs:**

```typescript
{
  feature: "app-start",
  phase: "route-entry",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "db-query-start",
  query: "appService.getApp",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "db-query-complete",
  query: "appService.getApp",
  duration: ms,
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "appmanager-start",
  timestamp: Date.now()
}
```

---

### Phase 2: App Manager Validation (AppManager.ts:237)

**Location:** `cloud/packages/cloud/src/services/session/AppManager.ts`

**Operations:**

- Check if already running (in-memory check)
- DB: Fetch app details (DUPLICATE!)
- Hardware compatibility check
- Foreground app conflict resolution
- Update lastActive timestamp (BLOCKING!)

**Expected Duration:** 50-300ms (variable based on conflicts)

**Profiling Logs:**

```typescript
{
  feature: "app-start",
  phase: "manager-entry",
  timestamp: Date.now(),
  runningApps: []
}

{
  feature: "app-start",
  phase: "db-query-start",
  query: "appService.getApp",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "compatibility-check-start",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "foreground-check-start",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "lastactive-update-start",
  timestamp: Date.now()
}
```

---

### Phase 3: Webhook Trigger (AppManager.ts:507)

**Location:** `cloud/packages/cloud/src/services/session/AppManager.ts:507`

**Operations:**

- Display boot screen
- HTTP POST to app webhook
- Wait for app to connect

**Expected Duration:** 100-500ms (highly variable)

**Profiling Logs:**

```typescript
{
  feature: "app-start",
  phase: "webhook-prepare",
  timestamp: Date.now(),
  webhookUrl: string
}

{
  feature: "app-start",
  phase: "webhook-request-start",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "webhook-request-complete",
  duration: ms,
  timestamp: Date.now(),
  statusCode: number
}
```

---

### Phase 4: SDK Connection (SDK Side)

**Location:** SDK `packages/sdk/src/app/session/AppSession.ts`

**Operations:**

- Parse webhook payload
- Initialize AppSession
- Establish WebSocket connection
- Send APP_CONNECTION_INIT

**Expected Duration:** 50-200ms

**Profiling Logs (SDK):**

```typescript
{
  feature: "app-start",
  phase: "sdk-webhook-received",
  timestamp: Date.now(),
  packageName: string
}

{
  feature: "app-start",
  phase: "sdk-ws-connecting",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "sdk-ws-connected",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "sdk-init-sent",
  timestamp: Date.now()
}
```

---

### Phase 5: App Init & Auth (AppManager.ts:842)

**Location:** `cloud/packages/cloud/src/services/session/AppManager.ts:842`

**Operations:**

- Validate API key (DB query)
- Store WebSocket connection
- Fetch user settings (DB query)
- Update user.runningApps (DB write)
- Send CONNECTION_ACK

**Expected Duration:** 60-230ms

**Profiling Logs:**

```typescript
{
  feature: "app-start",
  phase: "app-init-start",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "apikey-validation-start",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "db-query-start",
  query: "User.findOrCreateUser",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "db-write-start",
  query: "user.addRunningApp",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "connection-ack-sent",
  timestamp: Date.now()
}

{
  feature: "app-start",
  phase: "app-start-complete",
  duration: totalMs,
  timestamp: Date.now()
}
```

---

### Phase 6: SDK Receives ACK (SDK Side)

**Location:** SDK `packages/sdk/src/app/session/AppSession.ts`

**Operations:**

- Receive CONNECTION_ACK
- Store settings
- Emit 'connected' event
- Ready to receive data streams

**Expected Duration:** <5ms

**Profiling Logs (SDK):**

```typescript
{
  feature: "app-start",
  phase: "sdk-ack-received",
  timestamp: Date.now(),
  totalDuration: ms
}
```

---

## 🗄️ Database Calls Audit

| #     | Phase   | Location           | Call                                | Purpose                 | Duration | Cacheable?    | Notes                    |
| ----- | ------- | ------------------ | ----------------------------------- | ----------------------- | -------- | ------------- | ------------------------ |
| **1** | Route   | apps.routes.ts:713 | `appService.getApp()`               | Validate app exists     | 10-50ms  | ✅ YES        | Could pass to AppManager |
| **2** | Manager | AppManager.ts:260  | `appService.getApp()`               | Get app config          | 10-50ms  | ✅ YES        | **DUPLICATE!**           |
| **3** | Manager | AppManager.ts:318  | `App.find({ appType: STANDARD })`   | Find foreground apps    | 10-30ms  | ⚠️ PARTIAL    | Could cache app types    |
| **4** | Manager | AppManager.ts:478  | `User.findByEmail()`                | Get user for lastActive | 20-100ms | ⚠️ MAYBE      | For timestamp only       |
| **5** | Manager | AppManager.ts:479  | `user.updateAppLastActive()`        | Update timestamp        | 30-100ms | ❌ NO (write) | **BLOCKS - make async!** |
| **6** | Init    | AppManager.ts:851  | `developerService.validateApiKey()` | Security check          | 10-30ms  | ⚠️ MAYBE      | Internally fetches app   |
| **7** | Init    | AppManager.ts:959  | `User.findOrCreateUser()`           | Get user settings       | 20-100ms | ⚠️ MAYBE      | Could cache settings     |
| **8** | Init    | AppManager.ts:999  | `user.addRunningApp()`              | Update running apps     | 30-100ms | ❌ NO (write) | Could be async           |

**Total DB Time:** 140-560ms (highly variable)

### Critical Issues:

1. **Duplicate App Fetch** (#1 and #2) - Wastes 10-50ms
2. **Blocking lastActive Update** (#4 and #5) - Wastes 50-200ms
3. **Sequential Execution** - No parallelization

### Optimization Opportunities:

- ✅ Pass app object from route to manager (save 10-50ms)
- ✅ Make lastActive update async (save 50-200ms)
- ✅ Make addRunningApp async (save 30-100ms)
- ⚠️ Cache app types in-memory (save 10-30ms)
- ⚠️ Cache user settings at session start (save 20-100ms)

---

## 🌐 Network Calls Audit

| #     | Phase    | Type       | Destination             | Purpose                  | Duration  | Retry Logic           |
| ----- | -------- | ---------- | ----------------------- | ------------------------ | --------- | --------------------- |
| **1** | Webhook  | HTTP POST  | `app.publicUrl/webhook` | Notify app to connect    | 100-500ms | 2 attempts, 1s delay  |
| **2** | SDK Init | WS Connect | `wss://cloud/app-ws`    | Establish app connection | 50-200ms  | SDK handles reconnect |

**Total Network Time:** 150-700ms (highly variable)

### Variability Factors:

- App server location (latency)
- App server cold start time
- Network conditions
- WebSocket proxy overhead

### Cannot Optimize:

- External HTTP call is unavoidable
- WebSocket connection is required
- These are inherent architectural delays

---

## 📝 Profiling Log Strategy

### Log Format Standard

All app-start logs MUST include:

```typescript
{
  feature: "app-start",           // REQUIRED: Filter in BetterStack
  phase: "phase-name",             // REQUIRED: Identifies step
  timestamp: Date.now(),           // REQUIRED: Absolute time
  duration?: number,               // OPTIONAL: For complete phases
  packageName?: string,            // OPTIONAL: App being started
  userId?: string,                 // OPTIONAL: User context
  query?: string,                  // OPTIONAL: For DB calls
  // ... phase-specific fields
}
```

### Phase Names (Complete List)

```typescript
// Route Handler
"route-entry"
"db-query-start" + query: "appService.getApp"
"db-query-complete" + query: "appService.getApp"
"appmanager-start"
"appmanager-complete"
"broadcast-start"
"broadcast-complete"
"route-complete"

// App Manager
"manager-entry"
"already-running"
"compatibility-check-start"
"compatibility-check-complete"
"foreground-check-start"
"foreground-app-stopped"
"foreground-check-complete"
"lastactive-update-start"
"pending-connection-created"
"webhook-trigger-start"

// Webhook
"webhook-prepare"
"webhook-request-start"
"webhook-request-complete"

// App Init
"app-init-start"
"apikey-validation-start"
"apikey-validation-complete"
"connection-ack-sent"
"db-write-start" + query: "user.addRunningApp"
"db-write-complete" + query: "user.addRunningApp"
"app-start-complete"

// SDK (to be added)
"sdk-webhook-received"
"sdk-ws-connecting"
"sdk-ws-connected"
"sdk-init-sent"
"sdk-ack-received"

// Errors
"app-not-found"
"incompatible-hardware"
"apikey-invalid"
"connection-timeout"
"db-query-error"
"db-write-error"
```

### BetterStack Query

```
feature:"app-start" packageName:"com.example.app"
```

Sort by `timestamp` to see complete timeline.

---

## ⏱️ Timing Expectations

### Ideal Scenario (Everything Fast)

```
Route Entry:           10ms
Manager Validation:    50ms
Webhook:              100ms
SDK Connection:        50ms
App Init:              60ms
─────────────────────────
TOTAL:                270ms ⚡️
```

### Typical Scenario (Normal Conditions)

```
Route Entry:           30ms
Manager Validation:   150ms
Webhook:              300ms
SDK Connection:       100ms
App Init:             100ms
─────────────────────────
TOTAL:                680ms ✅
```

### Worst Case (Slow DB + Network)

```
Route Entry:           50ms
Manager Validation:   300ms
Webhook:              500ms
SDK Connection:       200ms
App Init:             230ms
─────────────────────────
TOTAL:               1280ms ⚠️
```

### After Optimizations (Target)

```
Route Entry:           10ms  (pass app object)
Manager Validation:    20ms  (async lastActive)
Webhook:              300ms  (unavoidable)
SDK Connection:       100ms  (unavoidable)
App Init:              40ms  (async addRunningApp)
─────────────────────────
TOTAL:                470ms 🚀 (save ~210ms!)
```

---

## 📈 Actual Timing Data

**Status:** ✅ Data collected from BetterStack (Oct 9, 2025)

### Real Data: com.mentra.translation

```
App: com.mentra.translation
Date: Oct 9, 2025 at 10:49:09pm PDT
Environment: isaiah (local dev)
Total Duration: 908ms

Phase Breakdown:
- Route Entry: ~1ms (route-entry to db-query-start)
- DB Query #1 (getApp): 142ms ⚠️ SLOW
- AppManager: 765ms ⚠️ VERY SLOW
- Broadcast: 0ms
- Route Overhead: ~1ms

Key Observations:
- Total time: 908ms (within "typical" range)
- DB fetch of app: 142ms (SLOWER than expected 10-50ms!)
- AppManager.startApp: 765ms (contains webhook + app connection)
- Broadcast: instant (0ms)

Missing Granular Data:
- No logs inside AppManager (need to add profiling there)
- Can't see webhook timing
- Can't see SDK connection timing
- Can't see individual DB calls inside AppManager
```

### Analysis

**What we learned:**

1. **Route Handler is Fast** ✅
   - Overhead: ~2ms total (excluding DB/AppManager)
   - Efficient request processing

2. **DB Query is Slow** ⚠️
   - `appService.getApp()`: 142ms (expected 10-50ms)
   - Possible causes:
     - Local dev environment (slower DB)
     - Cold MongoDB connection
     - Large app document
     - Index missing?

3. **AppManager is a Black Box** 🔍
   - 765ms total (84% of request time!)
   - Need more granular logs to understand:
     - How much is webhook? (expected 100-500ms)
     - How much is SDK connection? (expected 50-200ms)
     - How much is DB operations? (expected 100-300ms)
     - Breakdown: validation + webhook + init

4. **Broadcast is Instant** ✅
   - 0ms to broadcast app state
   - Efficient WebSocket send

### Next Steps

1. **Add AppManager profiling logs** 🎯
   - Log webhook timing
   - Log SDK connection received
   - Log DB calls inside AppManager
   - Log API key validation
   - Log user settings fetch

2. **Investigate slow DB query** 🔍
   - Why is `getApp()` taking 142ms?
   - Check MongoDB indexes
   - Compare prod vs dev timing

3. **Run again with full logs** 🔄
   - Get complete breakdown of 765ms
   - Identify actual bottlenecks
   - Calculate savings from optimizations

### Timing Comparison

| Metric          | Expected        | Actual | Status            |
| --------------- | --------------- | ------ | ----------------- |
| **Total**       | 680ms (typical) | 908ms  | ⚠️ Slower         |
| **Route Entry** | 30ms            | ~142ms | ⚠️ DB slow        |
| **AppManager**  | 150-300ms       | 765ms  | ❌ Need breakdown |
| **Broadcast**   | <5ms            | 0ms    | ✅ Great          |

**Conclusion:** Need more granular AppManager logs to identify the 765ms breakdown!

---

## 🔍 Bottleneck Analysis

### Confirmed Bottlenecks

#### 1. Duplicate App Fetch ❌

**Impact:** 10-50ms wasted
**Location:** Route handler + AppManager
**Root Cause:** No object passing between functions
**Fix:** Pass app object from route to AppManager

```typescript
// Before
await appManager.startApp(packageName);

// After
await appManager.startApp(packageName, app);
```

#### 2. Blocking lastActive Update ❌

**Impact:** 50-200ms wasted
**Location:** AppManager.ts:478
**Root Cause:** Awaited DB write for non-critical timestamp
**Fix:** Fire-and-forget async

```typescript
// Before
await this.updateAppLastActive(packageName);

// After
this.updateAppLastActiveAsync(packageName); // no await
```

#### 3. Blocking addRunningApp ❌

**Impact:** 30-100ms wasted
**Location:** AppManager.ts:999
**Root Cause:** Awaited DB write during connection
**Fix:** Make async or update on session end only

#### 4. Sequential DB Operations ⚠️

**Impact:** Variable
**Location:** Throughout flow
**Root Cause:** No parallelization
**Fix:** Batch reads where possible

#### 5. Webhook Latency ⏳

**Impact:** 100-500ms (unavoidable)
**Location:** External HTTP call
**Root Cause:** Network + app cold start
**Fix:** Cannot optimize (architectural)

---

## 💡 Recommendations

### Phase 1: Quick Wins (Minimal Code Changes) 🏃

**Estimated Total Savings:** 90-350ms

1. **Pass App Object** (save 10-50ms)

   ```typescript
   // apps.routes.ts
   const app = await appService.getApp(packageName);
   await userSession.appManager.startApp(packageName, app);
   ```

2. **Async lastActive** (save 50-200ms)

   ```typescript
   // AppManager.ts
   this.updateAppLastActiveAsync(packageName).catch((err) =>
     logger.warn({ err }, "Failed to update lastActive"),
   );
   ```

3. **Async addRunningApp** (save 30-100ms)
   ```typescript
   // AppManager.ts handleAppInit
   this.addRunningAppAsync(user, packageName).catch((err) =>
     logger.warn({ err }, "Failed to update runningApps"),
   );
   ```

### Phase 2: AppSession Refactor 🏗️

**Goal:** Cleaner architecture, easier to optimize

Create `AppSession` class to encapsulate per-app state:

```typescript
class AppSession {
  public readonly packageName: string;
  public readonly userSession: UserSession;
  public websocket?: WebSocket;
  public state: AppConnectionState;

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async handleMessage(msg: any): Promise<void> {}
}
```

AppManager becomes a registry:

```typescript
class AppManager {
  private sessions: Map<string, AppSession> = new Map();

  async startApp(packageName: string): Promise<void> {
    let session = this.sessions.get(packageName);
    if (!session) {
      session = new AppSession(packageName, this.userSession);
      this.sessions.set(packageName, session);
    }
    await session.start();
  }
}
```

### Phase 3: Caching Layer 📦

**Goal:** Eliminate redundant DB reads

Cache at session init:

```typescript
class UserSession {
  private appDetailsCache: Map<string, AppI> = new Map();
  private userSettingsCache: Map<string, any> = new Map();

  async init() {
    // Load user settings once
    const user = await User.findOne({ email: this.userId });
    user.appSettings.forEach((settings, pkg) => {
      this.userSettingsCache.set(pkg, settings);
    });

    // Load installed app details once
    const apps = await App.find({
      packageName: { $in: this.installedApps.keys() },
    });
    apps.forEach((app) => {
      this.appDetailsCache.set(app.packageName, app);
    });
  }
}
```

**Caveat:** Need invalidation strategy for dev console updates!

### Phase 4: New API Endpoint 🚀

**Goal:** Modern REST API structure

Create `src/api/client/apps.api.ts`:

```typescript
POST   /api/client/apps/:packageName/start
POST   /api/client/apps/:packageName/stop
GET    /api/client/apps
GET    /api/client/apps/:packageName
PATCH  /api/client/apps/:packageName/settings
```

Benefits:

- Consistent with other client APIs
- Uses `clientAuthWithUserSession` middleware
- Easier to version and deprecate old routes

---

## 📚 Appendix

### Related Documents

- [CalendarManager Refactor](../src/api/client/docs/design-calendar-manager.md)
- [LocationManager Refactor](../src/api/client/docs/design-location-manager.md)

### Code Locations

- Route: `cloud/packages/cloud/src/routes/apps.routes.ts:666`
- AppManager: `cloud/packages/cloud/src/services/session/AppManager.ts`
- SDK AppSession: `cloud/packages/sdk/src/app/session/AppSession.ts`

### Test Plan

1. Add profiling logs (with `feature: "app-start"`)
2. Start apps in dev/staging
3. Collect timing data from BetterStack
4. Implement quick wins
5. Measure improvement
6. Plan Phase 2 refactor

---

**Status:** 🔍 Ready for profiling log implementation
**Next Steps:** Add logs to code → Start app → Analyze BetterStack data → Update this doc
