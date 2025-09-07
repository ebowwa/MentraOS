package com.augmentos.asg_client.service.core.handlers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.streaming.services.RtmpStreamingService;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.media.interfaces.IMediaManager;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Set;

/**
 * Handler for RTMP streaming commands.
 * Follows Single Responsibility Principle by handling only RTMP streaming commands.
 */
public class RtmpCommandHandler implements ICommandHandler {
    private static final String TAG = "RtmpCommandHandler";

    private final Context context;
    private final IStateManager stateManager;
    private final IMediaManager streamingManager;

    public RtmpCommandHandler(Context context, IStateManager stateManager, IMediaManager streamingManager) {
        this.context = context;
        this.stateManager = stateManager;
        this.streamingManager = streamingManager;
    }

    @Override
    public Set<String> getSupportedCommandTypes() {
        return Set.of("start_rtmp_stream", "stop_rtmp_stream", "get_rtmp_status", "keep_rtmp_stream_alive");
    }

    @Override
    public boolean handleCommand(String commandType, JSONObject data) {
        try {
            switch (commandType) {
                case "start_rtmp_stream":
                    return handleStartRtmpStream(data);
                case "stop_rtmp_stream":
                    return handleStopCommand();
                case "get_rtmp_status":
                    return handleStatusCommand();
                case "keep_rtmp_stream_alive":
                    return handleKeepAliveCommand(data);
                default:
                    Log.e(TAG, "Unsupported RTMP command: " + commandType);
                    return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling RTMP command: " + commandType, e);
            return false;
        }
    }

    /**
     * Handle start RTMP stream command
     */
    private boolean handleStartRtmpStream(JSONObject data) {
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
            boolean enableLed = data.optBoolean("enable_led", true); // Default true for livestreams
            RtmpStreamingService.startStreaming(context, rtmpUrl, streamId, enableLed);
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