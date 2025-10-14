# LiveKit Bridge: WebSocket to gRPC Migration Design

## Executive Summary

**Problem:** Memory leak caused by 819+ leaked WebSocket connections between TypeScript cloud service and Go LiveKit bridge, running in the same Docker container. WebSockets are unnecessary overhead for inter-process communication.

**Solution:** Replace WebSocket-based communication with gRPC using Unix Domain Sockets for efficient, type-safe, bidirectional audio streaming and control commands.

**Impact:**

- Eliminates WebSocket connection leaks
- Reduces memory usage by ~500MB per leaked connection
- Improves audio streaming performance (Unix sockets 2-3x faster than localhost TCP)
- Adds type safety through Protocol Buffers
- Simplifies connection lifecycle management

---

## Current Architecture Problems

### File: `livekit-bridge/bridge_service.go`

**Current Implementation:**

```go
func (s *BridgeService) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    // ...
    s.mu.Lock()
    if existing, ok := s.clients[userID]; ok {
        existing.Close()
        s.mu.Unlock()
        select {
        case <-existing.closed:
        case <-time.After(2 * time.Second):  // ← TIMEOUT CAUSES LEAK
        }
        s.mu.Lock()
    }
    s.clients[userID] = client
    s.mu.Unlock()
    // ...
}
```

**Problem:** When a client reconnects, the old WebSocket cleanup times out after 2 seconds, leaving the TypeScript-side socket open indefinitely. Over time, these accumulate to 819+ leaked connections consuming memory.

### File: `packages/cloud/src/services/session/LiveKitClient.ts`

**Current Implementation:**

```typescript
async connect(params: {...}): Promise<void> {
    if (this.ws) await this.close();  // ← Attempts cleanup

    this.ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    // ... connection setup
}

async close(): Promise<void> {
    if (!this.ws) return;
    try {
        this.ws.send(JSON.stringify({ action: "subscribe_disable" }));
        this.manualClose = true;
        this.ws.close();
    } catch {
        // ignore
    }
    this.ws = null;  // ← Socket may still be open on Go side
}
```

**Problem:** If Go side closes first or times out, TypeScript WebSocket never receives proper close event. Socket remains in half-closed state, leaking file descriptors and memory.

### Observed Symptoms

**From container diagnosis:**

```bash
PID 7 (Go bridge): 23 sockets open
PID 11 (Bun/TypeScript): 819 sockets open  # ← THE LEAK

# Most sockets created around 03:05 and 18:09 (restart times)
# Indicates sockets persist across container restarts
```

### Why WebSockets Are Wrong Here

1. **Unnecessary TCP/IP overhead** - Both processes in same container
2. **Complex lifecycle management** - Manual cleanup, timeouts, reconnection logic
3. **No type safety** - JSON string messages, runtime errors
4. **Bidirectional audio awkward** - WebSocket designed for request/response, not continuous streaming
5. **Port conflicts possible** - TCP localhost:8080 could conflict with other services
6. **No automatic reconnection** - Must implement manually with exponential backoff

---

## Proposed gRPC Architecture

### Overview

Replace WebSocket communication with gRPC over Unix Domain Sockets:

```
┌─────────────────────────────────────────────────┐
│  Docker Container (cloud-dev)                   │
│                                                  │
│  ┌──────────────────┐    Unix Socket           │
│  │  TypeScript      │  /tmp/livekit-bridge.sock│
│  │  Cloud Service   │◄──────────────────────────┤
│  │  (Bun, Port 80)  │   gRPC Bidirectional     │
│  └──────────────────┘   Streaming               │
│         │                                        │
│         │ UserSession per user                  │
│         │ LiveKitManager                        │
│         │ LiveKitClient (gRPC client)           │
│         │                                        │
│  ┌──────▼──────────┐                            │
│  │  Go Service     │                            │
│  │  LiveKit Bridge │                            │
│  │  (gRPC Server)  │                            │
│  └─────────────────┘                            │
│         │                                        │
│         ├─ Map[userId]→BridgeClient             │
│         │  Each user gets one gRPC stream       │
│         │                                        │
│         ▼                                        │
│    LiveKit Cloud (WebRTC)                       │
│    wss://mentraos-*.livekit.cloud               │
└─────────────────────────────────────────────────┘
```

### Key Design Principles

1. **One gRPC stream per user** - Single bidirectional stream handles both audio directions
2. **Unix Domain Socket** - `/tmp/livekit-bridge.sock` for inter-process communication
3. **Automatic cleanup** - gRPC handles connection lifecycle, no manual timeout logic
4. **Type safety** - Protocol Buffers define all message types at compile time
5. **Concurrent users** - gRPC naturally supports multiple concurrent streams over one Unix socket

---

## Protocol Buffer Definitions

### File: `livekit-bridge/proto/livekit_bridge.proto`

