/**
 * @fileoverview TranscriptionManager - Per-session transcription management with provider abstraction
 */

import { Logger } from 'pino';
import { ExtendedStreamType, getLanguageInfo } from '@mentra/sdk';
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
   * Feed audio to all active streams
   */
  feedAudio(audioData: ArrayBuffer): void {
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
        this.logger.error(error , 'Error processing pending operation');
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
      }, 'Stream created successfully');
      
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
        // Relay to apps that are subscribed
        this.relayDataToApps(subscription, data);
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
      this.scheduleStreamRetry(subscription, attempts + 1);
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
  
  private scheduleStreamRetry(subscription: ExtendedStreamType, attempt: number): void {
    this.streamRetryAttempts.set(subscription, attempt);
    
    const delay = this.config.retries.retryDelayMs * attempt; // Simple linear backoff
    
    this.logger.info({
      subscription,
      attempt,
      delay
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
  
  private relayDataToApps(subscription: ExtendedStreamType, data: any): void {
    try {
      // Import session service to avoid circular dependencies
      const { sessionService } = require('../session.service');
      
      // Create message in the expected format for apps
      const messageData = {
        type: subscription, // The subscription type (e.g., 'transcription:en-US')
        data: data,
        timestamp: new Date()
      };
      
      // Relay the data using the existing session service method
      sessionService.relayMessageToApps(this.userSession, messageData);
      
      this.logger.debug({
        subscription,
        dataType: data.type,
        isFinal: data.isFinal
      }, 'Relayed transcription data to subscribed apps');
      
    } catch (error) {
      this.logger.error({
        error,
        subscription,
        data
      }, 'Failed to relay transcription data to apps');
    }
  }
}