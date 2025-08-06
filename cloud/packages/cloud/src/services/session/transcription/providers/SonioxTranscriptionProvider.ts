/**
 * @fileoverview Soniox provider implementation using WebSocket API
 */

import WebSocket from "ws";
import {
  StreamType,
  getLanguageInfo,
  TranscriptionData,
  SonioxToken,
} from "@mentra/sdk";
import { Logger } from "pino";
import {
  TranscriptionProvider,
  StreamInstance,
  StreamOptions,
  ProviderType,
  ProviderHealthStatus,
  ProviderLanguageCapabilities,
  SonioxProviderConfig,
  StreamState,
  StreamCallbacks,
  StreamMetrics,
  StreamHealth,
  SonioxProviderError,
} from "../types";

// Import Soniox language configuration from JSON
import sonioxLanguageData from "./SonioxLanguages.json";

// Extract supported language codes for the real-time model
const SONIOX_SUPPORTED_LANGUAGES: string[] = [];
const rtModel = sonioxLanguageData.models.find(
  (m) => m.id === "stt-rt-preview",
);
if (rtModel) {
  // Extract just the language codes (e.g., "en", "es", "fr")
  rtModel.languages.forEach((lang) => {
    if (!SONIOX_SUPPORTED_LANGUAGES.includes(lang.code)) {
      SONIOX_SUPPORTED_LANGUAGES.push(lang.code);
    }
  });
}

// Soniox WebSocket endpoint
const SONIOX_WEBSOCKET_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

// Soniox API token response interface (renamed to avoid conflict with SDK type)
interface SonioxApiToken {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  is_final: boolean;
  speaker?: string;
  language?: string; // Language code for this token
}

interface SonioxResponse {
  tokens?: SonioxApiToken[];
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
  error_code?: number;
  error_message?: string;
  finished?: boolean; // Indicates end of transcription
}

export class SonioxTranscriptionProvider implements TranscriptionProvider {
  readonly name = ProviderType.SONIOX;
  readonly logger: Logger;

