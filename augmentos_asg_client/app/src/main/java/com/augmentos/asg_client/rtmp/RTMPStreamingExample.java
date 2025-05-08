package com.augmentos.asg_client.rtmp;

import android.Manifest;
import android.content.Context;
import android.media.AudioFormat;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.Size;

import androidx.annotation.RequiresPermission;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import io.github.thibaultbee.streampack.error.StreamPackError;
import io.github.thibaultbee.streampack.listeners.OnConnectionListener;
import io.github.thibaultbee.streampack.listeners.OnErrorListener;
import kotlinx.coroutines.BuildersKt;
import kotlinx.coroutines.Dispatchers;

import io.github.thibaultbee.streampack.data.AudioConfig;
import io.github.thibaultbee.streampack.data.VideoConfig;
import io.github.thibaultbee.streampack.ext.rtmp.streamers.CameraRtmpLiveStreamer;
import io.github.thibaultbee.streampack.views.PreviewView;

/**
 * Example implementation of RTMP streaming using StreamPack library based on the boilerplate example
 * This demonstrates the correct way to initialize camera streaming
 */
public class RTMPStreamingExample {
    private static final String TAG = "RTMPStreamingExample";
    
    private Context context;
    private CameraRtmpLiveStreamer streamer;
    private boolean isStreaming = false;
    private PreviewView previewView; // Must use library's PreviewView, not regular SurfaceView
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    
    /**
     * Callback interface for streaming status
     */
    public interface StreamingCallback {
        void onStarted();
        void onStopped();
        void onError(String message);
        void onConnected();
    }
    
    private StreamingCallback callback;
    
    /**
     * Initialize the RTMP streaming example with default configuration
     * @param context Application context
     * @param previewView PreviewView for camera preview
     */
    public RTMPStreamingExample(Context context, PreviewView previewView) {
        this.context = context;
        this.previewView = previewView;
        
        try {
            // Initialize streamer with audio and provide required listeners
            streamer = new CameraRtmpLiveStreamer(
                context, 
                true,  // enableAudio
                new OnErrorListener() {
                    @Override
                    public void onError(StreamPackError error) {
                        String errorMsg = error.getMessage();
                        Log.e(TAG, "Streaming error: " + errorMsg);
                        if (callback != null) {
                            callback.onError(errorMsg);
                        }
                    }
                },
                new OnConnectionListener() {
                    @Override
                    public void onSuccess() {
                        Log.d(TAG, "RTMP connection successful");
                        if (callback != null) {
                            new Handler(Looper.getMainLooper()).post(() -> callback.onConnected());
                        }
                    }
                    
                    @Override
                    public void onFailed(String reason) {
                        Log.e(TAG, "RTMP connection failed: " + reason);
                        if (callback != null) {
                            new Handler(Looper.getMainLooper()).post(() -> callback.onError("Connection failed: " + reason));
                        }
                    }
                    
                    @Override
                    public void onLost(String reason) {
                        Log.e(TAG, "RTMP connection lost: " + reason);
                        if (callback != null) {
                            new Handler(Looper.getMainLooper()).post(() -> {
                                callback.onError("Connection lost: " + reason);
                                callback.onStopped();
                            });
                        }
                    }
                }
            );
            
            // Configure streamer with default settings
            configureDefaultSettings();
            
            Log.d(TAG, "RTMPStreamingExample initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error initializing RTMPStreamingExample", e);
        }
    }
    
    /**
     * Set callback to receive streaming events
     * @param callback Callback implementation
     */
    public void setCallback(StreamingCallback callback) {
        this.callback = callback;
    }
    
