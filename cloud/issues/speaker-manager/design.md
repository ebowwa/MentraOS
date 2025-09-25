# SpeakerManager & LiveKit Bridge Shadow Audio Design

Status: Draft (Shadow Mode Phase 1)
Owner: TBD
Last Updated: 2025-09-22

## 1. Goals

- Introduce server-side shadow audio playback without modifying existing SDK/mobile clients.
- Reuse existing `AUDIO_PLAY_REQUEST` / `AUDIO_STOP_REQUEST` flow; preserve backward compatibility.
- Leverage existing Go `livekit-client-2` bridge to publish PCM into LiveKit.
- Prepare path for future transition to server-primary streaming (optional) without breaking legacy flows.

Non-Goals (Phase 1):

- Mixing multiple simultaneous audio sources.
- Real-time volume adjustments mid-stream.
- Replacing the SDK/device playback yet.

## 2. High-Level Architecture

```
App SDK --> Cloud (websocket-app.service) --> Device (legacy playback)
             |                    \\
             |                     > SpeakerManager (new)
             |                                |
             |                                v
             |                        Go Bridge (livekit-client-2)
             |                                |
             +---------------------------> LiveKit Room (PCM Track)
```

Shadow mode publishes audio to LiveKit in parallel; device remains source of user-facing playback & responses. The SpeakerManager reuses the same LiveKit room/session established for the subscriber; we maintain a single BridgeClient (and LiveKit room) per user and publish the speaker track into that room.

## 3. Components

### 3.1 SpeakerManager (Cloud / TypeScript)

- Instantiated per `UserSession` when `SPEAKER_ENABLED=true`.
- Observes `AUDIO_PLAY_REQUEST` & `AUDIO_STOP_REQUEST` events.
- Sends control commands to Go bridge over WebSocket.
- Tracks shadow jobs for metrics (not authoritative for success in Phase 1).
- Future: Optionally synthesize `AUDIO_PLAY_RESPONSE` when in primary mode.

### 3.2 Go Bridge (`cloud/livekit-client-2`)

- Already: join LiveKit room, publish PCM track, generate tone.
- Add: fetch & decode remote audio (MP3/WAV/TTS stream) and push frames.
- Add: playback job lifecycle and completion events.

## 4. Message & Protocol Additions

### 4.1 Cloud → Bridge Commands

Join-once semantics: The bridge connects to the user's LiveKit room on first command (or when subscriber flow connects) and reuses that connection for subsequent play/stop. Therefore, roomName/token can be omitted after initial join.

```jsonc
{
  "action": "play_url",
  "requestId": "audio_req_abc123",
  "roomName": "user_123",          // optional if already joined
  "token": "<livekit-jwt>",        // optional if already joined
  "url": "https://.../file.mp3",
  "volume": 0.85,         // optional 0.0-1.0
  "gain": 1.0,            // optional server multiplier
  "stopOther": true,      // cancel prior job
  "sampleRate": 16000     // optional override
}
{
  "action": "stop_playback",
  "requestId": "audio_req_abc123", // optional; stop current if omitted
  "reason": "user"
}
```

### 4.2 Bridge → Cloud Events

```jsonc
{ "type": "play_complete", "requestId": "audio_req_abc123", "success": true, "durationMs": 2317 }
{ "type": "play_complete", "requestId": "audio_req_abc123", "success": false, "error": "decode_failed" }
{ "type": "error", "error": "join_failed" }
```

## 5. SpeakerManager API (TS Internal)

```ts
interface SpeakerManagerOptions {
  enable: boolean;
  mode: "shadow" | "primary"; // 'shadow' Phase 1
  bridgeUrl: string; // ws://livekit-bridge:8080
  sampleRate: number; // default 16000
  frameMs: number; // default 10
  maxDurationMs: number; // default 180000
}

class SpeakerManager {
  constructor(userSession: UserSession, opts: SpeakerManagerOptions);
  onAudioPlayRequest(msg: AudioPlayRequest): void;
  onAudioStopRequest(msg: AudioStopRequest): void;
  handleBridgeEvent(evt: any): void; // play_complete, error
  dispose(): Promise<void>;
}
```

Job Tracking:

```ts
interface SpeakerJob {
  requestId: string;
  audioUrl: string;
  packageName: string;
  startedAt: number;
  state: "pending" | "streaming" | "completed" | "cancelled" | "error";
  durationMs?: number;
  error?: string;
}
```

## 6. Go Bridge Additions

### 6.1 New Fields in `Command`

```go
type Command struct {
  Action     string  `json:"action"`
  RoomName   string  `json:"roomName,omitempty"`
  Token      string  `json:"token,omitempty"`
  Url        string  `json:"url,omitempty"`
  RequestID  string  `json:"requestId,omitempty"`
  Volume     float64 `json:"volume,omitempty"`
  Gain       float64 `json:"gain,omitempty"`
  StopOther  bool    `json:"stopOther,omitempty"`
  SampleRate int     `json:"sampleRate,omitempty"`
}
```

### 6.2 Playback Pipeline (Go)

1. Validate joined state; join if needed via `join_room` logic with provided token.
2. If `StopOther`, cancel current job context.
3. Start goroutine:
   - Determine decode strategy:
     - WAV PCM16 (match SR & mono) → direct stream
     - Otherwise use `ffmpeg -i <url> -f s16le -ac 1 -ar <SR> pipe:1`
   - Read bytes into buffer sized to frame (e.g., 10ms = SR/100 samples \*2).
   - Convert to `[]int16`, apply volume/gain scaling & clamp.
   - `ensurePublishTrack()` then `WriteSample`.
   - Track total frames & duration.
