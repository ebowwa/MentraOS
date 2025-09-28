package main

import (
	"encoding/json"
	"sync"
	"time"
)

// Command represents incoming control messages
type Command struct {
	Action         string          `json:"action"`
	RoomName       string          `json:"roomName,omitempty"`
	Token          string          `json:"token,omitempty"`
	Config         json.RawMessage `json:"config,omitempty"`
	FreqHz         int             `json:"freq,omitempty"`
	DurationMs     int             `json:"ms,omitempty"`
	Url            string          `json:"url,omitempty"`
	RequestID      string          `json:"requestId,omitempty"`
	Volume         float64         `json:"volume,omitempty"`
	SampleRate     int             `json:"sampleRate,omitempty"`
	Reason         string          `json:"reason,omitempty"`
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

type ClientStats struct {
	mu               sync.Mutex
	audioFramesIn    int
	dataPktsReceived int
	wsSendCount      int
	wsSendBytes      int64
	lastPacketTime   time.Time
}
