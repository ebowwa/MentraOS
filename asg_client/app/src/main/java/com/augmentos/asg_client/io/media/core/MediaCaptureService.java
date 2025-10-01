package com.augmentos.asg_client.io.media.core;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.preference.PreferenceManager;

import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.file.core.FileManagerFactory;
import com.augmentos.augmentos_core.utils.ServerConfigUtil;
import com.augmentos.asg_client.io.media.upload.MediaUploadService;
import com.augmentos.asg_client.io.media.managers.MediaUploadQueueManager;
import com.augmentos.asg_client.io.media.interfaces.ServiceCallbackInterface;
import com.augmentos.asg_client.camera.CameraNeo;
import com.augmentos.asg_client.settings.VideoSettings;
import com.augmentos.asg_client.io.hardware.interfaces.IHardwareManager;
import com.augmentos.asg_client.io.hardware.core.HardwareManagerFactory;
import com.augmentos.asg_client.io.streaming.services.RtmpStreamingService;
import com.augmentos.asg_client.audio.AudioAssets;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import com.radzivon.bartoshyk.avif.coder.HeifCoder;
import com.radzivon.bartoshyk.avif.coder.PreciseMode;

/**
 * Service that handles media capturing (photo and video) and uploading functionality.
 * Replaces PhotoCaptureService to support both photos and videos.
 */
public class MediaCaptureService {
    private static final String TAG = "MediaCaptureService";

    private final Context mContext;
    private final MediaUploadQueueManager mMediaQueueManager;
    private MediaCaptureListener mMediaCaptureListener;
    private ServiceCallbackInterface mServiceCallback;
    private CircularVideoBuffer mVideoBuffer;
    private final IHardwareManager hardwareManager;

    // Track current video recording
    private boolean isRecordingVideo = false;
    private String currentVideoId = null;
    private String currentVideoPath = null;
    private long recordingStartTime = 0;
    private boolean currentVideoLedEnabled = false; // Track if LED was enabled for current recording

    // Default BLE params (used if size unspecified)
    public static final int bleImageTargetWidth = 480;
    public static final int bleImageTargetHeight = 480;
    public static final int bleImageAvifQuality = 40;

    private static class BleParams {
        final int targetWidth;
        final int targetHeight;
        final int avifQuality;
        final int jpegFallbackQuality;

        BleParams(int targetWidth, int targetHeight, int avifQuality, int jpegFallbackQuality) {
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            this.avifQuality = avifQuality;
            this.jpegFallbackQuality = jpegFallbackQuality;
        }
    }

    private BleParams resolveBleParams(String requestedSize) {
        // Conservative bandwidth for BLE; tune as needed
        switch (requestedSize) {
            case "small":
                return new BleParams(400, 400, 35, 25);
            case "large":
                return new BleParams(1024, 1024, 45, 40);
            case "medium":
            default:
                return new BleParams(720, 720, 42, 38);
        }
    }

    // Track which photos should be saved to gallery
    private Map<String, Boolean> photoSaveFlags = new HashMap<>();

    // Track BLE IDs for auto fallback mode
    private Map<String, String> photoBleIds = new HashMap<>();

    // Track original photo paths for BLE fallback
    private Map<String, String> photoOriginalPaths = new HashMap<>();
    // Track requested photo size per request for proper fallback handling
    private Map<String, String> photoRequestedSizes = new HashMap<>();
    private final FileManager fileManager;

    /**
     * Interface for listening to media capture and upload events
     */
    public interface MediaCaptureListener {
        // Photo events
        void onPhotoCapturing(String requestId);

        void onPhotoCaptured(String requestId, String filePath);

        void onPhotoUploading(String requestId);

        void onPhotoUploaded(String requestId, String url);

        // Video events
        void onVideoRecordingStarted(String requestId, String filePath);

        void onVideoRecordingStopped(String requestId, String filePath);

        void onVideoUploading(String requestId);

        void onVideoUploaded(String requestId, String url);

        // Common events
        void onMediaError(String requestId, String error, int mediaType);
    }

