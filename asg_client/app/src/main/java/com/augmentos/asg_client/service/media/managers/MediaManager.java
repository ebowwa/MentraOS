package com.augmentos.asg_client.service.media.managers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.streaming.events.StreamingCommand;
import com.augmentos.asg_client.io.streaming.interfaces.StreamingStatusCallback;
import com.augmentos.asg_client.io.streaming.services.RtmpStreamingService;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.media.interfaces.IMediaManager;

import org.greenrobot.eventbus.EventBus;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Manages all streaming operations (RTMP, video recording, etc.).
 * Follows Single Responsibility Principle by handling only streaming concerns.
 */
public class MediaManager implements IMediaManager {
    
    private static final String TAG = "StreamingManager";
    
    private final Context context;
    private final AsgClientServiceManager serviceManager;
    private final StreamingStatusCallback streamingStatusCallback;
    
    public MediaManager(Context context, AsgClientServiceManager serviceManager) {
        this.context = context;
        this.serviceManager = serviceManager;
        this.streamingStatusCallback = createStreamingStatusCallback();
    }
    
    @Override
    public void startRtmpStreaming() {
        try {
            Log.d(TAG, "Starting RTMP streaming service for testing");

            // Use the static convenience method to start streaming (callback already registered)
            RtmpStreamingService.startStreaming(
                    context,
                    "rtmp://10.0.0.22/s/streamKey"
            );

            Log.d(TAG, "RTMP streaming initialization complete");
        } catch (Exception e) {
            Log.e(TAG, "Error starting RTMP streaming service", e);
        }
    }
    
    @Override
    public void stopRtmpStreaming() {
        try {
            EventBus.getDefault().post(new StreamingCommand.Stop());
            RtmpStreamingService.stopStreaming(context);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping RTMP streaming", e);
        }
    }
    
