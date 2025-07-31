package com.augmentos.asg_client.camera;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.preference.PreferenceManager;

import com.augmentos.augmentos_core.utils.ServerConfigUtil;
import com.augmentos.asg_client.camera.upload.MediaUploadService;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

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

    // Track current video recording
    private boolean isRecordingVideo = false;
    private String currentVideoId = null;
    private String currentVideoPath = null;
    private long recordingStartTime = 0;

    // Original very fast: 320x240, 30qual
    public static final int bleImageTargetWidth = 480;
    public static final int bleImageTargetHeight = 480;
    public static final int bleImageAvifQuality = 40;
    
    // Track which photos should be saved to gallery
    private Map<String, Boolean> photoSaveFlags = new HashMap<>();
    
    // Track BLE IDs for auto fallback mode
    private Map<String, String> photoBleIds = new HashMap<>();
    
    // Track original photo paths for BLE fallback
    private Map<String, String> photoOriginalPaths = new HashMap<>();

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
    public MediaCaptureService(@NonNull Context context, @NonNull MediaUploadQueueManager mediaQueueManager) {
        mContext = context.getApplicationContext();
        mMediaQueueManager = mediaQueueManager;
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

    /**
     * Handles the photo button press by sending a request to the cloud server
     * If connected, makes REST API call to server
     * If disconnected or server error, takes photo locally
     */
    public void handlePhotoButtonPress() {
        // Get core token for authentication
        String coreToken = PreferenceManager.getDefaultSharedPreferences(mContext)
                .getString("core_token", "");

        // Get device ID for hardware identification
        String deviceId = android.os.Build.MODEL + "_" + android.os.Build.SERIAL;

        if (coreToken == null || coreToken.isEmpty()) {
            Log.e(TAG, "No core token available, taking photo locally");
            takePhotoLocally();
            return;
        }

        // Prepare REST API call
        try {
            // Get the button press URL from the central config utility
            String buttonPressUrl = ServerConfigUtil.getButtonPressUrl(mContext);

            // Create payload for button press event
            JSONObject buttonPressPayload = new JSONObject();
            buttonPressPayload.put("buttonId", "photo");
            buttonPressPayload.put("pressType", "short");
            buttonPressPayload.put("deviceId", deviceId);

            Log.d(TAG, "Sending button press event to server: " + buttonPressUrl);

            // Make REST API call with timeout
            OkHttpClient client = new OkHttpClient.Builder()
                    .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .writeTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .build();

            RequestBody requestBody = RequestBody.create(
                    MediaType.parse("application/json"),
                    buttonPressPayload.toString()
            );

            Request request = new Request.Builder()
                    .url(buttonPressUrl)
                    .header("Authorization", "Bearer " + coreToken)
                    .post(requestBody)
                    .build();

            // Execute request asynchronously
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Failed to send button press event", e);
                    // Connection failed, take photo locally
                    takePhotoLocally();
                }

                @Override
                public void onResponse(Call call, Response response) {
                    try {
                        if (!response.isSuccessful()) {
                            Log.e(TAG, "Server returned error: " + response.code());
                            // Server error, take photo locally
                            takePhotoLocally();
                            return;
                        }

                        // Parse response
                        String responseBody = response.body().string();
                        Log.d(TAG, "Server response: " + responseBody);
                        JSONObject jsonResponse = new JSONObject(responseBody);

                        // Check if we need to take a photo
                        if ("take_photo".equals(jsonResponse.optString("action"))) {
                            String requestId = jsonResponse.optString("requestId");
                            boolean save = jsonResponse.optBoolean("save", false);  // Default to false

                            Log.d(TAG, "Server requesting photo with requestId: " + requestId + ", save: " + save);

                            // Take photo and upload directly to server
                            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                            String photoFilePath = mContext.getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";
                            takePhotoAndUpload(photoFilePath, requestId, null, save);
                        } else {
                            Log.d(TAG, "Button press handled by server, no photo needed");
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error processing server response", e);
                        takePhotoLocally();
                    } finally {
                        response.close();
                    }
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error preparing button press request", e);
            // Something went wrong, take photo locally
            takePhotoLocally();
        }
    }

    /**
     * Handles the video button press by toggling video recording
     */
    public void handleVideoButtonPress() {
        // Get core token for authentication
        String coreToken = PreferenceManager.getDefaultSharedPreferences(mContext)
                .getString("core_token", "");

        // Get device ID for hardware identification
        String deviceId = android.os.Build.MODEL + "_" + android.os.Build.SERIAL;

        // If already recording, always stop regardless of server response
        if (isRecordingVideo) {
            Log.d(TAG, "Already recording, stopping video recording");
            stopVideoRecording();
            return;
        }

        // If no token, fall back to local recording
        if (coreToken == null || coreToken.isEmpty()) {
            Log.e(TAG, "No core token available, starting video locally");
            startVideoRecording();
            return;
        }

        // Prepare REST API call
        try {
            // Get the button press URL from the central config utility
            String buttonPressUrl = ServerConfigUtil.getButtonPressUrl(mContext);

            // Create payload for button press event
            JSONObject buttonPressPayload = new JSONObject();
            buttonPressPayload.put("buttonId", "video");
            buttonPressPayload.put("pressType", "long");
            buttonPressPayload.put("deviceId", deviceId);

            Log.d(TAG, "Sending video button press event to server: " + buttonPressUrl);

            // Make REST API call with timeout
            OkHttpClient client = new OkHttpClient.Builder()
                    .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .writeTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .build();

            RequestBody requestBody = RequestBody.create(
                    MediaType.parse("application/json"),
                    buttonPressPayload.toString()
            );

            Request request = new Request.Builder()
                    .url(buttonPressUrl)
                    .header("Authorization", "Bearer " + coreToken)
                    .post(requestBody)
                    .build();

            // Execute request asynchronously
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Failed to send video button press event", e);
                    // Connection failed, start video locally
                    startVideoRecording();
                }

                @Override
                public void onResponse(Call call, Response response) {
                    try {
                        if (!response.isSuccessful()) {
                            Log.e(TAG, "Server returned error: " + response.code());
                            // Server error, start video locally
                            startVideoRecording();
                            return;
                        }

                        // Parse response
                        String responseBody = response.body().string();
                        Log.d(TAG, "Server response: " + responseBody);
                        JSONObject jsonResponse = new JSONObject(responseBody);

                        // Check if we need to start video recording
                        if ("start_video".equals(jsonResponse.optString("action"))) {
                            String requestId = jsonResponse.optString("requestId");

                            Log.d(TAG, "Server requesting video with requestId: " + requestId);

                            // Generate filename with requestId
                            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                            String videoFilePath = mContext.getExternalFilesDir(null) + File.separator + "VID_" + timeStamp + "_" + requestId + ".mp4";

                            // Start video recording with server-provided requestId
                            startVideoRecording(videoFilePath, requestId);
                        } else {
                            Log.d(TAG, "Button press handled by server, no video recording needed");
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Error processing server response", e);
                        startVideoRecording();
                    } finally {
                        response.close();
                    }
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error preparing button press request", e);
            // Something went wrong, start video locally
            startVideoRecording();
        }
    }

    /**
     * Start video recording locally with auto-generated IDs
     */
    private void startVideoRecording() {
        // Generate IDs for local recording
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String requestId = "local_video_" + timeStamp;
        String videoFilePath = mContext.getExternalFilesDir(null) + File.separator + "VID_" + timeStamp + ".mp4";

        startVideoRecording(videoFilePath, requestId);
    }

    /**
     * Start video recording with specific parameters
     */
    private void startVideoRecording(String videoFilePath, String requestId) {
        // Check storage availability before recording
        if (!isExternalStorageAvailable()) {
            Log.e(TAG, "External storage is not available for video capture");
            return;
        }

        // Save info for the current recording session
        currentVideoId = requestId;
        currentVideoPath = videoFilePath;

        try {
            // Start video recording using CameraNeo
            CameraNeo.startVideoRecording(mContext, requestId, videoFilePath, new CameraNeo.VideoRecordingCallback() {
                @Override
                public void onRecordingStarted(String videoId) {
                    Log.d(TAG, "Video recording started with ID: " + videoId);
                    isRecordingVideo = true;
                    recordingStartTime = System.currentTimeMillis();

                    // Notify listener
                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onVideoRecordingStarted(requestId, videoFilePath);
                    }
                }

                @Override
                public void onRecordingStopped(String videoId, String filePath) {
                    Log.d(TAG, "Video recording stopped: " + videoId + ", file: " + filePath);
                    isRecordingVideo = false;

                    // Notify listener
                    if (mMediaCaptureListener != null) {
                        mMediaCaptureListener.onVideoRecordingStopped(requestId, filePath);
                        mMediaCaptureListener.onVideoUploading(requestId);
                    }

                    // TODO: Server upload would happen here, for now just log
                    Log.d(TAG, "Video captured and ready for upload, path: " + filePath +
                            ", requestId: " + requestId);

                    // Reset state
                    currentVideoId = null;
                    currentVideoPath = null;
                }

                @Override
                public void onRecordingError(String videoId, String errorMessage) {
                    Log.e(TAG, "Video recording error: " + videoId + ", error: " + errorMessage);
                    isRecordingVideo = false;

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
     * Takes a photo locally when offline or when server communication fails
     */
    public void takePhotoLocally() {
        // Check storage availability before taking photo
        if (!isExternalStorageAvailable()) {
            Log.e(TAG, "External storage is not available for photo capture");
            return;
        }

        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String photoFilePath = mContext.getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";

        // Generate a temporary requestId
        String requestId = "local_" + timeStamp;

        // For offline mode, take photo and queue it for later upload
        CameraNeo.takePictureWithCallback(
                mContext,
                photoFilePath,
                new CameraNeo.PhotoCaptureCallback() {
                    @Override
                    public void onPhotoCaptured(String filePath) {
                        Log.d(TAG, "Offline photo captured successfully at: " + filePath);
                        // Notify through standard capture listener if set up
                        if (mMediaCaptureListener != null) {
                            mMediaCaptureListener.onPhotoCaptured(requestId, filePath);
                            mMediaCaptureListener.onPhotoUploading(requestId);
                        }
                    }

                    @Override
                    public void onPhotoError(String errorMessage) {
                        Log.e(TAG, "Failed to capture offline photo: " + errorMessage);

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
     * @param save Whether to keep the photo on device after upload
     */
    public void takePhotoAndUpload(String photoFilePath, String requestId, String webhookUrl, boolean save) {
        // Store the save flag for this request
        photoSaveFlags.put(requestId, save);
        // Notify that we're about to take a photo
        if (mMediaCaptureListener != null) {
            mMediaCaptureListener.onPhotoCapturing(requestId);
        }

        try {
            // Use CameraNeo for photo capture
            CameraNeo.takePictureWithCallback(
                    mContext,
                    photoFilePath,
                    new CameraNeo.PhotoCaptureCallback() {
                        @Override
                        public void onPhotoCaptured(String filePath) {
                            Log.d(TAG, "Photo captured successfully at: " + filePath);

                            // Notify that we've captured the photo
                            if (mMediaCaptureListener != null) {
                                mMediaCaptureListener.onPhotoCaptured(requestId, filePath);
                                mMediaCaptureListener.onPhotoUploading(requestId);
                            }

                            // Choose upload destination based on webhookUrl
                            if (webhookUrl != null && !webhookUrl.isEmpty()) {
                                // Upload directly to app webhook
                                uploadPhotoToWebhook(filePath, requestId, webhookUrl);
                            }
                        }

                        @Override
                        public void onPhotoError(String errorMessage) {
                            Log.e(TAG, "Failed to capture photo: " + errorMessage);
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
    private void uploadPhotoToWebhook(String photoFilePath, String requestId, String webhookUrl) {
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

                // Create multipart form request
                OkHttpClient client = new OkHttpClient.Builder()
                        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                        .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                        .build();

                RequestBody fileBody = RequestBody.create(okhttp3.MediaType.parse("image/jpeg"), photoFile);
                RequestBody requestBody = new MultipartBody.Builder()
                        .setType(MultipartBody.FORM)
                        .addFormDataPart("photo", photoFile.getName(), fileBody)
                        .addFormDataPart("requestId", requestId)
                        .addFormDataPart("type", "photo_upload")
                        .build();

                Request request = new Request.Builder()
                        .url(webhookUrl)
                        .post(requestBody)
                        .build();

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
                        
                        // Trigger BLE fallback
                        takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, photoSaveFlags.get(requestId));
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
                    
                    // Trigger BLE fallback
                    takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, photoSaveFlags.get(requestId));
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
                
                if (mMediaCaptureListener != null) {
                    mMediaCaptureListener.onMediaError(requestId, "Upload error: " + e.getMessage(), MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                }
            }
        }).start();
    }


    /**
     * Upload a video file to AugmentOS Cloud
     */
    public void uploadVideo(String videoFilePath, String requestId) {
        if (mMediaCaptureListener != null) {
            mMediaCaptureListener.onVideoUploading(requestId);
        }

        uploadMediaToCloud(videoFilePath, requestId, MediaUploadQueueManager.MEDIA_TYPE_VIDEO);
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
                            
                            // Trigger BLE fallback
                            takePhotoForBleTransfer(mediaFilePath, requestId, bleImgId, photoSaveFlags.get(requestId));
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
            String classDirectory = mContext.getExternalFilesDir(null) + File.separator + "MediaCaptureService";
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
    public void takePhotoAutoTransfer(String photoFilePath, String requestId, String webhookUrl, String bleImgId, boolean save) {
        // Store the save flag and BLE ID for this request
        photoSaveFlags.put(requestId, save);
        photoBleIds.put(requestId, bleImgId);
        photoOriginalPaths.put(requestId, photoFilePath);
        
        // Check WiFi connectivity
        if (isWiFiConnected()) {
            Log.d(TAG, "📶 WiFi connected, attempting direct upload for " + requestId);
            // Try WiFi upload (with automatic BLE fallback on failure)
            takePhotoAndUpload(photoFilePath, requestId, webhookUrl, save);
        } else {
            Log.d(TAG, "📵 No WiFi connection, using BLE transfer for " + requestId);
            // No WiFi, go straight to BLE
            takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, save);
        }
    }
    
    /**
     * Take a photo for BLE transfer with compression
     * @param photoFilePath Path to save the original photo
     * @param requestId Request ID for tracking
     * @param bleImgId BLE image ID to use as filename
     * @param save Whether to keep the original photo on device
     */
    public void takePhotoForBleTransfer(String photoFilePath, String requestId, String bleImgId, boolean save) {
        // Store the save flag for this request
        photoSaveFlags.put(requestId, save);
        // Notify that we're about to take a photo
        if (mMediaCaptureListener != null) {
            mMediaCaptureListener.onPhotoCapturing(requestId);
        }
        
        try {
            // Use CameraNeo for photo capture
            CameraNeo.takePictureWithCallback(
                    mContext,
                    photoFilePath,
                    new CameraNeo.PhotoCaptureCallback() {
                        @Override
                        public void onPhotoCaptured(String filePath) {
                            Log.d(TAG, "Photo captured successfully for BLE transfer: " + filePath);
                            
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
                            sendMediaErrorResponse(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                            
                            if (mMediaCaptureListener != null) {
                                mMediaCaptureListener.onMediaError(requestId, errorMessage, MediaUploadQueueManager.MEDIA_TYPE_PHOTO);
                            }
                        }
                    }
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
                
                // 2. Calculate new dimensions maintaining aspect ratio
                int targetWidth = bleImageTargetWidth;
                int targetHeight = bleImageTargetHeight;
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
                            bleImageAvifQuality,  // quality (0-100)
                        PreciseMode.LOSSY   // Use FAST mode for reasonable compression speed
                    );
                    Log.d(TAG, "Successfully encoded as AVIF");
                } catch (Exception e) {
                    Log.w(TAG, "AVIF encoding failed, falling back to JPEG: " + e.getMessage());
                    // Fallback to JPEG if AVIF fails
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    resized.compress(android.graphics.Bitmap.CompressFormat.JPEG, 30, baos);
                    compressedData = baos.toByteArray();
                }
                resized.recycle();
                
                long compressionTime = System.currentTimeMillis() - startTime;
                Log.d(TAG, "✅ Compressed photo for BLE: " + originalPath + " -> " + compressedData.length + " bytes");
                Log.d(TAG, "⏱️ Compression took: " + compressionTime + "ms");
                
                // 5. Save compressed data to temporary file with bleImgId as name
                // For BLE, we ALWAYS use AVIF (no extension in filename due to 16-char limit)
                String compressedPath = mContext.getExternalFilesDir(null) + "/" + bleImgId;
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
        
        // First, notify the phone that the photo is ready (include timing info)
        sendBlePhotoReadyMsg(compressedPath, bleImgId, requestId, transferStartTime);
        
        // Then, trigger the actual file transfer
        if (mServiceCallback != null) {
            boolean started = mServiceCallback.sendFileViaBluetooth(compressedPath);
            if (!started) {
                Log.e(TAG, "Failed to start BLE file transfer");
                sendBleTransferError(requestId, "Failed to start file transfer");
            }
        } else {
            Log.e(TAG, "Service callback not available for BLE file transfer");
            sendBleTransferError(requestId, "Service callback not available");
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
}
