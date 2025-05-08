package com.augmentos.asg_client.rtmp;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.fragment.app.FragmentActivity;

import io.github.thibaultbee.streampack.views.PreviewView;

/**
 * Simple test utility to add RTMP streaming to an existing activity
 */
public class RTMPStreamTest {
    private static final String TAG = "RTMPStreamTest";
    private static final int PERMISSIONS_REQUEST_CODE = 1001;
    
    private Context mContext;
    private FragmentActivity mActivity;
    private FrameLayout mContainer;
    private View mRtmpView;
    private RTMPStreamingExample mStreamer;
    private String mRtmpUrl;
    
    /**
     * Create a new RTMPStreamTest
     * 
     * @param activity The activity to add the RTMP streaming to
     * @param container The container to add the RTMP preview to
     * @param rtmpUrl The RTMP URL to stream to
     */
    public RTMPStreamTest(FragmentActivity activity, FrameLayout container, String rtmpUrl) {
        mActivity = activity;
        mContext = activity;
        mContainer = container;
        mRtmpUrl = rtmpUrl;
        
        initPermissions();
    }
    
    /**
     * Check and request necessary permissions
     */
    private void initPermissions() {
        if (ActivityCompat.checkSelfPermission(mContext, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(mContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            
            ActivityCompat.requestPermissions(mActivity,
                    new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                    PERMISSIONS_REQUEST_CODE);
        } else {
            setupRtmpStreaming();
        }
    }
    
    /**
     * Set up RTMP streaming
     */
    private void setupRtmpStreaming() {
        try {
            // Instead of using the PreviewView directly in XML, we'll use our custom layout
            // but WITHOUT the StreamPack PreviewView to avoid ClassNotFoundException at startup
            
            // We'll still use the container, but we'll create the PreviewView programmatically
            // only when needed
            
            // Load our layout, which has buttons but no PreviewView
            mRtmpView = mActivity.getLayoutInflater().inflate(
                    mContext.getResources().getIdentifier("layout_rtmp_camera_preview", "layout", mContext.getPackageName()),
                    mContainer,
                    false);
            
            // Add it to the container
            mContainer.addView(mRtmpView);
            
            // Now create the PreviewView programmatically
            android.widget.FrameLayout previewContainer = mRtmpView.findViewById(
                    mContext.getResources().getIdentifier("rtmp_preview_container", "id", mContext.getPackageName()));
            
            if (previewContainer == null) {
                Log.e(TAG, "Preview container not found!");
                return;
            }
            
            // Create PreviewView in code
            io.github.thibaultbee.streampack.views.PreviewView previewView = 
                new io.github.thibaultbee.streampack.views.PreviewView(mActivity);
            previewView.setLayoutParams(new android.widget.FrameLayout.LayoutParams(
                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT));
            
            // Add it to the container
            previewContainer.addView(previewView);
            
            // Create the streamer
            mStreamer = new RTMPStreamingExample(mContext, previewView);
            
            // Set up callback
            mStreamer.setCallback(new RTMPStreamingExample.StreamingCallback() {
                @Override
                public void onStarted() {
                    Log.d(TAG, "RTMP streaming started");
                    Toast.makeText(mContext, "Streaming started", Toast.LENGTH_SHORT).show();
                }
                
                @Override
                public void onStopped() {
                    Log.d(TAG, "RTMP streaming stopped");
                    Toast.makeText(mContext, "Streaming stopped", Toast.LENGTH_SHORT).show();
                }
                
                @Override
                public void onError(String message) {
                    Log.e(TAG, "RTMP streaming error: " + message);
                    Toast.makeText(mContext, "Streaming error: " + message, Toast.LENGTH_LONG).show();
                }
                
                @Override
                public void onConnected() {
                    Log.d(TAG, "RTMP connected to server");
                    Toast.makeText(mContext, "Connected to RTMP server", Toast.LENGTH_SHORT).show();
                }
            });
            
            // Set up button listeners
            View btnStart = mRtmpView.findViewById(
                    mContext.getResources().getIdentifier("rtmp_btn_start", "id", mContext.getPackageName()));
            View btnStop = mRtmpView.findViewById(
                    mContext.getResources().getIdentifier("rtmp_btn_stop", "id", mContext.getPackageName()));
            
            if (btnStart != null) {
                btnStart.setOnClickListener(v -> startStreaming());
            }
            
            if (btnStop != null) {
                btnStop.setOnClickListener(v -> stopStreaming());
            }
            
            // Start the preview
            boolean previewStarted = mStreamer.startPreview();
            if (!previewStarted) {
                Log.e(TAG, "Failed to start camera preview");
                Toast.makeText(mContext, "Failed to start camera preview", Toast.LENGTH_LONG).show();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error setting up RTMP streaming", e);
            Toast.makeText(mContext, "Error setting up streaming: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
    
    /**
     * Start streaming
     */
    public void startStreaming() {
        if (mStreamer != null) {
            if (mStreamer.isStreaming()) {
                Toast.makeText(mContext, "Already streaming", Toast.LENGTH_SHORT).show();
                return;
            }
            
            try {
                mStreamer.startStreaming(mRtmpUrl);
            } catch (Exception e) {
                Log.e(TAG, "Error starting streaming", e);
                Toast.makeText(mContext, "Error starting streaming: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        } else {
            Log.e(TAG, "Streamer not initialized");
            Toast.makeText(mContext, "Streamer not initialized", Toast.LENGTH_LONG).show();
        }
    }
    
    /**
     * Stop streaming
     */
    public void stopStreaming() {
        if (mStreamer != null) {
            try {
                mStreamer.stopStreaming();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping streaming", e);
                Toast.makeText(mContext, "Error stopping streaming: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }
    
    /**
     * Handle permission result
     */
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                setupRtmpStreaming();
            } else {
                Toast.makeText(mContext, "Camera permission is required for RTMP streaming", Toast.LENGTH_LONG).show();
            }
        }
    }
    
    /**
     * Release resources
     */
    public void release() {
        if (mStreamer != null) {
            try {
                mStreamer.release();
                mStreamer = null;
            } catch (Exception e) {
                Log.e(TAG, "Error releasing streamer", e);
            }
        }
        
        if (mRtmpView != null && mRtmpView.getParent() != null) {
            mContainer.removeView(mRtmpView);
            mRtmpView = null;
        }
    }
}