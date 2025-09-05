// Simple test client for LiveKit Go bridge
const WebSocket = require('ws');

const userId = 'test-user-' + Date.now();
const bridgeUrl = process.env.BRIDGE_URL || 'ws://localhost:8080/ws';

console.log(`Connecting to LiveKit bridge at ${bridgeUrl}`);
console.log(`User ID: ${userId}`);

const ws = new WebSocket(`${bridgeUrl}?userId=${userId}`);

ws.on('open', () => {
  console.log('Connected to LiveKit bridge');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data);
    console.log('Received message:', message);
    
    if (message.type === 'connected') {
      console.log('Bridge ready, can now join room');
      
      // Example: Join a room (requires valid token)
      // ws.send(JSON.stringify({
      //   action: 'join_room',
      //   roomName: 'test-room',
      //   token: 'your-livekit-token-here'
      // }));
    }
  } catch (err) {
    // Binary audio data
    console.log(`Received binary audio data: ${data.length} bytes`);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});

ws.on('close', () => {
  console.log('Disconnected from LiveKit bridge');
});

// Keep the process alive
process.on('SIGINT', () => {
  console.log('Closing connection...');
  ws.close();
  process.exit(0);
});