package com.augmentos.asg_client.service.core;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.service.legacy.handlers.LegacyCommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.system.handlers.OtaCommandHandler;
import com.augmentos.asg_client.service.system.handlers.SettingsCommandHandler;
import com.augmentos.asg_client.service.system.handlers.VersionCommandHandler;
import com.augmentos.asg_client.settings.AsgSettings;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.communication.interfaces.IResponseBuilder;
import com.augmentos.asg_client.service.system.interfaces.IConfigurationManager;
import com.augmentos.asg_client.service.media.handlers.PhotoCommandHandler;
import com.augmentos.asg_client.service.media.handlers.VideoCommandHandler;
import com.augmentos.asg_client.service.communication.handlers.PhoneReadyCommandHandler;
import com.augmentos.asg_client.service.communication.handlers.AuthTokenCommandHandler;
import com.augmentos.asg_client.service.communication.handlers.PingCommandHandler;
import com.augmentos.asg_client.service.media.handlers.RtmpCommandHandler;
import com.augmentos.asg_client.service.system.handlers.WifiCommandHandler;
import com.augmentos.asg_client.service.system.handlers.BatteryCommandHandler;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Processes JSON commands received via Bluetooth.
 * This class follows SOLID principles by using the Command Handler pattern.
 * <p>
 * Single Responsibility: Command routing and delegation only
 * Open/Closed: Easy to extend with new command handlers
 * Liskov Substitution: Uses interface-based handlers
 * Interface Segregation: Focused interfaces for each concern
 * Dependency Inversion: Depends on abstractions, not concretions
 */
public class CommandProcessor {
    private static final String TAG = "CommandProcessor";

    private final Context context;

    // Interface-based managers (Dependency Inversion Principle)
    private final ICommunicationManager communicationManager;
    private final IStateManager stateManager;
    private final IStreamingManager streamingManager;
    private final IResponseBuilder responseBuilder;
    private final IConfigurationManager configurationManager;

    private final FileManager fileManager;

    // Command handlers (Open/Closed Principle)
    private final Map<String, ICommandHandler> commandHandlers;

    // Legacy command handler for backward compatibility
    private final LegacyCommandHandler legacyCommandHandler;

    // Legacy components (for backward compatibility)
    private final AsgClientServiceManager serviceManager;

    public CommandProcessor(Context context,
                            ICommunicationManager communicationManager,
                            IStateManager stateManager,
                            IStreamingManager streamingManager,
                            IResponseBuilder responseBuilder,
                            IConfigurationManager configurationManager,
                            AsgClientServiceManager serviceManager,
                            FileManager fileManager) {
        this.context = context;
        this.communicationManager = communicationManager;
        this.stateManager = stateManager;
        this.streamingManager = streamingManager;
        this.responseBuilder = responseBuilder;
        this.configurationManager = configurationManager;
        this.serviceManager = serviceManager; // Legacy support
        this.fileManager = fileManager;

        // Initialize command handlers (Open/Closed Principle)
        this.commandHandlers = new HashMap<>();
        this.legacyCommandHandler = new LegacyCommandHandler(serviceManager, streamingManager);
        initializeCommandHandlers();
    }

    /**
     * Initialize all command handlers
     * Easy to extend by adding new handlers here
     */
    private void initializeCommandHandlers() {
        // Register command handlers
        registerHandler(new PhoneReadyCommandHandler(communicationManager, stateManager, responseBuilder));
        registerHandler(new AuthTokenCommandHandler(communicationManager, configurationManager));
        registerHandler(new PhotoCommandHandler(context, serviceManager, fileManager));
        registerHandler(new VideoCommandHandler(context, serviceManager, streamingManager, fileManager));
        registerHandler(new PingCommandHandler(communicationManager, responseBuilder));
        registerHandler(new RtmpCommandHandler(context, stateManager, streamingManager));
        registerHandler(new WifiCommandHandler(serviceManager, communicationManager, stateManager));
        registerHandler(new BatteryCommandHandler(stateManager));
        registerHandler(new VersionCommandHandler(context, serviceManager));
        registerHandler(new SettingsCommandHandler(serviceManager, communicationManager, responseBuilder));
        registerHandler(new OtaCommandHandler());

        Log.d(TAG, "✅ Registered " + commandHandlers.size() + " command handlers");
    }

    /**
     * Register a command handler
     */
    private void registerHandler(ICommandHandler handler) {
        commandHandlers.put(handler.getCommandType(), handler);
        Log.d(TAG, "Registered command handler for: " + handler.getCommandType());
    }

