package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	lkpacer "github.com/livekit/mediatransportutil/pkg/pacer"
	lksdk "github.com/livekit/server-sdk-go/v2"
	lkmedia "github.com/livekit/server-sdk-go/v2/pkg/media"
)

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

	// Connect to room
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
	c.stats.mu.Lock()
	now := time.Now()
	c.stats.lastPacketTime = now
	c.stats.dataPktsReceived++
	pktCount := c.stats.dataPktsReceived
	c.stats.mu.Unlock()
	if !c.subscribeEnabled {
		return
	}
	if c.targetIdentity != "" && params.SenderIdentity != c.targetIdentity {
		return
	}

	userPacket, ok := packet.(*lksdk.UserDataPacket)
	if !ok || len(userPacket.Payload) == 0 {
		return
	}
	pcmData := userPacket.Payload
	if len(pcmData)%2 == 1 {
		pcmData = pcmData[1:]
	}
	if len(pcmData)%2 == 1 {
		pcmData = pcmData[:len(pcmData)-1]
	}
	if len(pcmData) == 0 {
		return
	}
	if pktCount <= 5 {
		c.logPCMStats(pcmData, pktCount)
	}
	c.pacingBuffer.Add(pcmData)
	if pktCount <= 5 || pktCount%100 == 0 {
		log.Printf("[bridge] DataPacket rx #%d from=%s bytes=%d (buffered for pacing)", pktCount, params.SenderIdentity, len(pcmData))
	}
}

func (c *BridgeClient) logPCMStats(pcmData []byte, pktNum int) {
	minV := int16(32767)
	maxV := int16(-32768)
	var sumAbs, sumSq int64
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
		log.Printf("[bridge] packet #%d PCM stats: samples=%d bytes=%d meanAbs=%.1f rms=%.1f min=%d max=%d", pktNum, cnt, len(pcmData), meanAbs, rms, minV, maxV)
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

	if _, err := c.room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{Name: "microphone"}); err != nil {
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
	samplesPerFrame := sampleRate / 100
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
		log.Printf("[bridge] WS sent #%d bytes=%d totalBytes=%d (paced delivery)", c.stats.wsSendCount, len(data), c.stats.wsSendBytes)
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

func (c *BridgeClient) sendError(message string) { c.sendEvent(Event{Type: "error", Error: message}) }

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
