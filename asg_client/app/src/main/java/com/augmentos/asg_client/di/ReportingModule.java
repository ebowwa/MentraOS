package com.augmentos.asg_client.di;

import android.content.Context;

import com.augmentos.asg_client.reporting.core.IReportProvider;
import com.augmentos.asg_client.reporting.providers.SentryReportProvider;
import com.augmentos.asg_client.reporting.providers.ConsoleReportProvider;

import java.util.ArrayList;
import java.util.List;

/**
 * Dependency Injection module for reporting providers
 * Follows Dependency Inversion Principle - depends on abstractions
 * Follows Open/Closed Principle - easy to add new providers
 */
public class ReportingModule {
    
    /**
     * Create all reporting providers
     * Each provider handles its own initialization
     * Follows Open/Closed Principle - easy to add new providers
     */
    public static List<IReportProvider> createProviders(Context context) {
        List<IReportProvider> providers = new ArrayList<>();
        
        // Add Sentry provider for production monitoring
        providers.add(new SentryReportProvider());
        
        // Add Console provider for development debugging
        if (isDebugBuild()) {
            providers.add(new ConsoleReportProvider());
        }
        
        // Future providers can be added here without modifying existing code
        // providers.add(new CrashlyticsReportProvider());
        // providers.add(new FirebaseReportProvider());
        
        return providers;
    }
    
    /**
     * Check if this is a debug build
     */
    private static boolean isDebugBuild() {
        try {
            // This will be true for debug builds, false for release
            return com.augmentos.asg_client.BuildConfig.DEBUG;
        } catch (Exception e) {
            // Fallback to false if BuildConfig is not available
            return false;
        }
    }
} 