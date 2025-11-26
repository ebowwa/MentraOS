# 003: Client SDK Implementation

Implement `@mentra/client-sdk` - the core headless client library.

## Documents

- **client-sdk-spec.md** - Problem, goals, API design
- **client-sdk-architecture.md** - System design, modules, directory structure

## Status

⏸️ **Blocked** - Waiting for 002-types-consolidation to complete

## Quick Context

**Goal**: Build portable TypeScript SDK that implements MentraOS Client protocol

**Depends on**: `@mentra/types` package (002-types-consolidation)

**Enables**: CLI tool (004) and browser simulator (005)

## Planned Components

- `MentraClient` - Main entry point
- `TransportLayer` - Abstract WebSocket/HTTP interface
  - `NodeTransport` - Node.js implementation
  - `BrowserTransport` - Browser implementation
- `DeviceState` - Local state management
- `CapabilityManager` - Hardware constraint enforcement
- Event handlers for all Cloud→Client messages
- Methods for all Client→Cloud messages

## Next Steps

1. Wait for types consolidation to complete
2. Create package structure
3. Implement core client
4. Add transport layers
5. Write tests
6. Publish to npm
