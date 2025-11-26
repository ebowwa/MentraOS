# MentraOS Communication Protocol Specification

This document details the code-level communication protocol between the MentraOS Cloud, Third-Party Apps (TPA), and the Client (Glasses).

## 1. Transport Layers

### 1.1. TPA <-> Cloud
*   **Inbound (Cloud -> TPA)**: HTTP POST Webhooks.
    *   **Endpoint**: User-defined (e.g., `https://myapp.com/webhook`).
    *   **Security**: `apiKey` authentication (server-side).
*   **Bidirectional (TPA <-> Cloud)**: WebSocket.
    *   **Endpoint**: `/app-ws` (e.g., `wss://api.mentra.glass/app-ws`).
    *   **Headers**:
        *   `Authorization`: `Bearer <jwt>` (Payload: `{ packageName, apiKey }`)
        *   `x-user-id`: `<userId>`
        *   `x-session-id`: `<sessionId>`

### 1.2. Client <-> Cloud
*   **Transport**: WebSocket.
    *   **Endpoint**: `/glasses-ws` (e.g., `wss://api.mentra.glass/glasses-ws`).
    *   **Query Param**: `?token=<jwt>&livekit=<true|false>`
    *   **Headers**: `Authorization: Bearer <jwt>` (Alternative to query param).
*   **Media**: RTMP for video streaming (managed/unmanaged).
*   **HTTP API**: For non-realtime operations (app management, settings).

## 2. TPA <-> Cloud Protocol

### 2.1. WebSocket Messages (TPA -> Cloud)

#### Connection Init (Legacy/Alternative)
```typescript
{
  "type": "tpa_connection_init",
  "packageName": "com.example.app",
  "sessionId": "uuid...",
  "apiKey": "secret..."
}
```

#### Event Subscription
```typescript
{
  "type": "subscription_update",
  "packageName": "com.example.app",
  "subscriptions": [
    "transcription",
    "button_press",
    "head_position",
    "touch_event",
    "touch_event:triple_tap" // Gesture specific
  ]
}
```

#### Display Request
```typescript
{
  "type": "display_event",
  "packageName": "com.example.app",
  "view": "main", // or 'dashboard'
  "layout": {
    "layoutType": "text_wall",
    "text": "Hello World"
  }
}
```

#### Hardware Control
*   **RGB LED**:
    ```typescript
    {
      "type": "rgb_led_control",
      "requestId": "req-123",
      "packageName": "com.example.app",
      "action": "blink", // 'on', 'off', 'blink', 'breathe'
      "color": "red", // 'red', 'green', 'blue', 'white', 'off'
      "ontime": 1000,
      "offtime": 500,
      "count": 3
    }
    ```
*   **Audio Play**:
    ```typescript
    {
      "type": "audio_play_request",
      "requestId": "req-456",
      "packageName": "com.example.app",
      "audioUrl": "https://...",
      "volume": 1.0,
      "stopOtherAudio": true
    }
    ```

#### Stream Requests
*   **RTMP Request**:
    ```typescript
    {
      "type": "rtmp_stream_request",
      "packageName": "com.example.app",
      "streamId": "stream-789"
    }
    ```
*   **Photo Request**:
    ```typescript
    {
      "type": "photo_request",
      "packageName": "com.example.app",
      "requestId": "photo-101"
    }
    ```

### 2.2. WebSocket Messages (Cloud -> TPA)

#### Data Stream
Wrapped message for subscribed events.
```typescript
{
  "type": "data_stream",
  "sessionId": "user-session-id",
  "streamType": "button_press", // or 'transcription', 'head_position', etc.
  "data": { ... }, // Event payload
  "timestamp": "2023-..."
}
```

#### Stream Status Check Response
```typescript
{
  "type": "stream_status_check_response",
  "hasActiveStream": true,
  "streamInfo": {
    "type": "managed", // or 'unmanaged'
    "streamId": "...",
    "status": "active",
    "previewUrl": "...",
    "thumbnailUrl": "..."
  }
}
```

