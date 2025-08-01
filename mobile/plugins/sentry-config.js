/**
 * Dynamic Sentry configuration plugin
 * Reads configuration from environment variables to keep credentials secure
 */

module.exports = function (config) {
  // Get Sentry configuration from environment variables
  const sentryUrl = process.env.SENTRY_URL || process.env.EXPO_PUBLIC_SENTRY_URL || 'https://sentry.io/'
  const sentryProject = process.env.SENTRY_PROJECT || process.env.EXPO_PUBLIC_SENTRY_PROJECT || 'react-native'
  const sentryOrg = process.env.SENTRY_ORG || process.env.EXPO_PUBLIC_SENTRY_ORG || 'ahmad-wv'

  // Only add Sentry plugin if we have the required configuration
  if (sentryProject && sentryOrg) {
    config.plugins.push([
      "@sentry/react-native/expo",
      {
        url: sentryUrl,
        project: sentryProject,
        organization: sentryOrg,
      }
    ])
    console.log('Sentry plugin configured with:', { url: sentryUrl, project: sentryProject, organization: sentryOrg })
  } else {
    console.log('Sentry plugin not configured - missing environment variables')
  }

  return config
} 