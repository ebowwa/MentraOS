import { reportError, reportWarning } from '../errors/errorReporting'

/**
 * Network and API reporting methods
 * Follows Single Responsibility Principle - only handles network reporting
 */

/**
 * Report API request failures
 */
export const reportApiRequestFailure = (endpoint: string, method: string, statusCode: number, error: string): void => {
  reportError(`API request failed: ${method} ${endpoint}`, 'network.api', 'api_request', undefined, {
    endpoint,
    method,
    statusCode,
    error
  })
}

/**
 * Report network issues
 */
export const reportNetworkIssue = (issue: string, operation: string): void => {
  reportWarning(`Network issue during ${operation}: ${issue}`, 'network.connection', operation)
}

/**
 * Report timeout errors
 */
export const reportTimeoutError = (operation: string, timeoutMs: number): void => {
  reportError(`Timeout error during ${operation}`, 'network.timeout', operation, undefined, {
    timeoutMs,
    operation
  })
} 