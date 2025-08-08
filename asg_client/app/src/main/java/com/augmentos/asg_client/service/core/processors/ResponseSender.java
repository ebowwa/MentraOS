package com.augmentos.asg_client.service.core.processors;

import android.util.Log;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Response sender component following Single Responsibility Principle.
 * <p>
 * This class is responsible for sending various types of responses
 * over Bluetooth Low Energy (BLE) communication.
 */
public record ResponseSender(AsgClientServiceManager serviceManager) {
    private static final String TAG = "ResponseSender";

    /**
     * Constructor for ResponseSender.
     *
     * @param serviceManager The service manager for accessing Bluetooth functionality
     */
    public ResponseSender(AsgClientServiceManager serviceManager) {
        this.serviceManager = serviceManager;
        Log.d(TAG, "✅ Response sender initialized");
    }

    /**
     * Send download progress notification over BLE.
     *
     * @param status          The status of the download (e.g., "started", "completed", "failed")
     * @param progress        The download progress percentage (0-100)
     * @param bytesDownloaded The number of bytes downloaded so far
     * @param totalBytes      The total number of bytes to download
     * @param errorMessage    Error message if download failed, null otherwise
     * @param timestamp       The timestamp of the progress update
     */
    public void sendDownloadProgress(String status, int progress, long bytesDownloaded, long totalBytes, String errorMessage, long timestamp) {
        if (!isBluetoothConnected()) {
            Log.d(TAG, "Cannot send download progress - not connected to BLE device");
            return;
        }

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
            sendDataOverBluetooth(jsonString.getBytes());
            Log.d(TAG, "📥 Sent download progress via BLE: " + status + " - " + progress + "%");

        } catch (JSONException e) {
            Log.e(TAG, "Error creating download progress JSON", e);
        }
    }

    /**
     * Send installation progress notification over BLE.
     *
     * @param status       The status of the installation (e.g., "started", "completed", "failed")
     * @param apkPath      The path to the APK being installed
     * @param errorMessage Error message if installation failed, null otherwise
     * @param timestamp    The timestamp of the progress update
     */
    public void sendInstallationProgress(String status, String apkPath, String errorMessage, long timestamp) {
        if (!isBluetoothConnected()) {
            Log.d(TAG, "Cannot send installation progress - not connected to BLE device");
            return;
        }

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
            sendDataOverBluetooth(jsonString.getBytes());
            Log.d(TAG, "🔧 Sent installation progress via BLE: " + status + " - " + apkPath);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating installation progress JSON", e);
        }
    }

    /**
     * Send report swipe status over BLE.
     *
     * @param report The swipe report status (true/false)
     */
    public void sendReportSwipe(boolean report) {
        if (!isBluetoothConnected()) {
            Log.d(TAG, "Cannot send swipe report - not connected to BLE device");
            return;
        }

        try {
            JSONObject swipeJson = new JSONObject();
            swipeJson.put("C", "cs_swst");
            JSONObject bJson = new JSONObject();
            bJson.put("type", 27);
            bJson.put("switch", report);
            swipeJson.put("B", bJson);
            swipeJson.put("V", 1);

            String jsonString = swipeJson.toString();
            sendDataOverBluetooth(jsonString.getBytes());
            Log.d(TAG, "📱 Sent swipe report status via BLE: " + report);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating swipe JSON", e);
        }
    }

    /**
     * Send a generic JSON response over BLE.
     *
     * @param responseType The type of response
     * @param data         The response data
     * @param messageId    Optional message ID for acknowledgment
     */
    public void sendGenericResponse(String responseType, JSONObject data, long messageId) {
        if (!isBluetoothConnected()) {
            Log.d(TAG, "Cannot send generic response - not connected to BLE device");
            return;
        }

        try {
            JSONObject response = new JSONObject();
            response.put("type", responseType);
            if (data != null) {
                response.put("data", data);
            }
            if (messageId != -1) {
                response.put("mId", messageId);
            }
            response.put("timestamp", System.currentTimeMillis());

            String jsonString = response.toString();
            sendDataOverBluetooth(jsonString.getBytes());
            Log.d(TAG, "📤 Sent generic response via BLE: " + responseType);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating generic response JSON", e);
        }
    }

    /**
     * Send error response over BLE.
     *
     * @param errorCode    The error code
     * @param errorMessage The error message
     * @param messageId    Optional message ID for acknowledgment
     */
    public void sendErrorResponse(String errorCode, String errorMessage, long messageId) {
        if (!isBluetoothConnected()) {
            Log.d(TAG, "Cannot send error response - not connected to BLE device");
            return;
        }

        try {
            JSONObject errorResponse = new JSONObject();
            errorResponse.put("type", "error");
            errorResponse.put("error_code", errorCode);
            errorResponse.put("error_message", errorMessage);
            if (messageId != -1) {
                errorResponse.put("mId", messageId);
            }
            errorResponse.put("timestamp", System.currentTimeMillis());

            String jsonString = errorResponse.toString();
            sendDataOverBluetooth(jsonString.getBytes());
            Log.d(TAG, "❌ Sent error response via BLE: " + errorCode + " - " + errorMessage);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating error response JSON", e);
        }
    }

    /**
     * Check if Bluetooth is connected and available.
     *
     * @return true if Bluetooth is connected, false otherwise
     */
    private boolean isBluetoothConnected() {
        return serviceManager != null &&
                serviceManager.getBluetoothManager() != null &&
                serviceManager.getBluetoothManager().isConnected();
    }

    /**
     * Send data over Bluetooth with error handling.
     *
     * @param data The data to send
     */
    private void sendDataOverBluetooth(byte[] data) {
        try {
            serviceManager.getBluetoothManager().sendData(data);
        } catch (Exception e) {
            Log.e(TAG, "Error sending data over Bluetooth", e);
        }
    }

    /**
     * Get the service manager instance.
     *
     * @return The service manager
     */
    @Override
    public AsgClientServiceManager serviceManager() {
        return serviceManager;
    }
} 