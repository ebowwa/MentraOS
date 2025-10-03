package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// BridgeService manages all bridge clients
type BridgeService struct {
	clients map[string]*BridgeClient
	mu      sync.RWMutex
	config  *Config
}

func NewBridgeService(config *Config) *BridgeService {
	return &BridgeService{
		clients: make(map[string]*BridgeClient),
		config:  config,
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *BridgeService) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket for user %s: %v", userID, err)
		return
	}

	// Disable Nagle's algorithm for lower latency
	if tcpConn := conn.UnderlyingConn().(*net.TCPConn); tcpConn != nil {
		tcpConn.SetNoDelay(true)
	}

	ctx, cancel := context.WithCancel(context.Background())
	client := &BridgeClient{
		userID:    userID,
		websocket: conn,
		context:   ctx,
		cancel:    cancel,
		config:    s.config,
		closed:    make(chan struct{}),
	}

	// Initialize pacing buffer for smooth audio delivery
	// 100ms interval to match expected audio chunk rate
	client.pacingBuffer = NewPacingBuffer(100*time.Millisecond, 10, func(data []byte) {
		client.sendBinaryData(data)
	})
	client.pacingBuffer.Start()

	// Register client (clean up any existing)
	s.mu.Lock()
	if existing, ok := s.clients[userID]; ok {
		existing.Close()
		s.mu.Unlock()
		// Wait for cleanup
		select {
		case <-existing.closed:
		case <-time.After(2 * time.Second):
		}
		s.mu.Lock()
	}
	s.clients[userID] = client
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, userID)
		s.mu.Unlock()
		client.Close()
	}()

	log.Printf("WebSocket connected: user=%s", userID)
	client.Run()
}
