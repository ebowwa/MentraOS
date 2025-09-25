package main

import (
	"encoding/json"
	"log"
	"net/http"
)

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
