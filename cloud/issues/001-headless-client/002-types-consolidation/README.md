# Types Consolidation

Consolidating all shared protocol types into `@mentra/types` package for headless client SDK.

## Documents

- **types-consolidation-spec.md** - Problem, goals, constraints
- **types-consolidation-architecture.md** - Technical design and migration strategy

## Quick Context

**Current**: Types scattered across `@mentra/sdk`, duplicated between client/app protocols, circular dependencies blocking headless client development.

**Proposed**: Single `@mentra/types` package as source of truth, clean separation between protocol types and SDK implementation, enabling flexible headless client SDK.

## Key Context

The headless client SDK (`@mentra/client-sdk`) needs to depend *only* on protocol types, not the entire `@mentra/sdk` which includes server-side logic. This requires extracting all shared types into `@mentra/types` while maintaining backward compatibility and resolving circular dependencies.

## Status

- [x] Create `@mentra/types` package structure
- [x] Move core protocol types (client-cloud, app-cloud)
- [x] Move hardware capabilities and enums
- [x] Move dashboard, webhooks, auth types
- [x] Add type guards with proper aliasing
- [x] Update `@mentra/sdk` to re-export from `@mentra/types`
- [ ] Fix remaining SDK build errors
  - [ ] Export `PackagePermissions` type
  - [ ] Resolve type narrowing issues
  - [ ] Fix `tsconfig.json` overwrite error
- [ ] Run full builds and tests
- [ ] Implement `@mentra/client-sdk`
- [ ] Update documentation