    @Override
    public void sendRtmpStatusResponse(boolean success, String status, String details) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "rtmp_status");
                response.put("success", success);
                response.put("status", status);
                response.put("details", details);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending RTMP status response: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

            } catch (JSONException e) {
                Log.e(TAG, "Error creating RTMP status response", e);
            }
        } else {
            Log.w(TAG, "Cannot send RTMP status response - not connected to BLE device");
        }
    }
    
    @Override
    public void sendRtmpStatusResponse(boolean success, JSONObject statusObject) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "rtmp_status");
                response.put("success", success);
                response.put("data", statusObject);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending RTMP status response: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

            } catch (JSONException e) {
                Log.e(TAG, "Error creating RTMP status response", e);
            }
        } else {
            Log.w(TAG, "Cannot send RTMP status response - not connected to BLE device");
        }
    }
    
    @Override
    public void sendVideoRecordingStatusResponse(boolean success, String status, String details) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "video_recording_status");
                response.put("success", success);
                response.put("status", status);
                response.put("details", details);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending video recording status response: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

            } catch (JSONException e) {
                Log.e(TAG, "Error creating video recording status response", e);
            }
        } else {
            Log.w(TAG, "Cannot send video recording status response - not connected to BLE device");
        }
    }
    
    @Override
    public void sendVideoRecordingStatusResponse(boolean success, JSONObject statusObject) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "video_recording_status");
                response.put("success", success);
                response.put("data", statusObject);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending video recording status response: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

            } catch (JSONException e) {
                Log.e(TAG, "Error creating video recording status response", e);
            }
        } else {
            Log.w(TAG, "Cannot send video recording status response - not connected to BLE device");
        }
    }
    
    @Override
    public StreamingStatusCallback getStreamingStatusCallback() {
        return streamingStatusCallback;
    }
    
    @Override
    public void sendKeepAliveAck(String streamId, String ackId) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "keep_alive_ack");
                response.put("streamId", streamId);
                response.put("ackId", ackId);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending keep-alive ACK: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

            } catch (JSONException e) {
                Log.e(TAG, "Error creating keep-alive ACK response", e);
            }
        } else {
            Log.w(TAG, "Cannot send keep-alive ACK - not connected to BLE device");
        }
    }
    
    /**
     * Create streaming status callback
     */
    private StreamingStatusCallback createStreamingStatusCallback() {
        return new StreamingStatusCallback() {
            @Override
            public void onStreamStarting(String rtmpUrl) {
                Log.d(TAG, "RTMP Stream starting to: " + rtmpUrl);

                try {
                    JSONObject status = new JSONObject();
                    status.put("type", "rtmp_stream_status");
                    status.put("status", "initializing");
                    String streamId = RtmpStreamingService.getCurrentStreamId();
                    if (streamId != null && !streamId.isEmpty()) {
                        status.put("streamId", streamId);
                    }
                    sendRtmpStatusResponse(true, status);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating RTMP initializing status", e);
                }
            }

            @Override
            public void onStreamStarted(String rtmpUrl) {
                Log.d(TAG, "RTMP Stream successfully started to: " + rtmpUrl);

                try {
                    JSONObject status = new JSONObject();
                    status.put("type", "rtmp_stream_status");
                    status.put("status", "streaming");
                    status.put("rtmpUrl", rtmpUrl);
                    String streamId = RtmpStreamingService.getCurrentStreamId();
                    if (streamId != null && !streamId.isEmpty()) {
                        status.put("streamId", streamId);
                    }

                    JSONObject stats = new JSONObject();
                    stats.put("bitrate", 1500000);
                    stats.put("fps", 30);
                    stats.put("droppedFrames", 0);
                    status.put("stats", stats);

                    sendRtmpStatusResponse(true, status);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating RTMP started status", e);
                }
            }

            @Override
            public void onStreamStopped() {
                Log.d(TAG, "RTMP Stream stopped");

                try {
                    JSONObject status = new JSONObject();
                    status.put("type", "rtmp_stream_status");
                    status.put("status", "stopped");
                    status.put("timestamp", System.currentTimeMillis());

                    sendRtmpStatusResponse(true, status);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating RTMP stopped status", e);
                }
            }

            @Override
            public void onReconnecting(int attempt, int maxAttempts, String reason) {
                Log.d(TAG, "RTMP Stream reconnecting: attempt " + attempt + "/" + maxAttempts + " - " + reason);

                try {
                    JSONObject status = new JSONObject();
                    status.put("type", "rtmp_stream_status");
                    status.put("status", "reconnecting");
                    status.put("attempt", attempt);
                    status.put("maxAttempts", maxAttempts);
                    status.put("reason", reason);
                    status.put("timestamp", System.currentTimeMillis());

                    sendRtmpStatusResponse(true, status);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating RTMP reconnecting status", e);
                }
            }

            @Override
            public void onReconnected(String rtmpUrl, int attempt) {
                Log.d(TAG, "RTMP Stream reconnected to: " + rtmpUrl + " on attempt " + attempt);

                try {
                    JSONObject status = new JSONObject();
                    status.put("type", "rtmp_stream_status");
                    status.put("status", "reconnected");
                    status.put("rtmpUrl", rtmpUrl);
                    status.put("attempt", attempt);
                    status.put("timestamp", System.currentTimeMillis());

                    sendRtmpStatusResponse(true, status);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating RTMP reconnected status", e);
                }
            }

            @Override
            public void onReconnectFailed(int maxAttempts) {
                Log.d(TAG, "RTMP Stream reconnect failed after " + maxAttempts + " attempts");

                try {
                    JSONObject status = new JSONObject();
                    status.put("type", "rtmp_stream_status");
                    status.put("status", "reconnect_failed");
                    status.put("maxAttempts", maxAttempts);
                    status.put("timestamp", System.currentTimeMillis());

                    sendRtmpStatusResponse(false, status);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating RTMP reconnect failed status", e);
                }
            }

            @Override
            public void onStreamError(String error) {
                Log.e(TAG, "RTMP Stream error: " + error);

                try {
                    JSONObject status = new JSONObject();
                    status.put("type", "rtmp_stream_status");
                    status.put("status", "error");
                    status.put("error", error);
                    status.put("timestamp", System.currentTimeMillis());

                    sendRtmpStatusResponse(false, status);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating RTMP error status", e);
                }
            }
        };
    }
} 