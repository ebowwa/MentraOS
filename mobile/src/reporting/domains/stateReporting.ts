import { reportError, reportWarning } from '../errors/errorReporting'

/**
 * State management reporting methods
 * Follows Single Responsibility Principle - only handles state reporting
 */

/**
 * Report state inconsistencies
 */
export const reportStateInconsistency = (component: string, expectedState: string, actualState: string): void => {
  reportWarning(`State inconsistency in ${component}`, 'state.consistency', 'state_check', {
    component,
    expectedState,
    actualState
  })
}

/**
 * Report state update failures
 */
export const reportStateUpdateFailure = (component: string, reason: string, exception?: Error): void => {
  reportError(`State update failure in ${component}: ${reason}`, 'state.update', 'state_update', exception, {
    component,
    reason
  })
} 