    /**
     * Process a JSON command received via Bluetooth
     * SOLID-compliant implementation using Command Handler pattern
     */
    public void processJsonCommand(JSONObject json) {
        try {
            // Handle direct data format (C field)
            JSONObject dataToProcess = extractDataFromCommand(json);

            // Send ACK if message ID is present
            long messageId = dataToProcess.optLong("mId", -1);
            if (messageId != -1) {
                communicationManager.sendAckResponse(messageId);
                Log.d(TAG, "📤 Sent ACK for message ID: " + messageId);
            }

            // Process the command using handler pattern (Open/Closed Principle)
            String type = dataToProcess.optString("type", "");
            Log.d(TAG, "Processing JSON message type: " + type);

            // Find and execute appropriate handler
            ICommandHandler handler = commandHandlers.get(type);
            if (handler != null) {
                boolean success = handler.handleCommand(dataToProcess);
                if (!success) {
                    Log.w(TAG, "Handler failed to process command: " + type);
                }
            } else {
                // Handle legacy commands that don't have handlers yet
                handleLegacyCommand(type, dataToProcess);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing JSON command", e);
        }
    }

    /**
     * Handle legacy commands that don't have dedicated handlers yet
     * This maintains backward compatibility while transitioning to the new architecture
     */
    private void handleLegacyCommand(String type, JSONObject data) {
        switch (type) {
            case "stop_video_recording":
                legacyCommandHandler.handleStopVideoRecording();
                break;
            case "get_video_recording_status":
                legacyCommandHandler.handleGetVideoRecordingStatus();
                break;
            case "start_rtmp_stream":
                // This is now handled by RtmpCommandHandler
                Log.w(TAG, "start_rtmp_stream should be handled by RtmpCommandHandler");
                break;
            case "stop_rtmp_stream":
                // This is now handled by RtmpCommandHandler
                Log.w(TAG, "stop_rtmp_stream should be handled by RtmpCommandHandler");
                break;
            case "get_rtmp_status":
                // This is now handled by RtmpCommandHandler
                Log.w(TAG, "get_rtmp_status should be handled by RtmpCommandHandler");
                break;
            case "keep_rtmp_stream_alive":
                // This is now handled by RtmpCommandHandler
                Log.w(TAG, "keep_rtmp_stream_alive should be handled by RtmpCommandHandler");
                break;
            case "set_wifi_credentials":
                // This is now handled by WifiCommandHandler
                Log.w(TAG, "set_wifi_credentials should be handled by WifiCommandHandler");
                break;
            case "request_wifi_status":
                // This is now handled by WifiCommandHandler
                Log.w(TAG, "request_wifi_status should be handled by WifiCommandHandler");
                break;
            case "request_wifi_scan":
                // This is now handled by WifiCommandHandler
                Log.w(TAG, "request_wifi_scan should be handled by WifiCommandHandler");
                break;
            case "request_battery_state":
                // Handled elsewhere
                break;
            case "battery_status":
                // This is now handled by BatteryCommandHandler
                Log.w(TAG, "battery_status should be handled by BatteryCommandHandler");
                break;
            case "set_mic_state":
            case "set_mic_vad_state":
                // Audio control commands - TODO: Create AudioCommandHandler
                Log.d(TAG, "Audio control commands not yet implemented with handlers");
                break;
            case "set_hotspot_state":
                // This is now handled by WifiCommandHandler
                Log.w(TAG, "set_hotspot_state should be handled by WifiCommandHandler");
                break;
            case "request_version":
            case "cs_syvr":
                // This is now handled by VersionCommandHandler
                Log.w(TAG, "request_version/cs_syvr should be handled by VersionCommandHandler");
                break;
            case "ota_update_response":
                // This is now handled by OtaCommandHandler
                Log.w(TAG, "ota_update_response should be handled by OtaCommandHandler");
                break;
            case "set_photo_mode":
                // This is now handled by SettingsCommandHandler
                Log.w(TAG, "set_photo_mode should be handled by SettingsCommandHandler");
                break;
            case "button_mode_setting":
                // This is now handled by SettingsCommandHandler
                Log.w(TAG, "button_mode_setting should be handled by SettingsCommandHandler");
                break;
            default:
                Log.w(TAG, "Unknown message type: " + type);
                break;
        }
    }

    private JSONObject extractDataFromCommand(JSONObject json) throws JSONException {
        if (json.has("C")) {
            String dataPayload = json.optString("C", "");
            Log.d(TAG, "📦 Detected direct data format! Payload: " + dataPayload);

            try {
                return new JSONObject(dataPayload);
            } catch (JSONException e) {
                Log.d(TAG, "📦 Payload is not valid JSON, treating as ODM format");
                processK900Command(json);
                throw new JSONException("ODM format - handled separately");
            }
        }
        return json;
    }

    // Legacy handler methods - these are now handled by dedicated command handlers
    // Keeping them for backward compatibility during transition

    // Legacy RTMP handlers - now handled by RtmpCommandHandler

    // Legacy handlers - now handled by dedicated command handlers:
    // - handleKeepRtmpStreamAlive -> RtmpCommandHandler
    // - handleSetWifiCredentials -> WifiCommandHandler
    // - handleRequestWifiStatus -> WifiCommandHandler
    // - handleRequestWifiScan -> WifiCommandHandler
    // - handlePing -> PingCommandHandler
    // - handleBatteryStatus -> BatteryCommandHandler
    // - handleSetHotspotState -> WifiCommandHandler
    // - handleRequestVersion -> VersionCommandHandler
    // - handleOtaUpdateResponse -> OtaCommandHandler
    // - handleSetPhotoMode -> SettingsCommandHandler
    // - handleButtonModeSetting -> SettingsCommandHandler

    // Helper methods - now handled by ResponseBuilder and CommunicationManager

    /**
     * Send download progress to connected phone via BLE
     */
    public void sendDownloadProgressOverBle(String status, int progress, long bytesDownloaded, long totalBytes, String errorMessage, long timestamp) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject downloadProgress = new JSONObject();
                downloadProgress.put("type", "ota_download_progress");
                downloadProgress.put("status", status);
                downloadProgress.put("progress", progress);
                downloadProgress.put("bytes_downloaded", bytesDownloaded);
                downloadProgress.put("total_bytes", totalBytes);
                if (errorMessage != null) {
                    downloadProgress.put("error_message", errorMessage);
                }
                downloadProgress.put("timestamp", timestamp);

                String jsonString = downloadProgress.toString();
                Log.d(TAG, "📥 Sending download progress via BLE: " + status + " - " + progress + "%");
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

            } catch (JSONException e) {
                Log.e(TAG, "Error creating download progress JSON", e);
            }
        } else {
            Log.d(TAG, "Cannot send download progress - not connected to BLE device");
        }
    }

    /**
     * Send installation progress to connected phone via BLE
     */
    public void sendInstallationProgressOverBle(String status, String apkPath, String errorMessage, long timestamp) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject installationProgress = new JSONObject();
                installationProgress.put("type", "ota_installation_progress");
                installationProgress.put("status", status);
                installationProgress.put("apk_path", apkPath);
                if (errorMessage != null) {
                    installationProgress.put("error_message", errorMessage);
                }
                installationProgress.put("timestamp", timestamp);

                String jsonString = installationProgress.toString();
                Log.d(TAG, "🔧 Sending installation progress via BLE: " + status + " - " + apkPath);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

            } catch (JSONException e) {
                Log.e(TAG, "Error creating installation progress JSON", e);
            }
        } else {
            Log.d(TAG, "Cannot send installation progress - not connected to BLE device");
        }
    }

    /**
     * Send report swipe status
     */
    public void sendReportSwipe(boolean report) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject swipeJson = new JSONObject();
                swipeJson.put("C", "cs_swst");
                JSONObject bJson = new JSONObject();
                bJson.put("type", 27);
                bJson.put("switch", report);
                swipeJson.put("B", bJson);
                swipeJson.put("V", 1);
                String jsonString = swipeJson.toString();
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

                Log.d(TAG, "Sent swipeJson status via BLE");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating swipe JSON", e);
            }
        }
    }

    /**
     * Process K900 protocol commands
     */
    public void processK900Command(JSONObject json) {
        try {
            String command = json.optString("C", "");
            JSONObject bData = json.optJSONObject("B");
            Log.d(TAG, "📦 Received command: " + command);

            switch (command) {
                case "cs_pho":
                    Log.d(TAG, "📸 Camera button short pressed - handling with configurable mode");
                    handleConfigurableButtonPress(false); // false = short press
                    break;

                case "hm_htsp":
                case "mh_htsp":
                    Log.d(TAG, "📦 Payload is hm_htsp or mh_htsp");
                    if (serviceManager != null && serviceManager.getNetworkManager() != null) {
                        serviceManager.getNetworkManager().startHotspot("Mentra Live", "MentraLive");
                    }
                    break;

                case "cs_vdo":
                    Log.d(TAG, "📹 Camera button long pressed - handling with configurable mode");
                    handleConfigurableButtonPress(true); // true = long press
                    break;

                case "hm_batv":
                    Log.d(TAG, "got a hm_batv with data");
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
                    break;

                case "cs_flts":
                    // File transfer acknowledgment from BES chip (K900 specific code)
                    Log.d(TAG, "📦 BES file transfer ACK detected in CommandProcessor");
                    break;

                default:
                    Log.d(TAG, "📦 Unknown ODM payload: " + command);
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing ODM command", e);
        }
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
                    // Current behavior - take photo/video only
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
                    break;

                case APPS:
                    // Send to apps only
                    Log.d(TAG, "📱 Sending " + pressType + " button press to apps (APPS mode)");
                    sendButtonPressToPhone(isLongPress);
                    break;

                case BOTH:
                    // Send to apps AND take photo/video
                    Log.d(TAG, "🔄 Sending " + pressType + " button press to apps AND taking photo/video (BOTH mode)");
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
                    break;
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

    private String formatDuration(long durationMs) {
        long seconds = durationMs / 1000;
        long minutes = seconds / 60;
        seconds = seconds % 60;
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }
} 