    /**
     * Constructor
     *
     * @param context           Application context
     * @param mediaQueueManager MediaUploadQueueManager instance
     */
    public MediaCaptureService(@NonNull Context context, @NonNull MediaUploadQueueManager mediaQueueManager, FileManager fileManager) {
        mContext = context.getApplicationContext();
        mMediaQueueManager = mediaQueueManager;
        this.fileManager = fileManager;
        
        // Initialize hardware manager
        hardwareManager = HardwareManagerFactory.getInstance(context);
        Log.d(TAG, "Hardware manager initialized: " + hardwareManager.getDeviceModel());
        
        // Initialize video buffer
        mVideoBuffer = new CircularVideoBuffer(context);
        mVideoBuffer.setCallback(new CircularVideoBuffer.BufferCallback() {
            @Override
            public void onBufferingStarted() {
                Log.d(TAG, "Video buffering started");
            }

            @Override
            public void onBufferingStopped() {
                Log.d(TAG, "Video buffering stopped");
            }

            @Override
            public void onSegmentRecorded(int segmentIndex, String filePath) {
                Log.d(TAG, "Buffer segment " + segmentIndex + " recorded: " + filePath);
            }

            @Override
            public void onBufferSaved(String outputPath, int durationSeconds) {
                Log.d(TAG, "Buffer saved: " + outputPath + " (" + durationSeconds + " seconds)");
                // Notify listener if needed
                if (mMediaCaptureListener != null) {
                    // Use a special ID for buffer saves
                    mMediaCaptureListener.onVideoUploaded("buffer_save", outputPath);
                }
                
                // Send gallery status update to phone after buffer video save
                sendGalleryStatusUpdate();
            }

            @Override
            public void onBufferError(String error) {
                Log.e(TAG, "Buffer error: " + error);
                // Turn off LED on buffer error
                hardwareManager.setRecordingLedOff();
                Log.d(TAG, "Recording LED turned OFF (buffer error)");
                if (mMediaCaptureListener != null) {
                    mMediaCaptureListener.onMediaError("buffer", error, MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
                }
            }
        });
    }

    /**
     * Set a listener for media capture events
     */
    public void setMediaCaptureListener(MediaCaptureListener listener) {
        this.mMediaCaptureListener = listener;
    }

    /**
     * Set the service callback for communication with AsgClientService
     */
    public void setServiceCallback(ServiceCallbackInterface callback) {
        this.mServiceCallback = callback;
    }

    private void playShutterSound() {
        if (hardwareManager != null && hardwareManager.supportsAudioPlayback()) {
            hardwareManager.playAudioAsset(AudioAssets.CAMERA_SOUND);
        }
    }

    private void playVideoStartSound() {
        if (hardwareManager != null && hardwareManager.supportsAudioPlayback()) {
            hardwareManager.playAudioAsset(AudioAssets.VIDEO_RECORDING_START);
        }
    }

    private void playVideoStopSound() {
        if (hardwareManager != null && hardwareManager.supportsAudioPlayback()) {
            hardwareManager.playAudioAsset(AudioAssets.VIDEO_RECORDING_STOP);
        }
    }
    
    /**
     * Start video recording with specific settings
     * @param settings Video settings (resolution, fps)
     * @param enableLed Whether to enable recording LED
     */
    public void startVideoRecording(VideoSettings settings, boolean enableLed) {
        if (isRecordingVideo) {
            Log.d(TAG, "Stopping video recording");
            stopVideoRecording();
        } else {
            Log.d(TAG, "Starting video recording with settings: " + settings);
            // Generate IDs for local recording
            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
            int randomSuffix = (int)(Math.random() * 1000);
            String requestId = "local_video_" + timeStamp + "_" + randomSuffix;
            String videoFilePath = fileManager.getDefaultMediaDirectory() + File.separator + "VID_" + timeStamp + "_" + randomSuffix + ".mp4";
            startVideoRecording(videoFilePath, requestId, settings, enableLed);
        }
    }

    /**
     * Handle start video recording command from phone
     * Similar to takePhotoAndUpload but for video
     * @param requestId Unique request ID for tracking
     * @param save Whether to keep the video on device after upload
     */
    public void handleStartVideoCommand(String requestId, boolean save, boolean enableLed) {
        handleStartVideoCommand(requestId, save, null, enableLed);
    }
    
    /**
     * Handle start video recording command from phone with settings
     * @param requestId Unique request ID for tracking
     * @param save Whether to keep the video on device after upload
     * @param settings Video settings (resolution, fps) or null for defaults
     */
    public void handleStartVideoCommand(String requestId, boolean save, VideoSettings settings, boolean enableLed) {
        // Check if already recording
        if (isRecordingVideo) {
            Log.w(TAG, "Already recording video, ignoring start command");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Already recording", MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }
            return;
        }

                            // Generate filename with requestId
                            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
                            int randomSuffix = (int)(Math.random() * 1000);
                            String videoFilePath = fileManager.getDefaultMediaDirectory() + File.separator + "VID_" + timeStamp + "_" + randomSuffix + "_" + requestId + ".mp4";

        // Start video recording with the provided requestId
        startVideoRecording(videoFilePath, requestId, enableLed);
    }

    /**
     * Handle stop video recording command from phone
     * @param requestId Request ID of the video to stop (must match current recording)
     */
    public void handleStopVideoCommand(String requestId) {
        if (!isRecordingVideo) {
            Log.w(TAG, "No video recording to stop");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Not recording", MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }
            return;
        }

        // Verify the requestId matches current recording
        if (!requestId.equals(currentVideoId)) {
            Log.w(TAG, "Stop command requestId doesn't match current recording");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Request ID mismatch", MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }
            return;
        }

        stopVideoRecording();
    }

    /**
     * Start video recording locally with auto-generated IDs
     */
    private void startVideoRecording() {
        // Generate IDs for local recording
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
        int randomSuffix = (int)(Math.random() * 1000);
        String requestId = "local_video_" + timeStamp + "_" + randomSuffix;
        String videoFilePath = fileManager.getDefaultMediaDirectory() + File.separator + "VID_" + timeStamp + "_" + randomSuffix + ".mp4";

        startVideoRecording(videoFilePath, requestId, false);
    }

    /**
     * Start video recording with specific parameters
     */
    private void startVideoRecording(String videoFilePath, String requestId, boolean enableLed) {
        startVideoRecording(videoFilePath, requestId, null, enableLed);
    }
    
    /**
     * Start video recording with specific parameters and settings
     */
    private void startVideoRecording(String videoFilePath, String requestId, VideoSettings settings, boolean enableLed) {
        // Check if RTMP streaming is active - videos cannot interrupt streams
        if (RtmpStreamingService.isStreaming()) {
            Log.e(TAG, "Cannot start video - RTMP streaming active");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Camera busy with streaming", 
                    MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }
            return;
        }
        
        // Check if camera is actively in use (this will return false for kept-alive idle camera)
        if (CameraNeo.isCameraInUse()) {
            Log.e(TAG, "Cannot start video - camera actively in use");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Camera busy", 
                    MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }
            return;
        }
        
        // Check storage availability before recording
        if (!isExternalStorageAvailable()) {
            Log.e(TAG, "External storage is not available for video capture");
            return;
        }

        // Close kept-alive camera if it exists to free resources for video recording
        CameraNeo.closeKeptAliveCamera();

        // Save info for the current recording session
        currentVideoId = requestId;
        currentVideoPath = videoFilePath;
        currentVideoLedEnabled = enableLed; // Track LED state for this recording

