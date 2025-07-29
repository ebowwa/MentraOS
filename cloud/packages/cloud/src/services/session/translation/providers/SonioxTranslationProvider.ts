/**
 * @fileoverview Soniox Translation Provider
 * Uses Soniox's unified transcription+translation API but only extracts translation data
 */

import { Logger } from 'pino';
import WebSocket from 'ws';
import {
  TranslationProvider,
  TranslationProviderType,
  TranslationProviderHealthStatus,
  TranslationProviderCapabilities,
  TranslationStreamOptions,
  TranslationStreamInstance,
  SonioxTranslationConfig,
  TranslationStreamState,
  TranslationStreamMetrics,
  TranslationStreamHealth,
  TranslationProviderError,
  InvalidLanguagePairError
} from '../types';
import { TranslationData, StreamType } from '@mentra/sdk';
import { SonioxTranslationUtils } from './SonioxTranslationUtils';

/**
 * Soniox API message types
 */
interface SonioxMessage {
  type: string;
  [key: string]: any;
}

interface SonioxToken {
  text: string;
  start_ms?: number;
  duration_ms?: number;
  is_final: boolean;
  translation_status?: 'original' | 'translation';
  language?: string;
  source_language?: string;
}

// SonioxResult interface not needed with new token-based approach

/**
 * Soniox-specific translation stream implementation
 */
class SonioxTranslationStream implements TranslationStreamInstance {
  readonly id: string;
  readonly subscription: string;
  readonly provider: TranslationProvider;
  readonly logger: Logger;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;

  state: TranslationStreamState = TranslationStreamState.INITIALIZING;
  startTime: number = Date.now();
  readyTime?: number;
  lastActivity: number = Date.now();
  lastError?: Error;

  metrics: TranslationStreamMetrics = {
    initializationTime: undefined,
    totalDuration: 0,
    audioChunksReceived: 0,
    audioChunksWritten: 0,
    audioDroppedCount: 0,
    audioWriteFailures: 0,
    consecutiveFailures: 0,
    lastSuccessfulWrite: undefined,
    translationsGenerated: 0,
    averageLatency: undefined,
    errorCount: 0,
    lastError: undefined
  };

  callbacks: TranslationStreamOptions['callbacks'];

  private ws?: WebSocket;
  private isClosing = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private pendingAudioChunks: ArrayBuffer[] = [];
  private latencyMeasurements: number[] = [];

  // Translation token buffers
  private finalTranslationTokens: SonioxToken[] = [];
  private lastSentTranslationText = '';
  private currentUtteranceStartTime?: number;

  constructor(
    options: TranslationStreamOptions,
    provider: TranslationProvider,
    private config: SonioxTranslationConfig
  ) {
    this.id = options.streamId;
    this.subscription = options.subscription;
    this.provider = provider;
    this.logger = options.userSession.logger.child({
      service: 'SonioxTranslationStream',
      streamId: this.id
    });
    this.sourceLanguage = options.sourceLanguage;
    this.targetLanguage = options.targetLanguage;
    this.callbacks = options.callbacks;
  }

  async initialize(): Promise<void> {
    try {
      const initStartTime = Date.now();

      await this.connect();

      this.metrics.initializationTime = Date.now() - initStartTime;

      this.logger.info({
        sourceLanguage: this.sourceLanguage,
        targetLanguage: this.targetLanguage,
        initTime: this.metrics.initializationTime
      }, 'Soniox translation stream initialized');

    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Soniox translation stream');
      this.handleError(error as Error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket connection
        const wsUrl = this.config.endpoint;
        this.logger.debug({ wsUrl }, 'Connecting to Soniox WebSocket');
        this.ws = new WebSocket(wsUrl);

        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          this.logger.error('Soniox WebSocket connection timeout');
          this.ws?.terminate();
          reject(new Error('Soniox WebSocket connection timeout'));
        }, 10000); // 10 second timeout

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.logger.debug('Soniox translation WebSocket connected');
          this.sendConfigMessage();
          // Resolve after sending config
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString()) as SonioxMessage;
            this.handleMessage(message);