## 3. Client <-> Cloud Protocol

### 3.1. Client -> Cloud (GlassesToCloudMessage)

#### Connection & State (WebSocket)
*   **Init**:
    ```typescript
    {
      "type": "connection_init",
      "modelName": "Mentra Mach 1",
      "firmwareVersion": "1.0.0"
    }
    ```
*   **Connection State**:
    ```typescript
    {
      "type": "glasses_connection_state",
      "modelName": "Mentra Mach 1",
      "status": "CONNECTED", // 'DISCONNECTED'
      "wifi": { "connected": true, "ssid": "MyWiFi" }
    }
    ```
*   **Battery**:
    ```typescript
    {
      "type": "glasses_battery_update",
      "level": 85,
      "charging": false
    }
    ```

#### Hardware Events (Current: WebSocket)
> **Note**: These high-frequency events are currently sent via WebSocket. Future refactors may move some (like single button presses) to REST, while keeping high-frequency data (like continuous head tracking) on WS or UDP.

*   **Button Press**:
    ```typescript
    {
      "type": "button_press",
      "buttonId": "main", // 'main', 'vol_up', 'vol_down'
      "pressType": "short" // 'short', 'long', 'double'
    }
    ```
*   **Head Position**:
    ```typescript
    {
      "type": "head_position",
      "position": "up" // 'up', 'down'
    }
    ```
*   **Touch Event**:
    ```typescript
    {
      "type": "touch_event",
      "device_model": "Mentra Mach 1",
      "gesture_name": "tap" // 'tap', 'double_tap', 'swipe_forward', 'swipe_back'
    }
    ```
*   **VAD (Voice Activity)**:
    ```typescript
    {
      "type": "VAD",
      "status": true // true = speaking
    }
    ```

#### Actions (REST Preferred)
*   **Start App**: `POST /apps/:packageName/start` (Legacy: `START_APP` WS message)
*   **Stop App**: `POST /apps/:packageName/stop` (Legacy: `STOP_APP` WS message)
*   **Update Settings**: `POST /api/client/user/settings` (Legacy: `REQUEST_SETTINGS` WS message)

#### Responses
*   **Keep Alive Ack**:
    ```typescript
    {
      "type": "keep_alive_ack",
      "streamId": "..."
    }
    ```
*   **Photo Response**:
    ```typescript
    {
      "type": "photo_response",
      "requestId": "...",
      "photoUrl": "https://...", // S3/Upload URL
      "error": null
    }
    ```

### 3.2. Cloud -> Client (CloudToGlassesMessage)

#### System
*   **Connection Ack**:
    ```typescript
    {
      "type": "connection_ack",
      "sessionId": "...",
      "livekit": { "url": "...", "token": "..." } // If requested
    }
    ```
*   **App State Change**:
    ```typescript
    {
      "type": "app_state_change",
      "apps": [ ... ] // List of running apps
    }
    ```

#### Hardware Control
*   **Display Event**:
    ```typescript
    {
      "type": "display_event",
      "view": "main",
      "layout": { ... }
    }
    ```
*   **Microphone State**:
    ```typescript
    {
      "type": "microphone_state_change",
      "bypassVad": false,
      "requiredData": ["audio"] // 'audio', 'transcription'
    }
    ```
*   **RGB LED Control**:
    ```typescript
    {
      "type": "rgb_led_control",
      "requestId": "...",
      "action": "blink",
      "color": "red",
      "ontime": 1000,
      "offtime": 500,
      "count": 3
    }
    ```

#### Location
*   **Set Location Tier**:
    ```typescript
    {
      "type": "set_location_tier",
      "tier": "realtime" // 'realtime', 'tenMeters', 'hundredMeters', 'threeKilometers', 'passive'
    }
    ```
