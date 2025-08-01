// =====================================
// 📦 CORE TYPES AND INTERFACES
// =====================================
export { ReportLevel, ReportData, ReportDataBuilder, createReport, IReportProvider } from './core'
export { ReportManager } from './core'

// =====================================
// 🔌 PROVIDERS
// =====================================
export { SentryReportProvider, ConsoleReportProvider, PostHogReportProvider } from './providers'

// =====================================
// 📊 ANALYTICS & TRACKING
// =====================================
export {
  trackEvent,
  trackUserAction,
  trackFeatureUsage,
  trackPageView,
  trackPerformance,
  trackApiEvent,
  trackSessionEvent,
  trackTranscriptionEvent,
  trackAuthEvent,
  trackErrorEvent,
} from './analytics'

// =====================================
// ⚠️ ERROR REPORTING
// =====================================
export {
  reportError,
  reportWarning,
  reportInfo,
  reportCritical,
} from './errors'

// =====================================
// 📱 APP LIFECYCLE REPORTING
// =====================================
export {
  reportAppStartupIssue,
  reportAppCrash,
  reportNavigationIssue,
} from './domains'

// =====================================
// 🌐 NETWORK & API REPORTING
// =====================================
export {
  reportApiRequestFailure,
  reportNetworkIssue,
  reportTimeoutError,
} from './domains'

// =====================================
// 💾 STORAGE & DATA REPORTING
// =====================================
export {
  reportStorageReadFailure,
  reportStorageWriteFailure,
  reportDataParsingError,
} from './domains'

// =====================================
// 📷 CAMERA & MEDIA REPORTING
// =====================================
export {
  reportCameraAccessFailure,
  reportCameraPermissionDenied,
  reportMediaCaptureFailure,
} from './domains'

// =====================================
// 📍 LOCATION & PERMISSIONS REPORTING
// =====================================
export {
  reportLocationAccessFailure,
  reportPermissionDenied,
} from './domains'

// =====================================
// 🔄 STATE MANAGEMENT REPORTING
// =====================================
export {
  reportStateInconsistency,
  reportStateUpdateFailure,
} from './domains'

// =====================================
// 🎨 UI & COMPONENTS REPORTING
// =====================================
export {
  reportComponentError,
  reportUIInteractionFailure,
} from './domains'

// =====================================
// 🛠️ SYSTEM MANAGEMENT
// =====================================
export {
  initializeReporting,
  setUserContext,
  clearUserContext,
  addBreadcrumb,
  setProviderEnabled,
  getReportManager,
  getProviderStatus,
} from './system'

// =====================================
// ⚙️ CONFIGURATION
// =====================================
export {
  // Sentry configuration
  getSentryDsn,
  getSentryOrg,
  getSentryProject,
  getSentryUrl,
  isSentryEnabled,
  initializeSentry,
  getSentryAppConfig,
  // PostHog configuration
  getPostHogApiKey,
  getPostHogHost,
  isPostHogEnabled,
  initializePostHog,
  getPostHog,
} from './config' 