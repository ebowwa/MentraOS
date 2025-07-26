/**
 * 🔊 Audio Module
 *
 * Audio functionality for App Sessions.
 * Handles audio playback on connected glasses.
 */

import {
  AudioPlayRequest,
  AudioPlayResponse,
  AudioStopRequest,
  AppToCloudMessageType,
} from "../../../types";
import { Logger } from "pino";

/**
 * Options for audio playback
 */
export interface AudioPlayOptions {
  /** URL to audio file for download and play */
  audioUrl: string;
  /** Volume level 0.0-1.0, defaults to 1.0 */
  volume?: number;
  /** Whether to stop other audio playback, defaults to true */
  stopOtherAudio?: boolean;
}

/**
 * Options for text-to-speech
 */
export interface SpeakOptions {
  /** Voice ID to use (optional, defaults to server's ELEVENLABS_DEFAULT_VOICE_ID) */
  voice_id?: string;
  /** Model ID to use (optional, defaults to eleven_flash_v2_5) */
  model_id?: string;
  /** Voice settings object (optional) */
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    speed?: number;
  };
  /** Volume level 0.0-1.0, defaults to 1.0 */
  volume?: number;
}

/**
 * Result of audio playback attempt
 */
export interface AudioPlayResult {
  /** Whether the audio playback was successful */
  success: boolean;
  /** Error message if playback failed */
  error?: string;
  /** Duration of the audio file in seconds (if available) */
  duration?: number;
}

/**
 * 🔊 Audio Module Implementation
 *
 * Audio management for App Sessions.
 * Provides methods for:
 * - 🎵 Playing audio on glasses
 * - ⏹️ Stopping audio playback
 * - 🔍 Monitoring audio request status
 * - 🧹 Cleanup and cancellation
 *
 * @example
 * ```typescript
 * // Play audio
 * const result = await session.audio.playAudio({
 *   audioUrl: 'https://example.com/sound.mp3',
 *   volume: 0.8
 * });
 *
 * // Stop all audio
 * session.audio.stopAudio();
 * ```
 */
export class AudioManager {
  private send: (message: any) => void;
  private packageName: string;
  private sessionId: string;
  private session?: any; // Reference to AppSession
  private logger: Logger;

  /** Map to store pending audio play request promises */
  private pendingAudioRequests = new Map<
    string,
    {
      resolve: (value: AudioPlayResult) => void;
      reject: (reason?: string) => void;
    }
  >();

  /**
   * Create a new AudioManager
   *
   * @param packageName - The App package name
   * @param sessionId - The current session ID
   * @param send - Function to send messages to the cloud
   * @param session - Reference to the parent AppSession (optional)
   * @param logger - Logger instance for debugging
   */
  constructor(
    packageName: string,
    sessionId: string,
    send: (message: any) => void,
    session?: any,
    logger?: Logger,
  ) {
    this.packageName = packageName;
    this.sessionId = sessionId;
    this.send = send;
    this.session = session;
    this.logger = logger || (console as any);
  }

  // =====================================
  // 🎵 Audio Playback Functionality
  // =====================================

