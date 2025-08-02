package com.augmentos.asg_client.io.media.core;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.preference.PreferenceManager;

import com.augmentos.augmentos_core.utils.ServerConfigUtil;
import com.augmentos.asg_client.io.media.upload.MediaUploadService;
import com.augmentos.asg_client.io.media.interfaces.ServiceCallbackInterface;

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
        this.mContext = context;
        this.mMediaQueueManager = mediaQueueManager;
    }

    /**
     * Set the media capture listener
     *
     * @param listener The listener to set
     */
    public void setMediaCaptureListener(MediaCaptureListener listener) {
        this.mMediaCaptureListener = listener;
    }

    /**
     * Set the service callback interface
     *
     * @param callback The callback interface
     */
    public void setServiceCallback(ServiceCallbackInterface callback) {
        this.mServiceCallback = callback;
    }

    // ... rest of the implementation would continue here
    // For brevity, I'm showing the key parts that need import updates
} 