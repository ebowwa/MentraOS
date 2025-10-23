# Testing Guide - AppSession Implementation

**Branch:** `cloud/start-apps-faster`  
**Status:** Core implementation complete, ready for testing

## Overview

The new AppSession implementation is complete and needs end-to-end validation before rollout. This guide walks through manual testing, validation checks, and monitoring.

---

## Prerequisites

1. **Environment Setup**

   ```bash
   cd cloud/packages/cloud
   bun install
   bun run build
   ```

2. **Environment Variables**
   - `CLOUD_PUBLIC_HOST_NAME` - Public hostname (e.g., `prod.augmentos.cloud`)
   - `AUGMENTOS_AUTH_JWT_SECRET` - JWT secret for auth
   - Optional: `USE_APP_SESSION=true` - Feature flag (currently new path is default)

3. **Better Stack Access**
   - Log in to Better Stack
   - Filter logs with: `feature:"app-start"`

4. **Test App**
   - Have a test app deployed and accessible
   - Note the app's `packageName`
   - Ensure app's webhook endpoint is responding

---

## Test Cases

### 1. Happy Path - Successful App Start

**Objective:** Verify end-to-end app start flow works correctly.

**Steps:**

1. Start the cloud server

   ```bash
   bun run dev
   ```

2. Connect glasses/client via WebSocket to `/client-ws`

3. Trigger app start via API:

   ```bash
   curl -X POST http://localhost:8002/api/client/apps/:packageName/start \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

4. Or via client SDK:
   ```typescript
   const client = new MentraClient({userId: "test@example.com"})
   await client.connect()
   await client.startApp("com.example.test-app")
   ```

**Expected Results:**

- ✅ HTTP 200 response with `{ success: true }`
- ✅ Webhook sent to app server (check app logs)
- ✅ App connects via `/app-ws` within 5s
- ✅ CONNECTION_ACK sent to app
- ✅ APP_STATE_CHANGE broadcast to glasses/client
- ✅ Boot screen appears on glasses
- ✅ App shows as running in client state

**Better Stack Logs to Check:**

```
feature:"app-start" "⚡️ Starting app session"
feature:"app-start" "Triggering webhook"
feature:"app-start" "Webhook sent successfully"
feature:"app-start" "App connecting"
feature:"app-start" "Sent CONNECTION_ACK"
feature:"app-start" "✅ App connected and authenticated"
```

**Duration Check:**

- Total start time should be logged
- Target: < 400ms p95 (current baseline ~765ms)

---

### 2. Webhook Timeout (3s)

**Objective:** Verify fast failure when app webhook doesn't respond.

**Steps:**

1. Configure test app webhook to timeout (or use unreachable URL)
2. Start app via API

**Expected Results:**

- ✅ Request fails after ~3 seconds (not 10-23s like legacy)
- ✅ HTTP 200 with `{ success: false, error: { stage: "WEBHOOK", message: "..." } }`
- ✅ Boot screen clears on glasses
- ✅ App not added to runningApps

**Better Stack Logs:**

```
feature:"app-start" "Webhook failed for ..."
error stage: "WEBHOOK"
```

---

### 3. Connection Timeout (5s)

**Objective:** Verify timeout when app doesn't connect after webhook.

**Steps:**

1. Configure app to receive webhook but NOT connect to `/app-ws`
2. Start app via API

**Expected Results:**

- ✅ Webhook succeeds
- ✅ Request fails after ~5 seconds total
- ✅ HTTP 200 with `{ success: false, error: { stage: "TIMEOUT", message: "..." } }`
- ✅ Boot screen clears
- ✅ App removed from loadingApps

**Better Stack Logs:**

```
feature:"app-start" "Connection timeout after 5000ms"
error stage: "TIMEOUT"
```

---

### 4. Invalid API Key

**Objective:** Verify authentication failure handling.

**Steps:**

1. Have app connect with invalid API key in CONNECTION_INIT message

**Expected Results:**

- ✅ Connection rejected
- ✅ CONNECTION_ERROR sent to app
- ✅ WebSocket closed with code 1008
- ✅ HTTP response: `{ success: false, error: { stage: "AUTHENTICATION", message: "Invalid API key" } }`

**Better Stack Logs:**

```
feature:"app-start" "Invalid API key"
error stage: "AUTHENTICATION"
```

---

### 5. Message Sending (sendMessageToApp)

**Objective:** Verify downstream managers can send messages to apps.

**Steps:**

1. Start app successfully
2. Trigger a flow that uses `sendMessageToApp`:
   - Photo request/response (PhotoManager)
   - Transcription data (TranscriptionManager)
   - Translation data (TranslationManager)
   - Stream status (UnmanagedStreamingExtension)

**Expected Results:**

- ✅ Message sent successfully: `{ sent: true, resurrectionTriggered: false }`
- ✅ App receives message
- ✅ No errors in logs

**Better Stack Logs:**

```
"Delegating to AppSession.sendMessage()"
"Message sent to app"
```

---

### 6. App Stop

**Objective:** Verify clean shutdown of app session.

**Steps:**

1. Start app
2. Stop app via API:
   ```bash
   curl -X POST http://localhost:8002/api/client/apps/:packageName/stop \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

