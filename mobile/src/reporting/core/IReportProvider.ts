import { ReportData } from './ReportData'

/**
 * Interface defining the contract for all reporting providers
 * Follows Interface Segregation Principle - only includes methods that all providers need
 */
export interface IReportProvider {
  /**
   * Initialize the provider
   */
  initialize(): Promise<boolean>

  /**
   * Report data to the provider
   */
  report(data: ReportData): void

  /**
   * Set user context for all future reports
   */
  setUserContext(userId: string, username?: string, email?: string): void

  /**
   * Clear user context
   */
  clearUserContext(): void

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(message: string, category: string, level: string): void

  /**
   * Check if the provider is enabled
   */
  isEnabled(): boolean

  /**
   * Enable or disable the provider
   */
  setEnabled(enabled: boolean): void

  /**
   * Get the provider name
   */
  getProviderName(): string
} 