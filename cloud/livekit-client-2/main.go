package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	lkpacer "github.com/livekit/mediatransportutil/pkg/pacer"
	lksdk "github.com/livekit/server-sdk-go/v2"
	lkmedia "github.com/livekit/server-sdk-go/v2/pkg/media"
)

// Configuration from environment
type Config struct {
	Port        string
	LiveKitURL  string
	PublishGain float64
}

func loadConfig() *Config {
	config := &Config{
		Port:        getEnv("PORT", "8080"),
		LiveKitURL:  getEnv("LIVEKIT_URL", "wss://livekit.example.com"),
		PublishGain: 1.0,
	}

	if gainStr := os.Getenv("PUBLISH_GAIN"); gainStr != "" {
		if gain, err := strconv.ParseFloat(gainStr, 64); err == nil && gain > 0 {
			config.PublishGain = gain
		}
	}

	return config
}

// Command represents incoming control messages
type Command struct {
	Action         string          `json:"action"`
	RoomName       string          `json:"roomName,omitempty"`
	Token          string          `json:"token,omitempty"`
	Config         json.RawMessage `json:"config,omitempty"`
	FreqHz         int             `json:"freq,omitempty"`
	DurationMs     int             `json:"ms,omitempty"`
	Url            string          `json:"url,omitempty"`
	TargetIdentity string          `json:"targetIdentity,omitempty"`
}

// Event represents outgoing status messages
type Event struct {
	Type             string `json:"type"`
	RoomName         string `json:"roomName,omitempty"`
	ParticipantID    string `json:"participantId,omitempty"`
	ParticipantCount int    `json:"participantCount,omitempty"`
	Error            string `json:"error,omitempty"`
	State            string `json:"state,omitempty"`
}

// PacingBuffer smooths out bursty packet delivery
type PacingBuffer struct {
	queue    [][]byte
	mu       sync.Mutex
	ticker   *time.Ticker
	quit     chan struct{}
	sendFunc func([]byte)
	interval time.Duration
	maxSize  int
}

func NewPacingBuffer(interval time.Duration, maxSize int, sendFunc func([]byte)) *PacingBuffer {
	return &PacingBuffer{
		queue:    make([][]byte, 0),
		interval: interval,
		maxSize:  maxSize,
		sendFunc: sendFunc,
		quit:     make(chan struct{}),
	}
}

func (pb *PacingBuffer) Start() {
	pb.ticker = time.NewTicker(pb.interval)
	go func() {
		for {
			select {
			case <-pb.ticker.C:
				pb.sendNext()
			case <-pb.quit:
				pb.ticker.Stop()
				return
			}
		}
	}()
}

func (pb *PacingBuffer) Stop() {
	close(pb.quit)
}

func (pb *PacingBuffer) Add(data []byte) {
	pb.mu.Lock()
	defer pb.mu.Unlock()

	// Make a copy to avoid data races
	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)

	// If queue is full, drop oldest
	if len(pb.queue) >= pb.maxSize {
		pb.queue = pb.queue[1:]
	}
	pb.queue = append(pb.queue, dataCopy)
}

func (pb *PacingBuffer) sendNext() {
	pb.mu.Lock()
	defer pb.mu.Unlock()

	if len(pb.queue) > 0 {
		data := pb.queue[0]
		pb.queue = pb.queue[1:]
		// Send outside of lock to avoid blocking
		go pb.sendFunc(data)
	}
}

// BridgeClient manages a single WebSocket connection and its LiveKit room
type BridgeClient struct {
	userID      string
	websocket   *websocket.Conn
	websocketMu sync.Mutex // Mutex for WebSocket writes
	room        *lksdk.Room
	context     context.Context
	cancel      context.CancelFunc
	config      *Config

	// Audio publishing
	publishTrack   *lkmedia.PCMLocalTrack
	receivedFrames int

	// Audio subscribing with pacing
	subscribeEnabled bool
	targetIdentity   string
	pacingBuffer     *PacingBuffer

	// Statistics
	stats ClientStats

	// Lifecycle
	mu        sync.Mutex
	connected bool
	closed    chan struct{}
}

type ClientStats struct {
	mu               sync.Mutex
	audioFramesIn    int
	dataPktsReceived int
	wsSendCount      int
	wsSendBytes      int64
	lastPacketTime   time.Time
}

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
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
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

