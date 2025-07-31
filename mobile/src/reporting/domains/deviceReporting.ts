import { reportError } from '../errors/errorReporting'

/**
 * Device connection reporting methods
 * Follows Single Responsibility Principle - only handles device reporting
 */

/**
 * Report device connection failures
 */
export const reportDeviceConnectionFailure = (deviceType: string, reason: string, exception?: Error): void => {
  reportError(`Connect to ${deviceType} error`, 'device.connection', 'connect_device', exception, { 
    deviceType,
    reason 
  })
}

/**
 * Report simulated device disconnection failures
 */
export const reportSimulatedDeviceDisconnectionFailure = (reason: string, exception?: Error): void => {
  reportError("Error disconnecting simulated wearable", 'device.simulation', 'disconnect_simulated', exception, { reason })
} 