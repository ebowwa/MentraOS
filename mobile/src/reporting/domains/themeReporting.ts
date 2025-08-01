import { reportError } from '../errors/errorReporting'

/**
 * Theme reporting methods
 * Follows Single Responsibility Principle - only handles theme reporting
 */

/**
 * Report theme provider initialization issues
 */
export const reportThemeProviderIssue = (operation: string, reason: string): void => {
  reportError(`Tried to call ${operation} before the ThemeProvider was initialized`, 'theme.provider', operation, undefined, {
    operation,
    reason
  })
}

/**
 * Report theme preference loading failures
 */
export const reportThemePreferenceLoadFailure = (reason: string, exception?: Error): void => {
  reportError("Error loading theme preference", 'theme.preferences', 'load_theme', exception, { reason })
} 