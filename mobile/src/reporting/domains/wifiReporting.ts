import { reportError } from '../errors/errorReporting'

/**
 * WiFi credentials reporting methods
 * Follows Single Responsibility Principle - only handles WiFi reporting
 */

/**
 * Report WiFi credential save failures
 */
export const reportWifiCredentialSaveFailure = (ssid: string, reason: string, exception?: Error): void => {
  reportError("Error saving WiFi credentials", 'wifi.credentials', 'save_credentials', exception, { 
    ssid,
    reason 
  })
}

/**
 * Report WiFi password retrieval failures
 */
export const reportWifiPasswordGetFailure = (ssid: string, reason: string, exception?: Error): void => {
  reportError("Error getting WiFi password", 'wifi.credentials', 'get_password', exception, { 
    ssid,
    reason 
  })
}

/**
 * Report WiFi credentials retrieval failures
 */
export const reportWifiCredentialsGetFailure = (reason: string, exception?: Error): void => {
  reportError("Error getting all WiFi credentials", 'wifi.credentials', 'get_all_credentials', exception, { reason })
}

/**
 * Report WiFi credential removal failures
 */
export const reportWifiCredentialRemoveFailure = (ssid: string, reason: string, exception?: Error): void => {
  reportError("Error removing WiFi credentials", 'wifi.credentials', 'remove_credentials', exception, { 
    ssid,
    reason 
  })
}

/**
 * Report WiFi credentials clear failures
 */
export const reportWifiCredentialsClearFailure = (reason: string, exception?: Error): void => {
  reportError("Error clearing WiFi credentials", 'wifi.credentials', 'clear_credentials', exception, { reason })
}

/**
 * Report WiFi last connected time update failures
 */
export const reportWifiLastConnectedUpdateFailure = (ssid: string, reason: string, exception?: Error): void => {
  reportError("Error updating last connected time", 'wifi.credentials', 'update_last_connected', exception, { 
    ssid,
    reason 
  })
}

/**
 * Report WiFi recent networks retrieval failures
 */
export const reportWifiRecentNetworksGetFailure = (reason: string, exception?: Error): void => {
  reportError("Error getting recent networks", 'wifi.credentials', 'get_recent_networks', exception, { reason })
} 