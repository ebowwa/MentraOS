package com.augmentos.asg_client.service.media.handlers;

import android.content.Context;
import android.util.Log;
import com.augmentos.asg_client.io.streaming.services.RtmpStreamingService;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Handler for RTMP streaming commands.
 * Follows Single Responsibility Principle by handling only RTMP streaming commands.
 */
public class RtmpCommandHandler implements ICommandHandler {
    private static final String TAG = "RtmpCommandHandler";
    
    private final Context context;
    private final IStateManager stateManager;
    private final IStreamingManager streamingManager;

    public RtmpCommandHandler(Context context, IStateManager stateManager, IStreamingManager streamingManager) {
        this.context = context;
        this.stateManager = stateManager;
        this.streamingManager = streamingManager;
    }

    @Override
    public String getCommandType() {
        return "start_rtmp_stream";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        try {
            String rtmpUrl = data.optString("rtmpUrl", "");
            if (rtmpUrl.isEmpty()) {
                Log.e(TAG, "Cannot start RTMP stream - missing rtmpUrl");
                streamingManager.sendRtmpStatusResponse(false, "missing_rtmp_url", null);
                return false;
            }

            if (!stateManager.isConnectedToWifi()) {
                Log.e(TAG, "Cannot start RTMP stream - no WiFi connection");
                streamingManager.sendRtmpStatusResponse(false, "no_wifi_connection", null);
                return false;
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
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling RTMP start command", e);
            streamingManager.sendRtmpStatusResponse(false, "error", e.getMessage());
            return false;
        }
    }

    /**
     * Handle stop RTMP stream command
     */
    public boolean handleStopCommand() {
        try {
            if (RtmpStreamingService.isStreaming()) {
                RtmpStreamingService.stopStreaming(context);
                streamingManager.sendRtmpStatusResponse(true, "stopping", null);
                return true;
            } else {
                streamingManager.sendRtmpStatusResponse(false, "not_streaming", null);
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling RTMP stop command", e);
            streamingManager.sendRtmpStatusResponse(false, "error", e.getMessage());
            return false;
        }
    }

    /**
     * Handle get RTMP status command
     */
    public boolean handleStatusCommand() {
        try {
            boolean isStreaming = RtmpStreamingService.isStreaming();
            boolean isReconnecting = RtmpStreamingService.isReconnecting();

            JSONObject status = new JSONObject();
            status.put("streaming", isStreaming);

            if (isReconnecting) {
                status.put("reconnecting", true);
                status.put("attempt", RtmpStreamingService.getReconnectAttempt());
            }

            streamingManager.sendRtmpStatusResponse(true, status);
            return true;
        } catch (JSONException e) {
            Log.e(TAG, "Error creating RTMP status response", e);
            streamingManager.sendRtmpStatusResponse(false, "json_error", e.getMessage());
            return false;
        }
    }

    /**
     * Handle keep RTMP stream alive command
     */
    public boolean handleKeepAliveCommand(JSONObject data) {
        try {
            String streamId = data.optString("streamId", "");
            String ackId = data.optString("ackId", "");

            if (!streamId.isEmpty() && !ackId.isEmpty()) {
                boolean streamIdValid = RtmpStreamingService.resetStreamTimeout(streamId);
                if (streamIdValid) {
                    streamingManager.sendKeepAliveAck(streamId, ackId);
                    return true;
                } else {
                    Log.e(TAG, "Received keep-alive for unknown stream ID: " + streamId);
                    RtmpStreamingService.stopStreaming(context);
                    return false;
                }
            }
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error handling RTMP keep-alive command", e);
            return false;
        }
    }
} 