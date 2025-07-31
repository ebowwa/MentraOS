import { ReportLevel } from './ReportLevel'

/**
 * Interface for report data
 */
export interface ReportData {
  message: string
  level: ReportLevel
  category: string
  operation: string
  tags: Record<string, any>
  context: Record<string, any>
  exception?: Error
  timestamp: number
  userId?: string
  sessionId?: string
}

/**
 * Builder class for creating ReportData objects
 */
export class ReportDataBuilder {
  private data: Partial<ReportData> = {
    level: ReportLevel.INFO,
    category: 'general',
    operation: '',
    tags: {},
    context: {},
    timestamp: Date.now(),
  }

  message(message: string): ReportDataBuilder {
    this.data.message = message
    return this
  }

  level(level: ReportLevel): ReportDataBuilder {
    this.data.level = level
    return this
  }

  category(category: string): ReportDataBuilder {
    this.data.category = category
    return this
  }

  operation(operation: string): ReportDataBuilder {
    this.data.operation = operation
    return this
  }

  tag(key: string, value: any): ReportDataBuilder {
    this.data.tags = { ...this.data.tags, [key]: value }
    return this
  }

  tags(tags: Record<string, any>): ReportDataBuilder {
    this.data.tags = { ...this.data.tags, ...tags }
    return this
  }

  context(key: string, value: any): ReportDataBuilder {
    this.data.context = { ...this.data.context, [key]: value }
    return this
  }

  contextData(context: Record<string, any>): ReportDataBuilder {
    this.data.context = { ...this.data.context, ...context }
    return this
  }

  exception(exception: Error): ReportDataBuilder {
    this.data.exception = exception
    return this
  }

  timestamp(timestamp: number): ReportDataBuilder {
    this.data.timestamp = timestamp
    return this
  }

  userId(userId: string): ReportDataBuilder {
    this.data.userId = userId
    return this
  }

  sessionId(sessionId: string): ReportDataBuilder {
    this.data.sessionId = sessionId
    return this
  }

  build(): ReportData {
    if (!this.data.message) {
      throw new Error('Message is required')
    }

    return this.data as ReportData
  }
}

/**
 * Helper function to create a new ReportDataBuilder
 */
export const createReport = (): ReportDataBuilder => {
  return new ReportDataBuilder()
} 