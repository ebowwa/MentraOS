/**
 * @fileoverview Type definitions for the new TranscriptionManager system
 */

import { ExtendedStreamType, TranscriptionData } from '@mentra/sdk';
import { Logger } from 'pino';
import UserSession from '../UserSession';
import dotenv from 'dotenv';
dotenv.config();

// Environment variables for provider configuration
export const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
export const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || '';
export const SONIOX_API_KEY = process.env.SONIOX_API_KEY || '';
export const SONIOX_ENDPOINT = process.env.SONIOX_ENDPOINT || 'wss://stt-rt.soniox.com/transcribe-websocket';

// Ensure required environment variables are set
if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
  throw new Error('Missing required Azure Speech environment variables: AZURE_SPEECH_KEY and AZURE_SPEECH_REGION');
}
if (!SONIOX_API_KEY || !SONIOX_ENDPOINT) {
  throw new Error('Missing required Soniox environment variables: SONIOX_API_KEY and SONIOX_ENDPOINT');
}

//===========================================================
// Core Enums
//===========================================================

export enum StreamState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  ACTIVE = 'active',
  ERROR = 'error',
  CLOSING = 'closing',
  CLOSED = 'closed'
}

export enum ProviderType {
  AZURE = 'azure',
  SONIOX = 'soniox'
}

export enum AzureErrorType {
  RACE_CONDITION = 'race_condition',
  RATE_LIMIT = 'rate_limit',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  AUTH_ERROR = 'auth_error',
  UNKNOWN = 'unknown'
}

//===========================================================
// Configuration Types
//===========================================================

export interface TranscriptionConfig {
  providers: {
    defaultProvider: ProviderType;
    fallbackProvider: ProviderType;
  };
  
  azure: AzureProviderConfig;
  soniox: SonioxProviderConfig;
  
  performance: {
    maxTotalStreams: number;
    maxMemoryUsageMB: number;
    streamTimeoutMs: number;
    healthCheckIntervalMs: number;
  };
  
  retries: {
    maxStreamRetries: number;
    retryDelayMs: number;
  };
}

export interface AzureProviderConfig {
  key: string;
  region: string;
  maxConnections?: number;
}

export interface SonioxProviderConfig {
  apiKey: string;
  endpoint: string;
  model?: string; // Default: 'stt-rt-preview'
  maxConnections?: number;
}

//===========================================================
// Provider Interfaces
//===========================================================

export interface ProviderHealthStatus {
  isHealthy: boolean;
  lastCheck: number;
  failures: number;
  lastFailure?: number;
  reason?: string;
}

export interface ProviderLanguageCapabilities {
  transcriptionLanguages: string[];
  autoLanguageDetection: boolean;
}

export interface StreamOptions {
  streamId: string;
  userSession: UserSession;
  subscription: ExtendedStreamType;
  callbacks: StreamCallbacks;
}

export interface StreamCallbacks {
  onReady?: () => void;
  onError?: (error: Error) => void;
  onClosed?: () => void;
  onData?: (data: TranscriptionData) => void;
}

export interface TranscriptionProvider {
  readonly name: ProviderType;
  readonly logger: Logger;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  
  // Stream Management
  createTranscriptionStream(language: string, options: StreamOptions): Promise<StreamInstance>;
  
  // Capabilities
  supportsSubscription(subscription: ExtendedStreamType): boolean;
  supportsLanguage(language: string): boolean;
  getLanguageCapabilities(): ProviderLanguageCapabilities;
  
  // Health
  getHealthStatus(): ProviderHealthStatus;
  recordFailure(error: Error): void;
  recordSuccess(): void;
}

//===========================================================
// Stream Instance Interface
//===========================================================

export interface StreamMetrics {
  // Lifecycle
  initializationTime?: number;
  totalDuration: number;
  
  // Audio Processing
  audioChunksReceived: number;
  audioChunksWritten: number;
  audioDroppedCount: number;
  audioWriteFailures: number;
  consecutiveFailures: number;
  lastSuccessfulWrite?: number;
  
