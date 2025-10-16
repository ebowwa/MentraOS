# Design: AppManager Refactor with AppSession Pattern

This document specifies a two-tier architecture for app lifecycle management: a session-scoped AppSession class (one per running app) and a refactored AppManager that acts as a lightweight registry and orchestrator. It consolidates per-app state and logic into AppSession while preserving backward compatibility for existing SDK contracts and WebSocket flows.

Scope

- Cloud-only changes (no SDK changes in this phase).
- Introduce an AppSession class to encapsulate per-app state and lifecycle logic.
- Refactor AppManager into a lightweight registry/orchestrator.
- Move app-specific operations (heartbeat, reconnection, state transitions) into AppSession.
- Add REST API endpoints for app lifecycle operations under `/api/client/apps`.
- Maintain backward compatibility with existing App WebSocket flows and SDK contracts.
- Enable programmatic, ephemeral app registration for testing (optional feature flag).

Non-goals

- Changing SDK contracts (Apps continue to use existing WebSocket message types).
- Rewriting existing App servers or their connection logic.
- Live migration of running apps (apps must reconnect after deployment).
- Modifying boot screen behavior in this phase (UX improvements deferred).

---

## 1) Current State (Summary)

Where app logic lives today:

AppManager is a monolithic class (~1800 lines) that handles everything app-related. Every operation queries multiple global maps keyed by `packageName`.

**Core Operations:**

```typescript
async startApp(packageName: string): Promise<AppStartResult>
// 263 lines
// - Validates app exists (DB query: getApp)
// - Checks hardware compatibility
// - Stops conflicting apps (sequential stopApp calls)
// - Updates lastActive timestamp (DB write, blocking)
// - Creates pending connection entry
// - Triggers webhook to app server (HTTP POST, blocking)
// - Waits for app to connect (timeout: 5s)

async stopApp(packageName: string, restart?: boolean): Promise<void>
// 100 lines
// - Closes WebSocket
// - Cleans up state across multiple maps
// - Broadcasts app state change

async handleAppInit(ws: WebSocket, initMessage: AppConnectionInit)
// 200 lines
// - Validates API key (DB query: validateAppAccess)
// - Loads user settings from DB
// - Marks app as running in userSession.runningApps
// - Resolves pending connection promise
// - Sets up heartbeat
// - Sends CONNECTION_ACK with capabilities and settings
// - Broadcasts app state change

async handleAppConnectionClosed(packageName: string, code: number, reason: string)
// 150 lines
// - Grace period handling (5s wait for natural reconnection)
// - Resurrection logic (restart app if grace period expires)
// - Cleanup across multiple maps

async sendMessageToApp(packageName: string, message: any, resurrect?: boolean): Promise<AppMessageResult>
// 100 lines
// - Send message or trigger resurrection if app is disconnected
```

**State Management (Global Maps):**

```typescript
private pendingConnections: Map<string, PendingConnection>
private connectionStates: Map<string, AppConnectionState>
private heartbeatIntervals: Map<string, NodeJS.Timeout>
private reconnectionTimers: Map<string, NodeJS.Timeout>
private appStartTimes: Map<string, number>
```

To get state for a single app requires checking 5+ maps:

```typescript
// Example: Getting app state
const ws = this.userSession.appWebsockets.get(packageName);
const state = this.connectionStates.get(packageName);
const heartbeat = this.heartbeatIntervals.get(packageName);
const pending = this.pendingConnections.get(packageName);
const startTime = this.appStartTimes.get(packageName);
```

**Utility Methods:**

```typescript
private setupAppHeartbeat(packageName: string, ws: WebSocket): void
private clearAppHeartbeat(packageName: string): void
private setAppConnectionState(packageName: string, state: AppConnectionState): void
private getAppConnectionState(packageName: string): AppConnectionState | undefined
private removeAppConnectionState(packageName: string): void
async broadcastAppState(): Promise<AppStateChange | null>
async refreshInstalledApps(): Promise<void>
async startPreviouslyRunningApps(): Promise<void>
isAppRunning(packageName: string): boolean
dispose(): void
```

**Connection States:**

```typescript
enum AppConnectionState {
  RUNNING = "running", // Active WebSocket connection
  GRACE_PERIOD = "grace_period", // Waiting for natural reconnection (5s)
  RESURRECTING = "resurrecting", // System actively restarting app
  STOPPING = "stopping", // User/system initiated stop in progress
  DISCONNECTED = "disconnected", // Available for resurrection
}
```

