package com.augmentos.asg_client.io.media.managers;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.channels.FileLock;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Renamed from PhotoUploadService to MediaUploadService
import com.augmentos.asg_client.io.media.upload.MediaUploadService;

/**
 * Manages a queue of media (photos/videos) to be uploaded.
 * Provides persistence, retry mechanism, and robust error handling.
 */
public class MediaUploadQueueManager {
    private static final String TAG = "MediaUploadQueueManager"; // Renamed TAG

    // Directory and file names for persistence
    private static final String QUEUE_DIR_NAME = "media_queue"; // Renamed directory
    private static final String MANIFEST_FILENAME = "queue_manifest.json";

    // Media type constants
    public static final int MEDIA_TYPE_PHOTO = 1;
    public static final int MEDIA_TYPE_VIDEO = 2;

    // Status constants (remain the same)
    public static final String STATUS_QUEUED = "queued";
    public static final String STATUS_UPLOADING = "uploading";
    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_FAILED = "failed";

    // File lock timeout (milliseconds)
    private static final long LOCK_TIMEOUT_MS = 5000;

    // Context and directories
    private final Context mContext;
    private final File mQueueDir;
    private final File mManifestFile;

    // Thread pool for async operations
    private final ExecutorService mExecutor;

    // Callbacks
    public interface MediaQueueCallback { // Renamed interface
        void onMediaQueued(String requestId, String filePath, int mediaType);

        void onMediaUploaded(String requestId, String url, int mediaType);

        void onMediaUploadFailed(String requestId, String error, int mediaType);
    }

    private MediaQueueCallback mCallback;

    /**
     * Constructor - initializes the queue directory and manifest file
     *
     * @param context Application context
     */
    public MediaUploadQueueManager(@NonNull Context context) {
        mContext = context.getApplicationContext();
        mQueueDir = new File(mContext.getExternalFilesDir(null), QUEUE_DIR_NAME);
        mManifestFile = new File(mQueueDir, MANIFEST_FILENAME);
        mExecutor = Executors.newSingleThreadExecutor();

        // Create queue directory if it doesn't exist
        if (!mQueueDir.exists()) {
            if (!mQueueDir.mkdirs()) {
                Log.e(TAG, "Failed to create queue directory: " + mQueueDir.getAbsolutePath());
            }
        }

        // Create manifest file if it doesn't exist
        if (!mManifestFile.exists()) {
            try {
                createEmptyManifest();
            } catch (IOException | JSONException e) {
                Log.e(TAG, "Failed to create manifest file", e);
            }
        } else {
            // Validate manifest file on startup
            try {
                validateManifest();
            } catch (IOException | JSONException e) {
                Log.e(TAG, "Failed to validate manifest file", e);
                // Create a new manifest if validation fails
                try {
                    createEmptyManifest();
                } catch (IOException | JSONException ex) {
                    Log.e(TAG, "Failed to recreate manifest file", ex);
                }
            }
        }
    }

    /**
     * Set the media queue callback
     *
     * @param callback The callback to set
     */
    public void setMediaQueueCallback(MediaQueueCallback callback) { // Renamed method
        this.mCallback = callback;
    }

    // ... rest of the implementation would continue here
    // For brevity, I'm showing the key parts that need import updates
} 