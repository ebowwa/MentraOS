/**
 * @fileoverview Azure Translation Provider
 * Uses Azure Cognitive Services for translation, separate from transcription
 */

import { Logger } from "pino";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import {
  TranslationProvider,
  TranslationProviderType,
  TranslationProviderHealthStatus,
  TranslationProviderCapabilities,
  TranslationStreamOptions,
  TranslationStreamInstance,
  AzureTranslationConfig,
  TranslationStreamState,
  TranslationStreamMetrics,
  TranslationStreamHealth,
  TranslationProviderError,
  InvalidLanguagePairError,
} from "../types";
import { TranslationData, StreamType } from "@mentra/sdk";

/**
 * Azure-specific translation stream implementation
 */
class AzureTranslationStream implements TranslationStreamInstance {
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
    lastError: undefined,
  };

  callbacks: TranslationStreamOptions["callbacks"];

  private translationRecognizer?: sdk.TranslationRecognizer;
  private audioConfig?: sdk.AudioConfig;
  private pushStream?: sdk.PushAudioInputStream;
  private isClosing = false;
  private latencyMeasurements: number[] = [];

  constructor(
    options: TranslationStreamOptions,
    provider: TranslationProvider,
    private config: AzureTranslationConfig,
  ) {
    this.id = options.streamId;
    this.subscription = options.subscription;
    this.provider = provider;
    this.logger = options.userSession.logger.child({
      service: "AzureTranslationStream",
      streamId: this.id,
    });
    this.sourceLanguage = options.sourceLanguage;
    this.targetLanguage = options.targetLanguage;
    this.callbacks = options.callbacks;
  }

  async initialize(): Promise<void> {
    try {
      const initStartTime = Date.now();

      // Create push stream for audio input
      this.pushStream = sdk.AudioInputStream.createPushStream();
      this.audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);

      // Create speech translation config
      const speechTranslationConfig =
        sdk.SpeechTranslationConfig.fromSubscription(
          this.config.key,
          this.config.region,
        );

      // Set source language
      speechTranslationConfig.speechRecognitionLanguage =
        this.normalizeLanguageCode(this.sourceLanguage);

      // Add target language
      speechTranslationConfig.addTargetLanguage(
        this.normalizeLanguageCode(this.targetLanguage),
      );

      // Create translation recognizer
      this.translationRecognizer = new sdk.TranslationRecognizer(
        speechTranslationConfig,
        this.audioConfig,
      );

      // Set up event handlers
      this.setupEventHandlers();

      // Start continuous recognition
      await new Promise<void>((resolve, reject) => {
        this.translationRecognizer!.startContinuousRecognitionAsync(
          () => {
            this.state = TranslationStreamState.READY;
            this.readyTime = Date.now();
            this.metrics.initializationTime = this.readyTime - initStartTime;

            this.logger.info(
              {
                sourceLanguage: this.sourceLanguage,
                targetLanguage: this.targetLanguage,
                initTime: this.metrics.initializationTime,
              },
              "Azure translation stream initialized",
            );

            this.callbacks.onReady?.();
            resolve();
          },
          (error) => {
            this.logger.error(
              { error },
              "Failed to start Azure translation recognizer",
            );
            this.handleError(new Error(`Failed to start recognizer: ${error}`));
            reject(error);
          },
        );
      });
    } catch (error) {
      this.logger.error(
        { error },
        "Failed to initialize Azure translation stream",
      );
      this.handleError(error as Error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.translationRecognizer) return;

    // Handle translation results
    this.translationRecognizer.recognizing = (_, event) => {
      this.handleTranslationEvent(event, false);
    };

    this.translationRecognizer.recognized = (_, event) => {
      this.handleTranslationEvent(event, true);
    };

    // Handle errors
    this.translationRecognizer.canceled = (_, event) => {
      if (event.reason === sdk.CancellationReason.Error) {
        const error = new TranslationProviderError(
          `Azure translation error: ${event.errorDetails}`,
          TranslationProviderType.AZURE,
        );
        this.handleError(error);
      }
    };

    // Handle session events
    this.translationRecognizer.sessionStarted = () => {
      this.logger.debug("Azure translation session started");
      this.state = TranslationStreamState.ACTIVE;
    };

    this.translationRecognizer.sessionStopped = () => {
      this.logger.debug("Azure translation session stopped");
      if (!this.isClosing) {
        this.handleError(
          new Error("Azure translation session stopped unexpectedly"),
        );
      }
    };
  }

  private handleTranslationEvent(
    event: sdk.TranslationRecognitionEventArgs,
    isFinal: boolean,
  ): void {
    try {
      this.lastActivity = Date.now();

      // Get original text
      const originalText = event.result.text;
      if (!originalText) return;

      // Get translated text
      const normalizedTarget = this.normalizeLanguageCode(this.targetLanguage);
      const translatedText = event.result.translations.get(normalizedTarget);

      if (!translatedText) {
        this.logger.warn(
          {
            targetLanguage: this.targetLanguage,
            normalizedTarget,
            availableTranslations: event.result.translations
              ? ["translation"]
              : [],
          },
          "No translation found for target language",
        );
        return;
      }

      // Create translation data
      const translationData: TranslationData = {
        type: StreamType.TRANSLATION,
        text: translatedText,
        originalText: originalText,
        isFinal,
        startTime: event.result.offset / 10000, // Convert from 100ns units to ms
        endTime: (event.result.offset + event.result.duration) / 10000,
        speakerId: undefined,
        duration: event.result.duration / 10000,
        transcribeLanguage: this.sourceLanguage,
        translateLanguage: this.targetLanguage,
        didTranslate: true,
        provider: "azure",
        confidence: undefined, // Azure doesn't provide confidence for translations
      };

      // Update metrics
      this.metrics.translationsGenerated++;

      // Calculate latency (approximate)
      const latency = Date.now() - (this.startTime + translationData.endTime);
      this.latencyMeasurements.push(latency);
      if (this.latencyMeasurements.length > 100) {
        this.latencyMeasurements.shift();
      }
      this.metrics.averageLatency =
        this.latencyMeasurements.reduce((a, b) => a + b, 0) /
        this.latencyMeasurements.length;

      // Send to callback
      this.callbacks.onData?.(translationData);

      this.logger.debug(
        {
          isFinal,
          originalText: originalText.substring(0, 50),
          translatedText: translatedText.substring(0, 50),
          languages: `${this.sourceLanguage} → ${this.targetLanguage}`,
        },
        "Azure translation result",
      );
    } catch (error) {
      this.logger.error({ error }, "Error handling Azure translation event");
      this.metrics.errorCount++;
    }
  }

  async writeAudio(data: ArrayBuffer): Promise<boolean> {
    try {
      if (
        this.state !== TranslationStreamState.READY &&
        this.state !== TranslationStreamState.ACTIVE
      ) {
        this.metrics.audioDroppedCount++;
        return false;
      }

      if (!this.pushStream) {
        this.metrics.audioWriteFailures++;
        return false;
      }

      this.metrics.audioChunksReceived++;

      // Write audio to push stream
      this.pushStream.write(data);

      this.metrics.audioChunksWritten++;
      this.metrics.lastSuccessfulWrite = Date.now();
      this.metrics.consecutiveFailures = 0;
      this.lastActivity = Date.now();

      return true;
    } catch (error) {
      this.logger.warn(
        { error },
        "Failed to write audio to Azure translation stream",
      );
      this.metrics.audioWriteFailures++;
      this.metrics.consecutiveFailures++;
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.isClosing || this.state === TranslationStreamState.CLOSED) {
      return;
    }

    this.isClosing = true;
    this.state = TranslationStreamState.CLOSING;

    try {
      // Close push stream
      if (this.pushStream) {
        this.pushStream.close();
      }

      // Stop recognition
      if (this.translationRecognizer) {
        await new Promise<void>((resolve) => {
          this.translationRecognizer!.stopContinuousRecognitionAsync(
            () => {
              this.logger.debug("Azure translation recognizer stopped");
              resolve();
            },
            (error) => {
              this.logger.warn(
                { error },
                "Error stopping Azure translation recognizer",
              );
              resolve(); // Resolve anyway
            },
          );
        });

        this.translationRecognizer.close();
      }

      // Update metrics
      this.metrics.totalDuration = Date.now() - this.startTime;

      this.state = TranslationStreamState.CLOSED;
      this.callbacks.onClosed?.();

      this.logger.info(
        {
          streamId: this.id,
          duration: this.metrics.totalDuration,
          translationsGenerated: this.metrics.translationsGenerated,
          averageLatency: this.metrics.averageLatency,
        },
        "Azure translation stream closed",
      );
    } catch (error) {
      this.logger.error({ error }, "Error closing Azure translation stream");
      this.state = TranslationStreamState.CLOSED;
    }
  }

  getHealth(): TranslationStreamHealth {
    return {
      isAlive:
        this.state === TranslationStreamState.READY ||
        this.state === TranslationStreamState.ACTIVE,
      lastActivity: this.lastActivity,
      consecutiveFailures: this.metrics.consecutiveFailures,
      lastSuccessfulWrite: this.metrics.lastSuccessfulWrite,
      providerHealth: this.provider.getHealthStatus(),
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
    // Azure uses specific language codes, normalize them
    const codeMap: Record<string, string> = {
      en: "en-US",
      es: "es-ES",
      fr: "fr-FR",
      de: "de-DE",
      it: "it-IT",
      pt: "pt-BR",
      ru: "ru-RU",
      zh: "zh-CN",
      ja: "ja-JP",
      ko: "ko-KR",
      ar: "ar-SA",
      hi: "hi-IN",
    };

    // If already in full format, return as is
    if (languageCode.includes("-")) {
      return languageCode;
    }

    // Otherwise map to default region
    return codeMap[languageCode] || languageCode;
  }
}