    /**
     * Configure default audio and video settings for streaming
     */
    private void configureDefaultSettings() {
        try {
            // Video configuration 
            VideoConfig videoConfig = new VideoConfig(
                    "video/avc",            // H.264 codec
                    500000,                 // 500 kbps
                    new Size(640, 480),     // VGA resolution
                    30,                     // 30 fps
                    2,                      // Baseline profile
                    1,                      // Level
                    2.0f                    // GOP of 2 seconds
            );
            
            // Audio configuration
            AudioConfig audioConfig = new AudioConfig(
                    "audio/mp4a-latm",      // AAC
                    128000,                 // 128 kbps
                    44100,                  // 44.1 kHz
                    1,                      // Mono
                    16,                     // 16-bit
                    2,                      // AAC-LC profile
                    false,                  // Constant bitrate
                    false                   // No echo cancellation
            );
            
            // Configure streamer with these settings
            streamer.configure(audioConfig, videoConfig);
            
            Log.d(TAG, "Default configuration applied: 640x480@30fps, audio: 44.1kHz mono");
        } catch (Exception e) {
            Log.e(TAG, "Error applying default configuration", e);
        }
    }
    
    /**
     * Start the camera preview - must be called before streaming
     * @return true if preview started successfully
     */
    @RequiresPermission(allOf = {Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO})
    public boolean startPreview() {
        try {
            // The critical step - set the streamer on the PreviewView
            previewView.setStreamer(streamer);
            
            final CountDownLatch latch = new CountDownLatch(1);
            final boolean[] result = {false};
            
            // Execute on background thread
            executor.execute(() -> {
                try {
                    // Start the preview on the PreviewView - this is the correct way
                    previewView.startPreview();
                    Log.d(TAG, "Preview started successfully");
                    result[0] = true;
                } catch (Exception e) {
                    Log.e(TAG, "Error starting preview", e);
                } finally {
                    latch.countDown();
                }
            });
            
            // Wait for result with timeout
            try {
                latch.await();
            } catch (InterruptedException e) {
                Log.e(TAG, "Interrupted while waiting for preview to start", e);
            }
            
            return result[0];
        } catch (Exception e) {
            Log.e(TAG, "Error setting up preview", e);
            return false;
        }
    }
    
