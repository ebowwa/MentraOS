import { MentraClient } from '../MentraClient';
import { AccountService } from '../services/AccountService';
import { resolve } from 'path';

// const TRANSLATION_PACKAGE_NAME = 'com.mentra.translation';
const APP_PACKAGE_NAME = 'isaiah.augmentos.livecaptions';

async function main() {
  // Defaults to public ngrok tunnel for cloud
  const server = process.env.SERVER_URL || 'https://isaiah.augmentos.cloud';
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

  client.on('livekit_info', (info) => {
    console.log('[Example] Received LiveKit info:', JSON.stringify(info, null, 2));
  });

  // Add error handling for LiveKit
  client.on('error', (error) => {
    console.error('[Example] Client error:', error);
  });

  await client.connect();

  // Ensure Live Captions is installed and running
  try { await client.installApp(APP_PACKAGE_NAME); } catch {}
  try { await client.stopApp(APP_PACKAGE_NAME); } catch {}
  await client.startApp(APP_PACKAGE_NAME);

  // Enable LiveKit as audio transport and use existing speak API
  const wavPath = resolve(__dirname, '../audio/good-morning-2033.wav');
  client.enableLiveKit({ autoInitOnInfo: true, preferredSampleRate: 48000, useForAudio: true });
  
  console.log('[Example] Requesting LiveKit init...');
  client.requestLiveKitInit('publish');
  
  // Wait for LiveKit to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Use existing speak flow (VAD + streaming) which now routes audio via LiveKit
  await client.startSpeakingFromFile(wavPath);

  // The Live Captions app will emit transcription display events as they arrive
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
