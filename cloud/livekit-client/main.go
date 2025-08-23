package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	lksdk "github.com/livekit/server-sdk-go/v2"
	lkmedia "github.com/livekit/server-sdk-go/v2/pkg/media"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

type LiveKitService struct {
	clients map[string]*LiveKitClient
	mu      sync.RWMutex
}

type LiveKitClient struct {
	userId       string
	ws           *websocket.Conn
	room         *lksdk.Room
	publishTrack *lkmedia.PCMLocalTrack
	ctx          context.Context
	cancel       context.CancelFunc
	mu           sync.Mutex
	connected    bool
}

// Message types
type Command struct {
	Action   string          `json:"action"`
	RoomName string          `json:"roomName,omitempty"`
	Token    string          `json:"token,omitempty"`
	Config   json.RawMessage `json:"config,omitempty"`
}

type Event struct {
	Type             string `json:"type"`
	RoomName         string `json:"roomName,omitempty"`
	ParticipantID    string `json:"participantId,omitempty"`
	ParticipantCount int    `json:"participantCount,omitempty"`
	Error            string `json:"error,omitempty"`
	State            string `json:"state,omitempty"`
}

func NewLiveKitService() *LiveKitService {
	return &LiveKitService{
		clients: make(map[string]*LiveKitClient),
	}
}

func (s *LiveKitService) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	userId := r.URL.Query().Get("userId")
	if userId == "" {
		http.Error(w, "userId required", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection for user %s: %v", userId, err)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	client := &LiveKitClient{
		userId: userId,
		ws:     ws,
		ctx:    ctx,
		cancel: cancel,
	}

	s.mu.Lock()
	// Clean up existing client if present
	if existing, ok := s.clients[userId]; ok {
		existing.Close()
	}
	s.clients[userId] = client
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, userId)
		s.mu.Unlock()
		client.Close()
	}()

	log.Printf("WebSocket connected for user: %s", userId)
	client.Start()
}

func (c *LiveKitClient) Start() {
	// Send connection established event
	c.sendEvent(Event{
		Type:  "connected",
		State: "ready",
	})

	// Start ping/pong for connection health
	go c.pingLoop()

	// Handle incoming messages
	for {
		messageType, message, err := c.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error for user %s: %v", c.userId, err)
			}
			break
		}

		if messageType == websocket.BinaryMessage {
			// Handle binary audio data
			c.handleAudioData(message)
		} else if messageType == websocket.TextMessage {
			// Handle JSON control messages
			var cmd Command
			if err := json.Unmarshal(message, &cmd); err != nil {
				log.Printf("Failed to parse command from user %s: %v", c.userId, err)
				c.sendError("Invalid command format")
				continue
			}
			c.handleCommand(cmd)
		}
	}
}

func (c *LiveKitClient) handleCommand(cmd Command) {
	switch cmd.Action {
	case "join_room":
		c.joinRoom(cmd.RoomName, cmd.Token)
	case "leave_room":
		c.leaveRoom()
	case "publish_audio":
		// Handle publish control if needed
	default:
		c.sendError(fmt.Sprintf("Unknown action: %s", cmd.Action))
	}
}

func (c *LiveKitClient) joinRoom(roomName, token string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.room != nil {
		c.sendError("Already in a room")
		return
	}

	log.Printf("User %s joining room %s", c.userId, roomName)

	// Create room callback handlers
	roomCallback := &lksdk.RoomCallback{
		OnDisconnected: func() {
			log.Printf("Disconnected from room")
			c.sendEvent(Event{
				Type:  "disconnected",
				State: "disconnected",
			})
		},
	}

	// Connect to room with v2 API
	room, err := lksdk.ConnectToRoomWithToken(getLiveKitURL(), token, roomCallback)
	if err != nil {
		log.Printf("Failed to connect to room: %v", err)
		c.sendError(fmt.Sprintf("Failed to connect: %v", err))
		return
	}

	c.room = room
	c.connected = true

	// Create audio track for publishing
	c.createAudioTrack()

	// Send success event
	c.sendEvent(Event{
		Type:             "room_joined",
		RoomName:         roomName,
		ParticipantID:    string(room.LocalParticipant.Identity()),
		ParticipantCount: len(room.GetRemoteParticipants()),
	})
}

