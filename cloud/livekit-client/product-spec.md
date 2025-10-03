# LiveKit Client Bridge - Product Specification

## Overview

Go-based WebRTC client that bridges TypeScript MentraOS cloud to LiveKit. Replaces unreliable Node.js LiveKit SDK with stable Go implementation.

```
Smart Glasses → TypeScript Cloud → Go Bridge → LiveKit
                [Business Logic]   [WebRTC]    [SFU]
```

## Problems

### Current Audio Architecture Limitations

Our system needs to stream real-time audio between smart glasses and cloud services. Currently we use WebSocket with binary frames to send 16kHz PCM audio chunks. This works but has issues:

- **No adaptive quality** - WebSocket can't adjust bitrate for network conditions
- **Packet loss = audio gaps** - No recovery mechanism for dropped packets
- **No jitter buffering** - Audio stutters on variable latency networks
- **High bandwidth usage** - Raw PCM uses ~256kbps per stream

### Why We Need WebRTC

WebRTC (via LiveKit) solves these issues with:

- Adaptive bitrate based on network conditions
- Forward error correction for packet loss
- Built-in jitter buffering
- Opus codec compression (~32-64kbps)
- Proven scalability via SFU architecture

### The LiveKit SDK Problem

LiveKit provides several SDKs, but none work for our Node.js/TypeScript backend:

1. **LiveKit Server SDK** (`livekit-server-sdk-js`)
   - ✅ Can create rooms and mint tokens
   - ❌ Cannot create WebRTC clients that join rooms
   - Purpose: Admin operations only

2. **LiveKit Browser SDK** (`livekit-client`)
   - ✅ Full WebRTC client capabilities
   - ❌ Requires browser DOM/WebRTC APIs
   - Cannot run in Node.js environment

3. **LiveKit Node SDK** (`@livekit/rtc-node`)
   - ✅ Can subscribe to audio (receive)
   - ❌ Cannot publish audio (send) - critical blocker
   - ❌ Still in beta, "not production ready" per LiveKit team
   - ❌ Frequent crashes and memory leaks

### Why This Matters

Without a working WebRTC client in our TypeScript backend, we can't:

- Receive audio from glasses via LiveKit
- Send audio back to glasses (future TTS features)
- Leverage LiveKit's infrastructure we're already paying for
- Provide reliable audio quality on poor networks

## Why Go

- **LiveKit is written in Go** - First-class SDK support
- **Mature WebRTC libraries** - Pion WebRTC is production-tested
- **Go SDK is stable** - Can both publish and subscribe reliably
- **Single process efficiency** - One Go service handles all users
- **Clear separation** - TypeScript handles business logic, Go handles WebRTC transport

## Architecture

### Component Layout

```
Docker Container
├── TypeScript Cloud (Port 3000)
│   ├── UserSession
│   ├── LiveKitManager
│   └── LiveKitClient (WebSocket client)
│
└── Go Service (Port 8080)
    └── Map[userId] → LiveKitClient instances
        ├── Client1 (WebRTC connection)
        ├── Client2 (WebRTC connection)
        └── ClientN (WebRTC connection)
```

### How It Works

1. **Connection Flow**
   - TypeScript connects to Go via `ws://localhost:8080/ws?userId=${userId}`
   - Each user gets dedicated WebSocket connection to Go service
   - Go maintains WebRTC connection to LiveKit for each user

2. **Audio Flow**
   - **Publish**: 16kHz PCM → Go (resamples to 48kHz) → LiveKit WebRTC
   - **Subscribe**: LiveKit 48kHz → Go (downsamples to 16kHz) → TypeScript

3. **Single Go Process**
   - One process handles all users (not process-per-user)
   - In-memory map of userId to LiveKit client instances
   - Runs as sidecar in same Docker container

## Message Protocol

### Control Messages (JSON)

```typescript
// TypeScript → Go
type Commands =
  | { action: "join_room"; roomName: string; token: string }
  | { action: "leave_room" };

// Go → TypeScript
type Events =
  | { type: "room_joined"; participantCount: number }
  | { type: "room_left" }
  | { type: "error"; error: string };
```

### Audio Data (Binary)

- **Send audio**: Raw PCM buffer over WebSocket (no JSON)
- **Receive audio**: Raw PCM buffer from WebSocket (no JSON)
- **Why binary**: JSON.parse on every audio chunk kills performance