**Data Flow (Current):**

```
User taps app in mobile client
  ↓
Route: POST /apps/:packageName/start
  ↓
AppManager.startApp(packageName)
  ├─ Validate app exists (DB query: getApp) — 142ms
  ├─ Check hardware compatibility
  ├─ Update lastActive timestamp (DB write) — 50-100ms, blocking
  ├─ Create pending connection entry in map
  ├─ Trigger webhook (HTTP POST, blocking) — 100-500ms
  └─ Wait for app to connect (timeout: 5s)
  ↓
App server receives webhook, connects via WebSocket
  ↓
websocket-app.service routes to AppManager.handleAppInit
  ↓
AppManager.handleAppInit(ws, initMessage)
  ├─ Validate API key (DB query: validateAppAccess)
  ├─ Load user settings from DB
  ├─ Mark app as running in userSession.runningApps
  ├─ Resolve pending connection promise
  ├─ Set up heartbeat (store in heartbeatIntervals map)
  ├─ Send CONNECTION_ACK with capabilities and settings
  └─ Broadcast app state change to clients
```

**All Database Calls in Current startApp() Flow:**

1. **`appService.getApp(packageName)`** — Line 260
   - Duration: 142ms (blocking)
   - Purpose: Fetch app metadata
   - Problem: Duplicate call (route handler already fetched this)

2. **`App.find({ packageName: { $in: runningAppsPackageNames }, appType: AppType.STANDARD })`** — Line 320
   - Duration: 50-100ms (blocking)
   - Purpose: Check if any foreground app is running
   - Problem: Sequential query, blocks startup

3. **`User.findByEmail(this.userSession.userId)`** — Line 474 (inside updateAppLastActive)
   - Duration: 30-80ms (blocking)
   - Purpose: Update lastActive timestamp
   - Problem: Blocking non-critical operation

4. **`user.updateAppLastActive(packageName)`** — Line 480
   - Duration: 50-100ms (blocking, includes retry logic)
   - Purpose: Write lastActive timestamp to DB
   - Problem: Has retry loop (see user.model.ts line 670), blocks startup

5. **On timeout** — `User.findByEmail()` again — Line 412
   - Duration: 30-80ms
   - Purpose: Remove app from runningApps on timeout
   - Problem: Adds delay to timeout error response

**All Database Calls in handleAppInit() Flow:**

6. **`developerService.validateApiKey(packageName, apiKey)`** — Line 852
   - Duration: 20-50ms (blocking)
   - Purpose: Validate app API key
   - Problem: Blocks CONNECTION_ACK

7. **`User.findOrCreateUser(this.userSession.userId)`** — Line 966
   - Duration: 30-100ms (blocking)
   - Purpose: Get user settings for CONNECTION_ACK
   - Problem: Blocks CONNECTION_ACK

8. **`user.addRunningApp(packageName)`** — Line 991
   - Duration: 50-150ms (includes retry logic)
   - Purpose: Add app to user's runningApps in DB
   - Problem: Has retry loop (see user.model.ts line 445), but not blocking (wrapped in try/catch)

**All Database Calls in broadcastAppState() Flow:**

9. **`appService.getAllApps(this.userSession.userId)`** — Line 1154
   - Duration: 50-100ms (blocking)
   - Purpose: Refresh installed apps cache
   - Problem: Called on EVERY app start/stop, unnecessary

**Total DB Time: ~450-850ms per app start**

**Performance Bottlenecks (observed from BetterStack logs):**

- Total `AppManager.startApp` duration: 765ms
  - DB operations: ~450ms (6 queries in hot path)
  - Webhook trigger: variable (100-500ms, includes 2 retries)
  - Connection wait: variable (0-5000ms)
- Sequential operations: no parallelization
- Retry logic: webhook has 2 retries with exponential backoff (line 657-679)

**Pain Points:**

1. **Too many DB calls**: 6 blocking DB queries in hot path (450-850ms total)
2. **Retry logic**: Webhook retries (2 attempts) and user.model retries slow down failures
3. **Duplicate DB calls**: Route handler fetches app, then AppManager fetches it again
4. **Blocking non-critical ops**: updateLastActive blocks startup (should be fire-and-forget)
5. **Inefficient caching**: getAllApps called on every app start/stop
6. **Monolithic class**: 1800+ lines, difficult to navigate and maintain
7. **Global state**: All apps share the same state management code, state scattered across 5+ maps
8. **Testing complexity**: Must mock entire AppManager to test one app operation
9. **No per-app optimization**: Translation app and AI assistant use the same slow startup path
10. **State synchronization**: Easy to have stale state across multiple maps
11. **Memory leaks**: Easy to miss cleanup in one of the many maps

