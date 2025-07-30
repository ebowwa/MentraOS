import { reportError } from '../errors/errorReporting'

/**
 * Simulation control reporting methods
 * Follows Single Responsibility Principle - only handles simulation reporting
 */

/**
 * Report head up simulation failures
 */
export const reportHeadUpSimulationFailure = (reason: string, exception?: Error): void => {
  reportError("Failed to simulate head up", 'simulation.controls', 'head_up', exception, { reason })
}

/**
 * Report head down simulation failures
 */
export const reportHeadDownSimulationFailure = (reason: string, exception?: Error): void => {
  reportError("Failed to simulate head down", 'simulation.controls', 'head_down', exception, { reason })
}

/**
 * Report button press simulation failures
 */
export const reportButtonPressSimulationFailure = (pressType: string, reason: string, exception?: Error): void => {
  reportError("Failed to simulate button press", 'simulation.controls', 'button_press', exception, { 
    pressType,
    reason 
  })
} 