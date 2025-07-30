import { reportError, reportWarning } from '../errors/errorReporting'

/**
 * Camera and media reporting methods
 * Follows Single Responsibility Principle - only handles media reporting
 */

/**
 * Report camera access failures
 */
export const reportCameraAccessFailure = (operation: string, reason: string, exception?: Error): void => {
  reportError(`Camera access failure during ${operation}: ${reason}`, 'camera.access', operation, exception, {
    operation,
    reason
  })
}

/**
 * Report camera permission denied
 */
export const reportCameraPermissionDenied = (operation: string): void => {
  reportWarning(`Camera permission denied for ${operation}`, 'camera.permission', operation)
}

/**
 * Report media capture failures
 */
export const reportMediaCaptureFailure = (mediaType: string, reason: string, exception?: Error): void => {
  reportError(`Media capture failure for ${mediaType}: ${reason}`, 'media.capture', 'media_capture', exception, {
    mediaType,
    reason
  })
} 