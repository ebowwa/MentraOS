# LiveKit gRPC Migration

Migrating LiveKit audio bridge from WebSocket to gRPC for proper IPC.

## Documents

- **[livekit-grpc-spec.md](livekit-grpc-spec.md)** - Problem statement, goals, constraints
- **[livekit-grpc-architecture.md](livekit-grpc-architecture.md)** - Current system, proposed design, implementation details
- **[livekit-bridge.proto](livekit-bridge.proto)** - Protocol Buffer definition (source of truth)
- **[proto-usage.md](proto-usage.md)** - Protocol usage guide with code examples

## Quick Context

**Current**: Go bridge ↔ TypeScript cloud via WebSocket

- Memory leaks from unbounded goroutine spawning
- No flow control/backpressure
- Manual reconnection logic
- PacingBuffer smooths bursty LiveKit delivery (but causes goroutine leak)

**Proposed**: Go bridge ↔ TypeScript cloud via gRPC

- HTTP/2 multiplexing + automatic backpressure
- Bidirectional streaming
- Built-in reconnection and health checks
- Move jitter buffering to TypeScript (only where needed)

## Key Context

**Jitter Buffering**: Client sends steady 100ms audio chunks, but LiveKit/network delivers bursty (e.g., 4 chunks in 5ms, then 300ms gap). Current PacingBuffer smooths this for Soniox transcription but spawns unbounded goroutines. gRPC solution moves pacing to TypeScript AudioManager (only for Soniox/translation, apps get low-latency bursty delivery).

## Status

- [x] Problem analysis
- [x] Architecture design
- [ ] Protocol definition
- [ ] Implementation
- [ ] Testing
- [ ] Rollout

## Key Metrics Target

| Metric             | Current     | Target |
| ------------------ | ----------- | ------ |
| Memory/session     | ~25MB       | <5MB   |
| Goroutines/session | 600+ (slow) | 2-3    |
| Memory leak rate   | +500MB/hr   | ~0     |
