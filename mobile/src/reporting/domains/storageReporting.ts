import { reportError } from '../errors/errorReporting'

/**
 * Storage and data reporting methods
 * Follows Single Responsibility Principle - only handles storage reporting
 */

/**
 * Report storage read failures
 */
export const reportStorageReadFailure = (key: string, reason: string, exception?: Error): void => {
  reportError(`Storage read failure for key "${key}": ${reason}`, 'storage.read', 'storage_read', exception, {
    key,
    reason
  })
}

/**
 * Report storage write failures
 */
export const reportStorageWriteFailure = (key: string, reason: string, exception?: Error): void => {
  reportError(`Storage write failure for key "${key}": ${reason}`, 'storage.write', 'storage_write', exception, {
    key,
    reason
  })
}

/**
 * Report data parsing errors
 */
export const reportDataParsingError = (dataType: string, reason: string, exception?: Error): void => {
  reportError(`Data parsing error for ${dataType}: ${reason}`, 'data.parsing', 'data_parse', exception, {
    dataType,
    reason
  })
} 