*   **Request Single Location**:
    ```typescript
    {
      "type": "request_single_location",
      "accuracy": "high",
      "correlationId": "..."
    }
    ```

#### Media & Recording
*   **Buffer Recording**:
    ```typescript
    { "type": "start_buffer_recording" }
    { "type": "stop_buffer_recording" }
    {
      "type": "save_buffer_video",
      "requestId": "...",
      "durationSeconds": 30
    }
    ```
*   **Video Recording**:
    ```typescript
    {
      "type": "start_video_recording",
      "requestId": "...",
      "save": true
    }
    {
      "type": "stop_video_recording",
      "requestId": "..."
    }
    ```

#### System
*   **App Lifecycle**:
    ```typescript
    { "type": "app_started", "packageName": "com.example.app" }
    { "type": "app_stopped", "packageName": "com.example.app" }
    ```
*   **WiFi Setup**:
    ```typescript
    {
      "type": "show_wifi_setup",
      "reason": "..."
    }
    ```

### 3.3. Client -> Cloud (Additional)

#### Responses
*   **Audio Play Response**:
    ```typescript
    {
      "type": "audio_play_response",
      "requestId": "...",
      "success": true,
      "error": null,
      "duration": 1200
    }
    ```
*   **RGB LED Response**:
    ```typescript
    {
      "type": "rgb_led_control_response",
      "requestId": "...",
      "success": true
    }
    ```

#### Status Updates
*   **Swipe Volume Status**:
    ```typescript
    {
      "type": "swipe_volume_status",
      "enabled": true,
      "timestamp": 1234567890
    }
    ```
*   **Switch Status**:
    ```typescript
    {
      "type": "switch_status",
      "switch_type": 1,
      "switch_value": 1,
      "timestamp": 1234567890
    }
    ```

## 4. HTTP API Endpoints (Client)

### 4.1. Core
*   **GET** `/api/client/min-version`: Check required client version.
*   **POST** `/api/client/device/state`: Update glasses state (model, connection status).
*   **POST** `/auth/exchange-token`: Exchange Supabase/Authing token for Core Token.
*   **GET** `/api/client/livekit/token`: Get LiveKit credentials.

### 4.2. Apps & Settings
*   **GET** `/api/client/apps`: Get list of available applets.
*   **POST** `/apps/:packageName/start`: Start an app.
*   **POST** `/apps/:packageName/stop`: Stop an app.
*   **POST** `/api/apps/uninstall/:packageName`: Uninstall an app.
*   **POST** `/api/app-uptime/app-pkg-health-check`: Report app health.
*   **GET/POST** `/appsettings/:appName`: Get/Update app settings.
*   **POST** `/api/client/user/settings`: Update global user settings.
*   **GET** `/api/client/user/settings`: Get global user settings.

### 4.6 App Store & Lifecycle (New)
These messages handle the lifecycle management of apps from the Cloud to the Client. Note that **Installation** and **Uninstallation** are handled via REST API calls (triggering a database update), followed by a `app_state_change` signal to the client to resync its app list.

#### Cloud -> Glasses
| Message Type | Structure | Description |
| :--- | :--- | :--- |
| `app_started` | `{ packageName: string, timestamp: Date }` | Request to launch an app (bringing it to foreground). |
| `app_stopped` | `{ packageName: string, timestamp: Date }` | Request to stop/kill an app. |
| `app_state_change` | `{ sessionId: string, timestamp: Date }` | Signal that the app state (installed apps, running apps) has changed on the cloud. Client should refetch state via REST. |

#### Glasses -> Cloud
| Message Type | Structure | Description |
| :--- | :--- | :--- |
| `app_state_update` | `{ packageName: string, state: 'installed' \| 'uninstalled' \| 'running' \| 'stopped' \| 'error', error?: string }` | Updates the cloud on the status of an app operation. |
| `app_list_update` | `{ apps: Array<{ packageName: string, version: string, state: string }> }` | Full list of installed apps and their states (sent on connection or change). |

