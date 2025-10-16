# App Start Optimization - Next Steps

**Related:** [App Start Flow Audit](./app-start-flow-audit.md)

---

## 📊 Current State (from BetterStack logs)

**App:** com.mentra.translation
**Total Time:** 908ms
**Breakdown:**

- Route entry: ~1ms
- DB Query #1 (getApp): 142ms ⚠️
- AppManager (black box): 765ms ⚠️
- Broadcast: 0ms

**Problem:** We can only see route-level timing. Need granular AppManager logs.

---

## 🎯 Immediate Actions

### 1. Add Profiling Logs to AppManager ⚡️

**Priority:** HIGH
**Time:** 30 minutes
**Location:** `cloud/packages/cloud/src/services/session/AppManager.ts`

Add logs with `feature: "app-start"` to these methods:

#### `startApp()` (line 237)

```typescript
const startTime = Date.now();
const logger = this.logger.child({ feature: "app-start", packageName });

logger.info(
  {
    phase: "manager-entry",
    timestamp: Date.now(),
  },
  "AppManager.startApp entry",
);

// After getApp() call
logger.info(
  {
    phase: "db-query-complete",
    query: "appService.getApp",
    duration: Date.now() - dbQueryStart,
  },
  "App details fetched",
);

// After compatibility check
logger.info(
  {
    phase: "compatibility-check-complete",
    duration: Date.now() - compatStart,
  },
  "Compatibility check done",
);

// Before updateAppLastActive
const lastActiveStart = Date.now();
logger.info(
  {
    phase: "lastactive-update-start",
    timestamp: Date.now(),
  },
  "Updating lastActive",
);

// After updateAppLastActive
logger.info(
  {
    phase: "lastactive-update-complete",
    duration: Date.now() - lastActiveStart,
  },
  "LastActive updated",
);

// Before webhook
logger.info(
  {
    phase: "webhook-trigger-start",
    timestamp: Date.now(),
  },
  "Triggering webhook",
);
```

#### `triggerAppWebhookInternal()` (line 507)

```typescript
const logger = this.logger.child({ feature: "app-start", packageName });

// Before HTTP call
const webhookStart = Date.now();
logger.info(
  {
    phase: "webhook-request-start",
    url: webhookURL,
    timestamp: Date.now(),
  },
  "Sending webhook HTTP request",
);

await this.triggerWebhook(webhookURL, payload);

// After HTTP call
logger.info(
  {
    phase: "webhook-request-complete",
    duration: Date.now() - webhookStart,
    timestamp: Date.now(),
  },
  "Webhook HTTP request completed",
);
```

#### `handleAppInit()` (line 842)

```typescript
const initStart = Date.now();
const logger = this.logger.child({ feature: "app-start", packageName });

logger.info(
  {
    phase: "app-init-start",
    timestamp: Date.now(),
  },
  "App WebSocket connection received",
);

// After API key validation
logger.info(
  {
    phase: "apikey-validation-complete",
    duration: Date.now() - apiKeyStart,
    isValid: isValidApiKey,
  },
  "API key validated",
);

// Before User.findOrCreateUser
const userFetchStart = Date.now();
logger.info(
  {
    phase: "db-query-start",
    query: "User.findOrCreateUser",
    timestamp: Date.now(),
  },
  "Fetching user settings",
);

const user = await User.findOrCreateUser(this.userSession.userId);

logger.info(
  {
    phase: "db-query-complete",
    query: "User.findOrCreateUser",
    duration: Date.now() - userFetchStart,
  },
  "User settings fetched",
);

// Before CONNECTION_ACK
logger.info(
  {
    phase: "connection-ack-sent",
    timestamp: Date.now(),
  },
  "Sent CONNECTION_ACK to app",
);

// When resolving pending connection
logger.info(
  {
    phase: "app-start-complete",
    duration: Date.now() - pending.startTime,
    timestamp: Date.now(),
  },
  `App connected successfully - total time: ${Date.now() - pending.startTime}ms`,
);
```

---

### 2. Re-run App Start with New Logs 🔄

**Priority:** HIGH
**Time:** 5 minutes

1. Deploy code with new logs
2. Start the same app: `com.mentra.translation`
3. Query BetterStack: `feature:"app-start" packageName:"com.mentra.translation"`
4. Sort by timestamp
5. Share ALL logs with complete breakdown

---

### 3. Investigate Slow DB Query 🔍

**Priority:** MEDIUM
**Time:** 15 minutes

Why is `appService.getApp()` taking 142ms instead of 10-50ms?

**Check:**

- Is this only in dev environment? (check prod logs)
- MongoDB indexes on `App` collection
- App document size for `com.mentra.translation`
- Connection pool status

**Command:**

