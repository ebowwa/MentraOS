#!/usr/bin/env bun
/**
 * Quick test to validate WAV file parsing and timing calculations
 */

import { resolve } from 'path';
import { readFileSync } from 'fs';

const AUDIO_FILE_PATH = resolve(__dirname, '../audio/good-morning-2033.wav');

// Simulate AudioManager WAV parsing
function validateWAVFile() {
  console.log('🔍 Validating WAV file:', AUDIO_FILE_PATH);
  
  try {
    const wavData = readFileSync(AUDIO_FILE_PATH);
    console.log(`📁 File size: ${wavData.length} bytes`);
    
    // Check RIFF header
    const riffHeader = wavData.toString('ascii', 0, 4);
    console.log(`📋 RIFF header: "${riffHeader}"`);
    
    if (riffHeader !== 'RIFF') {
      console.error('❌ Not a valid WAV file - missing RIFF header');
      return;
    }
    
    // Check WAVE format
    const waveFormat = wavData.toString('ascii', 8, 12);
    console.log(`🎵 WAVE format: "${waveFormat}"`);
    
    if (waveFormat !== 'WAVE') {
      console.error('❌ Not a valid WAV file - missing WAVE format');
      return;
    }
    
    // Find fmt chunk
    const fmtMarker = Buffer.from('fmt ');
    const fmtIndex = wavData.indexOf(fmtMarker);
    
    if (fmtIndex !== -1) {
      const channels = wavData.readUInt16LE(fmtIndex + 10);
      const sampleRate = wavData.readUInt32LE(fmtIndex + 12);
      const bitsPerSample = wavData.readUInt16LE(fmtIndex + 22);
      
      console.log(`🎛️  Channels: ${channels}`);
      console.log(`📡 Sample Rate: ${sampleRate}Hz`);
      console.log(`🔢 Bits per Sample: ${bitsPerSample}`);
      
      // Check if this matches AugmentOS expected format
      const expectedSampleRate = 16000;
      const expectedBits = 16;
      
      if (sampleRate !== expectedSampleRate) {
        console.warn(`⚠️  WARNING: Sample rate (${sampleRate}Hz) differs from expected (${expectedSampleRate}Hz)`);
        console.log('   This audio may need resampling for optimal transcription');
      } else {
        console.log('✅ Sample rate matches AugmentOS expectations');
      }
      
      if (bitsPerSample !== expectedBits) {
        console.warn(`⚠️  WARNING: Bit depth (${bitsPerSample}-bit) differs from expected (${expectedBits}-bit)`);
      } else {
        console.log('✅ Bit depth matches AugmentOS expectations');
      }
    }
    
    // Find data chunk
    const dataMarker = Buffer.from('data');
    const dataIndex = wavData.indexOf(dataMarker);
    
    if (dataIndex === -1) {
      console.error('❌ No data chunk found in WAV file');
      return;
    }
    
    const dataSize = wavData.readUInt32LE(dataIndex + 4);
    console.log(`📊 PCM data size: ${dataSize} bytes`);
    
    // Calculate duration and streaming parameters
    const sampleRate = 16000; // Our target sample rate
    const bytesPerSecond = sampleRate * 2; // 16-bit mono
    const durationSeconds = dataSize / bytesPerSecond;
    
    console.log(`⏰ Estimated duration: ${durationSeconds.toFixed(1)} seconds (${(durationSeconds/60).toFixed(1)} minutes)`);
    
    // Calculate streaming chunks
    const chunkSize = 1600; // 100ms at 16kHz
    const msPerChunk = (chunkSize / bytesPerSecond) * 1000;
    const totalChunks = Math.ceil(dataSize / chunkSize);
    
    console.log(`🔄 Streaming parameters:`);
    console.log(`   Chunk size: ${chunkSize} bytes`);
    console.log(`   Time per chunk: ${msPerChunk.toFixed(1)}ms`);
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Expected streaming time: ${(totalChunks * msPerChunk / 1000).toFixed(1)} seconds`);
    
    console.log('\n✅ WAV file validation complete!');
    
  } catch (error) {
    console.error('❌ Error validating WAV file:', error);
  }
}

// Run validation
validateWAVFile();