**Expected Results:**

- ✅ WebSocket closed gracefully
- ✅ Removed from runningApps
- ✅ Removed from appWebsockets
- ✅ Boot screen cleared
- ✅ Dashboard content cleaned up
- ✅ APP_STATE_CHANGE broadcast

**Better Stack Logs:**

```
"Stopping app session"
```

---

### 7. Concurrent App Starts

**Objective:** Verify handling of multiple apps starting simultaneously.

**Steps:**

1. Start 3-5 different apps concurrently

**Expected Results:**

- ✅ All apps start successfully (if webhooks respond)
- ✅ No race conditions or crashes
- ✅ Each app has its own AppSession
- ✅ All tracked in AppsManager registry

---

### 8. Start Previously Running Apps (Reconnect)

**Objective:** Verify glasses reconnection starts previously running apps.

**Steps:**

1. Start 2-3 apps
2. Disconnect glasses WebSocket
3. Reconnect glasses

**Expected Results:**

- ✅ `startPreviouslyRunningApps()` called
- ✅ Previously running apps restart automatically
- ✅ All apps reconnect successfully

**Better Stack Logs:**

```
"Starting previously running apps"
"Started X/Y previously running apps"
```

---

### 9. Heartbeat Monitoring

**Objective:** Verify ping/pong keeps connections alive.

**Steps:**

1. Start app
2. Wait 10+ seconds (heartbeat interval)
3. Monitor WebSocket

**Expected Results:**

- ✅ Ping sent every 10 seconds
- ✅ Pong received from app
- ✅ Connection stays alive
- ✅ No unexpected disconnects

---

### 10. Broadcast App State

**Objective:** Verify APP_STATE_CHANGE messages sent correctly.

**Steps:**

1. Start/stop apps
2. Monitor glasses/client WebSocket

**Expected Results:**

- ✅ APP_STATE_CHANGE message sent on app start
- ✅ APP_STATE_CHANGE message sent on app stop
- ✅ Message format matches SDK contract
- ✅ No DB calls during broadcast (check logs)

---

## Performance Validation

### Measure App Start Latency

1. **Enable detailed timing logs**
   - Already built into implementation with `{ feature: "app-start", duration }`

2. **Collect baseline metrics** (legacy path)

   ```bash
   # If legacy still available, test with USE_APP_SESSION=false
   grep "App .* successfully connected" logs | grep duration
   ```

3. **Collect new implementation metrics**

   ```bash
   grep "✅ App connected and authenticated" logs | grep duration
   ```

4. **Compare distributions**
   - Calculate p50, p95, p99
   - Target: p95 < 400ms (from ~765ms baseline)

### Better Stack Query

```
feature:"app-start" duration
```

Group by duration ranges:

- 0-200ms
- 200-400ms
- 400-600ms
- 600-800ms
- 800ms+

---

