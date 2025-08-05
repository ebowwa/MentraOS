package com.augmentos.asg_client.service.media.handlers;

import android.content.Context;
import android.util.Log;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;

import org.json.JSONException;
import org.json.JSONObject;
import java.util.Locale;

/**
 * Handler for video recording commands.
 * Follows Single Responsibility Principle by handling only video commands.
 */
public class VideoCommandHandler implements ICommandHandler {
    private static final String TAG = "VideoCommandHandler";
    
    private final AsgClientServiceManager serviceManager;
    private final Context context;
    private final IStreamingManager streamingManager;

    public VideoCommandHandler(Context context, AsgClientServiceManager serviceManager, IStreamingManager streamingManager) {
        this.serviceManager = serviceManager;
        this.context = context;
        this.streamingManager = streamingManager;
    }

    @Override
    public String getCommandType() {
        return "start_video_recording";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        try {
            String requestId = data.optString("requestId", "");
            String packageName = data.optString("packageName", "");
            if(packageName.isEmpty()){
                packageName = context.getPackageName();
            }
            Log.d(TAG, "Handling video command for package: " + packageName);

            if (requestId.isEmpty()) {
                Log.e(TAG, "Cannot start video recording - missing requestId");
                streamingManager.sendVideoRecordingStatusResponse(false, "missing_request_id", null);
                return false;
            }

            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService == null) {
                Log.e(TAG, "Media capture service is not initialized");
                streamingManager.sendVideoRecordingStatusResponse(false, "service_unavailable", null);
                return false;
            }

            if (captureService.isRecordingVideo()) {
                Log.d(TAG, "Already recording video, ignoring start command");
                streamingManager.sendVideoRecordingStatusResponse(true, "already_recording", null);
                return true;
            }

            captureService.handleVideoButtonPress();
            streamingManager.sendVideoRecordingStatusResponse(true, "recording_started", null);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling video command", e);
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