```protobuf
syntax = "proto3";

package livekit_bridge;

option go_package = "github.com/yourorg/livekit-bridge/proto";

// Main service definition
service LiveKitBridge {
  // Bidirectional audio streaming - handles both publish and subscribe
  // Client sends audio TO LiveKit (microphone)
  // Server sends audio FROM LiveKit (remote participants)
  rpc AudioStream(stream AudioPacket) returns (stream AudioPacket);

  // Room management
  rpc JoinRoom(JoinRoomRequest) returns (JoinRoomResponse);
  rpc LeaveRoom(LeaveRoomRequest) returns (LeaveRoomResponse);

  // Subscription control
  rpc EnableSubscribe(SubscribeRequest) returns (SubscribeResponse);
  rpc DisableSubscribe(SubscribeRequest) returns (SubscribeResponse);

  // Server-side audio playback (existing feature)
  rpc PlayURL(PlayURLRequest) returns (stream PlayURLEvent);
  rpc StopPlayback(StopPlaybackRequest) returns (StopPlaybackResponse);

  // Health check
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

// Audio streaming messages
message AudioPacket {
  string user_id = 1;           // cloud-agent:{email}
  bytes pcm_data = 2;            // 16kHz PCM16 mono audio
  int64 timestamp_ms = 3;        // Unix timestamp milliseconds

  // Optional metadata
  bool is_final = 4;             // Last packet in sequence
  string stream_id = 5;          // For tracking streams
}

// Room management
message JoinRoomRequest {
  string user_id = 1;            // cloud-agent:{email}
  string room_name = 2;          // User's LiveKit room
  string token = 3;              // JWT token for LiveKit
  string url = 4;                // LiveKit server URL
  string target_identity = 5;    // Identity to subscribe to
}

message JoinRoomResponse {
  bool success = 1;
  string error = 2;
  string room_name = 3;
  int32 participant_count = 4;
  string participant_id = 5;
}

message LeaveRoomRequest {
  string user_id = 1;
}

message LeaveRoomResponse {
  bool success = 1;
  string error = 2;
}

// Subscription control
message SubscribeRequest {
  string user_id = 1;
  string target_identity = 2;   // Identity to subscribe/unsubscribe
}

message SubscribeResponse {
  bool success = 1;
  string error = 2;
}

// Server-side playback (URL streaming)
message PlayURLRequest {
  string user_id = 1;
  string request_id = 2;         // For tracking async response
  string url = 3;                // MP3/WAV URL to play
  double volume = 4;             // 0.0 to 1.0
  bool stop_other = 5;           // Stop other playing audio
}

message PlayURLEvent {
  enum EventType {
    UNKNOWN = 0;
    PLAY_STARTED = 1;
    PLAY_COMPLETE = 2;
    PLAY_ERROR = 3;
  }

  EventType type = 1;
  string request_id = 2;
  bool success = 3;
  int32 duration_ms = 4;
  string error = 5;
}

message StopPlaybackRequest {
  string user_id = 1;
  string request_id = 2;         // Optional: stop specific request
}

message StopPlaybackResponse {
  bool success = 1;
  string error = 2;
}

// Health check
message HealthCheckRequest {
  // Empty for now
}

message HealthCheckResponse {
  bool healthy = 1;
  int32 active_clients = 2;
  int64 uptime_seconds = 3;
}
```

---

## Go Implementation

### File: `livekit-bridge/main.go`

**Changes:**

```go
package main

import (
    "log"
    "net"
    "os"
    "google.golang.org/grpc"
    pb "github.com/yourorg/livekit-bridge/proto"
)

func main() {
    config := loadConfig()

    // Unix Domain Socket instead of TCP
    socketPath := "/tmp/livekit-bridge.sock"

    // Remove stale socket if exists
    if err := os.Remove(socketPath); err != nil && !os.IsNotExist(err) {
        log.Fatalf("Failed to remove old socket: %v", err)
    }

    // Listen on Unix socket
    listener, err := net.Listen("unix", socketPath)
    if err != nil {
        log.Fatalf("Failed to listen on Unix socket: %v", err)
    }
    defer os.Remove(socketPath)

    // Set socket permissions (readable/writable by owner only)
    if err := os.Chmod(socketPath, 0600); err != nil {
        log.Fatalf("Failed to set socket permissions: %v", err)
    }

    // Create gRPC server
    grpcServer := grpc.NewServer(
        grpc.MaxConcurrentStreams(1000), // Support many concurrent users
        grpc.KeepaliveParams(keepalive.ServerParameters{
            Time:    30 * time.Second,
            Timeout: 10 * time.Second,
        }),
    )

    // Register service
    bridgeService := NewLiveKitBridgeService(config)
    pb.RegisterLiveKitBridgeServer(grpcServer, bridgeService)

    log.Printf("🚀 LiveKit Bridge gRPC server listening on unix://%s", socketPath)
    log.Printf("Configuration: LiveKitURL=%s", config.LiveKitURL)

    // Serve
    if err := grpcServer.Serve(listener); err != nil {
        log.Fatalf("Failed to serve: %v", err)
    }
}
```

### File: `livekit-bridge/service.go` (NEW)

**New gRPC service implementation:**

