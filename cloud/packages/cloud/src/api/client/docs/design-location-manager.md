MentraOS/cloud/packages/cloud/src/api/client/docs/design-location-manager.md

# Design: LocationManager and REST Location API (Cloud-only)

This document specifies a session-scoped LocationManager and a REST-first location update API that mirrors the CalendarManager pattern. It replaces DB persistence for location with in-memory session state while preserving backward compatibility for legacy WebSocket (WS) flows and the SDK.

Scope

- Cloud-only changes (no SDK changes in this phase).
- Introduce a LocationManager attached to each UserSession.
- Add a REST endpoint for mobile clients to send location updates and poll responses.
- Keep legacy WS behavior functional (device-originated updates and commands).
- Do not store location or tiers in the database anymore; use in-memory session state.

Non-goals

- Changing SDK contracts (Apps still receive `CloudToAppMessageType.DATA_STREAM` with `streamType="location_update"`).
- Persisting location in DB or maintaining `effectiveLocationTier` in the DB.
- Rewriting App subscription semantics.

---

## 1) Current State (Summary)

Where location logic lives today:

- Device → Cloud (WS): `LOCATION_UPDATE`
  - `websocket-glasses.service.ts` delegates to `location.service.ts::handleDeviceLocationUpdate(userSession, message)`.
  - Broadcast updates (no correlationId) are forwarded to subscribed Apps.
  - Poll responses (with `correlationId`) are targeted to the requesting App.
  - The last location is persisted to `User.location` in DB (to serve initial cached responses).
- App → Cloud (WS) poll:
  - Apps send `AppToCloudMessageType.LOCATION_POLL_REQUEST` with `correlationId`, `accuracy`.
  - `location.service.ts` tracks pending polls (correlationId → packageName).
  - If location cache is fresh enough, respond immediately; otherwise request a single-fix from device via `REQUEST_SINGLE_LOCATION`.
- App → Cloud (WS) subscriptions:
  - Apps subscribe to `StreamType.LOCATION_UPDATE` or `location_stream` with an accuracy tier.
  - Legacy code computes an “effective” tier (arbitration of all app rates), persists to DB, and sends `SET_LOCATION_TIER` to device.
- SDK:
  - `session.location.subscribeToStream({ accuracy }, handler)`
  - `await session.location.getLatestLocation({ accuracy })`
  - Poll is satisfied by a matching `"location_update"` with the same `correlationId`.

Pain points:

- Location data is persisted in DB and used as cache, which we want to avoid.
- Tier arbitration and state are split across services and DB.
- No REST-first path analogous to calendar.

---

## 2) Target Architecture (E2E Overview)

2.1 Session-scoped LocationManager

- Ownership:
  - Attach `locationManager` to `UserSession`.
- Responsibilities:
  - Maintain last known location in-memory.
  - Handle device-originating updates (WS) and client-originating updates (REST).
  - Manage pending poll requests (correlationId to packageName routing).
  - Handle subscription changes (compute an in-memory effective tier and notify device if WS is connected).
  - Broadcast vs. targeted responses:
    - Broadcast (`no correlationId`): `userSession.relayMessageToApps({ type: location_update, ... })`.
    - Targeted (`correlationId present and pending`): send directly to the requesting App via `CloudToAppMessageType.DATA_STREAM`.
- No database writes for location or effective tier.

  2.2 REST Location API (client → cloud)

- Path: `/api/client/user/location`
  - POST `{ location: { lat, lng, accuracy?, timestamp?, correlationId? } }`
  - Auth: Bearer JWT via `clientAuthWithUserSession` (requires active session).
  - Calls: `userSession.locationManager.updateFromClient(location)`
  - Behavior:
    - Normalize and set timestamp if missing.
    - If `correlationId` matches a pending poll, resolve it and send a targeted response to the App.
    - Otherwise, set as lastLocation and broadcast to subscribed Apps.

  2.3 WS behavior unchanged (back-compat)

- Device WS `LOCATION_UPDATE` → `locationManager.ingestFromDeviceWS(message)`
- Device WS `SET_LOCATION_TIER` and `REQUEST_SINGLE_LOCATION` remain the commands we send to devices when needed.
- On App subscription changes, compute effective tier in-memory and command the device as necessary.

---

## 3) LocationManager Responsibilities and API

State (session-scoped; in-memory):

- `lastLocation?: { lat: number; lng: number; timestamp: Date; accuracy?: number | null; altitude?: number | null; altitudeAccuracy?: number | null; heading?: number | null; speed?: number | null }`
  - Internally supports storing additional fields compatible with Expo LocationObjectCoords for future SDK expansion. Current SDK broadcast remains unchanged (lat/lng/accuracy/timestamp).
- `pendingPolls: Map<string /* correlationId */, string /* packageName */>`
- `effectiveTier?: string` — computed from current app subscriptions (e.g., `"realtime" | "high" | "standard" | "tenMeters" | "hundredMeters" | "kilometer" | "threeKilometers" | "reduced"`)

