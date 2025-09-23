#!/usr/bin/env bun
/**
 * Azure Rate Limiting Quick Test (10 accounts)
 * 
 * Lighter version for quick testing of Azure rate limiting fixes.
 * Uses only 10 accounts for faster feedback during development.
 */

import { resolve } from 'path';
import { MentraClient } from '../MentraClient';
import { AccountService } from '../services/AccountService';

const LIVE_CAPTIONS_PACKAGE = 'com.mentra.livecaptions';
const AUDIO_FILE_PATH = resolve(__dirname, '../audio/good-morning-2033.wav');
const NUM_ACCOUNTS = 10; // Quick test with fewer accounts

async function main() {
  console.log('🔬 Azure Rate Limiting Quick Test (10 accounts)');
  console.log(`📱 App: ${LIVE_CAPTIONS_PACKAGE}`);
  console.log(`🎵 Audio: ${AUDIO_FILE_PATH}\n`);

  const accountService = new AccountService();
  const accounts = accountService.createTestAccounts('quick-test-{}@test.com', NUM_ACCOUNTS);
  const clients: MentraClient[] = [];

  try {
    // Start all accounts simultaneously (more aggressive than full test)
    const promises = accounts.map(async (account, index) => {
      const client = new MentraClient({
        email: account.email,
        coreToken: account.coreToken,
        serverUrl: process.env.DEFAULT_SERVER_URL || 'ws://localhost:8002',
        debug: { logLevel: 'info', logWebSocketMessages: false }
      });
      
      clients.push(client);
      
      try {
        console.log(`🔗 Account ${index + 1}: Connecting...`);
        await client.connect();
        
        console.log(`📱 Account ${index + 1}: Starting Live Captions...`);
        await client.installApp(LIVE_CAPTIONS_PACKAGE).catch(e => {}); // Ignore if exists
        await client.startApp(LIVE_CAPTIONS_PACKAGE);
        
        console.log(`🎤 Account ${index + 1}: Streaming audio...`);
        await client.startSpeakingFromFile(AUDIO_FILE_PATH);
        
        console.log(`✅ Account ${index + 1}: Completed successfully`);
        
      } catch (error) {
        console.log(`❌ Account ${index + 1}: Failed -`, error);
        
        // Check for specific error types
        const errorMsg = error?.toString() || '';
        if (errorMsg.includes('4429')) {
          console.log(`🚨 Account ${index + 1}: RATE LIMITING DETECTED!`);
        }
        if (errorMsg.includes('circuit breaker')) {
          console.log(`🔴 Account ${index + 1}: CIRCUIT BREAKER TRIGGERED!`);
        }
      }
    });

    await Promise.allSettled(promises);
    console.log('\n✅ Quick test completed!');

  } finally {
    console.log('\n🧹 Disconnecting clients...');
    await Promise.allSettled(clients.map(c => c.disconnect()));
  }
}

if (require.main === module) {
  main().catch(console.error);
}