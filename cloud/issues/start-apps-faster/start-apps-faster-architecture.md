# Start Apps Faster — Architecture

Cut app start time by >2x by removing blocking DB calls from the hot path, failing fast on webhook errors, and extracting per-app lifecycle into an `AppSession` managed by a lightweight `AppManager`.

---

## 1) Current System

### 1.1 Request/Message Flow (today)

```
Client (HTTP) → POST /apps/:packageName/start
  → routes/apps.routes.ts
    → AppManager.startApp(packageName)
      - DB: appService.getApp(packageName)            (duplicate of route in many cases)
      - Foreground check via App.find(...)            (DB)
      - Update lastActive via User.findByEmail + user.updateAppLastActive() (DB, has retries)
      - Create pending entry + trigger webhook (HTTP)
      - Wait for app to connect (timeout 5s)
  ↓
App Server (connects via /app-ws)
  → AppManager.handleAppInit(ws, initMessage)
      - developerService.validateApiKey(...)          (DB / external)
      - User.findOrCreateUser(...)                    (DB) to produce CONNECTION_ACK settings
      - user.addRunningApp(packageName)               (DB, has retries)
      - Send CONNECTION_ACK to App
  ↓
AppManager.broadcastAppState()
  - refreshInstalledApps() → appService.getAllApps(userId) (DB)
```

### 1.2 Key Code Paths

- routes
  - `cloud/packages/cloud/src/routes/apps.routes.ts`
- manager
  - `cloud/packages/cloud/src/services/session/AppManager.ts`
- session
  - `cloud/packages/cloud/src/services/session/UserSession.ts`

### 1.3 Blocking DB Calls in the Hot Path

- Start path (HTTP):
  - `appService.getApp(packageName)` (often duplicated w/ route-level fetch)
  - `App.find({ packageName: { $in: runningApps }, appType: STANDARD })` (foreground/conflict check)
  - `User.findByEmail(userId)` + `user.updateAppLastActive(packageName)` (with retry loop)
- Init path (WS):
  - `developerService.validateApiKey(...)`
  - `User.findOrCreateUser(userId)` (to compute ACK settings)
  - `user.addRunningApp(packageName)` (with retry loop)
- Broadcast path:
  - `appService.getAllApps(userId)` inside `broadcastAppState()` via `refreshInstalledApps()`

Result: ~6+ blocking DB calls on the critical path; webhook has retries + long timeouts → slow starts and very slow failure cases.

---

## 2) Problems

- Latency:
  - p95 ~765ms on “happy” path (measurement via existing logs).
  - Worst-case failure (webhook retries + backoff) → 10–23s before error.
- Redundant work:
  - Duplicate `getApp` lookups (route + manager).
  - Foreground checks via DB when in-session state can be used.
- Wrong place to refresh:
  - `broadcastAppState()` refreshes installed apps from DB every call (hot path).
- Design friction:
  - Monolithic `AppManager` owns lifecycle/state for all apps; state spread across multiple maps → hard to evolve/test.

---

## 3) Proposed System

### 3.1 High-Level Design

```
AppManager (orchestrator / registry)
  - sessions: Map<packageName, AppSession>
  - start/stop delegate to AppSession
  - handleAppInit delegates to AppSession
  - broadcast uses session cache (no DB calls)

AppSession (per-app lifecycle & state)
  - start(): trigger webhook (fail fast), create pending, timeout
  - handleConnection(): validate, ACK, heartbeat, resolve pending
  - stop()/dispose(): close WS, clear timers/state
  - minimal knowledge: app identity, session user, timings
```

Key principles:

- Fail fast: no webhook retries; 3s timeout; surface error to client.
- No duplicate DB calls: pass `app` object from route → manager → session.
- Keep broadcast DB-free: never refresh installed apps in `broadcastAppState()`.
- Use session cache for installed apps; refresh on session init and device reconnect; mutate cache on install/uninstall.

### 3.2 Target Flow

```
Client → POST /apps/:packageName/start
  - Route fetches app once (if needed), validates input
  - AppManager.startApp(packageName, app)
    - (Optional) in-memory foreground/conflict handling
    - Create AppSession if missing; sessions.set(packageName, session)
    - session.start() → trigger webhook (3s timeout, no retries), create pending, return promise

App Server → /app-ws CONNECTION_INIT
  - AppManager.handleAppInit(ws, msg)
    - Lookup session
    - session.handleConnection(ws, msg) → validate key, build ACK (target: avoid blocking DB if possible), heartbeat, resolve pending
    - AppManager.broadcastAppState() → uses session cache only
```

### 3.3 What’s Different (Behaviorally)

- Webhook failures return immediately (≤3s), enabling quick user retry.
- No DB work in `broadcastAppState()`.
- No duplicate `getApp()`; route is the only place if needed.
- Foreground/conflict handling (Phase 1): rely on in-memory `sessions` registry instead of DB scans (pilot; measure).
- ACK construction: prefer non-blocking user settings path; if unavoidable, keep single query and consider deferring optional settings until after ACK.

---

## 4) Implementation Details

### 4.1 AppSession (new)

Responsibilities:

- Lifecycle: `start()`, `handleConnection()`, `stop()`, `dispose()`
- Timers: connection timeout, heartbeat, reconnection (if any)
- State: connection state, websocket ref, start timestamp, last activity
- Logging: structured logs `{ feature: "app-start", phase, ... }`

Start behavior:

- Build a pending connection (resolve/reject) with 5s total timeout (configurable).
- Trigger webhook:
  - Single attempt
  - Timeout: 3s
  - No retries
  - On failure: resolve with `{ success: false, stage: "WEBHOOK" }`
