# Types Consolidation Architecture

## Current System

### Package Structure

```
cloud/packages/sdk/
├── src/
│   ├── types/
│   │   ├── index.ts                    # Mixed: protocol + SDK types
│   │   ├── messages/
│   │   │   ├── client-cloud.ts         # Client-cloud protocol
│   │   │   └── cloud-to-app.ts         # App-cloud protocol
│   │   ├── capabilities.ts             # Hardware capabilities
│   │   ├── rtmp-stream.ts              # Streaming types
│   │   ├── photo-data.ts               # Media types
│   │   ├── token.ts                    # Auth types
│   │   └── webhooks.ts                 # Webhook types
│   ├── app/
│   │   └── session/
│   │       ├── index.ts                # AppSession (imports types)
│   │       ├── dashboard.ts            # Dashboard implementation
│   │       └── modules/                # Camera, audio, etc.
│   └── index.ts                        # Main SDK export
└── package.json
```

### Key Code Paths

**Type Imports in AppSession** (`cloud/packages/sdk/src/app/session/index.ts`):

```typescript
import {
  CloudToAppMessage,
  AppToCloudMessage,
  isRtmpStreamStatus,
  isSettingsUpdate,
  // ... 20+ type imports
} from "../../types"
```

**Circular Dependency** (`cloud/packages/types/src/capabilities/even-realities-g1.ts`):

```typescript
// WRONG: Creates circular dependency
import { CameraCapabilities } from "@mentra/sdk"

// RIGHT: Import from same package
import { CameraCapabilities } from "../hardware"
```

### Problems

1. **Cannot build headless client**
   - `@mentra/client-sdk` needs types but importing from `@mentra/sdk` pulls in Express, WebSocket server
   - Circular dependency: types → SDK → types

2. **Type duplication and conflicts**
   - `RtmpStreamStatus` in both client-cloud and app-cloud with different enum types
   - `AudioPlayResponse` in both protocols
   - Type guards like `isRtmpStreamStatus` conflict

3. **Unclear ownership**
   - Are types in `sdk/src/types/` protocol types or SDK types?
   - Dashboard types mixed with implementation

## Proposed System

### Package Structure

```
cloud/packages/types/                    # NEW: Protocol types only
├── src/
│   ├── index.ts                        # Explicit exports (Bun compatible)
│   ├── enums.ts                        # HardwareType, AppType, etc.
│   ├── streams.ts                      # StreamType, language codes
│   ├── hardware.ts                     # Capabilities interfaces
│   ├── dashboard.ts                    # Dashboard types + API interfaces
│   ├── rtmp-stream.ts                  # Streaming configuration
│   ├── media.ts                        # PhotoData
│   ├── layouts.ts                      # Display layouts
│   ├── messages/
│   │   ├── base.ts                     # BaseMessage
│   │   ├── client-cloud.ts             # Client ↔ Cloud protocol
│   │   └── app-cloud.ts                # App ↔ Cloud protocol
│   ├── api/
│   │   ├── apps.ts                     # AppConfig, Permission, etc.
│   │   ├── webhooks.ts                 # Webhook types
│   │   └── auth.ts                     # Token types
│   └── capabilities/
│       ├── even-realities-g1.ts        # Device-specific caps
│       ├── mentra-live.ts
│       ├── simulated-glasses.ts
│       └── vuzix-z100.ts
├── package.json
└── tsconfig.json

cloud/packages/sdk/                      # UPDATED: Re-exports types
├── src/
│   ├── types/
│   │   └── index.ts                    # Re-exports from @mentra/types
│   ├── app/
│   │   └── session/
│   │       ├── index.ts                # AppSession (SDK implementation)
│   │       ├── dashboard.ts            # Dashboard managers
│   │       └── modules/                # Camera, audio, etc.
│   └── index.ts
├── package.json                        # Adds @mentra/types dependency
└── tsconfig.json

cloud/packages/client-sdk/               # NEW: Headless client
├── src/
│   ├── index.ts                        # Client SDK
│   └── connection.ts                   # WebSocket client
├── package.json                        # Depends only on @mentra/types
└── tsconfig.json
```

### Key Changes

1. **Clean dependency graph**
   ```
   @mentra/types (no deps)
        ↑
        ├── @mentra/sdk
        └── @mentra/client-sdk
   ```

2. **Explicit exports for Bun compatibility**
   ```typescript
   // cloud/packages/types/src/index.ts
   
   // Enums (runtime values)
   export { HardwareType, StreamType } from "./enums"
   
   // Types (compile-time only)
   export type { CloudToAppMessage, AppToCloudMessage } from "./messages/app-cloud"
   
   // Type guards with aliases to avoid conflicts
   export {
     isRtmpStreamStatus as isRtmpStreamStatusFromCloud,
     isAudioPlayResponse as isAudioPlayResponseFromApp,
   } from "./messages/app-cloud"
   ```

3. **Backward compatibility layer**
   ```typescript
   // cloud/packages/sdk/src/types/index.ts
   
   // Re-export everything from @mentra/types
   export * from "@mentra/types"
   
   // SDK-specific types (not in @mentra/types)
   export interface AuthenticatedRequest extends Request {
     packageName: string
     sessionId: string
   }
   ```

### Implementation Details

#### Type Guard Aliasing

**Problem**: Both protocols have `isRtmpStreamStatus` but with different signatures

**Solution**: Export with aliases

