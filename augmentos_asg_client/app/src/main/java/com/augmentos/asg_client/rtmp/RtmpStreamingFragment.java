package com.augmentos.asg_client.rtmp;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.augmentos.asg_client.R;

import io.github.thibaultbee.streampack.views.PreviewView;

/**
 * Fragment for RTMP streaming using StreamPack library
 * Uses the correct approach with PreviewView for camera preview
 */
public class RtmpStreamingFragment extends Fragment {
    private static final String TAG = "RtmpStreamingFragment";
    private static final String ARG_RTMP_URL = "rtmp_url";
    
    // Default RTMP URL if not specified
    private static final String DEFAULT_RTMP_URL = "rtmp://10.0.0.22:1935/live/Byh6EOtelg";
    
    // Permission request codes
    private static final int REQUEST_CAMERA_PERMISSION = 100;
    private static final int REQUEST_AUDIO_PERMISSION = 101;
    
    // UI components
    private PreviewView previewView;
    private ViewGroup previewContainer;
    private ImageButton btnStart;
    private ImageButton btnStop;
    
    // StreamPack integration
    private RTMPStreamingExample rtmpStreamer;
    private String rtmpUrl;
    
    /**
     * Create a new instance of the fragment with optional RTMP URL
     * @param rtmpUrl RTMP server URL (optional)
     * @return New fragment instance
     */
    public static RtmpStreamingFragment newInstance(String rtmpUrl) {
        RtmpStreamingFragment fragment = new RtmpStreamingFragment();
        Bundle args = new Bundle();
        args.putString(ARG_RTMP_URL, rtmpUrl);
        fragment.setArguments(args);
        return fragment;
    }
    
    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments() != null) {
            rtmpUrl = getArguments().getString(ARG_RTMP_URL, DEFAULT_RTMP_URL);
        } else {
            rtmpUrl = DEFAULT_RTMP_URL;
        }
    }
    
    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.layout_rtmp_camera_preview, container, false);
    }
    
    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        
        // Initialize UI components
        previewContainer = view.findViewById(R.id.rtmp_preview_container);
        btnStart = view.findViewById(R.id.rtmp_btn_start);
        btnStop = view.findViewById(R.id.rtmp_btn_stop);
        
        // Create PreviewView programmatically
        previewView = new PreviewView(requireContext());
        previewView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        
        // Add it to the container
        previewContainer.addView(previewView);
        
        // Set up button click listeners
        btnStart.setOnClickListener(v -> startStreaming());
        btnStop.setOnClickListener(v -> stopStreaming());
        
        // Update UI state
        updateUIState(false);
        
        // Check for required permissions
        if (hasRequiredPermissions()) {
            initializeRtmpStreamer();
        } else {
            requestRequiredPermissions();
        }
    }
    
    @Override
    public void onResume() {
        super.onResume();
        
        // Start preview if permissions are granted and streamer is initialized
        if (hasRequiredPermissions() && rtmpStreamer != null) {
            startPreview();
        }
    }
    
    @Override
    public void onPause() {
        super.onPause();
        
        // Stop streaming and preview
        if (rtmpStreamer != null) {
            if (rtmpStreamer.isStreaming()) {
                rtmpStreamer.stopStreaming();
            }
            rtmpStreamer.stopPreview();
        }
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        
        // Release resources
        if (rtmpStreamer != null) {
            rtmpStreamer.release();
            rtmpStreamer = null;
        }
    }
    
    /**
     * Initialize the RTMP streamer with the PreviewView
     */
    private void initializeRtmpStreamer() {
        try {
            // Create the RTMPStreamingExample with PreviewView
            rtmpStreamer = new RTMPStreamingExample(requireContext(), previewView);
            
            // Set callback to handle streaming events
            rtmpStreamer.setCallback(new RTMPStreamingExample.StreamingCallback() {
                @Override
                public void onStarted() {
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> {
                            Toast.makeText(getContext(), "Streaming started", Toast.LENGTH_SHORT).show();
                            updateUIState(true);
                        });
                    }
                }
                
                @Override
                public void onStopped() {
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> {
                            Toast.makeText(getContext(), "Streaming stopped", Toast.LENGTH_SHORT).show();
                            updateUIState(false);
                        });
                    }
                }
                
                @Override
                public void onError(String message) {
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> {
                            Toast.makeText(getContext(), "Error: " + message, Toast.LENGTH_LONG).show();
                            updateUIState(false);
                        });
                    }
                }
                
                @Override
                public void onConnected() {
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> 
                            Toast.makeText(getContext(), "Connected to RTMP server", Toast.LENGTH_SHORT).show());
                    }
                }
            });
            
            // Start the preview immediately if the fragment is visible
            if (isResumed()) {
                startPreview();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error initializing RTMP streamer", e);
            Toast.makeText(getContext(), "Error initializing camera: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
    
    /**
     * Start the camera preview
     */
    private void startPreview() {
        if (rtmpStreamer != null && hasRequiredPermissions()) {
            if (rtmpStreamer.startPreview()) {
                Log.d(TAG, "Camera preview started successfully");
            } else {
                Log.e(TAG, "Failed to start camera preview");
                Toast.makeText(getContext(), "Failed to start camera preview", Toast.LENGTH_SHORT).show();
            }
        }
    }
    
    /**
     * Start RTMP streaming
     */
    private void startStreaming() {
        if (rtmpStreamer != null && hasRequiredPermissions()) {
            rtmpStreamer.startStreaming(rtmpUrl);
        } else {
            Toast.makeText(getContext(), "Cannot start streaming - missing permissions", Toast.LENGTH_SHORT).show();
            requestRequiredPermissions();
        }
    }
    
    /**
     * Stop RTMP streaming
     */
    private void stopStreaming() {
        if (rtmpStreamer != null && rtmpStreamer.isStreaming()) {
            rtmpStreamer.stopStreaming();
        }
    }
    
    /**
     * Update UI state based on streaming status
     * @param isStreaming true if streaming is active
     */
    private void updateUIState(boolean isStreaming) {
        if (btnStart != null && btnStop != null) {
            btnStart.setEnabled(!isStreaming);
            btnStart.setAlpha(isStreaming ? 0.5f : 1.0f);
            
            btnStop.setEnabled(isStreaming);
            btnStop.setAlpha(isStreaming ? 1.0f : 0.5f);
        }
    }
    
    /**
     * Check if required permissions are granted
     * @return true if all permissions are granted
     */
    private boolean hasRequiredPermissions() {
        return ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }
    
    /**
     * Request required permissions
     */
    private void requestRequiredPermissions() {
        requestPermissions(
                new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                REQUEST_CAMERA_PERMISSION
        );
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            
            if (allGranted) {
                // Permissions granted, initialize the streamer
                initializeRtmpStreamer();
            } else {
                // Permissions denied
                Toast.makeText(getContext(), "Camera and audio permissions are required for streaming", Toast.LENGTH_LONG).show();
            }
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        }
    }
}