---

## 2) Target Architecture (E2E Overview)

2.1 Two-Tier Design

**AppSession (per-app instance):**

One `AppSession` object per running app. Encapsulates all app-specific state and logic.

Responsibilities:

- Maintain app-specific state (websocket, connection state, timers, start time).
- Handle app lifecycle (start, stop, connection, disconnection).
- Manage heartbeat for this specific app.
- Track connection state transitions (RUNNING → GRACE_PERIOD → RESURRECTING → DISCONNECTED).
- Send messages to this app's WebSocket.
- Trigger resurrection logic when needed.
- Dispose and cleanup on stop.

**AppManager (lightweight registry):**

One `AppManager` per `UserSession`. Acts as orchestrator and registry.

Responsibilities:

- Maintain registry of active `AppSession` instances: `Map<packageName, AppSession>`.
- Orchestrate app starts (validate, check hardware, create AppSession).
- Orchestrate app stops (delegate to AppSession, clean up registry).
- Route incoming messages to the correct AppSession.
- Broadcast app state changes to clients.
- Handle session-level operations (refresh installed apps, start previously running apps).
- Dispose all AppSessions on session cleanup.

**Separation of Concerns:**

```
AppManager (Registry/Orchestrator)
  ├─ sessions: Map<packageName, AppSession>
  └─ Methods:
      ├─ startApp() — Validate, check hardware, create AppSession
      ├─ stopApp() — Delegate to AppSession, remove from registry
      ├─ getSession() — Retrieve AppSession by package name
      ├─ handleAppInit() — Route to AppSession.handleConnection()
      ├─ broadcastAppState() — Aggregate state from all sessions
      └─ dispose() — Clean up all sessions

AppSession (Per-App State/Logic)
  ├─ State: websocket, connectionState, timers, startTime
  └─ Methods:
      ├─ start() — Trigger webhook, wait for connection
      ├─ stop() — Close WebSocket, cleanup
      ├─ handleConnection() — Validate, authenticate, send ACK
      ├─ handleDisconnection() — Grace period, resurrection
      ├─ sendMessage() — Send to WebSocket or resurrect
      ├─ setupHeartbeat() — Ping/pong for this app
      └─ dispose() — Clear all timers and state
```

2.2 Data Flow (Proposed)

```
User taps app in mobile client
  ↓
Route: POST /api/client/apps/start
  ↓
AppManager.startApp(packageName)
  ├─ Validate app exists (from cache or async DB query)
  ├─ Check hardware compatibility (in-memory check)
  ├─ Stop conflicting apps (parallel if multiple)
  ├─ Create AppSession(packageName, userSession, app)
  └─ Add to sessions registry
  ↓
AppSession.start()
  ├─ Trigger webhook (fire-and-forget, non-blocking)
  ├─ Set up pending connection promise
  └─ Return promise to AppManager
  ↓
(Webhook completes in background, app server connects)
  ↓
websocket-app.service routes to AppManager.handleAppInit
  ↓
AppManager routes to AppSession.handleConnection()
  ├─ Validate API key (async)
  ├─ Load user settings (async)
  ├─ Resolve pending connection promise
  ├─ Set up heartbeat
  ├─ Send CONNECTION_ACK
  └─ Return success to AppManager
  ↓
AppManager.broadcastAppState()
  ↓
(Meanwhile, updateLastActive happens in background, fire-and-forget)
```

**Key Improvements:**

- Non-blocking operations: Webhook and DB writes happen asynchronously
- Parallel operations: Multiple conflicting apps can be stopped simultaneously
- Per-app encapsulation: AppSession can implement app-specific startup logic
- Cleaner error handling: Errors in one AppSession don't affect others
- Testability: Mock a single AppSession for unit tests

---

## 3) AppSession Class Design

3.1 Core Structure

State (per-app instance):

