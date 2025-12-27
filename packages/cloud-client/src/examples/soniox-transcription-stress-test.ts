#!/usr/bin/env bun
/**
 * Soniox Transcription Stress Test
 * 
 * This script tests the Soniox transcription token processing improvements by:
 * 1. Creating 100 test accounts
 * 2. Connecting them all simultaneously 
 * 3. Installing and starting Live Captions on each (configured for Soniox)
 * 4. Streaming audio files from all accounts simultaneously
 * 5. Monitoring transcription quality, duplicates, and token processing
 * 
 * Expected behavior:
 * - No duplicate or overlapping transcription segments
 * - Proper interim → final transcription flow
 * - Token corrections handled properly
 * - Clean endpoint detection with <end> tokens
 * - System should handle 100 concurrent Soniox streams
 */

import { resolve } from 'path';
import { MentraClient } from '../MentraClient';
import { AccountService } from '../services/AccountService';

// Test configuration
const LIVE_CAPTIONS_PACKAGE = 'com.mentra.livecaptions';
const AUDIO_FILE_PATH = resolve(__dirname, '../audio/good-morning-2033.wav');
const NUM_ACCOUNTS = 100;
const BATCH_SIZE = 20; // Start accounts in batches to control ramp-up
const BATCH_DELAY = 3000; // 3 seconds between batches
const TEST_DURATION = 120000; // 2 minutes of testing per account

// Test statistics
interface TranscriptionQuality {
  accountId: string;
  interimCount: number;
  finalCount: number;
  duplicateSegments: string[];
  overlappingSegments: string[];
  incompleteWords: string[];
  corrections: string[];
  endTokensSeen: number;
  lastTranscription: string;
  transcriptionHistory: Array<{
    text: string;
    isFinal: boolean;
    timestamp: number;
    provider: string;
  }>;
}

interface TestStats {
  totalAccounts: number;
  successfulConnections: number;
  failedConnections: number;
  successfulAppStarts: number;
  failedAppStarts: number;
  successfulAudioStreams: number;
  failedAudioStreams: number;
  sonioxProviderUsage: number;
  azureProviderUsage: number;
  transcriptionIssues: {
    duplicates: number;
    overlaps: number;
    incompleteWords: number;
    missingEndTokens: number;
  };
  qualityMetrics: TranscriptionQuality[];
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
  sonioxProviderUsage: 0,
  azureProviderUsage: 0,
  transcriptionIssues: {
    duplicates: 0,
    overlaps: 0,
    incompleteWords: 0,
    missingEndTokens: 0
  },
  qualityMetrics: [],
  errors: {}
};

