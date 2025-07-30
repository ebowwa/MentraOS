/**
 * Secure PostHog configuration
 * Reads credentials from environment variables to keep them out of source code
 */

// Environment variable keys
const POSTHOG_API_KEY_KEY = 'POSTHOG_API_KEY'
const POSTHOG_HOST_KEY = 'POSTHOG_HOST'
const POSTHOG_ENABLED_KEY = 'POSTHOG_ENABLED'

/**
 * Get PostHog API key from environment variables
 */
export const getPostHogApiKey = (): string | undefined => {
  return process.env[POSTHOG_API_KEY_KEY] || 
         process.env.EXPO_PUBLIC_POSTHOG_API_KEY ||
         undefined
}

/**
 * Get PostHog host from environment variables
 */
export const getPostHogHost = (): string => {
  return process.env[POSTHOG_HOST_KEY] || 
         process.env.EXPO_PUBLIC_POSTHOG_HOST ||
         'https://app.posthog.com'
}

/**
 * Check if PostHog is enabled
 */
export const isPostHogEnabled = (): boolean => {
  const enabled = process.env[POSTHOG_ENABLED_KEY] || 
                 process.env.EXPO_PUBLIC_POSTHOG_ENABLED ||
                 'false'
  
  const apiKey = getPostHogApiKey()
  
  return enabled.toLowerCase() === 'true' && !!apiKey
}

/**
 * Initialize PostHog with secure configuration
 */
export const initializePostHog = (): void => {
  if (!isPostHogEnabled()) {
    console.log('PostHog not enabled - no API key provided or disabled')
    return
  }

  try {
    const apiKey = getPostHogApiKey()
    const host = getPostHogHost()
    
    if (!apiKey) {
      console.warn('PostHog API key is empty')
      return
    }

    // Import PostHog dynamically to avoid issues if not installed
    const posthog = require('posthog-react-native')
    
    posthog.setup(apiKey, {
      host,
      // Enable debug mode in development
      enable: __DEV__,
      // Configure session recording
      sessionRecording: {
        enabled: true,
        // Lower sampling rate for privacy
        sampleRate: 0.1, // 10% of sessions
      },
      // Configure feature flags
      featureFlags: {
        enabled: true,
      },
      // Configure autocapture
      autocapture: {
        enabled: true,
      },
    })

    console.log('PostHog initialized successfully')
  } catch (error) {
    console.error('Failed to initialize PostHog:', error)
  }
}

/**
 * Get PostHog instance for manual tracking
 */
export const getPostHog = (): any => {
  if (!isPostHogEnabled()) {
    return null
  }

  try {
    return require('posthog-react-native')
  } catch (error) {
    console.error('PostHog not available:', error)
    return null
  }
} 