4. On EOF success → emit `play_complete`.
5. On error → emit error `play_complete`.
6. On cancellation → emit `play_complete` with `success:false` & reason.

### 6.3 Stop Handling

- `stop_playback` triggers cancellation of current playback context.
- If no requestId provided, cancel active job.

## 7. File Refactor Plan (Go)

Current: Monolithic `main.go` ( >700 lines ).
Proposed split (no behavioral change):

```
/livekit-client-2
  main.go                // entrypoint, HTTP & WS setup
  config.go              // env & Config struct
  bridge_client.go       // BridgeClient struct & lifecycle (join/leave, track publish)
  commands.go            // Command struct & handleCommand switch
  speaker.go             // play_url logic, job management, cancellation (speaker flow)
  resample.go            // audio.go (rename for clarity) resampling & normalization
  events.go              // Event struct & sendEvent helpers
  pacing.go              // PacingBuffer implementation
```

Refactor sequencing:

1. Introduce new files copying code (type/function moves) keeping imports identical.
2. Run build & minimal integration test (existing test-client.js / test-integration.ts).
3. Only after stable, add new `play_url` action in `commands.go` using `speaker.go` helpers.

## 8. Environment Variables

```
SPEAKER_ENABLED=true|false
SPEAKER_MODE=shadow
SPEAKER_BRIDGE_URL=ws://livekit-bridge:8080
SPEAKER_SAMPLE_RATE=16000
SPEAKER_FRAME_MS=10
SPEAKER_MAX_DURATION_MS=180000
SPEAKER_RETRY_ATTEMPTS=3
SPEAKER_CONNECT_TIMEOUT_MS=3000
```

(Bridge side may also accept: `PUBLISH_GAIN`, `LIVEKIT_URL` already present.)

## 9. Metrics (Phase 1 Shadow)

- `speaker_shadow_play_started_total`
- `speaker_shadow_play_completed_total`
- `speaker_shadow_play_failed_total`
- `speaker_shadow_play_cancelled_total`
- `speaker_shadow_play_duration_ms` (histogram)
- `speaker_shadow_first_frame_latency_ms`
- `speaker_shadow_bridge_error_total`

Correlation (logged only initially):

- `device_duration_ms` vs `shadow_duration_ms` per `requestId`.

## 10. Failure Handling & Fallback

| Failure              | Handling                                           |
| -------------------- | -------------------------------------------------- |
| Bridge connect fails | Log & disable shadow for session (cooldown 5 min)  |
| ffmpeg missing       | Log once, mark decode=unavailable, skip shadow     |
| Track publish error  | Emit `play_complete` (error), continue legacy      |
| Stop before start    | Cancel pending job context gracefully              |
| Oversized/long file  | Enforce `SPEAKER_MAX_DURATION_MS`, terminate early |

## 11. Phased Rollout

| Phase | Description                                                             |
| ----- | ----------------------------------------------------------------------- |
| P1    | Add SpeakerManager (no-op if disabled) + Go refactor (no new action)    |
| P2    | Implement `play_url` shadow path (metrics only)                         |
| P3    | Add stop support & duration metrics                                     |
| P4    | Add primary mode (optional) + synthetic responses (behind feature flag) |
| P5    | Optimize TTS path (direct PCM) & consider deprecation strategy          |

## 12. Open Questions

- Source of roomName/token for sessions that never invoked LiveKit yet—derive or lazily provision? (Decision: lazy provision via existing LiveKitManager service accessor.)
- Limit concurrent bridge connections—pool vs per user? (Phase 1: per user on demand.)
- CORS / auth for bridge WS? (Add shared secret later if exposed beyond internal network.)

## 13. Risks & Mitigations

| Risk                                 | Mitigation                                        |
| ------------------------------------ | ------------------------------------------------- |
| Resource usage (ffmpeg per playback) | Reuse short-lived process & enforce max duration  |
| Latency mismatch vs device playback  | Accept; measure delta & log                       |
| Token expiry mid playback            | Shadow-only impact; refresh token on next request |

## 14. Next Steps

1. Implement P1: SpeakerManager scaffold + Go file refactor only.
2. Add `play_url` action & shadow pipeline (guarded by env).
3. Add metrics & logging correlation.
4. Evaluate performance with sample MP3 + TTS URLs.

---

END OF DOCUMENT

## Appendix A: livekit-client-2 cleanup candidates (no functional change)

These items appear unused for the initial Speaker flow and can be removed or gated to reduce surface area. Verify with a quick search/build before deletion; consider a build tag or debug flag if useful later.

- WebSocket Binary Ingest Path (kept for tests)
  - `handleIncomingAudio(data []byte)` is used by our test suite. Plan: keep it, but move the logic into Publisher as `HandleIncomingPCM` and have the BinaryMessage branch delegate there. Not used in production speaker flow, but retained for tests.

- Subscription/Data forwarding
  - `enableSubscribe`, `disableSubscribe`, `handleDataPacket`, `sendBinaryData`, and `PacingBuffer` are used to forward subscribed audio/data out via WS. Speaker flow publishes only and doesn’t need this. Candidate: move to optional `subscribe.go` or remove for now.

- Tone Publisher
  - `publishTone` is test-only. Candidate: keep behind a `DEBUG_TONE` env flag or move to a test file; or delete if no longer needed.

- Stats for WS/data forwarding
  - Fields in `ClientStats` related to wsSendCount/wsSendBytes/dataPkts may be trimmed with the above removals.

- Resampler helpers in `audio.go`
  - If not invoked by the new speaker path (ffmpeg handles SR), keep in `resample.go` for future or remove if confirmed unused.

Recommendation: First, split files as outlined (speaker.go, commands.go, bridge_client.go, etc.) without changing behavior; then safely drop or gate these blocks and re-run integration tests.
