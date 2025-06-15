---
sidebar_position: 9
title: Dashboard API
---

# Dashboard API

This page documents all classes, enums, and methods you can use to interact with the AugmentOS dashboard from your app.

## Overview

Every [`TpaSession`](/reference/tpa-session) exposes a `dashboard` property:

| Property | Type | Purpose |
| :------- | :--- | :------ |
| `session.dashboard.content` | [`DashboardContentAPI`](#dashboardcontentapi) | Available to apps for writing content |

Internally the SDK converts your method calls into WebSocket messages that the cloud routes to the user's glasses.  You never have to construct layouts manually.

## DashboardMode enum

```typescript
enum DashboardMode {
  MAIN = 'main',       // Standard dashboard (default)
  EXPANDED = 'expanded', // Larger dashboard the user opens explicitly
  // ALWAYS_ON = 'always_on'  // Compact overlay (coming soon)
}
```

Use these values whenever a method accepts a *mode* parameter.

## DashboardContentAPI

Interface implemented by `session.dashboard.content`.

| Method | Signature | Description |
| :----- | :-------- | :---------- |
| `write` | `(content: string, targets?: DashboardMode[]) => void` | Send content to one or more dashboard modes. *targets* defaults to `[DashboardMode.MAIN]`. |
| `writeToMain` | `(content: string) => void` | Convenience wrapper around `write(content, [DashboardMode.MAIN])`. |
| `writeToExpanded` | `(content: string) => void` | Convenience wrapper around `write(content, [DashboardMode.EXPANDED])`. |
| `getCurrentMode` | `() => Promise<DashboardMode>` | Resolve to the mode currently visible on the user's glasses (or `'none'` when the dashboard is closed). |
| `onModeChange` | `(handler: (mode: DashboardMode) => void) => () => void` | Register a callback for mode transitions. Returns an *unsubscribe* function. |

### Example

```typescript
// Send headline to main mode
session.dashboard.content.writeToMain('✅ Build succeeded');

// Provide details when user expands dashboard
session.dashboard.content.writeToExpanded('All tests passed on branch dev.');

// React to mode changes
const unsubscribe = session.dashboard.content.onModeChange((mode) => {
  if (mode === DashboardMode.MAIN) {
    console.log('Dashboard collapsed – switched to compact mode');
  }
});

// ... later
unsubscribe();
```

## DashboardAPI

```typescript
interface DashboardAPI {
  content: DashboardContentAPI;
}
```

Every `TpaSession` constructs this object and assigns it to `session.dashboard`.

## Message Types (advanced)

The SDK handles these for you, but they are listed here for completeness:

| Message | `type` value | Sent By | Purpose |
| :------ | :----------- | :------ | :------ |
| `DashboardContentUpdate` | `dashboard_content_update` | App | New content for dashboard |

These map 1-to-1 to the TypeScript interfaces in `@augmentos/sdk/src/types/dashboard`.

## Frequently Asked Questions

### Can I send layouts or images?

Not yet.  The first release supports **plain text** only.  Rich layouts and images are on the roadmap.

### What happens if I write multiple times in a row?

The dashboard keeps only the **latest** message per app per mode.  Writing a new message replaces your previous one.

### Is there a character limit?

Yes—keep messages under **60 characters** for *main* and **250 characters** for *expanded* to avoid truncation.  (Subject to change.)