Public methods:

- `updateFromClient(location: { lat; lng; accuracy?; timestamp?; correlationId? } | ExpoCoords): Promise<void>`
  - REST entrypoint for mobile; normalize location (including mapping from Expo LocationObjectCoords); set timestamp; if correlationId pending → targeted reply; else → update `lastLocation` and broadcast to subscribed Apps.
- `ingestFromDeviceWS(update: LocationUpdate): void`
  - WS entrypoint for device updates; handle targeted poll replies (correlationId) vs. broadcast; update `lastLocation` for broadcast updates.
- `getLastLocation(): { lat; lng; accuracy?; timestamp } | undefined`
  - Used for replay when an App newly subscribes to `location_update`.
- `handlePollRequestFromApp(accuracy: string, correlationId: string, packageName: string): Promise<void>`
  - If `lastLocation` meets freshness for requested accuracy → target reply immediately.
  - Else if device WS is open → send `REQUEST_SINGLE_LOCATION` with correlationId and record a pending poll.
  - Else → leave pending; expect client REST to fulfill with matching correlationId.
- `onSubscriptionChange(appSubscriptions): void`
  - Compute in-memory effective tier across all Apps.
  - If device WS is connected, send `SET_LOCATION_TIER` with the new tier.
- `setEffectiveTier(tier: string): void`
  - Update in-memory and optionally notify device.
- `dispose(): void`
  - Clear state at session end.

Internal helpers:

- Tier definitions and freshness:
  - Define max cache age per tier (e.g., `realtime: 1s`, `high: 10s`, `standard: 30s`, `tenMeters: 30s`, `hundredMeters: 60s`, `kilometer: 5m`, `threeKilometers: 15m`, `reduced: 15m`).
  - A cached location is “fresh enough” if `now - lastLocation.timestamp <= maxCacheAge(tier)`.
- Broadcast:
  - `userSession.relayMessageToApps({ type: StreamType.LOCATION_UPDATE, ... })`.
- Targeted response:
  - Build `DataStream` with `streamType=StreamType.LOCATION_UPDATE` and `data: LocationUpdate` only for the requesting App websocket.
- Device commands:
  - `SET_LOCATION_TIER` and `REQUEST_SINGLE_LOCATION` via device WS as needed.

---

## 4) SDK Usage (for reference; no changes required)

Developers use the SDK LocationManager via `session.location`:

- Subscribe to continuous stream:
  - `session.location.subscribeToStream({ accuracy }, handler)`
  - Cleanup: call the returned function or `session.location.unsubscribeFromStream()`

- One-time intelligent poll:
  - `await session.location.getLatestLocation({ accuracy })`
  - SDK sends `LOCATION_POLL_REQUEST`, listens for `location_update` with matching `correlationId`.

Example:

```/dev/null/sdk-location-usage.ts#L1-40
// Subscribe
const unsubscribe = session.location.subscribeToStream(
  { accuracy: "high" },
  (update) => {
    console.log("Streaming location:", update.lat, update.lng, update.accuracy);
  }
);

// Poll
try {
  const fix = await session.location.getLatestLocation({ accuracy: "hundredMeters" });
  console.log("Polled location:", fix.lat, fix.lng, fix.accuracy);
} catch (e) {
  console.error("Poll failed:", e);
}

// Cleanup
unsubscribe();
```

---

## 5) Message Contracts (Cloud↔App, Cloud↔Device)

Cloud→App (unchanged):

- Broadcast stream:
  - `type: CloudToAppMessageType.DATA_STREAM`
  - `streamType: StreamType.LOCATION_UPDATE`
  - `data: { type: "location_update", lat, lng, accuracy?, timestamp, correlationId? }`
- Targeted poll response:
  - Same shape as above, delivered only to the requesting App websocket, correlationId matches the request.

App→Cloud (unchanged):

- Poll request:
  - `type: AppToCloudMessageType.LOCATION_POLL_REQUEST`
  - `correlationId`, `accuracy`, `packageName`, `sessionId`

Cloud→Device:

- `SET_LOCATION_TIER` (when effective tier changes)
- `REQUEST_SINGLE_LOCATION` (when a poll needs a hardware fix)

---

## 6) REST API (Client→Cloud)

Base path: `/api/client/location`

- POST `/` (location update) // Full path: /api/client/location
  - Auth: Bearer JWT; requires an active `UserSession`.
  - Body (supports simple lat/lng and also Expo LocationObjectCoords mapping):
    - Basic: `{ location: { lat: number; lng: number; accuracy?: number; timestamp?: string | Date } }`
    - Expo: `{ location: { latitude: number; longitude: number; accuracy?: number | null; altitude?: number | null; altitudeAccuracy?: number | null; heading?: number | null; speed?: number | null; timestamp?: string | Date } }`
  - Behavior:
    - Normalize and map Expo fields to internal shape:
      - `latitude -> lat`, `longitude -> lng`
      - Preserve optional extras (accuracy, altitude, altitudeAccuracy, heading, speed) in memory for future SDK expansion.
    - Assign `timestamp` if missing.
    - Update `lastLocation` and broadcast to subscribed Apps (`location_update`).
  - Response:
    - `{ success: true, timestamp: <iso> }`

