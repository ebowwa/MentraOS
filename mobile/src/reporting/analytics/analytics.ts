import { ReportManager } from '../core/ReportManager'
import { createReport } from '../core/ReportData'
import { ReportLevel } from '../core/ReportLevel'

/**
 * Analytics and tracking methods for user behavior and application metrics
 * Follows Single Responsibility Principle - only handles analytics tracking
 */

/**
 * Track a general event
 */
export const trackEvent = (eventName: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Event tracked: ${eventName}`)
    .level(ReportLevel.INFO)
    .category('analytics.event')
    .operation('track_event')
    .tag('event_name', eventName)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track user actions (clicks, taps, etc.)
 */
export const trackUserAction = (action: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`User action: ${action}`)
    .level(ReportLevel.INFO)
    .category('analytics.user_action')
    .operation('track_user_action')
    .tag('action', action)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track feature usage
 */
export const trackFeatureUsage = (feature: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Feature used: ${feature}`)
    .level(ReportLevel.INFO)
    .category('analytics.feature_usage')
    .operation('track_feature_usage')
    .tag('feature', feature)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track page views
 */
export const trackPageView = (pageName: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Page viewed: ${pageName}`)
    .level(ReportLevel.INFO)
    .category('analytics.page_view')
    .operation('track_page_view')
    .tag('page_name', pageName)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track performance metrics
 */
export const trackPerformance = (metric: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Performance metric: ${metric}`)
    .level(ReportLevel.INFO)
    .category('analytics.performance')
    .operation('track_performance')
    .tag('metric', metric)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track API events
 */
export const trackApiEvent = (operation: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`API event: ${operation}`)
    .level(ReportLevel.INFO)
    .category('analytics.api_event')
    .operation('track_api_event')
    .tag('operation', operation)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track session events
 */
export const trackSessionEvent = (eventName: string, userId?: string, sessionId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Session event: ${eventName}`)
    .level(ReportLevel.INFO)
    .category('analytics.session_event')
    .operation('track_session_event')
    .tag('event_name', eventName)

  if (userId) {
    report.userId(userId)
  }

  if (sessionId) {
    report.sessionId(sessionId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track transcription events
 */
export const trackTranscriptionEvent = (eventName: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Transcription event: ${eventName}`)
    .level(ReportLevel.INFO)
    .category('analytics.transcription')
    .operation('track_transcription_event')
    .tag('event_name', eventName)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track authentication events
 */
export const trackAuthEvent = (eventName: string, userId?: string, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Auth event: ${eventName}`)
    .level(ReportLevel.INFO)
    .category('analytics.auth')
    .operation('track_auth_event')
    .tag('event_name', eventName)

  if (userId) {
    report.userId(userId)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
}

/**
 * Track error events
 */
export const trackErrorEvent = (eventName: string, userId?: string, error?: Error, properties?: Record<string, any>): void => {
  const report = createReport()
    .message(`Error event: ${eventName}`)
    .level(ReportLevel.ERROR)
    .category('analytics.error_event')
    .operation('track_error_event')
    .tag('event_name', eventName)

  if (userId) {
    report.userId(userId)
  }

  if (error) {
    report.exception(error)
  }

  if (properties) {
    report.tags(properties)
  }

  ReportManager.getInstance().report(report.build())
} 