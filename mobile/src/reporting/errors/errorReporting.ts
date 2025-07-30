import { ReportManager } from '../core/ReportManager'
import { createReport } from '../core/ReportData'
import { ReportLevel } from '../core/ReportLevel'

/**
 * General error reporting methods
 * Follows Single Responsibility Principle - only handles error reporting
 */

/**
 * Report a general error
 */
export const reportError = (message: string, category: string, operation: string, exception?: Error, tags?: Record<string, any>): void => {
  const report = createReport()
    .message(message)
    .level(ReportLevel.ERROR)
    .category(category)
    .operation(operation)

  if (exception) {
    report.exception(exception)
  }

  if (tags) {
    report.tags(tags)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Report a warning
 */
export const reportWarning = (message: string, category: string, operation: string, tags?: Record<string, any>): void => {
  const report = createReport()
    .message(message)
    .level(ReportLevel.WARNING)
    .category(category)
    .operation(operation)

  if (tags) {
    report.tags(tags)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Report an info message
 */
export const reportInfo = (message: string, category: string, operation: string, tags?: Record<string, any>): void => {
  const report = createReport()
    .message(message)
    .level(ReportLevel.INFO)
    .category(category)
    .operation(operation)

  if (tags) {
    report.tags(tags)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Report a critical error
 */
export const reportCritical = (message: string, category: string, operation: string, exception?: Error, tags?: Record<string, any>): void => {
  const report = createReport()
    .message(message)
    .level(ReportLevel.CRITICAL)
    .category(category)
    .operation(operation)

  if (exception) {
    report.exception(exception)
  }

  if (tags) {
    report.tags(tags)
  }

  ReportManager.getInstance().report(report.build())
} 