### 4.7 System Services
*   **POST** `/api/client/feedback`: Send user feedback.
*   **POST** `/app/error-report`: Send error report (Sentry alternative).
*   **POST** `/api/client/calendar`: Sync calendar events.
*   **POST** `/api/client/location`: Sync location history.
*   **POST** `/api/client/notifications`: Sync phone notifications.
*   **POST** `/api/client/notifications/dismissed`: Dismiss notification on phone.

### 4.4. Account & Auth
*   **POST** `/api/account/request-deletion`: Request account deletion.
*   **DELETE** `/api/account/confirm-deletion`: Confirm account deletion.
*   **POST** `/api/auth/generate-webview-token`: Generate token for webviews.
*   **POST** `/api/auth/hash-with-api-key`: Hash string with API key.

### 4.8 Store Website API (Control Plane)
These endpoints are primarily used by the Store Website (React App) to manage apps and user sessions. The Glasses Client typically reacts to the side effects of these calls (via WebSocket signals).

*   **GET** `/api/apps/public`: Get public apps (no auth).
*   **GET** `/api/apps/available`: Get available apps (auth required).
*   **GET** `/api/apps/installed`: Get installed apps (auth required).
*   **GET** `/api/apps/:packageName`: Get app details.
*   **POST** `/api/apps/install/:packageName`: Install app (triggers `app_state_change`).
*   **POST** `/api/apps/uninstall/:packageName`: Uninstall app (triggers `app_state_change`).
*   **POST** `/api/apps/:packageName/start`: Start app (triggers `app_started`).
*   **POST** `/api/apps/:packageName/stop`: Stop app (triggers `app_stopped`).
*   **GET** `/api/apps/search`: Search apps.
*   **POST** `/api/auth/exchange-store-token`: Exchange temporary store token.

## 5. Headless Client Requirements

To simulate a MentraOS Client (Glasses) for testing:

1.  **Authentication**:
    *   Must be able to exchange a dev/user token for a Core Token via `/auth/exchange-token`.
    *   Must store the Core Token for WebSocket connection.

2.  **WebSocket Connection**:
    *   Connect to `wss://<host>/glasses-ws?token=<core_token>`.
    *   Handle [connection_ack](file:///Users/isaiah/Documents/Mentra/MentraOS/mobile/src/services/SocketComms.ts#378-387).
    *   Maintain connection with auto-reconnect.

3.  **State Simulation**:
    *   **Heartbeat**: Periodically send `glasses_connection_state` and `glasses_battery_update`.
    *   **RTMP Mock**: Respond to [start_rtmp_stream](file:///Users/isaiah/Documents/Mentra/MentraOS/mobile/src/services/SocketComms.ts#473-481) (log only) and [keep_rtmp_stream_alive](file:///Users/isaiah/Documents/Mentra/MentraOS/mobile/src/services/SocketComms.ts#486-490) (send `keep_alive_ack`).
    *   **Location**: Send `location_update` on request or periodically.

4.  **Interaction Simulation**:
    *   **CLI/API**: Provide commands to trigger events:
        *   `press_button <id> <type>` -> Sends `button_press`.
        *   `move_head <position>` -> Sends `head_position`.
        *   `touch <gesture>` -> Sends `touch_event`.
        *   `speak <status>` -> Sends `VAD`.

5.  **Output Handling**:
    *   **Display**: Log [display_event](file:///Users/isaiah/Documents/Mentra/MentraOS/mobile/src/services/SocketComms.ts#409-418) payloads to console or file for verification.
    *   **LED**: Log [rgb_led_control](file:///Users/isaiah/Documents/Mentra/MentraOS/mobile/src/services/SocketComms.ts#521-542) requests.
    *   **Photo**: Simulate photo capture by returning a dummy URL in `photo_response`.
