package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"math"

	"github.com/gorilla/websocket"
	media "github.com/livekit/media-sdk"
	lkpacer "github.com/livekit/mediatransportutil/pkg/pacer"
	lksdk "github.com/livekit/server-sdk-go/v2"
	lkmedia "github.com/livekit/server-sdk-go/v2/pkg/media"
	webrtc "github.com/pion/webrtc/v4"
)

// Overview (TypeScript-friendly explanation):
// This service exposes a WebSocket API. Each WebSocket client can:
//   1. Join a LiveKit room (publishing a PCM16 16kHz mono track lazily when needed)
//   2. Send raw PCM16 16kHz mono bytes over the WebSocket (binary messages) to feed into the published track.
//   3. Request generation of a test tone (publish_tone) which synthesizes sine wave frames.
//   4. Enable subscription forwarding: remote audio tracks are downsampled to 16kHz mono and re-emitted to the WebSocket as 10ms binary frames.
//
// The LiveKit Go SDK provides a PCMLocalTrack (for publishing PCM) and a PCMRemoteTrack (for receiving remote audio as PCM).
// We slice / group audio into 10ms frames (160 samples at 16 kHz) which is a common cadence for Opus and many real-time pipelines.
//
// Concurrency model:
// - Each client has its own goroutines for pinging, tone generation, forwarding remote tracks, etc.
// - Mutexes protect shared state (e.g., active room connection, published track reference, subscription maps).
// - Channels (e.g., context cancellation) are used for lifecycle shutdown.
//
// Naming notes:
// - We keep some original LiveKit naming (Room, Track) but add clearer field names where helpful.
// - Methods like ensurePublishTrack lazily create and publish the audio track only when first needed.

var publishGain float64 = 1.0

func init() {
	if v := os.Getenv("PUBLISH_GAIN"); v != "" {
		if g, err := strconv.ParseFloat(v, 64); err == nil && g > 0 {
			publishGain = g
		}
	}
}

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
	userId string          // logical user identifier (query param)
	ws     *websocket.Conn // active WebSocket connection

	room         *lksdk.Room            // LiveKit room handle (nil until joined)
	publishTrack *lkmedia.PCMLocalTrack // lazily created local PCM track (16kHz mono)

	ctx    context.Context    // per-client root context
	cancel context.CancelFunc // cancels ctx and all derived work

	mu        sync.Mutex // guards room / publishTrack / connection flags
	connected bool       // true after successful join

	receivedFrameCount int // number of inbound binary audio chunks accepted via WS
	sampleRate         int // cached publish track sample rate (expect 16000)

	// Subscription forwarding state (remote -> WS)
	subscribeEnabled bool          // if true we forward remote audio
	targetIdentity   string        // optional filter on participant identity
	subQuit          chan struct{} // future use (not heavily used now)

	// Remote track registry
	tracksMu      sync.Mutex
	subTracks     map[string]*webrtc.TrackRemote     // publication SID -> remote RTP track
	subTrackOwner map[string]string                  // publication SID -> participant identity
	subActive     map[string]bool                    // publication SID -> forwarding active
	pcmBySID      map[string]*lkmedia.PCMRemoteTrack // publication SID -> PCM decoding helper

	// Outgoing subscription PCM frame assembly buffer (always 16kHz mono)
	subBuf16k     []byte
	subFrameCount int

	// Lifecycle close signaling
	closedCh  chan struct{}
	closeOnce sync.Once
}

