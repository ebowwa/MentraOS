import { IReportProvider } from '../core/IReportProvider'
import { ReportData } from '../core/ReportData'
import { ReportLevel } from '../core/ReportLevel'
import { isPostHogEnabled, getPostHog, initializePostHog } from '../config'

/**
 * PostHog implementation of IReportProvider
 * Follows Single Responsibility Principle - only handles PostHog reporting
 */
export class PostHogReportProvider implements IReportProvider {
  private enabled: boolean = true
  private userId?: string
  private username?: string
  private email?: string
  private posthog: any

  constructor() {
    // Don't initialize here, wait for initialize() method
  }

  async initialize(): Promise<boolean> {
    try {
      // Check if PostHog is properly configured
      if (!isPostHogEnabled()) {
        console.log('PostHog not enabled, skipping initialization')
        this.enabled = false
        return false
      }

      // Initialize PostHog with secure configuration
      initializePostHog()

      // Get PostHog instance
      this.posthog = getPostHog()
      if (!this.posthog) {
        console.warn('PostHog not available')
        this.enabled = false
        return false
      }

      console.log('PostHogReportProvider initialized successfully')
      return true
    } catch (error) {
      console.error('Failed to initialize PostHog provider:', error)
      return false
    }
  }

  report(data: ReportData): void {
    if (!this.enabled || !this.posthog) return

    try {
      const eventName = `report_${data.level}`
      const properties: Record<string, any> = {
        message: data.message,
        category: data.category,
        operation: data.operation,
        level: data.level,
        ...data.tags,
        ...data.context,
        timestamp: data.timestamp,
        userId: this.userId,
      }

      // Add exception info if available
      if (data.exception) {
        properties.exception_name = data.exception.name
        properties.exception_message = data.exception.message
        properties.exception_stack = data.exception.stack
      }

      this.posthog.capture(eventName, properties)
    } catch (error) {
      console.error('Failed to report to PostHog:', error)
    }
  }

  setUserContext(userId: string, username?: string, email?: string): void {
    this.userId = userId
    this.username = username
    this.email = email

    if (this.posthog) {
      this.posthog.identify(userId, {
        username,
        email,
      })
    }
  }

  clearUserContext(): void {
    this.userId = undefined
    this.username = undefined
    this.email = undefined

    if (this.posthog) {
      this.posthog.reset()
    }
  }

  addBreadcrumb(message: string, category: string, level: string): void {
    if (!this.enabled || !this.posthog) return

    try {
      this.posthog.capture('breadcrumb', {
        message,
        category,
        level,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.error('Failed to add breadcrumb to PostHog:', error)
    }
  }

  isEnabled(): boolean {
    return this.enabled && isPostHogEnabled()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  getProviderName(): string {
    return 'PostHog'
  }
} 