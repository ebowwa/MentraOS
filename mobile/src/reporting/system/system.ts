import { ReportManager } from '../core/ReportManager'

/**
 * Utility functions for the reporting system
 * Follows Single Responsibility Principle - only provides utility functions
 */

/**
 * Initialize the reporting system
 */
export const initializeReporting = async (): Promise<void> => {
  await ReportManager.getInstance().initialize()
}

/**
 * Set user context for all providers
 */
export const setUserContext = (userId: string, username?: string, email?: string): void => {
  ReportManager.getInstance().setUserContext(userId, username, email)
}

/**
 * Clear user context from all providers
 */
export const clearUserContext = (): void => {
  ReportManager.getInstance().clearUserContext()
}

/**
 * Add breadcrumb to all providers
 */
export const addBreadcrumb = (message: string, category: string, level: string): void => {
  ReportManager.getInstance().addBreadcrumb(message, category, level)
}

/**
 * Enable or disable a specific provider
 */
export const setProviderEnabled = (providerName: string, enabled: boolean): void => {
  ReportManager.getInstance().setProviderEnabled(providerName, enabled)
}

/**
 * Get the report manager instance
 */
export const getReportManager = (): ReportManager => {
  return ReportManager.getInstance()
}

/**
 * Get status of all providers
 */
export const getProviderStatus = (): Record<string, { enabled: boolean; initialized: boolean }> => {
  return ReportManager.getInstance().getProviderStatus()
} 