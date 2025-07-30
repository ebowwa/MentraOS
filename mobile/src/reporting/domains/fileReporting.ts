import { reportError } from '../errors/errorReporting'

/**
 * File sharing reporting methods
 * Follows Single Responsibility Principle - only handles file reporting
 */

/**
 * Report direct file sharing failures
 */
export const reportDirectFileSharingFailure = (filePath: string, reason: string, exception?: Error): void => {
  reportError("Error with direct sharing", 'file.sharing', 'direct_share', exception, { 
    filePath,
    reason 
  })
}

/**
 * Report content URI retrieval failures
 */
export const reportContentUriRetrievalFailure = (filePath: string, reason: string, exception?: Error): void => {
  reportError("Error getting content URI", 'file.sharing', 'get_content_uri', exception, { 
    filePath,
    reason 
  })
}

/**
 * Report file sharing failures
 */
export const reportFileSharingFailure = (filePath: string, mimeType: string, reason: string, exception?: Error): void => {
  reportError("Error sharing file", 'file.sharing', 'share_file', exception, { 
    filePath, 
    mimeType,
    reason 
  })
} 