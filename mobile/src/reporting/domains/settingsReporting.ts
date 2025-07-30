import { reportError } from '../errors/errorReporting'

/**
 * Settings navigation reporting methods
 * Follows Single Responsibility Principle - only handles settings navigation reporting
 */

/**
 * Report Bluetooth settings navigation failures
 */
export const reportBluetoothSettingsNavigationFailure = (reason: string, exception?: Error): void => {
  reportError("Error opening Bluetooth settings", 'settings.navigation', 'open_bluetooth', exception, { reason })
}

/**
 * Report location services dialog failures
 */
export const reportLocationServicesDialogFailure = (reason: string, exception?: Error): void => {
  reportError("Error showing location services dialog", 'settings.navigation', 'show_location_dialog', exception, { reason })
}

/**
 * Report location settings navigation failures
 */
export const reportLocationSettingsNavigationFailure = (reason: string, exception?: Error): void => {
  reportError("Error opening location settings", 'settings.navigation', 'open_location', exception, { reason })
}

/**
 * Report app settings navigation failures
 */
export const reportAppSettingsNavigationFailure = (reason: string, exception?: Error): void => {
  reportError("Error opening app settings", 'settings.navigation', 'open_app_settings', exception, { reason })
}

/**
 * Report app permissions navigation failures
 */
export const reportAppPermissionsNavigationFailure = (reason: string, exception?: Error): void => {
  reportError("Failed to open app settings", 'settings.navigation', 'open_app_permissions', exception, { reason })
}

/**
 * Report requirement settings navigation failures
 */
export const reportRequirementSettingsNavigationFailure = (requirement: string, reason: string, exception?: Error): void => {
  reportError("Error opening settings for requirement", 'settings.navigation', 'open_requirement_settings', exception, { 
    requirement,
    reason 
  })
} 