func (c *BridgeClient) Run() {
	// Send initial connection event
	c.sendEvent(Event{Type: "connected", State: "ready"})

	// Start background tasks
	go c.pingLoop()

	// Main message loop
	for {
		msgType, message, err := c.websocket.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error for user %s: %v", c.userID, err)
			}
			break
		}

		switch msgType {
		case websocket.BinaryMessage:
			c.handleIncomingAudio(message)
		case websocket.TextMessage:
			var cmd Command
			if err := json.Unmarshal(message, &cmd); err != nil {
				log.Printf("Failed to parse command from user %s: %v", c.userID, err)
				c.sendError("Invalid command format")
				continue
			}
			c.handleCommand(cmd)
		}
	}
}

func (c *BridgeClient) handleCommand(cmd Command) {
	switch cmd.Action {
	case "join_room":
		c.joinRoom(cmd.RoomName, cmd.Token, cmd.Url)
	case "leave_room":
		c.leaveRoom()
	case "publish_tone":
		freq := cmd.FreqHz
		if freq == 0 {
			freq = 440
		}
		duration := cmd.DurationMs
		if duration == 0 {
			duration = 3000
		}
		go c.publishTone(freq, duration)
	case "subscribe_enable":
		c.enableSubscribe(cmd.TargetIdentity)
	case "subscribe_disable":
		c.disableSubscribe()
	default:
		c.sendError(fmt.Sprintf("Unknown action: %s", cmd.Action))
	}
}

func (c *BridgeClient) joinRoom(roomName, token, customURL string) {
	c.mu.Lock()
	if c.room != nil {
		c.mu.Unlock()
		c.sendError("Already in a room")
		return
	}
	c.mu.Unlock()

	url := customURL
	if url == "" {
		url = c.config.LiveKitURL
	}

	log.Printf("User %s joining room %s", c.userID, roomName)

	// Configure room callbacks
	roomCallback := &lksdk.RoomCallback{
		OnDisconnected: func() {
			log.Printf("Disconnected from room")
			c.sendEvent(Event{Type: "disconnected", State: "disconnected"})
		},
		ParticipantCallback: lksdk.ParticipantCallback{
			OnDataPacket: func(packet lksdk.DataPacket, params lksdk.DataReceiveParams) {
				c.handleDataPacket(packet, params)
			},
		},
	}

	// Configure pacer for smooth audio
	pacerFactory := lkpacer.NewPacerFactory(
		lkpacer.LeakyBucketPacer,
		lkpacer.WithBitrate(512_000),
		lkpacer.WithMaxLatency(100*time.Millisecond),
	)

	// Connect to room (removed unused context timeout)
	room, err := lksdk.ConnectToRoomWithToken(
		url, token, roomCallback,
		lksdk.WithPacer(pacerFactory),
		lksdk.WithAutoSubscribe(false),
	)
	if err != nil {
		log.Printf("Failed to connect to room: %v", err)
		c.sendError(fmt.Sprintf("Failed to connect: %v", err))
		return
	}

	c.mu.Lock()
	c.room = room
	c.connected = true
	c.mu.Unlock()

	c.sendEvent(Event{
		Type:             "room_joined",
		RoomName:         roomName,
		ParticipantID:    string(room.LocalParticipant.Identity()),
		ParticipantCount: len(room.GetRemoteParticipants()),
	})
}

func (c *BridgeClient) leaveRoom() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.room == nil {
		c.sendError("Not in a room")
		return
	}

	if c.publishTrack != nil {
		c.publishTrack.Close()
		c.publishTrack = nil
	}

	c.room.Disconnect()
	c.room = nil
	c.connected = false

	c.sendEvent(Event{Type: "room_left"})
}

func (c *BridgeClient) handleIncomingAudio(data []byte) {
	if err := c.ensurePublishTrack(); err != nil {
		log.Printf("Cannot send audio: %v", err)
		return
	}

	c.stats.mu.Lock()
	c.stats.audioFramesIn++
	frameCount := c.stats.audioFramesIn
	c.stats.mu.Unlock()

	// Convert to int16 samples
	samples := make([]int16, len(data)/2)
	for i := 0; i < len(samples); i++ {
		samples[i] = int16(binary.LittleEndian.Uint16(data[i*2:]))
	}

	// Apply gain if configured
	if c.config.PublishGain != 1.0 {
		for i := range samples {
			scaled := float64(samples[i]) * c.config.PublishGain
			if scaled > 32767 {
				scaled = 32767
			} else if scaled < -32768 {
				scaled = -32768
			}
			samples[i] = int16(scaled)
		}
	}

	// Log periodically
	if frameCount%500 == 0 {
		log.Printf("Received audio chunk %d for user %s: %d bytes", frameCount, c.userID, len(data))
	}

	// Write to LiveKit track in 10ms chunks
	sampleRate := 16000
	frameSamples := sampleRate / 100 // 10ms

	for offset := 0; offset < len(samples); offset += frameSamples {
		end := offset + frameSamples
		if end > len(samples) {
			end = len(samples)
		}
		frame := samples[offset:end]

		if err := c.publishTrack.WriteSample(frame); err != nil {
			log.Printf("Failed to write PCM sample: %v", err)
			break
		}
	}
}

