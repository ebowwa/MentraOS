# Audio & Video Transport Audit

## Overview
This document details the architecture and flow of Audio and Video transport in the MentraOS ecosystem, specifically focusing on the interaction between the Client (Glasses), Cloud, and the `cloud-livekit-bridge`.

## 1. Audio Transport (LiveKit)

The audio system uses [LiveKit](https://livekit.io/) for low-latency bidirectional audio. However, the implementation differs for upstream (Mobile -> Cloud) and downstream (Cloud -> Mobile).

### 1.1. Signaling & Connection
1.  **Init**: Client sends `LIVEKIT_INIT` message to Cloud via WebSocket.
2.  **Info**: Cloud responds with `LIVEKIT_INFO` containing:
    *   `url`: LiveKit Server URL
    *   `roomName`: Unique room for this session
    *   `token`: Access token
3.  **Connect**: Client connects to the LiveKit room using these credentials.

### 1.2. Upstream Audio (Mobile -> Cloud)
*   **Mechanism**: **Data Packets** (Custom PCM payload).
*   **Reason**: Likely to avoid standard WebRTC audio processing (VAD, echo cancellation) or for raw PCM access on the server.
*   **Flow**:
    1.  Client captures microphone audio (PCM).
    2.  Client wraps PCM data in a LiveKit `UserDataPacket`.
    3.  Client sends packet to LiveKit Room.
    4.  **Cloud-LiveKit-Bridge** (connected as a participant) receives `OnDataPacket`.
    5.  Bridge extracts PCM payload.
    6.  Bridge forwards PCM data to Cloud via gRPC (`StreamAudio` RPC).

### 1.3. Downstream Audio (Cloud -> Mobile)
*   **Mechanism**: **WebRTC Audio Track** (Standard).
*   **Flow**:
    1.  Cloud sends PCM data to Bridge via gRPC (`StreamAudio` or `PlayAudio` RPC).
    2.  Bridge converts PCM to audio samples.
    3.  Bridge writes samples to a `PCMLocalTrack` named `"speaker"`.
    4.  Bridge publishes this track to the LiveKit Room.
    5.  Client subscribes to the `"speaker"` track.
    6.  Client plays received audio through device speakers.

### 1.4. Implications for Headless Client SDK
To fully simulate a Mentra Client, the SDK must:
*   Implement a LiveKit client (using `livekit-client` for Node/Browser).
*   **Microphone Simulation**:
    *   Ability to read a `.wav` file or generate silence.
    *   Send this data as LiveKit Data Packets.
*   **Speaker Simulation**:
    *   Subscribe to remote tracks.
    *   Receive audio frames and either play them (if in browser) or write to file/stdout (if in Node).

---

## 2. Video Transport (RTMP)

Video streaming is handled via RTMP (Real-Time Messaging Protocol) for compatibility with standard streaming platforms and the Mentra Cloud processing pipeline.

### 2.1. Signaling Flow
1.  **App Request**: App sends `RTMP_STREAM_REQUEST` to Cloud.
2.  **Cloud Command**: Cloud sends `START_RTMP_STREAM` to Client (Glasses).
    *   Payload: `{ type: "start_rtmp_stream", rtmpUrl: "rtmp://...", ... }`
3.  **Streaming**: Client starts pushing video/audio to the provided `rtmpUrl`.
4.  **Status Updates**: Client periodically sends `RTMP_STREAM_STATUS` to Cloud.
    *   Payload: `{ type: "rtmp_stream_status", status: "streaming", stats: { bitrate, fps } }`
5.  **Stop**: Cloud sends `STOP_RTMP_STREAM` or Client stops on error/user action.

### 2.2. Implications for Headless Client SDK
To simulate video streaming, the SDK must:
*   Handle `START_RTMP_STREAM` message.
*   **Video Simulation**:
    *   **Option A (Mock)**: Just log the request and send fake `RTMP_STREAM_STATUS` updates ("streaming", "active") without actually sending data. This is sufficient for testing signaling.
    *   **Option B (Real)**: Use `ffmpeg` (if available) to stream a test pattern or video file to the provided RTMP URL. This allows testing the full pipeline including Cloud processing.
*   **State Management**: Track streaming state (initializing, streaming, stopped) and handle errors.

## 3. Legacy Audio (WebSocket)
*   **Status**: Deprecated but still present in types (`AUDIO_CHUNK`).
*   **Recommendation**: The Headless Client should focus on the LiveKit implementation but gracefully handle (or ignore) legacy WebSocket audio messages.

---

## 4. Native Hardware Integration (Mac/Local)

When running the SDK on a local machine (e.g., a developer's MacBook), we can leverage the host's hardware to provide a rich, interactive simulation.

### 4.1. Audio (Microphone & Speaker)
*   **Node.js**:
    *   **Input (Mic)**: Use libraries like `node-record-lpcm16` (wraps `rec`/`sox`) or `portaudio` bindings to capture raw PCM audio from the system microphone. This PCM data can be packetized and sent to LiveKit.
    *   **Output (Speaker)**: Use `speaker` (node bindings for libmpg123/portaudio) to play the raw PCM audio received from the Cloud (via LiveKit tracks).
*   **Browser Simulator**:
    *   Uses standard Web Audio API (`navigator.mediaDevices.getUserMedia`) which is natively supported by `livekit-client`. This is the easiest path.

### 4.2. Video (Camera)
*   **Node.js**:
    *   **Capture**: Use `ffmpeg` to capture from the system camera (AVFoundation on macOS).
    *   **Streaming**: Pipe the `ffmpeg` output directly to the RTMP URL provided by the Cloud.
    *   **Command Example**: `ffmpeg -f avfoundation -i "0" -c:v libx264 -f flv rtmp://...`
*   **Browser Simulator**:
    *   Uses `navigator.mediaDevices.getUserMedia` to get a video track.
    *   **Challenge**: Browsers cannot natively stream RTMP. The simulator would need to forward video frames to a local Node.js proxy or use a WebRTC-to-RTMP gateway (if available), or simply display the local camera and mock the *sending* part if strict RTMP testing isn't required.

### 4.3. Hybrid Approach
For the CLI tool, we can implement a "Pass-through" mode:
*   **Flag**: `--use-native-hardware`
*   **Behavior**: Attempts to hook into local Mic/Cam/Speakers. If unavailable (e.g., in CI/CD), falls back to Mock/File mode.
