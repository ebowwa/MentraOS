# Meta Integration Status

## Working Branch (Current)

- **Branch:** `wip/feat/meta-integration-relay`
- **Base:** `ae5dbcf09` - "feat: Add Meta streaming configuration (resolution/frame rate) with React Native integration"
- **Status:** ✅ Working - builds successfully
- **Remote:** `origin/wip/feat/meta-integration-relay`

## Archive Branch (Broken)

- **Branch:** `archive/ios/meta-integration-broken-spm`
- **Tracked:** `origin/feat/meta-rayban-integration`
- **Status:** ❌ Broken - SPM refactor caused build failures
- **Head:** `1916b3bc2`

---

## Commits Ahead of Working Branch

### 1. `578b2a05c` - ❌ BROKEN (The SPM Refactor)

**Message:** feat(meta): add cloud relay + SPM improvements + release:local build profile

**Files Changed:**
| File | Lines Changed | Description | Status |
|------|---------------|-------------|--------|
| `modules/core/plugin/src/withIos.ts` | +??? / -??? | SPM refactor - complex regex-based package injection | ❌ BROKEN - Avoided |
| `app.config.ts` | +??? / -??? | Sentry re-enabled + formatting | - |
| `eas.json` | +??? / -??? | Added `release:local` and `release:local:simulator` build profiles | - |
| `src/services/SocketComms.ts` | +??? / -??? | Added `sendVideoFrame()` function | ✅ Already added to wip |
| `src/bridge/MantleBridge.tsx` | +??? / -??? | Added video frame relay call | ✅ Already added to wip |
| `src/app/index.tsx` | +??? / -??? | Unknown changes | - |

**Issue:** The `withIos.ts` SPM refactor used complex regex manipulation to inject Swift Package Manager references into `project.pbxproj`. This approach is fragile and failed at commit `578b2a05c`.

**Resolution:** Kept working branch at `ae5dbcf09` (before refactor) and manually added back only the video relay features.

---

### 2. `bad2d71e9` - EAS Build Profiles Documentation

**Message:** docs: add EAS build profiles documentation for release:local builds

**Status:** ⏸️ Not yet added

---

### 3. `8f587ea87` - Streaming Orientation Config

**Message:** feat(meta): add streaming orientation config and verify DAT SDK resolutions

**Status:** ⏸️ Not yet added

---

### 4. `0bd46ccf5` - Add Files via Upload

**Message:** Add files via upload

**Status:** ⏸️ Not yet added

---

## Items to Cherry-Pick Later

| Feature                      | Commit      | Priority    | Notes                                            |
| ---------------------------- | ----------- | ----------- | ------------------------------------------------ |
| EAS build profiles           | `bad2d71e9` | Medium      | Adds `release:local` build configuration         |
| Streaming orientation config | `8f587ea87` | Medium      | Adds resolution/frame rate config verification   |
| **SPM refactor**             | `578b2a05c` | **BLOCKED** | Needs complete rewrite - current approach broken |

---

## What Was Successfully Added to wip Branch

From commit `578b2a05c`, we successfully recovered:

1. ✅ **Video Frame Relay** (`SocketComms.ts`)
   - `sendVideoFrame(base64, timestamp, quality)` function
   - Relays Meta glasses video to Mentra cloud via WebSocket

2. ✅ **Video Frame Relay Hookup** (`MantleBridge.tsx`)
   - Calls `socketComms.sendVideoFrame()` when frames received from Core
   - Enables cloud streaming for Meta glasses

3. ✅ **Auto-Connect on Startup** (`Reconnect.tsx`)
   - New feature: automatically connects to Meta glasses on app launch
   - Checks if `default_wearable` is `meta_rayban`
   - Calls `CoreModule.initializeDefault()`

4. ✅ **Core Module Initialization** (`CoreManager.swift`, `CoreModule.swift`)
   - Added `handle_initialize_default()` method
   - Exposed `initializeDefault()` to React Native
   - Allows SGC initialization without requiring `deviceName`

---

## Branch Structure Summary

```
archive/ios/meta-integration-broken-spm  ─┐
├── ae5dbcf09 (working commit)           │
├── 578b2a05c ❌ (SPM refactor - BROKEN)  │
├── bad2d71e9 (EAS docs)                   │
├── 8f587ea87 (orientation config)          │
├── 0bd46ccf5 (file uploads)               │
├── 219bfb045 (merge)                      │
├── 10b2e5bd9 (rename)                     │
├── 65b2d5ea6 (merge)                      │
└── 1916b3bc2 (merge)                      │
                                        │
wip/feat/meta-integration-relay ◄───────┘ (based on ae5dbcf09 + your fixes)
├── 1caa96c09 (your fixes)
│   ├── Auto-connect on startup
│   ├── Video frame relay to cloud
│   └── Core initialization improvements
```

---

## Next Steps

1. ✅ Test `wip/feat/meta-integration-relay` - builds and works
2. ⏸️ Cherry-pick `bad2d71e9` (EAS build profiles) if needed
3. ⏸️ Cherry-pick `8f587ea87` (orientation config) if needed
4. ❌ Fix SPM refactor (`578b2a05c`) - requires complete rewrite
