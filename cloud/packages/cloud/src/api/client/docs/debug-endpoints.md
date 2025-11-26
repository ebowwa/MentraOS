# Debug API Endpoints

Debug endpoints for testing and simulating various connection states during development.

**Base URL**: `/api/client/debug/*`

⚠️ **Note**: These endpoints should only be used in development/staging environments for testing purposes.

---

## Endpoints

### 1. Break Ping/Pong

**POST** `/api/client/debug/break-ping-pong`

Simulates a ping/pong timeout by forcing the WebSocket to close with code 1001 (Ping timeout). This mimics what happens when the mobile device switches WiFi networks and stops responding to pings.

**Use this to test mobile reconnection logic without actually switching networks.**

#### Authentication
- Requires client authentication (Bearer token)
- Uses email from authenticated session

#### Request
```bash
curl -X POST https://api.mentra.glass/api/client/debug/break-ping-pong \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response Success (200)
```json
{
  "success": true,
  "message": "Ping/pong timeout simulated for user isaiahballah@gmail.com. WebSocket will close with code 1001. Mobile should reconnect within 1-5 seconds.",
  "timestamp": "2025-11-25T21:30:00.000Z"
}
```

#### Response Errors

**404 - No Active Session**
```json
{
  "success": false,
  "message": "No active session found for user isaiahballah@gmail.com",
  "timestamp": "2025-11-25T21:30:00.000Z"
}
```

**500 - Failed to Break Connection**
```json
{
  "success": false,
  "message": "Failed to break ping/pong for user isaiahballah@gmail.com. WebSocket might not be open.",
  "timestamp": "2025-11-25T21:30:00.000Z"
}
```

#### What Happens After Calling This Endpoint

1. **Server closes WebSocket** with code `1001` ("Ping timeout - no pong received")
2. **60-second grace period starts** - Apps stay connected
3. **Mobile should detect disconnect** and reconnect automatically
4. **Expected reconnection time**: 1-5 seconds
5. **If mobile doesn't reconnect**: Grace period expires, session disposed

#### Testing Scenarios

**✅ Test successful reconnection:**
1. Call `/break-ping-pong`
2. Check mobile logs - should see disconnect event
3. Mobile should reconnect within 1-5 seconds
4. Apps should resume automatically
5. Transcription should continue

**❌ Test failed reconnection (mobile bug):**
1. Call `/break-ping-pong`
2. If mobile takes > 30 seconds to reconnect
3. Grace period will expire
4. Session will be disposed
5. This indicates a bug in mobile reconnection logic

---

### 2. Force Disconnect

**POST** `/api/client/debug/force-disconnect`

Forcibly terminates the WebSocket connection with code 1006 (abnormal closure). This simulates a network interruption or crash.

**Use this to test how the system handles abrupt connection loss.**

#### Authentication
- Requires client authentication (Bearer token)
- Uses email from authenticated session

#### Request
```bash
curl -X POST https://api.mentra.glass/api/client/debug/force-disconnect \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response Success (200)
```json
{
  "success": true,
  "message": "WebSocket terminated for user isaiahballah@gmail.com. This simulates a network failure (code 1006).",
  "timestamp": "2025-11-25T21:30:00.000Z"
}
```

#### Response Errors

**400 - WebSocket Not Open**
```json
{
  "success": false,
  "message": "WebSocket is not open for user isaiahballah@gmail.com",
  "timestamp": "2025-11-25T21:30:00.000Z"
}
```

**404 - No Active Session**
```json
{
  "success": false,
  "message": "No active session found for user isaiahballah@gmail.com",
  "timestamp": "2025-11-25T21:30:00.000Z"
}
```

#### What Happens After Calling This Endpoint

1. **Server terminates WebSocket** abruptly (no clean close frame)
2. **Connection drops immediately** with code `1006`
3. **Grace period starts**
4. **Mobile detects connection loss**
5. **Mobile should reconnect** automatically

#### Difference from Break Ping/Pong

| Aspect | Break Ping/Pong (1001) | Force Disconnect (1006) |
|--------|------------------------|-------------------------|
| Close Code | 1001 (Ping timeout) | 1006 (Abnormal closure) |
| Clean Shutdown | Yes (proper close frame) | No (connection terminated) |
| Simulates | WiFi switch, slow network | Network failure, app crash |
| Mobile Notification | Receives close event | Connection error |

---

## Usage Examples

### Test WiFi Switch Scenario

```bash
# 1. Ensure mobile app is connected and running
# 2. Call break-ping-pong endpoint
curl -X POST https://debug.augmentos.cloud/api/client/debug/break-ping-pong \
  -H "Authorization: Bearer $TOKEN"

# 3. Watch Better Stack logs for:
#    - "Phone connection timeout - no pong for 30002ms"
#    - "Glasses connection closed (1001, Ping timeout)"
#    - Mobile reconnection logs (should happen within 1-5 seconds)

# 4. Expected behavior:
#    - Mobile detects disconnect
#    - Mobile reconnects automatically
#    - Apps continue running
#    - Transcription resumes
```

