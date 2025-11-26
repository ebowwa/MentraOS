# Mobile Implementation Analysis

This document details the implementation logic of the Mentra Mobile Client to guide the development of the Headless Client SDK. The goal is to achieve feature parity and align with the existing codebase's patterns.

## 1. Communication Layer

### 1.1. WebSocket (`SocketComms.ts`)
*   **Library**: Custom `WebSocketManager` wrapper around standard `WebSocket`.
*   **Connection Logic**:
    *   Singleton pattern (`getInstance`).
    *   Auto-reconnect logic with exponential backoff (implied by `attemptReconnect`).
    *   Heartbeat: Sends `glasses_connection_state` and `glasses_battery_update` regularly (triggered by external events or timers?). *Correction: It seems to send these on demand or via `sendKeepAliveAck`.*
*   **Message Handling**:
    *   Central `handle_message` switch statement.
    *   Delegates to `CoreModule` (native bridge?) or stores (`useDisplayStore`, `useAppletStatusStore`).
    *   Emits global events via `GlobalEventEmitter` (e.g., `APP_STATE_CHANGE`).

### 1.2. HTTP API (`RestComms.ts`)
*   **Library**: `axios`.
*   **Auth**:
    *   Manages `coreToken`.
    *   `exchangeToken`: Swaps Supabase/Authing token for Core Token.
    *   `authenticatedRequest`: Wrapper that adds `Authorization: Bearer <token>` header.
*   **Key Endpoints**:
    *   `/api/client/apps`: Fetches app list.
    *   `/apps/:pkg/start` & `/stop`: App lifecycle.
    *   `/api/client/device/state`: Updates device state (battery, wifi, etc.).

## 2. Core Services

### 2.1. Hardware Abstraction (`MantleManager.ts`)
*   **Role**: Orchestrates hardware interactions and background tasks.
*   **Location**:
    *   Uses `expo-location` and `expo-task-manager`.
    *   Maps Cloud "tiers" (e.g. "tenMeters") to Expo `LocationAccuracy`.
    *   Background task `handleLocationUpdates` sends data to Cloud.
*   **Calendar**:
    *   Uses `expo-calendar`.
    *   Syncs events from -2h to +1w every hour.
*   **Transcripts**:
    *   `TranscriptProcessor` batches text updates.
    *   Loops back text to display (`displayTextMain`) for local feedback.

### 2.2. Audio Playback (`AudioPlayService.ts`)
*   **Library**: `expo-audio`.
*   **Logic**:
    *   `handle_audio_play_request`: Creates player for URL.
    *   Listens for `playbackStatusUpdate` to detect finish.
    *   Sends `audio_play_response` with success/duration.

## 3. App Management (`applets.ts` Store)
*   **State**: Zustand store (`useAppletStatusStore`).
*   **Logic**:
    *   Merges Cloud apps (`RestComms.getApplets`) with local "Offline Apps" (Camera, Captions).
    *   `startApplet`:
        *   Checks hardware compatibility.
        *   Stops other foreground apps (single app policy).
        *   Optimistic UI updates.
        *   Calls `RestComms.startApp` or sets local offline flag.

## 4. Native Bridge (`MantleBridge.tsx`)
*   **Role**: Mediator between React Native (JS) and Native Core (iOS/Android).
*   **Event Handling**:
    *   Listens for `CoreMessageEvent` from `CoreModule`.
    *   Parses JSON messages (e.g., `core_status_update`, `button_press`, `touch_event`).
    *   Dispatches events to `GlobalEventEmitter` or directly calls services (`mantle`, `socketComms`).
*   **Key Interactions**:
    *   **Hardware Events**: Forwards `button_press`, `touch_event`, `head_up` to `SocketComms` or `MantleManager`.
    *   **Media**: Handles `mic_data` (sends to LiveKit or Socket), `ws_bin` (binary data).
    *   **Commands**: Exposes methods to call Native Core:
        *   `updateSettings`: Pushes settings to native layer.
        *   `start/stopBufferRecording`: Controls local video buffering.
        *   `setSttModelDetails`: Configures local STT.
*   **CoreModule**: The actual native module (TurboModule?) that bridges to Swift/Kotlin.

## 5. Summary of Patterns
*   **Singleton Services**: `SocketComms`, `RestComms`, `MantleManager`, `MantleBridge` are all singletons.
*   **Event-Driven**: Heavy reliance on `GlobalEventEmitter` to decouple layers.
*   **Zustand Stores**: Used for reactive state (`glasses`, `settings`, `display`, `applets`).
*   **Hybrid Logic**: Some logic lives in JS (App lifecycle, HTTP), some in Native (Bluetooth, Audio, Video), bridged by `MantleBridge`.
