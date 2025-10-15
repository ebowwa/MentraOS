# Next Steps for LiveKit gRPC Migration

## Status: TypeScript Client Implemented ✅

The TypeScript gRPC client has been successfully implemented and integrated into the LiveKitManager. The old WebSocket client code remains for reference but is no longer used.

## What Was Done

### TypeScript Implementation

- ✅ Created `LiveKitGrpcClient.ts` - Full gRPC client implementation
- ✅ Updated `LiveKitManager.ts` - Switched from WebSocket to gRPC client
- ✅ Added gRPC dependencies to `package.json`
- ✅ Copied proto file to cloud package at `proto/livekit_bridge.proto`
- ✅ Exported new client in livekit module index

### Key Features Implemented

1. **Bidirectional audio streaming** - `StreamAudio` RPC with automatic reconnection
2. **Room management** - `JoinRoom` and `LeaveRoom` RPCs
3. **Server-side audio playback** - `PlayAudio` and `StopAudio` RPCs
4. **Event handling** - Per-request event handlers for audio playback
5. **Legacy compatibility** - Maintains same API surface as old WebSocket client
6. **Automatic backpressure** - Leverages HTTP/2 flow control

## Immediate Next Steps

### 1. Install Dependencies

```bash
cd MentraOS-2/cloud/packages/cloud
bun install
```

This will install:

- `@grpc/grpc-js@^1.12.4`
- `@grpc/proto-loader@^0.7.15`

### 2. Update Environment Variables

Add to your `.env` or environment:

```bash
# gRPC bridge URL (replaces old WebSocket URL)
LIVEKIT_GRPC_BRIDGE_URL=livekit-bridge:9090

# Old variables (keep for now during migration)
LIVEKIT_GO_BRIDGE_URL=ws://livekit-bridge:8080/ws  # unused but kept for rollback

# LiveKit credentials (unchanged)
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

### 3. Verify Go Bridge is Built

The Go gRPC bridge should already be implemented. Verify:

```bash
cd MentraOS-2/cloud/packages/cloud-livekit-bridge

# Check generated proto code exists
ls proto/livekit_bridge.pb.go proto/livekit_bridge_grpc.pb.go

# Build the bridge
go build -o livekit-bridge

# Test run (optional)
PORT=9090 LIVEKIT_URL=wss://... ./livekit-bridge
```

### 4. Update Docker Compose

Verify `docker-compose.dev.yml` has the correct port mapping:

```yaml
services:
  livekit-bridge:
    build: ./packages/cloud-livekit-bridge
    ports:
      - "9090:9090" # gRPC port
    environment:
      - PORT=9090
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
```

### 5. Test Locally

```bash
# In cloud root directory
cd MentraOS-2/cloud

# Start services
docker-compose -f docker-compose.dev.yml up --build

# Or if using bun directly:
cd packages/cloud
bun run dev
```

**What to test:**

1. User connects to MentraOS session
2. LiveKit room is created
3. Audio flows from mobile → cloud (via gRPC bridge)
4. Audio transcription works (Soniox)
5. Server-side audio playback (TTS, MP3 URLs)
6. No memory leaks (monitor for 30+ minutes)

### 6. Monitor Metrics

Watch for these improvements:

| Metric             | Old (WebSocket) | Target (gRPC) |
| ------------------ | --------------- | ------------- |
| Memory/session     | 25MB+           | <5MB          |
| Goroutines/session | 600+            | 2-3           |
| Memory growth      | +500MB/hr       | ~0            |
| Audio latency      | 50-100ms        | 10-30ms       |

**How to check:**

```bash
# Go bridge metrics (if health endpoint added)
curl http://localhost:9090/health

# Docker stats
docker stats livekit-bridge

# Goroutine count (add to Go bridge if needed)
# Could expose via gRPC reflection or separate HTTP debug endpoint
```

## Testing Checklist

- [ ] **Build succeeds** - `bun install && bun run build` in cloud package
- [ ] **No TypeScript errors** - Check imports and types
- [ ] **Bridge connects** - Cloud connects to gRPC bridge on :9090
- [ ] **Room join works** - User can join LiveKit room
- [ ] **Audio flows** - Bidirectional audio streaming works
- [ ] **Transcription works** - Soniox receives steady 100ms chunks
- [ ] **Playback works** - Server-side MP3/WAV playback
- [ ] **No memory leaks** - Stable memory over 1+ hour
- [ ] **Reconnection works** - Bridge recovery after disconnect
- [ ] **Clean shutdown** - No goroutine leaks on session close

## Debugging Tips

### TypeScript Side

**Enable debug logging:**

```typescript
// In LiveKitGrpcClient.ts, add more verbose logs
this.logger.level = "debug";
```

**Check proto loading:**

```bash
# Verify proto file exists
ls cloud/packages/cloud/proto/livekit_bridge.proto

