# Start Apps Faster — Feature Spec

## Overview

Reduce app start time by over 2x by removing blocking database calls from the hot path, failing fast on webhook errors, and scoping per-app lifecycle into an AppSession (managed by a lightweight AppManager). Target p95 start time under 400ms (from ~765ms).

## Problem

App start is slow and inconsistent due to unnecessary work and retries in the critical path:

1. Duplicate and excessive DB calls in hot path (~450–850ms total)
   - Duplicate getApp() (route + AppManager)
   - Foreground App.find() to detect conflicts
   - User.findByEmail() + updateAppLastActive() (with retries)
   - User.findOrCreateUser() just to build CONNECTION_ACK
   - getAllApps() inside broadcastAppState()
2. Blocking non-critical operations
   - updateAppLastActive() is on the critical path but not needed to start the app
   - broadcastAppState() refreshes installed apps from DB every time
3. Slow failure path
   - Webhook has retries with exponential backoff (worst case ~23s)
   - Users wait without knowing; manual retry is better UX
4. Monolithic AppManager (single class owns state and lifecycle for all apps)
   - Hard to optimize per-app behavior
   - State scattered across multiple maps; easy to miss cleanup
   - Difficult to test, profile, and evolve incrementally

Result: p95 ~765ms on “happy” path; failures can hang for seconds.

## Constraints

- Cloud-only changes in this phase (no SDK changes).
- Must maintain existing App→Cloud and Client→Cloud message contracts.
- Backward compatible: old paths must still work until new path is validated.
- No schema changes; DB load should decrease (not increase).
- De-risk rollout: require a feature flag and incremental adoption.

## Goals

### Primary

1. Reduce p95 app start latency from ~765ms to <400ms.
2. Remove non-essential DB calls from the hot path (target: 1 auth/validation call).
3. Fail fast on webhook (no retries, 3s timeout) and return clear error to client.
4. Keep broadcast path DB-free (no getAllApps() during broadcast).

### Secondary

1. Move per-app state/lifecycle into AppSession; keep AppManager as orchestrator.
2. Eliminate duplicate getApp() by passing app from route -> AppManager -> AppSession.
3. Replace foreground/conflict DB check with in-memory session view (pilot).
4. Cache installed apps at session init; refresh only on device reconnect; mutate on install/uninstall.

### Success Metrics

| Metric                             | Current              | Target   |
| ---------------------------------- | -------------------- | -------- |
| App start p95                      | ~765 ms              | < 400 ms |
| DB calls in hot path               | 6+                   | 1 (auth) |
| Webhook failure worst-case latency | up to 23 s (retries) | ≤ 3 s    |
| Broadcast installed apps DB reads  | Every broadcast      | 0        |
| Duplicate getApp calls             | 2                    | 0        |

## Non-Goals

- Full AppManager rewrite in one shot (will ship hybrid first).
- Changing App server behavior or SDK message contracts.
- Boot screen UX overhaul (tracked separately).
- Persisting additional state to DB (goal is fewer writes/reads).

## Proposed Behaviors (Spec)

1. Fail Fast: Webhook
   - Single attempt; 3s timeout; no retries.
   - On failure: return `{ success: false, error: { stage: "WEBHOOK", message } }` to client.
   - Client may manually retry immediately.

2. Hot Path DB Policy
   - No duplicate getApp(): route fetches once and passes through.
   - No foreground/conflict DB queries in hot path (pilot: use in-memory session registry).
   - No broadcast-triggered DB refresh of installed apps.

3. Installed Apps Cache (Session-Scoped)
   - Load on session init.
   - Mutate cache on install/uninstall (no full refresh).
   - Refresh on device reconnect (edge case where installs happened on another device).
   - Never refresh cache inside broadcastAppState().

4. AppSession/Manager Division
   - AppSession (per app): start(), stop(), handleConnection(), heartbeat, timers.
   - AppManager (per user): registry, orchestration, message routing, broadcasting.

5. Logging
   - Structured logs with `{ feature: "app-start", phase: <phase> }`.
   - Phases: route-entry, hardware-check, session-create, webhook-trigger, app-init, ack-sent.
   - Measure durations and error stages (WEBHOOK, CONNECTION, AUTHENTICATION, TIMEOUT).

## Scope of Change

- Add AppSession (scaffold) and integrate via feature flag (hybrid).
- Update AppManager start/stop paths to optionally delegate to AppSession.
- Remove getAllApps() from broadcastAppState(); rely on session cache.
- Shorten webhook timeout and remove retries.
- Pass app object from route to AppManager to AppSession (no duplicate getApp()).

## Rollout Strategy

1. Feature Flag: Toggle for new path (default OFF).
2. Pilot: Enable for one high-traffic app flow; monitor logs/metrics.
3. Expand: Roll out to additional app flows.
4. Stabilize: Remove duplicate getApp, remove broadcast DB refresh globally.
5. Cleanup: Remove webhook retry logic; lock caching behavior.

## Risks and Mitigations

- Risk: Hidden dependency on broadcast-time installed apps refresh.
  - Mitigation: Audit call sites; ensure cache updates on install/uninstall; refresh on reconnect.
- Risk: Removing foreground/conflict DB check introduces race conditions.
  - Mitigation: Pilot with in-memory session view; instrument conflicts; fall back if needed.
- Risk: Fail-fast leads to noisier failures.
  - Mitigation: Clear error stages; client can retry; capture metrics to adjust timeout if needed.

## Open Questions

1. Foreground/Conflicts
   - Is in-memory conflict detection sufficient for Phase 1?
   - Do we need cross-session (multi-device) conflict awareness immediately?

2. ACK Content
   - Can we avoid User.findOrCreateUser() in hot path by caching user settings earlier?
   - If not, can we defer ACK settings enrichment post-ACK without breaking apps?

3. Webhook Timeout
   - Is 3s the right default across environments (dev/staging/prod)?
   - Should it be configurable per environment?

4. Device Reconnect Policy
   - Exact triggers to refresh installed apps cache on reconnect?
   - How to handle intermittent connectivity without over-refreshing?

## References

- Design: cloud/packages/cloud/src/api/client/docs/design-app-manager-refactor.md
- Route entry: cloud/packages/cloud/src/routes/apps.routes.ts
- Current AppManager: cloud/packages/cloud/src/services/session/AppManager.ts
- Session structure: cloud/packages/cloud/src/services/session/UserSession.ts
