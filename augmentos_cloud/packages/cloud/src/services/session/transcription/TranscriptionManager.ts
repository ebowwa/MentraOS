/**
 * @fileoverview TranscriptionManager - Per-session transcription management with provider abstraction
 */

import { Logger } from 'pino';
import { ExtendedStreamType, getLanguageInfo, StreamType, CloudToAppMessageType, DataStream } from '@mentra/sdk';
import UserSession from '../UserSession';
import { PosthogService } from '../../logging/posthog.service';
import {
  TranscriptionConfig,
  TranscriptionProvider,
  StreamInstance,
  ProviderType,
  StreamState,
  TranscriptionError,
  InvalidSubscriptionError,
  NoProviderAvailableError,
  ResourceLimitError,
  StreamCreationTimeoutError,
  StreamInitializationError,
  DEFAULT_TRANSCRIPTION_CONFIG
} from './types';
import { ProviderSelector } from './ProviderSelector';
import { AzureTranscriptionProvider } from './providers/AzureTranscriptionProvider';
import { SonioxTranscriptionProvider } from './providers/SonioxTranscriptionProvider';
import subscriptionService from '../subscription.service';

export class TranscriptionManager {
  public readonly logger: Logger;

  // Provider Management
  private providers = new Map<ProviderType, TranscriptionProvider>();
  private providerSelector?: ProviderSelector;

  // Initialization State
  private isInitialized = false;
  private initializationPromise: Promise<void>;
  private pendingOperations: Array<() => Promise<void>> = [];

  // Stream Management
  private streams = new Map<string, StreamInstance>();
  private activeSubscriptions = new Set<ExtendedStreamType>();

  // Retry Logic
  private streamRetryAttempts = new Map<string, number>();
  private streamCreationInProgress = new Set<string>();

  // VAD Audio Buffering (to prevent missing speech during stream startup)
  private vadAudioBuffer: ArrayBuffer[] = [];
  private vadBufferMaxSize = 50; // ~2.5 seconds at 50ms chunks
  private isBufferingForVAD = false;
  private vadBufferTimeout?: NodeJS.Timeout;
  private vadBufferTimeoutMs = 10000; // 10 second timeout if VAD never turns off