# Check path resolution in running app
# Add console.log(PROTO_PATH) in initializeGrpcClient()
```

**Verify gRPC connection:**

```typescript
// In LiveKitManager or UserSession startup
this.logger.info(
  {
    grpcUrl: process.env.LIVEKIT_GRPC_BRIDGE_URL,
    isConnected: bridgeClient?.isConnected(),
  },
  "LiveKit gRPC status",
);
```

### Go Bridge Side

**Check if running:**

```bash
# List processes
ps aux | grep livekit-bridge

# Check port is listening
lsof -i :9090
# or
netstat -tlnp | grep 9090
```

**View logs:**

```bash
# Docker logs
docker logs -f livekit-bridge

# If running directly
# (logs should appear in stdout)
```

**Test gRPC directly:**

```bash
# Install grpcurl
brew install grpcurl  # macOS
# or apt-get install grpcurl

# Test health check
grpcurl -plaintext localhost:9090 mentra.livekit.bridge.LiveKitBridge/HealthCheck

# List services
grpcurl -plaintext localhost:9090 list
```

## Common Issues & Solutions

### "Cannot find module '@grpc/grpc-js'"

**Solution:** Run `bun install` in `cloud/packages/cloud`

### "Proto file not found"

**Solution:** Verify `cloud/packages/cloud/proto/livekit_bridge.proto` exists

### "Connection refused to livekit-bridge:9090"

**Solution:**

- Check bridge is running: `docker ps | grep livekit-bridge`
- Check port mapping in docker-compose
- Try `localhost:9090` if running locally

### "Invalid argument" or proto parsing errors

**Solution:**

- Ensure Go proto files were generated with same proto version
- Regenerate if needed: `cd cloud-livekit-bridge && ./proto/generate.sh`

### Audio not flowing

**Solution:**

1. Check LiveKit credentials are valid
2. Verify room was created in LiveKit dashboard
3. Check mobile app is publishing to DataChannel
4. Enable debug logs to see audio chunks

### Memory still growing

**Solution:**

- Verify old WebSocket bridge is NOT running
- Check that `LiveKitClient.ts` is not being imported anywhere
- Monitor goroutines in Go bridge (should be 2-3 per session)

## Rollback Plan

If critical issues arise:

1. **Update LiveKitManager.ts:**

   ```typescript
   import LiveKitClient from "./LiveKitClient"; // old WebSocket client
   // ...
   this.bridgeClient = new LiveKitClient(this.session);
   ```

2. **Revert environment variables:**

   ```bash
   LIVEKIT_GO_BRIDGE_URL=ws://livekit-bridge:8080/ws
   # Remove LIVEKIT_GRPC_BRIDGE_URL
   ```

3. **Redeploy old bridge:**
   ```bash
   # Use old livekit-client-2 code
   # Or revert Git commit
   ```

## Production Deployment Strategy

### Phase 1: Staging (Week 1)

- Deploy gRPC bridge + TypeScript client to staging
- Run 24-hour soak test
- Monitor memory, goroutines, error rates
- Test with real user sessions

### Phase 2: Production Canary (Week 2)

- Deploy to 10% of production traffic
- Monitor for 48 hours
- Compare metrics to baseline
- Gradual rollout: 25% → 50% → 100%

### Phase 3: Full Rollout (Week 3)

- 100% traffic on gRPC
- Monitor for 1 week
- If stable, proceed to cleanup

### Phase 4: Cleanup (Week 4)

- Delete `livekit-client-2/` directory (old WebSocket bridge)
- Remove `LiveKitClient.ts` (old WebSocket TS client)
- Remove old environment variables
- Update all documentation

## Success Criteria

Before marking this complete:

- ✅ No production incidents related to LiveKit audio
- ✅ Memory growth <10MB/hour per bridge instance
- ✅ Goroutine count stable at 2-3 per session
- ✅ Audio latency <50ms p95
- ✅ Zero audio quality degradation reports
- ✅ Monitoring and alerting in place
- ✅ Rollback plan tested and documented

## Resources

- **Proto definition:** `cloud/packages/cloud-livekit-bridge/proto/livekit_bridge.proto`
- **Go implementation:** `cloud/packages/cloud-livekit-bridge/service.go`, `session.go`
- **TS implementation:** `cloud/packages/cloud/src/services/session/livekit/LiveKitGrpcClient.ts`
- **Architecture docs:** `cloud/issues/livekit-grpc/livekit-grpc-architecture.md`
- **Migration plan:** `cloud/issues/livekit-grpc/livekit-grpc-migration.md`
- **Roadmap:** `cloud/issues/livekit-grpc/implementation-roadmap.md`

## Questions or Issues?

1. Check implementation status: `IMPLEMENTATION-STATUS.md`
2. Review architecture: `livekit-grpc-architecture.md`
3. Check Discord: https://discord.gg/5ukNvkEAqT
4. Create GitHub issue with logs and context

---

**Current Status:** Ready for local testing and validation.
**Next Action:** Run `bun install` and test locally with docker-compose.