            // Don't resolve here - Soniox doesn't send 'ready' in the message handler
            // The actual ready state is handled in handleMessage
          } catch (error) {
            this.logger.error({ error, data: data.toString() }, 'Error parsing Soniox message');
          }
        });

        this.ws.on('error', (error) => {
          this.logger.error({ error }, 'Soniox translation WebSocket error');
          this.handleError(new TranslationProviderError(
            `Soniox WebSocket error: ${error.message}`,
            TranslationProviderType.SONIOX,
            error
          ));
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          this.logger.info({ code, reason: reason.toString() }, 'Soniox translation WebSocket closed');

          if (!this.isClosing && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.logger.info({ attempt: this.reconnectAttempts }, 'Attempting to reconnect Soniox translation WebSocket');
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
          } else {
            this.state = TranslationStreamState.CLOSED;
            this.callbacks.onClosed?.();
          }
        });

      } catch (error) {
        this.logger.error({ error }, 'Failed to create Soniox translation WebSocket');
        reject(error);
      }
    });
  }

  private sendConfigMessage(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Normalize language codes for Soniox
    const sourceLang = this.normalizeLanguageCode(this.sourceLanguage);
    const targetLang = this.normalizeLanguageCode(this.targetLanguage);

    // Build translation config optimized for translation only
    let translationConfig: any;

    // Check if this is a two-way translation pair
    if (this.isTwoWayPair(sourceLang, targetLang)) {
      translationConfig = {
        type: 'two_way',
        language_a: sourceLang,
        language_b: targetLang
      };
    } else {
      // One-way translation
      translationConfig = {
        type: 'one_way',
        target_language: targetLang
      };

      // If source is specific, set it
      if (sourceLang !== 'auto') {
        translationConfig.source_languages = [sourceLang];
      }
    }

    const config = {
      api_key: this.config.apiKey,
      model: this.config.model || 'stt-rt-preview',
      audio_format: 'pcm_s16le',
      sample_rate: 16000,
      num_channels: 1,
      language: sourceLang === 'auto' ? 'auto' : sourceLang,
      translation: translationConfig,

      // Optimize for translation
      include_nonfinal: false, // for translation, we don't need non final results.
      enable_profanity_filter: false,
      enable_automatic_punctuation: true,
      enable_speaker_diarization: true,

      enable_speaker_identification: false, // Don't need this for translation
      enable_language_identification: true,

      // max time for final.
      max_non_final_tokens_duration_ms: 2000
    };

    this.ws.send(JSON.stringify(config));

    this.logger.debug({
      config,
      languages: `${this.sourceLanguage} → ${this.targetLanguage}`
    }, 'Sent Soniox translation config');

    // Mark as ready after config is sent (Soniox pattern)
    setTimeout(() => {
      if (this.state === TranslationStreamState.INITIALIZING) {
        this.state = TranslationStreamState.READY;
        this.readyTime = Date.now();
        this.callbacks.onReady?.();

        this.logger.info({
          streamId: this.id,
          initTime: this.readyTime - this.startTime
        }, 'Soniox translation stream ready');
      }
    }, 1000); // Give Soniox a moment to process config
  }

  private handleMessage(message: SonioxMessage): void {
    this.lastActivity = Date.now();

    // Check if this is a tokens message (Soniox doesn't always send a 'type' field)
    if ('tokens' in message && Array.isArray(message.tokens)) {
      // This is a result message with tokens
      this.handleResult(message);
      return;
    }

    // Enhanced logging to identify message types
    this.logger.info({
      messageType: message.type,
      messageKeys: Object.keys(message),
      message: JSON.stringify(message).substring(0, 500)
    }, 'Soniox message received');

    switch (message.type) {
      case 'result':
        this.handleResult(message);
        break;

      case 'error':
        this.handleError(new TranslationProviderError(
          `Soniox error: ${message.message || 'Unknown error'}`,
          TranslationProviderType.SONIOX
        ));
        break;

      case 'ready':
        this.logger.debug('Soniox translation stream ready');
        this.state = TranslationStreamState.ACTIVE;
        // Process any pending audio
        this.processPendingAudio();
        break;

      default:
        this.logger.warn({
          messageType: message.type,
          fullMessage: message
        }, 'Unhandled Soniox message type - please check if this needs handling');
    }
  }

  private handleResult(message: SonioxMessage): void {
    try {
      // For token messages, the tokens are directly in the message
      const tokens = message.tokens as SonioxToken[];

      if (!tokens || !Array.isArray(tokens)) {
        this.logger.warn({
          messageKeys: Object.keys(message)
        }, 'Soniox result message does not contain tokens array');
        return;
      }

      // Process tokens to update our buffers
      let hasEndToken = false;
      let newFinalTranslationTokens: SonioxToken[] = [];

      // Scan through all tokens
      for (const token of tokens) {
        // Check for <end> token to mark utterance boundaries
        if (token.text === '<end>') {
          hasEndToken = true;
          continue;
        }

        // Only process translation tokens that are final
        // Check translation_status first, then fallback to language check
        if (token.is_final && token.translation_status === 'translation') {
          newFinalTranslationTokens.push(token);
        }
      }

      // Add new final tokens to our buffer
      if (newFinalTranslationTokens.length > 0) {
        this.finalTranslationTokens.push(...newFinalTranslationTokens);

        // Set start time from first token if not set
        if (!this.currentUtteranceStartTime && this.finalTranslationTokens.length > 0) {
          const firstToken = this.finalTranslationTokens[0];
          this.currentUtteranceStartTime = firstToken.start_ms || 0;
        }
      }

      // Build the complete translation text from final tokens
      const translationText = this.finalTranslationTokens
        .map(t => t.text)
        .join('');

      // Only send if we have translation text and it's different from last sent
      if (translationText && translationText !== this.lastSentTranslationText) {
        // Calculate timing from tokens
        let endTime = this.currentUtteranceStartTime || 0;
        if (this.finalTranslationTokens.length > 0) {
          const lastToken = this.finalTranslationTokens[this.finalTranslationTokens.length - 1];
          endTime = (lastToken.start_ms || 0) + (lastToken.duration_ms || 0);
        }

        // Create translation data
        const translationData: TranslationData = {
          type: StreamType.TRANSLATION,
          text: translationText,
          originalText: undefined, // We're not tracking original text in this approach
          isFinal: hasEndToken, // Mark as final only when we see <end>
          startTime: this.currentUtteranceStartTime || 0,
          endTime: endTime,
          speakerId: undefined,
          duration: endTime - (this.currentUtteranceStartTime || 0),
          transcribeLanguage: this.sourceLanguage,
          translateLanguage: this.targetLanguage,
          didTranslate: true,
          provider: 'soniox',
          confidence: undefined
        };

        // Update metrics
        this.metrics.translationsGenerated++;

        // Calculate latency
        const latency = Date.now() - this.startTime - endTime;
        this.latencyMeasurements.push(latency);
        if (this.latencyMeasurements.length > 100) {
          this.latencyMeasurements.shift();
        }
        this.metrics.averageLatency = this.latencyMeasurements.reduce((a, b) => a + b, 0) / this.latencyMeasurements.length;

        // Send to callback
        this.callbacks.onData?.(translationData);

        // Update last sent text
        this.lastSentTranslationText = translationText;

        this.logger.info({
          text: translationText.substring(0, 100),
          isFinal: hasEndToken,
          tokenCount: this.finalTranslationTokens.length,
          languages: `${this.sourceLanguage} → ${this.targetLanguage}`
        }, 'Soniox translation sent');
      }

      // Clear buffers if we hit an utterance boundary
      if (hasEndToken && this.finalTranslationTokens.length > 0) {
        this.logger.debug({
          clearedTokens: this.finalTranslationTokens.length,
          utteranceText: translationText
        }, 'Clearing translation buffer at utterance boundary');

        this.finalTranslationTokens = [];
        this.lastSentTranslationText = '';
        this.currentUtteranceStartTime = undefined;
      }

    } catch (error) {
      this.logger.error({ error }, 'Error handling Soniox translation result');
      this.metrics.errorCount++;
    }
  }

  async writeAudio(data: ArrayBuffer): Promise<boolean> {
    try {
      if (this.state !== TranslationStreamState.READY && this.state !== TranslationStreamState.ACTIVE) {
        // Buffer audio if still initializing
        if (this.state === TranslationStreamState.INITIALIZING) {
          this.pendingAudioChunks.push(data);
          return true;
        }
        this.metrics.audioDroppedCount++;
        return false;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.metrics.audioWriteFailures++;
        return false;
      }

      this.metrics.audioChunksReceived++;

      // Send audio data
      this.ws.send(data);

      this.metrics.audioChunksWritten++;
      this.metrics.lastSuccessfulWrite = Date.now();
      this.metrics.consecutiveFailures = 0;
      this.lastActivity = Date.now();

      return true;
    } catch (error) {
      this.logger.warn({ error }, 'Failed to write audio to Soniox translation stream');
      this.metrics.audioWriteFailures++;
      this.metrics.consecutiveFailures++;
      return false;
    }
  }

  private processPendingAudio(): void {
    if (this.pendingAudioChunks.length === 0) return;

    this.logger.debug({ count: this.pendingAudioChunks.length }, 'Processing pending audio chunks');

    for (const chunk of this.pendingAudioChunks) {
      this.writeAudio(chunk);
    }

    this.pendingAudioChunks = [];
  }

  async close(): Promise<void> {
    if (this.isClosing || this.state === TranslationStreamState.CLOSED) {
      return;
    }

    this.isClosing = true;
    this.state = TranslationStreamState.CLOSING;

    try {
      // Send any remaining translation if we have buffered tokens
      if (this.finalTranslationTokens.length > 0) {
        const finalText = this.finalTranslationTokens.map(t => t.text).join('');
        if (finalText && finalText !== this.lastSentTranslationText) {
          // Send one last update marked as final
          const lastToken = this.finalTranslationTokens[this.finalTranslationTokens.length - 1];
          const endTime = (lastToken.start_ms || 0) + (lastToken.duration_ms || 0);

          const translationData: TranslationData = {
            type: StreamType.TRANSLATION,
            text: finalText,
            originalText: undefined,
            isFinal: true, // Force final on close
            startTime: this.currentUtteranceStartTime || 0,
            endTime: endTime,
            speakerId: undefined,
            duration: endTime - (this.currentUtteranceStartTime || 0),
            transcribeLanguage: this.sourceLanguage,
            translateLanguage: this.targetLanguage,
            didTranslate: true,
            provider: 'soniox',
            confidence: undefined
          };

          this.callbacks.onData?.(translationData);
          this.logger.info({ text: finalText }, 'Sent final translation on stream close');
        }
      }

      // Clear buffers
      this.finalTranslationTokens = [];
      this.lastSentTranslationText = '';
      this.currentUtteranceStartTime = undefined;

      // Send final message
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'final' }));

        // Give it a moment to send
        await new Promise(resolve => setTimeout(resolve, 100));

        this.ws.close();
      }

      // Update metrics
      this.metrics.totalDuration = Date.now() - this.startTime;

      this.state = TranslationStreamState.CLOSED;
      this.callbacks.onClosed?.();

      this.logger.info({
        streamId: this.id,
        duration: this.metrics.totalDuration,
        translationsGenerated: this.metrics.translationsGenerated,
        averageLatency: this.metrics.averageLatency
      }, 'Soniox translation stream closed');

    } catch (error) {
      this.logger.error({ error }, 'Error closing Soniox translation stream');
      this.state = TranslationStreamState.CLOSED;
    }
  }

  getHealth(): TranslationStreamHealth {
    return {
      isAlive: this.state === TranslationStreamState.READY || this.state === TranslationStreamState.ACTIVE,
      lastActivity: this.lastActivity,
      consecutiveFailures: this.metrics.consecutiveFailures,
      lastSuccessfulWrite: this.metrics.lastSuccessfulWrite,
      providerHealth: this.provider.getHealthStatus()
    };
  }

  private handleError(error: Error): void {
    this.lastError = error;
    this.metrics.errorCount++;
    this.metrics.lastError = error;
    this.state = TranslationStreamState.ERROR;
    this.callbacks.onError?.(error);
  }

  private normalizeLanguageCode(languageCode: string): string {
    // Use the utility for consistent language normalization
    return SonioxTranslationUtils.normalizeLanguageCode(languageCode);
  }

  private isTwoWayPair(source: string, target: string): boolean {
    // Use the utility to check against actual Soniox two-way pairs
    return SonioxTranslationUtils.supportsTwoWayTranslation(source, target);
  }
}

