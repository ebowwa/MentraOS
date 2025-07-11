#!/bin/bash

# RTMP Relay Complete Rebuild Script
# This script completely removes and rebuilds the rtmp-relay container

echo "🔄 Stopping rtmp-relay container..."
docker stop rtmp-relay 2>/dev/null || true

echo "🗑️  Removing rtmp-relay container..."
docker rm rtmp-relay 2>/dev/null || true

echo "🗑️  Removing rtmp-relay image..."
docker rmi rtmp-relay 2>/dev/null || true

echo "🧹 Pruning ALL Docker build cache..."
docker builder prune -af

echo "🔨 Building rtmp-relay from scratch (no cache)..."
docker build --no-cache -t rtmp-relay .

echo "🚀 Starting rtmp-relay container..."
docker run -d \
  --name rtmp-relay \
  --network augmentos-network \
  -p 1935:1935 \
  -p 8554:8554 \
  -p 8888:8888 \
  -p 8889:8889 \
  -p 9997:9997 \
  -e CLOUD_API_URL=https://israelovpuddle.ngrok.app \
  rtmp-relay

echo "✅ Container started! Following logs..."
echo "----------------------------------------"
docker logs -f rtmp-relay