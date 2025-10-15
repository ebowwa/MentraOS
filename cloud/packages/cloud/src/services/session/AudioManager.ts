/**
 * @fileoverview AudioManager manages audio processing within a user session.
 * It encapsulates all audio-related functionality that was previously
 * handled in the session service.
 *
 * This follows the pattern used by other managers like MicrophoneManager and DisplayManager.
 */

import WebSocket from "ws";
import { StreamType } from "@mentra/sdk";
import { Logger } from "pino";
// import subscriptionService from "./subscription.service";
// import { createLC3Service } from "../lc3/lc3.service";
import { AudioWriter } from "../debug/audio-writer";
import UserSession from "./UserSession";
import fs from "fs";
import { execSync } from "child_process";

/**
 * Represents a sequenced audio chunk with metadata
 */
export interface SequencedAudioChunk {
  sequenceNumber: number;
  timestamp: number;
  data: ArrayBufferLike;
  isLC3: boolean;
  receivedAt: number;
}

/**
 * Represents an ordered buffer for processing audio chunks
 */
export interface OrderedAudioBuffer {
  chunks: SequencedAudioChunk[];
  lastProcessedSequence: number;
  processingInProgress: boolean;
  expectedNextSequence: number;
  bufferSizeLimit: number;
  bufferTimeWindowMs: number;
  bufferProcessingInterval: NodeJS.Timeout | null;
}

/**
 * Manages audio data processing, buffering, and relaying
 * for a user session
 */
export class AudioManager {
  private userSession: UserSession;
  private logger: Logger;

  // LC3 decoding service
  private lc3Service?: any;

  // Audio debugging writer
  private audioWriter?: AudioWriter;

  // Buffer for recent audio (last 10 seconds)
  private recentAudioBuffer: { data: ArrayBufferLike; timestamp: number }[] =
    [];

  // Ordered buffer for sequenced audio chunks
  // private orderedBuffer: OrderedAudioBuffer;

  // Configuration
  private readonly LOG_AUDIO = false;
  private readonly DEBUG_AUDIO = false;
  private readonly IS_LC3 = false;

  // Lightweight telemetry for PCM ingestion
  private processedFrameCount = 0;
  private lastLogAt = 0;
  // Carry-over byte to keep PCM16 even-length between frames
  private pcmRemainder: Buffer | null = null;

  // Audio capture for debugging
  private captureEnabled = process.env.DEBUG_CAPTURE_AUDIO === "true";
  private capturedChunks: Buffer[] = [];
  private captureStartTime = 0;
  private captureDuration = 5000; // 5 seconds

