package com.augmentos.asg_client.io.media.core;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.preference.PreferenceManager;

import com.augmentos.augmentos_core.utils.ServerConfigUtil;

import org.json.JSONException;
import org.json.JSONObject;

import com.augmentos.augmentos_core.smarterglassesmanager.camera.PhotoUploadService;
import com.augmentos.asg_client.io.media.managers.PhotoQueueManager;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Service that handles photo capturing and uploading functionality.
 * Extracts this logic from AsgClientService to improve modularity.
 */
public class PhotoCaptureService {
    private static final String TAG = "PhotoCaptureService";
    
    private final Context mContext;
    private final PhotoQueueManager mPhotoQueueManager;
    private PhotoCaptureListener mPhotoCaptureListener;
    
    /**
     * Interface for listening to photo capture and upload events
     */
    public interface PhotoCaptureListener {
        void onPhotoCapturing(String requestId);
        void onPhotoCaptured(String requestId, String filePath);
        void onPhotoUploading(String requestId);
        void onPhotoUploaded(String requestId, String url);
        void onPhotoError(String requestId, String error);
    }
    
    /**
     * Constructor
     *
     * @param context Application context
     * @param photoQueueManager PhotoQueueManager instance
     */
    public PhotoCaptureService(@NonNull Context context, @NonNull PhotoQueueManager photoQueueManager) {
        mContext = context.getApplicationContext();
        mPhotoQueueManager = photoQueueManager;
    }
    
