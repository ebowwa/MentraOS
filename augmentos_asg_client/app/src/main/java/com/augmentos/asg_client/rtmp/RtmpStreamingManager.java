package com.augmentos.asg_client.rtmp;

import android.content.Context;
import android.util.Log;
import android.util.Size;

import io.github.thibaultbee.streampack.data.AudioConfig;
import io.github.thibaultbee.streampack.data.VideoConfig;
import io.github.thibaultbee.streampack.ext.rtmp.streamers.CameraRtmpLiveStreamer;
import io.github.thibaultbee.streampack.listeners.OnConnectionListener;
import io.github.thibaultbee.streampack.listeners.OnErrorListener;
import io.github.thibaultbee.streampack.error.StreamPackError;

import kotlinx.coroutines.BuildersKt;
import kotlinx.coroutines.CoroutineScope;
import kotlinx.coroutines.Dispatchers;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlin.coroutines.intrinsics.CoroutineSingletons;
import kotlin.jvm.functions.Function2;

import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;

/**
 * Helper class for RTMP streaming with optimizations for smart glasses
 */
public class RtmpStreamingManager {
    private static final String TAG = "RtmpStreaming";
    private final Context mContext;
    private CameraRtmpLiveStreamer mStreamer;
    private boolean mIsInitialized = false;

    /**
     * Create a new RtmpStreamingManager
     *
     * @param context  Application context
     */
    public RtmpStreamingManager(Context context) {
        mContext = context;
    }

