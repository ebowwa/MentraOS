package com.augmentos.asg_client.service.core.handlers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.media.interfaces.IMediaManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;
import java.util.Set;

/**
 * Handler for video recording commands.
 * Follows Single Responsibility Principle by handling only video commands.
 * Extends BaseMediaCommandHandler for common package directory management.
 */
public class VideoCommandHandler extends BaseMediaCommandHandler {
    private static final String TAG = "VideoCommandHandler";

    private final AsgClientServiceManager serviceManager;
    private final IMediaManager streamingManager;

    public VideoCommandHandler(Context context, AsgClientServiceManager serviceManager, IMediaManager streamingManager, FileManager fileManager) {
        super(context, fileManager);
        this.serviceManager = serviceManager;
        this.streamingManager = streamingManager;
    }

    @Override
    public Set<String> getSupportedCommandTypes() {
        return Set.of("start_video_recording", "stop_video_recording", "get_video_recording_status");
    }

    @Override
    public boolean handleCommand(String commandType, JSONObject data) {
        try {
            switch (commandType) {
                case "start_video_recording":
                    return handleStartVideoRecording(data);
                case "stop_video_recording":
                    return handleStopCommand();
                case "get_video_recording_status":
                    return handleStatusCommand();
                default:
                    Log.e(TAG, "Unsupported video command: " + commandType);
                    return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling video command: " + commandType, e);
            return false;
        }
    }

    /**
     * Handle start video recording command
     */
    private boolean handleStartVideoRecording(JSONObject data) {
        try {
            // Resolve package name using base class functionality
            String packageName = resolvePackageName(data);
            logCommandStart("start_video_recording", packageName);

            // Validate requestId using base class functionality
            if (!validateRequestId(data)) {
                streamingManager.sendVideoRecordingStatusResponse(false, "missing_request_id", null);
                return false;
            }

            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService == null) {
                logCommandResult("start_video_recording", false, "Media capture service is not initialized");
                streamingManager.sendVideoRecordingStatusResponse(false, "service_unavailable", null);
                return false;
            }

            if (captureService.isRecordingVideo()) {
                logCommandResult("start_video_recording", true, "Already recording video");
                streamingManager.sendVideoRecordingStatusResponse(true, "already_recording", null);
                return true;
            }

            captureService.handleVideoButtonPress();
            logCommandResult("start_video_recording", true, null);
            streamingManager.sendVideoRecordingStatusResponse(true, "recording_started", null);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling start video recording command", e);
            logCommandResult("start_video_recording", false, "Exception: " + e.getMessage());
            streamingManager.sendVideoRecordingStatusResponse(false, "error", e.getMessage());
            return false;
        }
    }

    /**
     * Handle stop video recording command
     */
    public boolean handleStopCommand() {
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
            Log.e(TAG, "Error handling stop video command", e);
            streamingManager.sendVideoRecordingStatusResponse(false, "error", e.getMessage());
            return false;
        }
    }

    /**
     * Handle get video recording status command
     */
    public boolean handleStatusCommand() {
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
            Log.e(TAG, "Error handling video status command", e);
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