func (c *LiveKitClient) createAudioTrack() {
	// Create PCM track with 16kHz sample rate (SDK handles resampling to 48kHz internally)
	track, err := lkmedia.NewPCMLocalTrack(
		16000, // 16kHz sample rate (SDK will resample to 48kHz)
		1,     // Mono
		nil,   // Use default logger
	)
	if err != nil {
		log.Printf("Failed to create PCM track: %v", err)
		return
	}

	c.publishTrack = track

	// Publish the track
	if _, err := c.room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{
		Name: "microphone",
	}); err != nil {
		log.Printf("Failed to publish track: %v", err)
		return
	}

	log.Printf("PCM audio track published for user %s (16kHz mono, auto-resampled to 48kHz)", c.userId)
}

func (c *LiveKitClient) handleAudioData(data []byte) {
	if c.publishTrack == nil || !c.connected {
		return
	}

	// Convert byte slice to int16 samples
	// Data is expected to be 16-bit PCM at 16kHz mono
	samples := make([]int16, len(data)/2)
	for i := 0; i < len(samples); i++ {
		samples[i] = int16(binary.LittleEndian.Uint16(data[i*2 : i*2+2]))
	}
	
	// Write PCM samples - SDK handles resampling and Opus encoding
	if err := c.publishTrack.WriteSample(samples); err != nil {
		log.Printf("Failed to write PCM sample: %v", err)
	}
}

func (c *LiveKitClient) handleIncomingAudio(pcmData []byte) {
	// Audio from LiveKit is already PCM at 48kHz
	// Resample from 48kHz to 16kHz for our system
	pcm16khz := Resample48to16(pcmData)
	
	// Send as binary WebSocket message
	c.mu.Lock()
	if c.ws != nil {
		c.ws.WriteMessage(websocket.BinaryMessage, pcm16khz)
	}
	c.mu.Unlock()
}

func (c *LiveKitClient) leaveRoom() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.room == nil {
		c.sendError("Not in a room")
		return
	}

	// Close PCM track if it exists
	if c.publishTrack != nil {
		c.publishTrack.Close()
		c.publishTrack = nil
	}

	c.room.Disconnect()
	c.room = nil
	c.connected = false

	c.sendEvent(Event{
		Type: "room_left",
	})
}

func (c *LiveKitClient) sendEvent(event Event) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.ws == nil {
		return
	}

	if err := c.ws.WriteJSON(event); err != nil {
		log.Printf("Failed to send event to user %s: %v", c.userId, err)
	}
}

func (c *LiveKitClient) sendError(message string) {
	c.sendEvent(Event{
		Type:  "error",
		Error: message,
	})
}

func (c *LiveKitClient) pingLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.mu.Lock()
			if c.ws != nil {
				c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
					c.mu.Unlock()
					return
				}
			}
			c.mu.Unlock()
		case <-c.ctx.Done():
			return
		}
	}
}

func (c *LiveKitClient) Close() {
	c.cancel()
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.room != nil {
		c.room.Disconnect()
	}
	if c.ws != nil {
		c.ws.Close()
	}
}

func getLiveKitURL() string {
	url := os.Getenv("LIVEKIT_URL")
	if url == "" {
		// Default to a generic URL - should be configured via environment
		url = "wss://livekit.example.com"
	}
	return url
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	service := NewLiveKitService()

	// WebSocket endpoint
	http.HandleFunc("/ws", service.HandleWebSocket)

	// Health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":      "healthy",
			"connections": len(service.clients),
		})
	})

	log.Printf("LiveKit bridge starting on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}