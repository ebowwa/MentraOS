package com.augmentos.asg_client.io.hardware.core;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.hardware.interfaces.IHardwareManager;

/**
 * Base implementation of the IHardwareManager interface.
 * Provides default no-op implementations for devices without specific hardware support.
 * This is used when running on generic Android devices or emulators.
 */
public class BaseHardwareManager implements IHardwareManager {
    private static final String TAG = "BaseHardwareManager";
    
    protected final Context context;
    protected boolean isInitialized = false;
    
    /**
     * Create a new BaseHardwareManager
     * @param context The application context
     */
    public BaseHardwareManager(Context context) {
        this.context = context.getApplicationContext();
    }
    
    @Override
    public void initialize() {
        Log.d(TAG, "Initializing BaseHardwareManager (no hardware-specific features)");
        isInitialized = true;
    }
    
    @Override
    public boolean supportsRecordingLed() {
        // Base implementation doesn't support LED
        return false;
    }
    
    @Override
    public void setRecordingLedOn() {
        Log.d(TAG, "setRecordingLedOn() called - no-op on base hardware");
    }
    
    @Override
    public void setRecordingLedOff() {
        Log.d(TAG, "setRecordingLedOff() called - no-op on base hardware");
    }
    
    @Override
    public void setRecordingLedBlinking() {
        Log.d(TAG, "setRecordingLedBlinking() called - no-op on base hardware");
    }
    
    @Override
    public void setRecordingLedBlinking(long onDurationMs, long offDurationMs) {
        Log.d(TAG, String.format("setRecordingLedBlinking(%d, %d) called - no-op on base hardware", 
                                 onDurationMs, offDurationMs));
    }
    
    @Override
    public void stopRecordingLedBlinking() {
        Log.d(TAG, "stopRecordingLedBlinking() called - no-op on base hardware");
    }
    
    @Override
    public void flashRecordingLed(long durationMs) {
        Log.d(TAG, String.format("flashRecordingLed(%d) called - no-op on base hardware", durationMs));
    }
    
    @Override
    public boolean isRecordingLedOn() {
        // Always return false for base implementation
        return false;
    }
    
    @Override
    public boolean isRecordingLedBlinking() {
        // Always return false for base implementation
        return false;
    }
    
    @Override
    public String getDeviceModel() {
        return "GENERIC";
    }
    
    @Override
    public boolean isK900Device() {
        return false;
    }
    
    @Override
    public void shutdown() {
        Log.d(TAG, "Shutting down BaseHardwareManager");
        isInitialized = false;
    }
}