/**
 * Soniox Translation Provider implementation
 */
export class SonioxTranslationProvider implements TranslationProvider {
  readonly name = TranslationProviderType.SONIOX;
  readonly logger: Logger;

  private isInitialized = false;
  private healthStatus: TranslationProviderHealthStatus = {
    isHealthy: true,
    lastCheck: Date.now(),
    failures: 0
  };

  // Get supported languages from the actual Soniox mappings
  private supportedLanguages = new Set(SonioxTranslationUtils.getSupportedLanguages());

  constructor(
    private config: SonioxTranslationConfig,
    parentLogger: Logger
  ) {
    this.logger = parentLogger.child({ provider: 'soniox-translation' });
  }

  async initialize(): Promise<void> {
    try {
      // Validate configuration
      if (!this.config.apiKey) {
        throw new Error('Soniox translation provider requires API key');
      }

      if (!this.config.endpoint) {
        throw new Error('Soniox translation provider requires endpoint URL');
      }

      this.isInitialized = true;
      this.logger.info('Soniox translation provider initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Soniox translation provider');
      throw error;
    }
  }

  async dispose(): Promise<void> {
    this.isInitialized = false;
    this.logger.info('Soniox translation provider disposed');
  }

  async createTranslationStream(options: TranslationStreamOptions): Promise<TranslationStreamInstance> {
    if (!this.isInitialized) {
      throw new Error('Soniox translation provider not initialized');
    }

    // Validate language pair
    if (!this.supportsLanguagePair(options.sourceLanguage, options.targetLanguage)) {
      throw new InvalidLanguagePairError(
        `Soniox does not support translation from ${options.sourceLanguage} to ${options.targetLanguage}`,
        options.sourceLanguage,
        options.targetLanguage
      );
    }

    const stream = new SonioxTranslationStream(options, this, this.config);
    await stream.initialize();

    this.recordSuccess();
    return stream;
  }

