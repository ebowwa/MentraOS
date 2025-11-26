# Mobile Client Capabilities Audit

This document maps out the features and capabilities of the existing Mentra Mobile App to ensure the Headless Client SDK achieves full parity.

## 1. Project Structure Analysis

*   **Root**: `/Users/isaiah/Documents/Mentra/MentraOS/mobile`
*   **Tech Stack**: React Native / Expo (inferred from user comments)

## 2. Feature Map

### 2.1. Connection & Auth
*   [x] Auth Flow: `RestComms.exchangeToken` (Supabase/Authing -> Core Token)
*   [x] WebSocket: `SocketComms` handles connection, heartbeat, and reconnects.
*   [x] LiveKit: `SocketComms` handles `connection_ack` to trigger LiveKit connection.

### 2.2. Hardware Simulation/Interaction
*   [x] Display: `handle_display_event` updates `DisplayStore`.
*   [x] Audio: `AudioPlayService` (implied usage).
*   [x] Microphone: `handle_microphone_state_change` (bypassVad, requiredData).
*   [x] Sensors: `sendHeadPosition`, `sendLocationUpdate`.
*   [x] Input: `sendButtonPress`, `sendTouchEvent`, `sendSwipeVolumeStatus`.
*   [x] LED: `handle_rgb_led_control`.

### 2.3. App Management
*   [x] App Lifecycle: `RestComms.startApp/stopApp`, `handle_app_started/stopped`.
*   [x] Offline Apps: `applets.ts` manages "Camera" and "Live Captions" locally.
*   [x] App Health: `RestComms.checkAppHealthStatus`.
*   [x] Settings: `RestComms.getAppSettings/updateAppSetting`.

### 2.4. System Features
*   [x] Notifications: `RestComms.sendPhoneNotification` (mirroring phone notifs).
*   [x] Location: `handle_set_location_tier`, `handle_request_single_location`.
*   [x] Calendar: `RestComms.sendCalendarData`.
*   [x] Error Reporting: `RestComms.sendErrorReport`.
*   [x] User Feedback: `RestComms.sendFeedback`.

### 2.6. Connectivity & Pairing (Bridge Findings)
*   [x] Hotspot: `hotspot_status_change`, `hotspot_error`.
*   [x] WiFi Scanning: `wifi_scan_results`.
*   [x] Bluetooth Pairing: `compatible_glasses_search_result`, `pair_failure`.
*   [x] Bluetooth Audio: `audio_pairing_needed`, `audio_connected`, `audio_disconnected`.

### 2.7. Media Management (Bridge Findings)
*   [x] Gallery: `gallery_status` (photos/videos count, camera busy).
*   [x] Local STT: `local_transcription` (loopback for low-latency display).

### 2.8. Advanced Features (Deep Dive Findings)
*   [x] Local STT Management: `STTModelManager.ts` handles downloading, extracting, and activating Sherpa-ONNX models.
    *   Supports multiple languages (en, zh, ko).
    *   Manages storage and model validation.
*   [x] SuperApp Bridge: `MiniComms.ts` enables bi-directional communication with WebView-based apps.
    *   Allows web apps to send `button_click`, `page_ready`, `custom_action`.
    *   Allows native app to send `notification`, `data_update` to web apps.
    *   Enables "SuperApps" to control the main display (`displayTextMain`).

### 2.9. System Utilities (Deepest Dive Findings)
*   [x] Transcript Processing: `TranscriptProcessor.ts` handles text wrapping (44 chars/line), batching (300ms throttle), and language-specific logic (Chinese vs English).
*   [x] Data Export: `DataExportService.tsx` collects and sanitizes user data (GDPR compliance) including auth, settings, and local storage.
*   [x] Notification Management: `NotificationPreferences.ts` maintains a local blacklist of apps to block notifications from.
*   [x] Button Actions: `ButtonActionProvider.tsx` handles default app launching on button press when no app is foregrounded.

### 2.10. System Maintenance & Services (Deepest Dive Findings)
*   [x] OTA Updates: `OtaUpdateChecker.tsx` fetches version info from a Cloud URL, compares build numbers, and prompts the user to connect to WiFi for updates.
*   [x] WiFi Credentials: `WifiCredentialsService.ts` securely stores and manages WiFi credentials, syncing them to the glasses.
*   [x] App Health Checks: `healthCheckFlow.ts` implements a robust retry/uninstall flow for apps that fail health checks (offline/unreachable).
*   [x] ASG Camera Client: `asgCameraApi.ts` interacts with a local HTTP server on the glasses (`http://localhost:8089`) to manage photos/videos, supporting batch sync and deletion.
*   [x] ASG Local Storage: `localStorageService.ts` manages downloaded media files and metadata, handling iOS file path changes and thumbnail generation.
*   [x] ASG Network Monitor: `networkConnectivityService.ts` tracks phone/glasses WiFi states, detects hotspots, and verifies reachability of the glasses' local server.
*   [x] Gallery Settings: `gallerySettingsService.ts` persists user preferences like "Auto Save to Camera Roll".

### 2.5. Media & Recording (New Findings)
*   [ ] RTMP Streaming: `handle_start_rtmp_stream`, `handle_stop_rtmp_stream`.
*   [ ] Buffer Recording: `handle_start_buffer_recording`, `handle_save_buffer_video`.
*   [ ] Video Recording: `handle_start_video_recording` (local recording?).
*   [ ] Photo Capture: `handle_photo_request` (upload to S3?).
*   [x] Audio Playback: `AudioPlayService` handles `audio_play_request` (plays URLs, reports status).

## 3. Missing Capabilities (Gap Analysis)

The current SDK spec is missing:
1.  **Offline App Support**: The mobile app has built-in "offline" apps (Camera, Captions) that don't hit the cloud. The SDK should perhaps allow registering local "mock" apps.
2.  **Advanced Media**: Buffer recording, local video recording, and photo capture handling are not fully specced in the SDK.
3.  **Location Tiers**: The Cloud can set location tracking tiers (e.g., passive vs active). `MantleManager` maps these to `expo-location` accuracy.
4.  **Calendar & Notifications**: Explicit methods for syncing calendar and sending phone notifications are needed. `MantleManager` syncs calendar every hour.
5.  **Error Reporting**: A standard way to report SDK/App errors to the Cloud.
6.  **Audio Playback**: Distinct from LiveKit, the Cloud can request the client to play a specific audio file URL (e.g. TTS response or sound effect).

## 4. Implementation Details
*   **Location**: Uses `expo-task-manager` for background updates. Tiers: `realtime`, `tenMeters`, `hundredMeters`, `kilometer`, `threeKilometers`, `reduced`.
*   **Calendar**: Syncs events from -2h to +1w.
*   **Transcripts**: `TranscriptProcessor` batches updates before sending to display (local loopback) or Cloud.
