import { reportError } from '../errors/errorReporting'

/**
 * App lifecycle reporting methods
 * Follows Single Responsibility Principle - only handles app lifecycle reporting
 */

/**
 * Report app startup issues
 */
export const reportAppStartupIssue = (issue: string, exception?: Error): void => {
  reportError(`App startup issue: ${issue}`, 'app.lifecycle', 'startup', exception)
}

/**
 * Report app crashes
 */
export const reportAppCrash = (reason: string, exception?: Error): void => {
  reportError(`App crash: ${reason}`, 'app.lifecycle', 'crash', exception)
}

/**
 * Report navigation issues
 */
export const reportNavigationIssue = (route: string, issue: string, exception?: Error): void => {
  reportError(`Navigation issue on route ${route}: ${issue}`, 'app.navigation', 'route_navigation', exception, {
    route,
    issue
  })
} 