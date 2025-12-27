#!/bin/bash

# Script to run RTMP relay locally with ngrok

echo "🚀 Starting local RTMP relay..."

# Check if CLOUD_API_URL is set
if [ -z "$CLOUD_API_URL" ]; then
  echo "⚠️  CLOUD_API_URL not set. Using default: https://api.mentra.glass"
  echo "   To use your ngrok URL, run: export CLOUD_API_URL=https://your-ngrok-url.ngrok.io"
fi

# Build and start the relay
echo "🔨 Building Docker image..."
docker-compose -f docker-compose.dev.yml build

echo "📡 Starting RTMP relay..."
docker-compose -f docker-compose.dev.yml up -d

echo "✅ RTMP relay started!"
echo "   RTMP: rtmp://localhost:1935/live/{userId}/{streamId}"
echo "   Health: http://localhost:9997/v3/config/get"
echo ""
echo "🌐 To expose via ngrok:"
echo "   ngrok tcp 1935"
echo ""
echo "📝 Then update your cloud's RTMP_RELAY_URLS to:"
echo "   tcp://0.tcp.ngrok.io:12345 (use your ngrok URL)"
echo ""
echo "🛑 To stop: docker-compose -f docker-compose.dev.yml down"