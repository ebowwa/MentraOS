import { reportError, reportWarning } from '../errors/errorReporting'

/**
 * Location and permissions reporting methods
 * Follows Single Responsibility Principle - only handles permission reporting
 */

/**
 * Report location access failures
 */
export const reportLocationAccessFailure = (operation: string, reason: string, exception?: Error): void => {
  reportError(`Location access failure during ${operation}: ${reason}`, 'location.access', operation, exception, {
    operation,
    reason
  })
}

/**
 * Report permission denied
 */
export const reportPermissionDenied = (permission: string, operation: string): void => {
  reportWarning(`Permission denied for ${permission} during ${operation}`, 'permission.access', operation, {
    permission,
    operation
  })
} 