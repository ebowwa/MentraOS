package com.augmentos.asg_client.rtmp;

import android.content.Context;
import android.util.Log;
import android.util.Size;

import io.github.thibaultbee.streampack.data.AudioConfig;
import io.github.thibaultbee.streampack.data.VideoConfig;
import io.github.thibaultbee.streampack.error.StreamPackError;
import io.github.thibaultbee.streampack.listeners.OnConnectionListener;
import io.github.thibaultbee.streampack.listeners.OnErrorListener;
import io.github.thibaultbee.streampack.ext.rtmp.streamers.CameraRtmpLiveStreamer;

import kotlinx.coroutines.BuildersKt;
import kotlinx.coroutines.Dispatchers;
import kotlin.Unit;
import kotlin.coroutines.Continuation;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * Simplified wrapper for StreamPackLite RTMP streaming functionality
 * Designed for minimal dependencies and optimized for smart glasses
 */
public class RTMPStreamer {
    private static final String TAG = "RTMPStreamer";
    private final CameraRtmpLiveStreamer streamer;
    private boolean isStreaming = false;
    private final Context context;

    /**
     * Callback interface for streaming status events
     */
    public interface StreamingCallback {
        void onStreamingStarted();
        void onStreamingStopped();
        void onStreamingError(String error);
    }

    // Surface view for camera preview
    private android.view.SurfaceView surfaceView;
    
    /**
     * Create a new RTMPStreamer with optimal default settings for smart glasses
     * 
     * @param context Android context
     */
    public RTMPStreamer(Context context) {
        // We don't create a SurfaceView here anymore - it should be created by the service
        // and passed to the setPreview method
        this.context = context;
        
        // Create the streaming helper with enhanced debugging callbacks
        try {
            Log.e(TAG, "CAMERA DEBUG: Creating CameraRtmpLiveStreamer");
            streamer = new CameraRtmpLiveStreamer(
                context,
                true, // enableAudio
                new OnErrorListener() {
                    @Override
                    public void onError(StreamPackError error) {
                        Log.e(TAG, "CAMERA DEBUG: Streaming error: " + error.getMessage());
                        
                        // Print full stack trace for debugging
                        if (error.getCause() != null) {
                            Log.e(TAG, "CAMERA DEBUG: Error cause: " + error.getCause().getMessage());
                            error.getCause().printStackTrace();
                        }
                    }
                },
                new OnConnectionListener() {
                    @Override
                    public void onSuccess() {
                        Log.d(TAG, "CAMERA DEBUG: RTMP connection successful");
                        Log.e(TAG, "CAMERA DEBUG: RTMP connection successful - attempting to stream");
                    }

                    @Override
                    public void onFailed(String reason) {
                        Log.e(TAG, "CAMERA DEBUG: RTMP connection failed: " + reason);
                        isStreaming = false;
                    }

                    @Override
                    public void onLost(String reason) {
                        Log.e(TAG, "CAMERA DEBUG: RTMP connection lost: " + reason);
                        isStreaming = false;
                    }
                }
            );
            Log.e(TAG, "CAMERA DEBUG: CameraRtmpLiveStreamer created successfully");
        } catch (Exception e) {
            Log.e(TAG, "CAMERA DEBUG: Error creating CameraRtmpLiveStreamer", e);
            throw e; // Re-throw so caller knows something went wrong
        }
        
        // Configure with optimal settings for smart glasses
        configureDefaultSettings();
        Log.d(TAG, "RTMPStreamer initialized with default settings for smart glasses");
    }
    
