#!/bin/bash
echo "🚀 Starting Go LiveKit bridge..."
./livekit-bridge &
GO_PID=$!

echo "☁️ Starting Bun cloud service..."
cd packages/cloud && bun run start &
BUN_PID=$!

# Wait for any process to exit
wait -n

# If we get here, one process died - kill the other and exit with error
echo "❌ Service died, shutting down..."
kill $GO_PID $BUN_PID 2>/dev/null || true
exit 1