package main

import (
	"log"
	"net"
	"os"
	"path/filepath"

	pb "github.com/Mentra-Community/MentraOS/cloud/packages/cloud-livekit-bridge/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

func main() {
	log.Println("Starting LiveKit gRPC Bridge...")

	// Load configuration
	config := loadConfig()
	log.Printf("Configuration loaded: Port=%s, LiveKitURL=%s", config.Port, config.LiveKitURL)

	// Create gRPC server
	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(1024*1024*10), // 10MB max message size
		grpc.MaxSendMsgSize(1024*1024*10),
	)

	// Register LiveKit bridge service
	bridgeService := NewLiveKitBridgeService(config)
	pb.RegisterLiveKitBridgeServer(grpcServer, bridgeService)

	// Register health check service
	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("mentra.livekit.bridge.LiveKitBridge", grpc_health_v1.HealthCheckResponse_SERVING)

	// Register reflection service (for debugging with grpcurl)
	reflection.Register(grpcServer)

	// Determine if we should use Unix socket or TCP
	var lis net.Listener
	var err error

	socketPath := os.Getenv("LIVEKIT_GRPC_SOCKET")
	if socketPath != "" {
		// Use Unix domain socket
		// Remove existing socket file if it exists
		if err := os.RemoveAll(socketPath); err != nil {
			log.Fatalf("Failed to remove existing socket: %v", err)
		}

		// Ensure directory exists
		socketDir := filepath.Dir(socketPath)
		if err := os.MkdirAll(socketDir, 0755); err != nil {
			log.Fatalf("Failed to create socket directory: %v", err)
		}

		lis, err = net.Listen("unix", socketPath)
		if err != nil {
			log.Fatalf("Failed to listen on Unix socket %s: %v", socketPath, err)
		}

		// Set socket permissions to allow access
		if err := os.Chmod(socketPath, 0666); err != nil {
			log.Fatalf("Failed to set socket permissions: %v", err)
		}

		log.Printf("✅ LiveKit gRPC Bridge listening on Unix socket: %s", socketPath)
	} else {
		// Use TCP port (backward compatibility)
		lis, err = net.Listen("tcp", ":"+config.Port)
		if err != nil {
			log.Fatalf("Failed to listen on port %s: %v", config.Port, err)
		}
		log.Printf("✅ LiveKit gRPC Bridge listening on TCP port: %s", config.Port)
	}

	log.Println("Ready to accept connections...")

	// Start serving
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
