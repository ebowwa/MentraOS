/**
 * @fileoverview ProviderSelector manages selection between Azure and Soniox providers
 */

import { Logger } from "pino";
import { getLanguageInfo, ExtendedStreamType } from "@mentra/sdk";
import {
  TranscriptionProvider,
  ProviderType,
  TranscriptionConfig,
  ProviderSelectionOptions,
  NoProviderAvailableError,
  ValidationResult,
  InvalidSubscriptionError,
} from "./types";

export class ProviderSelector {
  private logger: Logger;

  constructor(
    private providers: Map<ProviderType, TranscriptionProvider>,
    private config: TranscriptionConfig,
    parentLogger: Logger,
  ) {
    this.logger = parentLogger.child({ service: "ProviderSelector" });
  }

  /**
   * Select the best provider for a subscription
   */
  async selectProvider(
    subscription: ExtendedStreamType,
    options: ProviderSelectionOptions = {},
  ): Promise<TranscriptionProvider> {
    const excludeList = options.excludeProviders || [];

    this.logger.debug(
      {
        subscription,
        excludeList,
        defaultProvider: this.config.providers.defaultProvider,
        fallbackProvider: this.config.providers.fallbackProvider,
      },
      "Selecting provider",
    );

    // 1. Try default provider first
    const defaultProviderType = this.config.providers.defaultProvider;
    if (!excludeList.includes(defaultProviderType)) {
      const defaultProvider = this.providers.get(defaultProviderType);

      if (
        defaultProvider?.supportsSubscription(subscription) &&
        this.isProviderHealthy(defaultProvider)
      ) {
        this.logger.debug(
          {
            provider: defaultProviderType,
            subscription,
          },
          "Using default provider",
        );

        return defaultProvider;
      } else {
        this.logger.warn(
          {
            provider: defaultProviderType,
            supportsSubscription:
              defaultProvider?.supportsSubscription(subscription),
            isHealthy: defaultProvider
              ? this.isProviderHealthy(defaultProvider)
              : false,
          },
          "Default provider not available",
        );
      }
    }

    // 2. Try fallback provider
    const fallbackProviderType = this.config.providers.fallbackProvider;
    if (!excludeList.includes(fallbackProviderType)) {
      const fallbackProvider = this.providers.get(fallbackProviderType);

      if (fallbackProvider?.supportsSubscription(subscription)) {
        this.logger.info(
          {
            provider: fallbackProviderType,
            subscription,
            reason: "fallback",
          },
          "Using fallback provider",
        );

        return fallbackProvider;
      } else {
        this.logger.warn(
          {
            provider: fallbackProviderType,
            supportsSubscription:
              fallbackProvider?.supportsSubscription(subscription),
          },
          "Fallback provider not available",
        );
      }
    }

    // 3. Last resort: try any available provider (even unhealthy ones)
    for (const [providerType, provider] of this.providers) {
      if (
        !excludeList.includes(providerType) &&
        provider.supportsSubscription(subscription)
      ) {
        this.logger.warn(
          {
            provider: providerType,
            subscription,
            reason: "last_resort",
          },
          "Using last resort provider",
        );

        return provider;
      }
    }

    throw new NoProviderAvailableError(
      `No providers available for subscription: ${subscription}`,
      subscription,
    );
  }

  /**
   * Validate a subscription and check provider support
   */
  async validateSubscription(
    subscription: ExtendedStreamType,
  ): Promise<ValidationResult> {
    // Parse language information
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      return {
        valid: false,
        error: `Invalid subscription format: ${subscription}. Expected format like 'transcription:en-US' or 'translation:es-ES-to-en-US'`,
      };
    }

    // Check if any provider supports this subscription
    const supportingProviders: TranscriptionProvider[] = [];

    for (const provider of this.providers.values()) {
      if (provider.supportsSubscription(subscription)) {
        supportingProviders.push(provider);
      }
    }

    if (supportingProviders.length === 0) {
      const suggestions = this.getSuggestedAlternatives(subscription);
      return {
        valid: false,
        error: `No provider supports subscription: ${subscription}`,
        suggestions,
      };
    }

    return {
      valid: true,
      supportingProviders,
    };
  }

  /**
   * Get all providers that support a subscription
   */
  getCapableProviders(
    subscription: ExtendedStreamType,
  ): TranscriptionProvider[] {
    return Array.from(this.providers.values()).filter((provider) =>
      provider.supportsSubscription(subscription),
    );
  }

  /**
   * Get healthy providers for a subscription
   */
  getHealthyProviders(
    subscription: ExtendedStreamType,
  ): TranscriptionProvider[] {
    return this.getCapableProviders(subscription).filter((provider) =>
      this.isProviderHealthy(provider),
    );
  }

  /**
   * Check if a provider is currently healthy
   */
  private isProviderHealthy(provider: TranscriptionProvider): boolean {
    try {
      const health = provider.getHealthStatus();
      return health.isHealthy;
    } catch (error) {
      this.logger.warn(
        {
          provider: provider.name,
          error,
        },
        "Error checking provider health",
      );
      return false;
    }
  }

  /**
   * Get suggested alternative subscriptions
   */
  private getSuggestedAlternatives(subscription: ExtendedStreamType): string[] {
    const languageInfo = getLanguageInfo(subscription);
    if (!languageInfo) {
      return [];
    }

    const suggestions: string[] = [];

    // Get all supported languages from all providers
    const allCapabilities = Array.from(this.providers.values()).map((p) =>
      p.getLanguageCapabilities(),
    );

    // Suggest supported transcription languages
    const supportedTranscriptionLanguages = new Set<string>();
    allCapabilities.forEach((cap) => {
      cap.transcriptionLanguages.forEach((lang) =>
        supportedTranscriptionLanguages.add(lang),
      );
    });

    // If it's a transcription request, suggest similar languages
    if (languageInfo.type === "transcription") {
      const baseLang = languageInfo.transcribeLanguage.split("-")[0];
      supportedTranscriptionLanguages.forEach((lang) => {
        if (lang.startsWith(baseLang)) {
          suggestions.push(`transcription:${lang}`);
        }
      });
    }

    // Translation is now handled by TranslationManager

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Get provider statistics for debugging
   */
  getProviderStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [type, provider] of this.providers) {
      const health = provider.getHealthStatus();
      stats[type] = {
        isHealthy: health.isHealthy,
        failures: health.failures,
        lastFailure: health.lastFailure,
        capabilities: {
          transcriptionLanguages:
            provider.getLanguageCapabilities().transcriptionLanguages.length,
        },
      };
    }

    return stats;
  }
}
