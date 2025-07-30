import { reportError } from '../errors/errorReporting'

/**
 * UI and components reporting methods
 * Follows Single Responsibility Principle - only handles UI reporting
 */

/**
 * Report component errors
 */
export const reportComponentError = (component: string, reason: string, exception?: Error): void => {
  reportError(`Component error in ${component}: ${reason}`, 'ui.component', 'component_error', exception, {
    component,
    reason
  })
}

/**
 * Report UI interaction failures
 */
export const reportUIInteractionFailure = (interaction: string, reason: string, exception?: Error): void => {
  reportError(`UI interaction failure for ${interaction}: ${reason}`, 'ui.interaction', 'ui_interaction', exception, {
    interaction,
    reason
  })
} 