  /**
   * 🔊 Play audio on the connected glasses
   * @param options - Audio playback configuration
   * @returns Promise that resolves with playback result
   *
   * @example
   * ```typescript
   * // Play audio from URL
   * const result = await session.audio.playAudio({
   *   audioUrl: 'https://example.com/sound.mp3',
   *   volume: 0.8
   * });
   * ```
   */
  async playAudio(options: AudioPlayOptions): Promise<AudioPlayResult> {
    return new Promise((resolve, reject) => {
      try {
        // Validate input
        if (!options.audioUrl) {
          reject("audioUrl must be provided");
          return;
        }

        // Generate unique request ID
        const requestId = `audio_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Store promise resolvers for when we get the response
        this.pendingAudioRequests.set(requestId, { resolve, reject });

        // Create audio play request message
        const message: AudioPlayRequest = {
          type: AppToCloudMessageType.AUDIO_PLAY_REQUEST,
          packageName: this.packageName,
          sessionId: this.sessionId,
          requestId,
          timestamp: new Date(),
          audioUrl: options.audioUrl,
          volume: options.volume ?? 1.0,
          stopOtherAudio: options.stopOtherAudio ?? true,
        };

        // Send request to cloud
        this.send(message);

        // Set timeout to avoid hanging promises
        const timeoutMs = 60000; // 60 seconds
        if (this.session && this.session.resources) {
          // Use session's resource tracker for automatic cleanup
          this.session.resources.setTimeout(() => {
            if (this.pendingAudioRequests.has(requestId)) {
              this.pendingAudioRequests
                .get(requestId)!
                .reject("Audio play request timed out");
              this.pendingAudioRequests.delete(requestId);
              this.logger.warn(
                { requestId },
                `🔊 Audio play request timed out`,
              );
            }
          }, timeoutMs);
        } else {
          // Fallback to regular setTimeout if session not available
          setTimeout(() => {
            if (this.pendingAudioRequests.has(requestId)) {
              this.pendingAudioRequests
                .get(requestId)!
                .reject("Audio play request timed out");
              this.pendingAudioRequests.delete(requestId);
              this.logger.warn(
                { requestId },
                `🔊 Audio play request timed out`,
              );
            }
          }, timeoutMs);
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        reject(`Failed to play audio: ${errorMessage}`);
      }
    });
  }

  /**
   * 🔇 Stop audio playback on the connected glasses
   *
   * @example
   * ```typescript
   * // Stop all currently playing audio
   * session.audio.stopAudio();
   * ```
   */
  stopAudio(): void {
    try {
      // Create audio stop request message
      const message: AudioStopRequest = {
        type: AppToCloudMessageType.AUDIO_STOP_REQUEST,
        packageName: this.packageName,
        sessionId: this.sessionId,
        timestamp: new Date(),
      };

      // Send request to cloud (one-way, no response expected)
      this.send(message);

      this.logger.info(`🔇 Audio stop request sent`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to stop audio: ${errorMessage}`);
    }
  }

  /**
   * 🗣️ Convert text to speech and play it on the connected glasses
   * @param text - Text to convert to speech (required)
   * @param options - Text-to-speech configuration (optional)
   * @returns Promise that resolves with playback result
   *
   * @example
   * ```typescript
   * // Basic text-to-speech
   * const result = await session.audio.speak('Hello, world!');
   *
   * // With custom voice settings
   * const result = await session.audio.speak('Hello, world!', {
   *   voice_id: 'your_voice_id',
   *   voice_settings: {
   *     stability: 0.5,
   *     speed: 1.2
   *   },
   *   volume: 0.8
   * });
   * ```
   */
  async speak(
    text: string,
    options: SpeakOptions = {},
  ): Promise<AudioPlayResult> {
    // Validate input
    if (!text) {
      throw new Error("text must be provided");
    }

    // Get the HTTPS server URL from the session
    const baseUrl = this.session?.getHttpsServerUrl?.();
    if (!baseUrl) {
      throw new Error("Cannot determine server URL for TTS endpoint");
    }

    // Build query parameters for the TTS endpoint
    const queryParams = new URLSearchParams();
    queryParams.append("text", text);

    if (options.voice_id) {
      queryParams.append("voice_id", options.voice_id);
    }

    if (options.model_id) {
      queryParams.append("model_id", options.model_id);
    }

    if (options.voice_settings) {
      queryParams.append(
        "voice_settings",
        JSON.stringify(options.voice_settings),
      );
    }

    // Construct the TTS URL
    const ttsUrl = `${baseUrl}/api/tts?${queryParams.toString()}`;

    this.logger.info({ text, ttsUrl }, `🗣️ Generating speech from text`);

    // Use the existing playAudio method to play the TTS audio
    return this.playAudio({
      audioUrl: ttsUrl,
      volume: options.volume,
    });
  }

  // =====================================
  // 📥 Response Handling
  // =====================================

  /**
   * 📥 Handle audio play response from cloud
   *
   * This method is called internally when an audio play response is received.
   * It resolves the corresponding pending promise with the response data.
   *
   * @param response - The audio play response received
   * @internal This method is used internally by AppSession
   */
  handleAudioPlayResponse(response: AudioPlayResponse): void {
    const pendingRequest = this.pendingAudioRequests.get(response.requestId);

    if (pendingRequest) {
      // Resolve the promise with the response data
      pendingRequest.resolve({
        success: response.success,
        error: response.error,
        duration: response.duration,
      });

      // Clean up
      this.pendingAudioRequests.delete(response.requestId);

      this.logger.info(
        {
          requestId: response.requestId,
          success: response.success,
          duration: response.duration,
        },
        `🔊 Audio play response received`,
      );
    } else {
      this.logger.warn(
        { requestId: response.requestId },
        `🔊 Received audio play response for unknown request ID`,
      );
    }
  }

  // =====================================
  // 🔍 Status and Management
  // =====================================

  /**
   * 🔍 Check if there are pending audio requests
   * @param requestId - Optional specific request ID to check
   * @returns True if there are pending requests (or specific request exists)
   */
  hasPendingRequest(requestId?: string): boolean {
    if (requestId) {
      return this.pendingAudioRequests.has(requestId);
    }
    return this.pendingAudioRequests.size > 0;
  }

  /**
   * 📊 Get the number of pending audio requests
   * @returns Number of pending requests
   */
  getPendingRequestCount(): number {
    return this.pendingAudioRequests.size;
  }

  /**
   * 📋 Get all pending request IDs
   * @returns Array of pending request IDs
   */
  getPendingRequestIds(): string[] {
    return Array.from(this.pendingAudioRequests.keys());
  }

  /**
   * ❌ Cancel a specific audio request
   * @param requestId - The request ID to cancel
   * @returns True if the request was found and cancelled
   */
  cancelAudioRequest(requestId: string): boolean {
    const pendingRequest = this.pendingAudioRequests.get(requestId);
    if (pendingRequest) {
      pendingRequest.reject("Audio request cancelled");
      this.pendingAudioRequests.delete(requestId);
      this.logger.info({ requestId }, `🔊 Audio request cancelled`);
      return true;
    }
    return false;
  }

  /**
   * 🧹 Cancel all pending audio requests
   * @returns Number of requests that were cancelled
   */
  cancelAllAudioRequests(): number {
    const count = this.pendingAudioRequests.size;
    this.pendingAudioRequests.forEach((request, requestId) => {
      request.reject("Audio request cancelled due to cleanup");
      this.logger.debug(
        { requestId },
        `🔊 Audio request cancelled during cleanup`,
      );
    });
    this.pendingAudioRequests.clear();

    if (count > 0) {
      this.logger.info(
        { cancelledCount: count },
        `🧹 Cancelled all pending audio requests`,
      );
    }

    return count;
  }

  // =====================================
  // 🔧 Internal Management
  // =====================================

  /**
   * 🔄 Update the session ID when reconnecting
   * @param newSessionId - The new session ID
   * @internal Used by AppSession during reconnection
   */
  updateSessionId(newSessionId: string): void {
    this.sessionId = newSessionId;
    this.logger.debug({ newSessionId }, `🔄 Audio module session ID updated`);
  }

  /**
   * 🧹 Cancel all pending requests (cleanup)
   * @returns Object with count of cancelled requests
   * @internal Used by AppSession during cleanup
   */
  cancelAllRequests(): { audioRequests: number } {
    const audioRequests = this.cancelAllAudioRequests();
    return { audioRequests };
  }
}
