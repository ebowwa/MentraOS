package com.augmentos.asg_client;

import android.app.Application;
import android.util.Log;

import com.augmentos.asg_client.reporting.core.ReportManager;
import com.augmentos.asg_client.di.ReportingModule;

/**
 * Application class for ASG Client
 * Handles app-wide initialization following SOLID principles
 */
public class AsgClientApplication extends Application {
    
    private static final String TAG = "AsgClientApplication";
    private static AsgClientApplication instance;
    
    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        
        // Initialize reporting system
        initializeReporting();
        
        Log.i(TAG, "ASG Client Application initialized");
    }
    
    /**
     * Initialize the reporting system with all providers
     * Follows Single Responsibility Principle - only handles reporting setup
     * Follows Dependency Inversion Principle - depends on abstractions
     * Follows Open/Closed Principle - easy to add new providers
     */
    private void initializeReporting() {
        Log.i(TAG, "Initializing reporting system...");
        
        ReportManager manager = ReportManager.getInstance(this);
        
        // Get all providers from DI module
        // Each provider handles its own secure initialization
        for (var provider : ReportingModule.createProviders(this)) {
            manager.addProvider(provider);
        }
        
        Log.i(TAG, "Reporting system initialized successfully");
    }
    
    /**
     * Get application instance
     */
    public static AsgClientApplication getInstance() {
        return instance;
    }
    
    /**
     * Get ReportManager instance
     */
    public ReportManager getReportManager() {
        return ReportManager.getInstance(this);
    }
} 