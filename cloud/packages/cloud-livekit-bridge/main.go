package main

import (
	"log"
	"net"

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

	// Listen on port
	lis, err := net.Listen("tcp", ":"+config.Port)
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", config.Port, err)
	}

	log.Printf("✅ LiveKit gRPC Bridge listening on port %s", config.Port)
	log.Println("Ready to accept connections...")

	// Start serving
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
