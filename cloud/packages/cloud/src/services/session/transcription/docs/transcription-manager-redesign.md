# TranscriptionManager Redesign - Design Document

## Overview

This document outlines the complete redesign of the transcription system from a singleton service to a per-session manager pattern with provider abstraction. The redesign addresses critical issues with the current system including race conditions, provider lock-in, poor error handling, and lack of observability.

## Current System Problems

### 1. Architecture Issues
- **Not Following Manager Pattern**: Singleton service instead of per-session managers
- **State Management**: Transcription state split between UserSession and service
- **Race Condition**: Audio fed to Azure streams before proper initialization
- **Global State**: Shared state between users causes conflicts

### 2. Provider Lock-in
- **Azure-only**: Tightly coupled to Azure Speech SDK
- **No Abstraction**: No interface for swapping providers
- **Single Point of Failure**: Azure rate limits affect entire system
- **No Fallback**: No alternative when Azure fails

### 3. Translation Complexity
- **Two Different APIs**: ConversationTranscriber vs TranslationRecognizer
- **Language Validation**: No validation of supported language pairs
- **Complex Logic**: Fragile `didTranslate` detection mechanism
- **Poor UX**: Apps must know exact language pair formats

### 4. Observability Gaps
- **Limited Metrics**: Poor tracking of success rates and costs
- **Debugging Difficulty**: Hard to trace issues across providers
- **No Performance Monitoring**: Missing latency and quality metrics

## Proposed Architecture

### Core Design Principles

1. **Manager Pattern**: Follow established pattern used by AppManager, AudioManager, etc.
2. **Provider Abstraction**: Clean interface for multiple transcription providers
3. **Per-Session Isolation**: Each user gets independent transcription management
4. **Smart Failover**: Automatic fallback between providers
5. **Rich Observability**: Comprehensive metrics and monitoring

### Architecture Diagram

```
UserSession
  └── transcriptionManager: TranscriptionManager
      ├── providers: Map<string, TranscriptionProvider>
      │   ├── AzureTranscriptionProvider
      │   ├── SonioxTranscriptionProvider
      │   └── LocalTranscriptionProvider (dev/fallback)
      ├── streams: Map<string, StreamInstance>
      ├── providerSelector: ProviderSelector
      ├── failoverManager: FailoverManager
      ├── metrics: MetricsCollector
      └── config: TranscriptionConfig
```

## Provider Abstraction Layer

### TranscriptionProvider Interface

```typescript
interface TranscriptionProvider {
  // Identification
  readonly name: string;
  readonly version: string;
  
  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  dispose(): Promise<void>;
  
  // Stream Management
  createTranscriptionStream(language: string, options: StreamOptions): Promise<TranscriptionStream>;
  createTranslationStream(sourceLanguage: string, targetLanguage: string, options: StreamOptions): Promise<TranslationStream>;
  
  // Health and Capabilities
  getHealthStatus(): ProviderHealthStatus;
  getLanguageCapabilities(): ProviderLanguageCapabilities;
  supportsLanguage(language: string): boolean;
  validateLanguagePair(source: string, target: string): boolean;
  
  // Cost and Performance
  getCostEstimate(durationMs: number, language: string): CostEstimate;
  getPerformanceMetrics(): ProviderPerformanceMetrics;
}
```

### Provider Implementations

#### AzureTranscriptionProvider
```typescript
class AzureTranscriptionProvider implements TranscriptionProvider {
  name = 'azure';
  
  private speechConfig: SpeechConfig;
  private circuitBreaker: CircuitBreaker;
  private connectionPool: ConnectionPool;
  
  async initialize(config: AzureProviderConfig): Promise<void> {
    this.speechConfig = SpeechConfig.fromSubscription(config.key, config.region);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreakerOptions);
    this.connectionPool = new ConnectionPool(config.maxConnections);
  }
  
  async createTranscriptionStream(language: string, options: StreamOptions): Promise<TranscriptionStream> {
    if (!this.circuitBreaker.canAttemptConnection()) {
      throw new ProviderUnavailableError('Azure circuit breaker is open');
    }
    
    // Create Azure-specific stream implementation
    return new AzureTranscriptionStream(this.speechConfig, language, options);
  }
  
  getLanguageCapabilities(): ProviderLanguageCapabilities {
    return {
      transcriptionLanguages: AZURE_SUPPORTED_LANGUAGES,
      translationPairs: AZURE_TRANSLATION_PAIRS,
      autoLanguageDetection: true,
      realtimeTranslation: true,
      bidirectionalTranslation: false
    };
  }
}
```

