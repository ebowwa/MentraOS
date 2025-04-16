package com.augmentos.asg_client.camera;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.os.Build;
import android.util.Log;
import android.view.Surface;

import androidx.annotation.NonNull;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.core.AspectRatio;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleService;

import com.augmentos.asg_client.R;
import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

public class CameraNeo extends LifecycleService {
    private static final String TAG = "CameraNeo";
    private static final String CHANNEL_ID = "CameraNeoServiceChannel";
    private static final int NOTIFICATION_ID = 1;
    
    private ProcessCameraProvider cameraProvider;
    private Camera camera;
    private ImageCapture imageCapture;
    private final Executor executor = Executors.newSingleThreadExecutor();
    
    // Intent action definitions
    public static final String ACTION_TAKE_PHOTO = "com.augmentos.camera.ACTION_TAKE_PHOTO";
    public static final String EXTRA_PHOTO_FILE_PATH = "com.augmentos.camera.EXTRA_PHOTO_FILE_PATH";
    
    // Callback interface for photo capture
    public interface PhotoCaptureCallback {
        void onPhotoCaptured(String filePath);
        void onPhotoError(String errorMessage);
    }
    
    // Static callback for photo capture
    private static PhotoCaptureCallback sPhotoCallback;
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "CameraNeo service created");
        createNotificationChannel();
        showNotification("Camera Service", "Service is running");
        setupCamera();
    }
    
    private void setupCamera() {
        ListenableFuture<ProcessCameraProvider> cameraProviderFuture = 
            ProcessCameraProvider.getInstance(this);
            
        cameraProviderFuture.addListener(() -> {
            try {
                cameraProvider = cameraProviderFuture.get();
                
                // Set up the image capture use case with horizontal 4:3 (landscape orientation)
                // Using 1440x1080 which is 4:3 in landscape orientation
                ImageCapture.Builder builder = new ImageCapture.Builder()
                    .setTargetResolution(new android.util.Size(1440, 1080)) // 4:3 landscape
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY) // Optimize for speed over quality
                    .setBufferFormat(ImageFormat.JPEG)
                    .setJpegQuality(90) // Good quality but not maximum
                    .setFlashMode(ImageCapture.FLASH_MODE_AUTO)
                    .setTargetRotation(Surface.ROTATION_270); // Rotate 90 degrees clockwise
                
                // Set up optimal quality settings
                Camera2Interop.Extender<ImageCapture> extender = new Camera2Interop.Extender<>(builder);
                
                // Set AUTO control mode
                extender.setCaptureRequestOption(
                    CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
                
                // Enable auto exposure and set exposure compensation to make images brighter
                extender.setCaptureRequestOption(
                    CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON);
                extender.setCaptureRequestOption(
                    CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, 1); // Slight brightness boost
                
                // Set auto white balance
                extender.setCaptureRequestOption(
                    CaptureRequest.CONTROL_AWB_MODE, CameraMetadata.CONTROL_AWB_MODE_AUTO);
                
                // Add noise reduction and edge enhancement
                extender.setCaptureRequestOption(
                    CaptureRequest.NOISE_REDUCTION_MODE, CameraMetadata.NOISE_REDUCTION_MODE_HIGH_QUALITY);
                extender.setCaptureRequestOption(
                    CaptureRequest.EDGE_MODE, CameraMetadata.EDGE_MODE_HIGH_QUALITY);
                
                imageCapture = builder.build();
                
                // For smart glasses with only one camera, don't require specific lens facing
                CameraSelector cameraSelector = new CameraSelector.Builder()
                    // Use default camera selector without lens facing requirement
                    .build();
                
                // Keep full field of view while maintaining lower resolution
                extender.setCaptureRequestOption(
                    CaptureRequest.CONTROL_ZOOM_RATIO, 1.0f); // Ensure no zoom is applied
                
                // Bind to lifecycle
                camera = cameraProvider.bindToLifecycle(
                    this, cameraSelector, imageCapture);
                
                Log.d(TAG, "Camera setup complete");
                
            } catch (ExecutionException | InterruptedException e) {
                Log.e(TAG, "Error setting up camera", e);
            }
        }, ContextCompat.getMainExecutor(this));
    }
    
    /**
     * Take a picture and get notified through callback when complete
     * 
     * @param context Application context
     * @param filePath File path to save the photo
     * @param callback Callback to be notified when photo is captured
     */
    public static void takePictureWithCallback(Context context, String filePath, PhotoCaptureCallback callback) {
        // Store the callback statically (limitation: only one callback can be active at a time)
        sPhotoCallback = callback;
        
        Intent intent = new Intent(context, CameraNeo.class);
        intent.setAction(ACTION_TAKE_PHOTO);
        intent.putExtra(EXTRA_PHOTO_FILE_PATH, filePath);
        context.startForegroundService(intent);
    }
    
    // For compatibility with CameraRecordingService
    private static String lastPhotoPath;
    
    /**
     * Get the path to the most recently captured photo
     * Added for compatibility with CameraRecordingService
     */
    public static String getLastPhotoPath() {
        return lastPhotoPath;
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        
        if (intent != null && ACTION_TAKE_PHOTO.equals(intent.getAction())) {
            String filePath = intent.getStringExtra(EXTRA_PHOTO_FILE_PATH);
            if (filePath == null || filePath.isEmpty()) {
                String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                filePath = getExternalFilesDir(null) + File.separator + "IMG_" + timeStamp + ".jpg";
            }
            
            takePicture(filePath);
        }
        
        return START_STICKY;
    }
    
    private void takePicture(String filePath) {
        // Ensure camera is ready
        if (imageCapture == null) {
            Log.e(TAG, "Cannot take picture, camera not initialized");
            if (sPhotoCallback != null) {
                sPhotoCallback.onPhotoError("Camera not initialized");
            }
            return;
        }
        
        File photoFile = new File(filePath);
        
        ImageCapture.OutputFileOptions outputFileOptions = 
            new ImageCapture.OutputFileOptions.Builder(photoFile).build();
            
        imageCapture.takePicture(outputFileOptions, executor,
            new ImageCapture.OnImageSavedCallback() {
                @Override
                public void onImageSaved(@NonNull ImageCapture.OutputFileResults outputFileResults) {
                    Log.d(TAG, "Photo saved successfully at " + photoFile.getAbsolutePath());
                    // Store the last photo path for getLastPhotoPath() compatibility
                    lastPhotoPath = photoFile.getAbsolutePath();
                    if (sPhotoCallback != null) {
                        sPhotoCallback.onPhotoCaptured(photoFile.getAbsolutePath());
                    }
                    
                    // Release camera resources immediately after photo is taken
                    // This is important for battery life on smart glasses
                    releaseCamera();
                    stopSelf();
                }
                
                @Override
                public void onError(@NonNull ImageCaptureException exception) {
                    Log.e(TAG, "Error taking photo", exception);
                    if (sPhotoCallback != null) {
                        sPhotoCallback.onPhotoError("Failed to capture photo: " + exception.getMessage());
                    }
                    
                    // Release camera resources after error too
                    releaseCamera();
                    stopSelf();
                }
            });
    }
    
    // -----------------------------------------------------------------------------------
    // Notification handling
    // -----------------------------------------------------------------------------------

    private void showNotification(String title, String message) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title)
                .setContentText(message)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setAutoCancel(false);

        // Start in foreground
        startForeground(NOTIFICATION_ID, builder.build());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Camera Neo Service Channel",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        releaseCamera();
    }
    
    /**
     * Release camera resources to prevent keeping the camera open
     * This is important for battery life on glasses
     */
    private void releaseCamera() {
        if (cameraProvider != null) {
            // CameraX requires unbindAll to be called on main thread
            ContextCompat.getMainExecutor(this).execute(() -> {
                if (cameraProvider != null) {
                    cameraProvider.unbindAll();
                    cameraProvider = null;
                    camera = null;
                    imageCapture = null;
                    Log.d(TAG, "Camera resources released");
                }
            });
        }
    }
}