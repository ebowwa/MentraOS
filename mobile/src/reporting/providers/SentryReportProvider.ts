import * as Sentry from '@sentry/react-native'
import { IReportProvider } from '../core/IReportProvider'
import { ReportData } from '../core/ReportData'
import { ReportLevel } from '../core/ReportLevel'
import { isSentryEnabled, initializeSentry } from '../config'

/**
 * Sentry implementation of IReportProvider
 * Follows Single Responsibility Principle - only handles Sentry reporting
 */
export class SentryReportProvider implements IReportProvider {
  private enabled: boolean = true
  private userId?: string
  private username?: string
  private email?: string

  async initialize(): Promise<boolean> {
    try {
      // Check if Sentry is properly configured
      if (!isSentryEnabled()) {
        console.log('Sentry not enabled, skipping initialization')
        this.enabled = false
        return false
      }

      // Initialize Sentry with secure configuration
      initializeSentry()
      
      console.log('SentryReportProvider initialized successfully')
      return true
    } catch (error) {
      console.error('Failed to initialize Sentry provider:', error)
      return false
    }
  }

  report(data: ReportData): void {
    if (!this.enabled || !isSentryEnabled()) return

    try {
      // Set user context if available
      if (this.userId) {
        Sentry.setUser({
          id: this.userId,
          username: this.username,
          email: this.email,
        })
      }

      // Set tags
      Object.entries(data.tags).forEach(([key, value]) => {
        Sentry.setTag(key, String(value))
      })

      // Set context
      Object.entries(data.context).forEach(([key, value]) => {
        Sentry.setContext(key, { value })
      })

      // Report based on level
      switch (data.level) {
        case ReportLevel.CRITICAL:
        case ReportLevel.ERROR:
          if (data.exception) {
            Sentry.captureException(data.exception, {
              tags: data.tags,
              contexts: data.context,
            })
          } else {
            Sentry.captureMessage(data.message, {
              level: 'error',
              tags: data.tags,
              contexts: data.context,
            })
          }
          break

        case ReportLevel.WARNING:
          Sentry.captureMessage(data.message, {
            level: 'warning',
            tags: data.tags,
            contexts: data.context,
          })
          break

        case ReportLevel.INFO:
          Sentry.captureMessage(data.message, {
            level: 'info',
            tags: data.tags,
            contexts: data.context,
          })
          break

        case ReportLevel.DEBUG:
          // In development, log debug messages
          if (__DEV__) {
            console.log(`[Sentry Debug] ${data.message}`, {
              tags: data.tags,
              context: data.context,
            })
          }
          break
      }
    } catch (error) {
      console.error('Failed to report to Sentry:', error)
    }
  }

  setUserContext(userId: string, username?: string, email?: string): void {
    this.userId = userId
    this.username = username
    this.email = email

    if (this.enabled && isSentryEnabled()) {
      try {
        Sentry.setUser({
          id: userId,
          username,
          email,
        })
      } catch (error) {
        console.error('Failed to set Sentry user context:', error)
      }
    }
  }

  clearUserContext(): void {
    this.userId = undefined
    this.username = undefined
    this.email = undefined

    if (this.enabled && isSentryEnabled()) {
      try {
        Sentry.setUser(null)
      } catch (error) {
        console.error('Failed to clear Sentry user context:', error)
      }
    }
  }

  addBreadcrumb(message: string, category: string, level: string): void {
    if (!this.enabled || !isSentryEnabled()) return

    try {
      Sentry.addBreadcrumb({
        message,
        category,
        level: level as any,
      })
    } catch (error) {
      console.error('Failed to add Sentry breadcrumb:', error)
    }
  }

  isEnabled(): boolean {
    return this.enabled && isSentryEnabled()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  getProviderName(): string {
    return 'Sentry'
  }
} 