#### SonioxTranscriptionProvider
```typescript
class SonioxTranscriptionProvider implements TranscriptionProvider {
  name = 'soniox';
  
  private apiClient: SonioxAPIClient;
  private rateLimiter: RateLimiter;
  
  async initialize(config: SonioxProviderConfig): Promise<void> {
    this.apiClient = new SonioxAPIClient(config.apiKey, config.endpoint);
    this.rateLimiter = new RateLimiter(config.requestsPerSecond);
  }
  
  async createTranscriptionStream(language: string, options: StreamOptions): Promise<TranscriptionStream> {
    await this.rateLimiter.waitForToken();
    return new SonioxTranscriptionStream(this.apiClient, language, options);
  }
  
  // Translation not supported - will return error or fallback
  async createTranslationStream(): Promise<TranslationStream> {
    throw new UnsupportedOperationError('Soniox does not support real-time translation');
  }
  
  getLanguageCapabilities(): ProviderLanguageCapabilities {
    return {
      transcriptionLanguages: SONIOX_SUPPORTED_LANGUAGES,
      translationPairs: new Map(), // No translation support
      autoLanguageDetection: false,
      realtimeTranslation: false,
      bidirectionalTranslation: false
    };
  }
}
```

## Stream Management

### Enhanced Stream Interface

```typescript
interface StreamInstance {
  // Identification
  id: string;
  type: 'transcription' | 'translation';
  subscription: ExtendedStreamType;
  
  // Provider and Configuration
  provider: TranscriptionProvider;
  language: string;
  targetLanguage?: string; // For translation streams
  
  // State Management
  state: StreamState;
  startTime: number;
  readyTime?: number;
  lastActivity: number;
  
  // Metrics
  metrics: StreamMetrics;
  
  // Methods
  writeAudio(data: ArrayBuffer): Promise<boolean>;
  close(): Promise<void>;
  getHealth(): StreamHealth;
  getMetrics(): StreamMetrics;
}

enum StreamState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  ACTIVE = 'active',
  ERROR = 'error',
  CLOSING = 'closing',
  CLOSED = 'closed'
}
```

### State Machine

```
INITIALIZING → READY → ACTIVE → CLOSING → CLOSED
     ↓           ↓        ↓         ↓
   ERROR ←──── ERROR ←─ ERROR ←─── ERROR
```

### Audio Gating Logic

```typescript
class StreamInstance {
  async writeAudio(data: ArrayBuffer): Promise<boolean> {
    // Prevent race condition - only write when ready
    if (this.state !== StreamState.READY && this.state !== StreamState.ACTIVE) {
      this.metrics.audioDroppedCount++;
      return false;
    }
    
    try {
      const success = await this.provider.writeAudio(this.id, data);
      if (success) {
        this.state = StreamState.ACTIVE;
        this.lastActivity = Date.now();
        this.metrics.audioChunksWritten++;
      } else {
        this.metrics.audioWriteFailures++;
      }
      return success;
    } catch (error) {
      this.handleAudioWriteError(error);
      return false;
    }
  }
}
```

## TranscriptionManager Implementation

### Core Manager Class

```typescript
class TranscriptionManager {
  private userSession: UserSession;
  private logger: Logger;
  
  // Provider Management
  private providers: Map<string, TranscriptionProvider>;
  private providerSelector: ProviderSelector;
  private failoverManager: FailoverManager;
  
  // Stream Management  
  private streams: Map<string, StreamInstance>;
  private activeSubscriptions: Set<ExtendedStreamType>;
  
  // Monitoring
  private metrics: MetricsCollector;
  private healthMonitor: HealthMonitor;
  
  constructor(userSession: UserSession, config: TranscriptionConfig) {
    this.userSession = userSession;
    this.logger = userSession.logger.child({ service: 'TranscriptionManager' });
    
    this.initializeProviders(config);
    this.startHealthMonitoring();
  }
  
  async updateSubscriptions(subscriptions: ExtendedStreamType[]): Promise<void> {
    const desired = new Set(subscriptions);
    const current = new Set(this.streams.keys());
    
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
  
  private async startStream(subscription: ExtendedStreamType): Promise<void> {
    try {
      // Validate subscription
      const validation = await this.validateSubscription(subscription);
      if (!validation.valid) {
        throw new InvalidSubscriptionError(validation.error);
      }
      
      // Select provider
      const provider = await this.providerSelector.selectProvider(subscription);
      
      // Create stream
      const stream = await this.createStream(subscription, provider);
      this.streams.set(subscription, stream);
      
      this.logger.info({ subscription, provider: provider.name }, 'Started transcription stream');
      
    } catch (error) {
      await this.handleStreamCreationError(subscription, error);
    }
  }
}
```

