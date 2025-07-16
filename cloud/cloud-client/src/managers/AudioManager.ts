/**
 * AudioManager - Handles audio streaming and VAD
 */

import { readFileSync, createReadStream } from 'fs';
import type { AudioConfig, AudioStream } from '../types';

export class AudioManager {
  private config: AudioConfig;
  private isStreaming = false;

  constructor(config: AudioConfig) {
    this.config = config;
  }

  /**
   * Stream audio file in real-time (respects file duration)
   */
  async streamAudioFile(filePath: string, onChunk: (chunk: Buffer) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.isStreaming = true;
        
        // Read entire file to handle WAV header properly
        const fileData = readFileSync(filePath);
        const pcmData = this.extractPCMFromWav(fileData);
        
        if (!pcmData) {
          reject(new Error('Failed to extract PCM data from WAV file'));
          return;
        }
        
        const chunkSize = this.config.chunkSize;
        const sampleRate = this.config.sampleRate;
        
        // Calculate timing for real-time playback
        const bytesPerSecond = sampleRate * 2; // 16-bit = 2 bytes per sample
        const msPerChunk = (chunkSize / bytesPerSecond) * 1000;
        
        console.log(`[AudioManager] Streaming ${pcmData.length} bytes of PCM data`);
        console.log(`[AudioManager] Chunk size: ${chunkSize} bytes, timing: ${msPerChunk.toFixed(1)}ms per chunk`);
        
        // Stream chunks with proper timing
        this.streamChunksWithTiming(pcmData, chunkSize, msPerChunk, onChunk)
          .then(() => {
            this.isStreaming = false;
            resolve();
          })
          .catch((error) => {
            this.isStreaming = false;
            reject(error);
          });
        
      } catch (error) {
        this.isStreaming = false;
        reject(error);
      }
    });
  }

  /**
   * Stream chunks with proper real-time timing
   */
  private async streamChunksWithTiming(
    data: Buffer, 
    chunkSize: number, 
    msPerChunk: number, 
    onChunk: (chunk: Buffer) => void
  ): Promise<void> {
    let offset = 0;
    let chunkCount = 0;
    
    while (offset < data.length && this.isStreaming) {
      const chunk = data.subarray(offset, Math.min(offset + chunkSize, data.length));
      
      onChunk(chunk);
      chunkCount++;
      
      if (chunkCount % 10 === 0) {
        console.log(`[AudioManager] Sent chunk ${chunkCount}, ${offset}/${data.length} bytes`);
      }
      
      offset += chunkSize;
      
      // Wait for the chunk duration to maintain real-time playback
      if (offset < data.length) {
        await this.sleep(msPerChunk);
      }
    }
    
    console.log(`[AudioManager] Finished streaming ${chunkCount} chunks`);
  }

  /**
   * Extract PCM data from WAV file
   */
  private extractPCMFromWav(wavData: Buffer): Buffer | null {
    try {
      // Check for RIFF header
      if (wavData.toString('ascii', 0, 4) !== 'RIFF') {
        console.error('[AudioManager] Not a valid WAV file - missing RIFF header');
        return null;
      }
      
      // Check for WAVE format
      if (wavData.toString('ascii', 8, 12) !== 'WAVE') {
        console.error('[AudioManager] Not a valid WAV file - missing WAVE format');
        return null;
      }
      
      // Find fmt chunk for audio format info
      const fmtMarker = Buffer.from('fmt ');
      const fmtIndex = wavData.indexOf(fmtMarker);
      
      if (fmtIndex !== -1) {
        const channels = wavData.readUInt16LE(fmtIndex + 10);
        const sampleRate = wavData.readUInt32LE(fmtIndex + 12);
        const bitsPerSample = wavData.readUInt16LE(fmtIndex + 22);
        
        console.log(`[AudioManager] WAV Format: ${channels} channels, ${sampleRate}Hz, ${bitsPerSample}-bit`);
        
        if (sampleRate !== this.config.sampleRate) {
          console.warn(`[AudioManager] WARNING: WAV sample rate (${sampleRate}Hz) differs from config (${this.config.sampleRate}Hz)`);
        }
      }
      
      // Find data chunk
      const dataMarker = Buffer.from('data');
      const dataIndex = wavData.indexOf(dataMarker);
      
      if (dataIndex === -1) {
        console.error('[AudioManager] No data chunk found in WAV file');
        return null;
      }
      
      // Data chunk size is 4 bytes after 'data' marker
      const dataSize = wavData.readUInt32LE(dataIndex + 4);
      const pcmStart = dataIndex + 8;
      const pcmData = wavData.subarray(pcmStart, pcmStart + dataSize);
      
      console.log(`[AudioManager] Extracted ${pcmData.length} bytes of PCM data from WAV file`);
      
      // Calculate actual duration based on WAV file format
      let actualSampleRate = this.config.sampleRate;
      let actualChannels = 1;
      
      if (fmtIndex !== -1) {
        actualChannels = wavData.readUInt16LE(fmtIndex + 10);
        actualSampleRate = wavData.readUInt32LE(fmtIndex + 12);
      }
      
      const actualBytesPerSecond = actualSampleRate * 2 * actualChannels; // 16-bit
      const actualDurationSeconds = pcmData.length / actualBytesPerSecond;
      console.log(`[AudioManager] Actual duration: ${actualDurationSeconds.toFixed(1)} seconds (${(actualDurationSeconds/60).toFixed(1)} minutes)`);
      
      // Convert to our target format if needed
      const convertedPCM = this.convertAudioToTargetFormat(pcmData, actualSampleRate, actualChannels);
      
      // Calculate target duration after conversion
      const targetBytesPerSecond = this.config.sampleRate * 2; // 16-bit mono
      const targetDurationSeconds = convertedPCM.length / targetBytesPerSecond;
      console.log(`[AudioManager] Target duration after conversion: ${targetDurationSeconds.toFixed(1)} seconds`);
      
      return convertedPCM;
      
    } catch (error) {
      console.error('[AudioManager] Error parsing WAV file:', error);
      return null;
    }
  }

  /**
   * Promise-based sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stream audio from any stream source (microphone, etc.)
   */
  streamFromSource(stream: AudioStream, onChunk: (chunk: Buffer) => void): void {
    this.isStreaming = true;
    
    stream.on('data', (chunk: Buffer) => {
      if (this.isStreaming) {
        // Process chunk to match our audio config
        const processedChunk = this.processAudioChunk(chunk);
        onChunk(processedChunk);
      }
    });
    
    stream.on('end', () => {
      this.isStreaming = false;
    });
    
    stream.on('error', (error) => {
      this.isStreaming = false;
      console.error('[AudioManager] Stream error:', error);
    });
  }

  /**
   * Stop any active audio streaming
   */
  stopSpeaking(): void {
    this.isStreaming = false;
  }

  /**
   * Check if currently streaming audio
   */
  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  //===========================================================
  // Private Methods
  //===========================================================

  private processAudioChunk(chunk: Buffer): Buffer {
    // For now, just return the chunk as-is
    // TODO: Add format conversion, resampling, etc. if needed
    
    // Ensure chunk size matches config
    if (chunk.length > this.config.chunkSize) {
      return chunk.subarray(0, this.config.chunkSize);
    }
    
    return chunk;
  }

  /**
   * Convert audio to target format (16kHz mono)
   */
  private convertAudioToTargetFormat(pcmData: Buffer, sourceSampleRate: number, sourceChannels: number): Buffer {
    console.log(`[AudioManager] Converting from ${sourceSampleRate}Hz ${sourceChannels}ch to ${this.config.sampleRate}Hz 1ch`);
    
    let convertedData = pcmData;
    
    // Step 1: Convert from stereo to mono if needed
    if (sourceChannels === 2) {
      convertedData = this.stereoToMono(convertedData);
      console.log(`[AudioManager] Converted stereo to mono: ${convertedData.length} bytes`);
    }
    
    // Step 2: Resample if needed
    if (sourceSampleRate !== this.config.sampleRate) {
      convertedData = this.resample(convertedData, sourceSampleRate, this.config.sampleRate);
      console.log(`[AudioManager] Resampled ${sourceSampleRate}Hz to ${this.config.sampleRate}Hz: ${convertedData.length} bytes`);
    }
    
    return convertedData;
  }

  /**
   * Convert stereo to mono by averaging left and right channels
   */
  private stereoToMono(stereoData: Buffer): Buffer {
    const monoLength = stereoData.length / 2;
    const monoData = Buffer.allocUnsafe(monoLength);
    
    for (let i = 0; i < monoLength; i += 2) {
      // Read left and right 16-bit samples
      const left = stereoData.readInt16LE(i * 2);
      const right = stereoData.readInt16LE(i * 2 + 2);
      
      // Average the channels
      const mono = Math.round((left + right) / 2);
      
      // Write mono sample
      monoData.writeInt16LE(mono, i);
    }
    
    return monoData;
  }

  /**
   * Simple linear interpolation resampling
   */
  private resample(data: Buffer, fromRate: number, toRate: number): Buffer {
    if (fromRate === toRate) return data;
    
    const ratio = fromRate / toRate;
    const samplesIn = data.length / 2; // 16-bit samples
    const samplesOut = Math.round(samplesIn / ratio);
    const resampledData = Buffer.allocUnsafe(samplesOut * 2);
    
    for (let i = 0; i < samplesOut; i++) {
      const sourceIndex = i * ratio;
      const index1 = Math.floor(sourceIndex) * 2;
      const index2 = Math.min(index1 + 2, data.length - 2);
      
      if (index1 >= data.length - 1) {
        // Use last sample
        const sample = data.readInt16LE(data.length - 2);
        resampledData.writeInt16LE(sample, i * 2);
      } else if (index1 === index2) {
        // No interpolation needed
        const sample = data.readInt16LE(index1);
        resampledData.writeInt16LE(sample, i * 2);
      } else {
        // Linear interpolation
        const sample1 = data.readInt16LE(index1);
        const sample2 = data.readInt16LE(index2);
        const fraction = sourceIndex - Math.floor(sourceIndex);
        const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
        resampledData.writeInt16LE(interpolated, i * 2);
      }
    }
    
    return resampledData;
  }
}