```go
package main

import (
    "context"
    "fmt"
    "io"
    "log"
    "sync"
    "time"

    pb "github.com/yourorg/livekit-bridge/proto"
    "google.golang.org/grpc/codes"
    "google.golang.org/grpc/status"
)

type LiveKitBridgeService struct {
    pb.UnimplementedLiveKitBridgeServer

    config  *Config
    clients map[string]*BridgeClient
    mu      sync.RWMutex

    // Metrics
    totalStreams   int64
    activeStreams  int64
    startTime      time.Time
}

func NewLiveKitBridgeService(config *Config) *LiveKitBridgeService {
    return &LiveKitBridgeService{
        config:    config,
        clients:   make(map[string]*BridgeClient),
        startTime: time.Now(),
    }
}

// AudioStream handles bidirectional audio streaming
// Client sends: microphone audio TO LiveKit
// Server sends: remote participant audio FROM LiveKit
func (s *LiveKitBridgeService) AudioStream(stream pb.LiveKitBridge_AudioStreamServer) error {
    // Implementation details below
}

// JoinRoom creates LiveKit room connection for user
func (s *LiveKitBridgeService) JoinRoom(ctx context.Context, req *pb.JoinRoomRequest) (*pb.JoinRoomResponse, error) {
    // Implementation details below
}

// LeaveRoom disconnects user from LiveKit room
func (s *LiveKitBridgeService) LeaveRoom(ctx context.Context, req *pb.LeaveRoomRequest) (*pb.LeaveRoomResponse, error) {
    // Implementation details below
}

// EnableSubscribe starts receiving audio from target identity
func (s *LiveKitBridgeService) EnableSubscribe(ctx context.Context, req *pb.SubscribeRequest) (*pb.SubscribeResponse, error) {
    // Implementation details below
}

// DisableSubscribe stops receiving audio from target identity
func (s *LiveKitBridgeService) DisableSubscribe(ctx context.Context, req *pb.SubscribeRequest) (*pb.SubscribeResponse, error) {
    // Implementation details below
}

// PlayURL streams audio URL into LiveKit room (server-side playback)
func (s *LiveKitBridgeService) PlayURL(req *pb.PlayURLRequest, stream pb.LiveKitBridge_PlayURLServer) error {
    // Implementation details below
}

// StopPlayback stops server-side audio playback
func (s *LiveKitBridgeService) StopPlayback(ctx context.Context, req *pb.StopPlaybackRequest) (*pb.StopPlaybackResponse, error) {
    // Implementation details below
}

// HealthCheck returns service health status
func (s *LiveKitBridgeService) HealthCheck(ctx context.Context, req *pb.HealthCheckRequest) (*pb.HealthCheckResponse, error) {
    s.mu.RLock()
    activeClients := len(s.clients)
    s.mu.RUnlock()

    return &pb.HealthCheckResponse{
        Healthy:       true,
        ActiveClients: int32(activeClients),
        UptimeSeconds: int64(time.Since(s.startTime).Seconds()),
    }, nil
}

// Helper methods

func (s *LiveKitBridgeService) getOrCreateClient(userId string) (*BridgeClient, error) {
    // Thread-safe client retrieval/creation
}

func (s *LiveKitBridgeService) removeClient(userId string) {
    // Thread-safe client removal and cleanup
}
```

### Audio Stream Implementation Details

```go
func (s *LiveKitBridgeService) AudioStream(stream pb.LiveKitBridge_AudioStreamServer) error {
    // 1. Receive first packet to identify user
    firstPacket, err := stream.Recv()
    if err != nil {
        return status.Errorf(codes.InvalidArgument, "failed to receive initial packet: %v", err)
    }

    userId := firstPacket.UserId
    if userId == "" {
        return status.Error(codes.InvalidArgument, "user_id is required")
    }

    log.Printf("[AudioStream] Starting stream for user: %s", userId)

    // 2. Get or create bridge client for this user
    client, err := s.getOrCreateClient(userId)
    if err != nil {
        return status.Errorf(codes.Internal, "failed to create client: %v", err)
    }

    // 3. Setup cleanup on stream end
    defer func() {
        log.Printf("[AudioStream] Stream ended for user: %s", userId)
        // Don't remove client immediately - they might reconnect
        // Let JoinRoom/LeaveRoom manage lifecycle
    }()

    // 4. Create error channel for goroutine coordination
    errChan := make(chan error, 2)
    ctx := stream.Context()

    // 5. Goroutine: Send audio FROM LiveKit TO TypeScript
    go func() {
        for {
            select {
            case <-ctx.Done():
                errChan <- ctx.Err()
                return
            case audioData := <-client.audioFromLiveKit:
                packet := &pb.AudioPacket{
                    UserId:      userId,
                    PcmData:     audioData,
                    TimestampMs: time.Now().UnixMilli(),
                }

                if err := stream.Send(packet); err != nil {
                    log.Printf("[AudioStream] Error sending to TS: %v", err)
                    errChan <- err
                    return
                }
            }
        }
    }()

    // 6. Main loop: Receive audio FROM TypeScript TO LiveKit
    go func() {
        for {
            packet, err := stream.Recv()
            if err == io.EOF {
                errChan <- nil
                return
            }
            if err != nil {
                log.Printf("[AudioStream] Error receiving from TS: %v", err)
                errChan <- err
                return
            }

            // Forward to LiveKit via BridgeClient
            client.handleIncomingAudio(packet.PcmData)
        }
    }()

    // 7. Wait for either goroutine to finish
    return <-errChan
}
```

### File: `livekit-bridge/bridge_client.go`

**Changes to BridgeClient:**

