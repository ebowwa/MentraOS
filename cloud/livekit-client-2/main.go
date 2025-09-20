package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"log"
	"net"
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

var lastFrameTime time.Time

type LiveKitService struct {
	clients map[string]*LiveKitClient
	mu      sync.RWMutex
}

type LiveKitClient struct {
	userId             string
	ws                 *websocket.Conn
	room               *lksdk.Room
	publishTrack       *lkmedia.PCMLocalTrack
	ctx                context.Context
	cancel             context.CancelFunc
	mu                 sync.Mutex
	connected          bool
	receivedFrameCount int
	sampleRate         int
	// subscribe state
	subscribeEnabled bool
	targetIdentity   string
	subQuit          chan struct{}
	// track registry
	tracksMu      sync.Mutex
	subTracks     map[string]*webrtc.TrackRemote     // by publication SID
	subTrackOwner map[string]string                  // SID -> participant identity
	subActive     map[string]bool                    // SID -> forwarding active
	pcmBySID      map[string]*lkmedia.PCMRemoteTrack // SID -> PCM remote track
	// subscriber outgoing 16kHz frame buffer (bytes)
	subBuf16k     []byte
	subFrameCount int

	// diagnostics
	subPktCount int   // number of data packets received
	wsSendCount int   // number of WS sends
	wsSendBytes int64 // cumulative WS bytes sent

	// lifecycle
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
			// Data-only bridge: ignore all track subscriptions (no audio track playout/forwarding)
			OnTrackSubscribed: func(track *webrtc.TrackRemote, publication *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
				// Intentionally do nothing; we only consume DataPackets from publishData
				if track.Kind() == webrtc.RTPCodecTypeAudio {
					log.Printf("Data-only: ignoring audio track from %s (sid=%s)", rp.Identity(), publication.SID())
				}
			},
			OnTrackUnsubscribed: func(track *webrtc.TrackRemote, publication *lksdk.RemoteTrackPublication, rp *lksdk.RemoteParticipant) {
				log.Printf("Remote track unsubscribed: %s from %s", publication.Name(), rp.Identity())
				// Nothing else to clean up in data-only mode
			},
			// Minimal data receive path: accept arbitrary-size PCM16 payloads over DataPacket (RELIABLE)
			OnDataPacket: func(pkt lksdk.DataPacket, params lksdk.DataReceiveParams) {
				// calculate and log the gap between packets.
				now := time.Now()
				if !lastFrameTime.IsZero() {
					gap := now.Sub(lastFrameTime)
					log.Printf("[bridge] DataPacket gap: %v", gap)
				}
				lastFrameTime = now

				// Only forward when subscribe is enabled
				if !c.subscribeEnabled {
					return
				}
				// Optional identity filter when target is set
				if c.targetIdentity != "" && params.SenderIdentity != c.targetIdentity {
					return
				}
				var data []byte
				if udp, ok := pkt.(*lksdk.UserDataPacket); ok {
					data = udp.Payload
				} else {
					return
				}
				if len(data) == 0 {
					return
				}
				c.subPktCount++
				if c.subPktCount <= 5 || c.subPktCount%100 == 0 {
					log.Printf("[bridge] DataPacket rx #%d from=%s bytes=%d", c.subPktCount, params.SenderIdentity, len(data))
				}
				// Data packets from the mobile sender include an optional 1-byte sequence header.
				// The cloud can accept full PCM16 chunks, so we forward the complete blob (no 10ms re-framing).
				// Strip the header if present, ensure even length, then write over WS as a single binary message.
				pcm := data
				if len(pcm)%2 == 1 {
					// Treat first byte as sequence header, remainder should be even PCM bytes
					seq := pcm[0]
					// if c.subPktCount <= 5 || c.subPktCount%100 == 0 {
					log.Printf("[bridge] seq header=%d payloadBytes(before)=%d", seq, len(pcm))
					// }
					pcm = pcm[1:]
				}
				// Ensure even number of bytes (pairs of 16-bit samples)
				if len(pcm)%2 == 1 {
					pcm = pcm[:len(pcm)-1]
				}
				if len(pcm) == 0 {
					return
				}
				// Light PCM diagnostics on first N packets
				if c.subPktCount <= 5 {
					minV := int16(32767)
					maxV := int16(-32768)
					var sumAbs int64
					var sumSq int64
					for i := 0; i+1 < len(pcm); i += 2 {
						v := int16(binary.LittleEndian.Uint16(pcm[i : i+2]))
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
					cnt := len(pcm) / 2
					if cnt > 0 {
						meanAbs := float64(sumAbs) / float64(cnt)
						rms := math.Sqrt(float64(sumSq) / float64(cnt))
						log.Printf("[bridge] pcm stats: samples=%d bytes=%d meanAbs=%.1f rms=%.1f min=%d max=%d", cnt, len(pcm), meanAbs, rms, minV, maxV)
					}
				}
				c.writeWSBinary(pcm)

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
		// AutoSubscribe=false ensures the server doesn't auto-subscribe us to A/V tracks
		r, err := lksdk.ConnectToRoomWithToken(url, token, roomCallback, lksdk.WithPacer(pf), lksdk.WithAutoSubscribe(false))
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

// writeWSBinary writes a binary WebSocket message with a short deadline; closes on error.
func (c *LiveKitClient) writeWSBinary(payload []byte) {
	c.mu.Lock()
	ws := c.ws
	c.mu.Unlock()
	if ws == nil {
		return
	}

	// THIS IS THE KEY FIX - disable buffering at TCP level
	if conn := ws.UnderlyingConn(); conn != nil {
		if tcpConn, ok := conn.(*net.TCPConn); ok {
			tcpConn.SetNoDelay(true) // Disable Nagle's algorithm
		}
	}

	// _ = ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_ = ws.SetWriteDeadline(time.Now().Add(time.Millisecond))
	ws.EnableWriteCompression(false)
	if err := ws.WriteMessage(websocket.BinaryMessage, payload); err != nil {
		log.Printf("[bridge] WS binary write failed for user %s: %v", c.userId, err)
		go c.Close()
	}
	c.wsSendCount++
	c.wsSendBytes += int64(len(payload))
	if c.wsSendCount <= 5 || c.wsSendCount%200 == 0 {
		log.Printf("[bridge] WS sent #%d bytes=%d totalBytes=%d", c.wsSendCount, len(payload), c.wsSendBytes)
	}
}

// handleIncomingPCM16_16k appends 16 kHz PCM16 bytes and emits fixed 10 ms frames over WS.
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
		go c.forwardTrack(tr, sid)
	}
	c.tracksMu.Unlock()
}

// disableSubscribe stops forwarding subscribed audio.
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
	go c.forwardTrack(track, sid)
}

// forwardTrack uses SDK's PCM remote track at 16 kHz mono and streams fixed 10 ms frames over WS.
func (c *LiveKitClient) forwardTrack(track *webrtc.TrackRemote, sid string) {
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
