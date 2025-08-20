import { MentraClient } from '../MentraClient';
import { AccountService } from '../services/AccountService';

async function main() {
  const server = process.env.SERVER_URL || 'http://localhost:8002';
  const wsServer = server.replace(/^http/, 'ws');
  const email = process.env.TEST_EMAIL || 'user@example.com';
  const token = process.env.CORE_TOKEN || AccountService.generateTestAccount(email).coreToken;

  const client = new MentraClient({
    email,
    serverUrl: `${wsServer}`,
    coreToken: token,
    behavior: { disableStatusUpdates: true },
    debug: { logLevel: 'info', logWebSocketMessages: true },
  });

  // Test LiveKit subscriber connection
  console.log('[Test] Testing LiveKit subscriber connection...');
  
  client.on('livekit_info', async (info) => {
    console.log('[Test] Received LiveKit info:', JSON.stringify(info, null, 2));
    
    // Try to connect as subscriber like the server does
    try {
      const { Room } = require('@livekit/rtc-node');
      const room = new Room();
      
      console.log('[Test] Attempting to connect as subscriber...');
      await room.connect(info.url, info.token, {
        autoSubscribe: true,
        timeout: 10000,
      });
      
      console.log('[Test] ✅ Successfully connected as subscriber!');
      console.log('[Test] This proves the network can establish LiveKit connections');
      
      // Disconnect after success
      await room.disconnect();
      process.exit(0);
    } catch (error: any) {
      console.error('[Test] ❌ Failed to connect as subscriber:', error.message);
      process.exit(1);
    }
  });

  await client.connect();
  
  // Request subscriber mode (not publisher)
  client.requestLiveKitInit('subscribe');
  
  // Wait for test to complete
  await new Promise(resolve => setTimeout(resolve, 15000));
  console.error('[Test] ❌ Timeout waiting for LiveKit info');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});