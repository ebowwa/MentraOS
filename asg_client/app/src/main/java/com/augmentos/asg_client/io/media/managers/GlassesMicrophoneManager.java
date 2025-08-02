package com.augmentos.asg_client.io.media.managers;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.augmentos.asg_client.io.bluetooth.core.BluetoothManagerFactory;
import com.augmentos.asg_client.io.bluetooth.interfaces.IBluetoothManager;
import com.augmentos.smartglassesmanager.cpp.L3cCpp;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Manages the microphone on non-K900 glasses to stream audio to the phone
 * when connected via Bluetooth LE.
 */
public class GlassesMicrophoneManager {
    private static final String TAG = "GlassesMicrophoneManager";
    
    // Audio configuration
    private static final int SAMPLING_RATE_IN_HZ = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final float BUFFER_SIZE_SECONDS = 0.128f; // 128ms buffer (2048 samples)
    private final int bufferSize;
    
    // LC3 encoding configuration
    private static final int SAMPLE_RATE_HZ = 16000;
    private static final int FRAME_DURATION_US = 10000; // 10 ms - matching the augmentos_core implementation
    private static final int SAMPLES_PER_FRAME = SAMPLE_RATE_HZ / (1_000_000 / FRAME_DURATION_US); // 160 samples
    private static final int BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2; // 16-bit = 2 bytes/sample = 320 bytes
    
    // Recording state
    private final AtomicBoolean recordingInProgress = new AtomicBoolean(false);
    private final AtomicBoolean isDestroyed = new AtomicBoolean(false);
    private AudioRecord recorder = null;
    private Thread recordingThread = null;
    
    // Dependencies
    private final Context context;
    private final IBluetoothManager bluetoothManager;
    private final Handler mainHandler;
    
    // Callbacks
    private LC3DataCallback lc3DataCallback;
    
    /**
     * Callback interface for LC3 encoded audio data
     */
    public interface LC3DataCallback {
        void onLC3DataAvailable(byte[] lc3Data);
    }
    
    /**
     * Creates a new GlassesMicrophoneManager
     * @param context The application context
     * @param bluetoothManager The existing bluetooth manager instance to use
     */
    public GlassesMicrophoneManager(Context context, IBluetoothManager bluetoothManager) {
        this.context = context.getApplicationContext();
        this.bluetoothManager = bluetoothManager; // Use existing instance instead of creating a new one
        this.mainHandler = new Handler(Looper.getMainLooper());
        
        // Log thread information for debugging
        Log.e(TAG, "⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫");
        Log.e(TAG, "⚫ GlassesMicrophoneManager CONSTRUCTOR CALLED");
        Log.e(TAG, "⚫ Thread ID: " + Thread.currentThread().getId() + ", Thread name: " + Thread.currentThread().getName());
        Log.e(TAG, "⚫ Using existing bluetooth manager: " + (bluetoothManager != null ? bluetoothManager.getClass().getSimpleName() : "null"));
        Log.e(TAG, "⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫⚫");
        
        // Calculate buffer size as power of 2
        int minBufferSize = AudioRecord.getMinBufferSize(
                SAMPLING_RATE_IN_HZ, CHANNEL_CONFIG, AUDIO_FORMAT);
        int targetSize = Math.round(SAMPLING_RATE_IN_HZ * BUFFER_SIZE_SECONDS);
        this.bufferSize = Math.max(minBufferSize, targetSize);
        
        Log.d(TAG, "Created GlassesMicrophoneManager with buffer size: " + bufferSize);
    }
    
    /**
     * Starts recording audio and streaming it over BLE when connected
     */
    public void startRecording() {
        // Always execute on main thread to prevent threading issues
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(this::startRecording);
            return;
        }
        
        // ... rest of the implementation would continue here
        // For brevity, I'm showing the key parts that need import updates
    }

    // ... rest of the implementation would continue here
    // For brevity, I'm showing the key parts that need import updates
} 