```go
type BridgeClient struct {
    userID      string
    room        *lksdk.Room
    context     context.Context
    cancel      context.CancelFunc
    config      *Config

    // Audio channels (replacing WebSocket)
    audioFromLiveKit chan []byte  // NEW: Send audio TO TypeScript via gRPC
    audioToLiveKit   chan []byte  // NEW: Receive audio FROM TypeScript

    // Publishing
    publishTrack   *lkmedia.PCMLocalTrack
    receivedFrames int

    // Subscribing with pacing
    subscribeEnabled bool
    targetIdentity   string
    pacingBuffer     *PacingBuffer

    // Stats
    stats ClientStats

    // Lifecycle
    mu        sync.Mutex
    connected bool
    closed    chan struct{}

    // Speaker playback
    publisher *Publisher
}

func NewBridgeClient(userID string, config *Config) *BridgeClient {
    ctx, cancel := context.WithCancel(context.Background())

    return &BridgeClient{
        userID:           userID,
        config:           config,
        context:          ctx,
        cancel:           cancel,
        closed:           make(chan struct{}),
        audioFromLiveKit: make(chan []byte, 100), // Buffered channel
        audioToLivekit:   make(chan []byte, 100),
    }
}

// handleIncomingAudio processes audio FROM TypeScript (via gRPC) TO LiveKit
func (c *BridgeClient) handleIncomingAudio(data []byte) {
    // Same logic as current WebSocket handler
    // Convert to int16 samples, apply gain, write to publishTrack
}

// sendAudioToTypeScript queues audio FROM LiveKit TO TypeScript (via gRPC)
func (c *BridgeClient) sendAudioToTypeScript(data []byte) {
    select {
    case c.audioFromLiveKit <- data:
        // Queued successfully
    default:
        // Channel full, drop packet (backpressure)
        log.Printf("[BridgeClient] Audio queue full for user %s, dropping packet", c.userID)
    }
}

// Close cleans up resources
func (c *BridgeClient) Close() {
    c.cancel()

    if c.pacingBuffer != nil {
        c.pacingBuffer.Stop()
    }

    c.mu.Lock()
    if c.publishTrack != nil {
        c.publishTrack.Close()
        c.publishTrack = nil
    }
    if c.room != nil {
        c.room.Disconnect()
        c.room = nil
    }
    c.mu.Unlock()

    // Close channels
    close(c.audioFromLiveKit)
    close(c.audioToLiveKit)
    close(c.closed)
}
```

**Update handleDataPacket to use new channel:**

```go
func (c *BridgeClient) handleDataPacket(packet lksdk.DataPacket, params lksdk.DataReceiveParams) {
    // ... existing VAD and validation logic ...

    // Instead of calling websocket send:
    // c.sendBinaryData(pcmData)  // OLD

    // Queue for gRPC stream:
    c.sendAudioToTypeScript(pcmData)  // NEW
}
```

---

## TypeScript Implementation

### File: `packages/cloud/src/services/session/LiveKitClient.ts`

**Complete rewrite to use gRPC:**