/**
 * Azure Translation Provider implementation
 */
export class AzureTranslationProvider implements TranslationProvider {
  readonly name = TranslationProviderType.AZURE;
  readonly logger: Logger;

  private isInitialized = false;
  private healthStatus: TranslationProviderHealthStatus = {
    isHealthy: true,
    lastCheck: Date.now(),
    failures: 0,
  };

  // Azure supported language pairs (simplified subset)
  private supportedLanguages = new Set([
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ru",
    "zh",
    "ja",
    "ko",
    "ar",
    "hi",
    "nl",
    "sv",
    "da",
    "fi",
    "no",
    "pl",
    "tr",
    "el",
    "he",
    "th",
    "vi",
    "id",
  ]);

  constructor(
    private config: AzureTranslationConfig,
    parentLogger: Logger,
  ) {
    this.logger = parentLogger.child({ provider: "azure-translation" });
  }

  async initialize(): Promise<void> {
    try {
      // Validate configuration
      if (!this.config.key || !this.config.region) {
        throw new Error("Azure translation provider requires key and region");
      }

      // Test connection by creating a temporary config
      const testConfig = sdk.SpeechTranslationConfig.fromSubscription(
        this.config.key,
        this.config.region,
      );
      testConfig.close();

      this.isInitialized = true;
      this.logger.info("Azure translation provider initialized");
    } catch (error) {
      this.logger.error(
        { error },
        "Failed to initialize Azure translation provider",
      );
      throw error;
    }
  }

