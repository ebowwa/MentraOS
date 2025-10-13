package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;

import com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.settings.AsgSettings;
import com.augmentos.asg_client.settings.VideoSettings;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Handles K900 protocol commands.
 * Follows Single Responsibility Principle by handling only K900 protocol commands.
 * Follows Open/Closed Principle by being extensible for new K900 commands.
 */
public class K900CommandHandler {
    private static final String TAG = "K900CommandHandler";

    private final AsgClientServiceManager serviceManager;
    private final IStateManager stateManager;
    private final ICommunicationManager communicationManager;

    public K900CommandHandler(AsgClientServiceManager serviceManager,
                              IStateManager stateManager,
                              ICommunicationManager communicationManager) {
        this.serviceManager = serviceManager;
        this.stateManager = stateManager;
        this.communicationManager = communicationManager;
    }

    /**
     * Process K900 protocol commands
     *
     * @param json The K900 command JSON
     */
    public void processK900Command(JSONObject json) {
        try {
            String command = json.optString("C", "");
            JSONObject bData = json.optJSONObject("B");
            Log.d(TAG, "📦 Received K900 command: " + command);

            switch (command) {
                case "cs_pho":
                    handleCameraButtonShortPress();
                    break;

                case "cs_vdo":
                    handleCameraButtonLongPress();
                    break;

                case "hm_htsp":
                case "mh_htsp":
                    handleHotspotStart();
                    break;

                case "hm_batv":
                    handleBatteryVoltage(bData);
                    break;

                case "cs_flts":
                    // File transfer ACK - pass to K900BluetoothManager
                    handleFileTransferAck(bData);
                    break;

                // ---------------------------------------------
                // BES → MTK Response Handlers (Touch/Swipe Only)
                // ---------------------------------------------
                
                case "sr_swst":
                    // Switch status report (touch events)
                    handleSwitchStatusReport(bData);
                    break;

                case "sr_tpevt":
                    // Touch event report
                    handleTouchEventReport(bData);
                    break;

                case "sr_fbvol":
                    // Swipe volume status report
                    handleSwipeVolumeStatusReport(bData);
                    break;

                default:
                    Log.d(TAG, "📦 Unknown K900 command: " + command);
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing K900 command", e);
        }
    }

    /**
     * Handle camera button short press
     */
    private void handleCameraButtonShortPress() {
        Log.d(TAG, "📸 Camera button short pressed - handling with configurable mode");
        handleConfigurableButtonPress(false); // false = short press
    }

    /**
     * Handle camera button long press
     */
    private void handleCameraButtonLongPress() {
        Log.d(TAG, "📹 Camera button long pressed - handling with configurable mode");
        handleConfigurableButtonPress(true); // true = long press
    }

    /**
     * Handle hotspot start command
     */
    private void handleHotspotStart() {
        Log.d(TAG, "📦 Starting hotspot from K900 command");
        if (serviceManager != null && serviceManager.getNetworkManager() != null) {
            serviceManager.getNetworkManager().startHotspot();
        }
    }

    /**
     * Handle battery voltage command
     */
    private void handleBatteryVoltage(JSONObject bData) {
        Log.d(TAG, "🔋 Processing battery voltage data from K900");
        if (bData != null) {
            int newBatteryPercentage = bData.optInt("pt", -1);
            int newBatteryVoltage = bData.optInt("vt", -1);

            if (newBatteryPercentage != -1) {
                Log.d(TAG, "🔋 Battery percentage: " + newBatteryPercentage + "%");
            }
            if (newBatteryVoltage != -1) {
                Log.d(TAG, "🔋 Battery voltage: " + newBatteryVoltage + "mV");
            }

            // Send battery status over BLE if we have valid data
            if (newBatteryPercentage != -1 || newBatteryVoltage != -1) {
                sendBatteryStatusOverBle(newBatteryPercentage, newBatteryVoltage);
            }
        } else {
            Log.w(TAG, "hm_batv received but no B field data");
        }
    }

    /**
     * Handle file transfer ACK from glasses
     */
    private void handleFileTransferAck(JSONObject bData) {
        if (bData != null && serviceManager != null) {
            int state = bData.optInt("state", -1);
            int index = bData.optInt("index", -1);

            if (state != -1 && index != -1) {
                Log.d(TAG, "📦 File transfer ACK: state=" + state + ", index=" + index);

                // Get K900BluetoothManager and forward the ACK
                K900BluetoothManager bluetoothManager = (K900BluetoothManager) serviceManager.getBluetoothManager();
                if (bluetoothManager != null) {
                    bluetoothManager.handleFileTransferAck(state, index);
                }
            } else {
                Log.w(TAG, "cs_flts received but missing state or index");
            }
        }
    }

    /**
     * Handle button press with universal forwarding and gallery mode check
     * Button presses are ALWAYS forwarded to phone/apps
     * Local capture only happens when camera/gallery app is active
     */
    private void handleConfigurableButtonPress(boolean isLongPress) {
        if (serviceManager != null && serviceManager.getAsgSettings() != null) {
            String pressType = isLongPress ? "long" : "short";
            Log.d(TAG, "Handling " + pressType + " button press");

            // ALWAYS send button press to phone/apps
            Log.d(TAG, "📱 Forwarding button press to phone/apps (universal forwarding)");
            sendButtonPressToPhone(isLongPress);

            // Check if camera/gallery app is active for local capture
            handlePhotoCapture(isLongPress);
        }
    }

    /**
     * Handle photo/video capture based on gallery mode state
     * Only captures if camera/gallery app is currently active OR if glasses are disconnected
     */
    private void handlePhotoCapture(boolean isLongPress) {
        // Check if gallery/camera app is active before capturing
        boolean isSaveInGalleryMode = serviceManager
            .getAsgSettings()
            .isSaveInGalleryMode();

        // Check if glasses are connected to phone
        boolean isConnected = serviceManager.isConnected();

        // LOG CONNECTION STATE FOR DEBUGGING
        Log.i(TAG, "📸 Photo capture decision - Gallery Mode: " + (isSaveInGalleryMode ? "ACTIVE" : "INACTIVE") +
                   ", Connection State: " + (isConnected ? "CONNECTED" : "DISCONNECTED"));

        // Skip capture only if: camera app NOT running AND phone IS connected
        if (!isSaveInGalleryMode && isConnected) {
            Log.d(TAG, "📸 Camera app not active and connected to phone - skipping local capture (button press already forwarded to apps)");
            return;
        }

        if (!isConnected) {
            Log.d(TAG, "📸 Disconnected from phone - proceeding with local capture regardless of gallery mode");
        } else {
            Log.d(TAG, "📸 Camera app active - proceeding with local capture");
        }

        MediaCaptureService captureService = serviceManager.getMediaCaptureService();
        if (captureService == null) {
            Log.d(TAG, "MediaCaptureService is null, initializing");
            return;
        }

        // Get LED setting
        boolean ledEnabled = serviceManager.getAsgSettings().getButtonCameraLedEnabled();

        // Get current battery level
        int batteryLevel = stateManager.getBatteryLevel();

        if (isLongPress) {
            Log.d(TAG, "📹 Starting video recording (long press) with LED: " + ledEnabled + ", battery: " + batteryLevel + "%");

            // Check if battery is too low to start recording
            if (batteryLevel >= 0 && batteryLevel < 10) {
                Log.w(TAG, "⚠️ Battery too low to start recording: " + batteryLevel + "% (minimum 10% required)");
                return;
            }

            // Get saved video settings for button press
            VideoSettings videoSettings = serviceManager.getAsgSettings().getButtonVideoSettings();
            int maxRecordingTimeMinutes = serviceManager.getAsgSettings().getButtonMaxRecordingTimeMinutes();
            captureService.startVideoRecording(videoSettings, ledEnabled, maxRecordingTimeMinutes, batteryLevel);
        } else {
            // Short press behavior
            // If video is recording, stop it. Otherwise take a photo.
            if (captureService.isRecordingVideo()) {
                Log.d(TAG, "⏹️ Stopping video recording (short press during recording)");
                captureService.stopVideoRecording();
            } else {
                Log.d(TAG, "📸 Taking photo locally (short press) with LED: " + ledEnabled);
                // Get saved photo size for button press
                String photoSize = serviceManager.getAsgSettings().getButtonPhotoSize();
                captureService.takePhotoLocally(photoSize, ledEnabled);
            }
        }
    }

    /**
     * Send button press to phone via Bluetooth
     */
    private void sendButtonPressToPhone(boolean isLongPress) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject buttonObject = new JSONObject();
                buttonObject.put("type", "button_press");
                buttonObject.put("buttonId", "camera");
                buttonObject.put("pressType", isLongPress ? "long" : "short");
                buttonObject.put("timestamp", System.currentTimeMillis());

                String jsonString = buttonObject.toString();
                Log.d(TAG, "Formatted button press response: " + jsonString);

                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
            } catch (JSONException e) {
                Log.e(TAG, "Error creating button press response", e);
            }
        }
    }

    /**
     * Send battery status over BLE
     */
    private void sendBatteryStatusOverBle(int batteryPercentage, int batteryVoltage) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                // Calculate charging status based on voltage
                boolean isCharging = batteryVoltage > 3900;

                JSONObject obj = new JSONObject();
                obj.put("type", "battery_status");
                obj.put("charging", isCharging);
                obj.put("percent", batteryPercentage);
                String jsonString = obj.toString();
                Log.d(TAG, "Formatted battery status message: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
                Log.d(TAG, "Sent battery status via BLE");

                // Update the main service with battery status
                if (stateManager != null) {
                    stateManager.updateBatteryStatus(batteryPercentage, isCharging, System.currentTimeMillis());
                }
            } catch (JSONException e) {
                Log.e(TAG, "Error creating battery status JSON", e);
            }
        }
    }

    // ---------------------------------------------
    // BES → MTK Response Handlers (Touch/Swipe Only)
    // ---------------------------------------------

    /**
     * Handle switch status report (touch events)
     */
    private void handleSwitchStatusReport(JSONObject bData) {
        Log.d(TAG, "📦 Processing switch status report");
        
        if (bData != null) {
            int type = bData.optInt("type", -1);
            int switchValue = bData.optInt("switch", -1);
            
            Log.i(TAG, "📦 Switch status - Type: " + type + ", Switch: " + switchValue);
            
            // Send switch status over BLE
            sendSwitchStatusOverBle(type, switchValue);
        } else {
            Log.w(TAG, "📦 Switch status report received but no B field data");
        }
    }

    /**
     * Handle touch event report
     */
    private void handleTouchEventReport(JSONObject bData) {
        Log.d(TAG, "📦 Processing touch event report");
        
        if (bData != null) {
            int type = bData.optInt("type", -1);
            
            String gestureType = getTouchGestureType(type);
            Log.i(TAG, "📦 Touch event - Type: " + gestureType + " (" + type + ")");
            
            // Send touch event over BLE
            sendTouchEventOverBle(type);
        } else {
            Log.w(TAG, "📦 Touch event report received but no B field data");
        }
    }

    /**
     * Handle swipe volume status report
     */
    private void handleSwipeVolumeStatusReport(JSONObject bData) {
        Log.d(TAG, "📦 Processing swipe volume status report");
        
        if (bData != null) {
            int switchValue = bData.optInt("switch", -1);
            boolean isEnabled = (switchValue == 1);
            
            Log.i(TAG, "📦 Swipe volume status - Enabled: " + isEnabled);
            
            // Send swipe volume status over BLE
            sendSwipeVolumeStatusOverBle(isEnabled);
        } else {
            Log.w(TAG, "📦 Swipe volume status report received but no B field data");
        }
    }

    // ---------------------------------------------
    // BLE Response Senders (Touch/Swipe Only)
    // ---------------------------------------------

    /**
     * Send switch status over BLE
     */
    private void sendSwitchStatusOverBle(int type, int switchValue) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("type", "switch_status");
                obj.put("switch_type", type);
                obj.put("switch_value", switchValue);
                obj.put("timestamp", System.currentTimeMillis());
                
                String jsonString = obj.toString();
                Log.d(TAG, "📤 Sending switch status: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
            } catch (JSONException e) {
                Log.e(TAG, "Error creating switch status JSON", e);
            }
        }
    }

    /**
     * Send touch event over BLE
     */
    private void sendTouchEventOverBle(int type) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("type", "touch_event");
                obj.put("gesture_type", type);
                obj.put("gesture_name", getTouchGestureType(type));
                obj.put("timestamp", System.currentTimeMillis());
                
                String jsonString = obj.toString();
                Log.d(TAG, "📤 Sending touch event: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
            } catch (JSONException e) {
                Log.e(TAG, "Error creating touch event JSON", e);
            }
        }
    }

    /**
     * Send swipe volume status over BLE
     */
    private void sendSwipeVolumeStatusOverBle(boolean isEnabled) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject obj = new JSONObject();
                obj.put("type", "swipe_volume_status");
                obj.put("enabled", isEnabled);
                obj.put("timestamp", System.currentTimeMillis());
                
                String jsonString = obj.toString();
                Log.d(TAG, "📤 Sending swipe volume status: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
            } catch (JSONException e) {
                Log.e(TAG, "Error creating swipe volume status JSON", e);
            }
        }
    }

    /**
     * Get touch gesture type name
     */
    private String getTouchGestureType(int type) {
        switch (type) {
            case 1: return "double_tap";
            case 2: return "triple_tap";
            case 3: return "long_press";
            case 4: return "forward_swipe";
            case 5: return "backward_swipe";
            case 6: return "up_swipe";
            case 7: return "down_swipe";
            default: return "unknown";
        }
    }
} 