    /**
     * Try to explicitly start the camera to ensure it's ready for streaming
     */
    private void explicitlyStartCamera() {
        try {
            Log.e(TAG, "CAMERA DEBUG: Explicitly trying to start camera");
            android.hardware.camera2.CameraManager cameraManager = 
                (android.hardware.camera2.CameraManager) context.getSystemService(android.content.Context.CAMERA_SERVICE);
            
            if (cameraManager != null) {
                String[] cameraIds = cameraManager.getCameraIdList();
                if (cameraIds.length > 0) {
                    Log.e(TAG, "CAMERA DEBUG: Found " + cameraIds.length + " cameras with IDs: " + String.join(", ", cameraIds));
                    
                    // Try to create a direct camera instance as a fallback
                    try {
                        // Try camera 1 API first - this is a direct fallback
                        android.hardware.Camera camera = android.hardware.Camera.open();
                        if (camera != null) {
                            Log.e(TAG, "CAMERA DEBUG: Successfully opened camera using Camera1 API");
                            
                            // Set up direct preview with surfaceview if available
                            if (surfaceView != null && surfaceView.getHolder() != null && surfaceView.getHolder().getSurface().isValid()) {
                                try {
                                    Log.e(TAG, "CAMERA DEBUG: Setting up direct camera preview on SurfaceView");
                                    camera.setPreviewDisplay(surfaceView.getHolder());
                                    
                                    // Set camera parameters (lower resolution for better performance)
                                    android.hardware.Camera.Parameters params = camera.getParameters();
                                    params.setPreviewSize(640, 480);
                                    params.setPreviewFrameRate(15);
                                    camera.setParameters(params);
                                    
                                    // Add a preview callback to check if frames are coming through
                                    camera.setPreviewCallback(new android.hardware.Camera.PreviewCallback() {
                                        @Override
                                        public void onPreviewFrame(byte[] data, android.hardware.Camera camera) {
                                            if (data != null) {
                                                Log.e(TAG, "CAMERA DEBUG: Received preview frame, size: " + data.length + " bytes");
                                                // Only log the first few frames to avoid log spam
                                                camera.setPreviewCallback(null);
                                            } else {
                                                Log.e(TAG, "CAMERA DEBUG: Received NULL preview frame");
                                            }
                                        }
                                    });
                                    
                                    // Start the preview
                                    camera.startPreview();
                                    Log.e(TAG, "CAMERA DEBUG: Direct camera preview started");
                                    
                                    // Try to find and populate the videoSource field as backup
                                    Field videoSourceField = findField(streamer.getClass(), "videoSource");
                                    if (videoSourceField != null) {
                                        Log.e(TAG, "CAMERA DEBUG: Found field videoSource - attempting to populate it");
                                        videoSourceField.setAccessible(true);
                                        videoSourceField.set(streamer, camera);
                                        Log.e(TAG, "CAMERA DEBUG: Set videoSource field with direct camera instance");
                                    }
                                } catch (Exception e) {
                                    Log.e(TAG, "CAMERA DEBUG: Error setting up direct camera preview: " + e.getMessage(), e);
                                    camera.release();
                                }
                            }
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "CAMERA DEBUG: Error creating direct camera instance: " + e.getMessage(), e);
                    }
                    
                    // Look for any camera-related fields and try to populate them
                    String[] cameraFieldNames = {"camera", "mCamera", "videoSource", "cameraDevice"};
                    for (String fieldName : cameraFieldNames) {
                        Field field = findField(streamer.getClass(), fieldName);
                        if (field != null) {
                            Log.e(TAG, "CAMERA DEBUG: Found field " + fieldName + " - attempting to populate it");
                        }
                    }
                }
            } else {
                Log.e(TAG, "CAMERA DEBUG: CameraManager is null");
            }
        } catch (Exception e) {
            Log.e(TAG, "CAMERA DEBUG: Error in explicit camera start: " + e.getMessage(), e);
        }
    }
    