```typescript
export class AppSession {
  // Identity
  public readonly packageName: string;
  public readonly sessionId: string;
  private readonly userSession: UserSession;
  private readonly logger: Logger;

  // State
  private connectionState: AppConnectionState;
  private websocket: WebSocket | null = null;
  private app: AppI;

  // Timing
  private startTime: number;
  private lastActivityTime: number;

  // Connection Management
  private pendingConnection: PendingConnection | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectionTimer: NodeJS.Timeout | null = null;

  // Configuration
  private readonly startTimeoutMs: number = 5000;
  private readonly heartbeatIntervalMs: number = 10000;
  private readonly gracePeriodMs: number = 5000;
}
```

Connection States:

```typescript
enum AppConnectionState {
  RUNNING = "running",
  GRACE_PERIOD = "grace_period",
  RESURRECTING = "resurrecting",
  STOPPING = "stopping",
  DISCONNECTED = "disconnected",
}
```

Interfaces:

```typescript
interface PendingConnection {
  packageName: string;
  resolve: (result: AppStartResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  startTime: number;
}

interface AppStartResult {
  success: boolean;
  error?: {
    stage:
      | "WEBHOOK"
      | "CONNECTION"
      | "AUTHENTICATION"
      | "TIMEOUT"
      | "HARDWARE_CHECK";
    message: string;
    details?: any;
  };
}

interface AppMessageResult {
  sent: boolean;
  resurrectionTriggered: boolean;
  error?: string;
}
```

3.2 Public API

Lifecycle:

```typescript
async start(): Promise<AppStartResult>
// - Trigger webhook to app server
// - Create pending connection promise
// - Set timeout (5s)
// - Return promise that resolves when app connects or timeout occurs

async stop(): Promise<void>
// - Set connection state to STOPPING
// - Close WebSocket connection
// - Clear all timers (heartbeat, reconnection)
// - Clean up state
```

Connection:

```typescript
async handleConnection(ws: WebSocket, initMessage: AppConnectionInit): Promise<void>
// - Validate API key
// - Load user settings from database
// - Set websocket reference
// - Set connection state to RUNNING
// - Resolve pending connection promise
// - Set up heartbeat
// - Send CONNECTION_ACK with capabilities and settings

async handleDisconnection(code: number, reason: string): Promise<void>
// - If state is STOPPING → clean up and return
// - Enter GRACE_PERIOD (5s) for natural reconnection
// - If app doesn't reconnect → transition to RESURRECTING
// - Trigger resurrection (restart app via webhook)
// - If resurrection fails → transition to DISCONNECTED
```

Messaging:

```typescript
async sendMessage(message: any): Promise<AppMessageResult>
// - If WebSocket is open and state is RUNNING → send message directly
// - If state is GRACE_PERIOD or DISCONNECTED → trigger resurrection
// - If state is STOPPING → return error
// - Return { sent: boolean, resurrectionTriggered: boolean }
```

State:

```typescript
getState(): { connectionState: AppConnectionState, startTime: number, lastActivityTime: number }
// - Return current state for status checks and debugging

isHealthy(): boolean
// - Return true if websocket is open and state is RUNNING
```

Cleanup:

```typescript
dispose(): void
// - Clear all timers
// - Close WebSocket if open
// - Clean up all state
```

3.3 Start Flow Implementation

```typescript
async start(): Promise<AppStartResult> {
  const logger = this.logger.child({ method: "start" });

  // Create pending connection promise
  const promise = new Promise<AppStartResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      this.pendingConnection = null;
      resolve({
        success: false,
        error: {
          stage: "TIMEOUT",
          message: `App ${this.packageName} did not connect within timeout`,
        },
      });
    }, this.startTimeoutMs);

    this.pendingConnection = {
      packageName: this.packageName,
      resolve,
      reject,
      timeout,
      startTime: Date.now(),
    };
  });

  // Trigger webhook (fire-and-forget, non-blocking)
  this.triggerWebhook()
    .catch((error) => {
      logger.error({ error }, "Failed to trigger webhook");
      if (this.pendingConnection) {
        clearTimeout(this.pendingConnection.timeout);
        this.pendingConnection.resolve({
          success: false,
          error: {
            stage: "WEBHOOK",
            message: "Failed to trigger app webhook",
            details: error.message,
          },
        });
        this.pendingConnection = null;
      }
    });

  return promise;
}

private async triggerWebhook(): Promise<void> {
  const webhookUrl = `${this.app.publicUrl}/augmentos`;
  const payload: SessionWebhookRequest = {
    type: WebhookRequestType.SESSION_START,
    userId: this.userSession.userId,
    sessionId: this.userSession.sessionId,
    connectionTime: new Date().toISOString(),
  };

  await axios.post(webhookUrl, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 3000,
  });
}
```

