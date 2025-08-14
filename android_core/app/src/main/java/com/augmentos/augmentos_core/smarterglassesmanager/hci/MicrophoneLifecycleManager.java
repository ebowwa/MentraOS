package com.augmentos.augmentos_core.smarterglassesmanager.hci;

import android.content.Context;
import android.media.AudioRecord;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleObserver;
import androidx.lifecycle.OnLifecycleEvent;
import androidx.lifecycle.ProcessLifecycleOwner;

/**
 * Manages microphone state based on app lifecycle to handle the intermittent issue
 * where phone microphone stops working when app goes to background on some devices.
 * 
 * This only affects SCO_MODE and NORMAL_MODE since:
 * - GLASSES_MIC uses custom GATT and isn't affected by OS audio management
 * - PAUSED means recording is already stopped
 * 
 * IMPORTANT: This works alongside the existing audio focus system:
 * - Audio focus loss (another app wants mic) is handled by PhoneMicrophoneManager
 * - This ONLY handles silent failures that occur in background without focus loss
 */
public class MicrophoneLifecycleManager implements LifecycleObserver {
    private static final String TAG = "WearableAi_MicLifecycleManager";
    
    private final PhoneMicrophoneManager phoneMicrophoneManager;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Context context;
    
    // Track states
    private boolean isAppInForeground = true;
    private PhoneMicrophoneManager.MicStatus statusWhenWentToBackground = null;
    private boolean detectedBackgroundFailure = false;
    
    // Track if we lost audio focus (another app requested mic)
    // This is critical to distinguish between focus loss and silent failure
    private boolean lostAudioFocusInBackground = false;
    
    // Monitor recording health
    private Runnable recordingHealthCheck;
    private static final long HEALTH_CHECK_DELAY_MS = 2000; // Check after 2 seconds in background
    private static final long FOREGROUND_RECOVERY_DELAY_MS = 300; // Small delay when returning
    
    // Reference to the active MicrophoneLocalAndBluetooth instance
    private MicrophoneLocalAndBluetooth activeMicInstance;
    
    public MicrophoneLifecycleManager(Context context, PhoneMicrophoneManager phoneMicrophoneManager) {
        this.context = context;
        this.phoneMicrophoneManager = phoneMicrophoneManager;
        
        // Register with ProcessLifecycleOwner to monitor app lifecycle
        ProcessLifecycleOwner.get().getLifecycle().addObserver(this);
        
        // Initialize foreground state
        isAppInForeground = ProcessLifecycleOwner.get().getLifecycle()
                .getCurrentState().isAtLeast(Lifecycle.State.STARTED);
        
        Log.d(TAG, "MicrophoneLifecycleManager initialized, app is " + 
                   (isAppInForeground ? "in foreground" : "in background"));
    }
    
    /**
     * Set the active microphone instance to monitor
     */
    public void setActiveMicInstance(MicrophoneLocalAndBluetooth micInstance) {
        this.activeMicInstance = micInstance;
    }
    
    /**
     * Called by PhoneMicrophoneManager when audio focus is lost
     * This indicates another app wants the microphone
     */
    public void onAudioFocusLost() {
        Log.d(TAG, "Audio focus lost - another app requested microphone");
        if (!isAppInForeground) {
            lostAudioFocusInBackground = true;
            // Cancel health checks since this is an expected pause
            if (recordingHealthCheck != null) {
                mainHandler.removeCallbacks(recordingHealthCheck);
                recordingHealthCheck = null;
            }
        }
    }
    
    /**
     * Called by PhoneMicrophoneManager when audio focus is regained
     */
    public void onAudioFocusGained() {
        Log.d(TAG, "Audio focus regained");
        lostAudioFocusInBackground = false;
    }
    
    @OnLifecycleEvent(Lifecycle.Event.ON_START)
    public void onAppForeground() {
        Log.d(TAG, "App moved to foreground");
        isAppInForeground = true;
        
        // Cancel any pending health checks
        if (recordingHealthCheck != null) {
            mainHandler.removeCallbacks(recordingHealthCheck);
            recordingHealthCheck = null;
        }
        
        // ONLY recover if:
        // 1. We detected a silent failure in background
        // 2. We didn't lose audio focus (another app didn't request mic)
        if (detectedBackgroundFailure && !lostAudioFocusInBackground && statusWhenWentToBackground != null) {
            Log.d(TAG, "Recovering from SILENT background microphone failure - previous mode: " + statusWhenWentToBackground);
            
            // Small delay to let app fully return to foreground
            mainHandler.postDelayed(() -> {
                if (isAppInForeground && detectedBackgroundFailure && !lostAudioFocusInBackground) {
                    Log.d(TAG, "Restarting microphone after silent background failure");
                    
                    // Force restart with the preferred mode
                    // This will re-acquire audio focus and recreate AudioRecord
                    phoneMicrophoneManager.forceSwitchToPreferredMic();
                    
                    detectedBackgroundFailure = false;
                    statusWhenWentToBackground = null;
                }
            }, FOREGROUND_RECOVERY_DELAY_MS);
        } else if (lostAudioFocusInBackground) {
            Log.d(TAG, "Audio focus was lost to another app - letting existing focus system handle recovery");
            // The existing audio focus system in PhoneMicrophoneManager will handle this
        } else {
            Log.d(TAG, "No background failure detected - microphone should be working normally");
        }
        
        // Reset the audio focus flag
        lostAudioFocusInBackground = false;
    }
    