        try {
            // Play video start sound
            playVideoStartSound();

            // Start video recording using CameraNeo
            CameraNeo.startVideoRecording(mContext, requestId, videoFilePath, settings, new CameraNeo.VideoRecordingCallback() {
                @Override
                public void onRecordingStarted(String videoId) {
                    Log.d(TAG, "Video recording started with ID: " + videoId);
                    isRecordingVideo = true;
                    recordingStartTime = System.currentTimeMillis();
                    
                    // Turn on recording LED if enabled
                    if (enableLed && hardwareManager.supportsRecordingLed()) {
                        hardwareManager.setRecordingLedOn();
                        Log.d(TAG, "Recording LED turned ON");
                    }

                    // Notify listener
                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onVideoRecordingStarted(requestId, videoFilePath);
                    }
                }

                @Override
                public void onRecordingStopped(String videoId, String filePath) {
                    Log.d(TAG, "Video recording stopped: " + videoId + ", file: " + filePath);
                    isRecordingVideo = false;
                    
                    // Turn off recording LED if it was enabled
                    if (enableLed && hardwareManager.supportsRecordingLed()) {
                        hardwareManager.setRecordingLedOff();
                        Log.d(TAG, "Recording LED turned OFF");
                    }

                    // Notify listener
                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onVideoRecordingStopped(requestId, filePath);
                    }

                    // Send gallery status update to phone after video recording
                    sendGalleryStatusUpdate();

                    // Call upload stub (which just logs for now)
                    uploadVideo(filePath, requestId);

                    // Reset state
                    currentVideoId = null;
                    currentVideoPath = null;
                }

                @Override
                public void onRecordingError(String videoId, String errorMessage) {
                    Log.e(TAG, "Video recording error: " + videoId + ", error: " + errorMessage);
                    isRecordingVideo = false;
                    
                    // Turn off recording LED on error if it was enabled
                    if (enableLed && hardwareManager.supportsRecordingLed()) {
                        hardwareManager.setRecordingLedOff();
                        Log.d(TAG, "Recording LED turned OFF (due to error)");
                    }

                    // Notify listener
                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onMediaError(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
                    }

                    // Reset state
                    currentVideoId = null;
                    currentVideoPath = null;
                }

                @Override
                public void onRecordingProgress(String videoId, long durationMs) {
                    // Optional: Track recording duration if needed
                    // Not notifying the listener for this event as it would be too noisy
                    Log.v(TAG, "Video recording progress: " + videoId + ", duration: " + durationMs + "ms");
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error starting video recording", e);

            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Error starting video: " + e.getMessage(),
                        MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }

            // Reset state on error
            currentVideoId = null;
            currentVideoPath = null;
        }
    }

    /**
     * Stop the current video recording
     */
    public void stopVideoRecording() {
        if (!isRecordingVideo || currentVideoId == null) {
            Log.d(TAG, "No active video recording to stop");
            return;
        }

        try {
            // Play video stop sound
            playVideoStopSound();

            // Stop the recording via CameraNeo
            CameraNeo.stopVideoRecording(mContext, currentVideoId);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping video recording", e);

            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(currentVideoId, "Error stopping video: " + e.getMessage(),
                        MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }

            // Reset state in case of error
            isRecordingVideo = false;
            currentVideoId = null;
            currentVideoPath = null;
            
            // Ensure LED is turned off even if stop fails (if it was enabled)
            if (currentVideoLedEnabled && hardwareManager.supportsRecordingLed()) {
                hardwareManager.setRecordingLedOff();
                Log.d(TAG, "Recording LED turned OFF (stop error recovery)");
            }
        }
    }

    /**
     * Check if currently recording video
     */
    public boolean isRecordingVideo() {
        return isRecordingVideo;
    }

    /**
     * Get the current recording duration in milliseconds
     * @return Duration in milliseconds, or 0 if not recording
     */
    public long getRecordingDurationMs() {
        if (!isRecordingVideo || recordingStartTime == 0) {
            return 0;
        }

        return System.currentTimeMillis() - recordingStartTime;
    }

    /**
     * Start buffer recording - continuously records last 30 seconds
     */
    public void startBufferRecording() {
        // Check if camera is already in use
        if (CameraNeo.isCameraInUse()) {
            Log.w(TAG, "Cannot start buffer recording - camera is in use");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError("buffer", "Camera is busy", MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
            }
            return;
        }
        
        // Close kept-alive camera if it exists to free resources for buffer recording
        CameraNeo.closeKeptAliveCamera();

        Log.d(TAG, "Starting buffer recording via CameraNeo");

        // Use CameraNeo's buffer mode instead of local CircularVideoBuffer
        CameraNeo.startBufferRecording(mContext, new CameraNeo.BufferCallback() {
            @Override
            public void onBufferStarted() {
                Log.d(TAG, "Buffer recording started");
                // Start blinking LED for buffer recording mode
                hardwareManager.setRecordingLedBlinking(1000, 2000); // On for 1s, off for 2s
                Log.d(TAG, "Recording LED set to BLINKING mode (buffer recording)");
            }

            @Override
            public void onBufferStopped() {
                Log.d(TAG, "Buffer recording stopped");
                // Turn off LED when buffer recording stops
                hardwareManager.setRecordingLedOff();
                Log.d(TAG, "Recording LED turned OFF (buffer stopped)");
            }

            @Override
            public void onBufferSaved(String filePath, int durationSeconds) {
                Log.d(TAG, "Buffer saved: " + filePath + " (" + durationSeconds + " seconds)");
                if (mMediaCaptureListener != null) {
                    mMediaCaptureListener.onVideoUploaded("buffer_save", filePath);
                }
            }

            @Override
            public void onBufferError(String error) {
                Log.e(TAG, "Buffer error: " + error);
                // Turn off LED on buffer error
                hardwareManager.setRecordingLedOff();
                Log.d(TAG, "Recording LED turned OFF (buffer error)");
                if (mMediaCaptureListener != null) {
                    mMediaCaptureListener.onMediaError("buffer", error, MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
                }
            }
        });
    }

    /**
     * Stop buffer recording
     */
    public void stopBufferRecording() {
        Log.d(TAG, "Stopping buffer recording via CameraNeo");
        CameraNeo.stopBufferRecording(mContext);
        // Ensure LED is turned off when manually stopping buffer
        hardwareManager.setRecordingLedOff();
        Log.d(TAG, "Recording LED turned OFF (manual buffer stop)");
    }

    /**
     * Save the last N seconds from buffer
     * @param secondsToSave Number of seconds to save (max 30)
     * @param requestId Request ID for tracking
     */
    public void saveBufferVideo(int secondsToSave, String requestId) {
        Log.d(TAG, "Saving last " + secondsToSave + " seconds of buffer, requestId: " + requestId);
        CameraNeo.saveBufferVideo(mContext, secondsToSave, requestId);
    }

    /**
     * Get buffer recording status
     * Note: This would need to be implemented via a callback or service binding
     * For now, returning a basic status
     */
    public JSONObject getBufferStatus() {
        JSONObject status = new JSONObject();
        try {
            // Basic status - would need proper implementation with CameraNeo
            status.put("isBuffering", false); // Would need to track this
            status.put("availableDuration", 0);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating buffer status", e);
        }
        return status;
    }

    /**
     * Check if buffer is currently recording
     */
    public boolean isBuffering() {
        return CameraNeo.isInBufferMode();
    }

    /**
     * Takes a photo locally when offline or when server communication fails
     * Uses default medium size
     */
    public void takePhotoLocally() {
        takePhotoLocally("medium", false);
    }
    
    /**
     * Takes a photo locally with specified size
     * @param size Photo size ("small", "medium", or "large")
     * @param enableLed Whether to enable camera LED flash
     */
    public void takePhotoLocally(String size, boolean enableLed) {
        // Check if RTMP streaming is active - photos cannot interrupt streams
        if (RtmpStreamingService.isStreaming()) {
            Log.e(TAG, "Cannot take photo - RTMP streaming active");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError("local", "Camera busy with streaming", 
                    MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
            }
            return;
        }
        
        // Check if video recording is active - photos cannot interrupt video recording
        if (isRecordingVideo) {
            Log.e(TAG, "Cannot take photo - video recording in progress");
            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError("local", "Camera busy with video recording", 
                    MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
            }
            return;
        }
        
        // Note: No need to check CameraNeo.isCameraInUse() for photos
        // The camera's keep-alive system handles rapid photo taking gracefully
        
        // Check storage availability before taking photo
        if (!isExternalStorageAvailable()) {
            Log.e(TAG, "External storage is not available for photo capture");
            return;
        }

        // Add milliseconds and a random component to ensure uniqueness even in rapid capture
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(new Date());
        int randomSuffix = (int)(Math.random() * 1000);

        String photoFilePath = fileManager.getDefaultMediaDirectory() + File.separator + "IMG_" + timeStamp + "_" + randomSuffix + ".jpg";

        Log.d(TAG, "Taking photo locally at: " + photoFilePath + " with size: " + size + ", LED: " + enableLed);

        // Generate a temporary requestId
        String requestId = "local_" + timeStamp;

        playShutterSound();

        // LED control is now handled by CameraNeo tied to camera lifecycle
        // This prevents LED flickering during rapid photo capture

        // Use the new enqueuePhotoRequest for thread-safe rapid capture
        CameraNeo.enqueuePhotoRequest(
                mContext,
                photoFilePath,
                size,
                enableLed,
                new CameraNeo.PhotoCaptureCallback() {
                    @Override
                    public void onPhotoCaptured(String filePath) {
                        Log.d(TAG, "Offline photo captured successfully at: " + filePath);
                        
                        // LED is now managed by CameraNeo and will turn off when camera closes
                        
                        // Notify through standard capture listener if set up
                        if (mMediaCaptureListener != null) {
                            mMediaCaptureListener.onPhotoCaptured(requestId, filePath);
                            mMediaCaptureListener.onPhotoUploading(requestId);
                        }
                        
                        // Send gallery status update to phone after photo capture
                        sendGalleryStatusUpdate();
                    }

                    @Override
                    public void onPhotoError(String errorMessage) {
                        Log.e(TAG, "Failed to capture offline photo: " + errorMessage);

                        // LED is now managed by CameraNeo and will turn off when camera closes

                        if (mMediaCaptureListener != null) {
                            mMediaCaptureListener.onMediaError(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                        }
                    }
                }
        );
    }

    /**
     * Take a photo and upload it to the specified destination
     * @param photoFilePath Local path where photo will be saved
     * @param requestId Unique request ID for tracking
     * @param webhookUrl Optional webhook URL for direct upload to app
     * @param authToken Auth token for webhook authentication
     * @param save Whether to keep the photo on device after upload
     */
    public void takePhotoAndUpload(String photoFilePath, String requestId, String webhookUrl, String authToken, boolean save, String size, boolean enableLed) {
        // Store the save flag for this request
        photoSaveFlags.put(requestId, save);
        // Track requested size for potential fallbacks
        photoRequestedSizes.put(requestId, size);

        // Notify that we're about to take a photo
        if (mMediaCaptureListener != null) {
            mMediaCaptureListener.onPhotoCapturing(requestId);
        }

        // LED control is now handled by CameraNeo tied to camera lifecycle

        try {
            playShutterSound();

            // Use the new enqueuePhotoRequest for thread-safe rapid capture
            CameraNeo.enqueuePhotoRequest(
                    mContext,
                    photoFilePath,
                    size,
                    enableLed,
                    new CameraNeo.PhotoCaptureCallback() {
                        @Override
                        public void onPhotoCaptured(String filePath) {
                            Log.d(TAG, "Photo captured successfully at: " + filePath);

                            // LED is now managed by CameraNeo and will turn off when camera closes

                            // Notify that we've captured the photo
                            if (mMediaCaptureListener != null) {
                                mMediaCaptureListener.onPhotoCaptured(requestId, filePath);
                                mMediaCaptureListener.onPhotoUploading(requestId);
                            }

                            // Choose upload destination based on webhookUrl
                            if (webhookUrl != null && !webhookUrl.isEmpty()) {
                                // Upload directly to app webhook
                                uploadPhotoToWebhook(filePath, requestId, webhookUrl, authToken);
                            }
                        }

                        @Override
                        public void onPhotoError(String errorMessage) {
                            Log.e(TAG, "Failed to capture photo: " + errorMessage);
                            
                            // LED is now managed by CameraNeo and will turn off when camera closes
                            
                            sendMediaErrorResponse(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);

                            if (mMediaCaptureListener != null) {
                                mMediaCaptureListener.onMediaError(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                            }
                        }
                    }
            );
        } catch (Exception e) {
            Log.e(TAG, "Error taking photo", e);
            sendMediaErrorResponse(requestId, "Error taking photo: " + e.getMessage(), MediaUploadQueueManager.MEDIA_TYPE_PHOTO);

            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Error taking photo: " + e.getMessage(),
                        MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
            }
        }
    }

    /**
     * Upload photo directly to app webhook
     */
    private void uploadPhotoToWebhook(String photoFilePath, String requestId, String webhookUrl, String authToken) {
        // Create a new thread for the upload
        new Thread(() -> {
            try {
                File photoFile = new File(photoFilePath);
                if (!photoFile.exists()) {
                    Log.e(TAG, "Photo file does not exist: " + photoFilePath);
                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onMediaError(requestId, "Photo file not found", MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                    }
                    return;
                }

                Log.d(TAG, "### Sending photo request");

                // Create multipart form request with smarter timeouts:
                // - 1 second to connect (fails fast if no internet)
                // - 10 seconds to write the photo data
                // - 5 seconds to read the response
                OkHttpClient client = new OkHttpClient.Builder()
                        .connectTimeout(1, java.util.concurrent.TimeUnit.SECONDS)  // Fast fail if no internet
                        .writeTimeout(10, java.util.concurrent.TimeUnit.SECONDS)   // Time to upload photo data
                        .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)     // Time to get response
                        .build();

                RequestBody fileBody = RequestBody.create(okhttp3.MediaType.parse("image/jpeg"), photoFile);
                RequestBody requestBody = new MultipartBody.Builder()
                        .setType(MultipartBody.FORM)
                        .addFormDataPart("photo", photoFile.getName(), fileBody)
                        .addFormDataPart("requestId", requestId)
                        .addFormDataPart("type", "photo_upload")
                        .build();

                // Build request with optional Authorization header
                Request.Builder requestBuilder = new Request.Builder()
                        .url(webhookUrl)
                        .post(requestBody);

                // Add Authorization header if auth token is available
                if (authToken != null && !authToken.isEmpty()) {
                    requestBuilder.header("Authorization", "Bearer " + authToken);
                    Log.d(TAG, "📡 Adding Authorization header to webhook request for: " + requestId);
                } else {
                    Log.d(TAG, "📡 No auth token available for webhook request: " + requestId);
                }

                Request request = requestBuilder.build();

                Response response = client.newCall(request).execute();

                if (response.isSuccessful()) {
                    String responseBody = response.body() != null ? response.body().string() : "";
                    Log.d(TAG, "Photo uploaded successfully to webhook: " + webhookUrl);
                    Log.d(TAG, "Response: " + responseBody);

                    // Check if we should save the photo
                    Boolean save = photoSaveFlags.get(requestId);
                    if (save == null || !save) {
                        // Delete the photo file to save storage
                        try {
                            if (photoFile.delete()) {
                                Log.d(TAG, "🗑️ Deleted photo file after successful webhook upload: " + photoFilePath);
                            } else {
                                Log.w(TAG, "Failed to delete photo file: " + photoFilePath);
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error deleting photo file after webhook upload", e);
                        }
                    } else {
                        Log.d(TAG, "💾 Keeping photo file as requested: " + photoFilePath);
                    }

                    // Clean up the flag
                    photoSaveFlags.remove(requestId);
                    photoRequestedSizes.remove(requestId);

                    // Notify success
                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onPhotoUploaded(requestId, webhookUrl);
                    }
                } else {
                    String errorMessage = "Upload failed with status: " + response.code();
                    Log.e(TAG, errorMessage + " to webhook: " + webhookUrl);

                    // Check if we can fallback to BLE
                    String bleImgId = photoBleIds.get(requestId);
                    if (bleImgId != null) {
                        Log.d(TAG, "📱 Webhook upload failed, attempting BLE fallback for " + requestId);

                        // Clean up tracking (will be re-added by BLE transfer)
                        photoBleIds.remove(requestId);
                        photoOriginalPaths.remove(requestId);

                        // Trigger BLE fallback - reuse the existing photo instead of taking a new one
                        boolean shouldSave = Boolean.TRUE.equals(photoSaveFlags.get(requestId));
                        String requestedSize = photoRequestedSizes.get(requestId);
                        if (requestedSize == null || requestedSize.isEmpty()) requestedSize = "medium";
                        // Reuse the existing photo file that was already captured
                        Log.d(TAG, "♻️ Reusing existing photo for BLE transfer: " + photoFilePath);
                        reusePhotoForBleTransfer(photoFilePath, requestId, bleImgId, shouldSave, requestedSize);
                        return; // Exit early - BLE transfer will handle cleanup
                    }

                    // No BLE fallback available
                    // Check if we should save the photo
                    Boolean save = photoSaveFlags.get(requestId);
                    if (save == null || !save) {
                        // Delete the photo file on failure
                        try {
                            if (photoFile.delete()) {
                                Log.d(TAG, "🗑️ Deleted photo file after failed webhook upload: " + photoFilePath);
                            } else {
                                Log.w(TAG, "Failed to delete photo file: " + photoFilePath);
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error deleting photo file after failed webhook upload", e);
                        }
                    } else {
                        Log.d(TAG, "💾 Keeping photo file despite failed upload as requested: " + photoFilePath);
                    }

                    // Clean up tracking
                    photoSaveFlags.remove(requestId);
                    photoBleIds.remove(requestId);
                    photoOriginalPaths.remove(requestId);
                    photoRequestedSizes.remove(requestId);

                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onMediaError(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                    }
                }

                response.close();

            } catch (Exception e) {
                Log.e(TAG, "Error uploading photo to webhook: " + webhookUrl, e);

                // Check if we can fallback to BLE on exception
                String bleImgId = photoBleIds.get(requestId);
                if (bleImgId != null) {
                    Log.d(TAG, "📱 Webhook upload exception, attempting BLE fallback for " + requestId);

                    // Clean up tracking (will be re-added by BLE transfer)
                    photoBleIds.remove(requestId);
                    photoOriginalPaths.remove(requestId);

                    // Trigger BLE fallback - reuse the existing photo instead of taking a new one
                    boolean shouldSaveFallback1 = Boolean.TRUE.equals(photoSaveFlags.get(requestId));
                    String requestedSizeFallback1 = photoRequestedSizes.get(requestId);
                    if (requestedSizeFallback1 == null || requestedSizeFallback1.isEmpty()) requestedSizeFallback1 = "medium";
                    // Reuse the existing photo file that was already captured
                    Log.d(TAG, "♻️ Reusing existing photo for BLE transfer: " + photoFilePath);
                    reusePhotoForBleTransfer(photoFilePath, requestId, bleImgId, shouldSaveFallback1, requestedSizeFallback1);
                    return; // Exit early - BLE transfer will handle cleanup
                }

                // No BLE fallback available
                // Check if we should save the photo on exception
                Boolean save = photoSaveFlags.get(requestId);
                if (save == null || !save) {
                    // Delete the photo file on exception
                    try {
                        File photoFile = new File(photoFilePath);
                        if (photoFile.exists() && photoFile.delete()) {
                            Log.d(TAG, "🗑️ Deleted photo file after webhook upload exception: " + photoFilePath);
                        } else {
                            Log.w(TAG, "Failed to delete photo file: " + photoFilePath);
                        }
                    } catch (Exception deleteEx) {
                        Log.e(TAG, "Error deleting photo file after webhook upload exception", deleteEx);
                    }
                } else {
                    Log.d(TAG, "💾 Keeping photo file despite upload exception as requested: " + photoFilePath);
                }

                // Clean up tracking
                photoSaveFlags.remove(requestId);
                photoBleIds.remove(requestId);
                photoOriginalPaths.remove(requestId);
                photoRequestedSizes.remove(requestId);
                

                if (mMediaCaptureListener != null) {
                    mMediaCaptureListener.onMediaError(requestId, "Upload error: " + e.getMessage(), MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                }
            }
        }).start();
    }


    /**
     * Upload a video file to AugmentOS Cloud
     * Currently a stub - videos are kept on device
     */
    public void uploadVideo(String videoFilePath, String requestId) {
        Log.d(TAG, "Video upload not implemented yet. Video saved locally: " + videoFilePath);
        // TODO: Implement WiFi upload when needed
        // For now, videos remain on device

        if (mMediaCaptureListener != null) {
            // Notify that video is "uploaded" (actually just saved locally)
            mMediaCaptureListener.onVideoUploaded(requestId, videoFilePath);
        }
    }

    /**
     * Upload media to AugmentOS Cloud
     */
    private void uploadMediaToCloud(String mediaFilePath, String requestId, int mediaType) {
        // First save the media to device gallery
        saveMediaToGallery(mediaFilePath, mediaType);

        // Upload the media to AugmentOS Cloud
        MediaUploadService.uploadMedia(
                mContext,
                mediaFilePath,
                requestId,
                mediaType,
                new MediaUploadService.UploadCallback() {
                    @Override
                    public void onSuccess(String url) {
                        String mediaTypeStr = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                        Log.d(TAG, mediaTypeStr + " uploaded successfully: " + url);
                        sendMediaSuccessResponse(requestId, url, mediaType);

                        // Check if we should save the photo
                        Boolean save = photoSaveFlags.get(requestId);
                        if (save == null || !save) {
                            // Delete the original file to save storage
                            try {
                                File file = new File(mediaFilePath);
                                if (file.exists() && file.delete()) {
                                    Log.d(TAG, "🗑️ Deleted " + mediaTypeStr.toLowerCase() + " file after successful upload: " + mediaFilePath);
                                } else {
                                    Log.w(TAG, "Failed to delete " + mediaTypeStr.toLowerCase() + " file: " + mediaFilePath);
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Error deleting " + mediaTypeStr.toLowerCase() + " file after upload", e);
                            }
                        } else {
                            Log.d(TAG, "💾 Keeping " + mediaTypeStr.toLowerCase() + " file as requested: " + mediaFilePath);
                        }

                        // Clean up all tracking
                        photoSaveFlags.remove(requestId);
                        photoBleIds.remove(requestId);
                        photoOriginalPaths.remove(requestId);
    

                        // Notify listener about successful upload
                        if (mMediaCaptureListener != null) {
                            if (mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO) {
                                mMediaCaptureListener.onPhotoUploaded(requestId, url);
                            } else {
                                mMediaCaptureListener.onVideoUploaded(requestId, url);
                            }
                        }
                    }

                    @Override
                    public void onFailure(String errorMessage) {
                        String mediaTypeStr = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                        Log.e(TAG, mediaTypeStr + " upload failed: " + errorMessage);
                        sendMediaErrorResponse(requestId, errorMessage, mediaType);

                        // Check if we can fallback to BLE for photos
                        String bleImgId = photoBleIds.get(requestId);
                        if (mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO && bleImgId != null) {
                            Log.d(TAG, "📱 WiFi upload failed, attempting BLE fallback for " + requestId);

                            // Don't delete the photo yet - we need it for BLE
                            // Clean up tracking (will be re-added by BLE transfer)
                            photoBleIds.remove(requestId);
                            photoOriginalPaths.remove(requestId);

                            // Trigger BLE fallback - reuse the existing photo instead of taking a new one
                            boolean shouldSaveFallback2 = Boolean.TRUE.equals(photoSaveFlags.get(requestId));
                            String requestedSizeFallback2 = photoRequestedSizes.get(requestId);
                            if (requestedSizeFallback2 == null || requestedSizeFallback2.isEmpty()) requestedSizeFallback2 = "medium";
                            // Reuse the existing photo file that was already captured
                            Log.d(TAG, "♻️ Reusing existing photo for BLE transfer: " + mediaFilePath);
                            reusePhotoForBleTransfer(mediaFilePath, requestId, bleImgId, shouldSaveFallback2, requestedSizeFallback2);
                            return; // Exit early - BLE transfer will handle cleanup
                        }

                        // No BLE fallback available, handle as normal failure
                        // Check if we should save the photo
                        Boolean save = photoSaveFlags.get(requestId);
                        if (save == null || !save) {
                            // Delete the file even on failure to prevent storage buildup
                            try {
                                File file = new File(mediaFilePath);
                                if (file.exists() && file.delete()) {
                                    Log.d(TAG, "🗑️ Deleted " + mediaTypeStr.toLowerCase() + " file after failed upload: " + mediaFilePath);
                                } else {
                                    Log.w(TAG, "Failed to delete " + mediaTypeStr.toLowerCase() + " file: " + mediaFilePath);
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Error deleting " + mediaTypeStr.toLowerCase() + " file after failed upload", e);
                            }
                        } else {
                            Log.d(TAG, "💾 Keeping " + mediaTypeStr.toLowerCase() + " file despite failed upload as requested: " + mediaFilePath);
                        }

                        // Clean up tracking
                        photoSaveFlags.remove(requestId);
                        photoBleIds.remove(requestId);
                        photoOriginalPaths.remove(requestId);
    

                        // Notify listener about error
                        if (mMediaCaptureListener != null) {
                            mMediaCaptureListener.onMediaError(requestId, "Upload failed: " + errorMessage, mediaType);
                        }
                    }
                }
        );
    }

    /**
     * Save media to local app directory
     */
    private void saveMediaToGallery(String mediaFilePath, int mediaType) {
        try {
            // Create a File object from the path
            File mediaFile = new File(mediaFilePath);
            if (!mediaFile.exists()) {
                Log.e(TAG, "Media file does not exist: " + mediaFilePath);
                return;
            }

            // Get this class's directory
            String classDirectory = fileManager.getDefaultMediaDirectory() + File.separator + "MediaCaptureService";
            File directory = new File(classDirectory);
            if (!directory.exists()) {
                directory.mkdirs();
            }

            // Create destination file in the same directory as this class
            String fileName = mediaFile.getName();
            File destinationFile = new File(directory, fileName);

            // Copy the file
            try (FileInputStream in = new FileInputStream(mediaFile);
                 java.io.FileOutputStream out = new FileOutputStream(destinationFile)) {
                byte[] buf = new byte[8192];
                int len;
                while ((len = in.read(buf)) > 0) {
                    out.write(buf, 0, len);
                }
            }

            Log.d(TAG, "Media saved locally: " + destinationFile.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "Error saving media locally", e);
        }
    }

    /**
     * Send a success response for a media request
     * This should be overridden by the service that uses this class
     */
    protected void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
        // Default implementation is empty
        // This should be overridden by the service that uses this class
    }

    /**
     * Send an error response for a media request
     * This should be overridden by the service that uses this class
     */
    protected void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
        // Default implementation is empty
        // This should be overridden by the service that uses this class
    }

    /**
     * Check if external storage is available for read/write
     */
    private boolean isExternalStorageAvailable() {
        String state = android.os.Environment.getExternalStorageState();
        return android.os.Environment.MEDIA_MOUNTED.equals(state);
    }

    /**
     * Check if WiFi is connected
     */
    private boolean isWiFiConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) mContext.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo wifiInfo = cm.getNetworkInfo(ConnectivityManager.TYPE_WIFI);
            return wifiInfo != null && wifiInfo.isConnected();
        } catch (Exception e) {
            Log.e(TAG, "Error checking WiFi connectivity", e);
            return false;
        }
    }

    /**
     * Take a photo with auto transfer (WiFi with BLE fallback)
     * @param photoFilePath Path to save the original photo
     * @param requestId Request ID for tracking
     * @param webhookUrl Webhook URL for upload
     * @param bleImgId BLE image ID for fallback
     * @param save Whether to keep the photo on device
     */
    public void takePhotoAutoTransfer(String photoFilePath, String requestId, String webhookUrl, String authToken, String bleImgId, boolean save, String size, boolean enableLed) {
        // Store the save flag and BLE ID for this request
        photoSaveFlags.put(requestId, save);
        photoBleIds.put(requestId, bleImgId);
        photoOriginalPaths.put(requestId, photoFilePath);
        photoRequestedSizes.put(requestId, size);

        // Check WiFi connectivity
        if (isWiFiConnected()) {
            Log.d(TAG, "📶 WiFi connected, attempting direct upload for " + requestId);
            // Try WiFi upload (with automatic BLE fallback on failure)
            takePhotoAndUpload(photoFilePath, requestId, webhookUrl, authToken, save, size, enableLed);
        } else {
            Log.d(TAG, "📵 No WiFi connection, using BLE transfer for " + requestId);
            // No WiFi, go straight to BLE
            takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, save, size, enableLed);
        }
    }

    /**
     * Take a photo for BLE transfer with compression
     * @param photoFilePath Path to save the original photo
     * @param requestId Request ID for tracking
     * @param bleImgId BLE image ID to use as filename
     * @param save Whether to keep the original photo on device
     */
    public void takePhotoForBleTransfer(String photoFilePath, String requestId, String bleImgId, boolean save, String size, boolean enableLed) {
        // Store the save flag for this request
        photoSaveFlags.put(requestId, save);
        // Track requested size for BLE compression
        photoRequestedSizes.put(requestId, size);
        // Notify that we're about to take a photo
        if (mMediaCaptureListener != null) {
            mMediaCaptureListener.onPhotoCapturing(requestId);
        }

        // LED control is now handled by CameraNeo tied to camera lifecycle

        playShutterSound();

        try {
            // Use CameraNeo for photo capture
            CameraNeo.takePictureWithCallback(
                    mContext,
                    photoFilePath,
                    new CameraNeo.PhotoCaptureCallback() {
                        @Override
                        public void onPhotoCaptured(String filePath) {
                            Log.d(TAG, "Photo captured successfully for BLE transfer: " + filePath);

                            // LED is now managed by CameraNeo and will turn off when camera closes

                            // Notify that we've captured the photo
                            if (mMediaCaptureListener != null) {
                                mMediaCaptureListener.onPhotoCaptured(requestId, filePath);
                            }

                            // Compress and send via BLE
                            compressAndSendViaBle(filePath, requestId, bleImgId);
                        }

                        @Override
                        public void onPhotoError(String errorMessage) {
                            Log.e(TAG, "Failed to capture photo for BLE: " + errorMessage);
                            
                            // LED is now managed by CameraNeo and will turn off when camera closes
                            
                            sendMediaErrorResponse(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);

                            if (mMediaCaptureListener != null) {
                                mMediaCaptureListener.onMediaError(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                            }
                        }
                    },
                    size
            );
        } catch (Exception e) {
            Log.e(TAG, "Error taking photo for BLE", e);
            sendMediaErrorResponse(requestId, "Error taking photo: " + e.getMessage(), MediaUploadQueueManager.MEDIA_TYPE_PHOTO);

            if (mMediaCaptureListener != null) {
                mMediaCaptureListener.onMediaError(requestId, "Error taking photo: " + e.getMessage(),
                        MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
            }
        }
    }


    /**
     * Reuse existing photo for BLE transfer (when webhook fails)
     * This avoids taking a duplicate photo
     */
    private void reusePhotoForBleTransfer(String existingPhotoPath, String requestId, String bleImgId, boolean save, String size) {
        // Store the save flag for this request
        photoSaveFlags.put(requestId, save);
        // Track requested size for BLE compression
        photoRequestedSizes.put(requestId, size);
        
        Log.d(TAG, "♻️ Reusing existing photo for BLE transfer: " + existingPhotoPath);
        
        // Notify that we're using an existing photo
        if (mMediaCaptureListener != null) {
            mMediaCaptureListener.onPhotoCaptured(requestId, existingPhotoPath);
        }
        
        // Compress and send via BLE using the existing photo
        compressAndSendViaBle(existingPhotoPath, requestId, bleImgId);
    }

    /**
     * Compress photo and send via BLE
     */
    private void compressAndSendViaBle(String originalPath, String requestId, String bleImgId) {
        new Thread(() -> {
            long startTime = System.currentTimeMillis();
            Log.d(TAG, "🚀 BLE photo transfer started for " + bleImgId);

            try {
                // 1. Load original image
                android.graphics.Bitmap original = android.graphics.BitmapFactory.decodeFile(originalPath);
                if (original == null) {
                    throw new Exception("Failed to decode image file");
                }

                // 2. Resolve BLE resize and quality parameters based on requested size
                String requestedSize = photoRequestedSizes.get(requestId);
                if (requestedSize == null || requestedSize.isEmpty()) {
                    requestedSize = "medium";
                }

                BleParams bleParams = resolveBleParams(requestedSize);

                // Calculate new dimensions maintaining aspect ratio, constrained by requested target
                int targetWidth = bleParams.targetWidth;
                int targetHeight = bleParams.targetHeight;
                float aspectRatio = (float) original.getWidth() / original.getHeight();

                if (aspectRatio > targetWidth / (float) targetHeight) {
                    targetHeight = (int) (targetWidth / aspectRatio);
                } else {
                    targetWidth = (int) (targetHeight * aspectRatio);
                }

                // 3. Resize bitmap
                android.graphics.Bitmap resized = android.graphics.Bitmap.createScaledBitmap(original, targetWidth, targetHeight, true);
                original.recycle();

                // 4. Encode as AVIF with aggressive compression
                byte[] compressedData;
                try {
                    // Use avif-coder library for AVIF encoding
                    HeifCoder heifCoder = new HeifCoder();
                    compressedData = heifCoder.encodeAvif(
                        resized,
                            bleParams.avifQuality,  // quality (0-100)
                        PreciseMode.LOSSY   // Use FAST mode for reasonable compression speed
                    );
                    Log.d(TAG, "Successfully encoded as AVIF");
                } catch (Exception e) {
                    Log.w(TAG, "AVIF encoding failed, falling back to JPEG: " + e.getMessage());
                    // Fallback to JPEG if AVIF fails
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    resized.compress(android.graphics.Bitmap.CompressFormat.JPEG, bleParams.jpegFallbackQuality, baos);
                    compressedData = baos.toByteArray();
                }
                resized.recycle();

                long compressionTime = System.currentTimeMillis() - startTime;
                Log.d(TAG, "✅ Compressed photo for BLE: " + originalPath + " -> " + compressedData.length + " bytes");
                Log.d(TAG, "⏱️ Compression took: " + compressionTime + "ms");

                // 5. Save compressed data to temporary file with bleImgId as name
                // For BLE, we ALWAYS use AVIF (no extension in filename due to 16-char limit)
                String compressedPath = fileManager.getDefaultMediaDirectory() + "/" + bleImgId;
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(compressedPath)) {
                    fos.write(compressedData);
                }

                // 6. Send via BLE using K900BluetoothManager
                sendCompressedPhotoViaBle(compressedPath, bleImgId, requestId, startTime);

                // 7. Delete original photo if not saving to gallery
                Boolean save = photoSaveFlags.get(requestId);
                if (save == null || !save) {
                    try {
                        File originalFile = new File(originalPath);
                        if (originalFile.exists() && originalFile.delete()) {
                            Log.d(TAG, "🗑️ Deleted original photo after BLE compression: " + originalPath);
                        } else {
                            Log.w(TAG, "Failed to delete original photo: " + originalPath);
                        }
                    } catch (Exception deleteEx) {
                        Log.e(TAG, "Error deleting original photo after BLE compression", deleteEx);
                    }
                } else {
                    Log.d(TAG, "💾 Keeping original photo as requested: " + originalPath);
                }

                // Clean up the flag
                photoSaveFlags.remove(requestId);
            } catch (Exception e) {
                Log.e(TAG, "Error compressing photo for BLE", e);
                sendBleTransferError(requestId, e.getMessage());

                // Clean up flag on error too
                photoSaveFlags.remove(requestId);
            }
        }).start();
    }

    /**
     * Send compressed photo via BLE
     */
    private void sendCompressedPhotoViaBle(String compressedPath, String bleImgId, String requestId, long transferStartTime) {
        Log.d(TAG, "Ready to send compressed photo via BLE: " + compressedPath + " with ID: " + bleImgId);

        boolean transferStarted = false;
        try {
            if (mServiceCallback != null) {
                // CRITICAL: Check if BLE is busy BEFORE sending ANY data to BES2700
                if (mServiceCallback.isBleTransferInProgress()) {
                    Log.e(TAG, "❌ BLE transfer already in progress - NOT sending any data to avoid BES2700 overload");
                    sendBleTransferError(requestId, "BLE transfer busy - another transfer in progress");
                    return;
                }
                
                // BLE is available - send the ready message first (phone expects this for timing tracking)
                sendBlePhotoReadyMsg(compressedPath, bleImgId, requestId, transferStartTime);
                
                // Then try to start the file transfer
                transferStarted = mServiceCallback.sendFileViaBluetooth(compressedPath);
                
                if (transferStarted) {
                    Log.i(TAG, "✅ BLE file transfer started for: " + bleImgId);
                } else {
                    // This shouldn't happen since we checked above, but handle it anyway
                    Log.e(TAG, "Failed to start BLE file transfer despite availability check");
                    sendBleTransferError(requestId, "BLE transfer failed to start");
                }
            } else {
                Log.e(TAG, "Service callback not available for BLE file transfer");
                sendBleTransferError(requestId, "Service callback not available");
            }
        } finally {
            // Critical: Clean up compressed file if transfer didn't start
            if (!transferStarted) {
                try {
                    File compressedFile = new File(compressedPath);
                    if (compressedFile.exists()) {
                        if (compressedFile.delete()) {
                            Log.d(TAG, "🗑️ Deleted compressed file after BLE transfer failure: " + compressedPath);
                        } else {
                            Log.w(TAG, "⚠️ Failed to delete compressed file: " + compressedPath);
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error deleting compressed file: " + compressedPath, e);
                }
            }
        }
    }

    /**
     * Request BLE file transfer through AsgClientService
     */
    private void sendBlePhotoReadyMsg(String filePath, String bleImgId, String requestId, long transferStartTime) {
        try {
            // Calculate compression duration on glasses side
            long compressionDuration = System.currentTimeMillis() - transferStartTime;

            JSONObject json = new JSONObject();
            json.put("type", "ble_photo_ready");
            json.put("requestId", requestId);
            json.put("bleImgId", bleImgId);
            json.put("filePath", filePath);
            json.put("compressionDurationMs", compressionDuration);  // Send duration, not timestamp

            // Send through bluetooth if available
            if (mServiceCallback != null) {
                mServiceCallback.sendThroughBluetooth(json.toString().getBytes());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating BLE transfer request", e);
        }
    }

    /**
     * Send BLE transfer error
     */
    private void sendBleTransferError(String requestId, String error) {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "ble_photo_error");
            json.put("requestId", requestId);
            json.put("error", error);

            if (mServiceCallback != null) {
                mServiceCallback.sendThroughBluetooth(json.toString().getBytes());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating BLE transfer error", e);
        }
    }

    /**
     * Send gallery status update to phone after photo capture
     * Uses GalleryStatusHelper to avoid code duplication with GalleryCommandHandler
     */
    private void sendGalleryStatusUpdate() {
        try {
            Log.d(TAG, "📸 Sending gallery status update after photo capture");

            if (fileManager == null) {
                Log.w(TAG, "📸 Cannot send gallery status: FileManager not available");
                return;
            }

            // Build gallery status using shared utility
            JSONObject response = com.augmentos.asg_client.utils.GalleryStatusHelper.buildGalleryStatus(fileManager);

            // Send through bluetooth if available
            if (mServiceCallback != null) {
                mServiceCallback.sendThroughBluetooth(response.toString().getBytes());
                Log.d(TAG, "📸 Gallery status update sent successfully");
            } else {
                Log.w(TAG, "📸 Cannot send gallery status update: service callback not available");
            }
        } catch (Exception e) {
            Log.e(TAG, "📸 Error creating gallery status update", e);
        }
    }

    // ========== CIRCULAR VIDEO BUFFER METHODS ==========
}
