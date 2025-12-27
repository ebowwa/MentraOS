## Subscription consistency and race-condition hardening

### Summary

This document describes the subscription races we observed during App reconnects and rapid subscription changes, and the robust, backward-compatible fixes we implemented on the server to make subscription state ordered, atomic, and stable without requiring Apps/SDK updates.

### Symptoms we observed

- Microphone state flapping: logs show transitions from media=true to media=false milliseconds later, triggering “unauthorized audio” guards.
- Apps unexpectedly lose active transcription/translation (language) subscriptions after reconnect.
- Derived state (e.g., minimal language set) read immediately after an update reflects stale data.

### Root causes

1. Out-of-order application on the server
   - The App WebSocket handler kicked off `updateSubscriptions(...)` and did not await it; multiple updates were processed concurrently and could finish out of order.
   - Immediately reading derived state after kicking off an async update returned stale values.

2. Reconnect timing and empty snapshots
   - Apps often send one or more quick updates around reconnects. An empty snapshot arriving slightly later would overwrite the non-empty set, especially on slower networks.
   - The “ignore empty right after reconnect” grace window was too short for real-world reconnect latencies.

3. App resurrection clearing state
   - On resurrection, server-side logic removed subscriptions before the new connection resent its snapshot, creating windows of “no subs.”

### Design goals

- Strong ordering: the subscription state should reflect the order of updates received over the active WebSocket.
- Atomicity: each update applies as one unit and produces consistent derived state.
- Backward-compatible: do not require Apps/SDK to change payloads or upgrade immediately.
- Efficient reads: typical queries should be O(1) without scanning whole maps.
- Clear observability for diagnosing timing issues.

### Server-side hardening (backward-compatible)

1. Per-app serialization (mutex/queue)
   - We serialize `updateSubscriptions(packageName, ...)` per App using a simple promise chain. This guarantees only one update executes at a time for a given App and preserves arrival order.
   - File: `cloud/packages/cloud/src/services/session/SubscriptionManager.ts` (per-app `updateChainsByApp`).

2. Await subscription updates in the WebSocket handler
   - `websocket-app.service.ts` now awaits `subscriptionManager.updateSubscriptions(...)` before reading derived state or scheduling side-effects.
   - Prevents reading stale state right after kicking off an async update.

3. More robust empty-snapshot handling during reconnects
   - Extended the reconnect grace window to ignore empty updates for a longer period after `markAppReconnected(...)`.
   - This avoids accidental wipes caused by late “empty” updates on slow networks.

4. Atomic derived-state updates and O(1) reads
   - We maintain cached aggregates alongside per-app sets:
     - `pcmSubscriptionCount` (any App has `audio_chunk`)
     - `transcriptionLikeSubscriptionCount` (direct transcription/translation or language streams)
     - `languageStreamCounts` (map `ExtendedStreamType` -> refcount)
   - Public read APIs now use these cached aggregates:
     - `hasPCMTranscriptionSubscriptions()` becomes O(1)
     - `getMinimalLanguageSubscriptions()` returns keys with count > 0 (O(1) over a small set)
   - We compute deltas atomically via `applyDelta(oldSet, newSet)` to update aggregates in place.

5. Side-effect stability
   - Managers (Transcription/Translation) and `MicrophoneManager` are updated only after the atomic write and aggregate recalculation complete.
   - Debouncing at higher layers remains (e.g., for stream (re)creation), but it now operates on stable, ordered state.

### Optional future SDK protocol hardening (not required now)

- Add `epoch` (per-connection) and `version` (monotonic per snapshot) to `AppSubscriptionUpdate`:
  - Server ignores updates from non-active epochs (old sockets).
  - Server discards out-of-order versions.
- Server replies with `SubscriptionAck { epoch, version, rejected[] }` for idempotency and self-healing.
- These strengthen ordering across reconnects but are not necessary for today’s server-only improvements.

### Data model overview (server)

- Per-app in-memory set: `Map<packageName, Set<ExtendedStreamType>>`
- Aggregates (session-scoped):
  - `pcmSubscriptionCount: number`
  - `transcriptionLikeSubscriptionCount: number`
  - `languageStreamCounts: Map<ExtendedStreamType, number>`
- Reconnect grace timestamps: `lastAppReconnectAt: Map<packageName, number>`
- Per-app update chain: `updateChainsByApp: Map<packageName, Promise<unknown>>`

### Why this works

- Ordering: per-app serialization + awaiting handler ensures updates apply in the exact order they arrive over the active WebSocket.
- Atomicity: we update base sets and aggregates together before side-effects.
- Reconnect stability: empty wipes are much less likely; the window is longer and tied to the server-side reconnect marker.
- Performance: common reads are O(1) via aggregates; no repeated scanning of all app sets.

### Backward compatibility

- No SDK changes are required. Existing Apps continue to send `SUBSCRIPTION_UPDATE` as before.
- The server’s stronger ordering and empty handling remove flapping without breaking clients.

### Observability

- Add structured logs around `updateSubscriptions`:
  - `{ packageName, isEmpty, countsBefore/After, durationMs }`
- Counters we can track long-term:
  - `subscription_updates_applied`
  - `subscription_updates_ignored_empty_during_reconnect`
  - `subscription_updates_errors`

### Test plan

- Concurrency: fire N updates in quick succession (mixed empty/non-empty). Verify final state matches last arrival order.
- Reconnect: send a non-empty, then an empty shortly after reconnect—empty during grace is ignored; after grace it applies.
- Derived state: verify `hasPCMTranscriptionSubscriptions()` and `getMinimalLanguageSubscriptions()` reflect the set accurately after each update.
- Side-effects: ensure mic/transcription managers are invoked only after state is committed and reflect the aggregates.

### Trade-offs and future enhancements

- Server-only changes fix the vast majority of races today. For absolute robustness across old-vs-new sockets, the epoch/version SDK enhancement can be layered in later without changing server behavior.
- If Apps need explicit empty clears, we can add a `clear: true` semantic guard in the future to avoid accidental empties.

### Files touched (server)

- `cloud/packages/cloud/src/services/session/SubscriptionManager.ts`
  - Added per-app update chaining, cached aggregates, delta application, extended reconnect grace
  - Kept public API stable
- `cloud/packages/cloud/src/services/websocket/websocket-app.service.ts`
  - Await `handleSubscriptionUpdate` → awaits `updateSubscriptions` before reading derived state

These changes provide ordered, atomic, and observable subscription state, stabilizing downstream components (mic, transcription) without requiring SDK updates.