    @OnLifecycleEvent(Lifecycle.Event.ON_STOP)
    public void onAppBackground() {
        Log.d(TAG, "App moved to background");
        isAppInForeground = false;
        detectedBackgroundFailure = false;
        lostAudioFocusInBackground = false; // Reset this flag
        
        // Check current microphone status
        PhoneMicrophoneManager.MicStatus currentStatus = phoneMicrophoneManager.getCurrentStatus();
        
        // Only monitor SCO_MODE and NORMAL_MODE since they use phone hardware
        if (currentStatus == PhoneMicrophoneManager.MicStatus.SCO_MODE || 
            currentStatus == PhoneMicrophoneManager.MicStatus.NORMAL_MODE) {
            
            Log.d(TAG, "App going to background with phone mic active (" + currentStatus + 
                      ") - will monitor for SILENT failures only");
            statusWhenWentToBackground = currentStatus;
            
            // Schedule health checks to detect silent failures
            // These will be cancelled if we lose audio focus (another app wants mic)
            scheduleRecordingHealthCheck();
            
        } else if (currentStatus == PhoneMicrophoneManager.MicStatus.GLASSES_MIC) {
            // Glasses mic doesn't need monitoring
            Log.d(TAG, "App going to background with glasses mic - no monitoring needed");
            statusWhenWentToBackground = null;
        } else {
            // Already paused (possibly by user or previous audio focus loss)
            Log.d(TAG, "App going to background with mic already paused");
            statusWhenWentToBackground = null;
        }
    }
    
    /**
     * Schedule a health check to detect if microphone stops working in background
     */
    private void scheduleRecordingHealthCheck() {
        recordingHealthCheck = new Runnable() {
            @Override
            public void run() {
                if (!isAppInForeground && !detectedBackgroundFailure) {
                    checkRecordingHealth();
                    
                    // Continue checking periodically while in background
                    if (!detectedBackgroundFailure && !isAppInForeground) {
                        mainHandler.postDelayed(this, HEALTH_CHECK_DELAY_MS);
                    }
                }
            }
        };
        
        // Start checking after a delay
        mainHandler.postDelayed(recordingHealthCheck, HEALTH_CHECK_DELAY_MS);
    }
    
    /**
     * Check if recording is still working properly
     */
    private void checkRecordingHealth() {
        // Skip if we lost audio focus - that's being handled by the focus system
        if (lostAudioFocusInBackground) {
            Log.d(TAG, "Skipping health check - audio focus was lost to another app");
            return;
        }
        
        // Check if we're still supposed to be recording
        PhoneMicrophoneManager.MicStatus currentStatus = phoneMicrophoneManager.getCurrentStatus();
        
        if (currentStatus != PhoneMicrophoneManager.MicStatus.SCO_MODE && 
            currentStatus != PhoneMicrophoneManager.MicStatus.NORMAL_MODE) {
            // Status changed, no need to monitor
            Log.d(TAG, "Mic status changed to " + currentStatus + " - stopping health checks");
            return;
        }
        
        // Check if the AudioRecord is still functioning
        boolean isRecordingHealthy = checkAudioRecordHealth();
        
        if (!isRecordingHealthy && !lostAudioFocusInBackground) {
            Log.w(TAG, "Detected SILENT microphone failure in background! Current status: " + currentStatus);
            detectedBackgroundFailure = true;
            
            // Pause the recording to clean up the broken state
            // This will stop the MicrophoneService and release AudioRecord
            Log.d(TAG, "Pausing failed recording to clean up resources (will auto-restart on foreground)");
            phoneMicrophoneManager.pauseRecording();
            
            // The recording will be restarted when app returns to foreground
        } else {
            Log.d(TAG, "Background recording health check passed - mic still working");
        }
    }
    
    /**
     * Check if AudioRecord is actually recording data
     */
    private boolean checkAudioRecordHealth() {
        // If we have a reference to the active mic instance, check it directly
        if (activeMicInstance != null) {
            boolean isHealthy = activeMicInstance.isRecordingActive();
            if (!isHealthy) {
                Log.w(TAG, "MicrophoneLocalAndBluetooth reports unhealthy recording state");
            }
            return isHealthy;
        }
        
        // Otherwise, we can only check the status
        Log.d(TAG, "No mic instance reference - assuming healthy");
        return true;
    }
    
    /**
     * Clean up resources and unregister from lifecycle
     */
    public void cleanup() {
        try {
            ProcessLifecycleOwner.get().getLifecycle().removeObserver(this);
            mainHandler.removeCallbacksAndMessages(null);
            activeMicInstance = null;
            Log.d(TAG, "MicrophoneLifecycleManager cleaned up");
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup", e);
        }
    }
    
    /**
     * Check if app is currently in foreground
     */
    public boolean isAppInForeground() {
        return isAppInForeground;
    }
    
    /**
     * Manually trigger recovery if a failure is detected
     * This can be called by other components that detect audio issues
     */
    public void reportBackgroundFailure() {
        if (!isAppInForeground && statusWhenWentToBackground != null) {
            Log.w(TAG, "Background failure reported externally");
            detectedBackgroundFailure = true;
            
            // Pause to clean up
            phoneMicrophoneManager.pauseRecording();
        }
    }
}