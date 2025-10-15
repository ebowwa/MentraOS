# LiveKit gRPC Implementation Roadmap

Step-by-step plan for refactoring `cloud-livekit-bridge` from WebSocket to gRPC.

## Current State

**Location**: `cloud/packages/cloud-livekit-bridge/`

**What exists** (copied from `livekit-client-2`):

- `main.go` - WebSocket server setup
- `bridge_service.go` - WebSocket connection handling
- `bridge_client.go` - Per-user WebSocket client + LiveKit room
- `pacing.go` - Jitter buffer (causes goroutine leak)
- `speaker.go` - Audio playback (MP3/WAV → LiveKit)
- `types.go` - Message types
- `config.go` - Environment config
- `resample.go` - Audio resampling

**What to keep**:

- LiveKit room management logic
- Audio playback (speaker.go)
- Resampling utilities
- Config loading

**What to delete**:

- All WebSocket code
- PacingBuffer (moving to TypeScript)
- Manual reconnection logic

## Implementation Steps

### Step 1: Protocol Setup

**Files to create**:

- `proto/livekit_bridge.proto` (copy from `issues/livekit-grpc/`)
- `proto/generate.sh` (protoc generation script)

**Commands**:

```bash
cd cloud/packages/cloud-livekit-bridge
mkdir proto
cp ../../issues/livekit-grpc/livekit-bridge.proto proto/

# Generate Go code
protoc --go_out=. --go_opt=paths=source_relative \
    --go-grpc_out=. --go-grpc_opt=paths=source_relative \
    proto/livekit_bridge.proto
```

**Generated files**:

- `proto/livekit_bridge.pb.go`
- `proto/livekit_bridge_grpc.pb.go`

**Update `go.mod`**:

```
require (
    google.golang.org/grpc v1.74.2
    google.golang.org/protobuf v1.36.7
    // ... existing deps
)
```

### Step 2: Core gRPC Server

**Create `service.go`** (replaces `bridge_service.go`):

```go
type LiveKitBridgeService struct {
    pb.UnimplementedLiveKitBridgeServer
    sessions sync.Map  // userId -> *RoomSession
    config   *Config
}

func NewLiveKitBridgeService(config *Config) *LiveKitBridgeService {
    return &LiveKitBridgeService{
        config: config,
    }
}
```

**Update `main.go`**:

```go
func main() {
    config := loadConfig()

    // Create gRPC server
    grpcServer := grpc.NewServer()
    service := NewLiveKitBridgeService(config)
    pb.RegisterLiveKitBridgeServer(grpcServer, service)

    // Listen on port 9090
    lis, err := net.Listen("tcp", ":"+config.Port)
    if err != nil {
        log.Fatalf("failed to listen: %v", err)
    }

    log.Printf("LiveKit gRPC Bridge listening on :%s", config.Port)
    if err := grpcServer.Serve(lis); err != nil {
        log.Fatalf("failed to serve: %v", err)
    }
}
```

### Step 3: Room Session Management

**Create `session.go`** (refactor from `bridge_client.go`):

```go
type RoomSession struct {
    userId           string
    room             *lksdk.Room
    publishTrack     *lkmedia.PCMLocalTrack
    audioFromLiveKit chan []byte
    ctx              context.Context
    cancel           context.CancelFunc
    closeOnce        sync.Once
}

func NewRoomSession(userId string) *RoomSession {
    ctx, cancel := context.WithCancel(context.Background())
    return &RoomSession{
        userId:           userId,
        audioFromLiveKit: make(chan []byte, 10),
        ctx:              ctx,
        cancel:           cancel,
    }
}

func (s *RoomSession) Close() {
    s.closeOnce.Do(func() {
        s.cancel()
        if s.publishTrack != nil {
            s.publishTrack.Close()
        }
        if s.room != nil {
            s.room.Disconnect()
        }
        close(s.audioFromLiveKit)
    })
}
```

**Key changes**:

- No WebSocket connection
- No PacingBuffer
- Use channels for audio flow
- `sync.Once` for cleanup

### Step 4: Implement JoinRoom

**In `service.go`**:

```go
func (s *LiveKitBridgeService) JoinRoom(
    ctx context.Context,
    req *pb.JoinRoomRequest,
) (*pb.JoinRoomResponse, error) {
    session := NewRoomSession(req.UserId)

    // Setup callbacks
    roomCallback := &lksdk.RoomCallback{
        ParticipantCallback: lksdk.ParticipantCallback{
            OnDataPacket: func(packet lksdk.DataPacket, params lksdk.DataReceiveParams) {
                if params.SenderIdentity == req.TargetIdentity {
                    userPacket := packet.(*lksdk.UserDataPacket)
                    select {
                    case session.audioFromLiveKit <- userPacket.Payload:
                    default:
                        // Drop if channel full (backpressure)
                    }
                }
            },
        },
    }

    // Connect to LiveKit
    room, err := lksdk.ConnectToRoomWithToken(
        req.LivekitUrl,
        req.Token,
        roomCallback,
        lksdk.WithAutoSubscribe(false),
    )
    if err != nil {
        return &pb.JoinRoomResponse{
            Success: false,
            Error:   err.Error(),
        }, nil
    }

    session.room = room

    // Create publish track
    track, err := lkmedia.NewPCMLocalTrack(16000, 1, nil)
    if err != nil {
        room.Disconnect()
        return &pb.JoinRoomResponse{
            Success: false,
            Error:   "failed to create track",
        }, nil
    }

    if _, err := room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{
        Name: "microphone",
    }); err != nil {
        room.Disconnect()
        return &pb.JoinRoomResponse{
            Success: false,
            Error:   "failed to publish track",
        }, nil
    }

    session.publishTrack = track

    // Store session
    s.sessions.Store(req.UserId, session)

    return &pb.JoinRoomResponse{
        Success:          true,
        ParticipantId:    string(room.LocalParticipant.Identity()),
        ParticipantCount: int32(len(room.GetRemoteParticipants())),
    }, nil
}
```

### Step 5: Implement StreamAudio

**In `service.go`**:

```go
func (s *LiveKitBridgeService) StreamAudio(
    stream pb.LiveKitBridge_StreamAudioServer,
) error {
    // Get userId from first message
    firstChunk, err := stream.Recv()
    if err != nil {
        return status.Errorf(codes.InvalidArgument, "no initial chunk")
    }

    userId := firstChunk.UserId
    sessionVal, ok := s.sessions.Load(userId)
    if !ok {
        return status.Errorf(codes.NotFound, "session not found")
    }
    session := sessionVal.(*RoomSession)

    errChan := make(chan error, 2)

    // Goroutine 1: Receive from client → LiveKit
    go func() {
        // Process first chunk
        samples := bytesToInt16(firstChunk.PcmData)
        if err := session.publishTrack.WriteSample(samples); err != nil {
            errChan <- err
            return
        }

        // Continue receiving
        for {
            chunk, err := stream.Recv()
            if err == io.EOF {
                return
            }
            if err != nil {
                errChan <- err
                return
            }

            samples := bytesToInt16(chunk.PcmData)
            if err := session.publishTrack.WriteSample(samples); err != nil {
                errChan <- err
                return
            }
        }
    }()

    // Goroutine 2: Send from LiveKit → client
    go func() {
        for {
            select {
            case audioData, ok := <-session.audioFromLiveKit:
                if !ok {
                    return
                }

                // This blocks with gRPC backpressure
                if err := stream.Send(&pb.AudioChunk{
                    PcmData:    audioData,
                    SampleRate: 16000,
                    Channels:   1,
                }); err != nil {
                    errChan <- err
                    return
                }

            case <-session.ctx.Done():
                return
            }
        }
    }()

    // Wait for error or cancellation
    select {
    case err := <-errChan:
        return err
    case <-session.ctx.Done():
        return nil
    }
}
```

### Step 6: Implement PlayAudio

**Refactor `speaker.go`**:

```go
func (s *LiveKitBridgeService) PlayAudio(
    req *pb.PlayAudioRequest,
    stream pb.LiveKitBridge_PlayAudioServer,
) error {
    sessionVal, ok := s.sessions.Load(req.UserId)
    if !ok {
        return status.Errorf(codes.NotFound, "session not found")
    }
    session := sessionVal.(*RoomSession)

    // Send STARTED event
    stream.Send(&pb.PlayAudioEvent{
        Type:      pb.PlayAudioEvent_STARTED,
        RequestId: req.RequestId,
    })

    // Download and decode (reuse existing logic from speaker.go)
    if err := s.playAudioFile(req, session, stream); err != nil {
        stream.Send(&pb.PlayAudioEvent{
            Type:      pb.PlayAudioEvent_FAILED,
            RequestId: req.RequestId,
            Error:     err.Error(),
        })
        return err
    }

    // Send COMPLETED event
    return stream.Send(&pb.PlayAudioEvent{
        Type:      pb.PlayAudioEvent_COMPLETED,
        RequestId: req.RequestId,
    })
}
```

**Keep existing logic**:

- MP3 decoding (go-mp3)
- WAV parsing
- Resampling (resample.go)
- Just change how we send events (gRPC stream instead of WebSocket JSON)

### Step 7: Health Check

**In `service.go`**:

```go
func (s *LiveKitBridgeService) HealthCheck(
    ctx context.Context,
    req *pb.HealthCheckRequest,
) (*pb.HealthCheckResponse, error) {
    var activeSessions int32
    s.sessions.Range(func(key, value interface{}) bool {
        activeSessions++
        return true
    })

    return &pb.HealthCheckResponse{
        Status:         pb.HealthCheckResponse_SERVING,
        ActiveSessions: activeSessions,
    }, nil
}
```

### Step 8: Testing

**Create `service_test.go`**:

```go
func TestJoinRoom(t *testing.T) {
    config := &Config{
        LiveKitURL: "wss://test.livekit.cloud",
    }
    service := NewLiveKitBridgeService(config)

    req := &pb.JoinRoomRequest{
        UserId:   "test-user",
        RoomName: "test-room",
        Token:    "test-token",
    }

    resp, err := service.JoinRoom(context.Background(), req)
    assert.NoError(t, err)
    assert.True(t, resp.Success)
}
```

**Integration tests**:

- Test with real LiveKit server
- Verify audio flow
- Check memory usage
- Measure goroutine count

### Step 9: TypeScript Client

**Create `packages/cloud/src/services/session/LiveKitGrpcClient.ts`**:

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

export class LiveKitGrpcClient {
    private client: any;
    private audioStream: grpc.ClientDuplexStream | null;

    constructor(userSession: UserSession) {
        // Load proto
        const packageDef = protoLoader.loadSync(
            'path/to/livekit_bridge.proto',
            { keepCase: true }
        );
        const proto = grpc.loadPackageDefinition(packageDef);

        // Create client
        this.client = new proto.mentra.livekit.bridge.LiveKitBridge(
            'localhost:9090',
            grpc.credentials.createInsecure()
        );
    }

    async connect(params: {...}) {
        // JoinRoom
        await new Promise((resolve, reject) => {
            this.client.joinRoom(params, (err, resp) => {
                if (err) reject(err);
                else if (!resp.success) reject(new Error(resp.error));
                else resolve(resp);
            });
        });

        // Start audio stream
        this.audioStream = this.client.streamAudio();

        this.audioStream.on('data', (chunk) => {
            this.userSession.audioManager.processAudioData(
                Buffer.from(chunk.pcm_data)
            );
        });
    }
}
```

**Update `LiveKitManager.ts`**:

```typescript
constructor(session: UserSession) {
    // Use gRPC client (old WebSocket client removed)
    this.bridgeClient = new LiveKitGrpcClient(session);
}
```

### Step 10: Deployment

**Docker Compose**:

```yaml
services:
  livekit-bridge:
    build: ./packages/cloud-livekit-bridge
    ports:
      - "9090:9090"
    environment:
      - PORT=9090
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
```

**Deployment steps**:

1. Test in dev environment
2. Deploy to staging, test thoroughly (24hr soak test)
3. Deploy to production (gRPC only)
4. Monitor metrics closely
5. Rollback if issues (revert to old deployment/image)

### Step 11: Cleanup

**After 1 week stable**:

```bash
# Delete old WebSocket bridge
rm -rf livekit-client-2/

# Update docker-compose references
# Update Dockerfile.livekit references
```

## File Structure (Final)

```
cloud/packages/cloud-livekit-bridge/
├── main.go                 (gRPC server setup)
├── service.go              (LiveKitBridgeService implementation)
├── session.go              (RoomSession management)
├── playback.go             (audio playback, refactored from speaker.go)
├── resample.go             (audio resampling, unchanged)
├── config.go               (environment config, unchanged)
├── proto/
│   ├── livekit_bridge.proto
│   ├── livekit_bridge.pb.go
│   └── livekit_bridge_grpc.pb.go
├── go.mod
├── go.sum
├── Dockerfile
└── README.md
```

## Testing Checklist

- [ ] JoinRoom creates session
- [ ] StreamAudio bidirectional flow
- [ ] Audio arrives in TypeScript AudioManager
- [ ] PlayAudio downloads and plays MP3
- [ ] PlayAudio downloads and plays WAV
- [ ] Health check returns correct status
- [ ] Memory stays under 5MB per session
- [ ] Goroutines stay at 2-3 per session
- [ ] No goroutine leaks after disconnect
- [ ] gRPC backpressure works (slow client)
- [ ] Reconnection handled by gRPC
- [ ] Rollback works (revert deployment)

## Success Metrics

After deployment, verify:

- Memory per session: <5MB (baseline: 25MB)
- Goroutines per session: 2-3 (baseline: 600+)
- Memory leak rate: ~0 (baseline: +500MB/hr)
- Audio latency: 10-30ms (baseline: 50-100ms)
- CPU usage: <1 core avg (baseline: 2-3 cores)

## Rollback Plan

If issues detected:

```bash
# Rollback to previous deployment
kubectl rollout undo deployment/cloud

# Or redeploy previous image
kubectl set image deployment/cloud cloud=previous-image-tag
```

Monitor for:

- Memory spike >100MB/hour
- Error rate >1% above baseline
- Goroutine count >1000
- Audio quality degradation

## Timeline Estimate

- **Step 1-3** (gRPC setup): 1 day
- **Step 4-5** (room + streaming): 2 days
- **Step 6** (audio playback): 1 day
- **Step 7** (health check): 0.5 day
- **Step 8** (testing): 1 day
- **Step 9** (TS client): 1 day
- **Step 10** (deployment): 0.5 day
- **Step 11** (cleanup): 0.5 day

**Total**: ~8 days development + 1 week monitoring before cleanup

---

**Design docs**: `../../issues/livekit-grpc/`
