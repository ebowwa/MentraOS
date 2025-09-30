package com.augmentos.asg_client.io.hardware.core;

import android.content.Context;
import android.os.Build;
import android.util.Log;

import com.augmentos.asg_client.io.hardware.interfaces.IHardwareManager;
import com.augmentos.asg_client.io.hardware.managers.K900HardwareManager;

/**
 * Factory class for creating the appropriate IHardwareManager implementation
 * based on the detected device type.
 */
public class HardwareManagerFactory {
    private static final String TAG = "HardwareManagerFactory";
    
    private static IHardwareManager instance;
    
    /**
     * Get the singleton instance of the hardware manager appropriate for this device.
     * 
     * @param context The application context
     * @return An IHardwareManager implementation suitable for the current device
     */
    public static synchronized IHardwareManager getInstance(Context context) {
        if (instance == null) {
            instance = createHardwareManager(context);
            instance.initialize();
        }
        return instance;
    }
    
    /**
     * Create a new hardware manager based on device detection.
     * 
     * @param context The application context
     * @return A new IHardwareManager implementation
     */
    private static IHardwareManager createHardwareManager(Context context) {
        if (isK900Device()) {
            Log.d(TAG, "🔧 Detected K900 device - creating K900HardwareManager");
            return new K900HardwareManager(context);
        } else {
            Log.d(TAG, "🔧 Generic device detected - creating BaseHardwareManager");
            return new BaseHardwareManager(context);
        }
    }
    
    /**
     * Detect if this is a K900 device.
     * 
     * @return true if running on K900 hardware, false otherwise
     */
    private static boolean isK900Device() {
        // TODO: Implement proper K900 detection logic
        // For now, always return true as requested
        // In production, this should check:
        // - Build.MANUFACTURER
        // - Build.MODEL
        // - Build.DEVICE
        // - System properties
        // - Presence of K900-specific hardware features
        
        Log.d(TAG, "Device detection:");
        Log.d(TAG, "  Manufacturer: " + Build.MANUFACTURER);
        Log.d(TAG, "  Model: " + Build.MODEL);
        Log.d(TAG, "  Device: " + Build.DEVICE);
        Log.d(TAG, "  Product: " + Build.PRODUCT);
        Log.d(TAG, "  Hardware: " + Build.HARDWARE);
        
        // TODO: Replace with actual K900 detection
        // For now, always assume K900 as requested
        boolean isK900 = true;
        
        Log.d(TAG, "K900 device detected: " + isK900);
        return isK900;
    }
    
    /**
     * Reset the singleton instance.
     * Useful for testing or when switching contexts.
     */
    public static synchronized void reset() {
        if (instance != null) {
            instance.shutdown();
            instance = null;
        }
    }
    
    /**
     * Check if a hardware manager has been initialized.
     * 
     * @return true if an instance exists, false otherwise
     */
    public static synchronized boolean hasInstance() {
        return instance != null;
    }
}