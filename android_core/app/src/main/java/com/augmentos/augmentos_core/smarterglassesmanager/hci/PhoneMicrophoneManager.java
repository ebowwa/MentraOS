package com.augmentos.augmentos_core.smarterglassesmanager.hci;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioRecordingConfiguration;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;

import com.augmentos.augmentos_core.enums.SpeechRequiredDataType;
import com.augmentos.augmentos_core.microphone.MicrophoneService;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.SpeechRecSwitchSystem;

import java.util.ArrayList;
import java.util.List;

import androidx.annotation.RequiresApi;
import androidx.core.content.ContextCompat;

import com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.MicModeChangedEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassesconnection.SmartGlassesRepresentative;

import org.greenrobot.eventbus.EventBus;

import java.nio.ByteBuffer;

/**
 * Dynamic microphone manager that prioritizes SCO mode but gracefully handles conflicts.
 * 
 * Priorities (when using phone mic):
 * 1. SCO mode by default (high quality, supports Bluetooth headsets)
 * 2. Normal phone mic if SCO unavailable or conflicts
 * 3. Glasses mic as last resort if available
 */
public class PhoneMicrophoneManager {
    private static final String TAG = "WearableAi_PhoneMicrophoneManager";
    
    public enum MicStatus { 
        SCO_MODE,      // Using Bluetooth SCO mode 
        NORMAL_MODE,  // Using normal phone mic
        GLASSES_MIC,  // Using glasses onboard mic
        PAUSED        // Microphone recording paused
    }
    
    /**
     * Listener interface for PhoneMicrophoneManager events
     */
    public interface PhoneMicListener {
        /**
         * Called when a permission error occurs
         */
        void onPermissionError();
    }
    
    private MicStatus currentStatus = MicStatus.PAUSED;
    private List<SpeechRequiredDataType> requiredData = new ArrayList<>();
    
    private final Context context;
    private final AudioChunkCallback audioChunkCallback;
    private final AudioProcessingCallback audioProcessingCallback;
    private MicrophoneLocalAndBluetooth micInstance;
    private SmartGlassesRepresentative glassesRep;
    private PhoneMicListener phoneMicListener;
    
    // Phone call detection
    private TelephonyManager telephonyManager;
    private PhoneStateListener phoneStateListener;
    private boolean isPhoneCallActive = false;

    // Audio conflict detection 
    private AudioManager audioManager;
    private BroadcastReceiver audioStateReceiver;
    private boolean isExternalAudioActive = false;
    private boolean isReceiverRegistered = false;
    
    // Audio focus management
    private AudioManager.OnAudioFocusChangeListener audioFocusListener;
    private boolean hasAudioFocus = false;
    private AudioFocusRequest audioFocusRequest; // For Android 8.0+
    
    // Audio recording detection (API 23+)
    private AudioManager.AudioRecordingCallback audioRecordingCallback;
    private final List<Integer> ourAudioClientIds = new ArrayList<>();
    private boolean isAudioRecordingCallbackRegistered = false;
    
    // Smart debouncing for mode changes
    private long lastModeChangeTime = 0;
    private boolean pendingMicRequest = false;
    private Runnable pendingModeChangeRunnable = null;
    private static final long MODE_CHANGE_DEBOUNCE_MS = 500; // 500ms debounce for rapid changes
    
    // Retry logic
    private int scoRetries = 0;
    private static final int MAX_SCO_RETRIES = 3;
    
    // Handler for running operations on the main thread
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    
    // Lifecycle management for handling background/foreground transitions
    private MicrophoneLifecycleManager lifecycleManager;
    
    // Track if we're using a fallback mic due to external constraints
    private boolean usingFallbackDueToConflict = false;
    private MicStatus desiredMicStatus = MicStatus.PAUSED; // What we WANT to use
    
    // FGS management - only needed when using phone microphone hardware
    private boolean isMicrophoneServiceRunning = false;
    private boolean isMicrophoneServiceStarting = false;
    private boolean serviceStartedForSession = false; // Track if service started for this session
    private long lastServiceStateChangeTime = 0;
    private static final long SERVICE_STATE_CHANGE_DEBOUNCE_MS = 1000; // 1 second minimum between service state changes
    
    /**
     * Creates a new PhoneMicrophoneManager that handles dynamic switching between microphone modes.
     * 
     * @param context Application context
     * @param audioProcessingCallback Callback for processed audio data
     * @param glassesRep SmartGlassesRepresentative for accessing glasses mic
     */
    public PhoneMicrophoneManager(Context context, AudioProcessingCallback audioProcessingCallback, 
                                SmartGlassesRepresentative glassesRep) {
        this(context, audioProcessingCallback, glassesRep, null);
    }
    
    /**
     * Creates a new PhoneMicrophoneManager with a permission error listener.
     * 
     * @param context Application context
     * @param audioProcessingCallback Callback for processed audio data
     * @param glassesRep SmartGlassesRepresentative for accessing glasses mic
     * @param phoneMicListener Listener for permission errors
     */
    public PhoneMicrophoneManager(Context context, AudioProcessingCallback audioProcessingCallback, 
                                SmartGlassesRepresentative glassesRep, PhoneMicListener phoneMicListener) {
        this.context = context;
        this.audioProcessingCallback = audioProcessingCallback;
        this.glassesRep = glassesRep;
        this.phoneMicListener = phoneMicListener;
        
        Log.d(TAG, "Initializing PhoneMicrophoneManager");
        
        // Initialize desired mic status based on user preference
        boolean userPrefersPhoneMic = "phone".equals(SmartGlassesManager.getPreferredMic(context));
        desiredMicStatus = userPrefersPhoneMic ? MicStatus.SCO_MODE : MicStatus.GLASSES_MIC;
        
        // Initialize lifecycle manager to handle background/foreground transitions
        lifecycleManager = new MicrophoneLifecycleManager(context, this);
        
        // Create a chunk callback that forwards data through the SmartGlassesRepresentative's receiveChunk
        this.audioChunkCallback = new AudioChunkCallback() {
            @Override
            public void onSuccess(ByteBuffer data) {
                if (glassesRep != null) {
                    // Use the existing receiveChunk method to handle PCM -> LC3 conversion and callbacks
                    glassesRep.receiveChunk(data);
//                    Log.d(TAG, "✅ PCM audio forwarded to SmartGlassesRepresentative.receiveChunk() for LC3 conversion");
                } else {
                    // Fallback to direct callback if glassesRep is not available
                    if (audioProcessingCallback != null) {
                        audioProcessingCallback.onAudioDataAvailable(data.array());
                        Log.d(TAG, "⚠️ SmartGlassesRepresentative not available, using direct callback");
                    }
                }
            }
        };
        
        try {
            // Check for audio permission first
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "Missing RECORD_AUDIO permission");
                handleMissingPermissions();
                return;
            }
            
            // Initialize managers
            initCallDetection();
            initAudioConflictDetection();
            