    /**
     * Set a listener for photo capture events
     */
    public void setPhotoCaptureListener(PhotoCaptureListener listener) {
        this.mPhotoCaptureListener = listener;
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
            buttonPressPayload.put("device_id", deviceId);
            buttonPressPayload.put("event_type", "photo_button_press");
            buttonPressPayload.put("timestamp", System.currentTimeMillis());
            
            // Create request body
            RequestBody requestBody = RequestBody.create(
                MediaType.parse("application/json"), 
                buttonPressPayload.toString()
            );
            
            // Create HTTP request
            Request request = new Request.Builder()
                .url(buttonPressUrl)
                .addHeader("Authorization", "Bearer " + coreToken)
                .addHeader("Content-Type", "application/json")
                .post(requestBody)
                .build();
            
            // Execute request
            OkHttpClient client = new OkHttpClient();
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Button press request failed, taking photo locally", e);
                    new Handler(Looper.getMainLooper()).post(() -> takePhotoLocally());
                }
                
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        try {
                            String responseBody = response.body().string();
                            JSONObject responseJson = new JSONObject(responseBody);
                            
                            // Check if server wants us to take a photo
                            if (responseJson.has("take_photo") && responseJson.getBoolean("take_photo")) {
                                String requestId = responseJson.optString("request_id", UUID.randomUUID().toString());
                                String appId = responseJson.optString("app_id", "");
                                String photoFilePath = responseJson.optString("photo_file_path", "");
                                
                                Log.d(TAG, "Server requested photo capture, requestId: " + requestId);
                                takePhotoAndUpload(photoFilePath, requestId, appId);
                            } else {
                                Log.d(TAG, "Server did not request photo capture");
                            }
                        } catch (JSONException e) {
                            Log.e(TAG, "Error parsing server response", e);
                            new Handler(Looper.getMainLooper()).post(() -> takePhotoLocally());
                        }
                    } else {
                        Log.e(TAG, "Button press request failed with status: " + response.code());
                        new Handler(Looper.getMainLooper()).post(() -> takePhotoLocally());
                    }
                }
            });
            
        } catch (Exception e) {
            Log.e(TAG, "Error making button press request", e);
            takePhotoLocally();
        }
    }
    
    /**
     * Takes a photo locally without server communication
     */
    private void takePhotoLocally() {
        Log.d(TAG, "Taking photo locally");
        
        // Generate a local request ID
        String requestId = UUID.randomUUID().toString();
        
        // Notify listener that photo capture is starting
        if (mPhotoCaptureListener != null) {
            mPhotoCaptureListener.onPhotoCapturing(requestId);
        }
        
        // Use the photo queue manager to take the photo
        mPhotoQueueManager.takePhoto(new PhotoQueueManager.PhotoCaptureCallback() {
            @Override
            public void onPhotoCaptured(String filePath) {
                Log.d(TAG, "Photo captured locally: " + filePath);
                
                // Notify listener of successful capture
                if (mPhotoCaptureListener != null) {
                    mPhotoCaptureListener.onPhotoCaptured(requestId, filePath);
                }
            }
            
            @Override
            public void onPhotoError(String errorMessage) {
                Log.e(TAG, "Photo capture failed: " + errorMessage);
                
                // Notify listener of error
                if (mPhotoCaptureListener != null) {
                    mPhotoCaptureListener.onPhotoError(requestId, errorMessage);
                }
            }
        });
    }
    
    /**
     * Takes a photo and uploads it to the cloud
     *
     * @param photoFilePath The path where the photo should be saved
     * @param requestId The request ID for tracking
     * @param appId The app ID for the upload
     */
    public void takePhotoAndUpload(String photoFilePath, String requestId, String appId) {
        Log.d(TAG, "Taking photo and uploading, requestId: " + requestId);
        
        // Notify listener that photo capture is starting
        if (mPhotoCaptureListener != null) {
            mPhotoCaptureListener.onPhotoCapturing(requestId);
        }
        
        // Use the photo queue manager to take the photo
        mPhotoQueueManager.takePhoto(new PhotoQueueManager.PhotoCaptureCallback() {
            @Override
            public void onPhotoCaptured(String filePath) {
                Log.d(TAG, "Photo captured for upload: " + filePath);
                
                // Notify listener of successful capture
                if (mPhotoCaptureListener != null) {
                    mPhotoCaptureListener.onPhotoCaptured(requestId, filePath);
                }
                
                // Upload the photo to cloud
                uploadPhotoToCloud(filePath, requestId, appId);
            }
            
            @Override
            public void onPhotoError(String errorMessage) {
                Log.e(TAG, "Photo capture failed: " + errorMessage);
                
                // Notify listener of error
                if (mPhotoCaptureListener != null) {
                    mPhotoCaptureListener.onPhotoError(requestId, errorMessage);
                }
            }
        });
    }
    
    /**
     * Uploads a photo to the cloud
     *
     * @param photoFilePath The path to the photo file
     * @param requestId The request ID for tracking
     * @param appId The app ID for the upload
     */
    private void uploadPhotoToCloud(String photoFilePath, String requestId, String appId) {
        Log.d(TAG, "Uploading photo to cloud, requestId: " + requestId);
        
        // Notify listener that upload is starting
        if (mPhotoCaptureListener != null) {
            mPhotoCaptureListener.onPhotoUploading(requestId);
        }
        
        // Use the photo upload service to upload the photo
        PhotoUploadService photoUploadService = new PhotoUploadService(mContext);
        photoUploadService.uploadPhoto(photoFilePath, new PhotoUploadService.UploadCallback() {
            @Override
            public void onSuccess(String url) {
                Log.d(TAG, "Photo uploaded successfully: " + url);
                
                // Notify listener of successful upload
                if (mPhotoCaptureListener != null) {
                    mPhotoCaptureListener.onPhotoUploaded(requestId, url);
                }
                
                // Send success response
                sendPhotoSuccessResponse(requestId, appId, url);
            }
            
            @Override
            public void onFailure(String errorMessage) {
                Log.e(TAG, "Photo upload failed: " + errorMessage);
                
                // Notify listener of upload error
                if (mPhotoCaptureListener != null) {
                    mPhotoCaptureListener.onPhotoError(requestId, errorMessage);
                }
                
                // Send error response
                sendPhotoErrorResponse(requestId, appId, errorMessage);
            }
        });
    }
    
    /**
     * Sends a success response for photo capture and upload
     *
     * @param requestId The request ID
     * @param appId The app ID
     * @param photoUrl The URL of the uploaded photo
     */
    protected void sendPhotoSuccessResponse(String requestId, String appId, String photoUrl) {
        // This method can be overridden by subclasses to send custom success responses
        Log.d(TAG, "Photo success response sent for requestId: " + requestId);
    }
    
    /**
     * Sends an error response for photo capture and upload
     *
     * @param requestId The request ID
     * @param appId The app ID
     * @param errorMessage The error message
     */
    protected void sendPhotoErrorResponse(String requestId, String appId, String errorMessage) {
        // This method can be overridden by subclasses to send custom error responses
        Log.e(TAG, "Photo error response sent for requestId: " + requestId + ", error: " + errorMessage);
    }
    
    /**
     * Checks if external storage is available for saving photos
     *
     * @return true if external storage is available, false otherwise
     */
    private boolean isExternalStorageAvailable() {
        String state = android.os.Environment.getExternalStorageState();
        return android.os.Environment.MEDIA_MOUNTED.equals(state);
    }
} 