3.4 Connection Handling Implementation

```typescript
async handleConnection(ws: WebSocket, initMessage: AppConnectionInit): Promise<void> {
  const logger = this.logger.child({ method: "handleConnection" });

  // Validate API key
  const isValid = await this.validateApiKey(initMessage.apiKey);
  if (!isValid) {
    if (this.pendingConnection) {
      clearTimeout(this.pendingConnection.timeout);
      this.pendingConnection.resolve({
        success: false,
        error: {
          stage: "AUTHENTICATION",
          message: "Invalid API key",
        },
      });
      this.pendingConnection = null;
    }
    ws.close(1008, "Invalid API key");
    return;
  }

  // Load user settings
  const user = await User.findByPk(this.userSession.userId);
  const settings = user?.augmentosSettings || DEFAULT_AUGMENTOS_SETTINGS;

  // Set up connection
  this.websocket = ws;
  this.connectionState = AppConnectionState.RUNNING;
  this.lastActivityTime = Date.now();

  // Set up heartbeat
  this.setupHeartbeat();

  // Resolve pending connection
  if (this.pendingConnection) {
    clearTimeout(this.pendingConnection.timeout);
    this.pendingConnection.resolve({ success: true });
    this.pendingConnection = null;
  }

  // Send CONNECTION_ACK
  const ackMessage = {
    type: CloudToAppMessageType.CONNECTION_ACK,
    userId: this.userSession.userId,
    sessionId: this.userSession.sessionId,
    capabilities: {
      hasGlasses: this.userSession.hasGlasses(),
      glassesModel: this.userSession.glassesDeviceModelName,
      hardwareCapabilities: this.userSession.hardwareCapabilities,
    },
    settings,
  };

  ws.send(JSON.stringify(ackMessage));
  logger.info("App connection established and acknowledged");
}
```

3.5 Disconnection and Resurrection

```typescript
async handleDisconnection(code: number, reason: string): Promise<void> {
  const logger = this.logger.child({ method: "handleDisconnection", code, reason });

  // If we're intentionally stopping, just clean up
  if (this.connectionState === AppConnectionState.STOPPING) {
    this.dispose();
    return;
  }

  // Clear existing timers
  this.clearHeartbeat();
  if (this.reconnectionTimer) {
    clearTimeout(this.reconnectionTimer);
    this.reconnectionTimer = null;
  }

  // Enter grace period for natural reconnection
  this.connectionState = AppConnectionState.GRACE_PERIOD;
  logger.info("Entering grace period for natural reconnection");

  this.reconnectionTimer = setTimeout(async () => {
    // Still in grace period after timeout? Start resurrection
    if (this.connectionState === AppConnectionState.GRACE_PERIOD) {
      logger.warn("Grace period expired, attempting resurrection");
      await this.resurrect();
    }
  }, this.gracePeriodMs);
}

private async resurrect(): Promise<void> {
  const logger = this.logger.child({ method: "resurrect" });

  this.connectionState = AppConnectionState.RESURRECTING;
  logger.info("Attempting to resurrect app");

  try {
    // Trigger webhook again (with retry logic)
    await this.triggerWebhookWithRetry();
    logger.info("Resurrection webhook sent successfully");
  } catch (error) {
    logger.error({ error }, "Resurrection failed");
    this.connectionState = AppConnectionState.DISCONNECTED;
  }
}

private async triggerWebhookWithRetry(maxRetries = 3): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await this.triggerWebhook();
      return;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

---

## 4) AppManager Refactor

4.1 Simplified Structure

State (session-scoped):

```typescript
private sessions: Map<string, AppSession> = new Map();
```

**Installed Apps Cache:**

Current system: `userSession.installedApps: Map<string, AppI>` cached in memory, but `refreshInstalledApps()` is called on every `broadcastAppState()`, which does a DB query every time an app starts or stops. This is inefficient.

Proposed: Cache should only be refreshed when the cache could be stale:

- **Session init** — Load initial cache from DB
- **App install** — Add to cache immediately after DB write
- **App uninstall** — Remove from cache immediately after DB write
- **Device reconnect** — Refresh cache in case user installed apps on another device

Remove the DB query from `broadcastAppState()` entirely.

Public Methods:

```typescript
async startApp(packageName: string): Promise<AppStartResult>
// - Validate app exists in installed apps
// - Check hardware compatibility
// - Stop conflicting apps (parallel)
// - Create AppSession
// - Delegate to AppSession.start()
// - Update lastActive (async, fire-and-forget)
// - Broadcast app state change