    /**
     * Start RTMP streaming to the given URL
     * @param rtmpUrl The RTMP server URL
     */
    public void startStreaming(String rtmpUrl) {
        if (isStreaming) {
            Log.w(TAG, "Already streaming");
            return;
        }
        
        executor.execute(() -> {
            try {
                // Using BuildersKt.runBlocking to handle Kotlin suspend functions
                BuildersKt.runBlocking(
                    Dispatchers.getIO(),
                    (scope, continuation) -> {
                        try {
                            // Connect to the RTMP server
                            streamer.connect(rtmpUrl, continuation);
                            
                            // The streaming will start automatically after connection
                            // and the onSuccess callback will be triggered
                            isStreaming = true;
                            Log.i(TAG, "RTMP streaming started to: " + rtmpUrl);
                            
                            // Notify on main thread
                            if (callback != null) {
                                new Handler(Looper.getMainLooper()).post(() -> callback.onStarted());
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error starting streaming", e);
                            isStreaming = false;
                            
                            // Notify on main thread
                            if (callback != null) {
                                final String message = e.getMessage();
                                new Handler(Looper.getMainLooper()).post(() -> 
                                        callback.onError("Failed to start streaming: " + message));
                            }
                        }
                        return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                    }
                );
            } catch (Exception e) {
                Log.e(TAG, "Error starting streaming", e);
                isStreaming = false;
                
                // Notify on main thread
                if (callback != null) {
                    final String message = e.getMessage();
                    new Handler(Looper.getMainLooper()).post(() -> 
                            callback.onError("Failed to start streaming: " + message));
                }
            }
        });
    }
    
    /**
     * Stop the current RTMP stream
     */
    public void stopStreaming() {
        if (!isStreaming) {
            Log.w(TAG, "Not streaming");
            return;
        }
        
        executor.execute(() -> {
            try {
                // Using BuildersKt.runBlocking to handle Kotlin suspend functions
                BuildersKt.runBlocking(
                    Dispatchers.getIO(),
                    (scope, continuation) -> {
                        try {
                            // Stop the stream
                            streamer.stopStream(continuation);
                            
                            // Disconnect from the server
                            streamer.disconnect();

                            isStreaming = false;
                            Log.i(TAG, "Streaming stopped");
                            
                            // Notify on main thread
                            if (callback != null) {
                                new Handler(Looper.getMainLooper()).post(() -> callback.onStopped());
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Error stopping streaming", e);
                            
                            // Notify on main thread
                            if (callback != null) {
                                final String message = e.getMessage();
                                new Handler(Looper.getMainLooper()).post(() -> 
                                        callback.onError("Error stopping stream: " + message));
                            }
                        }
                        return kotlin.coroutines.intrinsics.CoroutineSingletons.COROUTINE_SUSPENDED;
                    }
                );
            } catch (Exception e) {
                Log.e(TAG, "Error stopping streaming", e);
                
                // Notify on main thread
                if (callback != null) {
                    final String message = e.getMessage();
                    new Handler(Looper.getMainLooper()).post(() -> 
                            callback.onError("Error stopping stream: " + message));
                }
            }
        });
    }
    
    /**
     * Stop the preview
     */
    public void stopPreview() {
        try {
            // Stop streaming first if active
            if (isStreaming) {
                stopStreaming();
            }
            
            // Stop the preview
            previewView.stopPreview();
            Log.d(TAG, "Preview stopped");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping preview", e);
        }
    }
    
    /**
     * Release all resources
     */
    public void release() {
        try {
            stopStreaming();
            stopPreview();
            
            // In StreamPackLite, release is not a suspend function, so we can call it directly
            try {
                // Release the streamer resources
                if (streamer != null) {
                    streamer.release();
                    Log.d(TAG, "Resources released");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error releasing resources", e);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error releasing resources", e);
        }
    }
    
    /**
     * Check if streaming is active
     * @return true if streaming
     */
    public boolean isStreaming() {
        return isStreaming;
    }
    
    /**
     * Configure streaming parameters - convenience method
     * @param videoBitrate Video bitrate in bps
     * @param videoWidth Video width in pixels
     * @param videoHeight Video height in pixels
     * @param videoFps Video framerate
     * @param audioBitrate Audio bitrate in bps
     * @param audioSampleRate Audio sample rate in Hz
     * @param audioStereo True for stereo, false for mono
     */
    public void configure(int videoBitrate, int videoWidth, int videoHeight, int videoFps,
                         int audioBitrate, int audioSampleRate, boolean audioStereo) {
        try {
            // Video configuration 
            VideoConfig videoConfig = new VideoConfig(
                    "video/avc",            // H.264 codec
                    videoBitrate,           // Video bitrate
                    new Size(videoWidth, videoHeight), // Resolution
                    videoFps,               // Framerate
                    2,                      // Baseline profile
                    1,                      // Level
                    2.0f                    // GOP of 2 seconds
            );
            
            // Audio configuration
            AudioConfig audioConfig = new AudioConfig(
                    "audio/mp4a-latm",      // AAC
                    audioBitrate,           // Audio bitrate
                    audioSampleRate,        // Sample rate
                    audioStereo ? 2 : 1,    // Channels
                    16,                     // 16-bit
                    2,                      // AAC-LC profile
                    false,                  // Constant bitrate
                    false                   // No echo cancellation
            );
            
            // Configure streamer with these settings
            streamer.configure(audioConfig, videoConfig);
            
            Log.d(TAG, "Configuration applied: " + videoWidth + "x" + videoHeight + "@" + videoFps + 
                    "fps, " + videoBitrate + "bps video, " +
                    audioSampleRate + "Hz " + (audioStereo ? "stereo" : "mono") + ", " + 
                    audioBitrate + "bps audio");
        } catch (Exception e) {
            Log.e(TAG, "Error applying configuration", e);
        }
    }
}