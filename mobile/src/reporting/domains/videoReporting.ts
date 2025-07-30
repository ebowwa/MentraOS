import { reportError } from '../errors/errorReporting'

/**
 * Video reporting methods
 * Follows Single Responsibility Principle - only handles video reporting
 */

/**
 * Report video playback failures
 */
export const reportVideoPlaybackFailure = (filePath: string, reason: string, exception?: Error): void => {
  reportError("Error playing video", 'video.streaming', 'play_video', exception, { 
    filePath,
    reason 
  })
}

/**
 * Report video sharing failures
 */
export const reportVideoSharingFailure = (filePath: string, reason: string, exception?: Error): void => {
  reportError("Error sharing video", 'video.sharing', 'share_video', exception, { 
    filePath,
    reason 
  })
} 