```typescript
// In MongoDB shell
db.apps
  .find({ packageName: "com.mentra.translation" })
  .explain("executionStats");
```

Look for:

- `totalDocsExamined` (should be 1)
- `executionTimeMillis` (should be < 50ms)
- Index used

---

### 4. Analyze Complete Breakdown 📊

**Priority:** HIGH
**Time:** 30 minutes (after getting new logs)

Once we have granular logs, fill in this table:

```
Phase                          | Duration | Expected | Status
-------------------------------|----------|----------|--------
Route Entry                    | ___ms    | 1ms      |
DB: getApp #1 (route)          | ___ms    | 10-50ms  |
AppManager Entry               | ___ms    | <1ms     |
DB: getApp #2 (manager)        | ___ms    | 10-50ms  |
Compatibility Check            | ___ms    | <1ms     |
Foreground App Check           | ___ms    | 10-30ms  |
DB: updateAppLastActive        | ___ms    | 50-200ms |
Webhook HTTP Request           | ___ms    | 100-500ms|
SDK Connection Wait            | ___ms    | 50-200ms |
App Init Start                 | ___ms    | <1ms     |
API Key Validation             | ___ms    | 10-30ms  |
DB: User.findOrCreateUser      | ___ms    | 20-100ms |
DB: user.addRunningApp         | ___ms    | 30-100ms |
CONNECTION_ACK Send            | ___ms    | <5ms     |
Broadcast                      | ___ms    | <5ms     |
-------------------------------|----------|----------|--------
TOTAL                          | ___ms    | 680ms    |
```

---

### 5. Implement Quick Wins 🚀

**Priority:** HIGH
**Time:** 1 hour
**Expected Savings:** 90-350ms

#### Quick Win #1: Eliminate Duplicate getApp() (save 10-50ms)

**File:** `apps.routes.ts`

```typescript
// Before
const app = await appService.getApp(packageName);
if (!app) {
  return res.status(404).json({ success: false, message: "App not found" });
}
const result = await userSession.appManager.startApp(packageName);

// After
const app = await appService.getApp(packageName);
if (!app) {
  return res.status(404).json({ success: false, message: "App not found" });
}
const result = await userSession.appManager.startApp(packageName, app); // Pass app object
```

**File:** `AppManager.ts`

```typescript
// Update signature
async startApp(packageName: string, app?: AppI): Promise<AppStartResult> {
  // ...

  // Replace this DB call
  if (!app) {
    app = await appService.getApp(packageName);
  }

  if (!app) {
    // error handling
  }

  // Continue with app object
}
```

#### Quick Win #2: Make updateAppLastActive Async (save 50-200ms)

**File:** `AppManager.ts` line ~377

```typescript
// Before
await this.updateAppLastActive(packageName);

// After
this.updateAppLastActiveAsync(packageName); // Don't await

// Add new method
private updateAppLastActiveAsync(packageName: string): void {
  this.updateAppLastActive(packageName).catch(err => {
    this.logger.warn(
      { err, packageName, feature: "app-start" },
      "Failed to update lastActive timestamp (non-critical)"
    );
  });
}
```

#### Quick Win #3: Make addRunningApp Async (save 30-100ms)

**File:** `AppManager.ts` line ~999

```typescript
// Before
try {
  if (user) {
    await user.addRunningApp(packageName);
  }
} catch (error) {
  this.logger.error(error, "Error updating user's running apps");
}

// After
this.addRunningAppAsync(user, packageName); // Don't await

// Add new method
private addRunningAppAsync(user: UserI, packageName: string): void {
  if (!user) return;

  user.addRunningApp(packageName).catch(err => {
    this.logger.warn(
      { err, packageName, feature: "app-start" },
      "Failed to update runningApps (non-critical)"
    );
  });
}
```

---

### 6. Measure Impact 📈

**Priority:** HIGH
**Time:** 10 minutes

After implementing quick wins:

1. Start the same app again
2. Compare timing:
   ```
   Before: 908ms
   After:  ___ms
   Saved:  ___ms
   ```
3. Update audit document with results

---

## 📋 Definition of Done

✅ AppManager has granular profiling logs
✅ Complete 765ms breakdown identified
✅ Slow DB query root cause found
✅ Quick wins implemented
✅ Performance improvement measured
✅ Audit document updated with real data

---

## 🎯 Success Criteria

- **Minimum:** Understand where 765ms is spent
- **Good:** Reduce total time to <700ms
- **Excellent:** Reduce total time to <500ms

---

## 📝 Notes

- Focus on understanding before optimizing
- Get complete data before making changes
- Document all findings in audit doc
- Keep feature: "app-start" consistent in all logs

---

**Next Meeting:** Review complete timing breakdown and plan Phase 2 (AppSession refactor)
