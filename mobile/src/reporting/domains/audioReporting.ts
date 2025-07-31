import { reportError } from '../errors/errorReporting'

/**
 * Audio reporting methods
 * Follows Single Responsibility Principle - only handles audio reporting
 */

/**
 * Report audio streaming start failures
 */
export const reportAudioStartFailure = (requestId: string, reason: string, exception?: Error): void => {
  reportError(`Failed to start audio play for requestId ${requestId}`, 'audio.streaming', 'start_audio', exception, { 
    requestId,
    reason 
  })
}

/**
 * Report audio stop failures
 */
export const reportAudioStopFailure = (requestId: string, reason: string, exception?: Error): void => {
  reportError(`Failed to stop audio for requestId ${requestId}`, 'audio.streaming', 'stop_audio', exception, { 
    requestId,
    reason 
  })
}

/**
 * Report audio stop all failures
 */
export const reportAudioStopAllFailure = (reason: string, exception?: Error): void => {
  reportError("Failed to stop all audio", 'audio.streaming', 'stop_all_audio', exception, { reason })
} 