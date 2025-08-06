package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;

import org.json.JSONException;
import org.json.JSONObject;
import java.util.Locale;

/**
 * Handler for legacy commands that are still in the switch statement.
 * Follows Single Responsibility Principle by handling only legacy commands.
 * This is a temporary handler during the transition to the new architecture.
 */
public class LegacyCommandHandler implements ICommandHandler {
    private static final String TAG = "LegacyCommandHandler";
    
    private final AsgClientServiceManager serviceManager;
    private final IStreamingManager streamingManager;

    public LegacyCommandHandler(AsgClientServiceManager serviceManager, IStreamingManager streamingManager) {
        this.serviceManager = serviceManager;
        this.streamingManager = streamingManager;
    }

    @Override
    public String getCommandType() {
        return "legacy_command";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        // This is a placeholder - actual legacy commands are handled by specific methods
        return false;
    }

    /**
     * Handle stop video recording command
     */
    public boolean handleStopVideoRecording() {
        try {
            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService == null) {
                Log.e(TAG, "Media capture service is not initialized");
                streamingManager.sendVideoRecordingStatusResponse(false, "service_unavailable", null);
                return false;
            }

            if (!captureService.isRecordingVideo()) {
                Log.d(TAG, "Not currently recording, ignoring stop command");
                streamingManager.sendVideoRecordingStatusResponse(false, "not_recording", null);
                return false;
            }

            captureService.stopVideoRecording();
            streamingManager.sendVideoRecordingStatusResponse(true, "recording_stopped", null);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling stop video recording command", e);
            streamingManager.sendVideoRecordingStatusResponse(false, "error", e.getMessage());
            return false;
        }
    }

    /**
     * Handle get video recording status command
     */
    public boolean handleGetVideoRecordingStatus() {
        try {
            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService == null) {
                Log.e(TAG, "Media capture service is not initialized");
                streamingManager.sendVideoRecordingStatusResponse(false, "service_unavailable", null);
                return false;
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

                streamingManager.sendVideoRecordingStatusResponse(true, status);
                return true;
            } catch (JSONException e) {
                Log.e(TAG, "Error creating video recording status response", e);
                streamingManager.sendVideoRecordingStatusResponse(false, "json_error", e.getMessage());
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling get video recording status command", e);
            streamingManager.sendVideoRecordingStatusResponse(false, "error", e.getMessage());
            return false;
        }
    }

    private String formatDuration(long durationMs) {
        long seconds = durationMs / 1000;
        long minutes = seconds / 60;
        seconds = seconds % 60;
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }
} 