## Common Issues & Debugging

### App won't start

**Check:**

1. Is app installed? `userSession.installedApps.has(packageName)`
2. Is webhook URL correct? Check app's `publicUrl` field
3. Is app server responding? Test webhook endpoint directly
4. Check Better Stack for error stage (WEBHOOK, TIMEOUT, AUTHENTICATION)

### Webhook times out

**Check:**

1. App server running?
2. Network connectivity to app server
3. Firewall blocking outbound requests?
4. Webhook endpoint actually `/webhook`?

### Connection timeout

**Check:**

1. App receiving webhook but not connecting to `/app-ws`?
2. App using correct WebSocket URL from webhook payload?
3. JWT token valid and properly included in connection?

### Messages not reaching app

**Check:**

1. Is app in runningApps? `userSession.runningApps.has(packageName)`
2. Is WebSocket open? `appWebsockets.get(packageName)?.readyState === 1`
3. Check logs for "Delegating to AppSession.sendMessage()"

### State not updating

**Check:**

1. Is APP_STATE_CHANGE being broadcast?
2. Is client/glasses connected to `/client-ws`?
3. Check client-side event listeners

---

## Rollout Checklist

Before rolling out to production:

- [ ] All 10 test cases pass
- [ ] Performance targets met (p95 < 400ms)
- [ ] No errors in Better Stack logs for happy path
- [ ] Error handling validated for all failure modes
- [ ] Concurrent app starts work correctly
- [ ] Reconnection flow works
- [ ] Downstream managers (Photo, Transcription, etc.) work
- [ ] Boot screen integration works
- [ ] Dashboard cleanup works
- [ ] Memory leaks checked (session disposal)

---

## Monitoring Post-Rollout

### Key Metrics to Watch

1. **App Start Success Rate**
   - Track success/failure ratio
   - Group failures by error stage

2. **App Start Latency**
   - p50, p95, p99 distributions
   - Compare to baseline

3. **Error Stages**
   - WEBHOOK failures (app server issues)
   - TIMEOUT failures (slow apps)
   - AUTHENTICATION failures (API key issues)

4. **Resource Usage**
   - Memory per AppSession
   - WebSocket connection count
   - Timer cleanup (no leaks)

### Better Stack Dashboards

Create dashboards for:

- App start duration histogram
- Error stage breakdown
- Success rate over time
- Per-app metrics (which apps fail most)

### Alerts

Set up alerts for:

- App start success rate < 95%
- p95 latency > 500ms (degradation)
- Error spike (> X failures per minute)

---

## Rollback Plan

If issues are found in production:

1. **Immediate:** Revert `AppManager.ts` export to legacy

   ```typescript
   // AppManager.ts
   export {AppManager as default} from "./AppManager.legacy"
   ```

2. **Redeploy** cloud service

3. **Monitor** for resolution

4. **Debug** issue offline before re-enabling

---

## Success Criteria

✅ **Core functionality:**

- Apps start successfully
- Apps receive CONNECTION_ACK
- Apps can receive messages
- Apps stop cleanly

✅ **Performance:**

- p95 < 400ms (or significant improvement over baseline)
- Fast failure on errors (< 5s worst case)

✅ **Reliability:**

- No crashes or memory leaks
- Proper cleanup on disconnect
- Concurrent operations safe

✅ **Observability:**

- Clear logs for debugging
- Proper error stages
- Duration tracking

---

## Next Steps After Testing

1. **If tests pass:**
   - Merge to main branch
   - Deploy to staging
   - Monitor for 24-48 hours
   - Deploy to production
   - Begin Phase 2 (state migration)

2. **If issues found:**
   - Document issues in GitHub
   - Fix and re-test
   - Don't merge until all tests pass

3. **Phase 2 prep:**
   - Plan state migration from UserSession
   - Audit all direct state access
   - Update call sites to use AppsManager methods
   - Remove bridge code

---

## Contact

For questions or issues during testing:

- GitHub Issues: [project board link]
- Discord: #mentra-dev
- Better Stack: [workspace link]
