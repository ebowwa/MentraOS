package com.augmentos.asg_client.service;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.augmentos.asg_client.AsgClientService;
import com.augmentos.asg_client.io.bluetooth.interfaces.IBluetoothManager;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.io.streaming.services.RtmpStreamingService;
import com.augmentos.asg_client.settings.AsgSettings;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Processes JSON commands received via Bluetooth.
 * This class follows the Single Responsibility Principle by handling only
 * command processing logic.
 */
public class CommandProcessor {
    private static final String TAG = "CommandProcessor";

    private final Context context;
    private final AsgClientServiceClean service;
    private final AsgClientServiceManager serviceManager;

    public CommandProcessor(Context context, AsgClientServiceClean service, AsgClientServiceManager serviceManager) {
        this.context = context;
        this.service = service;
        this.serviceManager = serviceManager;
    }

    /**
     * Process a JSON command received via Bluetooth
     */
    public void processJsonCommand(JSONObject json) {
        try {
            // Handle direct data format (C field)
            JSONObject dataToProcess = extractDataFromCommand(json);
            
            // Send ACK if message ID is present
            long messageId = dataToProcess.optLong("mId", -1);
            if (messageId != -1) {
                sendAckResponse(messageId);
                Log.d(TAG, "📤 Sent ACK for message ID: " + messageId);
            }

            // Process the command
            String type = dataToProcess.optString("type", "");
            Log.d(TAG, "Processing JSON message type: " + type);

            switch (type) {
                case "phone_ready":
                    handlePhoneReady();
                    break;
                case "auth_token":
                    handleAuthToken(dataToProcess);
                    break;
                case "take_photo":
                    handleTakePhoto(dataToProcess);
                    break;
                case "start_video_recording":
                    handleStartVideoRecording(dataToProcess);
                    break;
                case "stop_video_recording":
                    handleStopVideoRecording();
                    break;
                case "get_video_recording_status":
                    handleGetVideoRecordingStatus();
                    break;
                case "start_rtmp_stream":
                    handleStartRtmpStream(dataToProcess);
                    break;
                case "stop_rtmp_stream":
                    handleStopRtmpStream();
                    break;
                case "get_rtmp_status":
                    handleGetRtmpStatus();
                    break;
                case "keep_rtmp_stream_alive":
                    handleKeepRtmpStreamAlive(dataToProcess);
                    break;
                case "set_wifi_credentials":
                    handleSetWifiCredentials(dataToProcess);
                    break;
                case "request_wifi_status":
                    handleRequestWifiStatus();
                    break;
                case "request_wifi_scan":
                    handleRequestWifiScan();
                    break;
                case "ping":
                    handlePing();
                    break;
                case "request_battery_state":
                    // Handled elsewhere
                    break;
                case "battery_status":
                    handleBatteryStatus(dataToProcess);
                    break;
                case "set_mic_state":
                case "set_mic_vad_state":
                    // Audio control commands
                    break;
                case "set_hotspot_state":
                    handleSetHotspotState(dataToProcess);
                    break;
                case "request_version":
                case "cs_syvr":
                    handleRequestVersion();
                    break;
                case "ota_update_response":
                    handleOtaUpdateResponse(dataToProcess);
                    break;
                case "set_photo_mode":
                    handleSetPhotoMode(dataToProcess);
                    break;
                case "button_mode_setting":
                    handleButtonModeSetting(dataToProcess);
                    break;
                default:
                    Log.w(TAG, "Unknown message type: " + type);
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing JSON command", e);
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
                service.parseK900Command(json);
                throw new JSONException("ODM format - handled separately");
            }
        }
        return json;
    }