func (c *BridgeClient) handleDataPacket(packet lksdk.DataPacket, params lksdk.DataReceiveParams) {
	// Log timing for diagnostics
	c.stats.mu.Lock()
	now := time.Now()
	// if !c.stats.lastPacketTime.IsZero() {
	// gap := now.Sub(c.stats.lastPacketTime)
	// log.Printf("[bridge] DataPacket gap: %v", gap)
	// }
	c.stats.lastPacketTime = now
	c.stats.dataPktsReceived++
	pktCount := c.stats.dataPktsReceived
	c.stats.mu.Unlock()

	// Check if subscribing is enabled
	if !c.subscribeEnabled {
		return
	}

	// Filter by target identity if specified
	if c.targetIdentity != "" && params.SenderIdentity != c.targetIdentity {
		return
	}

	// Extract payload
	userPacket, ok := packet.(*lksdk.UserDataPacket)
	if !ok || len(userPacket.Payload) == 0 {
		return
	}

	// Handle sequence header if present
	pcmData := userPacket.Payload
	if len(pcmData)%2 == 1 {
		// seq := pcmData[0]
		// log.Printf("[bridge] seq header=%d payloadBytes(before)=%d", seq, len(pcmData))
		pcmData = pcmData[1:]
	}

	// Ensure even length
	if len(pcmData)%2 == 1 {
		pcmData = pcmData[:len(pcmData)-1]
	}

	if len(pcmData) == 0 {
		return
	}

	// Log first few packets for diagnostics
	if pktCount <= 5 {
		c.logPCMStats(pcmData, pktCount)
	}

	// Add to pacing buffer for smooth delivery
	c.pacingBuffer.Add(pcmData)

	if pktCount <= 5 || pktCount%100 == 0 {
		log.Printf("[bridge] DataPacket rx #%d from=%s bytes=%d (buffered for pacing)",
			pktCount, params.SenderIdentity, len(pcmData))
	}
}

func (c *BridgeClient) logPCMStats(pcmData []byte, pktNum int) {
	minV := int16(32767)
	maxV := int16(-32768)
	var sumAbs int64
	var sumSq int64

	for i := 0; i+1 < len(pcmData); i += 2 {
		v := int16(binary.LittleEndian.Uint16(pcmData[i : i+2]))
		if v < minV {
			minV = v
		}
		if v > maxV {
			maxV = v
		}
		if v < 0 {
			sumAbs += int64(-v)
		} else {
			sumAbs += int64(v)
		}
		sumSq += int64(v) * int64(v)
	}

	cnt := len(pcmData) / 2
	if cnt > 0 {
		meanAbs := float64(sumAbs) / float64(cnt)
		rms := math.Sqrt(float64(sumSq) / float64(cnt))
		log.Printf("[bridge] packet #%d PCM stats: samples=%d bytes=%d meanAbs=%.1f rms=%.1f min=%d max=%d",
			pktNum, cnt, len(pcmData), meanAbs, rms, minV, maxV)
	}
}

func (c *BridgeClient) ensurePublishTrack() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected || c.room == nil {
		return fmt.Errorf("not connected to room")
	}

	if c.publishTrack != nil {
		return nil
	}

	track, err := lkmedia.NewPCMLocalTrack(16000, 1, nil)
	if err != nil {
		return fmt.Errorf("create PCM track: %w", err)
	}

	if _, err := c.room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{
		Name: "microphone",
	}); err != nil {
		return fmt.Errorf("publish track: %w", err)
	}

	c.publishTrack = track
	log.Printf("PCM audio track published for user %s", c.userID)
	return nil
}

