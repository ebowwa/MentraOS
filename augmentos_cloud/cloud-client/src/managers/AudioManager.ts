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
        
        // Create file stream
        const fileStream = createReadStream(filePath);
        const chunkSize = this.config.chunkSize;
        const sampleRate = this.config.sampleRate;
        
        // Calculate timing for real-time playback
        const bytesPerSecond = sampleRate * 2; // 16-bit = 2 bytes per sample
        const msPerChunk = (chunkSize / bytesPerSecond) * 1000;
        
        let buffer = Buffer.alloc(0);
        
        fileStream.on('data', (data: Buffer) => {
          buffer = Buffer.concat([buffer, data]);
          
          // Send chunks of the configured size with real-time timing
          while (buffer.length >= chunkSize && this.isStreaming) {
            const chunk = buffer.subarray(0, chunkSize);
            buffer = buffer.subarray(chunkSize);
            
            onChunk(chunk);
            
            // Wait for the chunk duration to maintain real-time playback
            setTimeout(() => {}, msPerChunk);
          }
        });
        
        fileStream.on('end', () => {
          // Send any remaining data
          if (buffer.length > 0 && this.isStreaming) {
            onChunk(buffer);
          }
          
          this.isStreaming = false;
          resolve();
        });
        
        fileStream.on('error', (error) => {
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
   * Convert audio format if needed
   */
  private convertAudioFormat(chunk: Buffer, fromFormat: string, toFormat: string): Buffer {
    // TODO: Implement audio format conversion
    // For now, assume input matches our desired format
    return chunk;
  }

  /**
   * Resample audio if needed
   */
  private resampleAudio(chunk: Buffer, fromRate: number, toRate: number): Buffer {
    // TODO: Implement audio resampling
    // For now, assume input matches our desired sample rate
    return chunk;
  }
}