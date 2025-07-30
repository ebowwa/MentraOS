/**
 * Domain-specific reporting functions
 */

// App lifecycle
export {
  reportAppStartupIssue,
  reportAppCrash,
  reportNavigationIssue,
} from './appLifecycle'

// Network & API
export {
  reportApiRequestFailure,
  reportNetworkIssue,
  reportTimeoutError,
} from './networkReporting'

// Storage & Data
export {
  reportStorageReadFailure,
  reportStorageWriteFailure,
  reportDataParsingError,
} from './storageReporting'

// Camera & Media
export {
  reportCameraAccessFailure,
  reportCameraPermissionDenied,
  reportMediaCaptureFailure,
} from './mediaReporting'

// Location & Permissions
export {
  reportLocationAccessFailure,
  reportPermissionDenied,
} from './permissionReporting'

// State Management
export {
  reportStateInconsistency,
  reportStateUpdateFailure,
} from './stateReporting'

// UI & Components
export {
  reportComponentError,
  reportUIInteractionFailure,
} from './uiReporting'

// Audio
export {
  reportAudioStartFailure,
  reportAudioStopFailure,
  reportAudioStopAllFailure,
} from './audioReporting'

// Theme
export {
  reportThemeProviderIssue,
  reportThemePreferenceLoadFailure,
} from './themeReporting'

// WiFi
export {
  reportWifiCredentialSaveFailure,
  reportWifiPasswordGetFailure,
  reportWifiCredentialsGetFailure,
  reportWifiCredentialRemoveFailure,
  reportWifiCredentialsClearFailure,
  reportWifiLastConnectedUpdateFailure,
  reportWifiRecentNetworksGetFailure,
} from './wifiReporting'

// Settings Navigation
export {
  reportBluetoothSettingsNavigationFailure,
  reportLocationServicesDialogFailure,
  reportLocationSettingsNavigationFailure,
  reportAppSettingsNavigationFailure,
  reportAppPermissionsNavigationFailure,
  reportRequirementSettingsNavigationFailure,
} from './settingsReporting'

// Device
export {
  reportDeviceConnectionFailure,
  reportSimulatedDeviceDisconnectionFailure,
} from './deviceReporting'

// Video
export {
  reportVideoPlaybackFailure,
  reportVideoSharingFailure,
} from './videoReporting'

// File
export {
  reportDirectFileSharingFailure,
  reportContentUriRetrievalFailure,
  reportFileSharingFailure,
} from './fileReporting'

// Simulation
export {
  reportHeadUpSimulationFailure,
  reportHeadDownSimulationFailure,
  reportButtonPressSimulationFailure,
} from './simulationReporting'

// App Management
export {
  reportAppNotFound,
  reportAppStopFailure,
  reportAppStartFailure,
} from './appManagementReporting' 