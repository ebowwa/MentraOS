import { IReportProvider } from '../core/IReportProvider'
import { ReportData } from '../core/ReportData'
import { ReportLevel } from '../core/ReportLevel'

/**
 * Console implementation of IReportProvider for debugging
 * Follows Open/Closed Principle - can be extended without modification
 */
export class ConsoleReportProvider implements IReportProvider {
  private enabled: boolean = true
  private userId?: string
  private username?: string
  private email?: string

  async initialize(): Promise<boolean> {
    console.log('[ConsoleReportProvider] Initialized')
    return true
  }

  report(data: ReportData): void {
    if (!this.enabled) return

    const timestamp = new Date(data.timestamp).toISOString()
    const userInfo = this.userId ? `[User: ${this.userId}]` : ''
    const prefix = `[${data.level.toUpperCase()}] [${data.category}] ${userInfo}`

    const logData = {
      message: data.message,
      operation: data.operation,
      tags: data.tags,
      context: data.context,
      timestamp,
      userId: this.userId,
    }

    switch (data.level) {
      case ReportLevel.CRITICAL:
        console.error(`${prefix} ${data.message}`, logData)
        if (data.exception) {
          console.error('Exception:', data.exception)
        }
        break

      case ReportLevel.ERROR:
        console.error(`${prefix} ${data.message}`, logData)
        if (data.exception) {
          console.error('Exception:', data.exception)
        }
        break

      case ReportLevel.WARNING:
        console.warn(`${prefix} ${data.message}`, logData)
        break

      case ReportLevel.INFO:
        console.info(`${prefix} ${data.message}`, logData)
        break

      case ReportLevel.DEBUG:
        console.debug(`${prefix} ${data.message}`, logData)
        break
    }
  }

  setUserContext(userId: string, username?: string, email?: string): void {
    this.userId = userId
    this.username = username
    this.email = email
    console.log(`[ConsoleReportProvider] User context set: ${userId}`)
  }

  clearUserContext(): void {
    this.userId = undefined
    this.username = undefined
    this.email = undefined
    console.log('[ConsoleReportProvider] User context cleared')
  }

  addBreadcrumb(message: string, category: string, level: string): void {
    if (!this.enabled) return

    console.log(`[Breadcrumb] [${level.toUpperCase()}] [${category}] ${message}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    console.log(`[ConsoleReportProvider] ${enabled ? 'Enabled' : 'Disabled'}`)
  }

  getProviderName(): string {
    return 'Console'
  }
} 