    /**
     * Initialize the RTMP streamer with optimized settings for smart glasses
     * @return true if initialization was successful
     */
    public boolean initialize() {
        if (mIsInitialized) {
            return true;
        }

        try {
            // Create streamer with callbacks 
            Log.d(TAG, "Creating CameraRtmpLiveStreamer");
            
            // For testing, if audio causes issues, we can disable it
            boolean enableAudio = true;
            
            try {
                // Check if we have audio permission
                int permissionCheck = mContext.checkCallingOrSelfPermission(android.Manifest.permission.RECORD_AUDIO);
                if (permissionCheck != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    Log.w(TAG, "⚠️ RECORD_AUDIO permission not granted! Disabling audio for streaming.");
                    enableAudio = false;
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking audio permission: " + e.getMessage());
                enableAudio = false;
            }
            
            mStreamer = new CameraRtmpLiveStreamer(
                mContext,
                enableAudio, // enable audio based on permissions
                new OnErrorListener() {
                    @Override
                    public void onError(StreamPackError error) {
                        Log.e(TAG, "Streaming error: " + error.getMessage());
                    }
                },
                new OnConnectionListener() {
                    @Override
                    public void onSuccess() {
                        Log.d(TAG, "RTMP connection successful");
                    }

                    @Override
                    public void onFailed(String reason) {
                        Log.e(TAG, "RTMP connection failed: " + reason);
                    }

                    @Override
                    public void onLost(String reason) {
                        Log.e(TAG, "RTMP connection lost: " + reason);
                    }
                }
            );

            // Configure video and audio settings - verify they were successful
            boolean videoConfigured = configureVideoSettings();
            boolean audioConfigured = configureAudioSettings();
            
            if (!videoConfigured) {
                Log.e(TAG, "CRITICAL: Video configuration failed. RTMP streaming will fail without video config.");
                return false;
            }
            
            if (!audioConfigured) {
                Log.w(TAG, "WARNING: Audio configuration failed. Streaming might work with just video.");
                // We don't fail the initialization for audio config failure
            }
            
            // Dump the state of streamer to debug log
            dumpStreamerState();

            mIsInitialized = true;
            Log.d(TAG, "RTMP streaming manager initialized with optimized settings");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize RTMP streamer", e);
            return false;
        }
    }
    
    /**
     * Dump the state of the streamer object to help with debugging
     */
    private void dumpStreamerState() {
        if (mStreamer == null) return;
        
        try {
            Log.d(TAG, "--------------- RTMP Streamer State ---------------");
            // Check if video config is set
            try {
                Field videoConfigField = findField(mStreamer.getClass(), "videoConfig");
                if (videoConfigField != null) {
                    videoConfigField.setAccessible(true);
                    Object videoConfig = videoConfigField.get(mStreamer);
                    Log.d(TAG, "VideoConfig: " + (videoConfig != null ? "SET" : "NULL"));
                } else {
                    Log.d(TAG, "VideoConfig field not found");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking videoConfig: " + e.getMessage());
            }
            
            // Check if audio config is set
            try {
                Field audioConfigField = findField(mStreamer.getClass(), "audioConfig");
                if (audioConfigField != null) {
                    audioConfigField.setAccessible(true);
                    Object audioConfig = audioConfigField.get(mStreamer);
                    Log.d(TAG, "AudioConfig: " + (audioConfig != null ? "SET" : "NULL"));
                } else {
                    Log.d(TAG, "AudioConfig field not found");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error checking audioConfig: " + e.getMessage());
            }
            
            // Check the class hierarchy to help with debugging
            Log.d(TAG, "Class: " + mStreamer.getClass().getName());
            Log.d(TAG, "Superclass: " + mStreamer.getClass().getSuperclass().getName());
            StringBuilder interfaces = new StringBuilder();
            for (Class<?> iface : mStreamer.getClass().getInterfaces()) {
                interfaces.append(iface.getName()).append(", ");
            }
            Log.d(TAG, "Interfaces: " + (interfaces.length() > 0 ? interfaces.toString() : "none"));
            Log.d(TAG, "---------------------------------------------------");
        } catch (Exception e) {
            Log.e(TAG, "Error dumping streamer state", e);
        }
    }

    /**
     * Configure video with optimized settings for smart glasses
     * @return true if video was successfully configured
     */
    private boolean configureVideoSettings() {
        try {
            Log.d(TAG, "Configuring video settings for RTMP streaming");
            
            // QCIF resolution (176x144) at 15fps
            // Create a Size object for resolution
            android.util.Size resolution = new android.util.Size(176, 144);
            
            // Use the correct VideoConfig constructor based on available signatures
            VideoConfig videoConfig = null;
            
            try {
                // First constructor: mimeType, startBitrate, resolution, fps, profile, level, gopDuration
                videoConfig = new VideoConfig(
                    "video/avc",          // mimeType
                    250000,               // startBitrate in bps
                    resolution,           // resolution as Size object
                    15,                   // fps
                    2,                    // profile (2 for Baseline profile)
                    1,                    // level (1 for Level 1)
                    2.0f                  // GOP duration in seconds
                );
                Log.d(TAG, "Created VideoConfig with full constructor: profile=2, level=1");
            } catch (Exception e) {
                Log.e(TAG, "Error with full VideoConfig constructor: " + e.getMessage() + ". Trying alternative approach...");
                try {
                    // Try to create with default constructor and set fields via reflection
                    videoConfig = new VideoConfig();
                    
                    // Set fields via reflection
                    Class<?> videoConfigClass = videoConfig.getClass();
                    
                    // Set mimetype field
                    try {
                        Field mimeTypeField = findField(videoConfigClass, "mimeType");
                        if (mimeTypeField != null) {
                            mimeTypeField.setAccessible(true);
                            mimeTypeField.set(videoConfig, "video/avc");
                        }
                    } catch (Exception ex) {
                        Log.e(TAG, "Error setting mimeType: " + ex.getMessage());
                    }
                    
                    // Set bitrate field
                    try {
                        Field bitrateField = findField(videoConfigClass, "bitrate");
                        if (bitrateField != null) {
                            bitrateField.setAccessible(true);
                            bitrateField.set(videoConfig, 250000);
                        }
                    } catch (Exception ex) {
                        Log.e(TAG, "Error setting bitrate: " + ex.getMessage());
                    }
                    
                    // Set resolution field
                    try {
                        Field resolutionField = findField(videoConfigClass, "resolution");
                        if (resolutionField != null) {
                            resolutionField.setAccessible(true);
                            resolutionField.set(videoConfig, resolution);
                        }
                    } catch (Exception ex) {
                        Log.e(TAG, "Error setting resolution: " + ex.getMessage());
                    }
                    
                    // Set fps field
                    try {
                        Field fpsField = findField(videoConfigClass, "fps");
                        if (fpsField != null) {
                            fpsField.setAccessible(true);
                            fpsField.set(videoConfig, 15);
                        }
                    } catch (Exception ex) {
                        Log.e(TAG, "Error setting fps: " + ex.getMessage());
                    }
                    
                    Log.d(TAG, "Created VideoConfig with default constructor and reflection");
                } catch (Exception e2) {
                    Log.e(TAG, "Failed to create VideoConfig via all methods: " + e2.getMessage());
                    return false;
                }
            }
            
            // First try using direct field access for videoConfig
            try {
                Field videoConfigField = findField(mStreamer.getClass(), "videoConfig");
                if (videoConfigField != null) {
                    videoConfigField.setAccessible(true);
                    videoConfigField.set(mStreamer, videoConfig);
                    Log.d(TAG, "Video configured via direct field access: 176x144 @ 15fps, 250kbps");
                    return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to set video config via direct field access: " + e.getMessage());
            }
            
            // Try using the setter method if field access failed
            try {
                // First try the direct class
                Method method = findMethod(mStreamer.getClass(), "setVideoConfig", VideoConfig.class);
                if (method != null) {
                    method.setAccessible(true);
                    method.invoke(mStreamer, videoConfig);
                    Log.d(TAG, "Video configured via direct method: 176x144 @ 15fps, 250kbps");
                    return true;
                }
                
                // Then try superclass if direct method not found
                method = findMethod(mStreamer.getClass().getSuperclass(), "setVideoConfig", VideoConfig.class);
                if (method != null) {
                    method.setAccessible(true);
                    method.invoke(mStreamer, videoConfig);
                    Log.d(TAG, "Video configured via superclass method: 176x144 @ 15fps, 250kbps");
                    return true;
                }
                
                // Look through all interfaces
                for (Class<?> iface : mStreamer.getClass().getInterfaces()) {
                    method = findMethod(iface, "setVideoConfig", VideoConfig.class);
                    if (method != null) {
                        method.setAccessible(true);
                        method.invoke(mStreamer, videoConfig);
                        Log.d(TAG, "Video configured via interface method: 176x144 @ 15fps, 250kbps");
                        return true;
                    }
                }
                
                Log.e(TAG, "Could not find setVideoConfig method in any class or interface");
                return false;
            } catch (Exception e) {
                Log.e(TAG, "Failed to set video config via reflection: " + e.getMessage(), e);
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error configuring video: " + e.getMessage(), e);
            return false;
        }
    }
    
    /**
     * Helper method to find a method in a class or its superclasses
     */
    private Method findMethod(Class<?> clazz, String methodName, Class<?>... paramTypes) {
        while (clazz != null) {
            try {
                return clazz.getDeclaredMethod(methodName, paramTypes);
            } catch (NoSuchMethodException e) {
                clazz = clazz.getSuperclass();
            }
        }
        return null;
    }
    
    /**
     * Helper method to find a field in a class or its superclasses
     */
    private Field findField(Class<?> clazz, String fieldName) {
        while (clazz != null) {
            try {
                return clazz.getDeclaredField(fieldName);
            } catch (NoSuchFieldException e) {
                clazz = clazz.getSuperclass();
            }
        }
        return null;
    }
    
    /**
     * Check if audio is available for the streamer
     */
    private boolean isAudioAvailable(Object streamer) {
        if (streamer == null) return false;
        
        try {
            // First, see if the streamer has audio enabled
            Method isAudioEnabledMethod = findMethod(streamer.getClass(), "isAudioEnabled");
            if (isAudioEnabledMethod != null) {
                isAudioEnabledMethod.setAccessible(true);
                Boolean audioEnabled = (Boolean)isAudioEnabledMethod.invoke(streamer);
                if (audioEnabled == null || !audioEnabled) {
                    return false; // Audio is explicitly disabled
                }
            }
            
            // Check if we have audio permission
            int permissionCheck = mContext.checkCallingOrSelfPermission(android.Manifest.permission.RECORD_AUDIO);
            if (permissionCheck != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                return false; // No permission, can't use audio
            }
            
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error checking audio availability: " + e.getMessage());
            return false; // Assume no audio available on error
        }
    }

    /**
     * Configure audio with optimized settings for smart glasses
     * @return true if audio was successfully configured
     */
    private boolean configureAudioSettings() {
        try {
            Log.d(TAG, "Configuring audio settings for RTMP streaming");
            
            // First check if audio is enabled - if not, we return true because we don't need audio config
            try {
                Method isAudioEnabledMethod = findMethod(mStreamer.getClass(), "isAudioEnabled");
                if (isAudioEnabledMethod != null) {
                    isAudioEnabledMethod.setAccessible(true);
                    Boolean audioEnabled = (Boolean)isAudioEnabledMethod.invoke(mStreamer);
                    if (audioEnabled != null && !audioEnabled) {
                        Log.d(TAG, "Audio is disabled, skipping audio configuration");
                        return true; // Audio is disabled, so we don't need to configure it
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to check if audio is enabled: " + e.getMessage());
                // Continue trying to configure audio anyway
            }
            
            // Create AudioConfig with default constructor
            AudioConfig audioConfig = null;
            try {
                audioConfig = new AudioConfig();
                Log.d(TAG, "Created AudioConfig with default constructor");
                
                // Try to set properties with reflection
                Method setBitrateMethod = findMethod(AudioConfig.class, "setBitrate", int.class);
                if (setBitrateMethod != null) {
                    setBitrateMethod.setAccessible(true);
                    setBitrateMethod.invoke(audioConfig, 32000);
                } else {
                    // Try direct field access
                    Field bitrateField = findField(AudioConfig.class, "bitrate");
                    if (bitrateField != null) {
                        bitrateField.setAccessible(true);
                        bitrateField.set(audioConfig, 32000);
                    }
                }
                
                Method setSampleRateMethod = findMethod(AudioConfig.class, "setSampleRate", int.class);
                if (setSampleRateMethod != null) {
                    setSampleRateMethod.setAccessible(true);
                    setSampleRateMethod.invoke(audioConfig, 44100);
                } else {
                    // Try direct field access
                    Field sampleRateField = findField(AudioConfig.class, "sampleRate");
                    if (sampleRateField != null) {
                        sampleRateField.setAccessible(true);
                        sampleRateField.set(audioConfig, 44100);
                    }
                }
                
                Method setStereoMethod = findMethod(AudioConfig.class, "setStereo", boolean.class);
                if (setStereoMethod != null) {
                    setStereoMethod.setAccessible(true);
                    setStereoMethod.invoke(audioConfig, false);
                } else {
                    // Try direct field access
                    Field stereoField = findField(AudioConfig.class, "stereo");
                    if (stereoField != null) {
                        stereoField.setAccessible(true);
                        stereoField.set(audioConfig, false);
                    }
                }
            } catch (Exception ex) {
                Log.e(TAG, "Error creating or configuring AudioConfig: " + ex.getMessage());
            }
            
            if (audioConfig == null) {
                Log.e(TAG, "Failed to create AudioConfig");
                
                // Try to disable audio as a fallback
                try {
                    Method setAudioEnabledMethod = findMethod(mStreamer.getClass(), "setAudioEnabled", boolean.class);
                    if (setAudioEnabledMethod != null) {
                        setAudioEnabledMethod.setAccessible(true);
                        setAudioEnabledMethod.invoke(mStreamer, false);
                        Log.w(TAG, "Disabled audio as fallback since AudioConfig creation failed");
                        return true; // We successfully disabled audio
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to disable audio: " + e.getMessage());
                }
                
                return false;
            }
            
            // First try using direct field access for audioConfig
            try {
                Field audioConfigField = findField(mStreamer.getClass(), "audioConfig");
                if (audioConfigField != null) {
                    audioConfigField.setAccessible(true);
                    audioConfigField.set(mStreamer, audioConfig);
                    Log.d(TAG, "Audio configured via direct field access: 44.1kHz, mono, 32kbps");
                    return true;
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to set audio config via direct field access: " + e.getMessage());
            }
            
            // Try using the setter method if field access failed
            try {
                // First try the direct class
                Method method = findMethod(mStreamer.getClass(), "setAudioConfig", AudioConfig.class);
                if (method != null) {
                    method.setAccessible(true);
                    method.invoke(mStreamer, audioConfig);
                    Log.d(TAG, "Audio configured via direct method: 44.1kHz, mono, 32kbps");
                    return true;
                }
                
                // Then try superclass if direct method not found
                method = findMethod(mStreamer.getClass().getSuperclass(), "setAudioConfig", AudioConfig.class);
                if (method != null) {
                    method.setAccessible(true);
                    method.invoke(mStreamer, audioConfig);
                    Log.d(TAG, "Audio configured via superclass method: 44.1kHz, mono, 32kbps");
                    return true;
                }
                
                // Look through all interfaces
                for (Class<?> iface : mStreamer.getClass().getInterfaces()) {
                    method = findMethod(iface, "setAudioConfig", AudioConfig.class);
                    if (method != null) {
                        method.setAccessible(true);
                        method.invoke(mStreamer, audioConfig);
                        Log.d(TAG, "Audio configured via interface method: 44.1kHz, mono, 32kbps");
                        return true;
                    }
                }
                
                Log.e(TAG, "Could not find setAudioConfig method in any class or interface");
                
                // Try to disable audio as a fallback
                try {
                    Method setAudioEnabledMethod = findMethod(mStreamer.getClass(), "setAudioEnabled", boolean.class);
                    if (setAudioEnabledMethod != null) {
                        setAudioEnabledMethod.setAccessible(true);
                        setAudioEnabledMethod.invoke(mStreamer, false);
                        Log.w(TAG, "Disabled audio as fallback since setting AudioConfig failed");
                        return true; // We successfully disabled audio
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to disable audio: " + e.getMessage());
                }
                
                return false;
            } catch (Exception e) {
                Log.e(TAG, "Failed to set audio config via reflection: " + e.getMessage(), e);
                
                // Try to disable audio as a fallback
                try {
                    Method setAudioEnabledMethod = findMethod(mStreamer.getClass(), "setAudioEnabled", boolean.class);
                    if (setAudioEnabledMethod != null) {
                        setAudioEnabledMethod.setAccessible(true);
                        setAudioEnabledMethod.invoke(mStreamer, false);
                        Log.w(TAG, "Disabled audio as fallback due to error: " + e.getMessage());
                        return true; // We successfully disabled audio
                    }
                } catch (Exception ex) {
                    Log.e(TAG, "Failed to disable audio: " + ex.getMessage());
                }
                
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error configuring audio: " + e.getMessage(), e);
            return false;
        }
    }

    /**
     * Start streaming to the specified RTMP URL
     *
     * @param rtmpUrl  The RTMP URL to stream to
     * @return true if streaming started successfully (or at least the process was initiated)
     */
    public boolean startStreaming(final String rtmpUrl) {
        // Make sure we're initialized
        if (!mIsInitialized) {
            boolean success = initialize();
            if (!success) {
                Log.e(TAG, "Failed to initialize RTMP streamer - cannot start streaming");
                return false;
            }
        }

        if (mStreamer == null) {
            Log.e(TAG, "Cannot start streaming - streamer not initialized");
            return false;
        }
        
        // Double check that video config is set by dumping state
        dumpStreamerState();

        Log.d(TAG, "Starting RTMP stream to: " + rtmpUrl);

        // Use a simpler approach with runBlocking to handle suspend functions
        try {
            // Create thread to handle RTMP operations
            Thread streamingThread = new Thread(() -> {
                try {
                    Log.d(TAG, "Connecting to RTMP server: " + rtmpUrl);
                    
                    // Use runBlocking to call suspend functions
                    kotlinx.coroutines.BuildersKt.runBlocking(
                        Dispatchers.getIO(),
                        (Function2<kotlinx.coroutines.CoroutineScope, kotlin.coroutines.Continuation<? super Unit>, kotlin.coroutines.intrinsics.CoroutineSingletons>) 
                        (scope, continuation) -> {
                            try {
                                // Make extra sure videoConfig is set - try once more
                                try {
                                    configureVideoSettings();
                                } catch (Exception ve) {
                                    Log.e(TAG, "Last attempt to set video config failed", ve);
                                }
                                
                                // We need to manually call the Kotlin suspend functions from Java using reflection
                                Method connectMethod = findMethod(mStreamer.getClass(), "connect", String.class, kotlin.coroutines.Continuation.class);
                                if (connectMethod == null) {
                                    Log.e(TAG, "Could not find connect method");
                                    return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                                }
                                connectMethod.setAccessible(true);
                                connectMethod.invoke(mStreamer, rtmpUrl, continuation);
                                
                                // After connecting, check if we need to disable audio
                                if (!isAudioAvailable(mStreamer)) {
                                    Log.w(TAG, "Audio appears to be unavailable. Attempting to disable audio before streaming.");
                                    try {
                                        Method setAudioEnabledMethod = findMethod(mStreamer.getClass(), "setAudioEnabled", boolean.class);
                                        if (setAudioEnabledMethod != null) {
                                            setAudioEnabledMethod.setAccessible(true);
                                            setAudioEnabledMethod.invoke(mStreamer, false);
                                            Log.w(TAG, "Audio disabled for streaming due to potential permission issues");
                                        }
                                    } catch (Exception ex) {
                                        Log.e(TAG, "Failed to disable audio: " + ex.getMessage());
                                    }
                                }
                                
                                // After connecting, start the stream
                                Method startStreamMethod = findMethod(mStreamer.getClass(), "startStream", kotlin.coroutines.Continuation.class);
                                if (startStreamMethod == null) {
                                    Log.e(TAG, "Could not find startStream method");
                                    return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                                }
                                startStreamMethod.setAccessible(true);
                                try {
                                    startStreamMethod.invoke(mStreamer, continuation);
                                    Log.d(TAG, "RTMP stream started successfully");
                                } catch (Exception ex) {
                                    if (ex instanceof InvocationTargetException && ex.getCause() != null && 
                                            ex.getCause().getMessage() != null && 
                                            ex.getCause().getMessage().contains("No audioRecorder")) {
                                        
                                        Log.e(TAG, "Failed to start stream due to audio recorder issue. Disabling audio and retrying...");
                                        
                                        // Try disabling audio and restart
                                        try {
                                            Method setAudioEnabledMethod = findMethod(mStreamer.getClass(), "setAudioEnabled", boolean.class);
                                            if (setAudioEnabledMethod != null) {
                                                setAudioEnabledMethod.setAccessible(true);
                                                setAudioEnabledMethod.invoke(mStreamer, false);
                                                
                                                // Try again after disabling audio
                                                startStreamMethod.invoke(mStreamer, continuation);
                                                Log.d(TAG, "RTMP stream started successfully with audio disabled");
                                            } else {
                                                Log.e(TAG, "Could not disable audio - streaming may fail");
                                                throw ex; // Rethrow if we couldn't fix it
                                            }
                                        } catch (Exception e) {
                                            Log.e(TAG, "Error trying to disable audio and restart streaming", e);
                                            throw ex; // Rethrow if our fix didn't work
                                        }
                                    } else {
                                        throw ex; // Rethrow if it's not an audio issue
                                    }
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Error calling RTMP methods via reflection: " + e.getMessage(), e);
                                if (e instanceof InvocationTargetException && e.getCause() != null) {
                                    Log.e(TAG, "Caused by: " + e.getCause().getMessage());
                                }
                            }
                            return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                        }
                    );
                } catch (Exception e) {
                    Log.e(TAG, "Failed to start RTMP stream", e);
                }
            });
            
            // Start streaming in background thread
            streamingThread.start();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error creating streaming thread", e);
            return false;
        }
    }

    /**
     * Stop the current stream
     */
    public void stopStreaming() {
        if (mStreamer != null) {
            try {
                if (mStreamer.isConnected()) {
                    Log.d(TAG, "Stopping RTMP stream");
                    
                    // Create thread to handle disconnection
                    Thread disconnectThread = new Thread(() -> {
                        try {
                            // Use runBlocking to call suspend disconnect function
                            kotlinx.coroutines.BuildersKt.runBlocking(
                                Dispatchers.getIO(),
                                (Function2<kotlinx.coroutines.CoroutineScope, kotlin.coroutines.Continuation<? super Unit>, kotlin.coroutines.intrinsics.CoroutineSingletons>) 
                                (scope, continuation) -> {
                                    try {
                                        // Call disconnect via reflection
                                        Method disconnectMethod = mStreamer.getClass().getDeclaredMethod("disconnect", kotlin.coroutines.Continuation.class);
                                        disconnectMethod.setAccessible(true);
                                        disconnectMethod.invoke(mStreamer, continuation);
                                        
                                        Log.d(TAG, "RTMP stream stopped successfully");
                                    } catch (Exception e) {
                                        Log.e(TAG, "Error during disconnect via reflection", e);
                                    }
                                    return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                                }
                            );
                        } catch (Exception e) {
                            Log.e(TAG, "Failed to stop RTMP stream", e);
                        }
                    });
                    
                    // Start disconnect in background thread
                    disconnectThread.start();
                }
            } catch (Exception e) {
                Log.e(TAG, "Error stopping RTMP stream", e);
            }
        }
    }

    /**
     * Release resources
     */
    public void release() {
        if (mStreamer != null) {
            try {
                stopStreaming();
                mStreamer.release();
                mStreamer = null;
                mIsInitialized = false;
                Log.d(TAG, "RTMP streamer resources released");
            } catch (Exception e) {
                Log.e(TAG, "Error releasing RTMP streamer", e);
            }
        }
    }

    /**
     * Check if currently streaming
     *
     * @return true if streaming, false otherwise
     */
    public boolean isConnected() {
        return mStreamer != null && mStreamer.isConnected();
    }
}