    private void handlePhoneReady() {
        Log.d(TAG, "📱 Received phone_ready message - sending glasses_ready response");
        try {
            JSONObject response = new JSONObject();
            response.put("type", "glasses_ready");
            response.put("timestamp", System.currentTimeMillis());

            sendBluetoothResponse(response);

            // Auto-send WiFi status after glasses_ready
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                INetworkManager networkManager = serviceManager.getNetworkManager();
                if (networkManager != null) {
                    boolean wifiConnected = networkManager.isConnectedToWifi();
                    service.sendWifiStatusOverBle(wifiConnected);
                }
            }, 500);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating glasses_ready response", e);
        }
    }

    private void handleAuthToken(JSONObject data) {
        String coreToken = data.optString("coreToken", "");
        if (!coreToken.isEmpty()) {
            Log.d(TAG, "Received coreToken from AugmentOS Core");
            service.saveCoreToken(coreToken);
            sendTokenStatusResponse(true);
        } else {
            Log.e(TAG, "Received empty coreToken");
            sendTokenStatusResponse(false);
        }
    }

    private void handleTakePhoto(JSONObject data) {
        String requestId = data.optString("requestId", "");
        String webhookUrl = data.optString("webhookUrl", "");
        String transferMethod = data.optString("transferMethod", "direct");
        String bleImgId = data.optString("bleImgId", "");
        boolean save = data.optBoolean("save", false);

        if (requestId.isEmpty()) {
            Log.e(TAG, "Cannot take photo - missing requestId");
            return;
        }

        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String photoFilePath = context.getExternalFilesDir(null) + "/IMG_" + timeStamp + ".jpg";

        MediaCaptureService captureService = serviceManager.getMediaCaptureService();
        if (captureService == null) {
            Log.e(TAG, "Media capture service not available");
            return;
        }

        switch (transferMethod) {
            case "ble":
                captureService.takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, save);
                break;
            case "auto":
                if (bleImgId.isEmpty()) {
                    Log.e(TAG, "Auto mode requires bleImgId for fallback");
                    return;
                }
                captureService.takePhotoAutoTransfer(photoFilePath, requestId, webhookUrl, bleImgId, save);
                break;
            default:
                captureService.takePhotoAndUpload(photoFilePath, requestId, webhookUrl, save);
                break;
        }
    }

    private void handleStartVideoRecording(JSONObject data) {
        String requestId = data.optString("requestId", "");
        if (requestId.isEmpty()) {
            Log.e(TAG, "Cannot start video recording - missing requestId");
            sendVideoRecordingStatusResponse(false, "missing_request_id", null);
            return;
        }

        MediaCaptureService captureService = serviceManager.getMediaCaptureService();
        if (captureService == null) {
            Log.e(TAG, "Media capture service is not initialized");
            sendVideoRecordingStatusResponse(false, "service_unavailable", null);
            return;
        }

        if (captureService.isRecordingVideo()) {
            Log.d(TAG, "Already recording video, ignoring start command");
            sendVideoRecordingStatusResponse(true, "already_recording", null);
            return;
        }

        captureService.handleVideoButtonPress();
        sendVideoRecordingStatusResponse(true, "recording_started", null);
    }

    private void handleStopVideoRecording() {
        MediaCaptureService captureService = serviceManager.getMediaCaptureService();
        if (captureService == null) {
            Log.e(TAG, "Media capture service is not initialized");
            sendVideoRecordingStatusResponse(false, "service_unavailable", null);
            return;
        }

        if (!captureService.isRecordingVideo()) {
            Log.d(TAG, "Not currently recording, ignoring stop command");
            sendVideoRecordingStatusResponse(false, "not_recording", null);
            return;
        }

        captureService.stopVideoRecording();
        sendVideoRecordingStatusResponse(true, "recording_stopped", null);
    }

    private void handleGetVideoRecordingStatus() {
        MediaCaptureService captureService = serviceManager.getMediaCaptureService();
        if (captureService == null) {
            Log.e(TAG, "Media capture service is not initialized");
            sendVideoRecordingStatusResponse(false, "service_unavailable", null);
            return;
        }

        boolean isRecording = captureService.isRecordingVideo();
        try {
            JSONObject status = new JSONObject();
            status.put("recording", isRecording);

            if (isRecording) {
                long durationMs = captureService.getRecordingDurationMs();
                status.put("duration_ms", durationMs);
                status.put("duration_formatted", formatDuration(durationMs));
            }

            sendVideoRecordingStatusResponse(true, status);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating video recording status response", e);
            sendVideoRecordingStatusResponse(false, "json_error", e.getMessage());
        }
    }

    private void handleStartRtmpStream(JSONObject data) {
        String rtmpUrl = data.optString("rtmpUrl", "");
        if (rtmpUrl.isEmpty()) {
            Log.e(TAG, "Cannot start RTMP stream - missing rtmpUrl");
            sendRtmpStatusResponse(false, "missing_rtmp_url", null);
            return;
        }

        INetworkManager networkManager = serviceManager.getNetworkManager();
        if (networkManager == null || !networkManager.isConnectedToWifi()) {
            Log.e(TAG, "Cannot start RTMP stream - no WiFi connection");
            sendRtmpStatusResponse(false, "no_wifi_connection", null);
            return;
        }

        // Stop existing stream if running
        if (RtmpStreamingService.isStreaming()) {
            RtmpStreamingService.stopStreaming(context);
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        String streamId = data.optString("streamId", "");
        RtmpStreamingService.startStreaming(context, rtmpUrl, streamId);
    }

    private void handleStopRtmpStream() {
        if (RtmpStreamingService.isStreaming()) {
            RtmpStreamingService.stopStreaming(context);
            sendRtmpStatusResponse(true, "stopping", null);
        } else {
            sendRtmpStatusResponse(false, "not_streaming", null);
        }
    }

    private void handleGetRtmpStatus() {
        boolean isStreaming = RtmpStreamingService.isStreaming();
        boolean isReconnecting = RtmpStreamingService.isReconnecting();

        try {
            JSONObject status = new JSONObject();
            status.put("streaming", isStreaming);

            if (isReconnecting) {
                status.put("reconnecting", true);
                status.put("attempt", RtmpStreamingService.getReconnectAttempt());
            }

            sendRtmpStatusResponse(true, status);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating RTMP status response", e);
            sendRtmpStatusResponse(false, "json_error", e.getMessage());
        }
    }

    private void handleKeepRtmpStreamAlive(JSONObject data) {
        String streamId = data.optString("streamId", "");
        String ackId = data.optString("ackId", "");

        if (!streamId.isEmpty() && !ackId.isEmpty()) {
            boolean streamIdValid = RtmpStreamingService.resetStreamTimeout(streamId);
            if (streamIdValid) {
                service.sendKeepAliveAck(streamId, ackId);
            } else {
                Log.e(TAG, "Received keep-alive for unknown stream ID: " + streamId);
                RtmpStreamingService.stopStreaming(context);
            }
        }
    }

    private void handleSetWifiCredentials(JSONObject data) {
        String ssid = data.optString("ssid", "");
        String password = data.optString("password", "");
        if (!ssid.isEmpty()) {
            INetworkManager networkManager = serviceManager.getNetworkManager();
            if (networkManager != null) {
                networkManager.connectToWifi(ssid, password);
                serviceManager.initializeCameraWebServer();
            }
        }
    }

    private void handleRequestWifiStatus() {
        INetworkManager networkManager = serviceManager.getNetworkManager();
        if (networkManager != null) {
            boolean wifiConnected = networkManager.isConnectedToWifi();
            service.sendWifiStatusOverBle(wifiConnected);
        }
    }

    private void handleRequestWifiScan() {
        INetworkManager networkManager = serviceManager.getNetworkManager();
        if (networkManager != null) {
            new Thread(() -> {
                try {
                    List<String> networks = networkManager.scanWifiNetworks();
                    sendWifiScanResultsOverBle(networks);
                } catch (Exception e) {
                    Log.e(TAG, "Error scanning for WiFi networks", e);
                    sendWifiScanResultsOverBle(new ArrayList<>());
                }
            }).start();
        }
    }

    private void handlePing() {
        try {
            JSONObject pingResponse = new JSONObject();
            pingResponse.put("type", "pong");
            sendBluetoothResponse(pingResponse);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating ping response", e);
        }
    }

    private void handleBatteryStatus(JSONObject data) {
        int level = data.optInt("level", -1);
        boolean charging = data.optBoolean("charging", false);
        long timestamp = data.optLong("timestamp", System.currentTimeMillis());
        
        service.updateBatteryStatus(level, charging, timestamp);
    }

    private void handleSetHotspotState(JSONObject data) {
        boolean hotspotEnabled = data.optBoolean("enabled", false);
        INetworkManager networkManager = serviceManager.getNetworkManager();
        
        if (hotspotEnabled) {
            String hotspotSsid = data.optString("ssid", "");
            String hotspotPassword = data.optString("password", "");
            networkManager.startHotspot(hotspotSsid, hotspotPassword);
        } else {
            networkManager.stopHotspot();
        }
    }

    private void handleRequestVersion() {
        Log.d(TAG, "📊 Received version request - sending version info");
        service.sendVersionInfo();
    }

    private void handleOtaUpdateResponse(JSONObject data) {
        boolean accepted = data.optBoolean("accepted", false);
        if (accepted) {
            Log.d(TAG, "Received ota_update_response: accepted, proceeding with OTA installation");
            // TODO: Trigger OTA installation here
        } else {
            Log.d(TAG, "Received ota_update_response: rejected by user");
        }
    }

    private void handleSetPhotoMode(JSONObject data) {
        String mode = data.optString("mode", "save_locally");
        try {
            JSONObject ack = new JSONObject();
            ack.put("type", "set_photo_mode_ack");
            ack.put("mode", mode);
            sendBluetoothResponse(ack);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo mode ack", e);
        }
    }

    private void handleButtonModeSetting(JSONObject data) {
        String mode = data.optString("mode", "photo");
        Log.d(TAG, "📱 Received button mode setting: " + mode);
        AsgSettings settings = serviceManager.getAsgSettings();
        if (settings != null) {
            settings.setButtonPressMode(mode);
        }
    }

    // Helper methods
    private void sendBluetoothResponse(JSONObject response) {
        IBluetoothManager bluetoothManager = serviceManager.getBluetoothManager();
        if (bluetoothManager != null && bluetoothManager.isConnected()) {
            bluetoothManager.sendData(response.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    private void sendAckResponse(long messageId) {
        try {
            JSONObject ack = new JSONObject();
            ack.put("type", "ack");
            ack.put("messageId", messageId);
            sendBluetoothResponse(ack);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating ACK response", e);
        }
    }

    private void sendTokenStatusResponse(boolean success) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "token_status");
            response.put("success", success);
            sendBluetoothResponse(response);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating token status response", e);
        }
    }

    private void sendVideoRecordingStatusResponse(boolean success, String status, String details) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "video_recording_status");
            response.put("success", success);
            response.put("status", status);
            if (details != null) {
                response.put("details", details);
            }
            sendBluetoothResponse(response);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating video recording status response", e);
        }
    }

    private void sendVideoRecordingStatusResponse(boolean success, JSONObject statusObject) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "video_recording_status");
            response.put("success", success);
            response.put("data", statusObject);
            sendBluetoothResponse(response);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating video recording status response", e);
        }
    }

    private void sendRtmpStatusResponse(boolean success, String status, String details) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "rtmp_stream_status");
            response.put("success", success);
            response.put("status", status);
            if (details != null) {
                response.put("details", details);
            }
            sendBluetoothResponse(response);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating RTMP status response", e);
        }
    }

    private void sendRtmpStatusResponse(boolean success, JSONObject statusObject) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", "rtmp_stream_status");
            response.put("success", success);
            response.put("data", statusObject);
            sendBluetoothResponse(response);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating RTMP status response", e);
        }
    }

    private void sendWifiScanResultsOverBle(List<String> networks) {
        try {
            JSONObject scanResults = new JSONObject();
            scanResults.put("type", "wifi_scan_result");

            JSONArray networksArray = new JSONArray();
            for (String network : networks) {
                networksArray.put(network);
            }
            scanResults.put("networks", networksArray);

            sendBluetoothResponse(scanResults);
            Log.d(TAG, "Sent WiFi scan results via BLE. Found " + networks.size() + " networks.");
        } catch (JSONException e) {
            Log.e(TAG, "Error creating WiFi scan results JSON", e);
        }
    }

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
    public void parseK900Command(JSONObject json) {
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
                if (service != null) {
                    service.updateBatteryStatus(batteryPercentage, isCharging, System.currentTimeMillis());
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