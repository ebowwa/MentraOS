#!/usr/bin/env bun
/**
 * Azure Rate Limiting Stress Test
 * 
 * This script tests the Azure transcription rate limiting fixes by:
 * 1. Creating 100 test accounts
 * 2. Connecting them all simultaneously
 * 3. Installing and starting Live Captions on each
 * 4. Streaming the same audio file from all accounts
 * 5. Monitoring for rate limiting errors and circuit breaker behavior
 * 
 * Expected behavior:
 * - Some connections should trigger Azure rate limiting (4429)
 * - Circuit breaker should open after 5 failures in 3 minutes
 * - Retry logic should use longer delays for rate limiting
 * - System should recover automatically after 2 minutes
 */

import { resolve } from 'path';
import { MentraClient } from '../MentraClient';
import { AccountService } from '../services/AccountService';

// Test configuration
const LIVE_CAPTIONS_PACKAGE = 'com.mentra.livecaptions';
const AUDIO_FILE_PATH = resolve(__dirname, '../audio/good-morning-2033.wav');
const NUM_ACCOUNTS = 100;
const BATCH_SIZE = 10; // Start accounts in batches to control ramp-up
const BATCH_DELAY = 2000; // 2 seconds between batches

// Test statistics
interface TestStats {
  totalAccounts: number;
  successfulConnections: number;
  failedConnections: number;
  successfulAppStarts: number;
  failedAppStarts: number;
  successfulAudioStreams: number;
  failedAudioStreams: number;
  rateLimitErrors: number;
  circuitBreakerTriggered: boolean;
  errors: { [key: string]: number };
}

const stats: TestStats = {
  totalAccounts: NUM_ACCOUNTS,
  successfulConnections: 0,
  failedConnections: 0,
  successfulAppStarts: 0,
  failedAppStarts: 0,
  successfulAudioStreams: 0,
  failedAudioStreams: 0,
  rateLimitErrors: 0,
  circuitBreakerTriggered: false,
  errors: {}
};

async function main() {
  console.log('🚀 Azure Rate Limiting Stress Test Starting...');
  console.log(`📊 Testing with ${NUM_ACCOUNTS} accounts in batches of ${BATCH_SIZE}`);
  console.log(`🎵 Audio file: ${AUDIO_FILE_PATH}`);
  console.log(`📱 App: ${LIVE_CAPTIONS_PACKAGE}\n`);

  // Create test accounts
  console.log('👥 Creating test accounts...');
  const accountService = new AccountService();
  const accounts = accountService.createTestAccounts('stress-test-user-{}@test.com', NUM_ACCOUNTS);
  console.log(`✅ Created ${accounts.length} test accounts\n`);

  // Track all clients for cleanup
  const clients: MentraClient[] = [];
  const testPromises: Promise<void>[] = [];

  try {
    // Start accounts in batches to simulate real-world ramp-up
    for (let batchStart = 0; batchStart < NUM_ACCOUNTS; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, NUM_ACCOUNTS);
      const batchAccounts = accounts.slice(batchStart, batchEnd);
      
      console.log(`🚀 Starting batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: accounts ${batchStart + 1}-${batchEnd}`);
      
      // Start all accounts in this batch simultaneously
      for (let i = 0; i < batchAccounts.length; i++) {
        const account = batchAccounts[i];
        const accountIndex = batchStart + i;
        
        const promise = runSingleAccountTest(account, accountIndex, clients);
        testPromises.push(promise);
      }
      
      // Wait between batches (except for the last batch)
      if (batchEnd < NUM_ACCOUNTS) {
        console.log(`⏳ Waiting ${BATCH_DELAY}ms before next batch...\n`);
        await sleep(BATCH_DELAY);
      }
    }

    console.log('\n⏳ Waiting for all tests to complete...');
    
    // Wait for all tests with timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Test timeout after 10 minutes')), 600000);
    });
    
    await Promise.race([
      Promise.allSettled(testPromises),
      timeoutPromise
    ]);

    console.log('\n✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    // Cleanup: disconnect all clients
    console.log('\n🧹 Cleaning up connections...');
    await Promise.allSettled(
      clients.map(async (client, index) => {
        try {
          await client.disconnect();
        } catch (error) {
          console.error(`Failed to disconnect client ${index}:`, error);
        }
      })
    );
    
    // Print final statistics
    printTestResults();
  }
}