## Provider Selection and Failover

### ProviderSelector

```typescript
class ProviderSelector {
  constructor(
    private providers: Map<string, TranscriptionProvider>,
    private config: ProviderSelectionConfig
  ) {}
  
  async selectProvider(subscription: ExtendedStreamType): Promise<TranscriptionProvider> {
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      throw new InvalidSubscriptionError(`Invalid subscription: ${subscription}`);
    }
    
    // Get capable providers
    const capableProviders = this.getCapableProviders(languageInfo);
    if (capableProviders.length === 0) {
      throw new NoCapableProviderError(`No provider supports: ${subscription}`);
    }
    
    // Filter by health
    const healthyProviders = capableProviders.filter(p => 
      p.getHealthStatus().isHealthy
    );
    
    if (healthyProviders.length === 0) {
      throw new NoHealthyProviderError('All capable providers are unhealthy');
    }
    
    // Select based on strategy
    return this.selectByStrategy(healthyProviders, languageInfo);
  }
  
  private selectByStrategy(
    providers: TranscriptionProvider[], 
    languageInfo: LanguageStreamInfo
  ): TranscriptionProvider {
    switch (this.config.selectionStrategy) {
      case 'cost-optimized':
        return this.selectCheapest(providers, languageInfo);
      
      case 'performance-optimized':
        return this.selectFastest(providers, languageInfo);
      
      case 'accuracy-optimized':
        return this.selectMostAccurate(providers, languageInfo);
      
      case 'balanced':
      default:
        return this.selectBalanced(providers, languageInfo);
    }
  }
}
```

### FailoverManager

```typescript
class FailoverManager {
  async handleProviderFailure(
    failedProvider: string, 
    error: Error, 
    affectedStreams: StreamInstance[]
  ): Promise<void> {
    
    // Classify error type
    const errorType = this.classifyError(error);
    
    // Update provider health
    await this.updateProviderHealth(failedProvider, errorType);
    
    // Handle affected streams
    const migrationResults = await Promise.allSettled(
      affectedStreams.map(stream => this.migrateStream(stream))
    );
    
    // Log failover event
    this.logger.error({
      failedProvider,
      errorType,
      affectedStreams: affectedStreams.length,
      migrationResults: migrationResults.filter(r => r.status === 'fulfilled').length
    }, 'Provider failover completed');
    
    // Track in analytics
    PosthogService.trackEvent('transcription_provider_failover', this.userSession.userId, {
      fromProvider: failedProvider,
      errorType,
      affectedStreams: affectedStreams.length,
      sessionId: this.userSession.sessionId
    });
  }
  
  private async migrateStream(stream: StreamInstance): Promise<void> {
    try {
      // Select alternative provider
      const newProvider = await this.providerSelector.selectProvider(
        stream.subscription, 
        { exclude: [stream.provider.name] }
      );
      
      // Create replacement stream
      const newStream = await this.createReplacementStream(stream, newProvider);
      
      // Atomic replacement
      await this.replaceStream(stream, newStream);
      
    } catch (error) {
      this.logger.error({ error, streamId: stream.id }, 'Failed to migrate stream');
      throw error;
    }
  }
}
```

## Language and Translation Handling

### Language Capabilities

```typescript
interface ProviderLanguageCapabilities {
  // Basic transcription
  transcriptionLanguages: string[];
  
  // Translation pairs (source → targets)
  translationPairs: Map<string, string[]>;
  
  // Advanced features
  autoLanguageDetection: boolean;
  realtimeTranslation: boolean;
  bidirectionalTranslation: boolean;
  confidenceScoring: boolean;
  speakerDiarization: boolean;
  
  // Quality and performance
  latencyMs: {
    transcription: number;
    translation: number;
  };
  
  accuracyScores?: {
    [language: string]: number; // 0-1 accuracy score
  };
}
```

### Enhanced Translation Support

```typescript
interface EnhancedTranslationData extends TranslationData {
  // Provider information
  provider: string;
  processingLatency: number;
  
  // Confidence and quality
  transcriptionConfidence: number;
  translationConfidence: number;
  
  // Language detection
  detectedSourceLanguage?: string;
  languageDetectionConfidence?: number;
  
  // Alternative results
  alternativeTranscriptions?: string[];
  alternativeTranslations?: string[];
  
  // Cost tracking
  estimatedCost: number;
  tokensProcessed: number;
}
```

### Language Validation