async stopApp(packageName: string): Promise<void>
// - Get AppSession from registry
// - Delegate to AppSession.stop()
// - Remove from sessions registry
// - Broadcast app state change

async stopAllApps(): Promise<void>
// - Stop all in parallel
// - Clear sessions registry

getSession(packageName: string): AppSession | undefined
// - Return AppSession from registry

getRunningApps(): string[]
// - Return array of package names from sessions.keys()

async handleAppInit(ws: WebSocket, initMessage: AppConnectionInit): Promise<void>
// - Get AppSession from registry
// - Delegate to AppSession.handleConnection()
// - Broadcast app state change

async sendMessageToApp(packageName: string, message: any): Promise<AppMessageResult>
// - Get AppSession from registry
// - Delegate to AppSession.sendMessage()

async broadcastAppState(): Promise<AppStateChange>
// - Aggregate state from all sessions
// - Send to all connected client WebSockets
// - Do NOT refresh installed apps cache here (remove inefficient DB query)

async refreshInstalledApps(): Promise<void>
// - Fetch installed apps from database
// - Update userSession.installedApps cache
// - Call only on: session init, device reconnect
// - For install/uninstall: update cache directly instead of full refresh

async startPreviouslyRunningApps(): Promise<void>
// - Start apps in parallel
// - Handle errors gracefully

dispose(): void
// - Stop all apps
// - Clear sessions registry
```

4.2 Implementation Example

```typescript
export class AppManager {
  private userSession: UserSession;
  private logger: Logger;
  private sessions = new Map<string, AppSession>();
  private installedApps: AppI[] = [];

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "AppManager" });
  }

  async startApp(packageName: string): Promise<AppStartResult> {
    const logger = this.logger.child({ packageName, method: "startApp" });

    logger.info("Starting app", {
      feature: "app-start",
      phase: "route-entry",
    });

    // Check if already running
    if (this.sessions.has(packageName)) {
      return { success: true };
    }

    // Validate app exists (from cache)
    const app = this.userSession.installedApps.get(packageName);
    if (!app) {
      return {
        success: false,
        error: {
          stage: "HARDWARE_CHECK",
          message: "App not installed",
        },
      };
    }

    // Check hardware compatibility
    const compatibilityCheck = HardwareCompatibilityService.checkCompatibility(
      app,
      this.userSession.hardwareCapabilities,
    );

    if (!compatibilityCheck.compatible) {
      return {
        success: false,
        error: {
          stage: "HARDWARE_CHECK",
          message: "Hardware incompatible",
          details: compatibilityCheck.reasons,
        },
      };
    }

    // Create AppSession
    const session = new AppSession(packageName, this.userSession, app);
    this.sessions.set(packageName, session);

    // Start app
    const result = await session.start();

    // Update lastActive (fire-and-forget)
    if (result.success) {
      appService
        .updateAppLastActive(this.userSession.userId, packageName)
        .catch((error) => {
          logger.error(error, "Failed to update lastActive");
        });

      await this.broadcastAppState();
    } else {
      this.sessions.delete(packageName);
    }

    return result;
  }

  async stopApp(packageName: string): Promise<void> {
    const session = this.sessions.get(packageName);
    if (!session) return;

    await session.stop();
    this.sessions.delete(packageName);
    await this.broadcastAppState();
  }

  async handleAppInit(
    ws: WebSocket,
    initMessage: AppConnectionInit,
  ): Promise<void> {
    const session = this.sessions.get(initMessage.packageName);
    if (!session) {
      ws.close(1008, "No pending session");
      return;
    }

    await session.handleConnection(ws, initMessage);
    await this.broadcastAppState();
  }

  async broadcastAppState(): Promise<AppStateChange> {
    const activeAppSessions = Array.from(this.sessions.keys());
    const message: AppStateChange = {
      type: CloudToGlassesMessageType.APP_STATE_CHANGE,
      activeAppSessions,
      loadingApps: [],
      isTranscribing: this.userSession.isTranscribing,
    };

    for (const clientWs of this.userSession.clientWebsockets.values()) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(message));
      }
    }

    return message;
  }

  async refreshInstalledApps(): Promise<void> {
    const installedAppsList = await appService.getAllApps(
      this.userSession.userId,
    );
    const installedApps = new Map<string, AppI>();
    for (const app of installedAppsList) {
      installedApps.set(app.packageName, app);
    }
    this.userSession.installedApps = installedApps;
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }
}
```

**Result: AppManager goes from 1800 lines → ~300 lines**

---

## 5) Performance Improvements

5.1 Async Operations (Non-Blocking)

**Before:**

```typescript
async startApp(packageName: string) {
  await updateAppLastActive(packageName);  // 50-100ms (blocking)
  await triggerWebhook();                  // 100-500ms (blocking)
}
```

**After:**

```typescript
async start() {
  // Fire-and-forget (non-blocking)
  this.triggerWebhook().catch(handleError);
  updateAppLastActive().catch(logWarning);

  return this.pendingConnectionPromise;
}
```

**Savings:** 50-100ms (lastActive no longer blocks)

5.2 Eliminate Duplicate and Unnecessary Database Calls

**Before (6 blocking DB calls in hot path):**

```typescript
// startApp() flow:
const app = await appService.getApp(packageName);                    // 142ms - DUPLICATE
const runningForegroundApps = await App.find({...});                  // 50-100ms
const user = await User.findByEmail(userId);                          // 30-80ms
await user.updateAppLastActive(packageName);                          // 50-100ms (with retries)

