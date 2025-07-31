# Security Guide for MentraOS Mobile App

This document outlines the security measures implemented for the MentraOS mobile application, particularly focusing on keeping sensitive credentials secure in an open-source environment.

## 🔐 Credential Management

### Environment Variables

All sensitive credentials are stored in environment variables to prevent them from being committed to the repository:

#### Required Environment Variables

Create a `.env` file in the `mobile/` directory with the following variables:

```bash
# Sentry Configuration
SENTRY_DSN=https://your-sentry-dsn@sentry.io/your-project-id
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=your-project-slug
SENTRY_URL=https://sentry.io/

# PostHog Configuration
POSTHOG_API_KEY=phc_your-posthog-api-key
POSTHOG_HOST=https://app.posthog.com
POSTHOG_ENABLED=true

# Expo Public Variables (for client-side access)
EXPO_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/your-project-id
EXPO_PUBLIC_SENTRY_ORG=your-organization-slug
EXPO_PUBLIC_SENTRY_PROJECT=your-project-slug
EXPO_PUBLIC_SENTRY_URL=https://sentry.io/
EXPO_PUBLIC_POSTHOG_API_KEY=phc_your-posthog-api-key
EXPO_PUBLIC_POSTHOG_HOST=https://app.posthog.com
EXPO_PUBLIC_POSTHOG_ENABLED=true
```

### Getting Credentials

#### Sentry
1. Go to [Sentry.io](https://sentry.io)
2. Create a new project or select existing one
3. Go to Settings → Projects → [Your Project] → Client Keys (DSN)
4. Copy the DSN, organization slug, and project slug

#### PostHog
1. Go to [PostHog.com](https://posthog.com)
2. Create a new project or select existing one
3. Go to Settings → Project API Keys
4. Copy the API key and host URL

## 🛡️ Security Features

### 1. Dynamic Configuration Loading
- Credentials are loaded from environment variables at runtime
- No hardcoded secrets in source code
- Graceful fallback when credentials are missing

### 2. Conditional Service Initialization
- Services only initialize if valid credentials are provided
- App continues to function without analytics/error reporting if credentials are missing
- Clear logging when services are disabled

### 3. Environment-Specific Behavior
- Development: Enhanced logging and debugging
- Production: Optimized for performance and privacy
- Staging: Separate configuration for testing

### 4. Privacy Protection
- PII collection is configurable and disabled by default
- Session recording sampling rates are set to low values (10%)
- User data is anonymized where possible

## 🔧 Setup Instructions

### For Developers

1. **Copy the environment template:**
   ```bash
   cp env.example .env
   ```

2. **Fill in your credentials:**
   Edit `.env` with your actual Sentry and PostHog credentials

3. **Install dependencies:**
   ```bash
   bun install
   ```

4. **Start development:**
   ```bash
   bun start
   ```

5. **Verify initialization:**
   The reporting system automatically initializes Sentry and PostHog when the app starts. Check the console logs for initialization messages.

### For CI/CD

Set the following environment variables in your CI/CD pipeline:

```bash
# Required for builds
EXPO_PUBLIC_SENTRY_DSN
EXPO_PUBLIC_SENTRY_ORG
EXPO_PUBLIC_SENTRY_PROJECT
EXPO_PUBLIC_POSTHOG_API_KEY
EXPO_PUBLIC_POSTHOG_HOST
EXPO_PUBLIC_POSTHOG_ENABLED
```

### For Production Deployments

1. **Set production environment variables**
2. **Build the app:**
   ```bash
   bun run build:android
   bun run build:ios
   ```

## 🚨 Security Best Practices

### 1. Never Commit Credentials
- `.env` files are in `.gitignore`
- Use `env.example` as a template only
- Rotate credentials regularly

### 2. Use Different Credentials
- Development: Use separate Sentry/PostHog projects
- Staging: Use staging-specific projects
- Production: Use production projects

### 3. Monitor Access
- Regularly review Sentry and PostHog access logs
- Use least-privilege access for team members
- Enable 2FA on all accounts

### 4. Data Privacy
- Review and configure data retention policies
- Ensure GDPR/CCPA compliance
- Regularly audit data collection

## 🔍 Troubleshooting

### Services Not Initializing

1. **Check environment variables:**
   ```bash
   echo $SENTRY_DSN
   echo $POSTHOG_API_KEY
   ```

2. **Verify .env file exists:**
   ```bash
   ls -la mobile/.env
   ```

3. **Check console logs:**
   Look for initialization messages in the console

### Build Failures

1. **Missing public variables:**
   Ensure all `EXPO_PUBLIC_*` variables are set

2. **Plugin configuration:**
   Check that `plugins/sentry-config.js` is properly configured

### Runtime Errors

1. **Service not available:**
   Services gracefully disable if credentials are missing

2. **Network issues:**
   Check firewall and network connectivity

## 📞 Support

For security-related issues:
1. Check this documentation
2. Review the configuration files
3. Contact the development team
4. Report security vulnerabilities privately

## 🔄 Updates

This security configuration is regularly updated to:
- Follow security best practices
- Support new features
- Address potential vulnerabilities
- Improve privacy protection 