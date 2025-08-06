package com.augmentos.asg_client.service.core.processors;

import android.util.Log;
import com.augmentos.asg_client.service.core.handlers.LegacyCommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;

import org.json.JSONObject;

/**
 * Legacy command processor following Single Responsibility Principle.
 * 
 * This class handles legacy commands that are not covered by the modern
 * command handler system. It provides backward compatibility for older
 * command formats.
 */
public class LegacyCommandProcessor {
    private static final String TAG = "LegacyCommandProcessor";
    private final LegacyCommandHandler legacyHandler;

    /**
     * Constructor for LegacyCommandProcessor.
     * 
     * @param serviceManager The service manager for accessing system services
     * @param streamingManager The streaming manager for media operations
     */
    public LegacyCommandProcessor(AsgClientServiceManager serviceManager, IStreamingManager streamingManager) {
        this.legacyHandler = new LegacyCommandHandler(serviceManager, streamingManager);
        Log.d(TAG, "✅ Legacy command processor initialized");
    }

    /**
     * Handle legacy command by delegating to appropriate legacy handler.
     * 
     * @param type The command type to handle
     * @param data The JSON data associated with the command
     */
    public void handleLegacyCommand(String type, JSONObject data) {
        if (type == null || type.trim().isEmpty()) {
            Log.w(TAG, "Received null or empty legacy command type");
            return;
        }

        Log.d(TAG, "🔄 Processing legacy command: " + type);

        switch (type) {
            case "stop_video_recording":
                handleStopVideoRecording();
                break;
            case "get_video_recording_status":
                handleGetVideoRecordingStatus();
                break;
            case "start_video_recording":
                handleStartVideoRecording(data);
                break;
            case "take_photo":
                handleTakePhoto(data);
                break;
            default:
                Log.w(TAG, "❌ Legacy command not implemented: " + type);
                break;
        }
    }

    /**
     * Handle stop video recording command.
     */
    private void handleStopVideoRecording() {
        try {
            Log.d(TAG, "📹 Stopping video recording");
            legacyHandler.handleStopVideoRecording();
        } catch (Exception e) {
            Log.e(TAG, "Error stopping video recording", e);
        }
    }

    /**
     * Handle get video recording status command.
     */
    private void handleGetVideoRecordingStatus() {
        try {
            Log.d(TAG, "📹 Getting video recording status");
            legacyHandler.handleGetVideoRecordingStatus();
        } catch (Exception e) {
            Log.e(TAG, "Error getting video recording status", e);
        }
    }

    /**
     * Handle start video recording command.
     * 
     * @param data The command data containing recording parameters
     */
    private void handleStartVideoRecording(JSONObject data) {
        try {
            Log.d(TAG, "📹 Starting video recording with data: " + data);
            // Legacy handler doesn't have this method, so we log it
            Log.w(TAG, "Start video recording not implemented in legacy handler");
        } catch (Exception e) {
            Log.e(TAG, "Error starting video recording", e);
        }
    }

    /**
     * Handle take photo command.
     * 
     * @param data The command data containing photo parameters
     */
    private void handleTakePhoto(JSONObject data) {
        try {
            Log.d(TAG, "📸 Taking photo with data: " + data);
            // Legacy handler doesn't have this method, so we log it
            Log.w(TAG, "Take photo not implemented in legacy handler");
        } catch (Exception e) {
            Log.e(TAG, "Error taking photo", e);
        }
    }

    /**
     * Check if a command type is supported by the legacy processor.
     * 
     * @param type The command type to check
     * @return true if the command is supported, false otherwise
     */
    public boolean isLegacyCommand(String type) {
        if (type == null) {
            return false;
        }
        
        return type.equals("stop_video_recording") ||
               type.equals("get_video_recording_status") ||
               type.equals("start_video_recording") ||
               type.equals("take_photo");
    }

    /**
     * Get the list of supported legacy command types.
     * 
     * @return Array of supported legacy command types
     */
    public String[] getSupportedLegacyCommands() {
        return new String[]{
            "stop_video_recording",
            "get_video_recording_status",
            "start_video_recording",
            "take_photo"
        };
    }
} 