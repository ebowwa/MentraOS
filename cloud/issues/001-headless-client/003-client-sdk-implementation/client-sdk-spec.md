# Client SDK Specification

## Overview

`@mentra/client-sdk` is the **Shared Core** of the MentraOS Client. It implements the full protocol, state management, and business logic required to act as a Mentra Client.

It is designed to run in two environments:
1.  **Node.js / Bun**: For "Headless" E2E testing and simulation.
2.  **React Native**: As the production logic core of the Mentra Mobile App.

## Architecture

The SDK follows a **Hexagonal Architecture** (Ports & Adapters) to ensure portability.

### 1. The Mantle (Universal)
*   **Path**: `src/mantle/`
*   **Dependencies**: Pure TypeScript, `@mentra/types`, `zustand` (state), `eventemitter3`.
*   **Responsibilities**:
    *   **Protocol Handling**: `SocketComms` logic (parsing messages, dispatching events).
    *   **State Management**: `DeviceState`, `SettingsStore`, `AppletStore`.
    *   **Business Logic**: `TranscriptProcessor`, `HealthCheckFlow`, `OtaChecker`.
    *   **API Facade**: `MentraClient` class.

### 2. The Adapters (Interfaces)
*   **Path**: `src/interfaces/`
*   **Responsibilities**: Define abstract contracts for platform-specific features.
    *   `INetworkTransport`: WebSocket and HTTP client abstraction.
    *   `IStorage`: Key-Value storage (AsyncStorage vs fs/memory).
    *   `IMedia`: Audio/Video playback and recording.
    *   `IHardware`: Bluetooth/USB communication with Glasses.
    *   `ISystem`: OS-level interactions (Notifications, Permissions).

### 3. The Implementations (Platform-Specific)
*   **Path**: `src/platforms/`
*   **`node/`**:
    *   `NodeTransport` (`ws`, `axios`)
    *   `FileStorage` (`fs`)
    *   `MockHardware` (Simulated events)
*   **`react-native/`**:
    *   `RNTransport` (Native WebSocket, `fetch`)
    *   `RNStorage` (`@react-native-async-storage/async-storage`)
    *   `MantleHardware` (Native Modules)

## Core Modules

### 1. Authentication (`client.auth`)
*   **Responsibilities**: Token management and exchange.
*   **Key Methods**:
    *   `setCoreToken(token: string)`: Set the token directly.
    *   `exchangeToken(token: string, provider: 'supabase' | 'authing')`: Exchange 3rd party token for Core Token.
    *   `getCoreToken()`: Retrieve current token.

### 2. App Management (`client.apps`)
*   **Responsibilities**: App lifecycle and state sync.
*   **Key Logic**:
    *   **Sync Signal**: Listens for `app_state_change` from Cloud.
    *   **Reconciliation**: Fetches `/api/apps/installed` and updates local state.
    *   **Lifecycle**: Handles `app_started` / `app_stopped` signals to manage foreground app.

### 3. System Services (`client.system`)
*   **Included**:
    *   **WiFi**: Reporting connection status (`networkConnectivityService` logic).
    *   **Battery**: Reporting battery levels.
*   **Excluded / Optional**:
    *   **OTA**: Local-only (Client <-> Glasses), excluded from Cloud SDK.
    *   **Health Checks**: UI diagnostic only, optional for Headless Client.

## API Design

### Initialization

```typescript
import { MentraClient, NodePlatform } from '@mentra/client-sdk';

// 1. Choose Platform
const platform = new NodePlatform(); // or new ReactNativePlatform()

// 2. Initialize Client
const client = new MentraClient({
  host: 'api.mentra.glass',
  auth: { token: '...', type: 'user' },
  platform: platform
});

// 3. Connect
await client.connect();
```

### Core Logic Re-use

The SDK explicitly exposes logic blocks used by the mobile app:

```typescript
// Transcript Processing (Shared)
import { TranscriptProcessor } from '@mentra/client-sdk/logic';
const processor = new TranscriptProcessor();
processor.process(rawText);

// Health Checks (Shared)
import { HealthCheckFlow } from '@mentra/client-sdk/logic';
await HealthCheckFlow.check(appPackage);
```

## Migration Strategy

To achieve this "Shared Core" state:
1.  **Extract**: Move logic from `mobile/src/services/SocketComms.ts` -> `sdk/src/core/Protocol.ts`.
2.  **Abstract**: Replace direct `AsyncStorage` calls with `this.platform.storage`.
3.  **Integrate**: Update Mobile App to import `MentraClient` instead of maintaining its own `SocketComms`.

## Constraints

- **Zero Native Dependencies in Core**: Core must never import `react-native` or `fs`.
- **Strict Interfaces**: All platform interaction must go through defined Interfaces.
- **Test Coverage**: Core logic must be 100% covered by unit tests in Node.
