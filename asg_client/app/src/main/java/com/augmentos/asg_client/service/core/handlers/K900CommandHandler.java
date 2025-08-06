package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;

import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.settings.AsgSettings;
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
                    handleFileTransferAck();
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
            serviceManager.getNetworkManager().startHotspot("Mentra Live", "MentraLive");
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
     * Handle file transfer acknowledgment
     */
    private void handleFileTransferAck() {
        Log.d(TAG, "📦 BES file transfer ACK detected");
        // File transfer acknowledgment from BES chip (K900 specific code)
        // Add any specific handling logic here
    }

    /**
     * Handle button press based on configured mode
     */
    private void handleConfigurableButtonPress(boolean isLongPress) {
        if (serviceManager != null && serviceManager.getAsgSettings() != null) {
            AsgSettings.ButtonPressMode mode = serviceManager.getAsgSettings().getButtonPressMode();
            String pressType = isLongPress ? "long" : "short";
            Log.d(TAG, "Handling " + pressType + " button press with mode: " + mode.getValue());

            switch (mode) {
                case PHOTO:
                    handlePhotoMode(isLongPress);
                    break;

                case APPS:
                    handleAppsMode(isLongPress);
                    break;

                case BOTH:
                    handleBothMode(isLongPress);
                    break;
            }
        }
    }

    /**
     * Handle PHOTO mode button press
     */
    private void handlePhotoMode(boolean isLongPress) {
        if (isLongPress) {
            Log.d(TAG, "📹 Video recording not yet implemented (PHOTO mode, long press)");
            // TODO: Implement video recording
        } else {
            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService == null) {
                Log.d(TAG, "MediaCaptureService is null, initializing");
                // The service manager will handle initialization
            } else {
                Log.d(TAG, "📸 Taking photo locally (PHOTO mode, short press)");
                captureService.takePhotoLocally();
            }
        }
    }

    /**
     * Handle APPS mode button press
     */
    private void handleAppsMode(boolean isLongPress) {
        Log.d(TAG, "📱 Sending button press to apps (APPS mode)");
        sendButtonPressToPhone(isLongPress);
    }

    /**
     * Handle BOTH mode button press
     */
    private void handleBothMode(boolean isLongPress) {
        Log.d(TAG, "🔄 Sending button press to apps AND taking photo/video (BOTH mode)");
        sendButtonPressToPhone(isLongPress);

        if (isLongPress) {
            Log.d(TAG, "📹 Video recording not yet implemented (BOTH mode, long press)");
            // TODO: Implement video recording
        } else {
            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService != null) {
                Log.d(TAG, "📸 Taking photo locally (BOTH mode, short press)");
                captureService.takePhotoLocally();
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
} 