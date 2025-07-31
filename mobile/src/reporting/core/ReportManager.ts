import { IReportProvider } from './IReportProvider'
import { ReportData } from './ReportData'
import { ReportLevel } from './ReportLevel'
import { SentryReportProvider } from '../providers/SentryReportProvider'
import { ConsoleReportProvider } from '../providers/ConsoleReportProvider'
import { PostHogReportProvider } from '../providers/PostHogReportProvider'

/**
 * Main report manager that orchestrates all reporting providers
 * Follows Dependency Inversion Principle - depends on IReportProvider interface
 * Follows Single Responsibility Principle - only manages reporting
 */
export class ReportManager {
  private static instance: ReportManager
  private providers: IReportProvider[] = []
  private initialized: boolean = false
  private userId?: string
  private username?: string
  private email?: string

  private constructor() {}

  static getInstance(): ReportManager {
    if (!ReportManager.instance) {
      ReportManager.instance = new ReportManager()
    }
    return ReportManager.instance
  }

  /**
   * Initialize the report manager with default providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('[ReportManager] Starting initialization...')

      // Add default providers
      this.addProvider(new SentryReportProvider())
      this.addProvider(new ConsoleReportProvider())
      this.addProvider(new PostHogReportProvider())

      // Initialize all providers
      for (const provider of this.providers) {
        try {
          const success = await provider.initialize()
          if (success) {
            console.log(`[ReportManager] ${provider.getProviderName()} initialized successfully`)
          } else {
            console.warn(`[ReportManager] ${provider.getProviderName()} initialization failed`)
          }
        } catch (error) {
          console.error(`[ReportManager] Failed to initialize ${provider.getProviderName()}:`, error)
        }
      }

      this.initialized = true
      console.log('[ReportManager] Initialized successfully with providers:', this.getProviderNames())
    } catch (error) {
      console.error('[ReportManager] Failed to initialize:', error)
      // Still mark as initialized to prevent infinite retries
      this.initialized = true
    }
  }

  /**
   * Add a new reporting provider
   */
  addProvider(provider: IReportProvider): void {
    this.providers.push(provider)
    console.log(`[ReportManager] Added provider: ${provider.getProviderName()}`)
  }

  /**
   * Remove a reporting provider by name
   */
  removeProvider(providerName: string): void {
    this.providers = this.providers.filter(provider => provider.getProviderName() !== providerName)
    console.log(`[ReportManager] Removed provider: ${providerName}`)
  }

  /**
   * Get a provider by name
   */
  getProvider(providerName: string): IReportProvider | undefined {
    return this.providers.find(provider => provider.getProviderName() === providerName)
  }

  /**
   * Report data to all enabled providers
   */
  report(data: ReportData): void {
    if (!this.initialized) {
      console.warn('[ReportManager] Not initialized, skipping report')
      return
    }

    for (const provider of this.providers) {
      try {
        provider.report(data)
      } catch (error) {
        console.error(`[ReportManager] Failed to report to ${provider.getProviderName()}:`, error)
      }
    }
  }

  /**
   * Set user context for all providers
   */
  setUserContext(userId: string, username?: string, email?: string): void {
    this.userId = userId
    this.username = username
    this.email = email

    for (const provider of this.providers) {
      try {
        provider.setUserContext(userId, username, email)
      } catch (error) {
        console.error(`[ReportManager] Failed to set user context for ${provider.getProviderName()}:`, error)
      }
    }
  }

  /**
   * Clear user context for all providers
   */
  clearUserContext(): void {
    this.userId = undefined
    this.username = undefined
    this.email = undefined

    for (const provider of this.providers) {
      try {
        provider.clearUserContext()
      } catch (error) {
        console.error(`[ReportManager] Failed to clear user context for ${provider.getProviderName()}:`, error)
      }
    }
  }

  /**
   * Add breadcrumb to all providers
   */
  addBreadcrumb(message: string, category: string, level: string): void {
    for (const provider of this.providers) {
      try {
        provider.addBreadcrumb(message, category, level)
      } catch (error) {
        console.error(`[ReportManager] Failed to add breadcrumb to ${provider.getProviderName()}:`, error)
      }
    }
  }

  /**
   * Enable or disable a specific provider
   */
  setProviderEnabled(providerName: string, enabled: boolean): void {
    const provider = this.getProvider(providerName)
    if (provider) {
      provider.setEnabled(enabled)
      console.log(`[ReportManager] ${providerName} ${enabled ? 'enabled' : 'disabled'}`)
    } else {
      console.warn(`[ReportManager] Provider not found: ${providerName}`)
    }
  }

  /**
   * Get all provider names
   */
  getProviderNames(): string[] {
    return this.providers.map(provider => provider.getProviderName())
  }

  /**
   * Get initialization status
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Get current user ID
   */
  getUserId(): string | undefined {
    return this.userId
  }

  /**
   * Get provider status information
   */
  getProviderStatus(): Record<string, { enabled: boolean; initialized: boolean }> {
    const status: Record<string, { enabled: boolean; initialized: boolean }> = {}
    
    for (const provider of this.providers) {
      status[provider.getProviderName()] = {
        enabled: provider.isEnabled(),
        initialized: provider.isEnabled(), // Assuming if enabled, it's initialized
      }
    }
    
    return status
  }
} 