  constructor(userSession: UserSession) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: "AudioManager" });
    this.logger.info("AudioManager initialized");
  }

  /**
   * Process incoming audio data
   *
   * @param audioData The audio data to process
   * @param isLC3 Whether the audio is LC3 encoded
   * @returns Processed audio data
   */
  processAudioData(audioData: ArrayBuffer | any) {
    try {
      // Update the last audio timestamp
      this.userSession.lastAudioTimestamp = Date.now();

      // Send to transcription and translation services
      if (audioData) {
        // Normalize to Buffer and enforce even-length PCM16 by carrying a remainder byte
        let buf: Buffer | null = null;
        if (typeof Buffer !== "undefined" && Buffer.isBuffer(audioData)) {
          buf = audioData as Buffer;
        } else if (audioData instanceof ArrayBuffer) {
          buf = Buffer.from(audioData as ArrayBuffer);
        } else if (ArrayBuffer.isView(audioData)) {
          const view = audioData as ArrayBufferView;
          buf = Buffer.from(
            view.buffer,
            (view as any).byteOffset || 0,
            (view as any).byteLength || view.byteLength,
          );
        }

        if (!buf) {
          return undefined;
        }

        if (this.pcmRemainder && this.pcmRemainder.length > 0) {
          buf = Buffer.concat([this.pcmRemainder, buf]);
          this.pcmRemainder = null;
        }
        if ((buf.length & 1) !== 0) {
          // Keep last byte for next frame to maintain PCM16 alignment
          this.pcmRemainder = buf.subarray(buf.length - 1);
          buf = buf.subarray(0, buf.length - 1);
        }
        if (buf.length === 0) {
          return undefined;
        }
        // Telemetry: log every 100 frames to avoid noise
        this.processedFrameCount++;
        if (this.processedFrameCount % 100 === 0) {
          const now = Date.now();
          const dt = this.lastLogAt ? now - this.lastLogAt : 0;
          this.lastLogAt = now;
          this.logger.debug(
            {
              feature: "livekit",
              frames: this.processedFrameCount,
              bytes: buf.length,
              msSinceLast: dt,
              head10: Array.from(buf.subarray(0, Math.min(10, buf.length))),
            },
            "AudioManager received PCM chunk",
          );
        }

        // Capture audio if enabled
        if (this.captureEnabled) {
          this.captureAudio(buf);
        }

        // Relay to Apps if there are subscribers
        this.relayAudioToApps(buf);

        // Feed to TranscriptionManager
        this.userSession.transcriptionManager.feedAudio(buf);

        // Feed to TranslationManager (separate from transcription)
        this.userSession.translationManager.feedAudio(buf);

        // Notify MicrophoneManager that we received audio
        this.userSession.microphoneManager.onAudioReceived();
      }
      return audioData;
    } catch (error) {
      this.logger.error(error, `Error processing audio data`);
      return undefined;
    }
  }

  /**
   * Initialize audio writer if needed
   */
  // private initializeAudioWriterIfNeeded(): void {
  //   if (this.DEBUG_AUDIO && !this.audioWriter) {
  //     this.audioWriter = new AudioWriter(this.userSession.userId);
  //   }
  // }

  private logAudioChunkCount = 0;
  /**
   * Relay audio data to Apps
   *
   * @param audioData Audio data to relay
   */
  private relayAudioToApps(audioData: ArrayBuffer | Buffer): void {
    try {
      // Get subscribers using subscriptionService instead of subscriptionManager
      const subscribedPackageNames =
        this.userSession.subscriptionManager.getSubscribedApps(
          StreamType.AUDIO_CHUNK,
        );
      // Skip if no subscribers
      if (subscribedPackageNames.length === 0) {
        if (this.logAudioChunkCount % 500 === 0) {
          this.logger.debug(
            { feature: "livekit" },
            "AUDIO_CHUNK: no subscribed apps",
          );
        }
        this.logAudioChunkCount++;
        return;
      }
      const bytes =
        typeof Buffer !== "undefined" && Buffer.isBuffer(audioData)
          ? (audioData as Buffer).length
          : (audioData as ArrayBuffer).byteLength;

      if (this.logAudioChunkCount % 500 === 0) {
        this.logger.debug(
          { feature: "livekit", bytes, subscribers: subscribedPackageNames },
          "AUDIO_CHUNK: relaying to apps",
        );
      }

      // Send to each subscriber
      for (const packageName of subscribedPackageNames) {
        const connection = this.userSession.appWebsockets.get(packageName);

        if (connection && connection.readyState === WebSocket.OPEN) {
          try {
            if (this.logAudioChunkCount % 500 === 0) {
              this.logger.debug(
                { feature: "livekit", packageName, bytes },
                "AUDIO_CHUNK: sending to app",
              );
            }

            // Node ws supports Buffer; ensure we send Buffer for efficiency
            if (typeof Buffer !== "undefined" && Buffer.isBuffer(audioData)) {
              connection.send(audioData);
            } else {
              connection.send(Buffer.from(audioData as ArrayBuffer));
            }

            if (this.logAudioChunkCount % 500 === 0) {
              this.logger.debug(
                { feature: "livekit", packageName, bytes },
                "AUDIO_CHUNK: sent to app",
              );
            }
          } catch (sendError) {
            if (this.logAudioChunkCount % 500 === 0) {
              this.logger.error(
                sendError,
                `Error sending audio to ${packageName}:`,
              );
            }
          }
        }
      }
      this.logAudioChunkCount++;
    } catch (error) {
      this.logger.error(error, `Error relaying audio:`);
    }
  }

  /**
   * Capture audio for debugging
   */
  private captureAudio(buf: Buffer): void {
    if (!this.captureEnabled) return;

    // Start capture timer on first chunk
    if (this.capturedChunks.length === 0) {
      this.captureStartTime = Date.now();
      this.logger.info("Started audio capture (5 seconds)");
    }

    // Check if we've captured enough
    const elapsed = Date.now() - this.captureStartTime;
    if (elapsed > this.captureDuration) {
      this.saveCapturedAudio();
      this.captureEnabled = false;
      return;
    }

    // Store chunk
    this.capturedChunks.push(Buffer.from(buf));
  }

  /**
   * Save captured audio to file
   */
  private saveCapturedAudio(): void {
    try {
      const userId = this.userSession.userId.replace(/[^a-zA-Z0-9]/g, "-");
      const rawPath = `/tmp/audio-${userId}.raw`;
      const wavPath = `/tmp/audio-${userId}.wav`;

      // Concatenate all chunks
      const allAudio = Buffer.concat(this.capturedChunks);

      // Save raw PCM
      fs.writeFileSync(rawPath, allAudio);

      this.logger.info({ rawPath, bytes: allAudio.length }, "Saved raw audio");

      // Convert to WAV
      try {
        execSync(
          `ffmpeg -f s16le -ar 16000 -ac 1 -i ${rawPath} ${wavPath} -y 2>/dev/null`,
        );
        this.logger.info({ wavPath }, "Created WAV file");
        console.log(`\n${"=".repeat(60)}`);
        console.log(`AUDIO SAVED: ${wavPath}`);
        console.log(
          `Run: docker cp $(docker ps -q --filter ancestor=dev-cloud):/tmp/audio-${userId}.wav ./`,
        );
        console.log(`${"=".repeat(60)}\n`);
      } catch {
        this.logger.warn("ffmpeg not available - only raw file saved");
      }

      this.capturedChunks = [];
    } catch (error) {
      this.logger.error({ error }, "Failed to save captured audio");
    }
  }

  /**
   * Get recent audio buffer
   *
   * @returns Recent audio buffer
   */
  getRecentAudioBuffer(): { data: ArrayBufferLike; timestamp: number }[] {
    return [...this.recentAudioBuffer]; // Return a copy
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    try {
      this.logger.info("Disposing AudioManager");

      // Clean up LC3 service
      if (this.lc3Service) {
        this.logger.info(`🧹 Cleaning up LC3 service`);
        this.lc3Service.cleanup();
        this.lc3Service = undefined;
      }

      // Clear buffers
      this.recentAudioBuffer = [];

      // Clean up audio writer
      if (this.audioWriter) {
        // Audio writer doesn't have explicit cleanup
        this.audioWriter = undefined;
      }
    } catch (error) {
      this.logger.error(error, `Error disposing AudioManager:`);
    }
  }
}

export default AudioManager;
