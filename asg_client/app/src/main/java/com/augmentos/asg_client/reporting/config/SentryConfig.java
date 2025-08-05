package com.augmentos.asg_client.reporting.config;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Secure Sentry configuration management for open-source projects
 * 
 * This class implements a secure configuration system that:
 * 1. Reads from environment variables (highest priority)
 * 2. Reads from properties files (medium priority) 
 * 3. Uses build-time configuration (lowest priority)
 * 4. Provides clear fallbacks for development
 * 
 * SECURITY NOTES:
 * - Never commit actual DSNs to version control
 * - Use environment variables or properties files for sensitive data
 * - The sentry.properties file is already in .gitignore
 * - Environment variables take precedence for CI/CD deployments
 */
public class SentryConfig {
    
    private static final String TAG = "SentryConfig";
    
    // Configuration keys
    private static final String KEY_SENTRY_DSN = "sentry.dsn";
    private static final String KEY_SENTRY_ENABLED = "sentry.enabled";
    private static final String KEY_SENTRY_SAMPLE_RATE = "sentry.sample_rate";
    private static final String KEY_SENTRY_ENVIRONMENT = "sentry.environment";
    private static final String KEY_SENTRY_RELEASE = "sentry.release";
    
    // Environment variable names
    private static final String ENV_SENTRY_DSN = "SENTRY_DSN";
    private static final String ENV_SENTRY_ENABLED = "SENTRY_ENABLED";
    private static final String ENV_SENTRY_SAMPLE_RATE = "SENTRY_SAMPLE_RATE";
    private static final String ENV_SENTRY_ENVIRONMENT = "SENTRY_ENVIRONMENT";
    private static final String ENV_SENTRY_RELEASE = "SENTRY_RELEASE";
    
    // Default values (safe for open source)
    private static final String DEFAULT_SENTRY_DSN = null; // No default DSN for security
    private static final boolean DEFAULT_ENABLED = false; // Disabled by default
    private static final double DEFAULT_SAMPLE_RATE = 0.1; // 10% sample rate by default
    private static final String DEFAULT_ENVIRONMENT = "development";
    private static final String DEFAULT_RELEASE = "1.0.0";
    
    // Properties file names (in order of priority)
    private static final String[] PROPERTIES_FILES = {
        "sentry.properties",     // Main config file (in .gitignore)
        "env",                   // Environment file (in .gitignore)
        "config.properties"      // General config (can be committed)
    };
    
    // Cached configuration
    private static Properties cachedProperties = null;
    private static boolean propertiesLoaded = false;
    
    /**
     * Get Sentry DSN from secure sources
     * Priority: Environment Variable > Properties File > Build Config > null
     */
    public static String getSentryDsn() {
        // 1. Check environment variable first (highest priority)
        String dsn = System.getenv(ENV_SENTRY_DSN);
        if (dsn != null && !dsn.trim().isEmpty()) {
            Log.d(TAG, "Using Sentry DSN from environment variable");
            return dsn.trim();
        }
        
        // 2. Check properties files
        dsn = getProperty(KEY_SENTRY_DSN);
        if (dsn != null && !dsn.trim().isEmpty()) {
            Log.d(TAG, "Using Sentry DSN from properties file");
            return dsn.trim();
        }
        
        // 3. Check BuildConfig (if available)
        try {
            // This would be set during build time via gradle
            Class<?> buildConfigClass = Class.forName("com.augmentos.asg_client.BuildConfig");
            java.lang.reflect.Field dsnField = buildConfigClass.getDeclaredField("SENTRY_DSN");
            dsnField.setAccessible(true);
            String buildDsn = (String) dsnField.get(null);
            if (buildDsn != null && !buildDsn.trim().isEmpty()) {
                Log.d(TAG, "Using Sentry DSN from BuildConfig");
                return buildDsn.trim();
            }
        } catch (Exception e) {
            // BuildConfig field doesn't exist, which is fine
            Log.d(TAG, "No BuildConfig SENTRY_DSN found");
        }
        
        // 4. Return null for security (no default DSN)
        Log.w(TAG, "No Sentry DSN configured - Sentry will be disabled");
        return null;
    }
    
    /**
     * Check if Sentry is enabled
     * Priority: Environment Variable > Properties File > Default (false)
     */
    public static boolean isSentryEnabled() {
        // 1. Check environment variable
        String envEnabled = System.getenv(ENV_SENTRY_ENABLED);
        if (envEnabled != null) {
            return Boolean.parseBoolean(envEnabled);
        }
        
        // 2. Check properties file
        String propEnabled = getProperty(KEY_SENTRY_ENABLED);
        if (propEnabled != null) {
            return Boolean.parseBoolean(propEnabled);
        }
        
        // 3. Default to false for security
        return DEFAULT_ENABLED;
    }
    
    /**
     * Get Sentry sample rate (0.0 to 1.0)
     * Priority: Environment Variable > Properties File > Default (0.1)
     */
    public static double getSampleRate() {
        // 1. Check environment variable
        String envRate = System.getenv(ENV_SENTRY_SAMPLE_RATE);
        if (envRate != null) {
            try {
                double rate = Double.parseDouble(envRate);
                return Math.max(0.0, Math.min(1.0, rate)); // Clamp between 0 and 1
            } catch (NumberFormatException e) {
                Log.w(TAG, "Invalid SENTRY_SAMPLE_RATE environment variable: " + envRate);
            }
        }
        
        // 2. Check properties file
        String propRate = getProperty(KEY_SENTRY_SAMPLE_RATE);
        if (propRate != null) {
            try {
                double rate = Double.parseDouble(propRate);
                return Math.max(0.0, Math.min(1.0, rate)); // Clamp between 0 and 1
            } catch (NumberFormatException e) {
                Log.w(TAG, "Invalid sentry.sample_rate property: " + propRate);
            }
        }
        
        // 3. Default sample rate
        return DEFAULT_SAMPLE_RATE;
    }
    
