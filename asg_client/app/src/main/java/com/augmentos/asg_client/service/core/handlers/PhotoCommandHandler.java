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
 */
public class PhotoCommandHandler extends BaseMediaCommandHandler {
    private static final String TAG = "PhotoCommandHandler";

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
        try {
            // Resolve package name using base class functionality
            String packageName = resolvePackageName(data);
            logCommandStart("take_photo", packageName);

            // Validate requestId using base class functionality
            if (!validateRequestId(data)) {
                return false;
            }

            String requestId = data.optString("requestId", "");
            String webhookUrl = data.optString("webhookUrl", "");
            String transferMethod = data.optString("transferMethod", "direct");
            String bleImgId = data.optString("bleImgId", "");
            boolean save = data.optBoolean("save", false);
            String size = data.optString("size", "medium");

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

            // Process photo capture based on transfer method
            boolean success = processPhotoCapture(captureService, photoFilePath, requestId, webhookUrl, bleImgId, save, size, transferMethod);
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
     * @param bleImgId BLE image ID
     * @param save Whether to save the photo
     * @param transferMethod Transfer method
     * @return true if successful, false otherwise
     */
    private boolean processPhotoCapture(MediaCaptureService captureService, String photoFilePath,
                                      String requestId, String webhookUrl, String bleImgId,
                                      boolean save, String size, String transferMethod) {
        switch (transferMethod) {
            case "ble":
                captureService.takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, save, size);
                return true;
            case "auto":
                if (bleImgId.isEmpty()) {
                    Log.e(TAG, "Auto mode requires bleImgId for fallback");
                    return false;
                }
                captureService.takePhotoAutoTransfer(photoFilePath, requestId, webhookUrl, bleImgId, save, size);
                return true;
            default:
                captureService.takePhotoAndUpload(photoFilePath, requestId, webhookUrl, save, size);
                return true;
        }
    }
}