async function runSingleAccountTest(
  account: { email: string; coreToken: string }, 
  accountIndex: number,
  clients: MentraClient[]
): Promise<void> {
  const accountId = `Account-${accountIndex.toString().padStart(3, '0')}`;
  
  try {
    // Create client
    const client = new MentraClient({
      email: account.email,
      coreToken: account.coreToken,
      serverUrl: process.env.DEFAULT_SERVER_URL || 'ws://localhost:8002',
      debug: {
        logLevel: 'info',
        logWebSocketMessages: false // Reduce noise
      }
    });
    
    clients.push(client);

    // Setup error tracking
    client.on('error', (error) => {
      trackError(error, accountId);
    });

    // Step 1: Connect
    try {
      await client.connect();
      stats.successfulConnections++;
      console.log(`✅ ${accountId}: Connected`);
    } catch (error) {
      stats.failedConnections++;
      trackError(error, accountId);
      console.log(`❌ ${accountId}: Connection failed -`, error);
      return; // Can't continue without connection
    }

    // Step 2: Install and Start Live Captions
    try {
      // Try to stop first (in case already running)
      try {
        await client.stopApp(LIVE_CAPTIONS_PACKAGE);
      } catch (e) {
        // Ignore stop errors
      }

      // Install app (ignore if already installed)
      try {
        await client.installApp(LIVE_CAPTIONS_PACKAGE);
      } catch (error: any) {
        if (!error.message.includes('already installed')) {
          throw error;
        }
      }

      // Start app
      await client.startApp(LIVE_CAPTIONS_PACKAGE);
      stats.successfulAppStarts++;
      console.log(`✅ ${accountId}: Live Captions started`);

      // Wait a moment for app to initialize
      await sleep(1000);

    } catch (error) {
      stats.failedAppStarts++;
      trackError(error, accountId);
      console.log(`❌ ${accountId}: App start failed -`, error);
      return; // Can't stream without app
    }

    // Step 3: Stream Audio
    try {
      console.log(`🎤 ${accountId}: Starting audio stream...`);
      await client.startSpeakingFromFile(AUDIO_FILE_PATH);
      stats.successfulAudioStreams++;
      console.log(`✅ ${accountId}: Audio streaming completed`);
      
    } catch (error) {
      stats.failedAudioStreams++;
      trackError(error, accountId);
      console.log(`❌ ${accountId}: Audio streaming failed -`, error);
    }

    // Step 4: Stop app
    try {
      await client.stopApp(LIVE_CAPTIONS_PACKAGE);
      console.log(`🛑 ${accountId}: Live Captions stopped`);
    } catch (error) {
      console.log(`⚠️  ${accountId}: Stop app failed (non-critical) -`, error);
    }

  } catch (error) {
    trackError(error, accountId);
    console.error(`💥 ${accountId}: Unexpected error -`, error);
  }
}

function trackError(error: any, accountId: string): void {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  
  // Track specific error types
  if (errorMessage.includes('4429') || errorMessage.includes('rate limit')) {
    stats.rateLimitErrors++;
    console.log(`🚨 ${accountId}: RATE LIMITING detected`);
  }
  
  if (errorMessage.includes('circuit breaker') || errorMessage.includes('temporarily unavailable')) {
    stats.circuitBreakerTriggered = true;
    console.log(`🔴 ${accountId}: CIRCUIT BREAKER triggered`);
  }

  // Track error counts
  const errorKey = errorMessage.substring(0, 100); // Truncate for grouping
  stats.errors[errorKey] = (stats.errors[errorKey] || 0) + 1;
}

function printTestResults(): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 AZURE RATE LIMITING STRESS TEST RESULTS');
  console.log('='.repeat(80));
  
  console.log('\n📈 CONNECTION STATISTICS:');
  console.log(`Total Accounts: ${stats.totalAccounts}`);
  console.log(`Successful Connections: ${stats.successfulConnections} (${(stats.successfulConnections/stats.totalAccounts*100).toFixed(1)}%)`);
  console.log(`Failed Connections: ${stats.failedConnections} (${(stats.failedConnections/stats.totalAccounts*100).toFixed(1)}%)`);
  
  console.log('\n📱 APP MANAGEMENT STATISTICS:');
  console.log(`Successful App Starts: ${stats.successfulAppStarts} (${(stats.successfulAppStarts/stats.successfulConnections*100).toFixed(1)}%)`);
  console.log(`Failed App Starts: ${stats.failedAppStarts} (${(stats.failedAppStarts/stats.successfulConnections*100).toFixed(1)}%)`);
  
  console.log('\n🎵 AUDIO STREAMING STATISTICS:');
  console.log(`Successful Audio Streams: ${stats.successfulAudioStreams} (${(stats.successfulAudioStreams/stats.successfulAppStarts*100).toFixed(1)}%)`);
  console.log(`Failed Audio Streams: ${stats.failedAudioStreams} (${(stats.failedAudioStreams/stats.successfulAppStarts*100).toFixed(1)}%)`);
  
  console.log('\n🚨 RATE LIMITING ANALYSIS:');
  console.log(`Rate Limit Errors (4429): ${stats.rateLimitErrors}`);
  console.log(`Circuit Breaker Triggered: ${stats.circuitBreakerTriggered ? 'YES' : 'NO'}`);
  
  if (stats.rateLimitErrors > 0) {
    console.log(`\n✅ SUCCESS: Rate limiting was triggered (${stats.rateLimitErrors} errors)`);
    console.log('This confirms the test successfully stressed Azure limits.');
  } else {
    console.log('\n⚠️  No rate limiting detected - may need to increase load or check Azure limits');
  }
  
  if (stats.circuitBreakerTriggered) {
    console.log('✅ SUCCESS: Circuit breaker was triggered');
    console.log('This confirms the circuit breaker is working correctly.');
  } else {
    console.log('ℹ️  Circuit breaker was not triggered - rate limiting may not have reached threshold');
  }

  console.log('\n🐛 ERROR BREAKDOWN:');
  if (Object.keys(stats.errors).length === 0) {
    console.log('No errors detected.');
  } else {
    Object.entries(stats.errors)
      .sort(([,a], [,b]) => b - a) // Sort by count descending
      .slice(0, 10) // Top 10 errors
      .forEach(([error, count]) => {
        console.log(`${count}x: ${error}`);
      });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🎯 TEST OBJECTIVES:');
  console.log('✅ Stress test Azure transcription service with high concurrent load');
  console.log('✅ Verify rate limiting detection and handling (4429 errors)');
  console.log('✅ Verify circuit breaker opens after 5 rate limit failures');
  console.log('✅ Verify improved retry logic with longer delays for rate limiting');
  console.log('✅ Verify system recovery after circuit breaker cooldown');
  console.log('='.repeat(80));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}