```typescript
class LanguageValidator {
  validateSubscription(subscription: ExtendedStreamType): ValidationResult {
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      return { valid: false, error: 'Invalid subscription format' };
    }
    
    if (languageInfo.type === StreamType.TRANSLATION) {
      return this.validateTranslationPair(
        languageInfo.transcribeLanguage,
        languageInfo.translateLanguage!
      );
    }
    
    return this.validateTranscriptionLanguage(languageInfo.transcribeLanguage);
  }
  
  private validateTranslationPair(source: string, target: string): ValidationResult {
    const supportingProviders = Array.from(this.providers.values())
      .filter(provider => provider.validateLanguagePair(source, target));
    
    if (supportingProviders.length === 0) {
      return {
        valid: false,
        error: `No provider supports translation ${source} → ${target}`,
        suggestions: this.getSuggestedLanguagePairs(source)
      };
    }
    
    return { valid: true, supportingProviders };
  }
  
  getSupportedLanguages(): LanguageSupportResponse {
    const allCapabilities = Array.from(this.providers.values())
      .map(p => p.getLanguageCapabilities());
    
    return {
      transcription: this.mergeLanguageLists(allCapabilities),
      translation: this.mergeTranslationPairs(allCapabilities),
      byProvider: this.getProviderSpecificCapabilities(allCapabilities)
    };
  }
}
```

## Metrics and Monitoring

### Comprehensive Metrics

```typescript
interface StreamMetrics {
  // Lifecycle
  initializationTime: number;
  totalDuration: number;
  activeTime: number;
  
  // Audio Processing
  audioChunksReceived: number;
  audioChunksWritten: number;
  audioDroppedCount: number;
  audioWriteFailures: number;
  audioLatencyMs: number[];
  
  // Provider Performance
  providerLatency: number[];
  apiCallCount: number;
  apiCallFailures: number;
  retryCount: number;
  
  // Quality Metrics
  transcriptionWords: number;
  translationWords?: number;
  averageConfidence: number;
  lowConfidenceCount: number;
  
  // Cost Tracking
  estimatedCost: number;
  costPerMinute: number;
  tokensProcessed: number;
  
  // Error Tracking
  errorCount: number;
  errorsByType: Map<string, number>;
  lastError?: Error;
}

interface AggregatedMetrics {
  // System-wide metrics
  totalStreams: number;
  activeStreams: number;
  averageStreamDuration: number;
  
  // Provider comparison
  providerPerformance: Map<string, ProviderMetrics>;
  providerReliability: Map<string, number>; // 0-1 reliability score
  
  // Cost analysis
  totalCost: number;
  costByProvider: Map<string, number>;
  costTrends: TimeSeries[];
  
  // Quality analysis
  overallAccuracy: number;
  accuracyByLanguage: Map<string, number>;
  accuracyByProvider: Map<string, number>;
}
```

### PostHog Analytics Integration

```typescript
class TranscriptionAnalytics {
  trackStreamCreated(stream: StreamInstance): void {
    PosthogService.trackEvent('transcription_stream_created', this.userId, {
      streamType: stream.type,
      language: stream.language,
      targetLanguage: stream.targetLanguage,
      provider: stream.provider.name,
      sessionId: this.sessionId
    });
  }
  
  trackStreamCompleted(stream: StreamInstance): void {
    const metrics = stream.getMetrics();
    
    PosthogService.trackEvent('transcription_stream_completed', this.userId, {
      streamType: stream.type,
      provider: stream.provider.name,
      duration: metrics.totalDuration,
      successRate: metrics.audioChunksWritten / metrics.audioChunksReceived,
      averageLatency: this.average(metrics.providerLatency),
      cost: metrics.estimatedCost,
      errorCount: metrics.errorCount,
      sessionId: this.sessionId
    });
    
    // Update person properties
    PosthogService.setPersonProperties(this.userId, {
      transcription_total_streams: this.getTotalStreamCount(),
      transcription_preferred_languages: this.getPreferredLanguages(),
      transcription_total_cost: this.getTotalCost(),
      transcription_providers_used: this.getProvidersUsed()
    });
  }
  
  trackProviderFailover(from: string, to: string, reason: string): void {
    PosthogService.trackEvent('transcription_provider_failover', this.userId, {
      fromProvider: from,
      toProvider: to,
      reason,
      sessionId: this.sessionId
    });
  }
}
```

## Configuration System

### TranscriptionConfig

