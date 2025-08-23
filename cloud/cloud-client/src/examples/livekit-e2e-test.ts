import { MentraClient } from '../MentraClient';
import { AccountService } from '../services/AccountService';
import { resolve } from 'path';
import * as fs from 'fs';

const APP_PACKAGE_NAME = 'isaiah.augmentos.livecaptions';

async function main() {
  const server = process.env.SERVER_URL || 'https://isaiah.augmentos.cloud';
  const wsServer = server.replace(/^http/, 'ws');
  const email = process.env.TEST_EMAIL || 'user@example.com';
  const token = process.env.CORE_TOKEN || AccountService.generateTestAccount(email).coreToken;

  console.log('🎯 End-to-End LiveKit Audio Test');
  console.log('================================');
  console.log('Server:', server);
  console.log('Email:', email);
  console.log();

  const client = new MentraClient({
    email,
    serverUrl: `${wsServer}`,
    coreToken: token,
    behavior: { 
      disableStatusUpdates: true,
      useLiveKitAudio: true  // Enable LiveKit audio transport
    },
    debug: { logLevel: 'info', logWebSocketMessages: false },
  });

  let transcriptionReceived = false;

  client.on('connection_ack', (data) => {
    console.log('✅ CONNECTION_ACK received');
    if (data.livekit) {
      console.log('   LiveKit URL:', data.livekit.url);
      console.log('   Room:', data.livekit.roomName);
    }
  });

  client.on('livekit_connected', () => {
    console.log('✅ LiveKit connected to Go bridge');
  });

  // Listen for transcription events
  client.on('display_event', (event) => {
    if (event.packageName === APP_PACKAGE_NAME) {
      const text = event.layout.topText || event.layout.bottomText || '';
      if (text && text.trim()) {
        console.log('📝 TRANSCRIPTION:', text);
        transcriptionReceived = true;
      }
    }
  });

  client.on('error', (error) => {
    console.error('❌ Error:', error);
  });

  // Connect to server
  console.log('1️⃣  Connecting to server...');
  await client.connect();

  // Wait for LiveKit
  console.log('2️⃣  Waiting for LiveKit connection...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Install and start transcription app
  console.log('3️⃣  Setting up Live Captions app...');
  try { 
    await client.installApp(APP_PACKAGE_NAME); 
    console.log('   App installed');
  } catch (e) {
    console.log('   App already installed');
  }
  
  try { 
    await client.stopApp(APP_PACKAGE_NAME);
  } catch {}
  
  await client.startApp(APP_PACKAGE_NAME);
  console.log('   ✅ App started');

  // Send audio file with VAD signaling (lets cloud authorize and process speech)
  console.log('4️⃣  Sending audio file...');
  const wavPath = resolve(__dirname, '../audio/what-time-is-it-16khz.wav');

  if (!fs.existsSync(wavPath)) {
    console.error('❌ Audio file not found:', wavPath);
    process.exit(1);
  }

  // Stream via client helper which sets VAD on/off and streams at proper cadence
  await client.startSpeakingFromFile(wavPath, true);
  console.log('   ✅ Audio sent');

  // Wait for transcriptions
  console.log('5️⃣  Waiting for transcriptions...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Results
  console.log();
  console.log('📊 Results');
  console.log('==========');
  if (transcriptionReceived) {
    console.log('✅ Transcription received successfully!');
    console.log('✅ End-to-end LiveKit audio flow is working!');
  } else {
    console.log('⚠️  No transcriptions received');
    console.log('   This could mean:');
    console.log('   - The transcription service is not running');
    console.log('   - Audio is not flowing through LiveKit properly');
    console.log('   - The app is not subscribed to audio events');
  }

  await client.disconnect();
  process.exit(transcriptionReceived ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});