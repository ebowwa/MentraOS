# Start Apps Faster

Cut app start time by >2x by removing DB calls from the hot path, failing fast on webhook errors, and moving per-app logic out of the monolithic AppManager into AppSession.

## Documents

- start-apps-faster-spec.md — Problem, goals, constraints
- start-apps-faster-architecture.md — Technical design and implementation plan

## Quick Context

Current: App start runs through a monolithic AppManager that does multiple DB calls (getApp, foreground check, lastActive, user/profile hydration, installed apps refresh). Webhook has retries and long timeouts. Broadcast path re-reads installed apps from DB. p95 ~765ms.

Proposed: AppSession per app + lightweight AppManager registry. Eliminate duplicate DB calls, remove DB from broadcast path, fire-and-forget non-critical writes, fail fast (no webhook retries, shorter timeouts). Target p95 <400ms.

## Key Context

We enumerated all DB calls in the current start flow and confirmed 6+ blocking queries on the hot path:

- getApp (duplicate of route-level fetch)
- foreground App.find
- User.findByEmail + updateAppLastActive (with retries)
- findOrCreateUser for CONNECTION_ACK
- getAllApps during broadcastAppState

Additionally, webhook retries with exponential backoff escalate failures to >20 seconds. We’ll fail fast and let the user retry.

## Status

- [x] Enumerated all DB calls in current start path (with durations)
- [x] Drafted refactor docs (spec + architecture)
- [x] Defined installed apps cache refresh strategy (load on session init, mutate on install/uninstall, refresh on device reconnect; never in broadcast)
- [x] Decided to fail fast (remove webhook retries; reduce timeout)
- [x] Chosen rollout approach (feature flag + hybrid path)
- [ ] Add AppSession skeleton (no behavior yet)
- [ ] Gate new path behind feature flag in AppManager
- [ ] Move one pilot app flow into AppSession for validation
- [ ] Remove duplicate getApp call by passing app from route
- [ ] Remove installed apps DB refresh from broadcastAppState
- [ ] Shorten webhook timeout and remove retries

## Key Metrics

| Metric                             | Current              | Target        |
| ---------------------------------- | -------------------- | ------------- |
| App start p95                      | ~765 ms              | < 400 ms      |
| DB calls in hot path               | 6+                   | 1 (auth)      |
| Webhook failure worst-case latency | up to 23 s (retries) | ≤ 3 s         |
| Broadcast installed apps DB reads  | every broadcast      | 0 in hot path |
| Duplicate getApp calls             | 2                    | 0             |

## Scope

- Cloud-only changes (no SDK changes).
- AppSession per running app for state and lifecycle.
- AppManager refactored to orchestrator/registry.
- No DB reads in broadcast; limited, targeted reads in start path.
- Fail fast: remove webhook retries, shorten timeouts, surface to client.

## Out of Scope

- App server changes
- Boot screen UX changes
- Full AppManager rewrite in one pass (hybrid first)
- Persistent cross-session app state beyond current behavior

## Rollout Plan

- Implement feature-flagged hybrid path (legacy vs AppSession)
- Pilot on one high-traffic app flow
- Monitor Better Stack logs for { feature: "app-start" }
- Rollout to remaining apps after validation
- Remove legacy paths once stable

## Links

- design-app-manager-refactor.md — Full refactor context and DB call breakdown
- BetterStack search filter: feature:"app-start"
