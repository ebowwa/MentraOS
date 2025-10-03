# LiveKit Go Bridge

Go-based WebRTC client bridge for MentraOS that handles LiveKit WebRTC connections, replacing the unreliable Node.js LiveKit SDK.

## Why This Exists

- Node.js LiveKit SDK (`@livekit/rtc-node`) can't publish audio and is marked "not production ready"
- WebSocket audio lacks adaptive bitrate, packet loss recovery, and jitter buffering
- Go has mature WebRTC support and LiveKit itself is written in Go

## Architecture

```
MentraOS Cloud → WebSocket → Go Bridge → WebRTC → LiveKit
```

- TypeScript keeps all business logic
- Go handles only WebRTC transport
- Single Go process manages all users
- Binary protocol for audio (no JSON overhead)

## Running Locally

### Standalone Go Service

```bash
# Install dependencies
go mod download

# Run the service
go run .

# Or build and run
go build -o livekit-bridge
./livekit-bridge
```

### With Docker Compose

```bash
# From cloud directory
docker-compose -f docker-compose.dev.yml up livekit-bridge

# Or full stack
docker-compose -f docker-compose.dev.yml up
```

### Environment Variables

```bash
PORT=8080                                    # WebSocket server port
LIVEKIT_URL=wss://your-livekit.cloud       # LiveKit server URL
LOG_LEVEL=debug                             # Logging level
```

## Testing

### Full End-to-End Test

```bash
# Terminal 1: Start Go bridge
cd cloud/livekit-client
go run .

# Terminal 2: Start cloud server (with LiveKit subscriber)
cd cloud
export LIVEKIT_API_KEY=your-key
export LIVEKIT_API_SECRET=your-secret
export LIVEKIT_URL=wss://your-livekit.cloud
bun run dev

# Terminal 3: Run test client
cd cloud/cloud-client
bun src/examples/livekit-go-bridge-test.ts
```

### Integration Test

```bash
# Requires bun and LiveKit credentials
cd livekit-client
bun test-integration.ts
```

### Manual Testing with curl

```bash
# Health check
curl http://localhost:8080/health

# WebSocket connection (use wscat or similar)
wscat -c ws://localhost:8080/ws?userId=test-user
```

## Using from TypeScript

### Enable Go Bridge

```bash
# In .env
LIVEKIT_USE_GO_BRIDGE=true
LIVEKIT_GO_BRIDGE_URL=ws://localhost:8080
```

### Direct Usage

```typescript
import { LiveKitGoBridge } from "./LiveKitGoBridge";

const bridge = new LiveKitGoBridge({
  userId: "user-123",
  serverUrl: "ws://localhost:8080",
});

// Connect and join room
await bridge.connect();
await bridge.joinRoom(roomName, token);

// Handle audio
bridge.on("audio", (data: Buffer) => {
  // Process 16kHz PCM audio
});

// Publish audio
bridge.publishAudio(pcmBuffer);
```

## Protocol

### Control Messages (JSON)

```typescript
// Join room
{ "action": "join_room", "roomName": "room", "token": "jwt..." }

// Leave room
{ "action": "leave_room" }
```

### Audio Data (Binary)

- Send raw PCM buffer directly (no JSON wrapper)
- Receive raw PCM buffer from WebSocket
- Audio is automatically resampled between 16kHz ↔ 48kHz

## Audio Format

- **Internal**: 16-bit PCM, 16kHz, mono
- **WebRTC**: 16-bit PCM, 48kHz, mono (resampled automatically)
- **Chunk size**: 100ms (1600 bytes at 16kHz)

## TODO

- [ ] Add Opus encoding/decoding (currently using raw PCM)
- [ ] Implement proper audio codec negotiation
- [ ] Add metrics and monitoring
- [ ] Support multiple audio tracks per user
- [ ] Add reconnection logic for LiveKit disconnects
