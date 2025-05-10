package com.augmentos.asg_client.rtmp;

import android.content.Context;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import io.github.thibaultbee.streampack.views.PreviewView;

/**
 * Manager class for RTMP streaming integration with AsgClientService
 * Uses the container-based approach to avoid ClassNotFoundException with PreviewView
 */
public class RtmpStreamingManager {
    private static final String TAG = "RtmpStreamingManager";
    
    private RTMPStreamingExample rtmpStreamer;
    private Context context;
    private ViewGroup previewContainer;
    private PreviewView previewView;
    private String rtmpUrl;
    private boolean isInitialized = false;
    
    // Callback for streaming status
    private StreamingStatusCallback callback;
    
    // Interface for streaming status updates
    public interface StreamingStatusCallback {
        void onStreamingStarted();
        void onStreamingStopped();
        void onStreamingError(String errorMessage);
        void onConnectionSuccess();
        void onConnectionFailed(String reason);
    }
    
    /**
     * Initialize streaming manager with container for PreviewView
     * 
     * @param context Application context
     * @param previewContainer Container to hold the PreviewView (e.g., FrameLayout)
     * @param rtmpUrl RTMP server URL
     * @param callback Callback for streaming status
     */
    public RtmpStreamingManager(Context context, ViewGroup previewContainer, String rtmpUrl, StreamingStatusCallback callback) {
        this.context = context;
        this.previewContainer = previewContainer;
        this.rtmpUrl = rtmpUrl;
        this.callback = callback;
        
        // Don't create PreviewView immediately to avoid ClassNotFoundException at initialization time
        Log.d(TAG, "RtmpStreamingManager initialized with container and URL: " + rtmpUrl);
    }
    
    /**
     * Initialize the streaming components when needed (e.g., when user starts streaming)
     * This allows lazy initialization to avoid ClassNotFoundException during app startup
     * 
     * @return true if initialization was successful
     */
    public boolean initialize() {
        if (isInitialized) {
            return true;
        }
        
        try {
            // Create PreviewView programmatically only when needed
            previewView = new PreviewView(context);
            previewView.setLayoutParams(new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            
            // Add it to the container
            previewContainer.removeAllViews(); // Clear any existing views
            previewContainer.addView(previewView);
            
            // Create streamer with the PreviewView
            rtmpStreamer = new RTMPStreamingExample(context, previewView);
            
            // Configure with optimized settings for smart glasses
            rtmpStreamer.configure(
                    250_000,   // 250 kbps video
                    640, 480,  // 640x480 resolution
                    15,         // 15 fps
                    32_000,    // 32 kbps audio
                    44100,     // 44.1 kHz sample rate
                    false      // mono audio
            );
            
            // Set up callback handler
            rtmpStreamer.setCallback(new RTMPStreamingExample.StreamingCallback() {
                @Override
                public void onStarted() {
                    Log.i(TAG, "RTMP streaming started");
                    if (callback != null) {
                        callback.onStreamingStarted();
                    }
                }
                
                @Override
                public void onStopped() {
                    Log.i(TAG, "RTMP streaming stopped");
                    if (callback != null) {
                        callback.onStreamingStopped();
                    }
                }
                
                @Override
                public void onError(String message) {
                    Log.e(TAG, "RTMP streaming error: " + message);
                    if (callback != null) {
                        callback.onStreamingError(message);
                    }
                }
                
                @Override
                public void onConnected() {
                    Log.i(TAG, "RTMP server connected");
                    if (callback != null) {
                        callback.onConnectionSuccess();
                    }
                }
            });
            
            isInitialized = true;
            Log.d(TAG, "RTMP streaming components initialized successfully");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize RTMP streaming components", e);
            if (callback != null) {
                callback.onStreamingError("Initialization failed: " + e.getMessage());
            }
            return false;
        }
    }
    
    /**
     * Start the camera preview
     * 
     * @return true if successful
     */
    public boolean startPreview() {
        if (!isInitialized && !initialize()) {
            return false;
        }
        
        try {
            if (rtmpStreamer.startPreview()) {
                Log.d(TAG, "Camera preview started");
                return true;
            } else {
                Log.e(TAG, "Failed to start camera preview");
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error starting preview", e);
            return false;
        }
    }
    
    /**
     * Start RTMP streaming
     * 
     * @return true if streaming started
     */
    public boolean startStreaming() {
        if (!isInitialized && !initialize()) {
            return false;
        }
        
        if (rtmpStreamer.isStreaming()) {
            Log.w(TAG, "Already streaming");
            return true;
        }
        
        // Make sure preview is running
        if (!startPreview()) {
            Log.e(TAG, "Cannot start streaming without preview");
            return false;
        }
        
        try {
            // Use the configured RTMP URL
            rtmpStreamer.startStreaming(rtmpUrl);
            Log.i(TAG, "RTMP streaming started to: " + rtmpUrl);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error starting streaming", e);
            if (callback != null) {
                callback.onStreamingError("Failed to start streaming: " + e.getMessage());
            }
            return false;
        }
    }
    
    /**
     * Stop RTMP streaming
     */
    public void stopStreaming() {
        if (!isInitialized || rtmpStreamer == null) {
            return;
        }
        
        try {
            if (rtmpStreamer.isStreaming()) {
                rtmpStreamer.stopStreaming();
                Log.i(TAG, "RTMP streaming stopped");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error stopping streaming", e);
        }
    }
    
    /**
     * Stop the camera preview
     */
    public void stopPreview() {
        if (!isInitialized || rtmpStreamer == null) {
            return;
        }
        
        try {
            // Stop streaming first if active
            if (rtmpStreamer.isStreaming()) {
                stopStreaming();
            }
            
            rtmpStreamer.stopPreview();
            Log.d(TAG, "Camera preview stopped");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping preview", e);
        }
    }
    
    /**
     * Release all resources
     */
    public void release() {
        if (!isInitialized || rtmpStreamer == null) {
            return;
        }
        
        try {
            stopStreaming();
            stopPreview();
            rtmpStreamer.release();
            
            // Clean up references
            previewView = null;
            rtmpStreamer = null;
            isInitialized = false;
            
            Log.d(TAG, "RTMP streaming resources released");
        } catch (Exception e) {
            Log.e(TAG, "Error releasing resources", e);
        }
    }
    
    /**
     * Update the RTMP URL
     * 
     * @param rtmpUrl New RTMP URL
     */
    public void setRtmpUrl(String rtmpUrl) {
        this.rtmpUrl = rtmpUrl;
        Log.d(TAG, "RTMP URL updated: " + rtmpUrl);
    }
    
    /**
     * Check if streaming is active
     * 
     * @return true if streaming
     */
    public boolean isStreaming() {
        return isInitialized && rtmpStreamer != null && rtmpStreamer.isStreaming();
    }
    
    /**
     * Configure custom video and audio settings
     * 
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
        if (!isInitialized && !initialize()) {
            return;
        }
        
        try {
            rtmpStreamer.configure(
                    videoBitrate,
                    videoWidth, videoHeight,
                    videoFps,
                    audioBitrate,
                    audioSampleRate,
                    audioStereo
            );
            
            Log.d(TAG, "Streaming configuration updated: " + 
                    videoWidth + "x" + videoHeight + "@" + videoFps + "fps, " +
                    (audioStereo ? "stereo" : "mono") + " audio");
        } catch (Exception e) {
            Log.e(TAG, "Error updating configuration", e);
        }
    }
}