  // Health Monitoring
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private userSession: UserSession,
    private config: TranscriptionConfig = DEFAULT_TRANSCRIPTION_CONFIG
  ) {
    this.logger = userSession.logger.child({ service: 'TranscriptionManager' });

    // Start initialization but don't block constructor
    this.initializationPromise = this.initializeProviders();
    this.startHealthMonitoring();

    this.logger.info({
      defaultProvider: this.config.providers.defaultProvider,
      fallbackProvider: this.config.providers.fallbackProvider
    }, 'TranscriptionManager created - initializing providers...');
  }

  /**
   * Update active subscriptions (main entry point)
   */
  async updateSubscriptions(subscriptions: ExtendedStreamType[]): Promise<void> {
    // Ensure we're initialized before processing subscriptions
    await this.ensureInitialized();

    const desired = new Set(subscriptions);
    const current = new Set(this.streams.keys());

    this.logger.debug({
      desired: Array.from(desired),
      current: Array.from(current)
    }, 'Updating transcription subscriptions');

    // Start new streams
    for (const subscription of desired) {
      if (!current.has(subscription)) {
        await this.startStream(subscription);
      }
    }

    // Stop removed streams
    for (const subscription of current) {
      if (!desired.has(subscription)) {
        await this.stopStream(subscription);
      }
    }

    this.activeSubscriptions = desired;
  }

  /**
   * Finalize pending tokens in all active streams (called when VAD stops)
   * This forces all providers to send final transcriptions for any buffered content
   */
  finalizePendingTokens(): void {
    this.logger.debug({
      activeStreams: this.streams.size
    }, 'Finalizing pending tokens in all streams due to VAD stop');

    for (const [subscription, stream] of this.streams) {
      try {
        // Check if this is a Soniox provider with buffered tokens
        if (stream.provider.name === 'soniox' && 'forceFinalizePendingTokens' in stream.provider) {
          (stream.provider as any).forceFinalizePendingTokens();
          this.logger.debug({
            subscription,
            streamId: stream.id,
            provider: 'soniox'
          }, 'Forced finalization of Soniox tokens');
        }
        // Azure doesn't need forced finalization as it sends final results immediately
        // Other providers can be added here as needed
      } catch (error) {
        this.logger.warn({
          subscription,
          error,
          streamId: stream.id,
          provider: stream.provider.name
        }, 'Error finalizing pending tokens');
      }
    }
  }

  /**
   * Stop all transcription streams and finalize any pending tokens
   * This is the proper way to stop transcription when VAD detects silence
   */
  async stopAndFinalizeAll(): Promise<void> {
    this.logger.info('Stopping all transcription streams and finalizing pending tokens');

    // First finalize any pending tokens
    this.finalizePendingTokens();

    // Clear any VAD audio buffer (don't flush since VAD stopped)
    this.clearVADBuffer();

    // Then stop all streams
    await this.updateSubscriptions([]);
  }

  /**
   * Restart transcription with the current active subscriptions
   * This is called when VAD detects speech after a period of silence
   */
  async restartFromActiveSubscriptions(): Promise<void> {
    const currentSubscriptions = Array.from(this.activeSubscriptions);

    this.logger.info({
      subscriptions: currentSubscriptions,
      bufferSize: this.vadAudioBuffer.length
    }, 'Restarting transcription streams from active subscriptions (VAD triggered)');

    // Start buffering audio immediately to avoid losing speech during startup
    this.startVADBuffering();

    // For VAD scenarios, we want faster startup - try parallel initialization
    const startPromises = currentSubscriptions.map(subscription =>
      this.startStreamFast(subscription)
    );

    // Wait for all streams to start in parallel
    const results = await Promise.allSettled(startPromises);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn({
          subscription: currentSubscriptions[index],
          error: result.reason
        }, 'Failed to start stream during VAD restart');
      }
    });

    // Flush buffered audio to streams and stop buffering
    this.flushVADBuffer();
  }

  /**
   * Start buffering audio for VAD scenarios
   */
  private startVADBuffering(): void {
    this.isBufferingForVAD = true;
    this.vadAudioBuffer = []; // Clear any old buffer

    // Set timeout to automatically flush buffer if VAD never completes
    this.vadBufferTimeout = setTimeout(() => {
      this.logger.warn({
        bufferSize: this.vadAudioBuffer.length,
        timeoutMs: this.vadBufferTimeoutMs
      }, 'VAD buffer timeout reached - force flushing buffer');

      this.flushVADBuffer();
    }, this.vadBufferTimeoutMs);

    this.logger.debug({
      timeoutMs: this.vadBufferTimeoutMs
    }, 'Started VAD audio buffering to prevent speech loss during stream startup');
  }

  /**
   * Flush buffered audio to all active streams
   */
  private flushVADBuffer(): void {
    // Clear timeout if it exists
    if (this.vadBufferTimeout) {
      clearTimeout(this.vadBufferTimeout);
      this.vadBufferTimeout = undefined;
    }

    if (!this.isBufferingForVAD || this.vadAudioBuffer.length === 0) {
      this.isBufferingForVAD = false;
      return;
    }

    this.logger.debug({
      bufferSize: this.vadAudioBuffer.length,
      activeStreams: this.streams.size
    }, 'Flushing VAD audio buffer to active streams');

    // Send all buffered audio chunks to active streams
    for (const audioData of this.vadAudioBuffer) {
      this.feedAudioToStreams(audioData);
    }

    // Clear buffer and stop buffering
    this.vadAudioBuffer = [];
    this.isBufferingForVAD = false;
  }

  /**
   * Clear VAD buffer without flushing (called when VAD stops)
   */
  private clearVADBuffer(): void {
    // Clear timeout if it exists
    if (this.vadBufferTimeout) {
      clearTimeout(this.vadBufferTimeout);
      this.vadBufferTimeout = undefined;
    }

    this.vadAudioBuffer = [];
    this.isBufferingForVAD = false;
    this.logger.debug('Cleared VAD audio buffer');
  }

  /**
   * Fast stream startup optimized for VAD scenarios
   * Uses shorter timeout and skips some non-critical checks
   */
  private async startStreamFast(subscription: ExtendedStreamType): Promise<void> {
    // Use a shorter timeout for VAD scenarios (2 seconds vs 10 seconds)
    const VAD_TIMEOUT_MS = 2000;

    try {
      // Check if stream already exists and is healthy
      const existingStream = this.streams.get(subscription);
      if (existingStream && this.isStreamHealthy(existingStream)) {
        this.logger.debug({ subscription }, 'Stream already exists and healthy - no restart needed');
        return;
      }

      // Use the regular startStream but with shorter timeout for VAD
      await this.startStreamWithTimeout(subscription, VAD_TIMEOUT_MS);

    } catch (error) {
      this.logger.warn({
        subscription,
        error,
        timeout: VAD_TIMEOUT_MS
      }, 'Fast stream start failed - falling back to regular startup');

      // Fallback to regular startup with full timeout
      await this.startStream(subscription);
    }
  }

  /**
   * Start stream with custom timeout
   */
  private async startStreamWithTimeout(subscription: ExtendedStreamType, timeoutMs: number): Promise<void> {
    // Ensure we're initialized before starting streams
    await this.ensureInitialized();

    // Prevent duplicate creation
    if (this.streamCreationInProgress.has(subscription)) {
      this.logger.debug({ subscription }, 'Stream creation already in progress');
      return;
    }

    // Check existing stream
    const existingStream = this.streams.get(subscription);
    if (existingStream && this.isStreamHealthy(existingStream)) {
      this.logger.debug({ subscription }, 'Stream already exists and healthy');
      return;
    }

    // Clean up any existing stream
    if (existingStream) {
      await this.cleanupStream(subscription, 'replacing_stream');
    }

    this.streamCreationInProgress.add(subscription);

    try {
      // Provider selector should be initialized now
      if (!this.providerSelector) {
        throw new Error('TranscriptionManager initialization failed - no provider selector');
      }

      // Validate subscription (cached after first validation)
      const validation = await this.providerSelector.validateSubscription(subscription);
      if (!validation.valid) {
        throw new InvalidSubscriptionError(validation.error!, subscription, validation.suggestions);
      }

      // Skip resource limits check for VAD scenarios - we need speed
      // await this.checkResourceLimits();

      // Select provider (prioritize Soniox for VAD scenarios)
      const provider = await this.providerSelector.selectProvider(subscription);

      // Create stream
      const stream = await this.createStreamInstance(subscription, provider);

      // Wait for ready with custom timeout
      await this.waitForStreamReady(stream, timeoutMs);

      // Success!
      this.streams.set(subscription, stream);

      this.logger.info({
        subscription,
        provider: provider.name,
        streamId: stream.id,
        timeoutUsed: timeoutMs
      }, 'Stream started successfully with fast startup');

    } catch (error) {
      this.logger.error({
        subscription,
        error,
        timeoutUsed: timeoutMs
      }, 'Failed to start stream with custom timeout');
      throw error;
    } finally {
      this.streamCreationInProgress.delete(subscription);
    }
  }

  /**
   * Feed audio to all active streams
   */
  feedAudio(audioData: ArrayBuffer): void {
    // If we're buffering for VAD, add to buffer
    if (this.isBufferingForVAD) {
      this.vadAudioBuffer.push(audioData);

      // Prevent buffer from growing too large
      if (this.vadAudioBuffer.length > this.vadBufferMaxSize) {
        this.vadAudioBuffer.shift(); // Remove oldest chunk
      }

      this.logger.debug({
        bufferSize: this.vadAudioBuffer.length,
        maxSize: this.vadBufferMaxSize
      }, 'Buffering audio for VAD startup');
      return;
    }

    // Normal audio feeding
    this.feedAudioToStreams(audioData);
  }

  /**
   * Internal method to feed audio directly to streams
   */
  private feedAudioToStreams(audioData: ArrayBuffer): void {
    // Don't feed audio if not initialized - just silently drop it
    if (!this.isInitialized || this.streams.size === 0) {
      return;
    }

    for (const [subscription, stream] of this.streams) {
      try {
        stream.writeAudio(audioData);
      } catch (error) {
        this.logger.warn({
          subscription,
          error,
          streamId: stream.id
        }, 'Error feeding audio to stream');
      }
    }
  }

  /**
   * Get current stream metrics
   */
  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {
      totalStreams: this.streams.size,
      activeStreams: 0,
      byProvider: {} as Record<string, any>,
      byState: {} as Record<string, number>
    };

    // Count by provider and state
    for (const stream of this.streams.values()) {
      // By provider
      const providerName = stream.provider.name;
      if (!metrics.byProvider[providerName]) {
        metrics.byProvider[providerName] = 0;
      }
      metrics.byProvider[providerName]++;

      // By state
      if (!metrics.byState[stream.state]) {
        metrics.byState[stream.state] = 0;
      }
      metrics.byState[stream.state]++;

      // Active count
      if (stream.state === StreamState.READY || stream.state === StreamState.ACTIVE) {
        metrics.activeStreams++;
      }
    }

    return metrics;
  }

  /**
   * Dispose of the manager and cleanup resources
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing TranscriptionManager');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Close all streams
    const closePromises = Array.from(this.streams.values()).map(stream =>
      stream.close().catch(error =>
        this.logger.warn({ error, streamId: stream.id }, 'Error closing stream during disposal')
      )
    );

    await Promise.allSettled(closePromises);
    this.streams.clear();

    // Dispose providers
    const providerDisposePromises = Array.from(this.providers.values()).map(provider =>
      provider.dispose().catch(error =>
        this.logger.warn({ error, provider: provider.name }, 'Error disposing provider')
      )
    );

    await Promise.allSettled(providerDisposePromises);
    this.providers.clear();

    // Call cleanup method asynchronously but don't wait for it
    // to match the synchronous dispose pattern of other managers
    await this.cleanup();

    this.logger.info('TranscriptionManager disposed');
  }

  // ===== PRIVATE METHODS =====

  /**
   * Ensure manager is fully initialized before proceeding
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.debug('Waiting for TranscriptionManager initialization...');
    await this.initializationPromise;

    if (!this.isInitialized) {
      throw new Error('TranscriptionManager initialization failed');
    }
  }

  /**
   * Process any operations that were queued while initializing
   */
  private async processPendingOperations(): Promise<void> {
    if (this.pendingOperations.length === 0) {
      return;
    }

    this.logger.info({
      pendingOperations: this.pendingOperations.length
    }, 'Processing pending operations after initialization');

    const operations = this.pendingOperations.slice();
    this.pendingOperations = [];

    for (const operation of operations) {
      try {
        await operation();
      } catch (error) {
        this.logger.error(error, 'Error processing pending operation');
      }
    }
  }

  private async initializeProviders(): Promise<void> {
    try {
      this.logger.info('Starting provider initialization...');

      const availableProviders: ProviderType[] = [];
      const providerErrors: Array<{ provider: string, error: Error }> = [];

      // Try to initialize Azure provider
      try {
        const azureProvider = new AzureTranscriptionProvider(this.config.azure, this.logger);
        await azureProvider.initialize();
        this.providers.set(ProviderType.AZURE, azureProvider);
        availableProviders.push(ProviderType.AZURE);
        this.logger.info('Azure provider initialized successfully');
      } catch (error) {
        this.logger.error(error, 'Failed to initialize Azure provider');
        providerErrors.push({ provider: 'Azure', error: error as Error });
      }

      // Try to initialize Soniox provider
      try {
        const sonioxProvider = new SonioxTranscriptionProvider(this.config.soniox, this.logger);
        await sonioxProvider.initialize();
        this.providers.set(ProviderType.SONIOX, sonioxProvider);
        availableProviders.push(ProviderType.SONIOX);
        this.logger.info('Soniox provider initialized successfully');
      } catch (error) {
        this.logger.error(error, 'Failed to initialize Soniox provider');
        providerErrors.push({ provider: 'Soniox', error: error as Error });
      }

      // Check if we have at least one provider
      if (this.providers.size === 0) {
        const errorMsg = `No transcription providers available. Errors: ${providerErrors.map(e => `${e.provider}: ${e.error.message}`).join(', ')}`;
        this.logger.error({
          providerErrors,
          config: {
            azureHasKey: !!this.config.azure.key,
            azureRegion: this.config.azure.region,
            sonioxHasKey: !!this.config.soniox.apiKey,
            sonioxEndpoint: this.config.soniox.endpoint
          }
        }, errorMsg);
        throw new Error(errorMsg);
      }

      // Initialize provider selector with available providers
      this.providerSelector = new ProviderSelector(this.providers, this.config, this.logger);

      // Mark as initialized
      this.isInitialized = true;

      this.logger.info({
        availableProviders,
        totalProviders: this.providers.size,
        skippedProviders: providerErrors.length
      }, 'Provider initialization completed');

      if (providerErrors.length > 0) {
        this.logger.warn({
          providerErrors: providerErrors.map(e => ({ provider: e.provider, error: e.error.message }))
        }, 'Some providers failed to initialize but system will continue with available providers');
      }

      // Process any pending operations
      await this.processPendingOperations();

    } catch (error) {
      this.logger.error({ error }, 'Critical failure in provider initialization');
      throw error;
    }
  }

  private async startStream(subscription: ExtendedStreamType): Promise<void> {
    // Ensure we're initialized before starting streams
    await this.ensureInitialized();

    // Prevent duplicate creation
    if (this.streamCreationInProgress.has(subscription)) {
      this.logger.debug({ subscription }, 'Stream creation already in progress');
      return;
    }

    // Check existing stream
    const existingStream = this.streams.get(subscription);
    if (existingStream && this.isStreamHealthy(existingStream)) {
      this.logger.debug({ subscription }, 'Stream already exists and healthy');
      return;
    }

    // Clean up any existing stream
    if (existingStream) {
      await this.cleanupStream(subscription, 'replacing_stream');
    }

    this.streamCreationInProgress.add(subscription);

    try {
      // Provider selector should be initialized now
      if (!this.providerSelector) {
        throw new Error('TranscriptionManager initialization failed - no provider selector');
      }

      // Validate subscription
      const validation = await this.providerSelector.validateSubscription(subscription);
      if (!validation.valid) {
        throw new InvalidSubscriptionError(validation.error!, subscription, validation.suggestions);
      }

      // Check resource limits
      await this.checkResourceLimits();

      // Select provider
      const provider = await this.providerSelector.selectProvider(subscription);

      // Create stream
      const stream = await this.createStreamInstance(subscription, provider);

      // Wait for ready (with timeout)
      await this.waitForStreamReady(stream, this.config.performance.streamTimeoutMs);

      // Success!
      this.streams.set(subscription, stream);

      this.logger.info({
        subscription,
        provider: provider.name,
        streamId: stream.id,
        initTime: stream.metrics.initializationTime
      }, `🚀 STREAM CREATED: [${provider.name.toUpperCase()}] for "${subscription}" (${stream.metrics.initializationTime}ms)`);

      // Track success
      PosthogService.trackEvent('transcription_stream_created', this.userSession.userId, {
        subscription,
        provider: provider.name,
        sessionId: this.userSession.sessionId
      });

    } catch (error) {
      this.logger.error({ subscription, error }, 'Stream creation failed');
      await this.handleStreamError(subscription, null, error as Error);
      throw error;

    } finally {
      this.streamCreationInProgress.delete(subscription);
    }
  }

  private async stopStream(subscription: ExtendedStreamType): Promise<void> {
    const stream = this.streams.get(subscription);
    if (stream) {
      this.logger.info({ subscription, streamId: stream.id }, 'Stopping stream');

      try {
        await stream.close();
      } catch (error) {
        this.logger.warn({ error, subscription }, 'Error stopping stream');
      }

      this.streams.delete(subscription);
      this.streamRetryAttempts.delete(subscription);
    }
  }

  private async createStreamInstance(
    subscription: ExtendedStreamType,
    provider: TranscriptionProvider
  ): Promise<StreamInstance> {

    const languageInfo = getLanguageInfo(subscription)!;
    const streamId = this.generateStreamId(subscription);

    const callbacks = this.createStreamCallbacks(subscription);
    const options = {
      streamId,
      userSession: this.userSession,
      subscription,
      callbacks
    };

    if (languageInfo.type === 'translation') {
      return await provider.createTranslationStream(
        languageInfo.transcribeLanguage,
        languageInfo.translateLanguage!,
        options
      );
    } else {
      return await provider.createTranscriptionStream(
        languageInfo.transcribeLanguage,
        options
      );
    }
  }

  private createStreamCallbacks(subscription: ExtendedStreamType) {
    return {
      onReady: () => {
        this.logger.debug({ subscription }, 'Stream ready');
      },

      onError: (error: Error) => {
        const stream = this.streams.get(subscription);
        if (stream) {
          this.handleStreamError(subscription, stream, error);
        }
      },

      onClosed: () => {
        this.logger.info({ subscription }, 'Stream closed by provider');
        this.streams.delete(subscription);
      },

      onData: (data: any) => {
        // Relay to apps that are subscribed (async but don't await to avoid blocking)
        this.relayDataToApps(subscription, data).catch(error => {
          this.logger.error({ error, subscription, data }, 'Error in async relayDataToApps');
        });
      }
    };
  }

  private async handleStreamError(
    subscription: ExtendedStreamType,
    stream: StreamInstance | null,
    error: Error
  ): Promise<void> {

    const currentProvider = stream?.provider.name;

    this.logger.warn({
      subscription,
      error: error.message,
      provider: currentProvider
    }, 'Stream error occurred');

    // Record provider failure
    if (stream) {
      stream.provider.recordFailure(error);
    }

    // Clean up failed stream
    await this.cleanupStream(subscription, 'provider_error');

    // Try failover to different provider first
    if (currentProvider && await this.tryDifferentProvider(subscription, currentProvider)) {
      return; // Success - we're done
    }

    // If no other provider works, retry with same provider (like before)
    const attempts = this.streamRetryAttempts.get(subscription) || 0;
    if (attempts < this.config.retries.maxStreamRetries && this.isRetryableError(error)) {
      this.scheduleStreamRetry(subscription, attempts + 1, error);
    } else {
      this.logger.error({ subscription, attempts }, 'All providers and retries exhausted');
      this.streamRetryAttempts.delete(subscription);

      // Track final failure
      PosthogService.trackEvent('transcription_stream_permanent_failure', this.userSession.userId, {
        subscription,
        totalAttempts: attempts,
        finalError: error.message,
        sessionId: this.userSession.sessionId
      });
    }
  }

  private async tryDifferentProvider(
    subscription: ExtendedStreamType,
    failedProvider: ProviderType
  ): Promise<boolean> {

    try {
      // Ensure we're initialized before trying different provider
      await this.ensureInitialized();

      // Provider selector should be initialized now
      if (!this.providerSelector) {
        this.logger.warn('Provider selector not initialized after ensureInitialized, cannot failover');
        return false;
      }

      // Select alternative provider (excluding the failed one)
      const newProvider = await this.providerSelector.selectProvider(subscription, {
        excludeProviders: [failedProvider]
      });

      this.logger.info({
        subscription,
        fromProvider: failedProvider,
        toProvider: newProvider.name
      }, 'Attempting provider failover');

      // Create stream with new provider
      const stream = await this.createStreamInstance(subscription, newProvider);
      await this.waitForStreamReady(stream, this.config.performance.streamTimeoutMs);

      // Success!
      this.streams.set(subscription, stream);

      this.logger.info({
        subscription,
        fromProvider: failedProvider,
        toProvider: newProvider.name
      }, 'Provider failover successful');

      // Track successful failover
      PosthogService.trackEvent('transcription_provider_failover', this.userSession.userId, {
        fromProvider: failedProvider,
        toProvider: newProvider.name,
        subscription,
        sessionId: this.userSession.sessionId
      });

      return true;

    } catch (error) {
      this.logger.warn({
        subscription,
        failedProvider,
        error
      }, 'Provider failover failed');

      return false;
    }
  }

  private scheduleStreamRetry(subscription: ExtendedStreamType, attempt: number, lastError?: Error): void {
    this.streamRetryAttempts.set(subscription, attempt);

    // Calculate delay with exponential backoff for Soniox rate limiting
    let delay = this.config.retries.retryDelayMs * attempt; // Base linear backoff

    if (lastError && lastError.message.includes('Soniox error')) {
      const errorCodeMatch = lastError.message.match(/Soniox error (\d+):/);
      if (errorCodeMatch) {
        const errorCode = parseInt(errorCodeMatch[1]);

        // Use exponential backoff for rate limits (429)
        if (errorCode === 429) {
          delay = Math.min(this.config.retries.retryDelayMs * Math.pow(2, attempt - 1), 60000); // Cap at 1 minute
          this.logger.warn({
            subscription,
            attempt,
            delay,
            errorCode
          }, 'Using exponential backoff for Soniox rate limit');
        }

        // Use longer delay for server errors (5xx)
        else if (errorCode >= 500) {
          delay = this.config.retries.retryDelayMs * attempt * 2; // Double the linear delay
          this.logger.warn({
            subscription,
            attempt,
            delay,
            errorCode
          }, 'Using extended delay for Soniox server error');
        }
      }
    }

    this.logger.info({
      subscription,
      attempt,
      delay,
      errorType: lastError?.message.includes('Soniox') ? 'soniox' : 'general'
    }, 'Scheduling stream retry');

    setTimeout(async () => {
      try {
        await this.startStream(subscription);
        this.streamRetryAttempts.delete(subscription); // Success

        this.logger.info({ subscription, attempt }, 'Stream retry successful');
      } catch (error) {
        // Will trigger another retry cycle if attempts remaining
        this.logger.warn({ subscription, attempt, error }, 'Stream retry failed');
      }
    }, delay);
  }

  private isRetryableError(error: Error): boolean {
    // Don't retry certain errors
    if (error instanceof InvalidSubscriptionError ||
      error instanceof NoProviderAvailableError ||
      error instanceof ResourceLimitError) {
      return false;
    }

    // Soniox-specific error handling
    if (error.message.includes('Soniox error')) {
      // Extract error code if available
      const errorCodeMatch = error.message.match(/Soniox error (\d+):/);
      if (errorCodeMatch) {
        const errorCode = parseInt(errorCodeMatch[1]);

        // Don't retry authentication/authorization errors (typically 401, 403)
        if (errorCode === 401 || errorCode === 403) {
          this.logger.warn({ errorCode }, 'Soniox authentication error - not retrying');
          return false;
        }

        // Don't retry client errors (4xx range except rate limits)
        if (errorCode >= 400 && errorCode < 500 && errorCode !== 429) {
          this.logger.warn({ errorCode }, 'Soniox client error - not retrying');
          return false;
        }

        // Retry rate limits (429) and server errors (5xx range)
        if (errorCode === 429 || errorCode >= 500) {
          this.logger.info({ errorCode }, 'Soniox retryable error detected');
          return true;
        }
      }

      // For Soniox errors without clear error codes, be more conservative and retry
      // This handles connection issues, network problems, etc.
      return true;
    }

    // Network/connection errors are generally retryable
    if (error.message.includes('ECONNRESET') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('WebSocket') ||
      error.message.includes('connection')) {
      return true;
    }

    // Default to retryable for provider errors
    return true;
  }

  private async waitForStreamReady(stream: StreamInstance, timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (stream.state === StreamState.INITIALIZING && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (stream.state === StreamState.INITIALIZING) {
      throw new StreamCreationTimeoutError('Stream initialization timeout');
    }

    if (stream.state === StreamState.ERROR) {
      throw new StreamInitializationError('Stream initialization failed', {
        error: stream.lastError,
        streamId: stream.id
      });
    }

    if (stream.state !== StreamState.READY) {
      throw new StreamInitializationError(`Stream in unexpected state: ${stream.state}`);
    }
  }

  private async cleanupStream(subscription: ExtendedStreamType, reason: string): Promise<void> {
    const stream = this.streams.get(subscription);
    if (stream) {
      this.logger.debug({ subscription, reason }, 'Cleaning up stream');

      try {
        await stream.close();
      } catch (error) {
        this.logger.warn({ error, subscription }, 'Error closing stream during cleanup');
      }

      this.streams.delete(subscription);
    }
  }

  private async checkResourceLimits(): Promise<void> {
    // Check total stream limit
    if (this.streams.size >= this.config.performance.maxTotalStreams) {
      throw new ResourceLimitError(
        `Maximum stream limit reached: ${this.streams.size}/${this.config.performance.maxTotalStreams}`,
        'total_streams'
      );
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryThreshold = this.config.performance.maxMemoryUsageMB * 1024 * 1024;

    if (memoryUsage.heapUsed > memoryThreshold) {
      this.logger.warn({ memoryUsage }, 'High memory usage detected');
      await this.cleanupIdleStreams();
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.cleanupDeadStreams();
    }, this.config.performance.healthCheckIntervalMs);
  }

  private async cleanupDeadStreams(): Promise<void> {
    const now = Date.now();
    const deadStreams: [string, StreamInstance][] = [];

    for (const [subscription, stream] of this.streams) {
      const timeSinceActivity = now - stream.lastActivity;

      // Stream is dead if:
      // - No activity for 5 minutes
      // - State is ERROR or CLOSED
      // - Too many consecutive failures
      const isDead =
        timeSinceActivity > 300000 || // 5 minutes
        stream.state === StreamState.ERROR ||
        stream.state === StreamState.CLOSED ||
        stream.metrics.consecutiveFailures >= 10;

      if (isDead) {
        deadStreams.push([subscription, stream]);
      }
    }

    // Clean up dead streams
    for (const [subscription, stream] of deadStreams) {
      this.logger.info({
        subscription,
        streamId: stream.id,
        reason: 'dead_stream_cleanup'
      }, 'Cleaning up dead stream');

      await this.cleanupStream(subscription, 'dead_stream_cleanup');
    }
  }

  private async cleanupIdleStreams(): Promise<void> {
    const now = Date.now();
    const idleThreshold = 600000; // 10 minutes

    for (const [subscription, stream] of this.streams) {
      const timeSinceActivity = now - stream.lastActivity;

      if (timeSinceActivity > idleThreshold &&
        (stream.state === StreamState.READY || stream.state === StreamState.ACTIVE)) {

        this.logger.info({
          subscription,
          timeSinceActivity
        }, 'Cleaning up idle stream to free memory');

        await this.cleanupStream(subscription, 'idle_cleanup');
      }
    }
  }

  private isStreamHealthy(stream: StreamInstance): boolean {
    return stream.state === StreamState.READY ||
      stream.state === StreamState.ACTIVE ||
      stream.state === StreamState.INITIALIZING;
  }

  private generateStreamId(subscription: ExtendedStreamType): string {
    return `${this.userSession.sessionId}-${subscription}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async relayDataToApps(subscription: ExtendedStreamType, data: any): Promise<void> {
    try {
      // CONSTRUCT EFFECTIVE SUBSCRIPTION like the old system
      const streamType = data.type;
      let effectiveSubscription: ExtendedStreamType = streamType;

      // Match old broadcastToApp logic exactly
      if (streamType === StreamType.TRANSLATION) {
        effectiveSubscription = `${streamType}:${data.transcribeLanguage}-to-${data.translateLanguage}`;
      } else if (streamType === StreamType.TRANSCRIPTION && data.transcribeLanguage) {
        effectiveSubscription = `${streamType}:${data.transcribeLanguage}`;
      } else if (streamType === StreamType.TRANSCRIPTION) {
        effectiveSubscription = `${streamType}:en-US`; // Default fallback like old system
      }

      // Get subscribed apps using EFFECTIVE subscription (like old system)
      const subscribedApps = subscriptionService.getSubscribedApps(this.userSession, effectiveSubscription);

      this.logger.debug({
        originalSubscription: subscription,
        effectiveSubscription,
        subscribedApps,
        streamType,
        dataType: data.type,
        transcribeLanguage: data.transcribeLanguage,
        translateLanguage: data.translateLanguage
      }, 'Broadcasting transcription data with effective subscription');

      // Send to each app using APP MANAGER (with resurrection) instead of direct WebSocket
      for (const packageName of subscribedApps) {
        const appSessionId = `${this.userSession.sessionId}-${packageName}`;

        const dataStream: DataStream = {
          type: CloudToAppMessageType.DATA_STREAM,
          sessionId: appSessionId,
          streamType, // Base type remains the same in the message
          data,       // The data now may contain language info
          timestamp: new Date()
        };

        try {
          // USE APP MANAGER instead of direct WebSocket (restores resurrection)
          const result = await this.userSession.appManager.sendMessageToApp(packageName, dataStream);

          if (!result.sent) {
            this.logger.warn({
              packageName,
              resurrectionTriggered: result.resurrectionTriggered,
              error: result.error,
              effectiveSubscription
            }, `Failed to send transcription data to App ${packageName}`);
          } else if (result.resurrectionTriggered) {
            this.logger.info({
              packageName,
              effectiveSubscription
            }, `Transcription data sent to App ${packageName} after resurrection`);
          }
        } catch (error) {
          this.logger.error({
            packageName,
            error: error instanceof Error ? error.message : String(error),
            effectiveSubscription
          }, `Error sending transcription data to App ${packageName}`);
        }
      }

      // Enhanced debug logging to show transcription content and provider
      this.logger.debug({
        subscription,
        effectiveSubscription,
        provider: data.provider || 'unknown',
        dataType: data.type,
        text: data.text ? `"${data.text.substring(0, 100)}${data.text.length > 100 ? '...' : ''}"` : 'no text',
        isFinal: data.isFinal,
        originalText: data.originalText ? `"${data.originalText.substring(0, 50)}${data.originalText.length > 50 ? '...' : ''}"` : undefined,
        translatedTo: data.translateLanguage,
        confidence: data.confidence,
        appsNotified: subscribedApps.length
      }, `📝 TRANSCRIPTION: [${data.provider || 'unknown'}] ${data.isFinal ? 'FINAL' : 'interim'} "${data.text || 'no text'}" → ${subscribedApps.length} apps`);

    } catch (error) {
      this.logger.error({
        error,
        subscription,
        data
      }, 'Failed to relay transcription data to apps');
    }
  }


  /**
   * Cleanup method - should be called when TranscriptionManager is being destroyed
   * This ensures all resources are properly released
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up TranscriptionManager resources');

    try {
      // Clear VAD buffer timeout
      this.clearVADBuffer();

      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }

      // Stop all streams
      await this.updateSubscriptions([]);

      // Clean up all stream instances
      for (const [subscription] of this.streams) {
        await this.cleanupStream(subscription, 'manager_cleanup');
      }

      // Clear all maps
      this.streams.clear();
      this.activeSubscriptions.clear();
      this.streamRetryAttempts.clear();
      this.streamCreationInProgress.clear();

      // Clear pending operations
      this.pendingOperations = [];

      this.logger.info('TranscriptionManager cleanup completed');

    } catch (error) {
      this.logger.error({ error }, 'Error during TranscriptionManager cleanup');
    }
  }
}