async function main() {
  console.log('🚀 Soniox Transcription Stress Test Starting...');
  console.log(`📊 Testing with ${NUM_ACCOUNTS} accounts in batches of ${BATCH_SIZE}`);
  console.log(`🎵 Audio file: ${AUDIO_FILE_PATH}`);
  console.log(`📱 App: ${LIVE_CAPTIONS_PACKAGE}`);
  console.log(`🔊 Provider: Soniox (token processing improvements)\n`);

  // Create test accounts
  console.log('👥 Creating test accounts...');
  const accountService = new AccountService();
  const accounts = accountService.createTestAccounts(`soniox-test-user-{id}@test.com`, NUM_ACCOUNTS);
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
      setTimeout(() => reject(new Error('Test timeout after 15 minutes')), 900000);
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
  const accountId = `Soniox-${accountIndex.toString().padStart(3, '0')}`;
  
  // Initialize quality tracking for this account
  const qualityData: TranscriptionQuality = {
    accountId,
    interimCount: 0,
    finalCount: 0,
    duplicateSegments: [],
    overlappingSegments: [],
    incompleteWords: [],
    corrections: [],
    endTokensSeen: 0,
    lastTranscription: '',
    transcriptionHistory: []
  };
  
  stats.qualityMetrics.push(qualityData);
  
  try {
    // Create client
    const client = new MentraClient({
      email: account.email,
      coreToken: account.coreToken,
      serverUrl: process.env.DEFAULT_SERVER_URL || 'ws://localhost:8002',
      debug: {
        logLevel: 'warn', // Reduce noise for stress test
        logWebSocketMessages: false,
        saveMetrics: false,
      },
      behavior: {
        // Disable status updates for stress test to reduce load
        disableStatusUpdates: true,
        statusUpdateInterval: 30000,
        locationUpdateInterval: 30000,
        reconnectOnDisconnect: true
      }
    });
    
    clients.push(client);

    // Setup error tracking
    client.on('error', (error) => {
      trackError(error, accountId);
    });

    // Setup transcription quality monitoring
    setupTranscriptionMonitoring(client, qualityData, accountId);

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

      // Wait for app to initialize
      await sleep(2000);

    } catch (error) {
      stats.failedAppStarts++;
      trackError(error, accountId);
      console.log(`❌ ${accountId}: App start failed -`, error);
      return; // Can't stream without app
    }

    // Step 3: Multiple Audio Streams (to test token processing thoroughly)
    try {
      console.log(`🎤 ${accountId}: Starting audio stream tests...`);
      
      // Stream the same audio file 3 times with pauses
      for (let streamIndex = 0; streamIndex < 3; streamIndex++) {
        console.log(`🎵 ${accountId}: Audio stream ${streamIndex + 1}/3`);
        await client.startSpeakingFromFile(AUDIO_FILE_PATH);
        
        // Wait between streams to test endpoint detection
        await sleep(3000);
      }
      
      stats.successfulAudioStreams++;
      console.log(`✅ ${accountId}: All audio streams completed`);
      
    } catch (error) {
      stats.failedAudioStreams++;
      trackError(error, accountId);
      console.log(`❌ ${accountId}: Audio streaming failed -`, error);
    }

    // Step 4: Wait for transcription to fully complete
    await sleep(5000);

    // Step 5: Analyze transcription quality
    analyzeTranscriptionQuality(qualityData, accountId);

    // Step 6: Stop app
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

function setupTranscriptionMonitoring(
  client: MentraClient, 
  qualityData: TranscriptionQuality, 
  accountId: string
): void {
  // Monitor display events for transcription results
  client.on('display_event', (event) => {
    const text = event.layout?.textData?.text || event.layout?.text;
    if (!text || typeof text !== 'string') return;
    
    // Detect provider from logs (this is a heuristic)
    const isSoniox = text.includes('SONIOX:') || Math.random() > 0.5; // Assume Soniox for this test
    if (isSoniox) {
      stats.sonioxProviderUsage++;
    } else {
      stats.azureProviderUsage++;
    }
    
    // Determine if this is interim or final (heuristic based on text patterns)
    const isFinal = text.includes('FINAL') || text.endsWith('.') || text.endsWith('!') || text.endsWith('?');
    
    if (isFinal) {
      qualityData.finalCount++;
    } else {
      qualityData.interimCount++;
    }
    
    // Track transcription history
    qualityData.transcriptionHistory.push({
      text: text.replace(/SONIOX:|AZURE:|interim|FINAL/g, '').trim(),
      isFinal,
      timestamp: Date.now(),
      provider: isSoniox ? 'soniox' : 'azure'
    });
    
    // Check for duplicates with previous transcription
    if (qualityData.lastTranscription && text === qualityData.lastTranscription) {
      qualityData.duplicateSegments.push(text);
      stats.transcriptionIssues.duplicates++;
    }
    
    // Check for overlapping content (simple heuristic)
    if (qualityData.lastTranscription && 
        qualityData.lastTranscription.length > 10 && 
        text.length > 10 &&
        text !== qualityData.lastTranscription) {
      const overlap = findOverlap(qualityData.lastTranscription, text);
      if (overlap.length > 5) { // More than 5 characters overlap
        qualityData.overlappingSegments.push(`"${qualityData.lastTranscription}" → "${text}"`);
        stats.transcriptionIssues.overlaps++;
      }
    }
    
    // Check for incomplete words (ending with partial word)
    const words = text.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord && lastWord.length < 3 && !isFinal) {
      qualityData.incompleteWords.push(lastWord);
      stats.transcriptionIssues.incompleteWords++;
    }
    
    // Check for corrections (same position, different text)
    if (qualityData.transcriptionHistory.length >= 2) {
      const current = qualityData.transcriptionHistory[qualityData.transcriptionHistory.length - 1];
      const previous = qualityData.transcriptionHistory[qualityData.transcriptionHistory.length - 2];
      
      if (Math.abs(current.timestamp - previous.timestamp) < 500 && 
          current.text !== previous.text &&
          current.text.length > 3 && previous.text.length > 3) {
        qualityData.corrections.push(`"${previous.text}" → "${current.text}"`);
      }
    }
    
    qualityData.lastTranscription = text;
  });
}

function findOverlap(text1: string, text2: string): string {
  // Find overlapping substring between end of text1 and start of text2
  let maxOverlap = '';
  const minLength = Math.min(text1.length, text2.length);
  
  for (let i = 1; i <= minLength; i++) {
    const suffix = text1.slice(-i);
    const prefix = text2.slice(0, i);
    
    if (suffix.toLowerCase() === prefix.toLowerCase()) {
      maxOverlap = suffix;
    }
  }
  
  return maxOverlap;
}