### Test Network Failure Scenario

```bash
# 1. Call force-disconnect endpoint
curl -X POST https://debug.augmentos.cloud/api/client/debug/force-disconnect \
  -H "Authorization: Bearer $TOKEN"

# 2. Watch Better Stack logs for:
#    - "Glasses connection closed (1006)"
#    - Mobile error/disconnect detection
#    - Mobile reconnection attempt

# 3. Expected behavior:
#    - Mobile detects connection error
#    - Mobile reconnects automatically
#    - Full session restoration
```

---

## Monitoring Reconnection

### Better Stack Queries

**Check for ping/pong timeout:**
```
userId:"YOUR_EMAIL" AND message:"pongTimeout"
```

**Check for reconnection success:**
```
userId:"YOUR_EMAIL" AND (message:"Glasses WebSocket connection" OR message:"connection established")
```

**Check grace period expiration:**
```
userId:"YOUR_EMAIL" AND message:"Grace period expired"
```

### Expected Log Sequence (Successful Reconnection)

```
20:55:26.867 | ERROR | Phone connection timeout - no pong for 30002ms
20:55:26.867 | INFO  | Closing zombie WebSocket connection
20:55:26.868 | WARN  | Glasses connection closed (1001, Ping timeout)
20:55:27.xxx | INFO  | Glasses WebSocket connection from user (reconnection)
20:55:27.xxx | INFO  | User session created and registered
20:55:27.xxx | INFO  | Apps resurrecting...
20:55:28.xxx | INFO  | All apps running
```

### Expected Log Sequence (Failed Reconnection)

```
20:55:26.867 | ERROR | Phone connection timeout - no pong for 30002ms
20:55:26.867 | INFO  | Closing zombie WebSocket connection
20:55:26.868 | WARN  | Glasses connection closed (1001, Ping timeout)
... 60 seconds pass with no reconnection ...
20:56:26.868 | DEBUG | Cleanup grace period expired
20:56:26.868 | DEBUG | User session determined not reconnected, cleaning up
20:56:26.868 | WARN  | Disposing UserSession
```

---

## Implementation Details

### Server-Side Code

The endpoint calls `userSession.breakPingPong()` which:
```typescript
// UserSession.ts
public breakPingPong(): boolean {
  if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
    // Close with same code and message as real pong timeout
    this.websocket.close(1001, "Ping timeout - no pong received");
    return true;
  }
  return false;
}
```

### Mobile Client Expected Behavior

When the mobile app receives a disconnect event:
1. **Detect network status** - Check if network is available
2. **Initiate reconnection** - Don't wait for user action
3. **Retry with backoff** - Exponential backoff (1s, 2s, 4s, etc.)
4. **Reconnect within grace period** - Must reconnect < 60 seconds
5. **Resume session** - Apps should continue from where they left off

---

## Troubleshooting

### Mobile Not Reconnecting

**Symptom**: Mobile takes > 30 seconds to reconnect after calling `/break-ping-pong`

**Possible Causes**:
- Mobile WebSocket client not detecting disconnect
- No network change listener configured
- Reconnection logic not implemented
- Background task suspended by OS
- No retry mechanism

**Fix**: Implement network change detection and auto-reconnect on mobile

### Apps Not Resuming After Reconnection

**Symptom**: Mobile reconnects but apps don't restart

**Possible Causes**:
- Grace period expired before reconnection
- App state not persisted
- Apps marked as "stopped" instead of "grace_period"

**Fix**: Check `runningApps` state in cloud logs during grace period

### Grace Period Expiring Too Fast

**Symptom**: Session disposed before mobile can reconnect

**Current Setting**: 60 seconds grace period

**Recommendation**: 
- For network changes: 60s is appropriate
- For development testing: Consider increasing to 120s
- For production: 60s forces fast reconnection (good for UX)

---

## Best Practices

1. **Always test on real device** - Network behavior differs on simulators
2. **Test with actual WiFi switches** - Verify real-world behavior
3. **Monitor Better Stack** - Watch logs during testing
4. **Test background scenarios** - Mobile in background during disconnect
5. **Test poor network conditions** - Use network link conditioner
6. **Measure reconnection time** - Should be < 5 seconds consistently

---

## Related Documentation

- [LiveKit Mobile Reconnection Bug Investigation](../../../issues/003-livekit-mobile-reconnection-bug/README.md)
- [WebSocket Heartbeat Implementation](../services/session/UserSession.ts)
- [Grace Period Logic](../services/websocket/websocket-glasses.service.ts)