// handleAppInit() flow:
const isValid = await developerService.validateApiKey(...);           // 20-50ms
const user = await User.findOrCreateUser(userId);                     // 30-100ms

// broadcastAppState() flow:
const apps = await appService.getAllApps(userId);                     // 50-100ms

// Total: ~450-850ms
```

**After (minimal DB calls):**

```typescript
// Pass app from route handler (no duplicate getApp)
await appManager.startApp(packageName, app);

// Use cached installedApps for foreground check (no App.find)
const runningForegroundApps = Array.from(this.sessions.values())
  .map((s) => s.app)
  .filter((app) => app.appType === AppType.STANDARD);

// Fire-and-forget lastActive (non-blocking)
updateAppLastActive(packageName).catch(logError);

// Cache user settings in session (no User.findOrCreateUser in hot path)
const userSettings = this.userSession.cachedUserSettings;

// No getAllApps on every broadcast (use cache, refresh only on install/uninstall)

// Total: ~20-50ms (only validateApiKey in hot path)
```

**Savings:** ~430-800ms

5.3 Remove Retry Logic (Fail Fast)

**Before (webhook retries - line 657-679):**

```typescript
private async triggerWebhook(url: string, payload: SessionWebhookRequest): Promise<void> {
  const maxRetries = 2;
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await axios.post(url, payload, {
        timeout: 10000, // 10 seconds
      });
      return;
    } catch (error: unknown) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelay * Math.pow(2, attempt)),
      );
    }
  }
}
// Total possible delay: 10s + 1s + 10s + 2s = 23s worst case
```

**Before (user.model.ts retries):**

```typescript
// user.updateAppLastActive() has retry loop with 3 attempts (line 670)
// user.addRunningApp() has retry loop with 3 attempts (line 445)
// Each retry adds 100-200ms delay
```

**After (fail fast, no retries):**

```typescript
private async triggerWebhook(url: string, payload: SessionWebhookRequest): Promise<void> {
  await axios.post(url, payload, {
    timeout: 3000, // 3 seconds, fail fast
  });
  // Single attempt, fail immediately on error
  // User can manually retry if needed
}

// No retries in user.model.ts operations
// Fire-and-forget for non-critical operations
```

**Savings:** Worst case 23s → 3s on failure, user sees error immediately and can retry

5.4 Expected Total Improvement

```
Current app start time: 765ms (from BetterStack logs)

Improvements:
- Eliminate duplicate getApp():        -142ms
- Remove App.find() for foreground:    -75ms  (use cache)
- Async lastActive (fire-and-forget):  -80ms
- Cache user settings:                 -50ms  (no User.findOrCreateUser in hot path)
- Remove getAllApps from broadcast:    -75ms
- Reduce webhook timeout 10s→3s:       -7s   (only on failure)
─────────────────────────────────────────────
Estimated new time:                    ~343ms

Target:                                <400ms ✓