// Message types
type Command struct {
	Action   string          `json:"action"`
	RoomName string          `json:"roomName,omitempty"`
	Token    string          `json:"token,omitempty"`
	Config   json.RawMessage `json:"config,omitempty"`
	// Optional fields for tone publishing
	FreqHz     int    `json:"freq,omitempty"`
	DurationMs int    `json:"ms,omitempty"`
	Url        string `json:"url,omitempty"`
	// Subscribe controls
	TargetIdentity string `json:"targetIdentity,omitempty"`
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
		userId:        userId,
		ws:            ws,
		ctx:           ctx,
		cancel:        cancel,
		subTracks:     make(map[string]*webrtc.TrackRemote),
		subTrackOwner: make(map[string]string),
		subActive:     make(map[string]bool),
		pcmBySID:      make(map[string]*lkmedia.PCMRemoteTrack),
		closedCh:      make(chan struct{}),
	}

	s.mu.Lock()
	// Clean up existing client if present
	if existing, ok := s.clients[userId]; ok {
		existing.Close()
		// Wait for previous client to fully close to avoid ghosts
		s.mu.Unlock()
		select {
		case <-existing.closedCh:
			// closed
		case <-time.After(2 * time.Second):
			// timeout; proceed anyway
		}
		s.mu.Lock()
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
			log.Printf("WS binary message received for user %s, bytes=%d", c.userId, len(message))
			// Handle binary audio data
			c.handleAudioData(message)
		} else if messageType == websocket.TextMessage {
			log.Printf("WS text message received for user %s, bytes=%d", c.userId, len(message))
			// Handle JSON control messages
			var cmd Command
			if err := json.Unmarshal(message, &cmd); err != nil {
				log.Printf("Failed to parse command from user %s: %v", c.userId, err)
				c.sendError("Invalid command format")
				continue
			}
			c.handleCommand(cmd)
		} else {
			log.Printf("WS other opcode=%d for user %s, bytes=%d", messageType, c.userId, len(message))
		}
	}
}

