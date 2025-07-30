/**
 * Secure Sentry configuration
 * Reads credentials from environment variables to keep them out of source code
 */

// Environment variable keys
const SENTRY_DSN_KEY = 'SENTRY_DSN'
const SENTRY_ORG_KEY = 'SENTRY_ORG'
const SENTRY_PROJECT_KEY = 'SENTRY_PROJECT'
const SENTRY_URL_KEY = 'SENTRY_URL'

/**
 * Get Sentry DSN from environment variables
 */
export const getSentryDsn = (): string | undefined => {
  // Try to get from environment variables
  const dsn = process.env[SENTRY_DSN_KEY] || 
              process.env.EXPO_PUBLIC_SENTRY_DSN ||
              undefined
  
  if (!dsn) {
    console.warn('Sentry DSN not found in environment variables')
    return undefined
  }
  
  return dsn
}

/**
 * Get Sentry organization from environment variables
 */
export const getSentryOrg = (): string | undefined => {
  return process.env[SENTRY_ORG_KEY] || 
         process.env.EXPO_PUBLIC_SENTRY_ORG ||
         undefined
}

/**
 * Get Sentry project from environment variables
 */
export const getSentryProject = (): string | undefined => {
  return process.env[SENTRY_PROJECT_KEY] || 
         process.env.EXPO_PUBLIC_SENTRY_PROJECT ||
         undefined
}

/**
 * Get Sentry URL from environment variables
 */
export const getSentryUrl = (): string => {
  return process.env[SENTRY_URL_KEY] || 
         process.env.EXPO_PUBLIC_SENTRY_URL ||
         'https://sentry.io/'
}

/**
 * Check if Sentry is enabled (has valid DSN)
 */
export const isSentryEnabled = (): boolean => {
  const dsn = getSentryDsn()
  return !!dsn && dsn.length > 0
}

/**
 * Initialize Sentry with secure configuration
 */
export const initializeSentry = (): void => {
  if (!isSentryEnabled()) {
    console.log('Sentry not enabled - no DSN provided')
    return
  }

  try {
    const dsn = getSentryDsn()
    if (!dsn) {
      console.warn('Sentry DSN is empty')
      return
    }

    // Import Sentry dynamically to avoid issues if not installed
    const Sentry = require('@sentry/react-native')
    
    Sentry.init({
      dsn,
      // Adds more context data to events (IP address, cookies, user, etc.)
      sendDefaultPii: true,
      // Configure Session Replay
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1,
      integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
      // Enable Spotlight in development
      spotlight: __DEV__,
    })

    console.log('Sentry initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Sentry:', error)
  }
}

/**
 * Get Sentry configuration for app.json
 */
export const getSentryAppConfig = () => {
  const org = getSentryOrg()
  const project = getSentryProject()
  const url = getSentryUrl()

  if (!org || !project) {
    console.warn('Sentry organization or project not configured')
    return null
  }

  return {
    url,
    project,
    organization: org,
  }
} 