package main

import (
	"os"
	"strconv"
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

// Helper function
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