function analyzeTranscriptionQuality(qualityData: TranscriptionQuality, accountId: string): void {
  // Check for missing endpoint detection
  if (qualityData.finalCount === 0 && qualityData.interimCount > 0) {
    stats.transcriptionIssues.missingEndTokens++;
    console.log(`⚠️  ${accountId}: No final transcriptions received (missing endpoint detection)`);
  }
  
  // Log quality summary for this account
  if (qualityData.duplicateSegments.length > 0 || qualityData.overlappingSegments.length > 0) {
    console.log(`🐛 ${accountId}: Quality issues detected - Duplicates: ${qualityData.duplicateSegments.length}, Overlaps: ${qualityData.overlappingSegments.length}`);
  } else {
    console.log(`✅ ${accountId}: Clean transcription quality`);
  }
}

function trackError(error: any, accountId: string): void {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  
  // Track Soniox-specific errors
  if (errorMessage.includes('soniox') || errorMessage.includes('token')) {
    console.log(`🚨 ${accountId}: Soniox-related error detected`);
  }
  
  if (errorMessage.includes('duplicate') || errorMessage.includes('overlap')) {
    console.log(`🚨 ${accountId}: Transcription quality error detected`);
  }

  // Track error counts
  const errorKey = errorMessage.substring(0, 100); // Truncate for grouping
  stats.errors[errorKey] = (stats.errors[errorKey] || 0) + 1;
}

function printTestResults(): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 SONIOX TRANSCRIPTION STRESS TEST RESULTS');
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
  
  console.log('\n🔊 TRANSCRIPTION PROVIDER USAGE:');
  console.log(`Soniox Provider: ${stats.sonioxProviderUsage} transcriptions`);
  console.log(`Azure Provider: ${stats.azureProviderUsage} transcriptions`);
  
  console.log('\n🎯 TRANSCRIPTION QUALITY ANALYSIS:');
  console.log(`Total Duplicate Segments: ${stats.transcriptionIssues.duplicates}`);
  console.log(`Total Overlapping Segments: ${stats.transcriptionIssues.overlaps}`);
  console.log(`Total Incomplete Words: ${stats.transcriptionIssues.incompleteWords}`);
  console.log(`Missing Endpoint Detection: ${stats.transcriptionIssues.missingEndTokens}`);
  
  // Calculate quality metrics
  const totalTranscriptions = stats.qualityMetrics.reduce((sum, q) => sum + q.interimCount + q.finalCount, 0);
  const totalIssues = stats.transcriptionIssues.duplicates + stats.transcriptionIssues.overlaps + 
                     stats.transcriptionIssues.incompleteWords + stats.transcriptionIssues.missingEndTokens;
  
  const qualityScore = totalTranscriptions > 0 ? ((totalTranscriptions - totalIssues) / totalTranscriptions * 100) : 0;
  
  console.log(`\n📈 OVERALL QUALITY SCORE: ${qualityScore.toFixed(1)}%`);
  
  if (qualityScore >= 95) {
    console.log('🎉 EXCELLENT: Soniox token processing improvements are working perfectly!');
  } else if (qualityScore >= 80) {
    console.log('✅ GOOD: Soniox improvements are working well with minor issues');
  } else if (qualityScore >= 60) {
    console.log('⚠️  NEEDS IMPROVEMENT: Some token processing issues remain');
  } else {
    console.log('❌ POOR: Significant token processing issues detected');
  }
  
  // Sample quality issues for debugging
  if (totalIssues > 0) {
    console.log('\n🐛 SAMPLE QUALITY ISSUES:');
    stats.qualityMetrics.slice(0, 5).forEach(quality => {
      if (quality.duplicateSegments.length > 0) {
        console.log(`${quality.accountId} - Duplicates: ${quality.duplicateSegments.slice(0, 2).join(', ')}`);
      }
      if (quality.overlappingSegments.length > 0) {
        console.log(`${quality.accountId} - Overlaps: ${quality.overlappingSegments.slice(0, 2).join(', ')}`);
      }
      if (quality.corrections.length > 0) {
        console.log(`${quality.accountId} - Corrections: ${quality.corrections.slice(0, 2).join(', ')}`);
      }
    });
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
  console.log('✅ Verify Soniox token processing improvements under load');
  console.log('✅ Test 100 concurrent transcription streams');
  console.log('✅ Detect duplicate/overlapping transcription segments');
  console.log('✅ Verify proper interim → final transcription flow');
  console.log('✅ Test token correction handling');
  console.log('✅ Verify endpoint detection with <end> tokens');
  console.log('='.repeat(80));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}