  private healthStatus: ProviderHealthStatus;
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private config: SonioxProviderConfig,
    parentLogger: Logger,
  ) {
    this.logger = parentLogger.child({ provider: this.name });

    this.healthStatus = {
      isHealthy: true,
      lastCheck: Date.now(),
      failures: 0,
    };

    this.logger.info(
      {
        supportedLanguages: SONIOX_SUPPORTED_LANGUAGES.length,
        languages: SONIOX_SUPPORTED_LANGUAGES,
      },
      `Soniox provider initialized with ${SONIOX_SUPPORTED_LANGUAGES.length} supported languages`,
    );
  }

  async initialize(): Promise<void> {
    this.logger.info("Initializing Soniox provider");

    if (!this.config.apiKey) {
      throw new Error("Soniox API key is required");
    }

    // TODO: Initialize actual Soniox client when implementing
    this.logger.info(
      {
        endpoint: this.config.endpoint,
        keyLength: this.config.apiKey.length,
      },
      "Soniox provider initialized (stub)",
    );
  }

  async dispose(): Promise<void> {
    this.logger.info("Disposing Soniox provider");
    // TODO: Cleanup Soniox client when implementing
  }

  async createTranscriptionStream(
    language: string,
    options: StreamOptions,
  ): Promise<StreamInstance> {
    this.logger.debug(
      {
        language,
        streamId: options.streamId,
      },
      "Creating Soniox transcription stream",
    );

    if (!this.supportsLanguage(language)) {
      throw new SonioxProviderError(
        `Language ${language} not supported by Soniox`,
        400,
      );
    }

    // Create real Soniox WebSocket stream
    const stream = new SonioxTranscriptionStream(
      options.streamId,
      options.subscription,
      this,
      language,
      undefined,
      options.callbacks,
      this.logger,
      this.config,
    );

    // Initialize WebSocket connection
    await stream.initialize();

    return stream;
  }

  // Translation is now handled by a separate TranslationManager
  // This method should not be in TranscriptionProvider

  supportsSubscription(subscription: string): boolean {
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      return false;
    }

    // Only support transcription
    if (languageInfo.type === StreamType.TRANSCRIPTION) {
      return this.supportsLanguage(languageInfo.transcribeLanguage);
    }

    return false;
  }

  supportsLanguage(language: string): boolean {
    // Check if the language is in our supported transcription languages list
    // Language parameter is already a language code like "en-US", not a subscription string

    // Extract base language code (e.g., 'en' for 'en-US')
    const baseLanguage = language.split("-")[0].toLowerCase();

    // Check if this base language is supported by Soniox
    return SONIOX_SUPPORTED_LANGUAGES.includes(baseLanguage);
  }

  // Translation validation is now handled by TranslationManager

  getLanguageCapabilities(): ProviderLanguageCapabilities {
    // Build a list of language codes in the format expected (e.g., "en-US")
    // For now, we'll just return the base language codes since Soniox
    // supports multiple variants for most languages
    const transcriptionLanguages: string[] = [];

    if (rtModel) {
      rtModel.languages.forEach((lang) => {
        // Add the base language code (Soniox accepts base codes)
        transcriptionLanguages.push(lang.code);
      });
    }

    return {
      transcriptionLanguages,
      autoLanguageDetection: true, // Soniox supports auto language detection
    };
  }

  getHealthStatus(): ProviderHealthStatus {
    // Update health based on recent failures
    const now = Date.now();
    const recentFailures = this.getRecentFailureCount(300000); // 5 minutes

    this.healthStatus.lastCheck = now;
    this.healthStatus.failures = this.failureCount;
    this.healthStatus.lastFailure = this.lastFailureTime;

    // Mark as unhealthy if too many recent failures
    if (recentFailures >= 5) {
      this.healthStatus.isHealthy = false;
      this.healthStatus.reason = `Too many recent failures: ${recentFailures}`;
    } else if (!this.healthStatus.isHealthy && recentFailures < 2) {
      // Gradually restore health
      this.healthStatus.isHealthy = true;
      this.healthStatus.reason = undefined;
    }

    return { ...this.healthStatus };
  }

  recordFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.logger.warn(
      {
        error: error.message,
        totalFailures: this.failureCount,
      },
      "Recorded provider failure",
    );
  }

  recordSuccess(): void {
    // Don't reset failure count completely, just mark as more recent success
    const now = Date.now();

    // If it's been a while since last failure, gradually reduce count
    if (this.lastFailureTime && now - this.lastFailureTime > 300000) {
      // 5 minutes
      this.failureCount = Math.max(0, this.failureCount - 1);
    }

    this.logger.debug("Recorded provider success");
  }

  private getRecentFailureCount(timeWindowMs: number): number {
    const now = Date.now();
    return this.lastFailureTime && now - this.lastFailureTime < timeWindowMs
      ? this.failureCount
      : 0;
  }
}

/**
 * Soniox-specific stream implementation using WebSocket API
 */
class SonioxTranscriptionStream implements StreamInstance {
  public state = StreamState.INITIALIZING;
  public startTime = Date.now();
  public readyTime?: number;
  public lastActivity = Date.now();
  public lastError?: Error;
  public metrics: StreamMetrics;

  private ws?: WebSocket;
  private connectionTimeout?: NodeJS.Timeout;
  private isConfigSent = false;
  // Token buffer approach for Soniox streaming
  private tokenBuffer: Map<
    number,
    {
      text: string;
      isFinal: boolean;
      confidence: number;
      start_ms: number;
      end_ms: number;
    }
  > = new Map();
  private fallbackPosition = 0; // Fallback position when timing info is missing
  private lastSentInterim = ""; // Track last sent interim to avoid duplicates

