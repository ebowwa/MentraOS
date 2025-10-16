package com.augmentos.asg_client.io.hardware.managers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.hardware.core.BaseHardwareManager;
import com.augmentos.asg_client.hardware.K900LedController;
import com.augmentos.asg_client.hardware.K900RgbLedController;
import com.augmentos.asg_client.audio.I2SAudioController;
import com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager;

/**
 * Implementation of IHardwareManager for K900 devices.
 * Uses K900-specific hardware APIs including the xydev library for LED control.
 */
public class K900HardwareManager extends BaseHardwareManager {
    private static final String TAG = "K900HardwareManager";

    private K900LedController ledController;
    private K900RgbLedController rgbLedController;
    private I2SAudioController audioController;
    
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

        audioController = new I2SAudioController(context);

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
    public boolean supportsAudioPlayback() {
        return true;
    }

    @Override
    public void playAudioAsset(String assetName) {
        if (audioController != null) {
            audioController.playAsset(assetName);
        } else {
            Log.w(TAG, "Audio controller not available");
        }
    }

    @Override
    public void stopAudioPlayback() {
        if (audioController != null) {
            audioController.stopPlayback();
        }
    }

    @Override
    public void setBluetoothManager(Object bluetoothManager) {
        if (bluetoothManager instanceof K900BluetoothManager) {
            try {
                rgbLedController = new K900RgbLedController((K900BluetoothManager) bluetoothManager);
                Log.d(TAG, "🔧 ✅ K900 RGB LED controller initialized successfully");
            } catch (Exception e) {
                Log.e(TAG, "🔧 ❌ Failed to initialize K900 RGB LED controller", e);
                rgbLedController = null;
            }
        } else {
            Log.w(TAG, "Invalid BluetoothManager provided (expected K900BluetoothManager)");
        }
    }

    // ============================================
    // MTK LED Brightness Control
    // ============================================

    @Override
    public boolean supportsLedBrightness() {
        return ledController != null;
    }

    @Override
    public void setRecordingLedBrightness(int percent) {
        if (ledController != null) {
            ledController.setBrightness(percent);
            Log.d(TAG, String.format("💡 Recording LED brightness set to %d%%", percent));
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }

    @Override
    public void setRecordingLedBrightness(int percent, int durationMs) {
        if (ledController != null) {
            ledController.setBrightness(percent, durationMs);
            Log.d(TAG, String.format("💡 Recording LED brightness set to %d%% for %dms", percent, durationMs));
        } else {
            Log.w(TAG, "LED controller not available");
        }
    }

    @Override
    public int getRecordingLedBrightness() {
        if (ledController != null) {
            return ledController.getBrightness();
        }
        return 0;
    }

    // ============================================
    // RGB LED Control (BES Chipset)
    // ============================================

    @Override
    public boolean supportsRgbLed() {
        return rgbLedController != null;
    }

    @Override
    public void setRgbLedOn(int ledIndex, int ontime, int offtime, int count) {
        if (rgbLedController != null) {
            rgbLedController.setLedOn(ledIndex, ontime, offtime, count);
            Log.d(TAG, String.format("🚨 RGB LED ON - Index: %d, OnTime: %dms, OffTime: %dms, Count: %d",
                    ledIndex, ontime, offtime, count));
        } else {
            Log.w(TAG, "RGB LED controller not available - call setBluetoothManager() first");
        }
    }

    @Override
    public void setRgbLedOff() {
        if (rgbLedController != null) {
            rgbLedController.setLedOff();
            Log.d(TAG, "🚨 RGB LED OFF");
        } else {
            Log.w(TAG, "RGB LED controller not available");
        }
    }

    @Override
    public void flashRgbLedWhite(int durationMs) {
        if (rgbLedController != null) {
            rgbLedController.flashWhite(durationMs);
            Log.d(TAG, String.format("📸 RGB LED white flash for %dms", durationMs));
        } else {
            Log.w(TAG, "RGB LED controller not available");
        }
    }

    @Override
    public void setRgbLedSolidWhite(int durationMs) {
        if (rgbLedController != null) {
            rgbLedController.setSolidWhite(durationMs);
            Log.d(TAG, String.format("🎥 RGB LED solid white for %dms", durationMs));
        } else {
            Log.w(TAG, "RGB LED controller not available");
        }
    }

    @Override
    public void shutdown() {
        Log.d(TAG, "Shutting down K900HardwareManager");

        if (audioController != null) {
            audioController.stopPlayback();
            audioController = null;
        }

        if (rgbLedController != null) {
            rgbLedController = null;
        }

        if (ledController != null) {
            ledController.shutdown();
            ledController = null;
        }

        super.shutdown();
    }
}