  async dispose(): Promise<void> {
    this.isInitialized = false;
    this.logger.info("Azure translation provider disposed");
  }

  async createTranslationStream(
    options: TranslationStreamOptions,
  ): Promise<TranslationStreamInstance> {
    if (!this.isInitialized) {
      throw new Error("Azure translation provider not initialized");
    }

    // Validate language pair
    if (
      !this.supportsLanguagePair(options.sourceLanguage, options.targetLanguage)
    ) {
      throw new InvalidLanguagePairError(
        `Azure does not support translation from ${options.sourceLanguage} to ${options.targetLanguage}`,
        options.sourceLanguage,
        options.targetLanguage,
      );
    }

    const stream = new AzureTranslationStream(options, this, this.config);
    await stream.initialize();

    this.recordSuccess();
    return stream;
  }

  supportsLanguagePair(source: string, target: string): boolean {
    const sourceBase = source.split("-")[0].toLowerCase();
    const targetBase = target.split("-")[0].toLowerCase();

    // Can't translate to same language
    if (sourceBase === targetBase) return false;

    // Both languages must be supported
    return (
      this.supportedLanguages.has(sourceBase) &&
      this.supportedLanguages.has(targetBase)
    );
  }

  supportsAutoDetection(): boolean {
    return false; // Azure translation requires explicit source language
  }

  getCapabilities(): TranslationProviderCapabilities {
    const supportedPairs = new Map<string, string[]>();

    // Build language pairs map
    for (const source of this.supportedLanguages) {
      const targets: string[] = [];
      for (const target of this.supportedLanguages) {
        if (source !== target) {
          targets.push(target);
        }
      }
      supportedPairs.set(source, targets);
    }

    return {
      supportedLanguagePairs: supportedPairs,
      supportsAutoDetection: false,
      supportsRealtimeTranslation: true,
      maxConcurrentStreams: this.config.maxConnections || 10,
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
