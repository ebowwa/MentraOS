# Types Consolidation Spec

## Overview

Extract all shared protocol type definitions from `@mentra/sdk` into a standalone `@mentra/types` package to enable headless client SDK development without circular dependencies.

## Problem

Technical problems blocking headless client SDK:

1. **Circular Dependencies**: `@mentra/client-sdk` needs protocol types, but `@mentra/sdk` depends on server-side logic that would create circular imports
   - Evidence: Cannot import types from `@mentra/sdk` without pulling in Express, WebSocket server code
   - Impact: Headless client SDK is blocked

2. **Type Duplication**: Client-cloud and app-cloud protocols have overlapping types with different enum values
   - Example: `RtmpStreamStatus` uses `GlassesToCloudMessageType.RTMP_STREAM_STATUS` vs `CloudToAppMessageType.RTMP_STREAM_STATUS`
   - Result: Type guards and message handlers need careful aliasing

3. **Bun Runtime Compatibility**: Bun can't handle `export *` for type re-exports
   - Constraint: Must use explicit `export type { ... }` for interfaces/types
   - Constraint: Must use `export { ... }` for enums (runtime values)

4. **Scattered Type Definitions**: Types spread across multiple locations
   - `cloud/packages/sdk/src/types/` - Mixed protocol and SDK types
   - `cloud/packages/sdk/src/app/session/` - Dashboard, capabilities inline
   - Result: Hard to maintain, unclear ownership

### Constraints

- **Backward Compatibility**: Existing `@mentra/sdk` consumers must not break
  - Solution: Re-export all types from `cloud/packages/sdk/src/types/index.ts`
  
- **Bun Runtime**: Must work with Bun's type system limitations
  - Solution: Explicit exports, no `export *`

- **Build Performance**: Adding new package shouldn't slow down builds
  - Target: `@mentra/types` build \u003c 2s

## Goals

1. **Single Source of Truth**: All protocol types in `@mentra/types`
   - Client-cloud protocol types
   - App-cloud protocol types
   - Hardware capabilities
   - Dashboard, webhooks, auth types
   - Type guards with proper aliasing

2. **Enable Headless Client SDK**: `@mentra/client-sdk` depends only on `@mentra/types`
   - No server-side dependencies
   - Clean protocol-only interface

3. **Maintain Backward Compatibility**: `@mentra/sdk` continues to work
   - Re-exports all types from `@mentra/types`
   - No breaking changes to existing apps

4. **Resolve Circular Dependencies**: Clean dependency graph
   - `@mentra/types` → no dependencies (except dev)
   - `@mentra/sdk` → depends on `@mentra/types`
   - `@mentra/client-sdk` → depends on `@mentra/types`

## Non-Goals

- **Not moving SDK-specific APIs**: `DashboardSystemAPI` implementation stays in SDK
- **Not changing protocol**: Only reorganizing types, not changing wire format
- **Not refactoring existing apps**: Apps continue using `@mentra/sdk` as before
- **Not optimizing type structure**: Focus on extraction, not redesign

## Open Questions

1. **`AppSession` type in `ToolCall`**
   - Current: Temporarily `any` to avoid circular dependency
   - Decision needed: Generic parameter? Separate interface?
   - **Deferred**: Handle during SDK implementation phase

2. **`tsconfig.json` overwrite error in `@mentra/sdk`**
   - Error: `Cannot write file '/Users/isaiah/.../dist/index.d.ts' because it would overwrite input file`
   - Cause: `outDir` or `declarationDir` misconfiguration
   - **Need to fix**: Adjust tsconfig paths

3. **Type guard naming conflicts**
   - Problem: `isRtmpStreamStatus` exists in both client-cloud and app-cloud
   - Solution: Aliasing (e.g., `isRtmpStreamStatusFromCloud`, `isRtmpStreamStatusToApp`)
   - **Implemented**: Using aliases in exports

## Success Criteria

- [ ] `@mentra/types` builds successfully
- [ ] `@mentra/sdk` builds successfully with re-exports
- [ ] All existing apps continue to work
- [ ] `@mentra/client-sdk` can be implemented using only `@mentra/types`
- [ ] No circular dependencies in dependency graph
- [ ] All type guards exported with proper aliases
