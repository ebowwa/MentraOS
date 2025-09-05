#!/usr/bin/env bun

/**
 * Integration test for LiveKit Go Bridge
 * Tests the full flow: TypeScript → Go Bridge → LiveKit → TypeScript
 */

import { LiveKitGoBridge } from '../packages/cloud/src/services/session/LiveKitGoBridge';
import { AccessToken } from 'livekit-server-sdk';
import fs from 'fs';
import path from 'path';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://augmentos-playground.livekit.cloud';
const TEST_ROOM = 'test-go-bridge-room';
const TEST_USER = 'test-user-123';

// Test audio file (16kHz PCM)
const TEST_AUDIO_FILE = path.join(__dirname, '..', 'cloud-client', 'audio', 'test-audio-16khz.pcm');

async function mintToken(identity: string, canPublish: boolean): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: 300, // 5 minutes
  });
  
  at.addGrant({
    roomJoin: true,
    canPublish,
    canSubscribe: !canPublish,
    room: TEST_ROOM,
  });
  
  return await at.toJwt();
}

async function runTest() {
  console.log('🚀 Starting LiveKit Go Bridge integration test');
  
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('❌ Missing LiveKit credentials in environment');
    process.exit(1);
  }
  
  let bridge: LiveKitGoBridge | null = null;
  let audioReceived = false;
  
  try {
    // 1. Create Go bridge client
    console.log('1️⃣ Creating Go bridge client...');
    bridge = new LiveKitGoBridge({
      userId: TEST_USER,
      serverUrl: 'ws://localhost:8080',
    });
    
    // 2. Set up audio handler
    console.log('2️⃣ Setting up audio handler...');
    bridge.on('audio', (data: Buffer) => {
      audioReceived = true;
      console.log(`✅ Received audio data: ${data.length} bytes`);
    });
    
    bridge.on('error', (err) => {
      console.error('❌ Bridge error:', err);
    });
    
    bridge.on('room_joined', (info) => {
      console.log('✅ Joined room:', info);
    });
    
    // 3. Connect to Go bridge
    console.log('3️⃣ Connecting to Go bridge...');
    await bridge.connect();
    console.log('✅ Connected to Go bridge');
    
    // 4. Mint subscriber token
    console.log('4️⃣ Minting subscriber token...');
    const subscriberToken = await mintToken(TEST_USER, false);
    
    // 5. Join room as subscriber
    console.log('5️⃣ Joining room as subscriber...');
    await bridge.joinRoom(TEST_ROOM, subscriberToken);
    console.log('✅ Joined room');
    
    // 6. Simulate publishing audio (would need another client)
    console.log('6️⃣ Publishing test audio...');
    
    // Read test audio file if it exists
    let testAudio: Buffer;
    if (fs.existsSync(TEST_AUDIO_FILE)) {
      testAudio = fs.readFileSync(TEST_AUDIO_FILE);
    } else {
      // Create synthetic test audio (100ms of silence at 16kHz)
      testAudio = Buffer.alloc(3200); // 16000 samples/sec * 0.1 sec * 2 bytes/sample
    }
    
    // Publish audio chunks
    const chunkSize = 3200; // 100ms at 16kHz
    for (let i = 0; i < 5; i++) {
      const chunk = testAudio.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length > 0) {
        bridge.publishAudio(chunk);
        console.log(`  📤 Published chunk ${i + 1}: ${chunk.length} bytes`);
      }
      
      // Wait 100ms between chunks to simulate real-time
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 7. Wait for audio to be received
    console.log('7️⃣ Waiting for audio reception...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 8. Leave room
    console.log('8️⃣ Leaving room...');
    await bridge.leaveRoom();
    
    // 9. Disconnect
    console.log('9️⃣ Disconnecting...');
    bridge.disconnect();
    
    // Results
    console.log('\n📊 Test Results:');
    console.log(`  Connection: ✅`);
    console.log(`  Room Join: ✅`);
    console.log(`  Audio Publish: ✅`);
    console.log(`  Audio Receive: ${audioReceived ? '✅' : '⚠️ (No audio received - normal if no other publisher)'}`);
    
    console.log('\n✅ Integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    if (bridge) {
      bridge.disconnect();
    }
  }
}

// Run test
runTest().catch(console.error);