```typescript
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { Logger } from "pino";
import UserSession from "./UserSession";
import path from "path";

// Type definitions matching proto
interface AudioPacket {
  userId: string;
  pcmData: Buffer;
  timestampMs: number;
  isFinal?: boolean;
  streamId?: string;
}

interface JoinRoomRequest {
  userId: string;
  roomName: string;
  token: string;
  url: string;
  targetIdentity?: string;
}

interface JoinRoomResponse {
  success: boolean;
  error?: string;
  roomName?: string;
  participantCount?: number;
  participantId?: string;
}

// ... other interface definitions matching proto

export class LiveKitClient {
  private readonly logger: Logger;
  private readonly userSession: UserSession;
  private readonly userId: string;

  // gRPC client and stream
  private grpcClient: any;
  private audioStream: grpc.ClientDuplexStream<
    AudioPacket,
    AudioPacket
  > | null = null;

  // State
  private connected = false;
  private disposed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Proto definitions
  private static protoDefinition: any = null;

  constructor(userSession: UserSession, opts?: { socketPath?: string }) {
    this.userSession = userSession;
    this.userId = `cloud-agent:${userSession.userId}`;
    this.logger = userSession.logger.child({ service: "LiveKitClientGRPC" });

    // Load proto definition (singleton)
    if (!LiveKitClient.protoDefinition) {
      const PROTO_PATH = path.join(
        __dirname,
        "../../../livekit-bridge/proto/livekit_bridge.proto",
      );
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      LiveKitClient.protoDefinition =
        grpc.loadPackageDefinition(packageDefinition).livekit_bridge;
    }

    // Create gRPC client connected to Unix socket
    const socketPath = opts?.socketPath || "/tmp/livekit-bridge.sock";
    this.grpcClient = new LiveKitClient.protoDefinition.LiveKitBridge(
      `unix://${socketPath}`,
      grpc.credentials.createInsecure(),
      {
        "grpc.keepalive_time_ms": 30000,
        "grpc.keepalive_timeout_ms": 10000,
        "grpc.keepalive_permit_without_calls": 1,
      },
    );

    this.logger.info({ socketPath }, "LiveKitClient initialized with gRPC");
  }

  async connect(params: {
    url: string;
    roomName: string;
    token: string;
    targetIdentity?: string;
  }): Promise<void> {
    if (this.disposed) {
      throw new Error("LiveKitClient is disposed");
    }

    if (this.connected) {
      await this.close();
    }

    this.logger.info(
      { room: params.roomName, target: params.targetIdentity },
      "Connecting to LiveKit via gRPC bridge",
    );

    try {
      // 1. Join room
      const joinResponse = await this.joinRoom(params);
      if (!joinResponse.success) {
        throw new Error(joinResponse.error || "Failed to join room");
      }

      this.logger.info(
        {
          room: joinResponse.roomName,
          participants: joinResponse.participantCount,
        },
        "Joined LiveKit room",
      );

      // 2. Start bidirectional audio stream
      await this.startAudioStream();

      // 3. Enable subscription if target provided
      if (params.targetIdentity) {
        await this.enableSubscribe(params.targetIdentity);
      }

      this.connected = true;
      this.reconnectAttempts = 0;

      this.logger.info("LiveKitClient connected via gRPC");
    } catch (error) {
      this.logger.error(error, "Failed to connect to LiveKit bridge");
      throw error;
    }
  }

  private async joinRoom(params: {
    url: string;
    roomName: string;
    token: string;
    targetIdentity?: string;
  }): Promise<JoinRoomResponse> {
    return new Promise((resolve, reject) => {
      const request: JoinRoomRequest = {
        userId: this.userId,
        roomName: params.roomName,
        token: params.token,
        url: params.url,
        targetIdentity: params.targetIdentity || "",
      };

      this.grpcClient.JoinRoom(
        request,
        (err: any, response: JoinRoomResponse) => {
          if (err) {
            this.logger.error(err, "JoinRoom gRPC error");
            reject(err);
          } else {
            resolve(response);
          }
        },
      );
    });
  }

  private async startAudioStream(): Promise<void> {
    if (this.audioStream) {
      this.audioStream.end();
      this.audioStream = null;
    }

    this.audioStream = this.grpcClient.AudioStream();

    // Send initial packet with userId
    this.audioStream.write({
      userId: this.userId,
      pcmData: Buffer.alloc(0),
      timestampMs: Date.now(),
    });

    // Receive audio FROM Go bridge (LiveKit -> TypeScript)
    this.audioStream.on("data", (packet: AudioPacket) => {
      try {
        if (packet.pcmData && packet.pcmData.length > 0) {
          this.userSession.audioManager.processAudioData(packet.pcmData);
        }
      } catch (error) {
        this.logger.error(error, "Error processing audio from bridge");
      }
    });

    // Handle stream errors
    this.audioStream.on("error", (error: Error) => {
      this.logger.error(error, "Audio stream error");
      this.connected = false;
      this.scheduleReconnect();
    });

    // Handle stream end
    this.audioStream.on("end", () => {
      this.logger.warn("Audio stream ended by server");
      this.connected = false;
      this.audioStream = null;
      this.scheduleReconnect();
    });

    this.logger.debug("Audio stream started");
  }

  // Send audio TO Go bridge (TypeScript -> LiveKit)
  public sendAudio(pcmData: Buffer): void {
    if (!this.audioStream || !this.connected) {
      return;
    }

    try {
      this.audioStream.write({
        userId: this.userId,
        pcmData: pcmData,
        timestampMs: Date.now(),
      });
    } catch (error) {
      this.logger.error(error, "Error sending audio to bridge");
    }
  }

  async enableSubscribe(targetIdentity: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.grpcClient.EnableSubscribe(
        { userId: this.userId, targetIdentity },
        (err: any, response: any) => {
          if (err) {
            this.logger.error(err, "EnableSubscribe error");
            reject(err);
          } else if (!response.success) {
            reject(new Error(response.error || "Failed to enable subscribe"));
          } else {
            this.logger.info({ targetIdentity }, "Enabled subscription");
            resolve();
          }
        },
      );
    });
  }

  async disableSubscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.grpcClient.DisableSubscribe(
        { userId: this.userId, targetIdentity: "" },
        (err: any, response: any) => {
          if (err) {
            this.logger.error(err, "DisableSubscribe error");
            reject(err);
          } else if (!response.success) {
            reject(new Error(response.error || "Failed to disable subscribe"));
          } else {
            this.logger.info("Disabled subscription");
            resolve();
          }
        },
      );
    });
  }

  async playUrl(params: {
    requestId: string;
    url: string;
    volume?: number;
    stopOther?: boolean;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = this.grpcClient.PlayURL({
        userId: this.userId,
        requestId: params.requestId,
        url: params.url,
        volume: params.volume || 1.0,
        stopOther: params.stopOther || false,
      });

      stream.on("data", (event: any) => {
        // Handle PlayURLEvent (play_started, play_complete, play_error)
        this.handlePlayEvent(event);

        if (event.type === "PLAY_COMPLETE" || event.type === "PLAY_ERROR") {
          resolve();
        }
      });

      stream.on("error", (err: any) => {
        this.logger.error(err, "PlayURL stream error");
        reject(err);
      });
    });
  }

  private handlePlayEvent(event: any): void {
    // Forward to event handler (existing logic)
    if (this.eventHandler) {
      this.eventHandler({
        type: event.type.toLowerCase(),
        requestId: event.requestId,
        success: event.success,
        duration: event.durationMs,
        error: event.error,
      });
    }
  }

  async stopPlayback(requestId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.grpcClient.StopPlayback(
        { userId: this.userId, requestId: requestId || "" },
        (err: any, response: any) => {
          if (err) {
            this.logger.error(err, "StopPlayback error");
            reject(err);
          } else if (!response.success) {
            reject(new Error(response.error || "Failed to stop playback"));
          } else {
            resolve();
          }
        },
      );
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectTimer) return;

    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts++));
    this.logger.info({ delayMs: delay }, "Scheduling reconnect");

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      // Attempt reconnection logic here
      // Would need to store lastParams like in old implementation
    }, delay);
  }

  isConnected(): boolean {
    return this.connected && this.audioStream !== null;
  }

  async close(): Promise<void> {
    this.logger.info("Closing LiveKitClient");

    try {
      // Disable subscription first
      if (this.connected) {
        await this.disableSubscribe().catch((err) => {
          this.logger.warn(err, "Error disabling subscribe during close");
        });
      }

      // End audio stream
      if (this.audioStream) {
        this.audioStream.end();
        this.audioStream = null;
      }

      // Leave room
      if (this.connected) {
        await new Promise((resolve) => {
          this.grpcClient.LeaveRoom({ userId: this.userId }, (err: any) => {
            if (err) {
              this.logger.warn(err, "Error leaving room during close");
            }
            resolve(undefined);
          });
        });
      }
    } catch (error) {
      this.logger.error(error, "Error during close");
    } finally {
      this.connected = false;

      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    void this.close();

    // Close gRPC client
    if (this.grpcClient) {
      this.grpcClient.close();
    }
  }

  // Event handler support (for PlayURL events)
  private eventHandler: ((evt: unknown) => void) | null = null;

  public onEvent(handler: (evt: unknown) => void): void {
    this.eventHandler = handler;
  }
}