```typescript
// cloud/packages/types/src/messages/client-cloud.ts
export function isRtmpStreamStatus(msg: GlassesToCloudMessage): msg is RtmpStreamStatus {
  return msg.type === GlassesToCloudMessageType.RTMP_STREAM_STATUS
}

// cloud/packages/types/src/messages/app-cloud.ts
export function isRtmpStreamStatus(msg: CloudToAppMessage): msg is AppRtmpStreamStatus {
  return msg.type === CloudToAppMessageType.RTMP_STREAM_STATUS
}

// cloud/packages/types/src/index.ts
export {
  isRtmpStreamStatus as isRtmpStreamStatusFromGlasses
} from "./messages/client-cloud"

export {
  isRtmpStreamStatus as isRtmpStreamStatusFromCloud
} from "./messages/app-cloud"
```

**Usage in SDK**:

```typescript
// cloud/packages/sdk/src/app/session/index.ts
import {
  isRtmpStreamStatusFromCloud as isRtmpStreamStatus
} from "../../types"

if (isRtmpStreamStatus(message)) {
  // TypeScript knows message is AppRtmpStreamStatus
}
```

#### Dashboard API Separation

**Types** (in `@mentra/types`):

```typescript
// cloud/packages/types/src/dashboard.ts

export interface DashboardAPI {
  mode: DashboardMode
  setMode(mode: DashboardMode): Promise\u003cvoid\u003e
  content: DashboardContentAPI
  system?: DashboardSystemAPI  // Optional: only for system dashboard
}

export interface DashboardContentAPI {
  update(content: string, modes?: DashboardMode[]): Promise\u003cvoid\u003e
  clear(modes?: DashboardMode[]): Promise\u003cvoid\u003e
}

export interface DashboardSystemAPI {
  update(section: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight', content: string): Promise\u003cvoid\u003e
  clear(section: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'): Promise\u003cvoid\u003e
}
```

**Implementation** (in `@mentra/sdk`):

```typescript
// cloud/packages/sdk/src/app/session/dashboard.ts

export class DashboardManager implements DashboardAPI {
  public content: DashboardContentAPI
  public system?: DashboardSystemAPI
  public mode: DashboardMode = DashboardMode.MAIN

  constructor(session: AppSession) {
    this.content = new DashboardContentManager(session, ...)
    
    if (packageName === SYSTEM_DASHBOARD_PACKAGE_NAME) {
      this.system = new DashboardSystemManager(session, ...)
    }
  }

  async setMode(mode: DashboardMode): Promise\u003cvoid\u003e {
    this.mode = mode
    if (this.system) {
      (this.system as any).setViewMode(mode)
    }
  }
}
```

#### Missing Type: PackagePermissions

**Problem**: `permissions-utils.ts` uses `PackagePermissions` but it's not defined

**Solution**: Add to `@mentra/types`

```typescript
// cloud/packages/types/src/api/apps.ts

export interface PackagePermissions {
  packageName: string
  permissions: Permission[]
}

// cloud/packages/types/src/index.ts
export type {
  PackagePermissions,
  Permission,
  // ...
} from "./api/apps"
```

## Migration Strategy

### Phase 1: Create `@mentra/types` ✅

1. Create package structure
2. Move core types from SDK
3. Add explicit exports for Bun
4. Build and verify

### Phase 2: Update `@mentra/sdk` ✅

1. Add `@mentra/types` dependency
2. Update `src/types/index.ts` to re-export
3. Fix circular dependencies in capabilities
4. Update all internal imports

### Phase 3: Fix Build Errors (Current)

1. Export `PackagePermissions` type
2. Fix type narrowing issues in `session/index.ts`
3. Resolve `tsconfig.json` overwrite error
4. Add missing type guards
5. Fix type casting in `camera.ts`

### Phase 4: Verify and Test

1. Build `@mentra/types` successfully
2. Build `@mentra/sdk` successfully
3. Run existing app tests
4. Verify no breaking changes

### Phase 5: Implement `@mentra/client-sdk`

1. Create new package depending only on `@mentra/types`
2. Implement WebSocket client
3. Implement message handlers
4. Add examples and documentation

## Rollout Plan

1. **Week 1**: Complete Phase 3 (fix build errors)
2. **Week 1**: Complete Phase 4 (verify and test)
3. **Week 2**: Complete Phase 5 (implement client SDK)
4. **Week 2**: Update documentation and examples

## Open Questions

1. **`tsconfig.json` overwrite error**
   - Current error: `Cannot write file '.../dist/index.d.ts' because it would overwrite input file`
   - Options:
     - Change `outDir` to `dist/compiled`
     - Change `declarationDir` to `dist/types`
     - Exclude `dist/` from `include`
   - **Need to investigate**: Which approach is cleanest?

2. **Type narrowing for `PermissionError`**
   - Problem: `isPermissionError(message)` doesn't narrow type enough to access `message.details`
   - Cause: `PermissionError` might not be in `CloudToAppMessage` union
   - **Fixed**: Added `PermissionError` to union, need to verify

3. **`AppSession` in `ToolCall`**
   - Current: `any` to avoid circular dependency
   - Options:
     - Generic parameter: `ToolCall\u003cTSession\u003e`
     - Separate interface: `ToolCallContext`
     - Keep as `any` (simplest)
   - **Deferred**: Handle during client SDK implementation

## Success Metrics

- `@mentra/types` build time: \u003c 2s ✅
- `@mentra/sdk` build time: \u003c 10s (target)
- Zero circular dependencies ✅
- All existing apps work without changes (target)
- `@mentra/client-sdk` can be implemented (target)
