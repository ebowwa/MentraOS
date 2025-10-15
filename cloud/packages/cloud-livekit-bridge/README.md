# LiveKit gRPC Bridge

Go service providing gRPC interface between TypeScript cloud and LiveKit rooms.

**This is the refactored version** - migrating from WebSocket to gRPC architecture.

## Status

🚧 **In Progress** - Being refactored to gRPC-based architecture

See design docs: `cloud/issues/livekit-grpc/`

## What This Does

- Connects to LiveKit rooms via WebRTC
- Provides gRPC API for TypeScript cloud service
- Handles bidirectional audio streaming
- Server-side audio playback (MP3/WAV → LiveKit track)

## Architecture

```
TypeScript Cloud ←─ gRPC (HTTP/2) ─→ Go Bridge ←─ WebRTC ─→ LiveKit SFU
```

**Why Go**: LiveKit TS SDK can't publish custom PCM, Go SDK works perfectly

**Why gRPC**: WebSocket caused memory leaks (unbounded goroutines), no backpressure

## Key Changes from Old System

| Aspect             | Old (WebSocket)       | New (gRPC)                |
| ------------------ | --------------------- | ------------------------- |
| IPC                | WebSocket             | gRPC bidirectional stream |
| Goroutines/session | 600+ (leaks)          | 2-3 (bounded)             |
| Backpressure       | Manual (PacingBuffer) | Automatic (HTTP/2)        |
| Memory/session     | 25MB                  | <5MB target               |
| Jitter buffering   | Go (PacingBuffer)     | TypeScript (AudioManager) |

## Development Setup

**Proto code is already generated and committed** - you don't need protoc installed to build!

If you modify `proto/livekit_bridge.proto`, regenerate with:

```bash
# Install protoc (macOS)
brew install protobuf

# Generate Go code
./proto/generate.sh
```

## Running

```bash
# Development
go run .

# Build
go build -o livekit-bridge

# Run
./livekit-bridge
```

## Environment Variables

```bash
PORT=9090                        # gRPC server port
LIVEKIT_URL=wss://...            # LiveKit server
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

## Protocol

See `cloud/issues/livekit-grpc/livekit-bridge.proto`

## Implementation Status

- [x] Protocol Buffer definitions
- [x] gRPC server setup
- [x] StreamAudio (bidirectional streaming)
- [x] JoinRoom/LeaveRoom (room management)
- [x] PlayAudio (server-side playback)
- [x] Health checks
- [ ] TypeScript client integration
- [ ] Testing

## Migration Path

1. Implement gRPC service (this package)
2. Test in dev/staging
3. Deploy to prod with feature flag OFF
4. Enable 100% via `LIVEKIT_USE_GRPC=true`
5. Monitor, rollback if issues
6. Clean up old WebSocket code

---

**Design docs**: `../../issues/livekit-grpc/`
**Old system**: `../../livekit-client-2/` (to be deprecated)
