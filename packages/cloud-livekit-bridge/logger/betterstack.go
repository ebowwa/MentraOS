package logger

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// BetterStackLogger sends logs to Better Stack HTTP endpoint
type BetterStackLogger struct {
	token         string
	ingestingHost string
	client        *http.Client
	batchSize     int
	flushInterval time.Duration
	buffer        []LogEntry
	bufferMu      sync.Mutex
	stopCh        chan struct{}
	wg            sync.WaitGroup
	enabled       bool
}

// LogEntry represents a single log entry
type LogEntry struct {
	Message   string                 `json:"message"`
	Level     string                 `json:"level,omitempty"`
	Timestamp string                 `json:"dt"`
	Service   string                 `json:"service,omitempty"`
	UserID    string                 `json:"user_id,omitempty"`
	SessionID string                 `json:"session_id,omitempty"`
	RoomName  string                 `json:"room_name,omitempty"`
	Error     string                 `json:"error,omitempty"`
	Extra     map[string]interface{} `json:"extra,omitempty"`
}

// Config for BetterStackLogger
type Config struct {
	Token         string
	IngestingHost string
	BatchSize     int
	FlushInterval time.Duration
	Enabled       bool
}

// NewBetterStackLogger creates a new Better Stack logger
func NewBetterStackLogger(cfg Config) *BetterStackLogger {
	if cfg.BatchSize == 0 {
		cfg.BatchSize = 10
	}
	if cfg.FlushInterval == 0 {
		cfg.FlushInterval = 5 * time.Second
	}

	logger := &BetterStackLogger{
		token:         cfg.Token,
		ingestingHost: cfg.IngestingHost,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		batchSize:     cfg.BatchSize,
		flushInterval: cfg.FlushInterval,
		buffer:        make([]LogEntry, 0, cfg.BatchSize),
		stopCh:        make(chan struct{}),
		enabled:       cfg.Enabled,
	}

	if logger.enabled {
		logger.wg.Add(1)
		go logger.flushWorker()
	}

	return logger
}

// Log sends a log entry to Better Stack
func (l *BetterStackLogger) Log(entry LogEntry) {
	if !l.enabled {
		return
	}

	// Set timestamp if not provided
	if entry.Timestamp == "" {
		entry.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	l.bufferMu.Lock()
	l.buffer = append(l.buffer, entry)
	shouldFlush := len(l.buffer) >= l.batchSize
	l.bufferMu.Unlock()

	if shouldFlush {
		l.Flush()
	}
}

// LogInfo logs an info message
func (l *BetterStackLogger) LogInfo(message string, fields map[string]interface{}) {
	l.Log(LogEntry{
		Message: message,
		Level:   "info",
		Service: "livekit-bridge",
		Extra:   fields,
	})
}

// LogError logs an error message
func (l *BetterStackLogger) LogError(message string, err error, fields map[string]interface{}) {
	if fields == nil {
		fields = make(map[string]interface{})
	}

	entry := LogEntry{
		Message: message,
		Level:   "error",
		Service: "livekit-bridge",
		Extra:   fields,
	}

	if err != nil {
		entry.Error = err.Error()
	}

	l.Log(entry)
}

// LogDebug logs a debug message
func (l *BetterStackLogger) LogDebug(message string, fields map[string]interface{}) {
	l.Log(LogEntry{
		Message: message,
		Level:   "debug",
		Service: "livekit-bridge",
		Extra:   fields,
	})
}

// LogWarn logs a warning message
func (l *BetterStackLogger) LogWarn(message string, fields map[string]interface{}) {
	l.Log(LogEntry{
		Message: message,
		Level:   "warn",
		Service: "livekit-bridge",
		Extra:   fields,
	})
}

// Flush sends all buffered logs immediately
func (l *BetterStackLogger) Flush() {
	if !l.enabled {
		return
	}

	l.bufferMu.Lock()
	if len(l.buffer) == 0 {
		l.bufferMu.Unlock()
		return
	}

	// Copy buffer and clear it
	entries := make([]LogEntry, len(l.buffer))
	copy(entries, l.buffer)
	l.buffer = l.buffer[:0]
	l.bufferMu.Unlock()

	// Send in background to avoid blocking
	go l.sendBatch(entries)
}

// sendBatch sends a batch of log entries to Better Stack
func (l *BetterStackLogger) sendBatch(entries []LogEntry) {
	if len(entries) == 0 {
		return
	}

	jsonData, err := json.Marshal(entries)
	if err != nil {
		log.Printf("[BetterStack] Failed to marshal log entries: %v", err)
		return
	}

	url := fmt.Sprintf("https://%s", l.ingestingHost)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("[BetterStack] Failed to create request: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", l.token))

	resp, err := l.client.Do(req)
	if err != nil {
		log.Printf("[BetterStack] Failed to send logs: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[BetterStack] Failed to send logs (status %d): %s", resp.StatusCode, string(body))
	}
}

// flushWorker periodically flushes the buffer
func (l *BetterStackLogger) flushWorker() {
	defer l.wg.Done()

	ticker := time.NewTicker(l.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			l.Flush()
		case <-l.stopCh:
			l.Flush() // Final flush on shutdown
			return
		}
	}
}

// Close stops the logger and flushes remaining logs
func (l *BetterStackLogger) Close() {
	if !l.enabled {
		return
	}

	close(l.stopCh)
	l.wg.Wait()
}

// NewFromEnv creates a BetterStackLogger from environment variables
func NewFromEnv() *BetterStackLogger {
	token := os.Getenv("BETTERSTACK_SOURCE_TOKEN")
	host := os.Getenv("BETTERSTACK_INGESTING_HOST")
	enabled := token != "" && host != ""

	if !enabled {
		log.Println("[BetterStack] Logger disabled (missing BETTERSTACK_SOURCE_TOKEN or BETTERSTACK_INGESTING_HOST)")
	} else {
		log.Printf("[BetterStack] Logger enabled, sending to %s", host)
	}

	return NewBetterStackLogger(Config{
		Token:         token,
		IngestingHost: host,
		BatchSize:     10,
		FlushInterval: 5 * time.Second,
		Enabled:       enabled,
	})
}
