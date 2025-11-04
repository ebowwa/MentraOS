package com.augmentos.asg_client.service.core.handlers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;

import org.json.JSONObject;

import java.util.Set;

/**
 * Handler for photo-related commands.
 * Follows Single Responsibility Principle by handling only photo commands.
 * Extends BaseMediaCommandHandler for common package directory management.
 * 
 * RATE LIMITING:
 * - Enforces 1000ms minimum interval between photo requests
 * - Prevents rapid-fire duplicate requests that cause:
 *   - Identical filenames (second-level timestamp collision)
 *   - Duplicate callbacks with same requestId
 *   - System overload and callback reuse bugs
 * - Rejects requests with RATE_LIMIT_EXCEEDED error
 * - Applies to all transfer methods (direct, auto, ble)
 */
public class PhotoCommandHandler extends BaseMediaCommandHandler {
    private static final String TAG = "PhotoCommandHandler";
    
    // Rate limiting: minimum time between photo requests (milliseconds)
    // TODO: Move this rate limiting to SDK camera module for server-side enforcement
    // TODO: This provides temporary client-side protection until SDK implementation is complete
    // TODO: After SDK deployment, remove this client-side rate limit to avoid double-checking
    private static final long PHOTO_RATE_LIMIT_MS = 1001; // 1001ms minimum between photos
    private static long lastPhotoRequestTime = 0;

    private final AsgClientServiceManager serviceManager;

    public PhotoCommandHandler(Context context, AsgClientServiceManager serviceManager, FileManager fileManager) {
        super(context, fileManager);
        this.serviceManager = serviceManager;
    }

    @Override
    public Set<String> getSupportedCommandTypes() {
        return Set.of("take_photo");
    }

