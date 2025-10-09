package com.mentra.mentra;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.mentra.mentra.stt.STTTools;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.util.HashMap;
import java.util.Map;

/**
 * React Native bridge module for Bridge
 * This module provides the interface between React Native and the native Bridge/CommandBridge
 */
public class BridgeModule extends ReactContextBaseJavaModule {
    private static final String TAG = "BridgeModule";
    private static BridgeModule instance;
    private ReactApplicationContext reactContext;

    public BridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        instance = this;
        // Initialize the Bridge with React context for event emission
        Bridge.initialize(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "BridgeModule";
    }

    public static BridgeModule getInstance() {
        return instance;
    }

    /**
     * Send command from React Native (matches iOS BridgeModule.sendCommand)
     * @param command JSON string containing the command and parameters
     * @param promise Promise to resolve with the result
     */
    @ReactMethod
    public void sendCommand(String command, Promise promise) {
        try {
            // Log.d(TAG, "sendCommand called with command: " + command);
            Object result = Bridge.getInstance().handleCommand(command);
            promise.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error sending command", e);
            promise.reject("COMMAND_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void startCoreService() {
        // try {
        //     Intent intent = new Intent(getReactApplicationContext(), AugmentosService.class);
        //     intent.setAction("ACTION_START_CORE");
        //     if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        //         getReactApplicationContext().startForegroundService(intent);
        //     }
        // } catch (Exception e) {
        //     Log.e(TAG, "Failed to start Core service", e);
        // }
    }

    @ReactMethod
    public void stopCoreService() {
        // try {
        //     // Stop Core service
        //     Intent intent = new Intent(getReactApplicationContext(), AugmentosService.class);
        //     intent.setAction("ACTION_STOP_CORE");
        //     getReactApplicationContext().stopService(intent);
            
        //     // Cleanup communicator
        //     AugmentOSCommunicator.getInstance().cleanup();
        //     isInitialized = false;
            
        //     Log.d(TAG, "Core service stopped and communicator cleaned up");
        // } catch (Exception e) {
        //     Log.e(TAG, "Failed to stop Core service", e);
        // }
    }
    
    /**
     * Get constants to export to React Native
     * This includes the supported events
     */
    @Override
    @Nullable
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("supportedEvents", Bridge.getSupportedEvents());
        return constants;
    }
    
    /**
     * Add listener for events (required for RCTEventEmitter compatibility)
     */
    @ReactMethod
    public void addListener(String eventName) {
        // Keep track of listeners if needed
    }
    
    /**
     * Remove listeners (required for RCTEventEmitter compatibility)
     */
    @ReactMethod
    public void removeListeners(Integer count) {
        // Remove listeners if needed
    }

    /**
     * Extract a tar.bz2 file to a destination directory
     * Runs on a background thread to avoid blocking the JS thread
     * @param sourcePath Path to the .tar.bz2 file
     * @param destinationPath Directory to extract to
     * @param promise Promise to resolve with extraction result
     */
    @ReactMethod
    public void extractTarBz2(String sourcePath, String destinationPath, Promise promise) {
        // Run extraction on a background thread to avoid blocking JS thread
        new Thread(() -> {
            try {
                boolean result = STTTools.INSTANCE.extractTarBz2(sourcePath, destinationPath);
                promise.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Error extracting tar.bz2", e);
                promise.reject("EXTRACTION_ERROR", e.getMessage(), e);
            }
        }).start();
    }

    /**
     * Validate that an STT model has all required files
     * @param path Path to the model directory
     * @param promise Promise to resolve with validation result
     */
    @ReactMethod
    public void validateSTTModel(String path, Promise promise) {
        try {
            boolean result = STTTools.INSTANCE.validateSTTModel(path);
            promise.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error validating STT model", e);
            promise.reject("VALIDATION_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Get the STT model path from SharedPreferences
     * @param promise Promise to resolve with the model path
     */
    @ReactMethod
    public void getSTTModelPath(Promise promise) {
        try {
            String path = STTTools.INSTANCE.getSttModelPath(reactContext);
            promise.resolve(path);
        } catch (Exception e) {
            Log.e(TAG, "Error getting STT model path", e);
            promise.reject("GET_PATH_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Save STT model details to SharedPreferences
     * @param path Path to the model directory
     * @param languageCode Language code of the model
     * @param promise Promise to resolve when saved
     */
    @ReactMethod
    public void setSttModelDetails(String path, String languageCode, Promise promise) {
        try {
            STTTools.INSTANCE.setSttModelDetails(reactContext, path, languageCode);
            promise.resolve(null);
        } catch (Exception e) {
            Log.e(TAG, "Error setting STT model details", e);
            promise.reject("SET_DETAILS_ERROR", e.getMessage(), e);
        }
    }
}