  // Helper to convert internal tokens to SDK format
  private convertToSdkTokens(
    tokens: Array<{
      text: string;
      isFinal: boolean;
      confidence: number;
      start_ms: number;
      end_ms: number;
      speaker?: string;
    }>,
  ): SonioxToken[] {
    return tokens.map((token) => ({
      text: token.text,
      startMs: token.start_ms,
      endMs: token.end_ms,
      confidence: token.confidence,
      isFinal: token.isFinal,
      speaker: token.speaker,
    }));
  }

  // Translation-specific token buffers (one per language)
  private translationTokenBuffers: Map<
    string,
    Map<
      number,
      {
        text: string;
        isFinal: boolean;
        confidence: number;
        start_ms: number;
        end_ms: number;
        speaker?: string;
      }
    >
  > = new Map();
  private translationFallbackPositions: Map<string, number> = new Map();
  private lastSentTranslationInterims: Map<string, string> = new Map();

  // Keepalive management
  private keepaliveInterval?: NodeJS.Timeout;

  constructor(
    public readonly id: string,
    public readonly subscription: string,
    public readonly provider: SonioxTranscriptionProvider,
    public readonly language: string,
    public readonly targetLanguage: string | undefined,
    public readonly callbacks: StreamCallbacks,
    public readonly logger: Logger,
    private readonly config: SonioxProviderConfig,
  ) {
    this.metrics = {
      totalDuration: 0,
      audioChunksReceived: 0,
      audioChunksWritten: 0,
      audioDroppedCount: 0,
      audioWriteFailures: 0,
      consecutiveFailures: 0,
      errorCount: 0,
    };
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(
          { streamId: this.id },
          "Connecting to Soniox WebSocket",
        );

        // Create WebSocket connection
        this.ws = new WebSocket(SONIOX_WEBSOCKET_URL);

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.state === StreamState.INITIALIZING) {
            this.handleError(new Error("Soniox connection timeout"));
            reject(new Error("Connection timeout"));
          }
        }, 10000); // 10 second timeout

        this.ws.on("open", () => {
          this.logger.debug(
            { streamId: this.id },
            "Soniox WebSocket connected",
          );
          this.sendConfiguration();

          // Start automatic keepalive for this stream
          this.startKeepalive();
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error: Error) => {
          this.logger.error(
            { error, streamId: this.id },
            "Soniox WebSocket error",
          );
          this.handleError(error);
          reject(error);
        });

        this.ws.on("close", (code: number, reason: Buffer) => {
          this.logger.info(
            { code, reason: reason.toString(), streamId: this.id },
            "Soniox WebSocket closed",
          );
          this.state = StreamState.CLOSED;
          if (this.callbacks.onClosed) {
            this.callbacks.onClosed();
          }
        });

        // Resolve when stream becomes ready
        const checkReady = () => {
          if (this.state === StreamState.READY) {
            resolve();
          } else if (this.state === StreamState.ERROR) {
            reject(this.lastError || new Error("Stream initialization failed"));
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      } catch (error) {
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  private sendConfiguration(): void {
    if (!this.ws || this.isConfigSent) {
      return;
    }
    const languageHint = this.language.split("-")[0]; // Normalize to base language code (e.g. 'en' from 'en-US')
    const targetLanguageHint = this.targetLanguage
      ? this.targetLanguage.split("-")[0]
      : undefined;
    const languageHints = targetLanguageHint
      ? [languageHint, targetLanguageHint]
      : [languageHint];

    const disableLanguageIdentification = this.subscription.endsWith(
      "?no-language-identification=true",
    );
    const config: any = {
      api_key: this.config.apiKey,
      model: this.config.model || "stt-rt-preview-v2",
      audio_format: "pcm_s16le",
      sample_rate: 16000,
      num_channels: 1,
      enable_language_identification: !disableLanguageIdentification, // Toggle based on flag
      max_non_final_tokens_duration_ms: 2000,
      enable_endpoint_detection: true, // Automatically finalize tokens on speech pauses
      enable_speaker_diarization: true,
      language_hints: languageHints, // Default hints, can be overridden
      // context: "Mentra, MentraOS, Mira, Hey Mira",
    };

    // Configure translation if target language is specified
    if (this.targetLanguage) {
      // Use two-way translation configuration like the Soniox example
      config.translation = {
        type: "two_way",
        language_a: this.language.split("-")[0], // Convert en-US to en
        language_b: this.targetLanguage.split("-")[0], // Convert es-ES to es
      };
      config.language_hints = [
        config.translation.language_a,
        config.translation.language_b,
      ];
    } else {
      // Just transcription
      config.language = this.language;
    }

    try {
      this.ws.send(JSON.stringify(config));
      this.isConfigSent = true;

      this.logger.debug(
        {
          streamId: this.id,
          language: this.language,
          model: config.model,
        },
        "Sent Soniox configuration",
      );

      // Mark as ready after config is sent
      setTimeout(() => {
        if (this.state === StreamState.INITIALIZING) {
          this.state = StreamState.READY;
          this.readyTime = Date.now();
          this.metrics.initializationTime = this.readyTime - this.startTime;

          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = undefined;
          }

          if (this.callbacks.onReady) {
            this.callbacks.onReady();
          }

          this.logger.info(
            {
              streamId: this.id,
              initTime: this.metrics.initializationTime,
            },
            "Soniox stream ready",
          );
        }
      }, 1000); // Give Soniox a moment to process config
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private handleMessage(data: Buffer): void {
    try {
      const response: SonioxResponse = JSON.parse(data.toString());

      if (response.error_code) {
        this.handleError(
          new Error(
            `Soniox error ${response.error_code}: ${response.error_message}`,
          ),
        );
        return;
      }

      if (response.tokens && response.tokens.length > 0) {
        this.processSonioxTokens(response.tokens);
      }
    } catch (error) {
      this.logger.warn(
        { error, streamId: this.id },
        "Error parsing Soniox response",
      );
    }
  }

  private processSonioxTokens(tokens: SonioxApiToken[]): void {
    if (this.targetLanguage) {
      // Should never receive translation tokens in transcription provider
      this.logger.error(
        { streamId: this.id },
        "Transcription provider incorrectly receiving translation tokens",
      );
      return;
    } else {
      // Transcription mode
      this.processTranscriptionTokens(tokens);
    }
  }

  private processTranscriptionTokens(tokens: SonioxApiToken[]): void {
    // Soniox streams tokens cumulatively - each response contains tokens that should
    // update our running buffer. Tokens can change from interim to final and can be corrected.
    // Key insight: Use audio segment position (start_ms) as primary key to allow corrections.

    let hasEndToken = false;
    let avgConfidence = 0;
    let tokenCount = 0;

    for (const token of tokens) {
      // Check for endpoint detection
      if (token.text === "<end>") {
        hasEndToken = true;
        continue;
      }

      // Use start_ms as primary key for audio segment positioning
      // If no timing info, use fallback position that increments
      let tokenKey: number;
      if (token.start_ms !== undefined && token.start_ms >= 0) {
        tokenKey = token.start_ms;
      } else {
        // No timing info - use fallback position
        tokenKey = this.fallbackPosition++;
      }

      // Add or update token in buffer (corrections replace previous tokens at same position)
      this.tokenBuffer.set(tokenKey, {
        text: token.text,
        isFinal: token.is_final,
        confidence: token.confidence,
        start_ms: token.start_ms || tokenKey,
        end_ms: token.end_ms || tokenKey + 100, // Fallback end time
      });

      avgConfidence += token.confidence;
      tokenCount++;
    }

    if (tokenCount > 0) {
      avgConfidence /= tokenCount;
    }

    // Build interim transcript from all tokens in buffer (sorted by start time)
    const sortedTokens = Array.from(this.tokenBuffer.entries())
      .sort(([keyA], [keyB]) => keyA - keyB) // Sort by start time (key)
      .map(([, token]) => token);

    const currentInterim = sortedTokens
      .map((t) => t.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim();

    // Send interim transcript if it has changed
    if (currentInterim !== this.lastSentInterim && currentInterim) {
      const interimData: TranscriptionData = {
        type: StreamType.TRANSCRIPTION,
        text: currentInterim,
        isFinal: false,
        confidence: avgConfidence,
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        transcribeLanguage: this.language,
        provider: "soniox",
        metadata: {
          provider: "soniox",
          soniox: {
            tokens: this.convertToSdkTokens(sortedTokens),
          },
        },
      };

      if (this.callbacks.onData) {
        this.callbacks.onData(interimData);
      }

      this.lastSentInterim = currentInterim;

      this.logger.debug(
        {
          streamId: this.id,
          text: currentInterim.substring(0, 100),
          isFinal: false,
          tokenCount: this.tokenBuffer.size,
          corrections: tokens.filter((t) =>
            this.tokenBuffer.has(t.start_ms || 0),
          ).length,
          provider: "soniox",
        },
        `🎙️ SONIOX: interim transcription - "${currentInterim}"`,
      );

      // Log metadata details
      this.logger.info(
        {
          streamId: this.id,
          metadataType: "interim",
          tokenCount: sortedTokens.length,
          tokens: sortedTokens.map((t) => ({
            text: t.text,
            confidence: t.confidence,
            timeRange: `${t.start_ms}-${t.end_ms}ms`,
            isFinal: t.isFinal,
          })),
          lowConfidenceTokens: sortedTokens
            .filter((t) => t.confidence < 0.8)
            .map((t) => ({
              text: t.text,
              confidence: t.confidence,
            })),
        },
        `🔍 METADATA: Interim transcription with ${sortedTokens.length} tokens`,
      );
    }

    // Send final transcript when we get <end> token
    if (hasEndToken) {
      // Build final transcript from only final tokens
      const finalTokens = sortedTokens.filter((t) => t.isFinal);
      const finalTranscript = finalTokens
        .map((t) => t.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();

      if (finalTranscript) {
        const finalData: TranscriptionData = {
          type: StreamType.TRANSCRIPTION,
          text: finalTranscript,
          isFinal: true,
          confidence:
            finalTokens.reduce((acc, t) => acc + t.confidence, 0) /
            finalTokens.length,
          startTime: Date.now(),
          endTime: Date.now() + 1000,
          transcribeLanguage: this.language,
          provider: "soniox",
          metadata: {
            provider: "soniox",
            soniox: {
              tokens: this.convertToSdkTokens(finalTokens),
            },
          },
        };

        if (this.callbacks.onData) {
          this.callbacks.onData(finalData);
        }

        this.logger.debug(
          {
            streamId: this.id,
            text: finalTranscript.substring(0, 100),
            isFinal: true,
            finalTokenCount: finalTokens.length,
            totalTokenCount: this.tokenBuffer.size,
            provider: "soniox",
          },
          `🎙️ SONIOX: FINAL transcription - "${finalTranscript}"`,
        );

        // Log final metadata details
        this.logger.info(
          {
            streamId: this.id,
            metadataType: "final",
            tokenCount: finalTokens.length,
            averageConfidence:
              finalTokens.reduce((acc, t) => acc + t.confidence, 0) /
              finalTokens.length,
            tokens: finalTokens.map((t) => ({
              text: t.text,
              confidence: t.confidence,
              timeRange: `${t.start_ms}-${t.end_ms}ms`,
              isFinal: t.isFinal,
            })),
            lowConfidenceTokens: finalTokens
              .filter((t) => t.confidence < 0.8)
              .map((t) => ({
                text: t.text,
                confidence: t.confidence,
              })),
            totalDurationMs:
              finalTokens.length > 0
                ? finalTokens[finalTokens.length - 1].end_ms -
                  finalTokens[0].start_ms
                : 0,
          },
          `🔍 METADATA: Final transcription with ${finalTokens.length} tokens`,
        );
      }

      // Clear buffer for next utterance
      this.tokenBuffer.clear();
      this.fallbackPosition = 0;
      this.lastSentInterim = "";
    }
  }

  /**
   * Force finalize the current token buffer (called when VAD stops)
   * This sends whatever tokens we have as a final transcription
   */
  forceFinalizePendingTokens(): void {
    if (this.tokenBuffer.size === 0) {
      this.logger.debug(
        {
          streamId: this.id,
          provider: "soniox",
        },
        "🎙️ SONIOX: VAD stop - no tokens to finalize",
      );
      return;
    }

    // Build final transcript from all tokens in buffer (both final and interim)
    const allTokens = Array.from(this.tokenBuffer.values()).sort(
      (a, b) => a.start_ms - b.start_ms,
    );

    const finalTranscript = allTokens
      .map((token) => token.text)
      .join("")
      .trim();

    if (finalTranscript) {
      const finalData: TranscriptionData = {
        type: StreamType.TRANSCRIPTION,
        text: finalTranscript,
        isFinal: true,
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        transcribeLanguage: this.language,
        provider: "soniox",
        metadata: {
          provider: "soniox",
          soniox: {
            tokens: this.convertToSdkTokens(allTokens),
          },
        },
      };

      if (this.callbacks.onData) {
        this.callbacks.onData(finalData);
      }

      this.logger.debug(
        {
          streamId: this.id,
          text: finalTranscript.substring(0, 100),
          isFinal: true,
          tokenCount: allTokens.length,
          provider: "soniox",
          trigger: "VAD_STOP",
        },
        `🎙️ SONIOX: VAD-triggered FINAL transcription - "${finalTranscript}"`,
      );

      // Log VAD-triggered metadata
      this.logger.info(
        {
          streamId: this.id,
          metadataType: "vad-final",
          tokenCount: allTokens.length,
          mixedTokenTypes: {
            final: allTokens.filter((t) => t.isFinal).length,
            interim: allTokens.filter((t) => !t.isFinal).length,
          },
          averageConfidence:
            allTokens.reduce((acc, t) => acc + t.confidence, 0) /
            allTokens.length,
          tokens: allTokens.slice(0, 10).map((t) => ({
            // Show first 10 tokens to avoid huge logs
            text: t.text,
            confidence: t.confidence,
            timeRange: `${t.start_ms}-${t.end_ms}ms`,
            isFinal: t.isFinal,
          })),
          lowConfidenceTokens: allTokens
            .filter((t) => t.confidence < 0.8)
            .map((t) => ({
              text: t.text,
              confidence: t.confidence,
            })),
          totalDurationMs:
            allTokens.length > 0
              ? allTokens[allTokens.length - 1].end_ms - allTokens[0].start_ms
              : 0,
        },
        `🔍 METADATA: VAD-triggered final with ${allTokens.length} tokens (showing first 10)`,
      );
    }

    // Clear buffer for next VAD session
    this.tokenBuffer.clear();
    this.fallbackPosition = 0;
    this.lastSentInterim = "";
  }

  private handleError(error: Error): void {
    this.state = StreamState.ERROR;
    this.lastError = error;
    this.metrics.errorCount++;
    this.metrics.consecutiveFailures++;

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    // Reset token buffer on error to prevent stale data
    this.tokenBuffer.clear();
    this.fallbackPosition = 0;
    this.lastSentInterim = "";

    this.provider.recordFailure(error);

    if (this.callbacks.onError) {
      this.callbacks.onError(error);
    }
  }

  async writeAudio(data: ArrayBuffer): Promise<boolean> {
    this.lastActivity = Date.now();
    this.metrics.audioChunksReceived++;

    // Simple state check - drop audio if not ready
    if (this.state !== StreamState.READY && this.state !== StreamState.ACTIVE) {
      this.metrics.audioDroppedCount++;
      return false;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.metrics.audioDroppedCount++;
      return false;
    }

    try {
      // Send audio as binary frame to Soniox
      this.ws.send(data);

      this.state = StreamState.ACTIVE;
      this.metrics.audioChunksWritten++;
      this.metrics.lastSuccessfulWrite = Date.now();
      this.metrics.consecutiveFailures = 0;

      return true;
    } catch (error) {
      this.metrics.audioWriteFailures++;
      this.metrics.consecutiveFailures++;
      this.metrics.errorCount++;

      this.logger.warn(
        { error, streamId: this.id },
        "Error writing audio to Soniox",
      );

      // Too many failures? Mark as error
      if (this.metrics.consecutiveFailures >= 5) {
        this.handleError(error as Error);
      }

      return false;
    }
  }

  async close(): Promise<void> {
    this.state = StreamState.CLOSING;

    try {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = undefined;
      }

      // Stop keepalive if active
      this.stopKeepalive();

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send empty binary frame to signal end of audio
        this.ws.send(Buffer.alloc(0));

        // Close WebSocket connection
        this.ws.close(1000, "Stream closed normally");
      }

      // Reset token buffer to prevent stale data
      this.tokenBuffer.clear();
      this.fallbackPosition = 0;
      this.lastSentInterim = "";

      // Reset translation buffers
      this.translationTokenBuffers.clear();
      this.translationFallbackPositions.clear();
      this.lastSentTranslationInterims.clear();

      this.state = StreamState.CLOSED;
      this.metrics.totalDuration = Date.now() - this.startTime;

      this.logger.debug(
        {
          streamId: this.id,
          duration: this.metrics.totalDuration,
          audioChunksWritten: this.metrics.audioChunksWritten,
        },
        "Soniox stream closed",
      );
    } catch (error) {
      this.logger.warn(
        { error, streamId: this.id },
        "Error during Soniox stream close",
      );
      this.state = StreamState.CLOSED; // Force closed even on error
    }
  }

  getHealth(): StreamHealth {
    return {
      isAlive:
        this.state === StreamState.READY || this.state === StreamState.ACTIVE,
      lastActivity: this.lastActivity,
      consecutiveFailures: this.metrics.consecutiveFailures,
      lastSuccessfulWrite: this.metrics.lastSuccessfulWrite,
      providerHealth: this.provider.getHealthStatus(),
    };
  }

  /**
   * Start automatic keepalive for this stream
   * Sends keepalive messages every 15 seconds for the lifetime of the stream
   */
  private startKeepalive(): void {
    if (this.keepaliveInterval) {
      return; // Already started
    }

    this.logger.debug(
      { streamId: this.id },
      "Starting automatic Soniox keepalive",
    );

    // Set up interval to send keepalive every 15 seconds
    // (Soniox requires at least once every 20 seconds)
    this.keepaliveInterval = setInterval(() => {
      this.sendKeepalive();
    }, 15000);
  }

  /**
   * Stop automatic keepalive when stream closes
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = undefined;
      this.logger.debug(
        { streamId: this.id },
        "Stopped automatic Soniox keepalive",
      );
    }
  }

  /**
   * Send a keepalive message to Soniox
   */
  private sendKeepalive(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(
        { streamId: this.id },
        "Cannot send keepalive - WebSocket not open",
      );
      return;
    }

    try {
      const keepaliveMessage = { type: "keepalive" };
      this.ws.send(JSON.stringify(keepaliveMessage));

      this.logger.debug(
        { streamId: this.id },
        "Sent keepalive message to Soniox",
      );
      this.lastActivity = Date.now();
    } catch (error) {
      this.logger.error(
        { error, streamId: this.id },
        "Error sending keepalive message",
      );
    }
  }
}
