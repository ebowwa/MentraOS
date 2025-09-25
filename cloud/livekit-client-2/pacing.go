package main

import (
	"sync"
	"time"
)

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

func (pb *PacingBuffer) Stop() { close(pb.quit) }

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