    /**
     * Get Sentry environment
     * Priority: Environment Variable > Properties File > Build Config > Default
     */
    public static String getEnvironment() {
        // 1. Check environment variable
        String env = System.getenv(ENV_SENTRY_ENVIRONMENT);
        if (env != null && !env.trim().isEmpty()) {
            return env.trim();
        }
        
        // 2. Check properties file
        String propEnv = getProperty(KEY_SENTRY_ENVIRONMENT);
        if (propEnv != null && !propEnv.trim().isEmpty()) {
            return propEnv.trim();
        }
        
        // 3. Check BuildConfig
        try {
            Class<?> buildConfigClass = Class.forName("com.augmentos.asg_client.BuildConfig");
            java.lang.reflect.Field envField = buildConfigClass.getDeclaredField("SENTRY_ENVIRONMENT");
            envField.setAccessible(true);
            String buildEnv = (String) envField.get(null);
            if (buildEnv != null && !buildEnv.trim().isEmpty()) {
                return buildEnv.trim();
            }
        } catch (Exception e) {
            // BuildConfig field doesn't exist, which is fine
        }
        
        // 4. Default environment
        return DEFAULT_ENVIRONMENT;
    }
    
    /**
     * Get Sentry release version
     * Priority: Environment Variable > Properties File > Build Config > Default
     */
    public static String getRelease() {
        // 1. Check environment variable
        String envRelease = System.getenv(ENV_SENTRY_RELEASE);
        if (envRelease != null && !envRelease.trim().isEmpty()) {
            return envRelease.trim();
        }
        
        // 2. Check properties file
        String propRelease = getProperty(KEY_SENTRY_RELEASE);
        if (propRelease != null && !propRelease.trim().isEmpty()) {
            return propRelease.trim();
        }
        
        // 3. Check BuildConfig
        try {
            Class<?> buildConfigClass = Class.forName("com.augmentos.asg_client.BuildConfig");
            java.lang.reflect.Field versionField = buildConfigClass.getDeclaredField("VERSION_NAME");
            versionField.setAccessible(true);
            String buildVersion = (String) versionField.get(null);
            if (buildVersion != null && !buildVersion.trim().isEmpty()) {
                return buildVersion.trim();
            }
        } catch (Exception e) {
            // BuildConfig field doesn't exist, which is fine
        }
        
        // 4. Default release
        return DEFAULT_RELEASE;
    }
    
    /**
     * Validate Sentry configuration
     * Returns true if Sentry is properly configured and enabled
     */
    public static boolean isValidConfiguration() {
        if (!isSentryEnabled()) {
            return false;
        }
        
        String dsn = getSentryDsn();
        if (dsn == null || dsn.trim().isEmpty()) {
            return false;
        }
        
        // Basic DSN validation
        return dsn.startsWith("https://") && dsn.contains("@") && dsn.contains(".ingest.sentry.io/");
    }
    
    /**
     * Log configuration status (safe for production)
     */
    public static void logConfigurationStatus() {
        if (isValidConfiguration()) {
            Log.i(TAG, "Sentry configuration is valid and enabled");
            Log.d(TAG, "Sentry environment: " + getEnvironment());
            Log.d(TAG, "Sentry release: " + getRelease());
            Log.d(TAG, "Sentry sample rate: " + getSampleRate());
        } else {
            Log.w(TAG, "Sentry configuration is invalid or disabled");
            if (!isSentryEnabled()) {
                Log.d(TAG, "Sentry is disabled");
            } else {
                Log.d(TAG, "Sentry is enabled but DSN is not configured");
            }
        }
    }
    
    /**
     * Get a property value from the loaded properties files
     */
    private static String getProperty(String key) {
        if (!propertiesLoaded) {
            loadProperties();
        }
        
        if (cachedProperties != null) {
            return cachedProperties.getProperty(key);
        }
        
        return null;
    }
    
    /**
     * Load properties from configuration files
     * Files are loaded in order of priority (last one wins)
     */
    private static void loadProperties() {
        cachedProperties = new Properties();
        
        for (String fileName : PROPERTIES_FILES) {
            try (InputStream input = SentryConfig.class.getClassLoader().getResourceAsStream(fileName)) {
                if (input != null) {
                    Properties fileProps = new Properties();
                    fileProps.load(input);
                    
                    // Merge properties (later files override earlier ones)
                    for (String key : fileProps.stringPropertyNames()) {
                        cachedProperties.setProperty(key, fileProps.getProperty(key));
                    }
                    
                    Log.d(TAG, "Loaded properties from: " + fileName);
                }
            } catch (IOException e) {
                // File doesn't exist or can't be read, which is fine
                Log.d(TAG, "Could not load properties from: " + fileName);
            }
        }
        
        propertiesLoaded = true;
    }
    
    /**
     * Reset cached properties (useful for testing)
     */
    public static void resetCache() {
        cachedProperties = null;
        propertiesLoaded = false;
    }
} 