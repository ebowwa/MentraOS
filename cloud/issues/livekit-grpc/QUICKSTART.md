# LiveKit gRPC Bridge - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites

- Bun installed (or Node.js 18+)
- Docker and Docker Compose
- Go 1.21+ (if building bridge manually)
- protoc (protocol buffer compiler) - already used, generated files committed

---

## Step 1: Install Dependencies

```bash
cd MentraOS-2/cloud/packages/cloud
bun install
```

This installs:

- `@grpc/grpc-js@^1.12.4`
- `@grpc/proto-loader@^0.7.15`

---

## Step 2: Set Environment Variables

Create or update `.env`:

```bash
# gRPC Bridge (NEW)
LIVEKIT_GRPC_BRIDGE_URL=livekit-bridge:9090

# LiveKit Server (EXISTING - keep these)
LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Old WebSocket bridge (keep for rollback)
LIVEKIT_GO_BRIDGE_URL=ws://livekit-bridge:8080/ws
```

---

## Step 3: Build Go Bridge (Optional - Docker does this)

```bash
cd MentraOS-2/cloud/packages/cloud-livekit-bridge

# Verify proto files exist
ls proto/livekit_bridge.pb.go proto/livekit_bridge_grpc.pb.go

# Build
go build -o livekit-bridge

# Test run (optional)
PORT=9090 LIVEKIT_URL=$LIVEKIT_URL ./livekit-bridge
```

---

## Step 4: Start with Docker Compose

```bash
cd MentraOS-2/cloud

# Start all services (builds images)
docker-compose -f docker-compose.dev.yml up --build

# Or start only the bridge
docker-compose -f docker-compose.dev.yml up livekit-bridge
```

**Expected output:**

```
livekit-bridge_1  | Starting gRPC server on :9090
livekit-bridge_1  | Server is ready
```

---

## Step 5: Verify Connection

### Check gRPC Bridge Health

```bash
# Install grpcurl (if not already installed)
brew install grpcurl  # macOS
# or: apt-get install grpcurl  # Linux

# Test health check
grpcurl -plaintext localhost:9090 \
  mentra.livekit.bridge.LiveKitBridge/HealthCheck

# Expected response:
{
  "status": "SERVING",
  "activeSessions": 0
}
```

### Check Docker Logs

```bash
# Bridge logs
docker logs -f livekit-bridge

# Cloud logs
docker logs -f cloud
```

---

## Step 6: Test with Mobile Client

1. Connect mobile app to your dev server
2. Start a session
3. Enable microphone
4. Check logs for gRPC connection:

```
LiveKitGrpcClient | gRPC client initialized | bridgeUrl: livekit-bridge:9090
LiveKitGrpcClient | Calling JoinRoom RPC
LiveKitGrpcClient | Joined LiveKit room | participantId: ...
LiveKitGrpcClient | Audio stream started
```

---

## Troubleshooting

### "Cannot find module '@grpc/grpc-js'"

```bash
cd MentraOS-2/cloud/packages/cloud
rm -rf node_modules bun.lockb
bun install
```

### "Connection refused to livekit-bridge:9090"

```bash
# Check if bridge is running
docker ps | grep livekit-bridge

# Check port mapping
docker port livekit-bridge 9090

# Try localhost instead
LIVEKIT_GRPC_BRIDGE_URL=localhost:9090 bun run dev
```

### "Proto file not found"

```bash
# Verify proto file exists
ls cloud/packages/cloud/proto/livekit_bridge.proto

# If missing, copy from bridge
cp cloud/packages/cloud-livekit-bridge/proto/livekit_bridge.proto \
   cloud/packages/cloud/proto/
```

### No audio flowing

1. **Check LiveKit credentials:**

   ```bash
   echo $LIVEKIT_URL
   echo $LIVEKIT_API_KEY
   ```

2. **Check mobile app is publishing:**
   - Mobile logs should show "Connected to LiveKit"
   - Check LiveKit dashboard for active rooms

3. **Enable debug logs:**
   ```typescript
   // In LiveKitGrpcClient.ts constructor
   this.logger = userSession.logger.child({
     service: "LiveKitGrpcClient",
     level: "debug", // Add this
   });
   ```

### Memory still growing

```bash
# Check which bridge is running
docker exec livekit-bridge ps aux | grep livekit

# Verify it's the new gRPC bridge (port 9090)
docker exec livekit-bridge netstat -tlnp | grep 9090

# If old WebSocket bridge is running, rebuild:
docker-compose down
docker-compose up --build
```

---

## Monitoring

### Memory Usage

```bash
# Docker stats
docker stats livekit-bridge --no-stream

# Expected: <50MB for idle, <10MB per active session
```

### Goroutine Count

Add to `service.go` (Go bridge):

```go
import "runtime"

func (s *LiveKitBridgeService) HealthCheck(...) {
    numGoroutines := runtime.NumGoroutine()
    // Log or return in metadata
}
```

Expected: 5-10 base + 2-3 per active session

### Active Sessions

```bash
grpcurl -plaintext localhost:9090 \
  mentra.livekit.bridge.LiveKitBridge/HealthCheck \
  | jq '.activeSessions'
```

---

## Quick Commands Reference

```bash
# Install
cd cloud/packages/cloud && bun install

# Build Go bridge
cd cloud/packages/cloud-livekit-bridge && go build

# Start dev environment
cd cloud && docker-compose -f docker-compose.dev.yml up

# Check health
grpcurl -plaintext localhost:9090 \
  mentra.livekit.bridge.LiveKitBridge/HealthCheck

# View logs
docker logs -f livekit-bridge

# Restart bridge only
docker-compose restart livekit-bridge

# Rebuild bridge
docker-compose up --build livekit-bridge

# Stop all
docker-compose down

# Clean rebuild
docker-compose down -v && docker-compose up --build
```

---

## Success Indicators

✅ gRPC bridge listening on port 9090
✅ TypeScript cloud connects to bridge
✅ User sessions create without errors
✅ Audio flows bidirectionally
✅ Transcription works (Soniox receives audio)
✅ Memory stays under 10MB per session
✅ No memory growth over 30+ minutes
✅ Clean shutdown with no goroutine leaks

---

## Next Steps

Once local testing is successful:

1. Deploy to staging environment
2. Run 24-hour soak test
3. Monitor metrics (memory, goroutines, latency)
4. Deploy to production canary (10%)
5. Gradual rollout to 100%
6. Remove old WebSocket code

See `NEXT-STEPS.md` for detailed deployment strategy.

---

## Need Help?

- **Docs:** `cloud/issues/livekit-grpc/`
- **Discord:** https://discord.gg/5ukNvkEAqT
- **Issues:** https://github.com/orgs/Mentra-Community/projects/2

---

**Status:** Ready to test locally 🚀
