package com.augmentos.augmentos_core.augmentos_backend;

import com.augmentos.augmentos_core.enums.SpeechRequiredDataType;
import org.json.JSONObject;

import java.util.List;

public interface ServerCommsCallback {
    void onConnectionAck();
    void onAppStateChange(List<ThirdPartyCloudApp> appList);
    void onDisplayEvent(JSONObject displayData);
    void onDashboardDisplayEvent(JSONObject dashboardDisplayData);
    void onConnectionError(String errorMsg);
    void onAuthError();
    void onConnectionStatusChange(WebSocketManager.IncomingMessageHandler.WebSocketStatus status);
    void onRequestSingle(String dataType);
    void onMicrophoneStateChange(boolean isEnabled, List<SpeechRequiredDataType> requiredData, boolean bypassVad);

    /**
     * Called when the server requests a photo to be taken
     *
     * @param requestId Unique ID for this photo request
     * @param appId ID of the app requesting the photo
     * @param webhookUrl The webhook URL associated with the photo request
     */
    void onPhotoRequest(String requestId, String appId, String webhookUrl);

    /**
     * Called when the server requests an RTMP stream
     *
     * @param message The complete RTMP stream request message with all parameters
     */
    void onRtmpStreamStartRequest(JSONObject message);

    /**
     * Called when the server requests to stop an RTMP stream
     *
     */
    void onRtmpStreamStop();

    /**
     * Called when the server sends a keep alive message for an RTMP stream
     *
     * @param message The keep alive message with streamId, ackId, and timestamp
     */
    void onRtmpStreamKeepAlive(JSONObject message);

    // New methods for explicit app started/stopped events
    void onAppStarted(String packageName);
    void onAppStopped(String packageName);
    void onSettingsUpdate(JSONObject settings);

    // Location Service Commands
    void onSetLocationTier(String tier);
    void onRequestSingleLocation(String accuracy, String correlationId);

    /**
     * Called when the server requests audio to be played
     *
     * @param audioRequest The audio play request message with parameters
     */
    void onAudioPlayRequest(JSONObject audioRequest);

    /**
     * Called when the server requests to start buffer recording
     */
    void onStartBufferRecording();

    /**
     * Called when the server requests to stop buffer recording
     */
    void onStopBufferRecording();

    /**
     * Called when the server requests to save buffer video
     *
     * @param requestId Unique ID for this save request
     * @param durationSeconds Number of seconds to save from buffer (1-30)
     */
    void onSaveBufferVideo(String requestId, int durationSeconds);

    /**
     * Called when the server requests to start video recording
     *
     * @param requestId Unique ID for this recording
     * @param save Whether to save the video to storage
     */
    void onStartVideoRecording(String requestId, boolean save);

    /**
     * Called when the server requests to stop video recording
     *
     * @param requestId The request ID of the recording to stop
     */
    void onStopVideoRecording(String requestId);

    /**
     * Called when the server requests audio playback to be stopped
     *
     * @param audioStopRequest The audio stop request message with parameters
     */
    void onAudioStopRequest(JSONObject audioStopRequest);
}