    /**
     * Start the preview on the provided SurfaceView - this is the critical method that the README says must be called
     * 
     * @param surfaceView Surface view for camera preview
     * @return true if successful, false otherwise
     */
    public boolean startPreview(android.view.SurfaceView surfaceView) {
        this.surfaceView = surfaceView;
        
        // Add some verbose logging about the surfaceView status
        boolean isValid = surfaceView != null && surfaceView.getHolder() != null;
        boolean isSurfaceCreated = isValid && surfaceView.getHolder().getSurface() != null && surfaceView.getHolder().getSurface().isValid();
        Log.e(TAG, "CAMERA DEBUG: Starting preview - Surface valid: " + isValid + ", Surface created: " + isSurfaceCreated);
        
        if (isValid) {
            Log.e(TAG, "CAMERA DEBUG: Surface dimensions: " + surfaceView.getWidth() + "x" + surfaceView.getHeight());
        } else {
            Log.e(TAG, "CAMERA DEBUG: Surface is not valid - cannot start preview");
            return false;
        }
        
        // Following the StreamPackLite README exactly:
        // 1. First option: look for a property where we can set "streamer" on the view
        try {
            // Try to find a field named "streamer" on SurfaceView
            try {
                Field streamerField = findField(surfaceView.getClass(), "streamer");
                if (streamerField != null) {
                    Log.e(TAG, "CAMERA DEBUG: Found streamer field on SurfaceView - using PreviewView approach");
                    streamerField.setAccessible(true);
                    streamerField.set(surfaceView, streamer);
                    Log.e(TAG, "CAMERA DEBUG: Set streamer on SurfaceView");
                    return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "CAMERA DEBUG: No streamer field on SurfaceView, continuing to method approach");
            }
            
            // 2. Second option (documented in README): Call startPreview on streamer
            // Try with direct method first (most likely)
            Method startPreviewMethod = findMethod(streamer.getClass(), "startPreview", android.view.SurfaceView.class);
            if (startPreviewMethod != null) {
                Log.e(TAG, "CAMERA DEBUG: Found direct startPreview method - using LiveStreamer approach");
                startPreviewMethod.setAccessible(true);
                startPreviewMethod.invoke(streamer, surfaceView);
                Log.e(TAG, "CAMERA DEBUG: Successfully called startPreview method");
                return true;
            }
            
            // Look in all superclasses for startPreview method (thorough search)
            Log.e(TAG, "CAMERA DEBUG: Searching all superclasses for startPreview method...");
            Class<?> currentClass = streamer.getClass().getSuperclass();
            while (currentClass != null) {
                try {
                    for (Method method : currentClass.getDeclaredMethods()) {
                        if (method.getName().equals("startPreview")) {
                            Class<?>[] paramTypes = method.getParameterTypes();
                            if (paramTypes.length == 1 && 
                               (paramTypes[0] == android.view.SurfaceView.class || 
                                android.view.SurfaceView.class.isAssignableFrom(paramTypes[0]) || 
                                paramTypes[0] == android.view.Surface.class || 
                                paramTypes[0] == Object.class)) {
                                
                                Log.e(TAG, "CAMERA DEBUG: Found startPreview in " + currentClass.getSimpleName());
                                method.setAccessible(true);
                                method.invoke(streamer, surfaceView);
                                Log.e(TAG, "CAMERA DEBUG: Called startPreview via superclass");
                                return true;
                            }
                        }
                    }
                } catch (Exception e) {
                    // Continue to next superclass
                }
                currentClass = currentClass.getSuperclass();
            }
            
            // Try setting via a different method name (setPreview)
            Method setPreviewMethod = findMethod(streamer.getClass(), "setPreview", android.view.SurfaceView.class);
            if (setPreviewMethod != null) {
                Log.e(TAG, "CAMERA DEBUG: Found setPreview method as an alternative");
                setPreviewMethod.setAccessible(true);
                setPreviewMethod.invoke(streamer, surfaceView);
                Log.e(TAG, "CAMERA DEBUG: Camera preview surface set via setPreview");
                
                // After setting the preview, try to call the no-arg startPreview method
                Method noArgStartPreviewMethod = findMethod(streamer.getClass(), "startPreview");
                if (noArgStartPreviewMethod != null) {
                    Log.e(TAG, "CAMERA DEBUG: Found no-arg startPreview method");
                    noArgStartPreviewMethod.setAccessible(true);
                    noArgStartPreviewMethod.invoke(streamer);
                    Log.e(TAG, "CAMERA DEBUG: Called no-arg startPreview after setPreview");
                }
                return true;
            }
            
            // 3. As last resort, attempt a few other approaches
            
            // Try direct Surface approach - get Surface from SurfaceView and use it
            try {
                for (Method method : streamer.getClass().getMethods()) {
                    if (method.getName().contains("Preview") || method.getName().equals("setSurface")) {
                        Class<?>[] params = method.getParameterTypes();
                        if (params.length == 1 && params[0] == android.view.Surface.class) {
                            Log.e(TAG, "CAMERA DEBUG: Found method that takes a Surface: " + method.getName());
                            method.setAccessible(true);
                            method.invoke(streamer, surfaceView.getHolder().getSurface());
                            Log.e(TAG, "CAMERA DEBUG: Set preview with direct Surface");
                            return true;
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "CAMERA DEBUG: Error using direct Surface approach: " + e.getMessage());
            }
            
            // Try to explicitly start the camera as a last resort
            Log.e(TAG, "CAMERA DEBUG: Could not find any way to set preview - trying to start camera explicitly");
            explicitlyStartCamera();
            
            // Try to find and set preview field directly
            Field previewField = findField(streamer.getClass(), "preview");
            if (previewField != null) {
                Log.e(TAG, "CAMERA DEBUG: Found preview field - attempting to set directly");
                previewField.setAccessible(true);
                previewField.set(streamer, surfaceView);
                Log.e(TAG, "CAMERA DEBUG: Set preview field directly");
                
                // After setting the field, try to call the no-arg startPreview method
                Method plainStartPreviewMethod = findMethod(streamer.getClass(), "startPreview");
                if (plainStartPreviewMethod != null) {
                    plainStartPreviewMethod.setAccessible(true);
                    plainStartPreviewMethod.invoke(streamer);
                    Log.e(TAG, "CAMERA DEBUG: Called no-arg startPreview after setting field");
                }
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "CAMERA DEBUG: Error starting preview: " + e.getMessage(), e);
            e.printStackTrace();
        }
        
        Log.e(TAG, "CAMERA DEBUG: All preview initialization attempts failed");
        return false;
    }
    
    /**
     * Set the preview (backward compatibility method, delegates to startPreview)
     */
    public boolean setPreview(android.view.SurfaceView surfaceView) {
        Log.e(TAG, "CAMERA DEBUG: setPreview called - delegating to startPreview");
        return startPreview(surfaceView);
    }

    /**
     * Set default low-resource configurations for smart glasses
     */
    private void configureDefaultSettings() {
        try {
            // Video: QCIF resolution (176x144) at 15fps with low bitrate for smart glasses
            VideoConfig videoConfig = new VideoConfig(
                "video/avc",         // AVC/H.264 video codec
                250000,              // 250 kbps bitrate
                new Size(176, 144),  // QCIF resolution
                15,                  // 15 fps
                2,                   // profile - Baseline
                1,                   // level
                2.0f                 // GOP duration in seconds
            );
            
            // Audio: Mono audio with low bitrate for voice
            AudioConfig audioConfig = new AudioConfig(
                "audio/mp4a-latm",   // AAC audio codec
                32000,               // 32 kbps bitrate
                44100,               // 44.1 kHz sample rate
                1,                   // 1 channel (mono)
                16,                  // 16 bits per sample
                2,                   // AAC profile - LC
                false,               // Don't use variable bitrate
                false                // No echo cancellation
            );
            
            // Apply configurations using reflection since the methods are protected
            setVideoConfigWithReflection(videoConfig);
            setAudioConfigWithReflection(audioConfig);
            
            // Check for additional fields/methods we might need to configure for camera to work
            try {
                // Debug: check if camera is initialized or needs initialization
                Field cameraField = findField(streamer.getClass(), "camera");
                if (cameraField != null) {
                    cameraField.setAccessible(true);
                    Object camera = cameraField.get(streamer);
                    Log.d(TAG, "Camera field found: " + (camera != null ? "initialized" : "null"));
                } else {
                    Log.d(TAG, "No camera field found directly - might be in superclass");
                    
                    // Try to find camera initialization method
                    Method initCameraMethod = findMethod(streamer.getClass(), "initCamera");
                    if (initCameraMethod != null) {
                        Log.d(TAG, "Found initCamera method - attempting to call");
                        initCameraMethod.setAccessible(true);
                        initCameraMethod.invoke(streamer);
                    } else {
                        Log.d(TAG, "No initCamera method found directly - might be in a different method or superclass");
                        
                        // Check if preview is setup
                        Field previewField = findField(streamer.getClass(), "preview");
                        if (previewField != null) {
                            previewField.setAccessible(true);
                            Object preview = previewField.get(streamer);
                            Log.d(TAG, "Preview field found: " + (preview != null ? "initialized" : "null"));
                        } else {
                            Log.d(TAG, "No preview field found");
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking camera initialization: " + e.getMessage(), e);
            }
            
            Log.d(TAG, "Default video config: 176x144, 15fps, 250kbps");
            Log.d(TAG, "Default audio config: 44.1kHz mono, 32kbps");
        } catch (Exception e) {
            Log.e(TAG, "Error setting default configurations: " + e.getMessage(), e);
        }
    }

    /**
     * Sets video config using reflection to bypass protection level
     */
    private void setVideoConfigWithReflection(VideoConfig videoConfig) {
        try {
            // First try field access
            Field videoConfigField = findField(streamer.getClass(), "videoConfig");
            if (videoConfigField != null) {
                videoConfigField.setAccessible(true);
                videoConfigField.set(streamer, videoConfig);
                Log.d(TAG, "Video config set via field reflection");
                return;
            }
            
            // Then try method access
            Method setVideoConfigMethod = findMethod(streamer.getClass(), "setVideoConfig", VideoConfig.class);
            if (setVideoConfigMethod != null) {
                setVideoConfigMethod.setAccessible(true);
                setVideoConfigMethod.invoke(streamer, videoConfig);
                Log.d(TAG, "Video config set via method reflection");
                return;
            }
            
            // Look in superclasses
            Class<?> currentClass = streamer.getClass().getSuperclass();
            while (currentClass != null) {
                Method method = findMethod(currentClass, "setVideoConfig", VideoConfig.class);
                if (method != null) {
                    method.setAccessible(true);
                    method.invoke(streamer, videoConfig);
                    Log.d(TAG, "Video config set via superclass method reflection");
                    return;
                }
                currentClass = currentClass.getSuperclass();
            }
            
            Log.e(TAG, "Failed to set video config - no accessible method found");
        } catch (Exception e) {
            Log.e(TAG, "Error setting video config via reflection: " + e.getMessage(), e);
        }
    }
    
    /**
     * Sets audio config using reflection to bypass protection level or find method
     */
    private void setAudioConfigWithReflection(AudioConfig audioConfig) {
        try {
            // First try field access
            Field audioConfigField = findField(streamer.getClass(), "audioConfig");
            if (audioConfigField != null) {
                audioConfigField.setAccessible(true);
                audioConfigField.set(streamer, audioConfig);
                Log.d(TAG, "Audio config set via field reflection");
                return;
            }
            
            // Then try method access
            Method setAudioConfigMethod = findMethod(streamer.getClass(), "setAudioConfig", AudioConfig.class);
            if (setAudioConfigMethod != null) {
                setAudioConfigMethod.setAccessible(true);
                setAudioConfigMethod.invoke(streamer, audioConfig);
                Log.d(TAG, "Audio config set via method reflection");
                return;
            }
            
            // Look in superclasses
            Class<?> currentClass = streamer.getClass().getSuperclass();
            while (currentClass != null) {
                Method method = findMethod(currentClass, "setAudioConfig", AudioConfig.class);
                if (method != null) {
                    method.setAccessible(true);
                    method.invoke(streamer, audioConfig);
                    Log.d(TAG, "Audio config set via superclass method reflection");
                    return;
                }
                currentClass = currentClass.getSuperclass();
            }
            
            Log.e(TAG, "Failed to set audio config - no accessible method found");
        } catch (Exception e) {
            Log.e(TAG, "Error setting audio config via reflection: " + e.getMessage(), e);
        }
    }
    
    /**
     * Helper method to find a field in a class or its superclasses
     */
    private Field findField(Class<?> clazz, String fieldName) {
        Class<?> currentClass = clazz;
        while (currentClass != null) {
            try {
                Field field = currentClass.getDeclaredField(fieldName);
                return field;
            } catch (NoSuchFieldException e) {
                currentClass = currentClass.getSuperclass();
            }
        }
        return null;
    }
    
    /**
     * Helper method to find a method in a class
     */
    private Method findMethod(Class<?> clazz, String methodName, Class<?>... parameterTypes) {
        try {
            return clazz.getDeclaredMethod(methodName, parameterTypes);
        } catch (NoSuchMethodException e) {
            return null;
        }
    }

    /**
     * Configure video streaming settings
     * 
     * @param bitrate Bitrate in bits per second
     * @param width Video width
     * @param height Video height
     * @param fps Frames per second
     */
    public void configureVideo(int bitrate, int width, int height, int fps) {
        try {
            VideoConfig videoConfig = new VideoConfig(
                "video/avc",         // AVC/H.264 video codec
                bitrate,             // Custom bitrate
                new Size(width, height), // Custom resolution
                fps,                 // Custom fps
                2,                   // profile - Baseline
                1,                   // level
                2.0f                 // GOP duration in seconds
            );
            
            setVideoConfigWithReflection(videoConfig);
            Log.d(TAG, "Video configured: " + width + "x" + height + ", " + fps + "fps, " + bitrate + "bps");
        } catch (Exception e) {
            Log.e(TAG, "Failed to configure video: " + e.getMessage(), e);
        }
    }

    /**
     * Configure audio streaming settings
     * 
     * @param bitrate Audio bitrate in bits per second
     * @param sampleRate Audio sample rate
     * @param stereo Whether to use stereo (true) or mono (false)
     */
    public void configureAudio(int bitrate, int sampleRate, boolean stereo) {
        try {
            AudioConfig audioConfig = new AudioConfig(
                "audio/mp4a-latm",   // AAC audio codec
                bitrate,             // Custom bitrate
                sampleRate,          // Custom sample rate
                stereo ? 2 : 1,      // Channels (2 for stereo, 1 for mono)
                16,                  // 16 bits per sample
                2,                   // AAC profile - LC
                false,               // Don't use variable bitrate
                false                // No echo cancellation
            );
            
            setAudioConfigWithReflection(audioConfig);
            Log.d(TAG, "Audio configured: " + sampleRate + "Hz, " + (stereo ? "stereo" : "mono") + ", " + bitrate + "bps");
        } catch (Exception e) {
            Log.e(TAG, "Failed to configure audio: " + e.getMessage(), e);
        }
    }

    /**
     * Start streaming to the specified RTMP URL
     * 
     * @param rtmpUrl RTMP stream URL (e.g., rtmp://server.com/live/stream-key)
     * @param callback Callback to receive streaming status
     */
    public void startStreaming(String rtmpUrl, final StreamingCallback callback) {
        if (isStreaming) {
            Log.w(TAG, "Streaming already in progress");
            return;
        }
        
        // Create thread to handle RTMP operations
        Thread streamingThread = new Thread(() -> {
            try {
                Log.d(TAG, "Connecting to RTMP server: " + rtmpUrl);
                
                // Use runBlocking to call Kotlin suspend connect function
                BuildersKt.runBlocking(
                    Dispatchers.getIO(),
                    (scope, continuation) -> {
                        try {
                            // Call the connect method
                            Method connectMethod = findMethod(
                                streamer.getClass(), 
                                "connect", 
                                String.class, 
                                Continuation.class
                            );
                            
                            if (connectMethod != null) {
                                connectMethod.setAccessible(true);
                                connectMethod.invoke(streamer, rtmpUrl, continuation);
                                Log.d(TAG, "Connected to RTMP server");
                                
                                // Now try to call startStream - this is most likely inside the RtmpProducer class
                                // First, try to find RtmpProducer field
                                Field rtmpProducerField = findField(streamer.getClass(), "rtmpProducer");
                                if (rtmpProducerField != null) {
                                    rtmpProducerField.setAccessible(true);
                                    Object rtmpProducer = rtmpProducerField.get(streamer);
                                    
                                    if (rtmpProducer != null) {
                                        // Try to find startStream method on the RtmpProducer instance
                                        Method startStreamMethod = findMethod(
                                            rtmpProducer.getClass(),
                                            "startStream",
                                            Continuation.class
                                        );
                                        
                                        if (startStreamMethod != null) {
                                            startStreamMethod.setAccessible(true);
                                            startStreamMethod.invoke(rtmpProducer, continuation);
                                            
                                            // Update state
                                            isStreaming = true;
                                            Log.i(TAG, "Streaming started successfully to: " + rtmpUrl);
                                            
                                            // Notify callback on main thread
                                            if (callback != null) {
                                                android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                                mainHandler.post(callback::onStreamingStarted);
                                            }
                                            return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                                        }
                                    }
                                }
                                
                                // If we reach here, try the direct approach as a fallback
                                // Make sure camera is started before streaming
                                Log.e(TAG, "CAMERA DEBUG: Attempting to start camera...");
                                
                                // Check for camera states first
                                Field cameraField = findField(streamer.getClass(), "camera");
                                if (cameraField != null) {
                                    cameraField.setAccessible(true);
                                    Object camera = cameraField.get(streamer);
                                    Log.e(TAG, "CAMERA DEBUG: Found camera field: " + (camera != null ? "initialized" : "null"));
                                }
                                
                                // Look for other camera-related states
                                String[] cameraFieldNames = {"mCamera", "videoSource", "videoSurface", "videoSource", "cameraDevice", "cameraManager", "cameraProvider", "preview"};
                                for (String fieldName : cameraFieldNames) {
                                    Field field = findField(streamer.getClass(), fieldName);
                                    if (field != null) {
                                        field.setAccessible(true);
                                        Object value = field.get(streamer);
                                        Log.e(TAG, "CAMERA DEBUG: Found camera field '" + fieldName + "': " + (value != null ? "initialized" : "null"));
                                    }
                                }
                                
                                // Start with precise method
                                Method startCameraMethod = findMethod(streamer.getClass(), "startCamera");
                                if (startCameraMethod != null) {
                                    Log.d(TAG, "📷 Calling startCamera() method directly");
                                    startCameraMethod.setAccessible(true);
                                    try {
                                        startCameraMethod.invoke(streamer);
                                        Log.d(TAG, "📷 Camera started successfully");
                                    } catch (Exception e) {
                                        Log.e(TAG, "📷 Error starting camera: " + e.getMessage(), e);
                                    }
                                } else {
                                    // Try to find in superclasses
                                    Log.d(TAG, "📷 Searching for startCamera method in superclasses");
                                    Class<?> currentClass = streamer.getClass().getSuperclass();
                                    while (currentClass != null && startCameraMethod == null) {
                                        Log.d(TAG, "📷 Checking superclass: " + currentClass.getSimpleName());
                                        try {
                                            startCameraMethod = currentClass.getDeclaredMethod("startCamera");
                                            if (startCameraMethod != null) {
                                                Log.d(TAG, "📷 Found startCamera() in superclass: " + currentClass.getSimpleName());
                                                startCameraMethod.setAccessible(true);
                                                try {
                                                    startCameraMethod.invoke(streamer);
                                                    Log.d(TAG, "📷 Camera started successfully via superclass method");
                                                } catch (Exception e) {
                                                    Log.e(TAG, "📷 Error starting camera via superclass method: " + e.getMessage(), e);
                                                }
                                                break;
                                            }
                                        } catch (Exception e) {
                                            // Continue to next superclass
                                            currentClass = currentClass.getSuperclass();
                                        }
                                    }
                                    
                                    // Try alternate method names
                                    if (startCameraMethod == null) {
                                        Log.d(TAG, "📷 Trying alternate camera start methods");
                                        String[] methodNames = {"openCamera", "initCamera", "setupCamera", "startPreview", "prepare"};
                                        for (String methodName : methodNames) {
                                            Method altMethod = findMethod(streamer.getClass(), methodName);
                                            if (altMethod != null) {
                                                Log.d(TAG, "📷 Found alternate method: " + methodName);
                                                altMethod.setAccessible(true);
                                                try {
                                                    altMethod.invoke(streamer);
                                                    Log.d(TAG, "📷 Camera possibly started via " + methodName);
                                                } catch (Exception e) {
                                                    Log.e(TAG, "📷 Error using alternate method " + methodName + ": " + e.getMessage());
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (startCameraMethod == null) {
                                        Log.e(TAG, "CAMERA DEBUG: No startCamera method found - attempting direct camera access");
                                        
                                        // Try to directly open a camera for the streamer
                                        try {
                                            // Try to use Camera2 API if available
                                            android.hardware.camera2.CameraManager cameraManager = 
                                                (android.hardware.camera2.CameraManager) context.getSystemService(android.content.Context.CAMERA_SERVICE);
                                            if (cameraManager != null) {
                                                String[] cameraIds = cameraManager.getCameraIdList();
                                                if (cameraIds.length > 0) {
                                                    Log.e(TAG, "CAMERA DEBUG: Found " + cameraIds.length + " available cameras");
                                                    
                                                    // Use reflection to set a camera manager field if exists
                                                    Field camManagerField = findField(streamer.getClass(), "cameraManager");
                                                    if (camManagerField != null) {
                                                        camManagerField.setAccessible(true);
                                                        camManagerField.set(streamer, cameraManager);
                                                        Log.e(TAG, "CAMERA DEBUG: Set cameraManager field directly");
                                                    }
                                                }
                                            }
                                        } catch (Exception e) {
                                            Log.e(TAG, "CAMERA DEBUG: Error directly opening camera: " + e.getMessage(), e);
                                        }
                                    }
                                }
                            
                                Method startStreamMethod = findMethod(
                                    streamer.getClass(), 
                                    "startStream", 
                                    Continuation.class
                                );
                                
                                if (startStreamMethod != null) {
                                    startStreamMethod.setAccessible(true);
                                    startStreamMethod.invoke(streamer, continuation);
                                    
                                    // Update state
                                    isStreaming = true;
                                    Log.i(TAG, "Streaming started successfully to: " + rtmpUrl);
                                    
                                    // Notify callback on main thread
                                    if (callback != null) {
                                        android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                        mainHandler.post(callback::onStreamingStarted);
                                    }
                                } else {
                                    Log.e(TAG, "startStream method not found in either the streamer or rtmpProducer");
                                    if (callback != null) {
                                        android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                        mainHandler.post(() -> callback.onStreamingError("startStream method not found"));
                                    }
                                }
                            } else {
                                Log.e(TAG, "connect method not found");
                                if (callback != null) {
                                    android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                    mainHandler.post(() -> callback.onStreamingError("connect method not found"));
                                }
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error starting stream: " + e.getMessage(), e);
                            isStreaming = false;
                            
                            // Notify callback on main thread
                            if (callback != null) {
                                final String errorMsg = e.getMessage();
                                android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                mainHandler.post(() -> callback.onStreamingError("Failed to start streaming: " + errorMsg));
                            }
                        }
                        return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                    }
                );
            } catch (Exception e) {
                Log.e(TAG, "Failed to start streaming", e);
                isStreaming = false;
                
                // Notify callback on main thread
                if (callback != null) {
                    final String errorMsg = e.getMessage();
                    android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                    mainHandler.post(() -> callback.onStreamingError("Failed to start streaming: " + errorMsg));
                }
            }
        });
        
        // Start the streaming thread
        streamingThread.start();
    }

    /**
     * Stop the current stream
     * 
     * @param callback Callback to receive status update
     */
    public void stopStreaming(final StreamingCallback callback) {
        if (!isStreaming) {
            Log.w(TAG, "No streaming in progress");
            return;
        }
        
        Thread disconnectThread = new Thread(() -> {
            try {
                // Use runBlocking to call Kotlin suspend disconnect function
                BuildersKt.runBlocking(
                    Dispatchers.getIO(),
                    (scope, continuation) -> {
                        try {
                            if (streamer.isConnected()) {
                                // First, try to find and call stopStream on rtmpProducer
                                Field rtmpProducerField = findField(streamer.getClass(), "rtmpProducer");
                                if (rtmpProducerField != null) {
                                    rtmpProducerField.setAccessible(true);
                                    Object rtmpProducer = rtmpProducerField.get(streamer);
                                    
                                    if (rtmpProducer != null) {
                                        // Try to find stopStream method on the RtmpProducer instance
                                        Method stopStreamMethod = findMethod(
                                            rtmpProducer.getClass(),
                                            "stopStream",
                                            Continuation.class
                                        );
                                        
                                        if (stopStreamMethod != null) {
                                            stopStreamMethod.setAccessible(true);
                                            stopStreamMethod.invoke(rtmpProducer, continuation);
                                            Log.d(TAG, "Stopped stream via rtmpProducer.stopStream()");
                                        }
                                    }
                                }
                            
                                // Now call disconnect method via reflection
                                Method disconnectMethod = findMethod(
                                    streamer.getClass(), 
                                    "disconnect"
                                );
                                
                                if (disconnectMethod != null) {
                                    disconnectMethod.setAccessible(true);
                                    disconnectMethod.invoke(streamer);
                                    
                                    // Update state
                                    isStreaming = false;
                                    Log.i(TAG, "Streaming stopped successfully");
                                    
                                    // Notify callback on main thread
                                    if (callback != null) {
                                        android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                        mainHandler.post(callback::onStreamingStopped);
                                    }
                                } else {
                                    Log.e(TAG, "disconnect method not found");
                                    if (callback != null) {
                                        android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                        mainHandler.post(() -> callback.onStreamingError("disconnect method not found"));
                                    }
                                }
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error stopping stream: " + e.getMessage(), e);
                            
                            // Notify callback on main thread
                            if (callback != null) {
                                final String errorMsg = e.getMessage();
                                android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                                mainHandler.post(() -> callback.onStreamingError("Error stopping stream: " + errorMsg));
                            }
                        }
                        return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                    }
                );
            } catch (Exception e) {
                Log.e(TAG, "Failed to stop streaming", e);
                
                // Notify callback on main thread
                if (callback != null) {
                    final String errorMsg = e.getMessage();
                    android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                    mainHandler.post(() -> callback.onStreamingError("Error stopping stream: " + errorMsg));
                }
            }
        });
        
        // Start the disconnect thread
        disconnectThread.start();
    }

    /**
     * Release all resources associated with the streaming manager
     * Call this when you're completely done with the streamer
     */
    public void release() {
        try {
            stopStreaming(null);
            streamer.release();
            Log.d(TAG, "RTMP streamer resources released");
        } catch (Exception e) {
            Log.e(TAG, "Error releasing resources: " + e.getMessage(), e);
        }
    }

    /**
     * Check if streaming is currently active
     * 
     * @return true if streaming, false otherwise
     */
    public boolean isStreaming() {
        return isStreaming;
    }
}