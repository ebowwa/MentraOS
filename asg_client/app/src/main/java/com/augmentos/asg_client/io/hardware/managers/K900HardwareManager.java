package com.augmentos.asg_client.io.hardware.managers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.hardware.core.BaseHardwareManager;
import com.augmentos.asg_client.hardware.K900LedController;

/**
 * Implementation of IHardwareManager for K900 devices.
 * Uses K900-specific hardware APIs including the xydev library for LED control.
 */
public class K900HardwareManager extends BaseHardwareManager {
    private static final String TAG = "K900HardwareManager";
    
    private K900LedController ledController;
    
    /**
     * Create a new K900HardwareManager
     * @param context The application context
     */
    public K900HardwareManager(Context context) {
        super(context);
    }
    
    @Override
    public void initialize() {
        Log.d(TAG, "🔧 =========================================");
        Log.d(TAG, "🔧 K900 HARDWARE MANAGER INITIALIZE");
        Log.d(TAG, "🔧 =========================================");
        
        super.initialize();
        
        // Initialize the K900 LED controller
        try {
            ledController = K900LedController.getInstance();
            Log.d(TAG, "🔧 ✅ K900 LED controller initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "🔧 ❌ Failed to initialize K900 LED controller", e);
            ledController = null;
        }
        
        Log.d(TAG, "🔧 ✅ K900 Hardware Manager initialized");
    }
    
    @Override
    public boolean supportsRecordingLed() {
        // K900 devices support recording LED
        return ledController != null;
    }
    
    @Override
    public void setRecordingLedOn() {
        if (ledController != null) {
            ledController.turnOn();
            Log.d(TAG, "🔴 Recording LED turned ON");
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }
    
    @Override
    public void setRecordingLedOff() {
        if (ledController != null) {
            ledController.turnOff();
            Log.d(TAG, "⚫ Recording LED turned OFF");
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }
    
    @Override
    public void setRecordingLedBlinking() {
        if (ledController != null) {
            ledController.startBlinking();
            Log.d(TAG, "🔴⚫ Recording LED set to BLINKING (default pattern)");
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }
    
    @Override
    public void setRecordingLedBlinking(long onDurationMs, long offDurationMs) {
        if (ledController != null) {
            ledController.startBlinking(onDurationMs, offDurationMs);
            Log.d(TAG, String.format("🔴⚫ Recording LED set to BLINKING (on=%dms, off=%dms)", 
                                     onDurationMs, offDurationMs));
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }
    
    @Override
    public void stopRecordingLedBlinking() {
        if (ledController != null) {
            ledController.stopBlinking();
            Log.d(TAG, "⚫ Recording LED blinking stopped");
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }
    
    @Override
    public void flashRecordingLed(long durationMs) {
        if (ledController != null) {
            ledController.flash(durationMs);
            Log.d(TAG, String.format("💥 Recording LED flashed for %dms", durationMs));
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }
    
    @Override
    public boolean isRecordingLedOn() {
        if (ledController != null) {
            return ledController.isLedOn();
        }
        return false;
    }
    
    @Override
    public boolean isRecordingLedBlinking() {
        if (ledController != null) {
            return ledController.isBlinking();
        }
        return false;
    }
    
    @Override
    public String getDeviceModel() {
        return "K900";
    }
    
    @Override
    public boolean isK900Device() {
        return true;
    }
    
    @Override
    public void shutdown() {
        Log.d(TAG, "Shutting down K900HardwareManager");
        
        if (ledController != null) {
            ledController.shutdown();
            ledController = null;
        }
        
        super.shutdown();
    }
}