func (c *BridgeClient) publishTone(freqHz, durationMs int) {
	if err := c.ensurePublishTrack(); err != nil {
		log.Printf("Cannot publish tone: %v", err)
		return
	}

	sampleRate := 16000
	samplesPerFrame := sampleRate / 100 // 10ms frames
	totalFrames := durationMs / 10

	log.Printf("Publishing tone: freq=%dHz duration=%dms", freqHz, durationMs)

	timeIndex := 0
	for frame := 0; frame < totalFrames; frame++ {
		samples := make([]int16, samplesPerFrame)
		for i := 0; i < samplesPerFrame; i++ {
			angle := 2 * math.Pi * float64(freqHz) * float64(timeIndex) / float64(sampleRate)
			samples[i] = int16(math.Sin(angle) * 0.5 * 32767)
			timeIndex++
		}

		if c.config.PublishGain != 1.0 {
			for i := range samples {
				scaled := float64(samples[i]) * c.config.PublishGain
				if scaled > 32767 {
					scaled = 32767
				} else if scaled < -32768 {
					scaled = -32768
				}
				samples[i] = int16(scaled)
			}
		}

		if c.publishTrack == nil {
			break
		}

		if err := c.publishTrack.WriteSample(samples); err != nil {
			log.Printf("Failed to write tone sample: %v", err)
			break
		}

		time.Sleep(10 * time.Millisecond)
	}

	log.Printf("Tone publishing completed")
}

func (c *BridgeClient) enableSubscribe(targetIdentity string) {
	c.mu.Lock()
	c.subscribeEnabled = true
	c.targetIdentity = targetIdentity
	c.mu.Unlock()

	log.Printf("Subscribe enabled for user %s (target=%s)", c.userID, targetIdentity)
}

func (c *BridgeClient) disableSubscribe() {
	c.mu.Lock()
	c.subscribeEnabled = false
	c.targetIdentity = ""
	c.mu.Unlock()

	log.Printf("Subscribe disabled for user %s", c.userID)
}

func (c *BridgeClient) sendBinaryData(data []byte) {
	c.websocketMu.Lock()
	defer c.websocketMu.Unlock()

	c.mu.Lock()
	ws := c.websocket
	c.mu.Unlock()

	if ws == nil {
		return
	}

	// Set reasonable deadline
	ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := ws.WriteMessage(websocket.BinaryMessage, data); err != nil {
		log.Printf("Failed to send binary data to user %s: %v", c.userID, err)
		go c.Close()
		return
	}

	c.stats.mu.Lock()
	c.stats.wsSendCount++
	c.stats.wsSendBytes += int64(len(data))
	if c.stats.wsSendCount <= 5 || c.stats.wsSendCount%200 == 0 {
		log.Printf("[bridge] WS sent #%d bytes=%d totalBytes=%d (paced delivery)",
			c.stats.wsSendCount, len(data), c.stats.wsSendBytes)
	}
	c.stats.mu.Unlock()
}

func (c *BridgeClient) sendEvent(event Event) {
	c.websocketMu.Lock()
	defer c.websocketMu.Unlock()

	c.mu.Lock()
	ws := c.websocket
	c.mu.Unlock()

	if ws == nil {
		return
	}

	if err := ws.WriteJSON(event); err != nil {
		log.Printf("Failed to send event to user %s: %v", c.userID, err)
	}
}

func (c *BridgeClient) sendError(message string) {
	c.sendEvent(Event{Type: "error", Error: message})
}

func (c *BridgeClient) pingLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.websocketMu.Lock()
			c.mu.Lock()
			ws := c.websocket
			c.mu.Unlock()

			if ws != nil {
				ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
				err := ws.WriteMessage(websocket.PingMessage, nil)
				c.websocketMu.Unlock()

				if err != nil {
					return
				}
			} else {
				c.websocketMu.Unlock()
			}
		case <-c.context.Done():
			return
		}
	}
}

func (c *BridgeClient) Close() {
	c.cancel()

	// Stop pacing buffer
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
	if c.websocket != nil {
		c.websocket.Close()
		c.websocket = nil
	}
	c.mu.Unlock()

	close(c.closed)
}

// Helper functions
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	config := loadConfig()
	service := NewBridgeService(config)

	// WebSocket endpoint
	http.HandleFunc("/ws", service.HandleWebSocket)

	// Health check endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		service.mu.RLock()
		clientCount := len(service.clients)
		service.mu.RUnlock()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":      "healthy",
			"connections": clientCount,
		})
	})

	log.Printf("LiveKit Bridge starting on port %s", config.Port)
	log.Printf("Configuration: LiveKitURL=%s", config.LiveKitURL)

	if err := http.ListenAndServe(":"+config.Port, nil); err != nil {
		log.Fatal(err)
	}
}
