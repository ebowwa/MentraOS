# State Migration Checklist

**Goal:** Remove direct access to `userSession.runningApps`, `appWebsockets`, `loadingApps`, and `installedApps`. All access should go through `appManager` methods.

**Status:** In progress - critical paths fixed, many remaining

---

## Architecture Target

### ❌ Bad (Direct Access)

```typescript
if (userSession.runningApps.has(packageName)) { ... }
const apps = Array.from(userSession.runningApps);
userSession.appWebsockets.get(packageName);
```

### ✅ Good (Use AppManager)

```typescript
if (userSession.appManager.isAppRunning(packageName)) { ... }
const apps = userSession.appManager.getRunningApps();
// WebSockets will be internal to AppSession (no public access)
```

---

## Fixed Files ✅

### 1. ✅ `src/services/client/apps.service.ts`

- **Before:** `session?.runningApps || new Set<string>()`
- **After:** `session?.appManager.isAppRunning(app.packageName)`
- **Impact:** Client home screen now uses proper abstraction

### 2. ✅ `src/routes/apps.routes.ts` (enhanceAppsWithSessionState)

- **Before:** `userSession.runningApps.has(app.packageName)`
- **After:** `userSession.appManager.isAppRunning(app.packageName)`
- **Impact:** App list API returns correct running state

### 3. ✅ `src/services/session/UserSession.ts` (snapshotForClient)

- **Before:** `for (const packageName of this.runningApps)`
- **After:** `for (const packageName of this.appManager.getRunningApps())`
- **Impact:** Client broadcasts show correct app state

### 4. ✅ `src/services/layout/DisplayManager6.1.ts` (6 locations fixed)

- **Before:** `this.userSession.runningApps.has(packageName)`
- **After:** `this.userSession.appManager.isAppRunning(packageName)`
- **Impact:** Display management, boot screens, throttling, background lock management
- **Locations fixed:** Lines 144, 154, 382, 810, 868, 967, 1017

### 5. ✅ `src/services/debug/MemoryTelemetryService.ts`

- **Before:** `session.runningApps.size` and `session.appWebsockets.size`
- **After:** `session.appManager.getRunningApps().length` and `session.appManager.getTrackedApps().length`
- **Impact:** Memory telemetry accuracy

---

## Files Still Reading Direct State ⚠️

### Non-Critical (Commented Debug Code)

#### 1. `src/routes/apps.routes.ts` (commented debug logs)

**Many commented sections like line 914, 925, 972, etc.**

```typescript
// These are commented out but should be updated when re-enabled:
// runningAppsCount: userSession.runningApps.size,
// runningApps: Array.from(userSession.runningApps),

// SHOULD BE:
// runningAppsCount: userSession.appManager.getRunningApps().length,
// runningApps: userSession.appManager.getRunningApps(),
```

**Impact:** Debug logging (currently disabled but needs update)

---

## AppManager Public API

Current methods available:

```typescript
class AppsManager {
  // Already implemented ✅
  isAppRunning(packageName: string): boolean
  getRunningApps(): string[]
  getTrackedApps(): string[]
  getAppSession(packageName: string): AppSessionI | undefined
  startApp(packageName: string): Promise<AppStartResult>
  stopApp(packageName: string): Promise<void>
  sendMessageToApp(packageName: string, message: any): Promise<AppMessageResult>
  startPreviouslyRunningApps(): Promise<void>
  broadcastAppState(): Promise<AppStateChange | null>

  // Still needed:
  getLoadingApps(): string[] // TODO: Add this
  getInstalledApps(): AppI[] // TODO: Move from UserSession
}
```

---

## Migration Steps

### Phase 1: Fix Critical Paths ✅ COMPLETE

- [x] Client apps service (home screen)
- [x] App routes (enhance function)
- [x] UserSession snapshot (broadcasts)
- [x] DisplayManager (6 locations)
- [x] MemoryTelemetryService

### Phase 2: Add Missing Methods

- [ ] Add `getLoadingApps()` to AppsManager
- [ ] Move `installedApps` from UserSession → AppsManager
- [ ] Add `getInstalledApps()` to AppsManager

### Phase 3: Update All Remaining Access

- [ ] Update DisplayManager (all locations)
- [ ] Update MemoryTelemetryService
- [ ] Update commented debug logs in routes
- [ ] Search codebase for any remaining direct access

### Phase 4: Remove Bridge State

Once all access goes through AppManager:

- [ ] Remove `runningApps: Set<string>` from UserSession
- [ ] Remove `loadingApps: Set<string>` from UserSession
- [ ] Remove `appWebsockets: Map<string, WebSocket>` from UserSession
- [ ] Move `installedApps` to AppsManager only
- [ ] Update AppManager to NOT update UserSession state

### Phase 5: Verify

- [ ] Search for `\.runningApps` in codebase - should only be in models
- [ ] Search for `\.loadingApps` - should be zero results
- [ ] Search for `\.appWebsockets` - should be zero results
- [ ] All tests pass
- [ ] Manual testing of app start/stop

---

## Search Commands

Find remaining direct access:

```bash
# Find runningApps access (exclude models and legacy)
grep -r "\.runningApps" src/ --include="*.ts" | grep -v "models/" | grep -v "legacy"

# Find loadingApps access
grep -r "\.loadingApps" src/ --include="*.ts" | grep -v "models/" | grep -v "legacy"

# Find appWebsockets access
grep -r "\.appWebsockets" src/ --include="*.ts" | grep -v "models/" | grep -v "legacy"

# Find installedApps direct access (should only be in UserSession and AppManager)
grep -r "\.installedApps" src/ --include="*.ts" | grep -v "UserSession" | grep -v "AppManager"
```

---

## Why This Matters

1. **Single Source of Truth**
   - Currently state lives in both UserSession and AppSession
   - Bridge methods read from UserSession during migration
   - Eventually all state should live in AppSession/AppsManager

2. **Encapsulation**
   - Direct access couples code to implementation details
   - Using methods allows internal refactoring without breaking callers

3. **Correctness**
   - If we move state into AppSession, direct access will be stale
   - Using methods ensures we always get current state

4. **Testing**
   - Can mock AppManager interface easily
   - Can't mock direct property access

---

## Expected Impact

### Before Migration Complete

- ⚠️ State exists in both places (bridge)
- ⚠️ Some code reads UserSession directly
- ⚠️ Some code reads via AppManager
- ⚠️ Must keep both in sync

### After Migration Complete

- ✅ State only in AppSession/AppsManager
- ✅ All access via AppManager methods
- ✅ UserSession is cleaner
- ✅ Can delete bridge code
- ✅ No sync issues

---

## Next Actions

1. **Immediate:** Fix DisplayManager (critical for UI)
2. **Short-term:** Add `getLoadingApps()` method
3. **Medium-term:** Move `installedApps` to AppsManager
4. **Long-term:** Remove all state from UserSession

---

## Testing Strategy

For each file updated:

1. Run build: `bun run build`
2. Test app start via API
3. Test app stop via API
4. Verify client home screen shows correct state
5. Test disconnect/reconnect (previously running apps)
6. Check Better Stack for errors

---

## Risk Mitigation

- Keep bridge methods until ALL access updated
- Update one file at a time
- Test after each change
- Don't remove UserSession state until 100% migrated
- Feature flag can roll back to legacy if needed