export default LiveKitClient;
```

### File: `packages/cloud/src/services/session/LiveKitManager.ts`

**Minimal changes needed:**

```typescript
// Only change: LiveKitClient now uses gRPC internally
// All public APIs remain the same

private async startBridgeSubscriber(info: {
  url: string;
  roomName: string;
}): Promise<void> {
  if (this.bridgeClient && this.bridgeClient.isConnected()) {
    this.logger.debug("Bridge subscriber already connected");
    return;
  }

  const targetIdentity = this.session.userId;

  // LiveKitClient now uses gRPC internally (no visible changes here)
  this.bridgeClient = new LiveKitClientTS(this.session);

  const bridgeToken = await this.mintAgentBridgeToken();
  if (!bridgeToken) {
    this.logger.warn("Failed to mint bridge token for bridge");
    return;
  }

  await this.bridgeClient.connect({
    url: info.url,
    roomName: info.roomName,
    token: bridgeToken,
    targetIdentity,
  });

  this.logger.info(
    { feature: "livekit", room: info.roomName },
    "Bridge subscriber connected via gRPC"
  );

  // ... rest of method unchanged
}
```

### File: `packages/cloud/src/services/session/AudioManager.ts`

**Changes for sending audio TO Go bridge:**

```typescript
export class AudioManager {
  // ... existing code ...

  processAudioData(audioData: ArrayBuffer | Buffer): void {
    const buffer = Buffer.isBuffer(audioData)
      ? audioData
      : Buffer.from(audioData);

    // Forward to LiveKit bridge if connected
    if (this.userSession.liveKitManager) {
      const bridgeClient = this.userSession.liveKitManager.getBridgeClient();
      if (bridgeClient && bridgeClient.isConnected()) {
        // NEW: Send via gRPC instead of WebSocket
        bridgeClient.sendAudio(buffer);
      }
    }

    // ... rest of existing audio processing logic (VAD, transcription, etc.)
  }
}
```

---

## Deployment Changes

### File: `start.sh`

**No changes needed** - both processes start the same way:

```bash
#!/bin/bash
echo "🚀 Starting Go LiveKit bridge on Unix socket..."
./livekit-bridge &
GO_PID=$!

echo "☁️ Starting Bun cloud service on :80..."
cd packages/cloud && PORT=80 bun run start &
BUN_PID=$!

wait -n
echo "❌ Service died, shutting down..."
kill $GO_PID $BUN_PID 2>/dev/null || true
exit 1
```

### File: `Dockerfile`

**Add protobuf compilation:**

```dockerfile
# Go build stage
FROM golang:1.21 AS go-builder
WORKDIR /app

