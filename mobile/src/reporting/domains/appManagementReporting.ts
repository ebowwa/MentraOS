import { reportError } from '../errors/errorReporting'

/**
 * App management reporting methods
 * Follows Single Responsibility Principle - only handles app management reporting
 */

/**
 * Report app not found errors
 */
export const reportAppNotFound = (packageName: string): void => {
  reportError("App not found", 'app.management', 'start_app', undefined, { packageName })
}

/**
 * Report app stop failures
 */
export const reportAppStopFailure = (packageName: string, reason: string, exception?: Error): void => {
  reportError("Stop app error", 'app.management', 'stop_app', exception, { 
    packageName,
    reason 
  })
}

/**
 * Report app start failures
 */
export const reportAppStartFailure = (packageName: string, reason: string, exception?: Error): void => {
  reportError("Start app error", 'app.management', 'start_app', exception, { 
    packageName,
    reason 
  })
} 