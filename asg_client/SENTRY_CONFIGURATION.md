# Sentry Configuration Guide

This guide explains how to configure Sentry error reporting securely in the ASG Client project.

## 🔒 Security First

This is an **open-source project**, so we follow strict security practices:

- ❌ **Never commit actual DSNs to version control**
- ❌ **Never hardcode DSNs in AndroidManifest.xml**
- ✅ Use environment variables for production deployments
- ✅ Use local properties files for development
- ✅ All sensitive files are already in `.gitignore`
- ✅ DSN is set programmatically via `SentryInitializer`

## 🚀 Quick Setup

### For Development

The project is already configured with your Sentry DSN. You can use the provided scripts:

1. **Use the setup script (recommended):**
   ```bash
   ./setup-sentry.sh
   ```

2. **Or use the environment switcher:**
   ```bash
   ./switch-sentry-env.sh development
   ```

3. **Build and run** - Sentry will automatically load your configuration

### Project Configuration Details

- **Organization:** ahmad-wv
- **Project:** asg
- **DSN:** https://b9741072e209679b5afe7d613ce4966b@o4509753650249728.ingest.us.sentry.io/4509753949028352

### Environment Switching

The project includes pre-configured environment files:

```bash
# Switch to development (default)
./switch-sentry-env.sh development

# Switch to staging
./switch-sentry-env.sh staging

# Switch to production
./switch-sentry-env.sh production
```

### For Production

Use environment variables (recommended for CI/CD):

```bash
export SENTRY_DSN="https://b9741072e209679b5afe7d613ce4966b@o4509753650249728.ingest.us.sentry.io/4509753949028352"
export SENTRY_ENABLED="true"
export SENTRY_ENVIRONMENT="production"
export SENTRY_SAMPLE_RATE="0.05"
```

## 📋 Configuration Priority

The system loads configuration in this order (later sources override earlier ones):

1. **Environment Variables** (highest priority)
2. **Properties Files** (medium priority)
3. **BuildConfig** (lowest priority)
4. **Default Values** (fallback)

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry DSN | `https://key@sentry.io/project` |
| `SENTRY_ENABLED` | Enable/disable Sentry | `true` or `false` |
| `SENTRY_SAMPLE_RATE` | Error sampling rate | `0.1` (10%) |
| `SENTRY_ENVIRONMENT` | Environment name | `production` |
| `SENTRY_RELEASE` | Release version | `1.2.3` |

### Properties Files

The system looks for these files in order:

1. `sentry.properties` (main config - in `.gitignore`)
2. `env` (environment file - in `.gitignore`)
3. `config.properties` (general config - can be committed)

### Properties File Format

```properties
# Sentry DSN
sentry.dsn=https://your-dsn@sentry.io/project-id

# Enable Sentry
sentry.enabled=true

# Sample rate (0.0 to 1.0)
sentry.sample_rate=0.1

# Environment
sentry.environment=development

# Release version
sentry.release=1.0.0
```

## 🏗️ Build-Time Configuration

You can also set Sentry configuration during the build process by adding fields to `BuildConfig`:

```gradle
android {
    buildTypes {
        release {
            buildConfigField "String", "SENTRY_DSN", "\"${System.getenv('SENTRY_DSN')}\""
            buildConfigField "String", "SENTRY_ENVIRONMENT", "\"production\""
        }
        debug {
            buildConfigField "String", "SENTRY_DSN", "\"${System.getenv('SENTRY_DSN')}\""
            buildConfigField "String", "SENTRY_ENVIRONMENT", "\"development\""
        }
    }
}
```

## 🔧 Usage in Code

### Secure Initialization (Recommended)

The `ReportManager` handles all reporting initialization directly. Each provider (including Sentry) handles its own secure initialization:

```java
import com.augmentos.asg_client.reporting.core.ReportManager;
import com.augmentos.asg_client.reporting.providers.SentryReportProvider;

// Initialize all reporting systems
// SentryReportProvider will handle its own secure initialization
ReportManager manager = ReportManager.getInstance(this);
manager.addProvider(new SentryReportProvider());
```

### Manual Provider Configuration (Advanced)

The `SentryConfig` class provides static methods for accessing configuration:

```java
import com.augmentos.asg_client.reporting.config.SentryConfig;

// Check if Sentry is properly configured
if (SentryConfig.isValidConfiguration()) {
    // Initialize Sentry with configuration
    String dsn = SentryConfig.getSentryDsn();
    String environment = SentryConfig.getEnvironment();
    double sampleRate = SentryConfig.getSampleRate();
    
    // Configure Sentry SDK
    SentryAndroid.init(this, options -> {
        options.setDsn(dsn);
        options.setEnvironment(environment);
        options.setTracesSampleRate(sampleRate);
    });
}

// Log configuration status
SentryConfig.logConfigurationStatus();
```

## 🧪 Testing

For testing, you can reset the configuration cache:

```java
// Reset cached properties (useful for unit tests)
SentryConfig.resetCache();
```

## 🚨 Troubleshooting

### Sentry Not Working?

1. **Check if Sentry is enabled:**
   ```java
   boolean enabled = SentryConfig.isSentryEnabled();
   Log.d("Sentry", "Sentry enabled: " + enabled);
   ```

2. **Check if DSN is configured:**
   ```java
   String dsn = SentryConfig.getSentryDsn();
   Log.d("Sentry", "DSN configured: " + (dsn != null));
   ```

3. **Validate configuration:**
   ```java
   boolean valid = SentryConfig.isValidConfiguration();
   Log.d("Sentry", "Configuration valid: " + valid);
   ```

4. **Check logs for configuration source:**
   ```bash
   adb logcat | grep SentryConfig
   ```

### Common Issues

- **"No Sentry DSN configured"** - Set `SENTRY_DSN` environment variable or create `sentry.properties`
- **"Sentry is disabled"** - Set `sentry.enabled=true` in properties or `SENTRY_ENABLED=true` environment variable
- **"Invalid sample rate"** - Ensure sample rate is between 0.0 and 1.0

## 🔐 Security Best Practices

1. **Never commit sensitive data:**
   - ✅ Use environment variables for production
   - ✅ Use local properties files for development
   - ❌ Never hardcode DSNs in source code
   - ❌ Never hardcode DSNs in AndroidManifest.xml

2. **Use secure initialization:**
   - ✅ Use `SentryInitializer.initialize()` for programmatic setup
   - ✅ DSN is loaded from secure configuration sources
   - ✅ Sensitive data is filtered before sending to Sentry

3. **Use different DSNs for different environments:**
   - Development: `https://dev-key@sentry.io/dev-project`
   - Staging: `https://staging-key@sentry.io/staging-project`
   - Production: `https://prod-key@sentry.io/prod-project`

4. **Set appropriate sample rates:**
   - Development: `1.0` (100% - see all errors)
   - Production: `0.1` (10% - reduce noise)

5. **Use environment-specific settings:**
   - Development: `sentry.environment=development`
   - Production: `sentry.environment=production`

6. **Data privacy:**
   - ✅ Sensitive data is filtered in `SentryInitializer`
   - ✅ PII is removed from error reports
   - ✅ Device names and IP addresses are filtered

## 📚 Additional Resources

- [Sentry Android Documentation](https://docs.sentry.io/platforms/android/)
- [Sentry DSN Format](https://docs.sentry.io/product/sentry-basics/dsn-explainer/)
- [Environment Variables in Android](https://developer.android.com/studio/build/environment-variables) 