Worst case failure (webhook timeout):
Before: 10s (initial) + retries = up to 23s
After:  3s (fail fast, no retries)
Savings: 20s on failures
```

---

## 6) REST API Design

Base path: `/api/client/apps`

All endpoints require Bearer JWT authentication with an active UserSession.

**POST `/start`** — Start an app

Request:

```typescript
{
  packageName: string;
}
```

Response:

```typescript
{ success: true }
// or
{ success: false, error: { stage, message, details } }
```

**POST `/stop`** — Stop an app

Request:

```typescript
{
  packageName: string;
}
```

Response:

```typescript
{
  success: true;
}
```

**GET `/running`** — Get running apps

Response:

```typescript
{ apps: string[] }
```

**GET `/installed`** — Get installed apps

Response:

```typescript
{ apps: AppI[] }
```

---

## 7) Installed Apps Cache Refresh Strategy

Current system calls `refreshInstalledApps()` inside `broadcastAppState()`, which means every app start/stop does a DB query. This is wasteful since installed apps rarely change.

**Proposed refresh points:**

1. **Session initialization** (`UserSession` constructor or `sessionService.createSession`)
   - Call `refreshInstalledApps()` once when session is created
   - This is the initial cache load

2. **App install** (`POST /apps/install` route)
   - After DB write succeeds: `userSession.installedApps.set(packageName, app)`
   - No need to refresh entire cache, just add the new app

3. **App uninstall** (`POST /apps/uninstall` route)
   - After DB write succeeds: `userSession.installedApps.delete(packageName)`
   - No need to refresh entire cache, just remove the app

4. **Device reconnect** (`websocket-glasses.service` on connection)
   - Call `refreshInstalledApps()` when glasses reconnect
   - Handles case where user installed apps on another device
   - This is rare but important for multi-device users

**Remove from:**

- `broadcastAppState()` — No longer does DB query, just uses cache

**Result:** Eliminate 50-100ms DB query on every app start/stop.

---

## 8) Migration Strategy

Phase 1: Create AppSession (No Breaking Changes)

- Create `AppSession.ts` with all lifecycle methods
- Write comprehensive unit tests
- Keep existing AppManager unchanged

**Deliverable:** Working AppSession class with test coverage

Phase 2: Hybrid AppManager (Backward Compatible)

- Add `sessions: Map<packageName, AppSession>` to AppManager
- Refactor `startApp()` to create AppSession and delegate
- Refactor `stopApp()` to delegate to AppSession
- Keep existing global maps as fallback
- Add feature flag: `USE_APP_SESSION` (default: false)

**Deliverable:** AppManager can use either path based on feature flag

Phase 3: Gradual Rollout

- Enable `USE_APP_SESSION` for internal testing
- Monitor logs with `{ feature: "app-start" }` for timing
- Compare metrics: startup time, success rate, resurrection rate
- Enable for beta users (10% rollout)
- Monitor for 1 week
- Increase to 50% → monitor 3 days
- Increase to 100% → monitor 1 week

**Deliverable:** AppSession in production with verified stability

Phase 4: Cleanup (Remove Legacy)

- Remove `USE_APP_SESSION` feature flag
- Delete legacy global maps from AppManager
- Remove legacy methods
- Update all tests

**Deliverable:** Clean codebase with ~1200 lines removed

---

## 9) Testing Strategy

8.1 Unit Tests (AppSession)

```typescript
describe("AppSession", () => {
  describe("start()", () => {
    it("should create pending connection and trigger webhook");
    it("should timeout if app does not connect within 5s");
    it("should handle webhook failure");
  });

  describe("handleConnection()", () => {
    it("should validate API key and establish connection");
    it("should reject invalid API key");
    it("should resolve pending connection on success");
    it("should send CONNECTION_ACK with capabilities");
  });

  describe("handleDisconnection()", () => {
    it("should enter grace period on unexpected disconnect");
    it("should attempt resurrection after grace period");
    it("should not resurrect if already stopping");
  });

  describe("stop()", () => {
    it("should close websocket and clear all timers");
  });

  describe("sendMessage()", () => {
    it("should send message if websocket is open");
    it("should trigger resurrection if disconnected");
    it("should fail if stopping");
  });
});
```

8.2 Integration Tests (AppManager + AppSession)

```typescript
describe("AppManager Integration", () => {
  it("should start and stop an app end-to-end");
```