- POST `/poll-response/:correlationId` (location poll response) // Full path: /api/client/location/poll-response/:correlationId
  - Auth: Bearer JWT; requires an active `UserSession`.
  - Body (supports simple and Expo location payloads, same mapping as above)
  - Behavior:
    - Normalize input and map Expo fields.
    - If `:correlationId` matches a pending poll, send a targeted response to that App and clear the pending entry.
    - If no pending poll exists (stale/late), the manager may ignore or treat as a normal update (implementation choice; default: ignore).
  - Response:
    - `{ success: true, resolved: boolean, timestamp: <iso> }`

Notes:

- No DB writes. This is a pure session-scoped update.
- If the device WS is unavailable, the REST path is the authoritative source of truth for in-session location.
- Expo LocationObjectCoords reference: https://docs.expo.dev/versions/latest/sdk/location/#locationobjectcoords

---

## 7) Wiring and Refactor Plan

1. Create `services/session/LocationManager.ts`

- Implement state, methods, and tier freshness logic.
- Use `userSession.relayMessageToApps` for broadcast; direct App WS for targeted replies.
- Implement device command helpers (`SET_LOCATION_TIER`, `REQUEST_SINGLE_LOCATION`) if device WS is connected.

2. Attach to `UserSession`

- `userSession.locationManager = new LocationManager(this)`

3. Update WS handling:

- In `websocket-glasses.service.ts`, route `LOCATION_UPDATE` to `locationManager.ingestFromDeviceWS(update)`.

4. App subscription replay:

- In `websocket-app.service.ts`, when an App newly subscribes to `LOCATION_UPDATE`, if `userSession.locationManager.getLastLocation()` exists, send a `DATA_STREAM` with that value immediately.

5. Add REST route:

- `/api/client/user/location`
- Auth via `clientAuthWithUserSession`.
- Call `userSession.locationManager.updateFromClient(location)`.

6. Subscription changes:

- On subscription updates (where location stream rates change), call `locationManager.onSubscriptionChange(...)`.
- Compute an in-memory effective tier. If device WS is present, send `SET_LOCATION_TIER` to the device.

7. Deprecate DB writes:

- Remove or bypass DB persistence to `User.location` and `effectiveLocationTier` (only for the new flows).
- Legacy code paths remain but should not be called by the new flow.

---

## 8) Backward Compatibility

- SDK: unchanged; Apps continue to subscribe to `location_update` and poll via `getLatestLocation`.
- Legacy WS devices:
  - `LOCATION_UPDATE` WS messages still work; LocationManager handles them.
  - Device commands `SET_LOCATION_TIER` and `REQUEST_SINGLE_LOCATION` are issued when needed (session-scoped decision).
- Cached replay:
  - Replaying last location on new subscriptions is now sourced from in-memory state instead of DB; behavior is the same for Apps.

---

## 9) Security, Validation, and Limits

- Auth:
  - REST endpoint requires Bearer JWT and an active session; use the same middleware as calendar.
- Validation:
  - Normalize lat/lng to numbers; coerce timestamp to ISO.
- Limits:
  - Consider rate-limiting REST updates to prevent spam or coordinate with device WS updates to reduce flapping.
- Freshness:
  - Per-tier max age policy determines whether a cached location can satisfy a poll request.

---

## 10) Observability

- Structured logs:
  - Pending poll add/remove (correlationId, packageName).
  - Broadcast vs targeted responses (counts, packageName).
  - Effective tier changes and device commands.
- Metrics (future):
  - Poll request count and fulfillment source (cache vs device vs client REST).
  - Stream vs rest update balance.

---

## 11) Testing Plan

- Unit:
  - Poll handling with/without fresh `lastLocation`.
  - CorrelationId path resolution and pending poll cleanup.
  - Effective tier computation for mixed subscriptions.
- Integration:
  - WS (device) + REST (client) mixed updates converge to same App-facing behavior.
  - Replay last location on new subscription.
  - Device commands are sent when effective tier changes.

---

## 12) Open Questions

- Should we implement a dedicated REST endpoint for poll responses? Current design relies on including `correlationId` in normal REST updates.
- Should we add response-level permissions for targeted replies (e.g., ensure the target App is still connected and authorized)?
- Any need to include altitude/speed/bearing in the new location payload shape?

---

## 13) Summary

This design introduces a session-scoped LocationManager that mirrors the CalendarManager pattern: in-memory state with a REST-first path for mobile clients and WS compatibility for legacy devices. It consolidates location streaming, polling, and tier management logic under the session while avoiding database persistence. The SDK and App-facing message contracts remain unchanged, ensuring backward compatibility and a smooth transition to a cleaner, more testable architecture.