    @Override
    public boolean handleCommand(String commandType, JSONObject data) {
        try {
            switch (commandType) {
                case "take_photo":
                    return handleTakePhoto(data);
                default:
                    Log.e(TAG, "Unsupported photo command: " + commandType);
                    return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling photo command: " + commandType, e);
            return false;
        }
    }

    /**
     * Handle take photo command
     */
    private boolean handleTakePhoto(JSONObject data) {
        // DIAGNOSTIC: Log command entry with stack trace
        Log.d(TAG, "🔍 handleTakePhoto() ENTRY | data: " + data.toString());
        Log.d(TAG, "🔍 STACK TRACE: " + Log.getStackTraceString(new Exception("Photo command origin trace")));
        
        Log.d(TAG, "Handling take photo command with data: " + data.toString());
        try {
            // Resolve package name using base class functionality
            String packageName = resolvePackageName(data);
            logCommandStart("take_photo", packageName);

            // Validate requestId using base class functionality
            if (!validateRequestId(data)) {
                return false;
            }

            String requestId = data.optString("requestId", "");
            
            // RATE LIMITING: Check if photo requests are coming too fast
            // TODO: This is temporary client-side protection. Move to SDK for proper server-side enforcement.
            long currentTime = System.currentTimeMillis();
            long timeSinceLastRequest = currentTime - lastPhotoRequestTime;
            
            if (lastPhotoRequestTime > 0 && timeSinceLastRequest < PHOTO_RATE_LIMIT_MS) {
                Log.w(TAG, "🚫 Photo request rejected - rate limit exceeded");
                Log.w(TAG, "⏱️ Time since last request: " + timeSinceLastRequest + "ms (minimum: " + PHOTO_RATE_LIMIT_MS + "ms)");
                logCommandResult("take_photo", false, "Rate limit exceeded - requests too fast");
                
                // Get capture service to send error response
                MediaCaptureService captureService = serviceManager.getMediaCaptureService();
                if (captureService != null) {
                    captureService.sendPhotoErrorResponse(requestId, "RATE_LIMIT_EXCEEDED", 
                        "Photo requests too fast. Please wait " + PHOTO_RATE_LIMIT_MS + "ms between photos.");
                }
                return false;
            }
            
            // Update last request time
            lastPhotoRequestTime = currentTime;
            Log.d(TAG, "✅ Rate limit check passed - proceeding with photo capture");
            String webhookUrl = data.optString("webhookUrl", "");
            String authToken = data.optString("authToken", "");
            String transferMethod = data.optString("transferMethod", "direct");
            String bleImgId = data.optString("bleImgId", "");
            boolean save = data.optBoolean("save", false);
            String size = data.optString("size", "medium");
            String compress = data.optString("compress", "none"); // Default to none (no compression)
            boolean enableLed = data.optBoolean("enable_led", true); // Default true for phone commands

            // Generate file path using base class functionality
            String fileName = generateUniqueFilename("IMG_", ".jpg");
            String photoFilePath = generateFilePath(packageName, fileName);
            if (photoFilePath == null) {
                logCommandResult("take_photo", false, "Failed to generate file path");
                return false;
            }

            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService == null) {
                logCommandResult("take_photo", false, "Media capture service not available");
                return false;
            }

            // VIDEO RECORDING CHECK: Reject photo requests if video is currently recording
            if (captureService.isRecordingVideo()) {
                Log.w(TAG, "🚫 Photo request rejected - video recording in progress");
                logCommandResult("take_photo", false, "Video recording in progress - request rejected");
                // Send immediate error response to phone
                captureService.sendPhotoErrorResponse(requestId, "VIDEO_RECORDING_ACTIVE", "Video recording in progress - request rejected");
                return false;
            }

            // COOLDOWN CHECK: Reject photo requests if BLE transfer is in progress
            if (captureService.isBleTransferInProgress()) {
                Log.w(TAG, "🚫 Photo request rejected - BLE transfer in progress (cooldown active)");
                logCommandResult("take_photo", false, "BLE transfer in progress - request rejected");
                // Send immediate error response to phone
                captureService.sendPhotoErrorResponse(requestId, "BLE_TRANSFER_BUSY", "BLE transfer in progress - request rejected");
                return false;
            }

            // Process photo capture based on transfer method
            boolean success = processPhotoCapture(captureService, photoFilePath, requestId, webhookUrl, authToken,
                                                 bleImgId, save, size, transferMethod, enableLed, compress);
            logCommandResult("take_photo", success, success ? null : "Photo capture failed");
            return success;

        } catch (Exception e) {
            Log.e(TAG, "Error handling take photo command", e);
            logCommandResult("take_photo", false, "Exception: " + e.getMessage());
            return false;
        }
    }

    /**
     * Process photo capture based on transfer method.
     *
     * @param captureService Media capture service
     * @param photoFilePath Photo file path
     * @param requestId Request ID
     * @param webhookUrl Webhook URL
     * @param authToken Auth token for webhook authentication
     * @param bleImgId BLE image ID
     * @param save Whether to save the photo
     * @param size Photo size
     * @param transferMethod Transfer method
     * @param enableLed Whether to enable LED
     * @param compress Compression level
     * @return true if successful, false otherwise
     */
    private boolean processPhotoCapture(MediaCaptureService captureService, String photoFilePath,
                                      String requestId, String webhookUrl, String authToken, String bleImgId,
                                      boolean save, String size, String transferMethod, boolean enableLed, String compress) {
        Log.d(TAG, "789789Processing photo capture with transfer method: " + transferMethod);
        switch (transferMethod) {
            case "ble":
                captureService.takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, save, size, enableLed);
                return true;
            case "auto":
                if (bleImgId.isEmpty()) {
                    Log.e(TAG, "Auto mode requires bleImgId for fallback");
                    return false;
                }
                captureService.takePhotoAutoTransfer(photoFilePath, requestId, webhookUrl, authToken, bleImgId, save, size, enableLed, compress);
                return true;
            default:
                captureService.takePhotoAndUpload(photoFilePath, requestId, webhookUrl, authToken, save, size, enableLed, compress);
                return true;
        }
    }
}