  supportsLanguagePair(source: string, target: string): boolean {
    // Use the utility to check if the language pair is supported
    return SonioxTranslationUtils.supportsTranslation(source, target);
  }

  supportsAutoDetection(): boolean {
    return true; // Soniox supports auto language detection
  }

  getCapabilities(): TranslationProviderCapabilities {
    // Build supported pairs from actual Soniox mappings
    const supportedPairs = new Map<string, string[]>();

    // For each supported language, check what it can translate to
    for (const sourceLanguage of this.supportedLanguages) {
      const targets: string[] = [];

      for (const targetLanguage of this.supportedLanguages) {
        if (sourceLanguage !== targetLanguage &&
          SonioxTranslationUtils.supportsTranslation(sourceLanguage, targetLanguage)) {
          targets.push(targetLanguage);
        }
      }

      if (targets.length > 0) {
        supportedPairs.set(sourceLanguage, targets);
      }
    }

    return {
      supportedLanguagePairs: supportedPairs,
      supportsAutoDetection: true,
      supportsRealtimeTranslation: true,
      maxConcurrentStreams: this.config.maxConnections || 20
    };
  }

  getHealthStatus(): TranslationProviderHealthStatus {
    return { ...this.healthStatus };
  }

  recordFailure(error: Error): void {
    this.healthStatus.failures++;
    this.healthStatus.lastFailure = Date.now();
    this.healthStatus.reason = error.message;

    // Mark unhealthy after 3 consecutive failures
    if (this.healthStatus.failures >= 3) {
      this.healthStatus.isHealthy = false;
    }
  }

  recordSuccess(): void {
    this.healthStatus.failures = 0;
    this.healthStatus.isHealthy = true;
    this.healthStatus.lastCheck = Date.now();
    delete this.healthStatus.reason;
  }
}