func (c *LiveKitClient) handleCommand(cmd Command) {
	switch cmd.Action {
	case "join_room":
		c.joinRoomWithURL(cmd.RoomName, cmd.Token, cmd.Url)
	case "leave_room":
		c.leaveRoom()
	case "publish_audio":
		// Handle publish control if needed
	case "publish_tone":
		// Generate and publish a 440Hz (default) tone for duration
		freq := cmd.FreqHz
		if freq == 0 {
			freq = 440
		}
		durMs := cmd.DurationMs
		if durMs == 0 {
			durMs = 3000
		}
		go c.publishTone(freq, durMs)
	case "subscribe_enable":
		c.enableSubscribe(cmd.TargetIdentity)
	case "subscribe_disable":
		c.disableSubscribe()
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
	// Allow client to override URL via command token if needed
	url := getLiveKitURL()
	room, err := lksdk.ConnectToRoomWithToken(url, token, roomCallback)
	if err != nil {
		log.Printf("Failed to connect to room: %v", err)
		c.sendError(fmt.Sprintf("Failed to connect: %v", err))
		return
	}

	c.room = room
	c.connected = true

	// NOTE: Do not auto-publish a local track here; this connection may be subscribe-only.

	// Send success event
	log.Printf("Sending room_joined event for user %s in room %s", c.userId, roomName)
	c.sendEvent(Event{
		Type:             "room_joined",
		RoomName:         roomName,
		ParticipantID:    string(room.LocalParticipant.Identity()),
		ParticipantCount: len(room.GetRemoteParticipants()),
	})
}

// joinRoomWithURL allows specifying LiveKit URL instead of env LIVEKIT_URL
func (c *LiveKitClient) joinRoomWithURL(roomName, token, customURL string) {
	// Quick check under lock to avoid races, but do not hold for long operations
	c.mu.Lock()
	if c.room != nil {
		c.mu.Unlock()
		c.sendError("Already in a room")
		return
	}
	c.mu.Unlock()

	log.Printf("User %s joining room %s (customURL=%v)", c.userId, roomName, customURL != "")

	roomCallback := &lksdk.RoomCallback{
		OnDisconnected: func() {
			log.Printf("Disconnected from room")
			c.sendEvent(Event{Type: "disconnected", State: "disconnected"})
		},
		ParticipantCallback: lksdk.ParticipantCallback{
			OnTrackSubscribed: func(track *webrtc.TrackRemote, publication *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
				// remember track and owner
				c.tracksMu.Lock()
				c.subTracks[string(publication.SID())] = track
				c.subTrackOwner[string(publication.SID())] = string(rp.Identity())
				c.tracksMu.Unlock()
				c.onTrackSubscribed(track, publication, rp)
			},
			OnTrackUnsubscribed: func(track *webrtc.TrackRemote, publication *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
				log.Printf("Remote track unsubscribed: %s from %s", publication.Name(), rp.Identity())
				c.tracksMu.Lock()
				delete(c.subTracks, string(publication.SID()))
				delete(c.subTrackOwner, string(publication.SID()))
				delete(c.subActive, string(publication.SID()))
				c.tracksMu.Unlock()
			},
		},
	}

	url := customURL
	if url == "" {
		url = getLiveKitURL()
	}
	log.Printf("Connecting to LiveKit: url=%s tokenLen=%d room=%s", url, len(token), roomName)
	// Attempt connection with timeout guard so we can surface failures
	resCh := make(chan *lksdk.Room, 1)
	errCh := make(chan error, 1)
	// Configure LiveKit pacer for smoother output pacing with low latency
	pf := lkpacer.NewPacerFactory(
		lkpacer.LeakyBucketPacer,
		lkpacer.WithBitrate(512_000), // 512 kbps ceiling (ample for Opus mono)
		lkpacer.WithMaxLatency(100*time.Millisecond),
	)
	go func() {
		r, err := lksdk.ConnectToRoomWithToken(url, token, roomCallback, lksdk.WithPacer(pf))
		if err != nil {
			errCh <- err
			return
		}
		resCh <- r
	}()

	select {
	case r := <-resCh:
		c.mu.Lock()
		c.room = r
		c.connected = true
		c.mu.Unlock()
	case err := <-errCh:
		log.Printf("Failed to connect to room: %v", err)
		c.sendError(fmt.Sprintf("Failed to connect: %v", err))
		return
	case <-time.After(10 * time.Second):
		log.Printf("Failed to connect to room within timeout")
		c.sendError("connect_timeout")
		return
	}

	// Signal room joined immediately
	c.sendEvent(Event{
		Type:             "room_joined",
		RoomName:         roomName,
		ParticipantID:    string(c.room.LocalParticipant.Identity()),
		ParticipantCount: len(c.room.GetRemoteParticipants()),
	})
}

// ensurePublishTrack lazily creates & publishes a local PCM track if not present.
// ensurePublishTrack lazily creates a 16kHz mono PCM track and publishes it to the room.
// Safe for repeated calls; returns fast if already created.
func (c *LiveKitClient) ensurePublishTrack() error {
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
	c.sampleRate = 16000
	log.Printf("PCM audio track published for user %s (16kHz mono)", c.userId)
	return nil
}

// publishTone generates a sine wave at the given frequency and publishes via WriteSample at ~10ms cadence
// publishTone synthesizes a sine wave at freqHz for durationMs, writing 10ms frames.
// Frames are spaced with time.Sleep to emulate real-time capture.
func (c *LiveKitClient) publishTone(freqHz int, durationMs int) {
	if err := c.ensurePublishTrack(); err != nil {
		log.Printf("Cannot publish tone - ensurePublishTrack failed: %v", err)
		return
	}
	c.mu.Lock()
	track := c.publishTrack
	sr := c.sampleRate
	c.mu.Unlock()

	// Match track's configured source sample rate
	sampleRate := sr
	if sampleRate == 0 {
		sampleRate = 16000
	}
	samplesPer10ms := sampleRate / 100
	totalFrames := durationMs / 10
	log.Printf("Publishing tone: freq=%dHz duration=%dms frames=%d", freqHz, durationMs, totalFrames)
	var t int
	for i := 0; i < totalFrames; i++ {
		samples := make([]int16, samplesPer10ms)
		var sumAbs int64
		var sumSq int64
		var minV int16 = 32767
		var maxV int16 = -32768
		for s := 0; s < samplesPer10ms; s++ {
			val := int16(math.Round(math.Sin(2*math.Pi*float64(freqHz)*float64(t)/float64(sampleRate)) * 0.5 * 32767.0))
			samples[s] = val
			t++
			if val < minV {
				minV = val
			}
			if val > maxV {
				maxV = val
			}
			if val < 0 {
				sumAbs += int64(-val)
			} else {
				sumAbs += int64(val)
			}
			sumSq += int64(val) * int64(val)
		}
		meanAbs := float64(sumAbs) / float64(samplesPer10ms)
		rms := math.Sqrt(float64(sumSq) / float64(samplesPer10ms))
		if i%10 == 0 {
			log.Printf("Tone frame %d energy: meanAbs=%.1f rms=%.1f min=%d max=%d", i, meanAbs, rms, minV, maxV)
		}
		// Apply optional gain with clipping
		if publishGain != 1.0 {
			for i := range samples {
				scaled := float64(samples[i]) * publishGain
				if scaled > 32767 {
					scaled = 32767
				} else if scaled < -32768 {
					scaled = -32768
				}
				samples[i] = int16(scaled)
			}
		}
		if err := track.WriteSample(samples); err != nil {
			log.Printf("Failed to write tone PCM sample: %v", err)
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	log.Printf("Completed tone publishing")
}

// handleAudioData ingests raw PCM16 (little-endian) bytes supplied over the WebSocket
// and feeds them into the published local track. Assumes 16 kHz mono layout.
// Large incoming chunks are split into 10ms frames (160 samples) and queued to LiveKit.
// We intentionally do NOT sleep here; the SDK/pacer will smooth timing.
func (c *LiveKitClient) handleAudioData(data []byte) {
	if err := c.ensurePublishTrack(); err != nil {
		log.Printf("Cannot send audio - ensurePublishTrack failed: %v", err)
		return
	}

	// Log audio data reception (every 10th chunk to avoid spam)
	c.mu.Lock()
	audioChunkCount := c.receivedFrameCount
	c.receivedFrameCount++
	c.mu.Unlock()

	// Only log 1 in every 500
	if audioChunkCount%500 == 0 {
		log.Printf("Received audio chunk %d for user %s, size: %d bytes", audioChunkCount, c.userId, len(data))
	}

	// Convert byte slice to int16 samples (16kHz mono expected)
	samples := make([]int16, len(data)/2)
	var sumAbs int64 = 0
	var sumSq int64 = 0
	var minVal int16 = 32767
	var maxVal int16 = -32768
	for i := 0; i < len(samples); i++ {
		v := int16(binary.LittleEndian.Uint16(data[i*2 : i*2+2]))
		samples[i] = v
		if v < minVal {
			minVal = v
		}
		if v > maxVal {
			maxVal = v
		}
		if v < 0 {
			sumAbs += int64(-v)
		} else {
			sumAbs += int64(v)
		}
		sumSq += int64(v) * int64(v)
	}
	if len(samples) > 0 {
		meanAbs := float64(sumAbs) / float64(len(samples))
		rms := math.Sqrt(float64(sumSq) / float64(len(samples)))
		if audioChunkCount%500 == 0 {
			log.Printf("Audio chunk %d stats: meanAbs=%.1f rms=%.1f min=%d max=%d", audioChunkCount, meanAbs, rms, minVal, maxVal)
		}
	}

	// Pace large chunks into ~10ms frames to match expected cadence for the active track sample rate
	sr := c.sampleRate
	if sr == 0 {
		sr = 16000
	}
	frameSamples := sr / 100 // 10ms frame size
	// Write all frames without app-level sleeps; rely on SDK pacer/queue
	for offset := 0; offset < len(samples); offset += frameSamples {
		end := offset + frameSamples
		if end > len(samples) {
			end = len(samples)
		}
		frame := samples[offset:end]
		if publishGain != 1.0 {
			for i := range frame {
				scaled := float64(frame[i]) * publishGain
				if scaled > 32767 {
					scaled = 32767
				} else if scaled < -32768 {
					scaled = -32768
				}
				frame[i] = int16(scaled)
			}
		}
		if err := c.publishTrack.WriteSample(frame); err != nil {
			log.Printf("Failed to write PCM sample: %v", err)
			break
		}
	}
}

// handleIncomingPCM16_16k appends 16 kHz PCM16 bytes and emits fixed 10 ms frames over WS.
// handleIncomingPCM16_16k buffers decoded remote PCM (already 16kHz mono) into 10ms frames
// and sends each frame as a binary WebSocket message to the client.
func (c *LiveKitClient) handleIncomingPCM16_16k(pcm16 []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.ws == nil {
		return
	}
	c.subBuf16k = append(c.subBuf16k, pcm16...)
	const frameBytes = 160 * 2
	for len(c.subBuf16k) >= frameBytes {
		chunk := make([]byte, frameBytes)
		copy(chunk, c.subBuf16k[:frameBytes])
		c.subBuf16k = c.subBuf16k[frameBytes:]
		if c.ws != nil {
			_ = c.ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := c.ws.WriteMessage(websocket.BinaryMessage, chunk); err != nil {
				log.Printf("WS binary write failed for user %s: %v", c.userId, err)
				go c.Close()
				return
			}
			c.subFrameCount++
			if c.subFrameCount%100 == 0 {
				log.Printf("Forwarded %d subscribed frames (16kHz)", c.subFrameCount)
			}
		} else {
			return
		}
	}
}

// enableSubscribe marks subscription forwarding enabled and optionally sets a target identity filter.
// enableSubscribe begins forwarding remote audio tracks (optionally filtered by participant identity).
func (c *LiveKitClient) enableSubscribe(target string) {
	c.mu.Lock()
	c.subscribeEnabled = true
	c.targetIdentity = target
	if c.subQuit == nil {
		c.subQuit = make(chan struct{}, 1)
	}
	c.mu.Unlock()
	log.Printf("Subscribe enabled (target=%s)", target)

	// Attach to any already-present tracks immediately
	c.tracksMu.Lock()
	for sid, tr := range c.subTracks {
		owner := c.subTrackOwner[sid]
		if target != "" && owner != target {
			continue
		}
		if c.subActive[sid] {
			continue
		}
		c.subActive[sid] = true
		go c.forwardTrack(tr, owner, sid)
	}
	c.tracksMu.Unlock()
}

// disableSubscribe stops forwarding subscribed audio.
// disableSubscribe stops forwarding remote audio.
func (c *LiveKitClient) disableSubscribe() {
	c.mu.Lock()
	c.subscribeEnabled = false
	if c.subQuit != nil {
		close(c.subQuit)
		c.subQuit = nil
	}
	c.mu.Unlock()
	log.Printf("Subscribe disabled")
}

// onTrackSubscribed is invoked by RoomCallback when a remote audio track is available.
// onTrackSubscribed fires when a remote track is available; we attach a PCM decoder
// and start forwarding if subscription forwarding is enabled.
func (c *LiveKitClient) onTrackSubscribed(track *webrtc.TrackRemote, publication *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
	if track.Kind() != webrtc.RTPCodecTypeAudio {
		return
	}
	c.mu.Lock()
	enabled := c.subscribeEnabled
	target := c.targetIdentity
	ws := c.ws
	c.mu.Unlock()
	if !enabled || ws == nil {
		log.Printf("Track subscribed but forwarding disabled or ws nil (id=%s)", rp.Identity())
		return
	}
	if target != "" && string(rp.Identity()) != target {
		log.Printf("Skipping track from %s (target=%s)", rp.Identity(), target)
		return
	}

	owner := string(rp.Identity())
	sid := string(publication.SID())
	log.Printf("Subscribed to remote audio: participant=%s trackSid=%s", owner, sid)
	c.sendEvent(Event{Type: "sub_track_added", RoomName: "", ParticipantID: owner, ParticipantCount: 0})
	c.tracksMu.Lock()
	c.subActive[sid] = true
	c.tracksMu.Unlock()
	go c.forwardTrack(track, owner, sid)
}

// forwardTrack uses SDK's PCM remote track at 16 kHz mono and streams fixed 10 ms frames over WS.
// forwardTrack converts the remote RTP audio to PCM16 (16kHz mono) and pushes 10ms frames to the websocket.
func (c *LiveKitClient) forwardTrack(track *webrtc.TrackRemote, owner string, sid string) {
	writer := &pcm16WSWriter{client: c}
	pcmTrack, err := lkmedia.NewPCMRemoteTrack(track, writer,
		lkmedia.WithTargetSampleRate(16000),
		lkmedia.WithTargetChannels(1),
		lkmedia.WithHandleJitter(true),
	)
	if err != nil {
		log.Printf("Failed to create PCMRemoteTrack: %v", err)
		return
	}
	c.tracksMu.Lock()
	c.pcmBySID[sid] = pcmTrack
	c.tracksMu.Unlock()
	// Run until context or disable
	go func(localSID string) {
		<-c.ctx.Done()
		pcmTrack.Close()
		c.tracksMu.Lock()
		delete(c.pcmBySID, localSID)
		c.tracksMu.Unlock()
	}(sid)
}

// pcm16WSWriter implements media.PCM16Writer to receive 16 kHz mono samples from SDK.
type pcm16WSWriter struct {
	client *LiveKitClient
}

// WriteSample is invoked by the LiveKit SDK with a slice of int16 samples at 16kHz.
// We convert to bytes and enqueue for WS forwarding.
func (w *pcm16WSWriter) WriteSample(sample media.PCM16Sample) error {
	// Treat PCM16Sample as a slice of int16 (API may alias []int16)
	data := []int16(sample)
	n := len(data)
	if n == 0 {
		return nil
	}
	bytes := make([]byte, n*2)
	for i := 0; i < n; i++ {
		binary.LittleEndian.PutUint16(bytes[i*2:i*2+2], uint16(data[i]))
	}
	w.client.handleIncomingPCM16_16k(bytes)
	return nil
}

func (w *pcm16WSWriter) Close() error { return nil }

// leaveRoom disconnects from the LiveKit room, closing all tracks and cleaning up.
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

	// Stop all PCM remote tracks
	c.tracksMu.Lock()
	for sid, pcm := range c.pcmBySID {
		pcm.Close()
		delete(c.pcmBySID, sid)
	}
	c.tracksMu.Unlock()

	c.room.Disconnect()
	c.room = nil
	c.connected = false

	c.sendEvent(Event{
		Type: "room_left",
	})
}

// sendEvent serializes and pushes a JSON event over the client WebSocket.
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

// sendError helper to send an error event.
func (c *LiveKitClient) sendError(message string) {
	c.sendEvent(Event{
		Type:  "error",
		Error: message,
	})
}

// pingLoop periodically sends WebSocket pings to keep the connection alive.
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

// Close tears down the client: cancels context, disconnects room, closes tracks & websocket.
func (c *LiveKitClient) Close() {
	c.cancel()
	c.mu.Lock()
	// mark forwarding disabled
	c.subscribeEnabled = false
	if c.subQuit != nil {
		close(c.subQuit)
		c.subQuit = nil
	}
	// disconnect room and ws
	if c.room != nil {
		c.room.Disconnect()
		c.room = nil
	}
	// Close remote PCM tracks
	c.tracksMu.Lock()
	for sid, pcm := range c.pcmBySID {
		pcm.Close()
		delete(c.pcmBySID, sid)
	}
	c.tracksMu.Unlock()
	if c.ws != nil {
		_ = c.ws.Close()
		c.ws = nil
	}
	c.mu.Unlock()
	c.closeOnce.Do(func() { close(c.closedCh) })
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
