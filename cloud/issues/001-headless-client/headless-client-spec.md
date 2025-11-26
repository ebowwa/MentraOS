# Shared Core SDK Specification

## Overview

The goal is to extract the core logic of the Mentra Client into a portable, shared SDK (`@mentra/client-sdk`). This SDK will serve as the "brain" for both the production mobile app and the automated test suite, ensuring 100% logic parity and enabling robust E2E testing.

## Problem

1.  **Logic Drift**: Test scripts (if they exist) often drift from the actual mobile implementation, leading to false positives/negatives.
2.  **Untestable Complexity**: Critical logic (e.g., "Zombie App" detection, OTA flows) is buried in React Native components, making it impossible to test without a physical device.
3.  **Duplication**: Protocol logic is often duplicated between the app and various scripts.
4. **No Testing Without Hardware**: Cannot test Cloud or TPA functionality without physical glasses
   - Evidence: Developers must deploy to production glasses to test
   - Impact: Slow development cycles, risky deployments
5. **Protocol Scattered**: Client protocol implementation spread across mobile app, no single source of truth
   - Evidence: Message types duplicated in `mobile/`, `cloud/`, `sdk/`
   - Impact: Protocol changes require updates in 3+ places
6. **No Third-Party Integration**: Other companies cannot build custom hardware clients
   - Evidence: Protocol not documented, types not exported
   - Impact: Locked into our hardware

## Solution: The Mantle (Shared Core)

We will refactor the mobile client to use a **Shared Mantle SDK**.

*   **Production**: The Mobile App imports `@mentra/client-sdk/react-native` and plugs in its native adapters.
*   **Testing**: The Test Runner imports `@mentra/client-sdk/node` and plugs in mock adapters.

## Goals

1.  **Unified Mantle**: One codebase for Protocol, State, and Business Logic.
2.  **Headless Testing**: Run full client scenarios (Connect -> Launch App -> Stream Video) in Node.js CI/CD.
3.  **Native Performance**: Zero runtime overhead for the mobile app (no "bridge" lag).

## Use Cases

### Use Case 1: Automated E2E Testing (Node.js)
**Actor**: CI/CD Pipeline
**Goal**: Verify Cloud <-> Client interaction.

```typescript
import { MentraClient, NodePlatform } from '@mentra/client-sdk';

const client = new MentraClient({ platform: new NodePlatform() });
await client.connect();

// Simulate user action
await client.hardware.pressButton('main');

// Verify Cloud response
const displayEvent = await client.waitFor('display');
expect(displayEvent.layout).toContain('Menu');
```

### Use Case 2: Mobile App Development (React Native)
**Actor**: Mobile Developer
**Goal**: Build the UI without worrying about protocol details.

```typescript
import { MentraClient, RNPlatform } from '@mentra/client-sdk';

// Initialize with Native Adapters
const client = new MentraClient({ platform: new RNPlatform() });

// UI binds directly to SDK state
const battery = client.state.battery;
```

## Success Criteria

- [ ] `@mentra/client-sdk` architecture refactored to Hexagonal (Ports & Adapters).
- [ ] Core logic (Protocol, State) extracted from Mobile to SDK.
- [ ] Node.js adapters implemented (Headless Client).
- [ ] React Native adapters implemented (Mobile Client).
- [ ] Mobile App successfully runs using the SDK.
- [ ] CI/CD pipeline runs E2E tests using the Headless Client.