  // Error Tracking
  errorCount: number;
  lastError?: Error;
}

export interface StreamInstance {
  // Identification
  readonly id: string;
  readonly subscription: ExtendedStreamType;
  readonly provider: TranscriptionProvider;
  readonly logger: Logger;
  
  // Configuration
  readonly language: string;
  
  // State
  state: StreamState;
  startTime: number;
  readyTime?: number;
  lastActivity: number;
  lastError?: Error;
  
  // Metrics
  metrics: StreamMetrics;
  
  // Callbacks
  callbacks: StreamCallbacks;
  
  // Methods
  writeAudio(data: ArrayBuffer): Promise<boolean>;
  close(): Promise<void>;
  getHealth(): StreamHealth;
}

export interface StreamHealth {
  isAlive: boolean;
  lastActivity: number;
  consecutiveFailures: number;
  lastSuccessfulWrite?: number;
  providerHealth: ProviderHealthStatus;
}

//===========================================================
// Error Types
//===========================================================

export class TranscriptionError extends Error {
  constructor(message: string, public readonly context?: Record<string, any>) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export class ProviderError extends TranscriptionError {
  constructor(
    message: string,
    public readonly providerName: ProviderType,
    public readonly originalError?: Error,
    context?: Record<string, any>
  ) {
    super(message, context);
    this.name = 'ProviderError';
  }
}

export class AzureProviderError extends ProviderError {
  constructor(
    public readonly errorCode: number,
    public readonly errorDetails: string,
    public readonly errorType: AzureErrorType,
    originalError?: Error
  ) {
    super(
      `Azure error ${errorCode}: ${errorDetails}`,
      ProviderType.AZURE,
      originalError,
      { errorCode, errorDetails, errorType }
    );
    this.name = 'AzureProviderError';
  }
}

export class SonioxProviderError extends ProviderError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    originalError?: Error
  ) {
    super(message, ProviderType.SONIOX, originalError, { statusCode });
    this.name = 'SonioxProviderError';
  }
}

export class InvalidSubscriptionError extends TranscriptionError {
  constructor(
    message: string,
    public readonly subscription: ExtendedStreamType,
    public readonly suggestions?: string[]
  ) {
    super(message, { subscription, suggestions });
    this.name = 'InvalidSubscriptionError';
  }
}

export class NoProviderAvailableError extends TranscriptionError {
  constructor(message: string, public readonly subscription?: ExtendedStreamType) {
    super(message, { subscription });
    this.name = 'NoProviderAvailableError';
  }
}

export class ResourceLimitError extends TranscriptionError {
  constructor(message: string, public readonly resourceType: string) {
    super(message, { resourceType });
    this.name = 'ResourceLimitError';
  }
}

export class StreamCreationTimeoutError extends TranscriptionError {
  constructor(message: string) {
    super(message);
    this.name = 'StreamCreationTimeoutError';
  }
}

export class StreamInitializationError extends TranscriptionError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    this.name = 'StreamInitializationError';
  }
}

//===========================================================
// Provider Selection Types
//===========================================================

export interface ProviderSelectionOptions {
  excludeProviders?: ProviderType[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestions?: string[];
  supportingProviders?: TranscriptionProvider[];
}

//===========================================================
// Default Configuration
//===========================================================

export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfig = {
  providers: {
    defaultProvider: ProviderType.SONIOX,
    fallbackProvider: ProviderType.AZURE
    // defaultProvider: ProviderType.AZURE,
    // fallbackProvider: ProviderType.SONIOX
  },
  
  azure: {
    key: AZURE_SPEECH_KEY,
    region: AZURE_SPEECH_REGION
  },
  
  soniox: {
    apiKey: SONIOX_API_KEY,
    endpoint: SONIOX_ENDPOINT
  },
  
  performance: {
    maxTotalStreams: 500,
    maxMemoryUsageMB: 512,
    streamTimeoutMs: 10000,
    healthCheckIntervalMs: 60000
  },
  
  retries: {
    maxStreamRetries: 3,
    retryDelayMs: 5000
  }
};