            // Start with preferred mode
            startPreferredMicMode();
        } catch (SecurityException se) {
            Log.e(TAG, "Security exception during initialization: " + se.getMessage());
            handleMissingPermissions();
        } catch (Exception e) {
            Log.e(TAG, "Error during initialization: " + e.getMessage());
        }
    }
    
    /**
     * Handle missing permissions by notifying listener
     */
    private void handleMissingPermissions() {
        Log.e(TAG, "Handling missing permissions");
        
        // Clean up resources
        cleanUpCurrentMic();
        
        if (phoneStateListener != null && telephonyManager != null) {
            try {
                telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
            } catch (Exception e) {
                Log.e(TAG, "Error removing phone state listener: " + e.getMessage());
            }
        }
        
        // Notify listener about the permission error
        if (phoneMicListener != null) {
            phoneMicListener.onPermissionError();
        }
    }
    
    /**
     * Starts recording with the preferred microphone mode based on user preferences and availability
     */
    public void startPreferredMicMode() {
        // Always execute on main thread to prevent Handler threading issues
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::startPreferredMicMode);
            return;
        }
        
        // Determine what mic we WANT to use
        boolean userPrefersPhoneMic = "phone".equals(SmartGlassesManager.getPreferredMic(context));
        desiredMicStatus = userPrefersPhoneMic ? MicStatus.SCO_MODE : MicStatus.GLASSES_MIC;
        
        // Check if we're already using the desired mic (not just ANY mic)
        if (!usingFallbackDueToConflict && currentStatus == desiredMicStatus) {
            Log.d(TAG, "Already using desired microphone (" + currentStatus + ") - skipping redundant request");
            return;
        }
        
        // If we're using a fallback due to conflict, just note the desired state but don't fight
        if (usingFallbackDueToConflict && isExternalAudioActive) {
            Log.d(TAG, "External app still using mic - updating desired state to " + desiredMicStatus + " but not switching yet");
            return;
        }
        
        // If conflict has cleared but we're still on fallback, switch to desired
        if (usingFallbackDueToConflict && !isExternalAudioActive) {
            Log.d(TAG, "Conflict cleared - switching from fallback " + currentStatus + " to desired " + desiredMicStatus);
            usingFallbackDueToConflict = false;
        }
        
        // Smart debouncing logic
        long now = System.currentTimeMillis();
        long timeSinceLastChange = now - lastModeChangeTime;
        
        // If we're already in a non-paused state and this is a duplicate request, skip it
        if (currentStatus != MicStatus.PAUSED && pendingMicRequest && 
            timeSinceLastChange < MODE_CHANGE_DEBOUNCE_MS) {
            Log.d(TAG, "Duplicate mic enable request within debounce period - skipping");
            return;
        }
        
        // Cancel any pending mode change since we have a new request
        if (pendingModeChangeRunnable != null) {
            mainHandler.removeCallbacks(pendingModeChangeRunnable);
            pendingModeChangeRunnable = null;
        }
        
        // If this is a rapid change but represents a real state change (e.g., off→on), execute it
        if (currentStatus == MicStatus.PAUSED) {
            Log.d(TAG, "Mic is currently paused - executing enable request immediately");
            executeMicEnable();
        } else if (timeSinceLastChange < MODE_CHANGE_DEBOUNCE_MS) {
            // Rapid change while mic is already on - queue it
            Log.d(TAG, "Rapid mic enable request - queuing for execution after debounce");
            pendingMicRequest = true;
            pendingModeChangeRunnable = this::executeMicEnable;
            mainHandler.postDelayed(pendingModeChangeRunnable, MODE_CHANGE_DEBOUNCE_MS - timeSinceLastChange);
        } else {
            // Normal request - execute immediately
            executeMicEnable();
        }
    }
    
    /**
     * Force immediate microphone switch regardless of current state or debouncing
     * Used when user explicitly changes microphone preference
     */
    public void forceSwitchToPreferredMic() {
        Log.d(TAG, "Force switching to preferred microphone - bypassing debouncing");
        
        // Always execute on main thread to prevent Handler threading issues
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::forceSwitchToPreferredMic);
            return;
        }
        
        // Cancel any pending operations
        if (pendingModeChangeRunnable != null) {
            mainHandler.removeCallbacks(pendingModeChangeRunnable);
            pendingModeChangeRunnable = null;
        }
        
        // Reset debouncing flags
        pendingMicRequest = false;
        
        // Execute immediately
        executeMicEnable();
    }
    
    /**
     * Test if another app actually needs the microphone on Samsung devices.
     * Samsung's AudioRecordingCallback doesn't reliably detect when other apps want to record,
     * so we use a "quick release and re-grab" technique:
     * 1. Stop our AudioRecord briefly
     * 2. Try to recreate it after a short delay
     * 3. If we can't recreate it, another app grabbed the mic (like Gboard)
     * 4. If we can recreate it, it was just a playback app (like Spotify)
     */
    private void testMicrophoneAvailabilityOnSamsung() {
        Log.d(TAG, "🔬 Samsung: Testing mic availability with quick release and re-grab");
        
        // Store current mic instance reference
        final MicrophoneLocalAndBluetooth currentMicInstance = micInstance;
        
        if (currentMicInstance == null) {
            Log.w(TAG, "No active mic instance to test");
            return;
        }
        
        // Step 1: Stop recording temporarily BUT keep audio focus
        // Don't use cleanUpCurrentMic() as it abandons audio focus
        Log.d(TAG, "Samsung test: Stopping AudioRecord temporarily (keeping audio focus)...");
        if (micInstance != null) {
            micInstance.destroy();
            micInstance = null;
            // Clear reference in lifecycle manager
            if (lifecycleManager != null) {
                lifecycleManager.setActiveMicInstance(null);
            }
        }
        
        // Step 2: Wait longer (300ms) to give Gboard time to grab the mic
        mainHandler.postDelayed(() -> {
            Log.d(TAG, "Samsung test: Attempting to recreate AudioRecord...");
            
            // Step 3: Try to recreate AudioRecord
            boolean canRecreate = tryCreateTestAudioRecord();
            
            if (canRecreate) {
                // We could recreate it - no other app wants the mic
                Log.d(TAG, "✅ Samsung test: Successfully recreated AudioRecord - just playback app (Spotify)");
                Log.d(TAG, "📱 Continuing with phone mic - no actual recording conflict");
                
                // Restart our normal recording
                if (currentStatus == MicStatus.SCO_MODE) {
                    switchToScoMode();
                } else if (currentStatus == MicStatus.NORMAL_MODE) {
                    switchToNormalMode();
                }
            } else {
                // We couldn't recreate it - another app grabbed the mic!
                Log.d(TAG, "❌ Samsung test: FAILED to recreate AudioRecord - another app took the mic!");
                Log.d(TAG, "🎤 Samsung: Detected actual recording app (like Gboard) - switching to fallback");
                
                // Mark that external app is recording
                isExternalAudioActive = true;
                usingFallbackDueToConflict = true;
                
                // Switch to glasses mic or pause
                if (glassesRep != null && glassesRep.smartGlassesDevice != null && 
                    glassesRep.smartGlassesDevice.getHasInMic()) {
                    Log.d(TAG, "Samsung: Switching to glasses mic as fallback");
                    switchToGlassesMic();
                } else {
                    Log.d(TAG, "Samsung: Pausing recording due to mic conflict");
                    pauseRecording();
                }
            }
        }, 500); // 500ms gives Gboard enough time to initialize and grab the mic
    }
    
    /**
     * Try to create a test AudioRecord to see if the microphone is available.
     * This is used for Samsung devices to detect if another app has taken the mic.
     */
    private boolean tryCreateTestAudioRecord() {
        AudioRecord testRecorder = null;
        try {
            // Try to create AudioRecord with minimal buffer
            int minBufferSize = AudioRecord.getMinBufferSize(
                16000, 
                AudioFormat.CHANNEL_IN_MONO, 
                AudioFormat.ENCODING_PCM_16BIT
            );
            
            testRecorder = new AudioRecord(
                android.media.MediaRecorder.AudioSource.CAMCORDER,
                16000,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBufferSize
            );
            
            // Check if it initialized successfully
            if (testRecorder.getState() == AudioRecord.STATE_INITIALIZED) {
                Log.d(TAG, "Test AudioRecord created successfully - mic is available");
                return true;
            } else {
                Log.d(TAG, "Test AudioRecord failed to initialize - mic unavailable");
                return false;
            }
        } catch (Exception e) {
            Log.d(TAG, "Failed to create test AudioRecord: " + e.getMessage());
            return false;
        } finally {
            // Clean up test recorder
            if (testRecorder != null) {
                try {
                    testRecorder.release();
                } catch (Exception e) {
                    Log.e(TAG, "Error releasing test AudioRecord", e);
                }
            }
        }
    }
    
    /**
     * Actually executes the mic enable logic
     */
    private void executeMicEnable() {
        pendingMicRequest = false;
        pendingModeChangeRunnable = null;
        
        // Determine which mic to use based on:
        // 1. User preference
        // 2. Device availability
        // 3. System constraints
        
        boolean userPrefersPhoneMic = "phone".equals(SmartGlassesManager.getPreferredMic(context));
        boolean glassesHaveMic = glassesRep != null && 
                                glassesRep.smartGlassesDevice != null && 
                                glassesRep.smartGlassesDevice.getHasInMic();
        
        Log.d(TAG, "Executing mic enable - User prefers phone: " + userPrefersPhoneMic + 
                   ", Glasses have mic: " + glassesHaveMic);
        
        if (!userPrefersPhoneMic && glassesHaveMic) {
            // User prefers glasses mic and glasses have one
            Log.d(TAG, "User prefers glasses mic - switching to glasses mic");
            switchToGlassesMic();
        } else {
            // User prefers phone mic or glasses don't have mic
            // Try SCO first (will fall back if unavailable)
            Log.d(TAG, "Using phone mic (user preference or no glasses mic available)");
            switchToScoMode();
        }
    }
    
    /**
     * Attempts to switch to SCO mode for best audio quality
     */
    public void switchToScoMode() {
        // Always execute on main thread to prevent Handler threading issues
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::switchToScoMode);
            return;
        }
        
        if (isPhoneCallActive || isExternalAudioActive) {
            // Can't use SCO during conflicts
            Log.d(TAG, "Cannot use SCO mode due to active conflicts, falling back to normal mode");
            switchToNormalMode();
            return;
        }
        
        // Clean up existing instance
        cleanUpCurrentMic();
        
        // If we were using glasses mic, disable it
        if (currentStatus == MicStatus.GLASSES_MIC && glassesRep != null && glassesRep.smartGlassesCommunicator != null) {
            Log.d(TAG, "Disabling glasses microphone before switching to phone mic");
            try {
                glassesRep.smartGlassesCommunicator.changeSmartGlassesMicrophoneState(false);
            } catch (Exception e) {
                Log.e(TAG, "Error disabling glasses mic", e);
            }
        }
        
        // Ensure microphone service is started for phone mic hardware access
        ensureMicrophoneServiceStarted();
        
        // Create new microphone with SCO enabled
        try {
            // Request audio focus BEFORE creating the AudioRecord
            if (!requestAudioFocus()) {
                Log.e(TAG, "Failed to get audio focus - another app may be using microphone");
                // On Samsung, this might mean Gboard is already trying to use the mic
                pauseRecording();
                return;
            }
            
            Log.d(TAG, "Switching to SCO mode");
            // Create new microphone with SCO enabled - this should forward audio to the speech recognition system
            micInstance = new MicrophoneLocalAndBluetooth(context, true, audioChunkCallback, this);
            
            // Notify lifecycle manager about the new mic instance for health monitoring
            if (lifecycleManager != null) {
                lifecycleManager.setActiveMicInstance(micInstance);
            }
            
            Log.d(TAG, "✅ Phone SCO mic initialized - audio should now flow to speech recognition");
            currentStatus = MicStatus.SCO_MODE;
            lastModeChangeTime = System.currentTimeMillis(); // Track mode change time
            notifyStatusChange();
            scoRetries = 0; // Reset retry counter on success
            
            // Samsung monitoring disabled - using standard monitoring
        } catch (Exception e) {
            Log.e(TAG, "Failed to start SCO mode", e);
            abandonAudioFocus(); // Release focus on failure
            // Keep service running even on failure to avoid restart issues
            Log.e(TAG, "Mic creation failed but keeping service alive");
            attemptFallback();
        }
    }
    
    /**
     * Switches to normal phone microphone mode
     */
    public void switchToNormalMode() {
        // Always execute on main thread to prevent Handler threading issues
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::switchToNormalMode);
            return;
        }
        
        // Check if normal mode is possible
        if (isPhoneCallActive) {
            // Can't use microphone during call
            Log.d(TAG, "Cannot use normal mode due to active phone call, pausing recording");
            pauseRecording();
            return;
        }
        
        // Clean up existing instance
        cleanUpCurrentMic();
        
        // If we were using glasses mic, disable it
        if (currentStatus == MicStatus.GLASSES_MIC && glassesRep != null && glassesRep.smartGlassesCommunicator != null) {
            Log.d(TAG, "Disabling glasses microphone before switching to phone mic");
            try {
                glassesRep.smartGlassesCommunicator.changeSmartGlassesMicrophoneState(false);
            } catch (Exception e) {
                Log.e(TAG, "Error disabling glasses mic", e);
            }
        }
        
        // Ensure microphone service is started for phone mic hardware access
        ensureMicrophoneServiceStarted();
        
        try {
            // Request audio focus BEFORE creating the AudioRecord
            if (!requestAudioFocus()) {
                Log.e(TAG, "Failed to get audio focus - another app may be using microphone");
                // On Samsung, this might mean Gboard is already trying to use the mic
                pauseRecording();
                return;
            }
            
            Log.d(TAG, "Switching to normal phone microphone mode");
            // Create new microphone with SCO disabled
            micInstance = new MicrophoneLocalAndBluetooth(context, false, audioChunkCallback, this);
            
            // Notify lifecycle manager about the new mic instance for health monitoring
            if (lifecycleManager != null) {
                lifecycleManager.setActiveMicInstance(micInstance);
            }
            
            Log.d(TAG, "✅ Normal phone mic initialized - audio should now flow to speech recognition");
            
            currentStatus = MicStatus.NORMAL_MODE;
            lastModeChangeTime = System.currentTimeMillis(); // Track mode change time
            notifyStatusChange();
            
            // Samsung monitoring disabled - using standard monitoring
        } catch (Exception e) {
            Log.e(TAG, "Failed to start normal mode", e);
            abandonAudioFocus(); // Release focus on failure
            // Keep service running even on failure to avoid restart issues
            Log.e(TAG, "Mic creation failed but keeping service alive");
            switchToGlassesMic(); // Try glasses mic as a last resort
        }
    }
    
    /**
     * Switches to using the glasses' onboard microphone if available
     */
    public void switchToGlassesMic() {
        // Always execute on main thread to prevent Handler threading issues
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::switchToGlassesMic);
            return;
        }
        
        // Check if glasses mic is available
        if (glassesRep == null || !glassesRep.smartGlassesDevice.getHasInMic()) {
            // No glasses mic available, we've exhausted all options
            Log.e(TAG, "No glasses microphone available, pausing recording");
            pauseRecording();
            return;
        }
        
        // Clean up existing instance
        cleanUpCurrentMic();
        
        // Keep MicrophoneService alive for quick return to phone mic
        // This avoids Android 15 background start restrictions
        Log.d(TAG, "Keeping MicrophoneService alive for potential return to phone mic");
        
        // Samsung monitoring disabled
        
        try {
            Log.d(TAG, "Switching to glasses onboard microphone");
            
            // Actually enable the glasses microphone
            if (glassesRep != null && glassesRep.smartGlassesCommunicator != null) {
                Log.d(TAG, "Enabling glasses microphone");
                glassesRep.smartGlassesCommunicator.changeSmartGlassesMicrophoneState(true);
                
                // Update our status
                currentStatus = MicStatus.GLASSES_MIC;
                lastModeChangeTime = System.currentTimeMillis(); // Track mode change time  
                notifyStatusChange();
                
                // Notify speech recognition system that mic is active
                // This is important because glasses mic audio comes through a different path
                if (audioProcessingCallback instanceof SpeechRecSwitchSystem) {
                    ((SpeechRecSwitchSystem) audioProcessingCallback).microphoneStateChanged(true, requiredData);
                }
            } else {
                Log.e(TAG, "SmartGlassesRepresentative or communicator is null, cannot enable glasses mic");
                pauseRecording();
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to switch to glasses mic", e);
            pauseRecording();
        }
    }
    
    /**
     * Temporarily pauses microphone recording
     */
    public void pauseRecording() {
        // Always execute on main thread to prevent Handler threading issues
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::pauseRecording);
            return;
        }
        
        // Smart debouncing for pause requests
        long now = System.currentTimeMillis();
        long timeSinceLastChange = now - lastModeChangeTime;
        
        // If already paused and this is a duplicate request, skip it
        if (currentStatus == MicStatus.PAUSED && timeSinceLastChange < MODE_CHANGE_DEBOUNCE_MS) {
            Log.d(TAG, "Duplicate pause request within debounce period - skipping");
            return;
        }
        
        // Cancel any pending enable since we're now pausing
        if (pendingModeChangeRunnable != null) {
            mainHandler.removeCallbacks(pendingModeChangeRunnable);
            pendingModeChangeRunnable = null;
            pendingMicRequest = false;
        }
        
        // If mic is enabled and this is a rapid disable, execute immediately
        // (We don't want to delay turning off the mic)
        if (currentStatus != MicStatus.PAUSED) {
            Log.d(TAG, "Mic is currently enabled - executing pause immediately");
            executePause();
        }
    }
    
    /**
     * Actually executes the pause logic
     */
    private void executePause() {
        Log.d(TAG, "Executing microphone pause");
        
        // Check if we're coming from SCO mode
        boolean wasScoMode = currentStatus == MicStatus.SCO_MODE;
        
        // Stop any active recording
        cleanUpCurrentMic();
        
        // Keep MicrophoneService alive to avoid Android 15 restrictions
        // Service remains ready for quick mic re-activation
        Log.d(TAG, "Keeping MicrophoneService alive (paused but ready)");
        
        // Samsung monitoring disabled
        
        // IMPORTANT: Abandon audio focus when pausing so other apps can use the mic
        abandonAudioFocus();
        
        // Disable glasses mic if it was active
        if (currentStatus == MicStatus.GLASSES_MIC && glassesRep != null && 
            glassesRep.smartGlassesCommunicator != null) {
            try {
                Log.d(TAG, "Disabling glasses microphone");
                glassesRep.smartGlassesCommunicator.changeSmartGlassesMicrophoneState(false);
            } catch (Exception e) {
                Log.e(TAG, "Error disabling glasses mic", e);
            }
        }
        
        // Make sure all audio-related resources are released
        if (audioManager != null) {
            try {
                // Stop SCO if it was active
                if (wasScoMode) {
                    Log.d(TAG, "Coming from SCO mode - stopping Bluetooth SCO");
                }
                
                audioManager.stopBluetoothSco();
                audioManager.setMode(AudioManager.MODE_NORMAL);
            } catch (Exception e) {
                Log.e(TAG, "Error stopping SCO audio", e);
            }
        }
        
        // Update status
        currentStatus = MicStatus.PAUSED;
        lastModeChangeTime = System.currentTimeMillis(); // Track mode change time
        notifyStatusChange();
        
        Log.d(TAG, "Microphone recording fully paused");
    }
    
    /**
     * Attempts to fall back to next best microphone option after a failure
     */
    private void attemptFallback() {
        if (currentStatus == MicStatus.SCO_MODE && scoRetries < MAX_SCO_RETRIES) {
            // Retry SCO mode a few times before falling back
            scoRetries++;
            Log.d(TAG, "Retrying SCO mode, attempt " + scoRetries);
            switchToScoMode();
        } else {
            // Fall back to normal mode
            switchToNormalMode();
        }
    }
    
    /**
     * Cleans up current microphone instance
     */
    private void cleanUpCurrentMic() {
        if (micInstance != null) {
            try {
                // Make sure we fully destroy the mic instance
                micInstance.destroy();
            } catch (Exception e) {
                Log.e(TAG, "Error destroying microphone instance", e);
            } finally {
                // Always clear the reference even if destroy fails
                micInstance = null;
                
                // Clear reference in lifecycle manager
                if (lifecycleManager != null) {
                    lifecycleManager.setActiveMicInstance(null);
                }
            }
        }
        
        // Always abandon audio focus when cleaning up mic
        // This ensures other apps can use the microphone
        abandonAudioFocus();
    }
    
    /**
     * Registers an AudioRecord's session ID as belonging to us
     * This helps us filter out our own recordings in the AudioRecordingCallback
     */
    public void registerOurAudioRecord(AudioRecord audioRecord) {
        if (audioRecord != null) {
            int clientId = audioRecord.getAudioSessionId();
            Log.d(TAG, "Registering our audio client ID: " + clientId);
            
            if (!ourAudioClientIds.contains(clientId)) {
                ourAudioClientIds.add(clientId);
            }
        }
    }
    
    /**
     * Unregisters an AudioRecord's session ID when we're done with it
     */
    public void unregisterOurAudioRecord(AudioRecord audioRecord) {
        if (audioRecord != null) {
            int clientId = audioRecord.getAudioSessionId();
            Log.d(TAG, "Unregistering our audio client ID: " + clientId);
            
            ourAudioClientIds.remove(Integer.valueOf(clientId));
        }
    }
    
    /**
     * Ensures the microphone service is started for this session.
     * Starts it only once per session to avoid Android 15 background start restrictions.
     */
    private void ensureMicrophoneServiceStarted() {
        if (!serviceStartedForSession && !isMicrophoneServiceRunning && !isMicrophoneServiceStarting) {
            Log.d(TAG, "Starting MicrophoneService for this session");
            startMicrophoneService();
            serviceStartedForSession = true;
        } else {
            Log.d(TAG, "MicrophoneService already started for session or currently running");
        }
    }
    
    /**
     * Starts the dedicated microphone foreground service when phone mic hardware is needed
     */
    private void startMicrophoneService() {
        long now = System.currentTimeMillis();
        
        // Check if service is already running or starting
        if (isMicrophoneServiceRunning || isMicrophoneServiceStarting) {
            Log.d(TAG, "MicrophoneService already running/starting, skipping start");
            return;
        }
        
        // Debounce rapid service state changes
        if (now - lastServiceStateChangeTime < SERVICE_STATE_CHANGE_DEBOUNCE_MS) {
            Log.d(TAG, "Service state change too recent, delaying start");
            mainHandler.postDelayed(this::startMicrophoneService, SERVICE_STATE_CHANGE_DEBOUNCE_MS);
            return;
        }
        
        try {
            isMicrophoneServiceStarting = true;
            lastServiceStateChangeTime = now;
            
            Intent intent = new Intent(context, MicrophoneService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            
            // Mark as running after a brief delay to allow startForeground() to complete
            mainHandler.postDelayed(() -> {
                isMicrophoneServiceRunning = true;
                isMicrophoneServiceStarting = false;
                Log.d(TAG, "MicrophoneService successfully started and running");
            }, 200); // 200ms delay
            
            Log.d(TAG, "Started MicrophoneService for phone microphone access");
        } catch (Exception e) {
            Log.e(TAG, "Error starting MicrophoneService", e);
            isMicrophoneServiceStarting = false;
        }
    }
    
    /**
     * Stops the dedicated microphone foreground service when phone mic hardware not needed
     */
    private void stopMicrophoneService() {
        long now = System.currentTimeMillis();
        
        // Don't stop if not running or if currently starting
        if (!isMicrophoneServiceRunning && !isMicrophoneServiceStarting) {
            Log.d(TAG, "MicrophoneService not running, skipping stop");
            return;
        }
        
        // If service is starting, wait for it to complete before stopping
        if (isMicrophoneServiceStarting) {
            Log.d(TAG, "MicrophoneService is starting, delaying stop");
            mainHandler.postDelayed(this::stopMicrophoneService, 300);
            return;
        }
        
        // Debounce rapid service state changes
        if (now - lastServiceStateChangeTime < SERVICE_STATE_CHANGE_DEBOUNCE_MS) {
            Log.d(TAG, "Service state change too recent, delaying stop");
            mainHandler.postDelayed(this::stopMicrophoneService, SERVICE_STATE_CHANGE_DEBOUNCE_MS);
            return;
        }
        
        try {
            lastServiceStateChangeTime = now;
            
            Intent intent = new Intent(context, MicrophoneService.class);
            context.stopService(intent);
            isMicrophoneServiceRunning = false;
            isMicrophoneServiceStarting = false;
            Log.d(TAG, "Stopped MicrophoneService - no phone microphone access needed");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping MicrophoneService", e);
            // Reset flags even on error to prevent stuck state
            isMicrophoneServiceRunning = false;
            isMicrophoneServiceStarting = false;
        }
    }
    
    /**
     * Notifies system about microphone mode changes
     */
    private void notifyStatusChange() {
        // Send status update to system
        EventBus.getDefault().post(new MicModeChangedEvent(currentStatus));
    }
    
    /**
     * Initializes phone call detection
     */
    private void initCallDetection() {
        try {
            // Check for telephony permissions before proceeding
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
                    != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "Missing READ_PHONE_STATE permission, skipping call detection");
                // Continue without call detection - we'll just miss the call detection feature
                // but the rest of the mic functionality should work
                return;
            }

            // On newer Android (11+), check for additional permissions but don't fail
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PRECISE_PHONE_STATE)
                        != PackageManager.PERMISSION_GRANTED) {
                    Log.w(TAG, "Missing READ_PRECISE_PHONE_STATE permission, call detection might be limited");
                    // Continue anyway as basic functionality might work
                }
            }

            telephonyManager = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
            phoneStateListener = new PhoneStateListener() {
                @Override
                public void onCallStateChanged(int state, String phoneNumber) {
                    boolean wasCallActive = isPhoneCallActive;
                    isPhoneCallActive = (state != TelephonyManager.CALL_STATE_IDLE);
                    
                    Log.d(TAG, "Phone call state changed: " + (isPhoneCallActive ? "ACTIVE" : "IDLE"));
                    
                    // If call state changed, update mic mode
                    if (wasCallActive != isPhoneCallActive) {
                        if (isPhoneCallActive) {
                            // Check if we can switch to glasses mic during the call
                            boolean usingForcedPhoneMic = "phone".equals(SmartGlassesManager.getPreferredMic(context));
                            boolean glassesWithMicAvailable = glassesRep != null && 
                                                           glassesRep.smartGlassesDevice != null && 
                                                           glassesRep.smartGlassesDevice.getHasInMic();
                            
                            if (usingForcedPhoneMic && glassesWithMicAvailable) {
                                // User was using forced phone mic but has glasses with mic - switch temporarily
                                Log.d(TAG, "🔄 Phone call active - temporarily switching to glasses mic");
                                usingFallbackDueToConflict = true; // Mark as fallback
                                switchToGlassesMic();
                            } else {
                                // No glasses mic available - need to pause recording
                                Log.d(TAG, "Phone call active - pausing recording (no glasses mic available)");
                                pauseRecording();
                            }
                        } else {
                            // Call ended, resume with preferred mode
                            Log.d(TAG, "Phone call ended - resuming preferred microphone mode");
                            usingFallbackDueToConflict = false; // Clear fallback flag
                            startPreferredMicMode();
                        }
                    }
                }
            };
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
        } catch (SecurityException se) {
            Log.e(TAG, "Security exception in call detection: " + se.getMessage());
            // Continue without call detection - we'll just miss the feature
        } catch (Exception e) {
            Log.e(TAG, "Error in call detection: " + e.getMessage());
            // Continue without call detection
        }
    }
    
    /**
     * Initializes audio conflict detection
     */
    private void initAudioConflictDetection() {
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        
        // Initialize audio focus listener - this is crucial for Samsung devices
        audioFocusListener = new AudioManager.OnAudioFocusChangeListener() {
            @Override
            public void onAudioFocusChange(int focusChange) {
                Log.d(TAG, "Audio focus changed: " + focusChange);
                
                switch (focusChange) {
                    case AudioManager.AUDIOFOCUS_LOSS:
                        // Permanent loss - usually means music/video playback
                        Log.d(TAG, "Permanent audio focus loss - likely media playback, not mic request");
                        
                        // Notify lifecycle manager that this is an audio focus loss
                        if (lifecycleManager != null) {
                            lifecycleManager.onAudioFocusLost();
                        }
                        
                        hasAudioFocus = false;
                        
                        // For Samsung: Don't run the test for permanent loss (YouTube/Spotify)
                        // Just keep recording - the media app doesn't need the mic
                        Log.d(TAG, "📱 Keeping phone mic active during media playback");
                        break;
                        
                    case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                        // Transient loss - might be for recording (Gboard) or brief playback
                        Log.d(TAG, "Transient audio focus loss - checking if another app is actually recording...");
                        
                        // Notify lifecycle manager that this is an audio focus loss
                        if (lifecycleManager != null) {
                            lifecycleManager.onAudioFocusLost();
                        }
                        
                        hasAudioFocus = false;
                        
                        // Check if this is a Samsung device - they need special handling
                        boolean isSamsung = "samsung".equalsIgnoreCase(Build.MANUFACTURER);
                        
                        if (isSamsung && (currentStatus == MicStatus.SCO_MODE || currentStatus == MicStatus.NORMAL_MODE)) {
                            // Samsung devices don't properly report when other apps are recording
                            // Use "quick release and re-grab" technique to detect if another app needs the mic
                            Log.d(TAG, "🔧 Samsung device detected - using quick release test to detect mic conflict");
                            
                            // Test if another app actually wants the mic by briefly releasing it
                            testMicrophoneAvailabilityOnSamsung();
                        } else {
                            // Non-Samsung devices or when not using phone mic
                            // Delay briefly to see if another app actually starts recording
                            // This helps distinguish between music playback (Spotify) and actual mic usage (Gboard)
                            mainHandler.postDelayed(() -> {
                                // The isExternalAudioActive flag is updated by our monitoring systems
                                // (AudioRecordingCallback on API 29+ and Samsung monitoring)
                                // Check if external app is actually using the microphone
                                if (isExternalAudioActive) {
                                    Log.d(TAG, "🎤 Another app is ACTUALLY recording - switching to fallback");
                                    
                                    if (currentStatus == MicStatus.SCO_MODE || currentStatus == MicStatus.NORMAL_MODE) {
                                        // Mark that we're using fallback due to conflict
                                        usingFallbackDueToConflict = true;
                                        
                                        // Switch to glasses mic or pause
                                        if (glassesRep != null && glassesRep.smartGlassesDevice != null && 
                                            glassesRep.smartGlassesDevice.getHasInMic()) {
                                            Log.d(TAG, "Switching to glasses mic as FALLBACK due to actual mic conflict");
                                            switchToGlassesMic();
                                        } else {
                                            Log.d(TAG, "Pausing recording due to actual mic conflict");
                                            pauseRecording();
                                        }
                                    }
                                } else {
                                    Log.d(TAG, "📱 Audio focus lost to playback app (like Spotify) - keeping phone mic active");
                                    // Don't switch mics for music playback
                                    // Keep recording with phone mic
                                }
                            }, 500); // 500ms delay to let other app start recording
                        }
                        break;
                        
                    case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                        // We can continue at lower volume - not applicable for mic recording
                        Log.d(TAG, "Audio focus loss - can duck (ignoring for mic)");
                        break;
                        
                    case AudioManager.AUDIOFOCUS_GAIN:
                        // We got focus back!
                        Log.d(TAG, "🎤 Regained audio focus");
                        hasAudioFocus = true;
                        
                        // Notify lifecycle manager that focus is regained
                        if (lifecycleManager != null) {
                            lifecycleManager.onAudioFocusGained();
                        }
                        
                        // For Samsung devices, reset the manually-set external recording flag
                        // since we had to set it manually during our quick release test
                        if ("samsung".equalsIgnoreCase(Build.MANUFACTURER) && isExternalAudioActive) {
                            Log.d(TAG, "Samsung: Resetting external audio flag after focus regain");
                            isExternalAudioActive = false;
                        }
                        
                        // The isExternalAudioActive flag is already being monitored by our systems
                        // No need to explicitly check here (except for Samsung above)
                        
                        // If we were using a fallback due to actual mic conflict, return to desired mic
                        if (usingFallbackDueToConflict && currentStatus == MicStatus.GLASSES_MIC) {
                            mainHandler.postDelayed(() -> {
                                if (hasAudioFocus && !isPhoneCallActive && !isExternalAudioActive && usingFallbackDueToConflict) {
                                    Log.d(TAG, "Returning to DESIRED mic (" + desiredMicStatus + ") after regaining audio focus");
                                    usingFallbackDueToConflict = false;
                                    
                                    if (desiredMicStatus == MicStatus.SCO_MODE || desiredMicStatus == MicStatus.NORMAL_MODE) {
                                        switchToScoMode();
                                    }
                                }
                            }, 500); // Small delay to let the other app fully release
                        }
                        // Resume if we were paused
                        else if (currentStatus == MicStatus.PAUSED) {
                            mainHandler.postDelayed(() -> {
                                if (hasAudioFocus && !isPhoneCallActive && !isExternalAudioActive) {
                                    Log.d(TAG, "Resuming recording after audio focus gain");
                                    startPreferredMicMode();
                                }
                            }, 500); // Small delay to let the other app fully release
                        }
                        // If we kept the phone mic active during playback, just log it
                        else if ((currentStatus == MicStatus.SCO_MODE || currentStatus == MicStatus.NORMAL_MODE) && !usingFallbackDueToConflict) {
                            Log.d(TAG, "Audio focus regained - phone mic was kept active, continuing normally");
                        }
                        break;
                }
            }
        };
        
        // Register for audio events
        IntentFilter filter = new IntentFilter();
        filter.addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        filter.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        filter.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        
        audioStateReceiver = new BroadcastReceiver() {
            @SuppressLint("MissingPermission")
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                Log.d(TAG, "Audio state changed: " + action);
                if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(action)) {
                    // Audio route changed - possible conflict
                    Log.d(TAG, "Audio becoming noisy - possible conflict detected");
                    isExternalAudioActive = true;
                    
                    if (currentStatus == MicStatus.SCO_MODE) {
                        // Switch to normal mode temporarily
                        switchToNormalMode();
                    }
                } else if (BluetoothDevice.ACTION_ACL_CONNECTED.equals(action)) {
                    // New BT device - check if it's an audio device
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    Log.d(TAG, "Bluetooth device connected: " + 
                          (device != null ? device.getName() : "Unknown"));
                    
                    if (device != null && isSupportedBluetoothMic(device)) {
                        // If in normal mode, try SCO again since a new BT mic is available
                        if (currentStatus == MicStatus.NORMAL_MODE) {
                            switchToScoMode();
                        }
                    }
                } else if (BluetoothDevice.ACTION_ACL_DISCONNECTED.equals(action)) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    Log.d(TAG, "Bluetooth device disconnected: " + 
                          (device != null ? device.getName() : "Unknown"));
                    
                    // Reset external audio flag if this was causing the conflict
                    isExternalAudioActive = false;
                    
                    // If not in SCO mode already and no conflicts, try SCO again
                    if (currentStatus != MicStatus.SCO_MODE && !isPhoneCallActive) {
                        switchToScoMode();
                    }
                }
            }
        };
        
        try {
            context.registerReceiver(audioStateReceiver, filter);
            isReceiverRegistered = true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to register audio state receiver", e);
        }
        
        // Register AudioRecordingCallback to detect when other apps use microphone
        // Note: This may not work on Samsung devices due to different audio routing
        try {
            audioRecordingCallback = new AudioManager.AudioRecordingCallback() {
                @Override
                public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configs) {
                    if (configs == null) {
                        Log.d(TAG, "Recording configuration update: null configs");
                        return;
                    }
                    
                    // Removed Samsung-specific logging - standard monitoring works for all devices
                    
                    // Filter out our own audio recordings by client ID 
                    List<AudioRecordingConfiguration> otherAppRecordings = new ArrayList<>();
                    for (AudioRecordingConfiguration config : configs) {
                        int clientId = config.getClientAudioSessionId();
                        if (!ourAudioClientIds.contains(clientId)) {
                            otherAppRecordings.add(config);
                        }
                    }
                    
                    boolean otherAppsRecording = !otherAppRecordings.isEmpty();
                    
                    // Samsung fallback detection removed - standard detection works
                    
                    // Log what's happening but only when there's a change or there are external recordings
                    if (otherAppsRecording || otherAppsRecording != isExternalAudioActive) {
                        Log.d(TAG, "Recording configuration change detected:");
                        Log.d(TAG, "- Total recordings: " + configs.size());
                        Log.d(TAG, "- Our recordings: " + (configs.size() - otherAppRecordings.size()));
                        Log.d(TAG, "- Other app recordings: " + otherAppRecordings.size());
                        
                        // For debugging, log details about the other recordings
                        for (AudioRecordingConfiguration config : otherAppRecordings) {
                            Log.d(TAG, "  - Client: " + config.getClientAudioSessionId() +
                                  ", Source: " + config.getAudioSource());
                        }
                    }
                    
                    // Only take action if this represents a change in state
                    if (otherAppsRecording != isExternalAudioActive) {
                        isExternalAudioActive = otherAppsRecording;
                        handleExternalAudioStateChange(otherAppsRecording);
                    }
                }
            };
            
            audioManager.registerAudioRecordingCallback(audioRecordingCallback, mainHandler);
            isAudioRecordingCallbackRegistered = true;
            Log.d(TAG, "Successfully registered AudioRecordingCallback");
            
            // Get initial state
            List<AudioRecordingConfiguration> initialConfigs = 
                    audioManager.getActiveRecordingConfigurations();
            
            // Count how many external recordings are already happening
            int externalRecordings = 0;
            for (AudioRecordingConfiguration config : initialConfigs) {
                if (!ourAudioClientIds.contains(config.getClientAudioSessionId())) {
                    externalRecordings++;
                }
            }
            
            isExternalAudioActive = externalRecordings > 0;
            if (isExternalAudioActive) {
                Log.d(TAG, "🎤 Detected " + externalRecordings + 
                      " active external recordings at initialization");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register AudioRecordingCallback", e);
            // Continue without this feature - it's enhanced functionality
        }
        
        // Samsung-specific monitoring disabled - using standard monitoring for all devices
        // The standard AudioRecordingCallback and audio focus system work better
    }
    
    // Samsung-specific Gboard detection removed - not needed with standard monitoring
    
    /**
     * Samsung-specific audio detection fallback method
     */
    private boolean detectSamsungExternalAudio(List<AudioRecordingConfiguration> configs) {
        // For Samsung, assume external audio if we see ANY recording configs
        // when we don't expect any (since AudioRecordingCallback may not work properly)
        int expectedOurRecordings = (micInstance != null && currentStatus != MicStatus.PAUSED) ? 1 : 0;
        
        if (configs.size() > expectedOurRecordings) {
            Log.d(TAG, "🎤 Samsung fallback detection: " + configs.size() + 
                  " recordings detected, expected " + expectedOurRecordings);
            return true;
        }
        
        return false;
    }
    
    // Samsung-specific audio monitoring
    private Handler samsungAudioMonitorHandler;
    private Runnable samsungAudioMonitorRunnable;
    private boolean samsungAudioMonitorActive = false;
    
    /**
     * Initialize Samsung-specific audio monitoring using AudioManager state polling
     */
    private void initSamsungAudioMonitoring() {
        Log.d(TAG, "Initializing Samsung-specific audio monitoring");
        
        samsungAudioMonitorHandler = new Handler(Looper.getMainLooper());
        samsungAudioMonitorRunnable = new Runnable() {
            @Override
            public void run() {
                if (samsungAudioMonitorActive) {
                    checkSamsungAudioState();
                    // Check every 500ms for audio state changes
                    samsungAudioMonitorHandler.postDelayed(this, 500);
                }
            }
        };
    }
    
    /**
     * Start Samsung audio monitoring when our mic is active
     */
    private void startSamsungAudioMonitoring() {
        if ("samsung".equalsIgnoreCase(Build.MANUFACTURER) && 
            samsungAudioMonitorHandler != null && !samsungAudioMonitorActive) {
            Log.d(TAG, "Starting Samsung audio state monitoring (with 2s delay to avoid false positives)");
            samsungAudioMonitorActive = true;
            // Delay start by 2 seconds to let our own audio mode settle
            samsungAudioMonitorHandler.postDelayed(samsungAudioMonitorRunnable, 2000);
        }
    }
    
    /**
     * Stop Samsung audio monitoring
     */
    private void stopSamsungAudioMonitoring() {
        if (samsungAudioMonitorActive && samsungAudioMonitorHandler != null) {
            Log.d(TAG, "Stopping Samsung audio state monitoring");
            samsungAudioMonitorActive = false;
            samsungAudioMonitorHandler.removeCallbacks(samsungAudioMonitorRunnable);
        }
    }
    
    /**
     * Check Samsung audio state for external audio activity
     */
    private void checkSamsungAudioState() {
        try {
            if (audioManager == null) return;
            
            // IMPORTANT: MODE_IN_COMMUNICATION is what WE set for Samsung devices
            // So we need to ignore it when we're actively recording
            int currentMode = audioManager.getMode();
            
            // Only consider it external audio if:
            // 1. Mode is IN_CALL (phone call) 
            // 2. Mode changed from what we expect
            boolean isPhoneCall = (currentMode == AudioManager.MODE_IN_CALL);
            boolean unexpectedMode = false;
            
            // Check if the mode is different from what we expect
            if (currentStatus == MicStatus.SCO_MODE) {
                // In SCO mode, we expect MODE_IN_CALL
                unexpectedMode = (currentMode != AudioManager.MODE_IN_CALL);
            } else if (currentStatus == MicStatus.NORMAL_MODE) {
                // In normal mode on Samsung, we set MODE_IN_COMMUNICATION
                unexpectedMode = (currentMode != AudioManager.MODE_IN_COMMUNICATION && 
                               currentMode != AudioManager.MODE_NORMAL);
            }
            
            // Only flag as external if it's a phone call or unexpected mode
            boolean suspectedExternalAudio = isPhoneCall || 
                                           (unexpectedMode && currentStatus != MicStatus.PAUSED);
            
            if (suspectedExternalAudio != isExternalAudioActive) {
                // Log.d(TAG, "🎤 Samsung audio state change detected - suspected external: " + suspectedExternalAudio);
                // Log.d(TAG, "  Audio mode: " + currentMode + 
                //       " (NORMAL=" + AudioManager.MODE_NORMAL + 
                //       ", IN_CALL=" + AudioManager.MODE_IN_CALL + 
                //       ", IN_COMMUNICATION=" + AudioManager.MODE_IN_COMMUNICATION + ")");
                // Log.d(TAG, "  Current mic status: " + currentStatus);
                
                // Only trigger if this is truly external
                if (suspectedExternalAudio && currentMode == AudioManager.MODE_IN_CALL) {
                    // This is likely a real phone call or external app
                    isExternalAudioActive = true;
                    handleExternalAudioStateChange(true);
                } else if (!suspectedExternalAudio && isExternalAudioActive) {
                    // External app released the mic
                    isExternalAudioActive = false;
                    handleExternalAudioStateChange(false);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in Samsung audio state check", e);
        }
    }
    
    /**
     * Handle external audio state changes (extracted from AudioRecordingCallback logic)
     */
    private void handleExternalAudioStateChange(boolean externalAudioActive) {
        // Check if we've changed modes too recently (debounce)
        long now = System.currentTimeMillis();
        if (now - lastModeChangeTime < MODE_CHANGE_DEBOUNCE_MS) {
            Log.d(TAG, "Detected audio state change but ignoring (debounce active)");
            return;
        }
        
        if (externalAudioActive) {
            Log.d(TAG, "🎤 External app now using microphone - adjusting our recording");
            
            // For any phone-based recording (SCO or normal), try to use glasses mic or pause entirely
            if (currentStatus == MicStatus.SCO_MODE || currentStatus == MicStatus.NORMAL_MODE) {
                // Mark that we're using fallback due to external app
                usingFallbackDueToConflict = true;
                
                // Check if glasses onboard mic is available
                if (glassesRep != null && glassesRep.smartGlassesDevice.getHasInMic()) {
                    Log.d(TAG, "External app needs mic - switching to glasses mic as FALLBACK");
                    switchToGlassesMic();
                } else {
                    Log.d(TAG, "External app needs mic - no glasses mic available, pausing recording");
                    pauseRecording();
                }
            }
        } else {
            Log.d(TAG, "🎤 External apps released microphone - can return to desired mode");
            
            // Return to desired mode after delay
            mainHandler.postDelayed(() -> {
                if (!isExternalAudioActive && !isPhoneCallActive && 
                    System.currentTimeMillis() - lastModeChangeTime >= MODE_CHANGE_DEBOUNCE_MS) {
                    
                    // If we were using a fallback, return to what we actually wanted
                    if (usingFallbackDueToConflict) {
                        Log.d(TAG, "Returning to DESIRED mic (" + desiredMicStatus + ") after external mic release");
                        usingFallbackDueToConflict = false;
                        
                        // Force switch to the mic we actually want
                        if (desiredMicStatus == MicStatus.SCO_MODE || desiredMicStatus == MicStatus.NORMAL_MODE) {
                            switchToScoMode(); // Will try SCO, fall back to normal if needed
                        } else {
                            switchToGlassesMic();
                        }
                    } else {
                        Log.d(TAG, "Returning to preferred mode after external mic release");
                        startPreferredMicMode();
                    }
                }
            }, 1000);
        }
    }
    
    /**
     * Request audio focus for microphone recording
     * This is CRITICAL for Samsung devices to properly share microphone access
     */
    private boolean requestAudioFocus() {
        if (audioManager == null) {
            Log.e(TAG, "AudioManager is null, cannot request focus");
            return false;
        }
        
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Android 8.0+ uses AudioFocusRequest
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                    
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(audioAttributes)
                    .setOnAudioFocusChangeListener(audioFocusListener, mainHandler)
                    .setAcceptsDelayedFocusGain(false) // We need focus immediately for recording
                    .build();
                    
            result = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            // Pre-Android 8.0
            result = audioManager.requestAudioFocus(audioFocusListener,
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        
        hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        Log.d(TAG, "Audio focus request result: " + 
              (hasAudioFocus ? "GRANTED" : "DENIED") + " (code: " + result + ")");
        
        return hasAudioFocus;
    }
    
    /**
     * Abandon audio focus to allow other apps to use the microphone
     * This is CRITICAL for Samsung devices - must release focus when not recording
     */
    private void abandonAudioFocus() {
        if (audioManager == null || !hasAudioFocus) {
            return;
        }
        
        Log.d(TAG, "Abandoning audio focus to allow other apps to use microphone");
        
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            // Use the stored AudioFocusRequest
            result = audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null; // Clear the reference
        } else {
            // Pre-Android 8.0
            result = audioManager.abandonAudioFocus(audioFocusListener);
        }
        
        hasAudioFocus = false;
        Log.d(TAG, "Audio focus abandon result: " + result);
    }
    
    /**
     * Checks if a Bluetooth device is a supported microphone device
     */
    private boolean isSupportedBluetoothMic(BluetoothDevice device) {
        // In a full implementation, we would check for headset profile support
        // For now we'll assume any BT device could be a mic to be safe
        return true;
    }
    
    /**
     * Gets the current microphone status
     */
    public MicStatus getCurrentStatus() {
        return currentStatus;
    }
    
    /**
     * Clean up resources and stop recording
     */
    public void destroy() {
        Log.d(TAG, "Destroying PhoneMicrophoneManager");
        
        cleanUpCurrentMic();
        
        // Clean up lifecycle manager
        if (lifecycleManager != null) {
            lifecycleManager.cleanup();
            lifecycleManager = null;
        }
        
        // Stop microphone service and reset all flags
        stopMicrophoneService();
        serviceStartedForSession = false;
        
        // Samsung monitoring disabled
        
        // Abandon audio focus
        abandonAudioFocus();
        
        // Force reset service flags to prevent stuck state
        isMicrophoneServiceRunning = false;
        isMicrophoneServiceStarting = false;
        serviceStartedForSession = false;
        
        // Unregister listeners
        if (phoneStateListener != null) {
            try {
                telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering phone state listener", e);
            }
        }
        
        if (audioStateReceiver != null && isReceiverRegistered) {
            try {
                context.unregisterReceiver(audioStateReceiver);
                isReceiverRegistered = false;
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering audio state receiver", e);
            }
        }
        
        // Unregister AudioRecordingCallback
        if (audioManager != null && audioRecordingCallback != null && isAudioRecordingCallbackRegistered) {
            try {
                audioManager.unregisterAudioRecordingCallback(audioRecordingCallback);
                isAudioRecordingCallbackRegistered = false;
                Log.d(TAG, "Successfully unregistered AudioRecordingCallback");
            } catch (Exception e) {
                Log.e(TAG, "Error unregistering AudioRecordingCallback", e);
            }
        }
        
        // Clear tracked audio client IDs
        ourAudioClientIds.clear();
    }
    
    /**
     * Called when user changes their microphone preference
     * Immediately switches to the preferred microphone if recording is active
     */
    public void onMicrophonePreferenceChanged() {
        Log.d(TAG, "Microphone preference changed, current status: " + currentStatus);
        
        // Ensure we're on the main thread for Handler operations
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::onMicrophonePreferenceChanged);
            return;
        }
        
        // Update desired mic status based on new preference
        boolean userPrefersPhoneMic = "phone".equals(SmartGlassesManager.getPreferredMic(context));
        desiredMicStatus = userPrefersPhoneMic ? MicStatus.SCO_MODE : MicStatus.GLASSES_MIC;
        
        // Clear fallback flag since this is a user-initiated preference change
        usingFallbackDueToConflict = false;
        
        // Only take action if we're currently recording
        if (currentStatus == MicStatus.PAUSED) {
            Log.d(TAG, "Not recording, preference will take effect on next start");
            return;
        }
        
        // Get the new preference
        boolean glassesHaveMic = glassesRep != null && 
                                glassesRep.smartGlassesDevice != null && 
                                glassesRep.smartGlassesDevice.getHasInMic();
        
        Log.d(TAG, "User prefers phone mic: " + userPrefersPhoneMic + ", Glasses have mic: " + glassesHaveMic);
        
        // Determine what mic we should be using based on new preference
        boolean shouldUseGlassesMic = !userPrefersPhoneMic && glassesHaveMic && !isExternalAudioActive;
        boolean currentlyUsingGlassesMic = (currentStatus == MicStatus.GLASSES_MIC);
        
        // If we need to change mic source
        if (shouldUseGlassesMic != currentlyUsingGlassesMic) {
            Log.d(TAG, "Switching microphone based on new preference");
            
            // Clear any pending operations since this is user-initiated
            if (pendingModeChangeRunnable != null) {
                mainHandler.removeCallbacks(pendingModeChangeRunnable);
                pendingModeChangeRunnable = null;
                pendingMicRequest = false;
            }
            
            if (shouldUseGlassesMic) {
                // Switch to glasses mic
                switchToGlassesMic();
            } else {
                // Switch to phone mic - this will use smart debouncing
                startPreferredMicMode();
            }
        } else {
            Log.d(TAG, "Already using the preferred microphone");
        }
    }

    public void setRequiredData(List<SpeechRequiredDataType> requiredData) {
        this.requiredData = requiredData;
    }
}