## Implementation

### Go Service

```go
type LiveKitService struct {
    clients map[string]*LiveKitClient  // userId → client
    mu      sync.RWMutex
}

type LiveKitClient struct {
    userId     string
    ws         *websocket.Conn    // WebSocket to TypeScript
    room       *livekit.Room      // WebRTC to LiveKit
    resampler  *Resampler         // 16kHz ↔ 48kHz conversion
}

// WebSocket handler
func (s *LiveKitService) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    userId := r.URL.Query().Get("userId")
    ws, _ := upgrader.Upgrade(w, r, nil)

    client := &LiveKitClient{
        userId: userId,
        ws:     ws,
    }

    s.clients[userId] = client
    client.Start()
}
```

### TypeScript Client

```typescript
export class LiveKitClient {
  private ws: WebSocket;

  constructor(userId: string) {
    this.ws = new WebSocket(`ws://localhost:8080/ws?userId=${userId}`);
  }

  async joinRoom(roomName: string, token: string) {
    this.ws.send(
      JSON.stringify({
        action: "join_room",
        roomName,
        token,
      }),
    );
  }

  publishAudio(pcmData: ArrayBuffer) {
    // Send raw binary, no JSON wrapper
    this.ws.send(pcmData);
  }

  onAudioReceived(callback: (data: ArrayBuffer) => void) {
    this.ws.on("message", (data) => {
      if (data instanceof Buffer) {
        callback(data.buffer);
      }
    });
  }
}
```

### Integration with Existing Code

```typescript
// In LiveKitManager
export class LiveKitManager {
  private goClient?: LiveKitClient;

  async connect(token: string) {
    // Use Go bridge instead of @livekit/rtc-node
    this.goClient = new LiveKitClient(this.userSession.userId);
    await this.goClient.joinRoom(this.roomName, token);

    // Audio flows through Go now
    this.goClient.onAudioReceived((audioData) => {
      this.userSession.audioManager.processAudioData(audioData);
    });
  }
}
```

## Audio Processing

### Resampling Requirements

- WebRTC requires 48kHz, our system uses 16kHz
- Go resamples in both directions
- Use proven resampling library (e.g., SpeexDSP)

### Audio Format

- **Internal**: 16-bit PCM, 16kHz, mono
- **WebRTC**: 16-bit PCM, 48kHz, mono
- **Chunk size**: 100ms chunks (1600 bytes at 16kHz)

## Deployment

### Local Development (Docker Compose)

```yaml
# docker-compose.dev.yml
services:
  livekit-bridge:
    build:
      context: ./livekit-client
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - LOG_LEVEL=debug
    networks:
      - augmentos-network
```

### Production (Porter)

```yaml
# porter.yaml
services:
  - name: livekit-bridge
    type: worker
    run: ./livekit-bridge
    env:
      PORT: 8080
      LOG_LEVEL: info
```

### Optional TypeScript Startup

```typescript
// Can optionally spawn from TypeScript for testing
import { spawn } from "child_process";

export class LiveKitBridgeManager {
  private process?: ChildProcess;

  async start() {
    if (process.env.LIVEKIT_BRIDGE_EXTERNAL !== "true") {
      this.process = spawn("./livekit-bridge", {
        env: { ...process.env, PORT: "8080" },
      });
    }
  }
}
```

### Dockerfile

```dockerfile
FROM golang:1.21 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o livekit-bridge

FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/livekit-bridge /usr/local/bin/
EXPOSE 8080
CMD ["livekit-bridge"]
```

## Testing

### Mock Client Usage

```typescript
// cloud-client can now use Go bridge
const client = new MentraClient({
  email: "test@example.com",
  behavior: {
    useLiveKitAudio: true, // Uses Go bridge
  },
});

// Stream audio file through LiveKit
await client.startSpeakingFromFile("./audio/test.wav");
```

### Test Scenarios

- Single user audio round-trip
- Multiple concurrent users
- Reconnection handling
- Fallback to WebSocket on failure

## Current Status

- ✅ WebSocket audio working (fallback path)
- ✅ LiveKit room creation and token minting
- ✅ TypeScript LiveKitManager structure in place
- ⏳ Go service implementation needed
- ⏳ Integration testing required