# Install protoc and Go plugins
RUN apt-get update && apt-get install -y protobuf-compiler
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Copy proto files and generate
COPY livekit-bridge/proto ./livekit-bridge/proto
RUN protoc --go_out=. --go-grpc_out=. livekit-bridge/proto/*.proto

# Copy Go source and build
COPY livekit-bridge ./livekit-bridge
RUN cd livekit-bridge && go build -o livekit-bridge

# TypeScript build stage
FROM oven/bun:1 AS ts-builder
WORKDIR /app

# Copy proto files for TypeScript (uses dynamic loading)
COPY livekit-bridge/proto ./livekit-bridge/proto

# ... rest of TypeScript build

# Runtime stage
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries
COPY --from=go-builder /app/livekit-bridge/livekit-bridge ./
COPY --from=ts-builder /app ./

# Copy proto files for runtime
COPY livekit-bridge/proto ./livekit-bridge/proto

# Expose HTTP port (not gRPC - uses Unix socket)
EXPOSE 80

CMD ["./start.sh"]
```

### File: `livekit-bridge/go.mod`

**Add gRPC dependencies:**

```go
module github.com/yourorg/livekit-bridge

go 1.21

require (
    github.com/gorilla/websocket v1.5.0  // Can remove after migration
    github.com/livekit/server-sdk-go/v2 v2.0.0
    github.com/livekit/mediatransportutil v0.0.0
    github.com/hajimehoshi/go-mp3 v0.3.4
    google.golang.org/grpc v1.60.0        // NEW
    google.golang.org/protobuf v1.32.0    // NEW
)
```

### File: `packages/cloud/package.json`

**Add gRPC dependencies:**

```json
{
  "dependencies": {
    "@grpc/grpc-js": "^1.9.14",
    "@grpc/proto-loader": "^0.7.10",
    "ws": "^8.14.2" // Can eventually remove
    // ... other dependencies
  }
}
```

---

## Migration Strategy

### Phase 1: Parallel Deployment (Week 1)

1. Deploy gRPC server alongside WebSocket server
2. Add feature flag: `LIVEKIT_USE_GRPC=false` (default)
3. Test gRPC in development environment
4. Monitor metrics: connection count, memory usage, latency

### Phase 2: Gradual Rollout (Week 2)

1. Enable gRPC for 10% of users via feature flag
2. Monitor error rates, connection stability
3. Compare memory usage between gRPC and WebSocket users
4. Increase to 50% if metrics are positive

### Phase 3: Full Migration (Week 3)

1. Enable gRPC for 100% of users
2. Monitor for 48 hours
3. Remove WebSocket code if stable
4. Remove `/ws` endpoint from Go server
5. Remove WebSocket dependencies from package.json

### Rollback Plan

If issues arise:

1. Set `LIVEKIT_USE_GRPC=false` in environment
2. Redeploy with WebSocket code intact
3. Investigate gRPC issues offline
4. Fix and retry gradual rollout

---

## Testing Strategy

### Unit Tests

**Go tests:**

```bash
livekit-bridge/service_test.go
livekit-bridge/audio_stream_test.go
livekit-bridge/client_lifecycle_test.go
```

**TypeScript tests:**

```bash
packages/cloud/src/services/session/__tests__/LiveKitClient.grpc.test.ts
packages/cloud/src/services/session/__tests__/LiveKitManager.grpc.test.ts
```

### Integration Tests

**Test scenarios:**

1. Single user audio round-trip (mic -> LiveKit -> speaker)
2. Multiple concurrent users (10+ simultaneous sessions)
3. User reconnection (simulate network drop)
4. Audio stream interruption and recovery
5. Server-side playback (PlayURL)
6. Graceful shutdown (SIGTERM handling)

### Performance Tests

**Metrics to measure:**

1. Memory usage per connection (should be <10MB vs 50MB+ with WebSocket leak)
2. Audio latency (should be <100ms round-trip)
3. CPU usage under load (10+ concurrent users)
4. File descriptor count (should stay stable, not grow)
5. Connection establishment time

### Load Tests

Use `ghz` (gRPC load testing tool):

```bash
ghz --insecure \
    --proto ./proto/livekit_bridge.proto \
    --call livekit_bridge.LiveKitBridge/HealthCheck \
    -n 1000 \
    -c 50 \
    unix:///tmp/livekit-bridge.sock
```

---

## Monitoring & Observability

### Metrics to Track

**Go side (Prometheus metrics):**

```go
// In service.go
var (
    activeStreams = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "livekit_bridge_active_streams",
        Help: "Number of active audio streams",
    })

    totalStreams = promauto.NewCounter(prometheus.CounterOpts{
        Name: "livekit_bridge_total_streams",
        Help: "Total number of audio streams created",
    })

    streamDuration = promauto.NewHistogram(prometheus.HistogramOpts{
        Name: "livekit_bridge_stream_duration_seconds",
        Help: "Duration of audio streams",
    })

    audioPacketsSent = promauto.NewCounter(prometheus.CounterOpts{
        Name: "livekit_bridge_audio_packets_sent",
        Help: "Total audio packets sent to TypeScript",
    })

    audioPacketsReceived = promauto.NewCounter(prometheus.CounterOpts{
        Name: "livekit_bridge_audio_packets_received",
        Help: "Total audio packets received from TypeScript",
    })
)
```

**TypeScript side (Pino logs):**

```typescript
// Log at INFO level:
- Connection established
- Connection closed
- Audio stream started/stopped
- Errors and reconnections

// Log at DEBUG level:
- Individual audio packets (sample every 100th)
- gRPC call durations
- Stream state changes
```

### Alerts

**Critical alerts:**

1. No active streams for >5 minutes (service down)
2. Stream error rate >5% (connection issues)
3. Memory usage >2GB (potential leak still exists)
4. File descriptor count >1000 (connection leak)

**Warning alerts:**

1. Stream reconnection rate >10% (network issues)
2. Audio latency >200ms (performance degradation)
3. CPU usage >80% (need scaling)

---

## Success Criteria

### Primary Goals (Must Achieve)

1. ✅ **Zero connection leaks** - File descriptor count stays stable over 24 hours
2. ✅ **Memory usage reduced** - Peak memory <1GB (down from 1.5GB with leaks)
3. ✅ **No user-facing disruption** - Audio quality and latency unchanged
4. ✅ **Connection stability improved** - Reconnection success rate >95%

### Secondary Goals (Nice to Have)

1. ✅ **Performance improvement** - Audio latency reduced by 10-20%
2. ✅ **Code simplification** - Remove 200+ lines of WebSocket management code
3. ✅ **Type safety** - Zero runtime type errors from protocol mismatches
4. ✅ **Observability** - Rich metrics for debugging connection issues

---

## Risk Assessment

### High Risk

**Risk:** gRPC library compatibility issues with Bun runtime  
**Mitigation:** Test thoroughly in development; have WebSocket rollback ready  
**Probability:** Low (gRPC is mature and well-tested)

**Risk:** Unix socket permissions issues in production  
**Mitigation:** Set socket permissions to 0600; test in staging environment  
**Probability:** Medium (container filesystem can be finicky)

### Medium Risk

**Risk:** Performance regression under high load  
**Mitigation:** Load test with 50+ concurrent users before production  
**Probability:** Low (gRPC should be faster than WebSocket)

**Risk:** Protocol buffer schema evolution issues  
**Mitigation:** Use backwards-compatible protobuf practices; version the API  
**Probability:** Low (not changing schema frequently)

### Low Risk

**Risk:** Developer unfamiliarity with gRPC  
**Mitigation:** Provide documentation and examples; gRPC is industry standard  
**Probability:** Low (gRPC is well-documented)

---

## Future Enhancements

### Short-term (Next 3 Months)

1. **Add authentication to gRPC** - Use gRPC interceptors for auth validation
2. **Implement health check endpoint** - HTTP endpoint for Kubernetes liveness probes
3. **Add distributed tracing** - OpenTelemetry instrumentation for debugging
4. **Optimize audio buffering** - Tune channel buffer sizes for latency vs throughput

### Long-term (6+ Months)

1. **Shared memory for audio** - Zero-copy audio streaming for even better performance
2. **Multiple LiveKit rooms per user** - Support advanced use cases
3. **gRPC load balancing** - Horizontal scaling with multiple Go bridge instances
4. **Codec negotiation** - Support Opus encoding for bandwidth optimization

---

## References

### Documentation

- **gRPC Go Tutorial**: https://grpc.io/docs/languages/go/quickstart/
- **gRPC Node.js Tutorial**: https://grpc.io/docs/languages/node/quickstart/
- **Protocol Buffers Guide**: https://protobuf.dev/getting-started/
- **Unix Domain Sockets**: https://man7.org/linux/man-pages/man7/unix.7.html

### Related Files

- `livekit-bridge/bridge_client.go` - Current WebSocket client implementation
- `livekit-bridge/bridge_service.go` - Current WebSocket service with leak
- `packages/cloud/src/services/session/LiveKitClient.ts` - Current WS client
- `packages/cloud/src/services/session/LiveKitManager.ts` - Session management
- `packages/cloud/src/services/session/AudioManager.ts` - Audio processing

### Proto Resources

- **gRPC Best Practices**: https://grpc.io/docs/guides/performance/
- **Proto Style Guide**: https://protobuf.dev/programming-guides/style/
- **Backwards Compatibility**: https://protobuf.dev/programming-guides/dos-donts/

---

## Appendix: Implementation Checklist

### Go Implementation

- [ ] Create `proto/livekit_bridge.proto` with service definition
- [ ] Generate Go code: `protoc --go_out=. --go-grpc_out=.`
- [ ] Create `service.go` with `LiveKitBridgeService` struct
- [ ] Implement `AudioStream()` bidirectional streaming
- [ ] Implement `JoinRoom()`, `LeaveRoom()` RPCs
- [ ] Implement `EnableSubscribe()`, `DisableSubscribe()` RPCs
- [ ] Implement `PlayURL()`, `StopPlayback()` RPCs
- [ ] Implement `HealthCheck()` RPC
- [ ] Update `main.go` to use Unix socket listener
- [ ] Update `BridgeClient` to use channels instead of WebSocket
- [ ] Remove WebSocket-specific code from `bridge_client.go`
- [ ] Add Prometheus metrics
- [ ] Add unit tests
- [ ] Add integration tests

### TypeScript Implementation

- [ ] Install dependencies: `@grpc/grpc-js`, `@grpc/proto-loader`
- [ ] Copy proto file to TypeScript project
- [ ] Rewrite `LiveKitClient.ts` to use gRPC
- [ ] Implement `connect()`, `close()`, `dispose()` methods
- [ ] Implement `sendAudio()` for outgoing audio
- [ ] Handle incoming audio in stream `data` event
- [ ] Implement `enableSubscribe()`, `disableSubscribe()`
- [ ] Implement `playUrl()`, `stopPlayback()`
- [ ] Update `AudioManager.ts` to call `sendAudio()`
- [ ] Add reconnection logic
- [ ] Add error handling
- [ ] Add unit tests
- [ ] Add integration tests

### Deployment

- [ ] Update `Dockerfile` with protobuf compilation
- [ ] Update `go.mod` with gRPC dependencies
- [ ] Update `package.json` with gRPC dependencies
- [ ] Add feature flag `LIVEKIT_USE_GRPC`
- [ ] Test in local development
- [ ] Test in staging environment
- [ ] Deploy to production with gradual rollout
- [ ] Monitor metrics for 48 hours
- [ ] Remove old WebSocket code
- [ ] Update documentation

### Testing & Validation

- [ ] Verify zero connection leaks (monitor file descriptors)
- [ ] Measure memory usage reduction
- [ ] Test audio round-trip latency
- [ ] Test with 10+ concurrent users
- [ ] Test reconnection scenarios
- [ ] Test graceful shutdown
- [ ] Load test with `ghz` tool
- [ ] Validate metrics collection

---

**END OF DESIGN DOCUMENT**