- Return pending to `AppManager.startApp()`.

HandleConnection:

- Validate API key (keep existing call).
- ACK: attempt to avoid blocking lookups; if needed, do exactly one minimal query.
- Set heartbeat/ping-pong; resolve pending success.

Stop/Dispose:

- Clear timers, close WS, zero state.
- Inform `AppManager` to remove from registry.

### 4.2 AppManager (adapt)

Responsibilities:

- Registry: `sessions: Map<string, AppSession>`
- Orchestration:
  - startApp(packageName, app?): in-memory conflict check (pilot), create session, delegate to `session.start()`.
  - stopApp(packageName): lookup, `session.stop()`, remove from registry, broadcast.
  - handleAppInit(...): lookup session, delegate to `session.handleConnection(...)`.
  - broadcastAppState(): assemble state from registry + `UserSession` caches (no DB).

Notable removals from hot path:

- Duplicated `getApp()`: removed by passing `app` from route.
- Foreground DB scan: replaced by in-memory registry (pilot).
- Installed apps refresh in broadcast: removed.

### 4.3 Installed Apps Cache Policy (Session-Scoped)

- Load once on session init (single DB call).
- Mutate on install/uninstall actions (update in-memory map directly).
- Refresh on device reconnect (glasses WS reconnect event) to catch cross-device installs.
- DO NOT refresh during `broadcastAppState()`.

### 4.4 Webhook Policy

- 3s timeout
- 0 retries
- Error surfaced with stage `WEBHOOK`
- Logged with `{ feature: "app-start", phase: "webhook-trigger" }`

### 4.5 Logging & Telemetry

- Every phase emits `{ feature: "app-start", phase, duration?, packageName, userId }`
  - route-entry
  - session-create
  - webhook-trigger
  - app-init
  - ack-sent
  - session-start-complete
- Error stages: `WEBHOOK`, `CONNECTION`, `AUTHENTICATION`, `TIMEOUT`
- Compare p50/p95 before vs after

---

## 5) Sequence (Before vs After)

### 5.1 Before

```
Route
  → AppManager.startApp
    - DB: getApp()
    - DB: App.find(...) foreground
    - DB: User.findByEmail + user.updateAppLastActive()
    - Webhook (retries, long timeout)
    - Wait for WS connect
App WS
  → AppManager.handleAppInit
    - DB: validate key
    - DB: User.findOrCreateUser
    - DB: user.addRunningApp()
    - Send ACK
Broadcast
  → refreshInstalledApps() → DB getAllApps()
```

### 5.2 After

```
Route
  → AppManager.startApp(packageName, app)
    - Foreground handled in-memory (pilot)
    - Create AppSession; session.start()
      - Webhook (3s, 0 retries)
      - Pending connection (5s)
App WS
  → AppManager.handleAppInit
    - session.handleConnection -> validate key
    - ACK (minimize blocking)
Broadcast
  → Use session cache only (no DB)
```

---

## 6) Migration Strategy

Phase 1 (Scaffold):

- Introduce `AppSession` class (no behavior change).
- Add `sessions` registry to `AppManager`.
- Gate new path behind a feature flag (`USE_APP_SESSION`).

Phase 2 (Pilot):

- Route passes `app` object to `AppManager.startApp`.
- `AppManager` uses AppSession for a single high-traffic app flow.
- Remove `getAllApps()` from `broadcastAppState()`; rely on `UserSession.installedApps`.
- Set webhook timeout to 3s; disable retries.
- Collect metrics and logs.

Phase 3 (Expand):

- Migrate more app flows to `AppSession`.
- Replace DB-based foreground/conflict checks with in-memory registry where safe.
- Optimize ACK to avoid blocking where possible.

Phase 4 (Cleanup):

- Remove legacy code paths from `AppManager`.
- Confirm performance targets; keep feature flag off by default or remove.

---

## 7) Risks & Mitigations

- Foreground/conflict correctness:
  - Mitigation: Pilot in-memory approach; if issues, fall back to DB check temporarily for edge cases.
- ACK assembly still touching DB:
  - Mitigation: Defer optional settings to post-ACK if necessary; cache user settings at session init.
- Hidden reliance on broadcast-time refresh:
  - Mitigation: Audit all readers; ensure cache mutation on install/uninstall and refresh on reconnect.

---

## 8) Expected Impact (Before/After)

| Component                           | Before          | After (Target)      |
| ----------------------------------- | --------------- | ------------------- |
| DB calls in hot path                | 6+              | 1 (auth/validation) |
| Webhook failure latency             | up to 23s       | ≤ 3s                |
| Broadcast installed apps DB refresh | Every broadcast | Never               |
| Duplicate `getApp()` calls          | Yes             | No                  |
| p95 app start                       | ~765ms          | < 400ms             |

---

## 9) Open Questions

1. Do we need a transitional DB-based foreground check for specific app classes (e.g., “standard”) until registry is proven?
2. Can we construct ACK without `User.findOrCreateUser()` (e.g., cached user settings at session init)?
3. Should webhook timeout be environment-specific (dev vs prod)?
4. Exact triggers for installed apps cache refresh on device reconnect (single reconnect vs any reconnect)?

---

## 10) References

- Current manager: `cloud/packages/cloud/src/services/session/AppManager.ts`
- Session: `cloud/packages/cloud/src/services/session/UserSession.ts`
- Routes: `cloud/packages/cloud/src/routes/apps.routes.ts`
- Design doc: `cloud/packages/cloud/src/api/client/docs/design-app-manager-refactor.md`
- Issue spec: `cloud/issues/start-apps-faster/start-apps-faster-spec.md`