```typescript
interface TranscriptionConfig {
  // Provider configurations
  providers: {
    azure: AzureProviderConfig;
    soniox: SonioxProviderConfig;
    local?: LocalProviderConfig;
  };
  
  // Selection strategy
  selection: {
    strategy: 'cost-optimized' | 'performance-optimized' | 'accuracy-optimized' | 'balanced';
    preferredProvider?: string;
    fallbackChain: string[];
    enableFailover: boolean;
  };
  
  // Performance tuning
  performance: {
    maxStreamsPerProvider: number;
    streamTimeoutMs: number;
    audioWriteTimeoutMs: number;
    healthCheckIntervalMs: number;
    metricsReportingIntervalMs: number;
  };
  
  // Error handling
  errorHandling: {
    maxRetries: number;
    retryDelayMs: number;
    exponentialBackoff: boolean;
    circuitBreakerThreshold: number;
    circuitBreakerTimeoutMs: number;
  };
  
  // Cost management
  cost: {
    budgetLimits: {
      daily?: number;
      monthly?: number;
    };
    costOptimization: boolean;
    alertThresholds: number[];
  };
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Create TranscriptionManager class structure
- [ ] Implement basic provider interface
- [ ] Create AzureTranscriptionProvider wrapper
- [ ] Migrate UserSession to use TranscriptionManager
- [ ] Fix race condition with proper state management

### Phase 2: Provider Abstraction (Week 3-4)
- [ ] Complete provider interface implementation
- [ ] Add ProviderSelector with health checking
- [ ] Implement circuit breakers and rate limiting
- [ ] Add basic metrics collection
- [ ] Create LocalTranscriptionProvider for testing

### Phase 3: Soniox Integration (Week 5-6)
- [ ] Research Soniox API and capabilities
- [ ] Implement SonioxTranscriptionProvider
- [ ] Add provider comparison and selection logic
- [ ] Implement failover mechanisms
- [ ] Add language capability validation

### Phase 4: Enhanced Features (Week 7-8)
- [ ] Complete metrics and analytics integration
- [ ] Add cost tracking and optimization
- [ ] Implement advanced error handling
- [ ] Add configuration management
- [ ] Create monitoring dashboards

### Phase 5: Testing and Optimization (Week 9-10)
- [ ] Comprehensive testing with multiple providers
- [ ] Performance optimization and tuning
- [ ] Load testing and scalability validation
- [ ] Documentation and developer guides
- [ ] Production deployment and monitoring

## Testing Strategy

### Unit Tests
- Provider interface compliance
- Stream state machine validation
- Error handling and recovery
- Metrics collection accuracy

### Integration Tests
- Multi-provider scenarios
- Failover mechanisms
- Language validation
- Cost tracking accuracy

### Load Tests
- Concurrent stream handling
- Provider scaling limits
- Memory usage optimization
- Performance under stress

### End-to-End Tests
- Real-world usage scenarios
- Multiple language pairs
- Provider failures and recovery
- Cost and quality validation

## Monitoring and Alerting

### Key Metrics to Monitor
- Stream success rate by provider
- Average initialization time
- Audio write success rate
- Error rate by error type
- Cost per minute by provider
- Language accuracy scores

### Alerting Thresholds
- Stream failure rate > 5%
- Provider response time > 2 seconds
- Daily cost > budget threshold
- Error rate spike (>2x baseline)
- Provider health degradation

### Dashboards
- Real-time stream monitoring
- Provider performance comparison
- Cost analysis and trends
- Language usage patterns
- Error analysis and debugging

## Migration Strategy

### Backwards Compatibility
- Maintain existing API interfaces
- Gradual migration path for existing streams
- Feature flags for new functionality
- Rollback capabilities

### Deployment Plan
1. Deploy with Azure provider only (feature flag disabled)
2. Enable new TranscriptionManager (feature flag enabled for testing)
3. Add Soniox provider (limited rollout)
4. Full rollout with monitoring
5. Deprecate old transcription service

## Success Metrics

### Technical Metrics
- 99.9% stream initialization success rate
- <500ms average stream startup time
- <1% audio data loss rate
- 50% reduction in Azure rate limit errors

### Business Metrics
- 30% cost reduction through provider optimization
- 99.5% transcription service uptime
- <2 seconds average response time
- Support for 5+ new language pairs

### User Experience Metrics
- 95% user satisfaction with transcription quality
- <1% user-reported transcription failures
- 90% faster issue resolution time
- Improved debugging and monitoring capabilities

## Conclusion

This redesign transforms the transcription system from a fragile, Azure-locked singleton into a robust, multi-provider, per-session manager. The new architecture provides:

1. **Reliability**: Eliminates race conditions and provides robust error handling
2. **Flexibility**: Easy provider swapping and cost optimization
3. **Scalability**: Per-session isolation and better resource management
4. **Observability**: Rich metrics and monitoring for debugging and optimization
5. **Maintainability**: Clean abstractions and consistent patterns

The phased implementation approach ensures minimal disruption while delivering immediate improvements to system reliability and long-term architectural benefits.