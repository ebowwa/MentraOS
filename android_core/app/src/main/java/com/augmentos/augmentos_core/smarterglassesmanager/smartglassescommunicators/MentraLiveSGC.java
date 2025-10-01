package com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.preference.PreferenceManager;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BatteryLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.ButtonPressEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesGalleryStatusEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesWifiScanResultEvent;
//import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesBatteryEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesWifiStatusChange;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHotspotStatusChange;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.KeepAliveAckEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.RtmpStreamStatusEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesVersionInfoEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.DownloadProgressEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.InstallationProgressEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.PairFailureEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.ImuDataEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.ImuGestureEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.isMicEnabledForFrontendEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.MessageChunker;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.BlePhotoUploadService;
import com.augmentos.smartglassesmanager.cpp.L3cCpp;
import com.augmentos.augmentos_core.audio.Lc3Player;

import org.greenrobot.eventbus.EventBus;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.Random;
import java.security.SecureRandom;
import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import io.reactivex.rxjava3.subjects.PublishSubject;

/**
 * Smart Glasses Communicator for Mentra Live (K900) glasses
 * Uses BLE to communicate with the glasses
 *
 * Note: Mentra Live glasses have no display capabilities, only camera and microphone.
 * All display-related methods are stubbed out and will log a message but not actually display anything.
 */
public class MentraLiveSGC extends SmartGlassesCommunicator {
    private static final String TAG = "WearableAi_MentraLiveSGC";
    
    // LC3 frame size for Mentra Live
    private static final int LC3_FRAME_SIZE = 40;

    // Glasses version information
    private String glassesAppVersion = "";
    private String glassesBuildNumber = "";
    private int glassesBuildNumberInt = 0; // Build number as integer for version checks
    private String glassesDeviceModel = "";
    private String glassesAndroidVersion = "";
    private boolean supportsLC3Audio = false; // Whether device supports LC3 audio (false for base K900)

    // BLE UUIDs - updated to match K900 BES2800 MCU UUIDs for compatibility with both glass types
    // CRITICAL FIX: Swapped TX and RX UUIDs to match actual usage from central device perspective
    // In BLE, characteristic names are from the perspective of the device that owns them:
    // - From peripheral's perspective: TX is for sending, RX is for receiving
    // - From central's perspective: RX is peripheral's TX, TX is peripheral's RX
    private static final UUID SERVICE_UUID = UUID.fromString("00004860-0000-1000-8000-00805f9b34fb");
    //000070FF-0000-1000-8000-00805f9b34fb
    private static final UUID RX_CHAR_UUID = UUID.fromString("000070FF-0000-1000-8000-00805f9b34fb"); // Central receives on peripheral's TX
    private static final UUID TX_CHAR_UUID = UUID.fromString("000071FF-0000-1000-8000-00805f9b34fb"); // Central transmits on peripheral's RX
    private static final UUID CLIENT_CHARACTERISTIC_CONFIG_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    // BES => PHONE
    private static final UUID FILE_READ_UUID = UUID.fromString("000072FF-0000-1000-8000-00805f9b34fb");
    private static final UUID FILE_WRITE_UUID = UUID.fromString("000073FF-0000-1000-8000-00805f9b34fb");

    private static final UUID LC3_READ_UUID = UUID.fromString("6E400002-B5A3-F393-E0A9-E50E24DCCA9E");
    private static final UUID LC3_WRITE_UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E");

    // Reconnection parameters
    private static final int BASE_RECONNECT_DELAY_MS = 1000; // Start with 1 second
    private static final int MAX_RECONNECT_DELAY_MS = 30000; // Max 30 seconds
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    private int reconnectAttempts = 0;

    // Keep-alive parameters
    private static final int KEEP_ALIVE_INTERVAL_MS = 5000; // 5 seconds
    private static final int CONNECTION_TIMEOUT_MS = 10000; // 10 seconds

    // Heartbeat parameters
    private static final int HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
    private static final int BATTERY_REQUEST_EVERY_N_HEARTBEATS = 10; // Every 10 heartbeats (5 minutes)
    
    // Micbeat parameters - periodically enable custom audio TX
    private static final long MICBEAT_INTERVAL_MS = (1000 * 60) * 30; // micbeat every 30 minutes

    // Device settings
    private static final String PREFS_NAME = "MentraLivePrefs";
    private static final String PREF_DEVICE_NAME = "LastConnectedDeviceName";

    // Auth settings
    private static final String AUTH_PREFS_NAME = "augmentos_auth_prefs";
    private static final String KEY_CORE_TOKEN = "core_token";

    // State tracking
    private Context context;
    private SmartGlassesDevice smartGlassesDevice;
    private PublishSubject<JSONObject> dataObservable;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bluetoothScanner;
    private BluetoothGatt bluetoothGatt;
    private BluetoothDevice connectedDevice;
    private BluetoothGattCharacteristic txCharacteristic;
    private BluetoothGattCharacteristic rxCharacteristic;
    private BluetoothGattCharacteristic lc3ReadCharacteristic;
    private BluetoothGattCharacteristic lc3WriteCharacteristic;
    private Handler handler = new Handler(Looper.getMainLooper());
    private ScheduledExecutorService scheduler;
    private boolean isScanning = false;
    private boolean isConnecting = false;
    private boolean isKilled = false;
    private ConcurrentLinkedQueue<byte[]> sendQueue = new ConcurrentLinkedQueue<>();
    private Runnable connectionTimeoutRunnable;
    private Handler connectionTimeoutHandler = new Handler(Looper.getMainLooper());
    private Runnable processSendQueueRunnable;
    // Current MTU size
    private int currentMtu = 23; // Default BLE MTU

    // Audio microphone state tracking
    private boolean shouldUseGlassesMic = false; // Whether to use glasses microphone for audio input
    private boolean isMicrophoneEnabled = false; // Track current microphone state

    // Rate limiting - minimum delay between BLE characteristic writes
    private static final long MIN_SEND_DELAY_MS = 160; // 160ms minimum delay (increased from 100ms)
    private long lastSendTimeMs = 0; // Timestamp of last send

    // Battery state tracking
    private int batteryLevel = 50; // Default until we get actual value
    private boolean isCharging = false;
    private boolean isConnected = false;

    // File transfer management
    private ConcurrentHashMap<String, FileTransferSession> activeFileTransfers = new ConcurrentHashMap<>();
    private static final String FILE_SAVE_DIR = "MentraLive_Images";

    // BLE photo transfer tracking
    private Map<String, BlePhotoTransfer> blePhotoTransfers = new HashMap<>();

    private static class BlePhotoTransfer {
        String bleImgId;
        String requestId;
        String webhookUrl;
        String authToken;
        FileTransferSession session;
        long phoneStartTime;  // When phone received the request
        long bleTransferStartTime;  // When BLE transfer actually started
        long glassesCompressionDurationMs;  // How long glasses took to compress

        BlePhotoTransfer(String bleImgId, String requestId, String webhookUrl) {
            this.bleImgId = bleImgId;
            this.requestId = requestId;
            this.webhookUrl = webhookUrl;
            this.authToken = "";
            this.phoneStartTime = System.currentTimeMillis();
            this.bleTransferStartTime = 0;
            this.glassesCompressionDurationMs = 0;
        }

        void setAuthToken(String authToken) {
            this.authToken = authToken != null ? authToken : "";
        }
    }

    // Inner class to track incoming file transfers
    private static class FileTransferSession {
        String fileName;
        int fileSize;
        int totalPackets;
        int expectedNextPacket;
        ConcurrentHashMap<Integer, byte[]> receivedPackets;
        long startTime;
        boolean isComplete;
        boolean isAnnounced;

        FileTransferSession(String fileName, int fileSize) {
            this.fileName = fileName;
            this.fileSize = fileSize;
            this.totalPackets = (fileSize + K900ProtocolUtils.FILE_PACK_SIZE - 1) / K900ProtocolUtils.FILE_PACK_SIZE;
            this.expectedNextPacket = 0;
            this.receivedPackets = new ConcurrentHashMap<>();
            this.startTime = System.currentTimeMillis();
            this.isComplete = false;
            this.isAnnounced = false;
        }

        boolean addPacket(int index, byte[] data) {
            if (index >= 0 && index < totalPackets && !receivedPackets.containsKey(index)) {
                receivedPackets.put(index, data);

                // Update expected next packet if this was the one we were waiting for
                while (receivedPackets.containsKey(expectedNextPacket)) {
                    expectedNextPacket++;
                }

                // Check if complete
                isComplete = (receivedPackets.size() == totalPackets);
                return true;
            }
            return false;
        }
        
        // Check if this is the final packet (highest index we expect)
        boolean isFinalPacket(int index) {
            return index == (totalPackets - 1);
        }
        
        // Check if we should trigger completion check (either complete or final packet received)
        boolean shouldCheckCompletion(int receivedIndex) {
            return isComplete || isFinalPacket(receivedIndex);
        }
        
        // Get list of missing packet indices
        List<Integer> getMissingPackets() {
            List<Integer> missing = new ArrayList<>();
            for (int i = 0; i < totalPackets; i++) {
                if (!receivedPackets.containsKey(i)) {
                    missing.add(i);
                }
            }
            return missing;
        }

        byte[] assembleFile() {
            if (!isComplete) {
                return null;
            }

            byte[] fileData = new byte[fileSize];
            int offset = 0;

            for (int i = 0; i < totalPackets; i++) {
                byte[] packet = receivedPackets.get(i);
                if (packet != null) {
                    System.arraycopy(packet, 0, fileData, offset, packet.length);
                    offset += packet.length;
                }
            }

            return fileData;
        }
    }

    // WiFi state tracking
    private boolean isWifiConnected = false;
    private String wifiSsid = "";

    // Heartbeat tracking
    private Handler heartbeatHandler = new Handler(Looper.getMainLooper());
    private Runnable heartbeatRunnable;
    private int heartbeatCounter = 0;
    private boolean glassesReady = false;
    
    // Micbeat tracking - periodically enable custom audio TX
    private Handler micBeatHandler = new Handler(Looper.getMainLooper());
    private Runnable micBeatRunnable;
    private int micBeatCount = 0;

    // Message tracking for reliable delivery
    private final ConcurrentHashMap<Long, PendingMessage> pendingMessages = new ConcurrentHashMap<>();
    private final AtomicLong messageIdCounter = new AtomicLong(1);
    private static final long ACK_TIMEOUT_MS = 2000; // 2 seconds
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final long RETRY_DELAY_MS = 1000; // 1 second base delay

    // Esoteric message ID generation
    private final SecureRandom secureRandom = new SecureRandom();
    private final long deviceId = System.currentTimeMillis() ^ new Random().nextLong();

    private byte lastReceivedLc3Sequence = -1;
    private byte lc3SequenceNumber = 0;
    private long lc3DecoderPtr = 0;
    private Lc3Player lc3AudioPlayer;
    private boolean audioPlaybackEnabled = false; // Default to enabled

    // Periodic test message for ACK testing
    private static final int TEST_MESSAGE_INTERVAL_MS = 5000; // 5 seconds
    private Handler testMessageHandler = new Handler(Looper.getMainLooper());
    private Runnable testMessageRunnable;
    private int testMessageCounter = 0;

    // Pending message data structure
    private static class PendingMessage {
        final String messageData;
        final long timestamp;
        final int retryCount;
        final Runnable retryRunnable;

        PendingMessage(String messageData, long timestamp, int retryCount, Runnable retryRunnable) {
            this.messageData = messageData;
            this.timestamp = timestamp;
            this.retryCount = retryCount;
            this.retryRunnable = retryRunnable;
        }
    }

    // LC3 Audio Logging and Saving
    private static final boolean LC3_LOGGING_ENABLED = true;
    private static final boolean LC3_SAVING_ENABLED = true;
    private static final String LC3_LOG_DIR = "lc3_audio_logs";
    private FileOutputStream lc3AudioFileStream;
    private String currentLc3FileName;
    private int totalLc3PacketsReceived = 0;
    private int totalLc3BytesReceived = 0;
    private long firstLc3PacketTime = 0;
    private long lastLc3PacketTime = 0;
    private final SimpleDateFormat lc3TimestampFormat = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US);
    private final SimpleDateFormat lc3PacketTimestampFormat = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    public MentraLiveSGC(Context context, SmartGlassesDevice smartGlassesDevice, PublishSubject<JSONObject> dataObservable) {
        super();
        this.context = context;
        this.smartGlassesDevice = smartGlassesDevice;
        this.dataObservable = dataObservable;

        // Initialize bluetooth adapter
        BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        }

        // Initialize connection state
        mConnectState = SmartGlassesConnectionState.DISCONNECTED;

        // Initialize the send queue processor
        processSendQueueRunnable = new Runnable() {
            @Override
            public void run() {
                processSendQueue();
                // Don't reschedule here - let processSendQueue and onCharacteristicWrite handle scheduling
            }
        };

        // Initialize heartbeat runnable
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                sendHeartbeat();
                // Schedule next heartbeat
                heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
            }
        };

        // Initialize test message runnable for ACK testing
        // testMessageRunnable = new Runnable() {
        //     @Override
        //     public void run() {
        //         sendTestMessage();
        //         // Schedule next test message
        //         testMessageHandler.postDelayed(this, TEST_MESSAGE_INTERVAL_MS);
        //     }
        // };

        // Initialize scheduler for keep-alive and reconnection
        scheduler = Executors.newScheduledThreadPool(1);

        //setup LC3 player
        lc3AudioPlayer = new Lc3Player(context);
        if (audioPlaybackEnabled) {
            lc3AudioPlayer.init();
            lc3AudioPlayer.startPlay();
        }

        //setup LC3 decoder for PCM conversion
        if (lc3DecoderPtr == 0) {
            lc3DecoderPtr = L3cCpp.initDecoder();
            Log.d(TAG, "Initialized LC3 decoder for PCM conversion: " + lc3DecoderPtr);
        }
    }

    @Override
    protected void setFontSizes() {
        LARGE_FONT = 3;
        MEDIUM_FONT = 2;
        SMALL_FONT = 1;
    }

    /**
     * Starts BLE scanning for Mentra Live glasses
     */
    private void startScan() {
        if (bluetoothAdapter == null || isScanning) {
            return;
        }

        bluetoothScanner = bluetoothAdapter.getBluetoothLeScanner();
        if (bluetoothScanner == null) {
            Log.e(TAG, "BLE scanner not available");
            return;
        }

        // Configure scan settings
        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        // Set up filters for both standard "Xy_A" and K900 "XyBLE_" device names
        List<ScanFilter> filters = new ArrayList<>();

        // Standard glasses filter
        ScanFilter standardFilter = new ScanFilter.Builder()
                .setDeviceName("Xy_A") // Name for standard glasses BLE peripheral
                .build();
       // filters.add(standardFilter);

        // K900/Mentra Live glasses filter
        ScanFilter k900Filter = new ScanFilter.Builder()
                .setDeviceName("XyBLE_") // Name for K900/Mentra Live glasses
                .build();
       // filters.add(k900Filter);

        // Start scanning
        try {
            Log.d(TAG, "Starting BLE scan for Mentra Live glasses");
            isScanning = true;
            bluetoothScanner.startScan(filters, settings, scanCallback);

            // Set a timeout to stop scanning after 60 seconds (increased from 30 seconds)
            // After timeout, just stop scanning but DON'T automatically try to connect
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (isScanning) {
                        Log.d(TAG, "Scan timeout reached - stopping BLE scan");
                        stopScan();
                        // NOTE: Removed automatic reconnection to last device
                        // Now waits for explicit connection request from UI
                    }
                }
            }, 60000); // 60 seconds (increased from 30)
        } catch (Exception e) {
            Log.e(TAG, "Error starting BLE scan", e);
            isScanning = false;
        }
    }

    /**
     * Stops BLE scanning
     */
    private void stopScan() {
        if (bluetoothAdapter == null || bluetoothScanner == null || !isScanning) {
            return;
        }

        try {
            bluetoothScanner.stopScan(scanCallback);
            isScanning = false;
            Log.d(TAG, "BLE scan stopped");

            // Post event only if we haven't been destroyed
            if (smartGlassesDevice != null) {
                EventBus.getDefault().post(new GlassesBluetoothSearchStopEvent(smartGlassesDevice.deviceModelName));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error stopping BLE scan", e);
            // Ensure isScanning is false even if stop failed
            isScanning = false;
        }
    }

    /**
     * BLE Scan callback
     */
    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            // Check if the object has been destroyed to prevent NPE
            if (context == null || isKilled) {
                Log.d(TAG, "Ignoring scan result - object destroyed or killed");
                return;
            }

            if (result.getDevice() == null || result.getDevice().getName() == null) {
                return;
            }

            String deviceName = result.getDevice().getName();
            String deviceAddress = result.getDevice().getAddress();

            Log.d(TAG, "Found BLE device: " + deviceName + " (" + deviceAddress + ")");

            // Check if this device matches the saved device name
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String savedDeviceName = prefs.getString(PREF_DEVICE_NAME, null);

            // Post the discovered device to the event bus ONLY
            // Don't automatically connect - wait for explicit connect request from UI
            if (deviceName.equals("Xy_A") || deviceName.startsWith("XyBLE_") || deviceName.startsWith("MENTRA_LIVE_BLE") || deviceName.startsWith("MENTRA_LIVE_BT")) {
                String glassType = deviceName.equals("Xy_A") ? "Standard" : "K900";
                Log.d(TAG, "Found compatible " + glassType + " glasses device: " + deviceName);
                EventBus.getDefault().post(new GlassesBluetoothSearchDiscoverEvent(
                        smartGlassesDevice.deviceModelName, deviceName));

                // If already connecting or connected, don't start another connection
                if (isConnected || isConnecting) {
                    return;
                }

                // If this is the specific device we want to connect to by name, connect to it
                if (savedDeviceName != null && savedDeviceName.equals(deviceName)) {
                    Log.d(TAG, "Found our remembered device by name, connecting: " + deviceName);
                    stopScan();
                    connectToDevice(result.getDevice());
                }
            }
        }

        @Override
        public void onScanFailed(int errorCode) {
            Log.e(TAG, "BLE scan failed with error: " + errorCode);
            isScanning = false;
        }
    };

    /**
     * Connect to a specific BLE device
     */
    private void connectToDevice(BluetoothDevice device) {
        if (device == null) {
            return;
        }

        // Cancel any previous connection timeouts
        if (connectionTimeoutRunnable != null) {
            connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
        }

        // Set connection timeout
        connectionTimeoutRunnable = new Runnable() {
            @Override
            public void run() {
                if (isConnecting && !isConnected) {
                    Log.d(TAG, "Connection timeout - closing GATT connection");
                    isConnecting = false;

                    if (bluetoothGatt != null) {
                        bluetoothGatt.disconnect();
                        bluetoothGatt.close();
                        bluetoothGatt = null;
                    }

                    // Try to reconnect with exponential backoff
                    handleReconnection();
                }
            }
        };

        connectionTimeoutHandler.postDelayed(connectionTimeoutRunnable, CONNECTION_TIMEOUT_MS);

        // Update connection state
        isConnecting = true;
        connectionEvent(SmartGlassesConnectionState.CONNECTING);
        Log.d(TAG, "Connecting to device: " + device.getAddress());

        // Connect to the device
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            } else {
                bluetoothGatt = device.connectGatt(context, false, gattCallback);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error connecting to GATT server", e);
            isConnecting = false;
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
        }
    }

    /**
     * Try to reconnect to the last known device by starting a scan and looking for the saved name
     */
    private void reconnectToLastKnownDevice() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String lastDeviceName = prefs.getString(PREF_DEVICE_NAME, null);

        if (lastDeviceName != null && bluetoothAdapter != null) {
            Log.d(TAG, "Attempting to reconnect to last known device by name: " + lastDeviceName);

            // We can't directly connect by name, we need to scan to find the device first
            Log.d(TAG, "Starting scan to find device with name: " + lastDeviceName);
            startScan();

            // The scan callback will automatically connect when it finds a device with this name
        } else {
            // No last device to connect to, start scanning
            Log.d(TAG, "No last known device name, starting scan");
            startScan();
        }
    }

    /**
     * Handle reconnection with exponential backoff
     */
    private void handleReconnection() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.d(TAG, "Maximum reconnection attempts reached (" + MAX_RECONNECT_ATTEMPTS + ")");
            reconnectAttempts = 0;
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
            return;
        }

        // Calculate delay with exponential backoff
        long delay = Math.min(BASE_RECONNECT_DELAY_MS * (1L << reconnectAttempts), MAX_RECONNECT_DELAY_MS);
        reconnectAttempts++;

        Log.d(TAG, "Scheduling reconnection attempt " + reconnectAttempts +
              " in " + delay + "ms (max " + MAX_RECONNECT_ATTEMPTS + ")");

        // Schedule reconnection attempt
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isConnected && !isConnecting && !isKilled) {
                    // Check for last known device name to start scan
                    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    String lastDeviceName = prefs.getString(PREF_DEVICE_NAME, null);

                    if (lastDeviceName != null && bluetoothAdapter != null) {
                        Log.d(TAG, "Reconnection attempt " + reconnectAttempts + " - looking for device with name: " + lastDeviceName);
                        // Start scan to find this device
                        startScan();
                        // The scan will automatically connect if it finds a device with the saved name
                    } else {
                        Log.d(TAG, "Reconnection attempt " + reconnectAttempts + " - no last device name available");
                        // Note: We don't start scanning here without a name to avoid unexpected behavior
                        // Instead, let the user explicitly trigger a new scan when needed
                        connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                    }
                }
            }
        }, delay);
    }

    /**
     * GATT callback for BLE operations
     */
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            // Cancel the connection timeout
            if (connectionTimeoutRunnable != null) {
                connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
                connectionTimeoutRunnable = null;
            }

            if (status == BluetoothGatt.GATT_SUCCESS) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.d(TAG, "Connected to GATT server, discovering services...");
                    isConnecting = false;
                    isConnected = true;
                    connectedDevice = gatt.getDevice();

                    // Save the connected device name for future reconnections
                    if (connectedDevice != null && connectedDevice.getName() != null) {
                        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                        prefs.edit().putString(PREF_DEVICE_NAME, connectedDevice.getName()).apply();
                        Log.d(TAG, "Saved device name for future reconnection: " + connectedDevice.getName());
                    }

                    // Discover services
                    gatt.discoverServices();

                    // Reset reconnect attempts on successful connection
                    reconnectAttempts = 0;
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.d(TAG, "Disconnected from GATT server");
                    isConnected = false;
                    isConnecting = false;
                    connectedDevice = null;
                    glassesReady = false; // Reset ready state on disconnect
                    connectionEvent(SmartGlassesConnectionState.DISCONNECTED);

                    handler.removeCallbacks(processSendQueueRunnable);

                    // Stop the readiness check loop
                    stopReadinessCheckLoop();

                    // Stop heartbeat mechanism
                    stopHeartbeat();

                    // Stop micbeat mechanism
                    stopMicBeat();

                    // Clean up GATT resources
                    if (bluetoothGatt != null) {
                        bluetoothGatt.close();
                        bluetoothGatt = null;
                    }

                    // Attempt reconnection
                    handleReconnection();

                    // Close LC3 audio logging
                    closeLc3Logging();
                    
                    //stop LC3 player
                    if (lc3AudioPlayer != null) {
                        lc3AudioPlayer.stopPlay();
                    }
                }
            } else {
                // Connection error
                Log.e(TAG, "GATT connection error: " + status);
                isConnected = false;
                isConnecting = false;
                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);

                // Stop heartbeat mechanism
                stopHeartbeat();

                // Stop micbeat mechanism
                stopMicBeat();

                // Clean up resources
                if (bluetoothGatt != null) {
                    bluetoothGatt.close();
                    bluetoothGatt = null;
                }

                // Attempt reconnection
                handleReconnection();
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "GATT services discovered");

                // Find our service and characteristics
                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                if (service != null) {
                    txCharacteristic = service.getCharacteristic(TX_CHAR_UUID);
                    rxCharacteristic = service.getCharacteristic(RX_CHAR_UUID);
                    
                    // Only attempt to get LC3 characteristics if device supports LC3 audio
                    if (supportsLC3Audio) {
                        lc3ReadCharacteristic = service.getCharacteristic(LC3_READ_UUID);
                        lc3WriteCharacteristic = service.getCharacteristic(LC3_WRITE_UUID);
                    } else {
                        lc3ReadCharacteristic = null;
                        lc3WriteCharacteristic = null;
                        Log.d(TAG, "⏭️ Skipping LC3 characteristics - device does not support LC3 audio");
                    }

                    // Check if we have required characteristics based on device capabilities
                    boolean hasRequiredCharacteristics = (rxCharacteristic != null && txCharacteristic != null);
                    if (supportsLC3Audio) {
                        hasRequiredCharacteristics = hasRequiredCharacteristics && 
                                                   (lc3ReadCharacteristic != null && lc3WriteCharacteristic != null);
                    }

                    if (hasRequiredCharacteristics) {
                        // BLE connection established, but we still need to wait for glasses SOC
                        if (supportsLC3Audio) {
                            Log.d(TAG, "✅ Core TX/RX and LC3 TX/RX characteristics found - BLE connection ready");
                        } else {
                            Log.d(TAG, "✅ Core TX/RX characteristics found - BLE connection ready (LC3 not supported)");
                        }
                        Log.d(TAG, "🔄 Waiting for glasses SOC to become ready...");

                        // Keep the state as CONNECTING until the glasses SOC responds
                        connectionEvent(SmartGlassesConnectionState.CONNECTING);

                        // CRITICAL FIX: Request MTU size ONCE - don't schedule delayed retries
                        // This avoids BLE operations during active data flow
                        if (checkPermission()) {
                            boolean mtuRequested = gatt.requestMtu(512);
                            Log.d(TAG, "🔄 Requested MTU size 512, success: " + mtuRequested);
                        }

                        // Enable notifications AFTER BLE connection is established
                        enableNotifications();

                        // Start queue processing for sending data
                        handler.post(processSendQueueRunnable);

                        //openhotspot(); //TODO: REMOVE AFTER DONE DEVELOPING
                        // Start SOC readiness check loop - this will keep trying until
                        // the glasses SOC boots and responds with a "glasses_ready" message
                        // All other initialization will happen after receiving glasses_ready
                        startReadinessCheckLoop();
                    } else {
                        Log.e(TAG, "Required BLE characteristics not found");
                        if (rxCharacteristic == null) {
                            Log.e(TAG, "RX characteristic (peripheral's TX) not found");
                        }
                        if (txCharacteristic == null) {
                            Log.e(TAG, "TX characteristic (peripheral's RX) not found");
                        }
                        // Log LC3 characteristic errors only if device should support LC3
                        if (supportsLC3Audio) {
                            if (lc3ReadCharacteristic == null) {
                                Log.e(TAG, "LC3_READ characteristic not found on LC3-capable device");
                            }
                            if (lc3WriteCharacteristic == null) {
                                Log.e(TAG, "LC3_WRITE characteristic not found on LC3-capable device");
                            }
                        }
                        gatt.disconnect();
                    }
                } else {
                    Log.e(TAG, "Required BLE service not found: " + SERVICE_UUID);
                    gatt.disconnect();
                }
            } else {
                Log.e(TAG, "Service discovery failed with status: " + status);
                gatt.disconnect();
            }
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Characteristic read successful");
                // Process the read data if needed
            } else {
                Log.e(TAG, "Characteristic read failed with status: " + status);
            }
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                //Log.d(TAG, "Characteristic write successful");

                // Calculate time since last send to enforce rate limiting
                long currentTimeMs = System.currentTimeMillis();
                long timeSinceLastSendMs = currentTimeMs - lastSendTimeMs;
                long nextProcessDelayMs;

                if (timeSinceLastSendMs < MIN_SEND_DELAY_MS) {
                    // Not enough time has elapsed, enforce minimum delay
                    nextProcessDelayMs = MIN_SEND_DELAY_MS - timeSinceLastSendMs;
                    //Log.d(TAG, "Rate limiting: Next queue processing in " + nextProcessDelayMs + "ms");
                } else {
                    // Enough time has already passed
                    nextProcessDelayMs = 0;
                }

                // Schedule the next queue processing with appropriate delay
                handler.postDelayed(processSendQueueRunnable, nextProcessDelayMs);
            } else {
                Log.e(TAG, "Characteristic write failed with status: " + status);
                // If write fails, try again with a longer delay
                handler.postDelayed(processSendQueueRunnable, 500);
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            // Get thread ID for tracking thread issues
            long threadId = Thread.currentThread().getId();
            UUID uuid = characteristic.getUuid();

            // Log.d(TAG, "onCharacteristicChanged triggered for: " + uuid);

            boolean isRxCharacteristic = uuid.equals(RX_CHAR_UUID);
            boolean isTxCharacteristic = uuid.equals(TX_CHAR_UUID);
            boolean isLc3ReadCharacteristic = uuid.equals(LC3_READ_UUID) && supportsLC3Audio;
            boolean isLc3WriteCharacteristic = uuid.equals(LC3_WRITE_UUID) && supportsLC3Audio;
            boolean isFileReadCharacteristic = uuid.equals(FILE_READ_UUID);

            if (isRxCharacteristic) {
                Log.d(TAG, "Received data on RX characteristic");
            } else if (isTxCharacteristic) {
                Log.d(TAG, "Received data on TX characteristic");
            } else if (isLc3ReadCharacteristic) {
                // Log.d(TAG, "Received data on LC3_READ characteristic");
                if (supportsLC3Audio) {
                    processLc3AudioPacket(characteristic.getValue());
                } else {
                    Log.w(TAG, "Received LC3 data on device that doesn't support LC3 audio");
                }
            } else if (isLc3WriteCharacteristic) {
                Log.d(TAG, "Received data on LC3_WRITE characteristic");
            } else if (isFileReadCharacteristic) {
                Log.d(TAG, "Received data on FILE_READ characteristic");
            } else {
                Log.w(TAG, "Received data on unknown characteristic: " + uuid);
            }

            // Process ALL data regardless of which characteristic it came from
            {
                byte[] data = characteristic.getValue();

                // Convert first few bytes to hex for better viewing
//                StringBuilder hexDump = new StringBuilder();
//                for (int i = 0; i < Math.min(data.length, 40); i++) {
//                    hexDump.append(String.format("%02X ", data[i]));
//                }

                if (data != null && data.length > 0) {
//                    // Critical debugging for LC3 audio issue - dump ALL received data
//
//                    // Check for LC3 audio data multiple ways
//                    boolean isLc3Command = false;
//
//                    // Method 1: Exact byte comparison
//                    boolean method1 = data[0] == (byte)0xA0;
//
//                    // Method 2: Unsigned integer comparison
//                    boolean method2 = (data[0] & 0xFF) == 0xA0;
//
//                    // Method 3: Comparison with signed value equivalent
//                    boolean method3 = data[0] == -96; // 0xA0 as signed byte is -96 decimal
//
                    // Combined result
       //             isLc3Command = method1 || method2 || method3;


                    // Log MTU information with packet
//                    int mtuSize = -1;
//                    if (gatt != null) {
//                        try {
//                            // Calculate effective MTU (current MTU - 3 bytes BLE overhead)
//                            int effectiveMtu = currentMtu - 3;
//                    }
//


                    // Process the received data
                    processReceivedData(data, data.length);
                }
            }
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            long threadId = Thread.currentThread().getId();

            // CRITICAL FIX: Just log the result but take NO ACTION regardless of status
            // This prevents descriptor write failures from crashing the connection
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.e(TAG, "Thread-" + threadId + ": ✅ Descriptor write successful");
            } else {
                // Just log the error without taking ANY action
                Log.e(TAG, "Thread-" + threadId + ": ℹ️ Descriptor write failed with status: " + status + " - IGNORING");
                // DO NOT add any other operations or logging as they might cause issues
            }

            // DO NOT:
            // - Schedule any operations
            // - Try to retry anything
            // - Create any new BLE operations
            // - Post any handlers
            // - Do any validation or checking

            // Any of these could cause thread conflicts that would kill the connection
        }

        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "🔵 MTU negotiation successful - changed to " + mtu + " bytes");
                int effectivePayload = mtu - 3;
                Log.d(TAG, "   Effective payload size: " + effectivePayload + " bytes");

                // Store the new MTU value
                currentMtu = mtu;

                // If the negotiated MTU is sufficient for LC3 audio packets (typically 40-60 bytes)
                if (mtu >= 64) {
                    Log.d(TAG, "✅ MTU size is sufficient for LC3 audio data packets");
                } else {
                    Log.w(TAG, "⚠️ MTU size may be too small for LC3 audio data packets");

                    // Log the effective MTU payload directly
                    Log.d(TAG, "📊 Effective MTU payload: " + effectivePayload + " bytes");

                    // Check if it's sufficient for LC3 audio
                    if (effectivePayload < 60) {
                        Log.e(TAG, "❌ CRITICAL: Effective MTU too small for LC3 audio!");
                        Log.e(TAG, "   This will likely cause issues with LC3 audio transmission");
                    }

                    // If we still have a small MTU, try requesting again
                    if (mtu < 64 && gatt != null && checkPermission()) {
                        handler.postDelayed(() -> {
                            if (isConnected && gatt != null) {
                                Log.d(TAG, "🔄 Re-attempting MTU increase after initial small MTU");
                                boolean retryMtuRequest = gatt.requestMtu(512);
                                Log.d(TAG, "   MTU increase retry requested: " + retryMtuRequest);
                            }
                        }, 1000); // Wait 1 second before retry
                    }
                }
            } else {
                Log.e(TAG, "❌ MTU change failed with status: " + status);
                Log.w(TAG, "   Will continue with default MTU (23 bytes, 20 byte payload)");

                // Try again if the MTU request failed
                if (gatt != null && checkPermission()) {
                    handler.postDelayed(() -> {
                        if (isConnected && gatt != null) {
                            Log.d(TAG, "🔄 Re-attempting MTU increase after previous failure");
                            boolean retryMtuRequest = gatt.requestMtu(512);
                            Log.d(TAG, "   MTU increase retry requested: " + retryMtuRequest);
                        }
                    }, 1500); // Wait 1.5 seconds before retry
                }
            }
        }
    };

    /**
     * Enable notifications for all characteristics to ensure we catch data from any endpoint
     */
    private void enableNotifications() {
        long threadId = Thread.currentThread().getId();
        Log.e(TAG, "Thread-" + threadId + ": 🔵 enableNotifications() called");

        if (bluetoothGatt == null) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Cannot enable notifications - bluetoothGatt is null");
            return;
        }

        if (!hasPermissions()) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Cannot enable notifications - missing permissions");
            return;
        }

        // Find our service
        BluetoothGattService service = bluetoothGatt.getService(SERVICE_UUID);
        if (service == null) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Service not found: " + SERVICE_UUID);
            return;
        }

        // Get all characteristics
        List<BluetoothGattCharacteristic> characteristics = service.getCharacteristics();
        Log.d(TAG, "Thread-" + threadId + ": Found " + characteristics.size() + " characteristics in service " + SERVICE_UUID);

        boolean notificationSuccess = false;

        // Enable notifications for each characteristic
        for (BluetoothGattCharacteristic characteristic : characteristics) {
            UUID uuid = characteristic.getUuid();
            Log.d(TAG, "Thread-" + threadId + ": Examining characteristic: " + uuid);

            // Log if this is one of the file transfer characteristics
            if (uuid.equals(FILE_READ_UUID)) {
                Log.e(TAG, "Thread-" + threadId + ": 📁 Found FILE_READ characteristic (72FF)!");
            } else if (uuid.equals(FILE_WRITE_UUID)) {
                Log.e(TAG, "Thread-" + threadId + ": 📁 Found FILE_WRITE characteristic (73FF)!");
            }

            int properties = characteristic.getProperties();
            boolean hasNotify = (properties & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0;
            boolean hasIndicate = (properties & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0;
            boolean hasRead = (properties & BluetoothGattCharacteristic.PROPERTY_READ) != 0;
            boolean hasWrite = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
            boolean hasWriteNoResponse = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;

            Log.d(TAG, "Thread-" + threadId + ": Characteristic " + uuid + " properties: " +
                   (hasNotify ? "NOTIFY " : "") +
                   (hasIndicate ? "INDICATE " : "") +
                   (hasRead ? "READ " : "") +
                   (hasWrite ? "WRITE " : "") +
                   (hasWriteNoResponse ? "WRITE_NO_RESPONSE " : ""));

            // Store references to our main characteristics
            if (uuid.equals(RX_CHAR_UUID)) {
                rxCharacteristic = characteristic;
                Log.e(TAG, "Thread-" + threadId + ": ✅ Found and stored RX characteristic");
            } else if (uuid.equals(TX_CHAR_UUID)) {
                txCharacteristic = characteristic;
                Log.e(TAG, "Thread-" + threadId + ": ✅ Found and stored TX characteristic");
            } else if (uuid.equals(LC3_READ_UUID)) {
                lc3ReadCharacteristic = characteristic;
                Log.e(TAG, "Thread-" + threadId + ": ✅ Found and stored LC3_READ characteristic");
            } else if (uuid.equals(LC3_WRITE_UUID)) {
                lc3WriteCharacteristic = characteristic;
                Log.e(TAG, "Thread-" + threadId + ": ✅ Found and stored LC3_WRITE characteristic");
            }

            // Enable notifications for any characteristic that supports it
            if (hasNotify || hasIndicate) {
                try {
                    // Enable local notifications
                    boolean success = bluetoothGatt.setCharacteristicNotification(characteristic, true);
                    Log.e(TAG, "Thread-" + threadId + ": 📱 Set local notification for " + uuid + ": " + success);
                    notificationSuccess = notificationSuccess || success;

                    // Try to enable remote notifications by writing to descriptor
                    // We'll do this despite previous issues, since it's required for some devices
                    BluetoothGattDescriptor descriptor = characteristic.getDescriptor(
                        CLIENT_CHARACTERISTIC_CONFIG_UUID);

                    if (descriptor != null) {
                        try {
                            byte[] value;
                            if (hasNotify) {
                                value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE;
                            } else {
                                value = BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
                            }

                            descriptor.setValue(value);
                            boolean writeSuccess = bluetoothGatt.writeDescriptor(descriptor);
                            Log.e(TAG, "Thread-" + threadId + ": 📱 Write descriptor for " + uuid + ": " + writeSuccess);
                        } catch (Exception e) {
                            // Just log the error and continue - doesn't stop us from trying other characteristics
                            Log.e(TAG, "Thread-" + threadId + ": ⚠️ Error writing descriptor for " + uuid + ": " + e.getMessage());
                        }
                    } else {
                        Log.e(TAG, "Thread-" + threadId + ": ⚠️ No notification descriptor found for " + uuid);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Exception enabling notifications for " + uuid + ": " + e.getMessage());
                }
            }
        }

        // Log notification status but AVOID any delayed operations!
        if (notificationSuccess) {
            Log.d(TAG, "Thread-" + threadId + ": Local notification registration SUCCESS for at least one characteristic");
            Log.e(TAG, "Thread-" + threadId + ": 🔔 Ready to receive data via onCharacteristicChanged()");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Failed to enable notifications on any characteristic");
        }
    }

    /**
     * Process the send queue with rate limiting
     */
    private void processSendQueue() {
        if (!isConnected || bluetoothGatt == null || txCharacteristic == null) {
            return;
        }

        // Check if we need to enforce rate limiting
        long currentTimeMs = System.currentTimeMillis();
        long timeSinceLastSendMs = currentTimeMs - lastSendTimeMs;

        if (timeSinceLastSendMs < MIN_SEND_DELAY_MS) {
            // Not enough time has elapsed since last send
            // Reschedule processing after the remaining delay
            long remainingDelayMs = MIN_SEND_DELAY_MS - timeSinceLastSendMs;
            Log.d(TAG, "Rate limiting: Waiting " + remainingDelayMs + "ms before next BLE send");
            handler.postDelayed(processSendQueueRunnable, remainingDelayMs);
            return;
        }

        // Send the next item from the queue
        byte[] data = sendQueue.poll();
        if (data != null) {
            // Update last send time before sending
            lastSendTimeMs = currentTimeMs;
            Log.d(TAG, "📤 Sending queued data - Queue size: " + sendQueue.size() +
                  ", Time since last send: " + timeSinceLastSendMs + "ms");
            sendDataInternal(data);
        }
    }

    /**
     * Send data through BLE
     */
    private void sendDataInternal(byte[] data) {
        if (!isConnected || bluetoothGatt == null || txCharacteristic == null || data == null) {
            return;
        }

        try {
            txCharacteristic.setValue(data);
            bluetoothGatt.writeCharacteristic(txCharacteristic);
        } catch (Exception e) {
            Log.e(TAG, "Error sending data via BLE", e);
        }
    }

    /**
     * Queue data to be sent
     */
    private void queueData(byte[] data) {
        if (data != null) {
            sendQueue.add(data);
            Log.d(TAG, "📋 Added " + data.length + " to send queue - New queue size: " + sendQueue.size());

            // Log all outgoing bytes for testing
            StringBuilder hexBytes = new StringBuilder();
            for (byte b : data) {
                hexBytes.append(String.format("%02X ", b));
            }
            Log.d(TAG, "🔍 Outgoing bytes: " + hexBytes.toString().trim());

            // Trigger queue processing if not already running
            handler.removeCallbacks(processSendQueueRunnable);
            handler.post(processSendQueueRunnable);
        }
    }

    /**
     * Generate an esoteric message ID using timestamp, device ID, and random values
     * @return A unique, unpredictable message ID
     */
    private long generateEsotericMessageId() {
        long timestamp = System.currentTimeMillis();
        long randomComponent = secureRandom.nextLong();
        long counter = messageIdCounter.getAndIncrement();

        // Combine timestamp, device ID, random value, and counter in a non-obvious way
        long messageId = timestamp ^ deviceId ^ randomComponent ^ (counter << 32);

        // Ensure it's positive (clear the sign bit)
        messageId = Math.abs(messageId);

        return messageId;
    }

    /**
     * Send a JSON object to the glasses with message ID and ACK tracking
     */
    private void sendJson(JSONObject json, boolean wakeup) {
        if (json != null) {
            try {
                if (glassesBuildNumberInt < 5) {
                    String jsonStr = json.toString();
                    Log.d(TAG, "📤 Sending JSON with esoteric message ID: " + jsonStr);
                    sendDataToGlasses(jsonStr, wakeup);
                } else {
                    // Add esoteric message ID to the JSON
                    long messageId = generateEsotericMessageId();
                    json.put("mId", messageId);

                    String jsonStr = json.toString();
                    Log.d(TAG, "📤 Sending JSON with esoteric message ID " + messageId + ": " + jsonStr);

                    // Check if this message will be chunked to determine timeout
                    long ackTimeout = ACK_TIMEOUT_MS;
                    try {
                        // Create a test C-wrapped version to check size
                        JSONObject testWrapper = new JSONObject();
                        testWrapper.put("C", jsonStr);
                        if (wakeup) {
                            testWrapper.put("W", 1);
                        }
                        String testWrappedJson = testWrapper.toString();
                        
                        if (MessageChunker.needsChunking(testWrappedJson)) {
                            // Calculate dynamic timeout for chunked message
                            int estimatedChunks = (int) Math.ceil(jsonStr.length() / 300.0);
                            ackTimeout = ACK_TIMEOUT_MS + (estimatedChunks * 50L) + 2000L;
                            Log.d(TAG, "Message will be chunked into ~" + estimatedChunks + " chunks, using dynamic timeout: " + ackTimeout + "ms");
                        }
                    } catch (JSONException e) {
                        // If we can't determine, use default timeout
                        Log.w(TAG, "Could not determine if message needs chunking, using default timeout");
                    }

                    // Track the message for ACK with appropriate timeout
                    trackMessageForAck(messageId, jsonStr, ackTimeout);

                    // Send the data
                    sendDataToGlasses(jsonStr, wakeup);
                }
            } catch (JSONException e) {
                Log.e(TAG, "Error adding message ID to JSON", e);
            }
        } else {
            Log.d(TAG, "Cannot send JSON to ASG, JSON is null");
        }
    }

    private void sendJson(JSONObject json){
        sendJson(json, false);
    }

    /**
     * Track a message for ACK response
     */
    private void trackMessageForAck(long messageId, String messageData) {
        trackMessageForAck(messageId, messageData, ACK_TIMEOUT_MS);
    }
    
    /**
     * Track a message for ACK response with custom timeout
     */
    private void trackMessageForAck(long messageId, String messageData, long timeoutMs) {
        if (!isConnected) {
            Log.d(TAG, "Not connected, skipping ACK tracking for message " + messageId);
            return;
        }

        // Skip ACK tracking for glasses with build number < 5 (older firmware)
        if (glassesBuildNumberInt < 5) {
            Log.d(TAG, "Glasses build number (" + glassesBuildNumberInt + ") < 5, skipping ACK tracking for message " + messageId);
            return;
        }

        // Create retry runnable
        Runnable retryRunnable = new Runnable() {
            @Override
            public void run() {
                retryMessage(messageId);
            }
        };

        // Create pending message
        PendingMessage pendingMessage = new PendingMessage(messageData, System.currentTimeMillis(), 0, retryRunnable);
        pendingMessages.put(messageId, pendingMessage);

        // Schedule ACK timeout with custom timeout
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                checkMessageAck(messageId);
            }
        }, timeoutMs);

        Log.d(TAG, "📋 Tracking message " + messageId + " for ACK (timeout: " + timeoutMs + "ms)");
    }

    /**
     * Check if a message has been acknowledged
     */
    private void checkMessageAck(long messageId) {
        PendingMessage pendingMessage = pendingMessages.get(messageId);
        if (pendingMessage != null) {
            Log.w(TAG, "⏰ ACK timeout for message " + messageId + " (attempt " + pendingMessage.retryCount + ")");

            if (pendingMessage.retryCount < MAX_RETRY_ATTEMPTS) {
                // Retry the message
                Log.d(TAG, "🔄 Retrying message " + messageId + " (attempt " + (pendingMessage.retryCount + 1) + "/" + MAX_RETRY_ATTEMPTS + ")");
                retryMessage(messageId);
            } else {
                // Max retries reached
                Log.e(TAG, "❌ Message " + messageId + " failed after " + MAX_RETRY_ATTEMPTS + " attempts");
                pendingMessages.remove(messageId);
            }
        }
    }

    /**
     * Retry a message
     */
    private void retryMessage(long messageId) {
        PendingMessage pendingMessage = pendingMessages.get(messageId);
        if (pendingMessage == null) {
            Log.w(TAG, "Message " + messageId + " no longer tracked for retry");
            return;
        }

        if (pendingMessage.retryCount >= MAX_RETRY_ATTEMPTS) {
            Log.e(TAG, "Max retries reached for message " + messageId);
            pendingMessages.remove(messageId);
            return;
        }

        // Create new pending message with incremented retry count
        PendingMessage retryMessage = new PendingMessage(
            pendingMessage.messageData,
            System.currentTimeMillis(),
            pendingMessage.retryCount + 1,
            pendingMessage.retryRunnable
        );

        // Update the tracked message
        pendingMessages.put(messageId, retryMessage);

        // Send the message again
        Log.d(TAG, "📤 Retrying message " + messageId + " (attempt " + retryMessage.retryCount + ")");
        sendDataToGlasses(pendingMessage.messageData, false);

        // Schedule next ACK check
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                checkMessageAck(messageId);
            }
        }, ACK_TIMEOUT_MS);
    }

    /**
     * Process ACK response from glasses
     */
    private void processAckResponse(long messageId) {
        PendingMessage pendingMessage = pendingMessages.remove(messageId);
        if (pendingMessage != null) {
            Log.d(TAG, "✅ Received ACK for message " + messageId + " (attempts: " + pendingMessage.retryCount + ")");
        } else {
            Log.w(TAG, "⚠️ Received ACK for untracked message " + messageId);
        }
    }

    /**
     * Send ACK to glasses for their messages that have mId
     */
    private void sendAckToGlasses(long messageId) {
        try {
            JSONObject ack = new JSONObject();
            ack.put("type", "msg_ack");
            ack.put("mId", messageId);
            ack.put("timestamp", System.currentTimeMillis());

            String ackStr = ack.toString();
            Log.d(TAG, "📤 Sending ACK to glasses for message: " + messageId);

            // Send without retry (ACKs are never retried)
            sendDataToGlasses(ackStr, false);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating ACK for glasses", e);
        }
    }

    /**
     * Process data received from the glasses
     */
    private void processReceivedData(byte[] data, int size) {
        Log.d(TAG, "Processing received data: " + bytesToHex(data));

        // Check if we have enough data
        if (data == null || size < 1) {
            Log.w(TAG, "Received empty or invalid data packet");
            return;
        }

        // Log the first few bytes to help with debugging
        StringBuilder hexData = new StringBuilder();
        for (int i = 0; i < Math.min(size, 16); i++) {
            hexData.append(String.format("%02X ", data[i]));
        }
        // Log.d(TAG, "Processing data packet, first " + Math.min(size, 16) + " bytes: " + hexData.toString());

        // Get thread ID for consistent logging
        long threadId = Thread.currentThread().getId();

        // First check if this looks like a K900 protocol formatted message (starts with ##)
        if (size >= 7 && data[0] == 0x23 && data[1] == 0x23) {
            Log.d(TAG, "Thread-" + threadId + ": 🔍 DETECTED K900 PROTOCOL FORMAT (## prefix)");

            // Check the command type byte
            byte cmdType = data[2];

            // Check if this is a file transfer packet
            if (cmdType == K900ProtocolUtils.CMD_TYPE_PHOTO ||
                cmdType == K900ProtocolUtils.CMD_TYPE_VIDEO ||
                cmdType == K900ProtocolUtils.CMD_TYPE_AUDIO ||
                cmdType == K900ProtocolUtils.CMD_TYPE_DATA) {

                Log.d(TAG, "Thread-" + threadId + ": 📦 DETECTED FILE TRANSFER PACKET (type: 0x" +
                      String.format("%02X", cmdType) + ")");

                // Debug: Log the raw data
                StringBuilder hexDump = new StringBuilder();
                for (int i = 0; i < Math.min(data.length, 64); i++) {
                    hexDump.append(String.format("%02X ", data[i]));
                }
                Log.d(TAG, "Thread-" + threadId + ": 📦 Raw file packet data length=" + data.length +
                      ", first 64 bytes: " + hexDump.toString());

                // The data IS the file packet - it starts with ## and contains the full file packet structure
                K900ProtocolUtils.FilePacketInfo packetInfo = K900ProtocolUtils.extractFilePacket(data);
                if (packetInfo != null && packetInfo.isValid) {
                    processFilePacket(packetInfo);
                } else {
                    Log.e(TAG, "Thread-" + threadId + ": Failed to extract or validate file packet");
                    // BES chip handles ACKs automatically
                }

                return; // Exit after processing file packet
            }

            // Otherwise it's a normal JSON message
            JSONObject json = K900ProtocolUtils.processReceivedBytesToJson(data);
            if (json != null) {
                processJsonMessage(json);
            } else {
                Log.w(TAG, "Thread-" + threadId + ": Failed to parse K900 protocol data");
            }

            return; // Exit after processing K900 protocol format
        }

        // Check the first byte to determine the packet type for non-protocol formatted data
        byte commandByte = data[0];
        // Log.d(TAG, "Command byte: 0x" + String.format("%02X", commandByte) + " (" + (int)(commandByte & 0xFF) + ")");

        // NOTE: LC3 audio (0xA0) is now processed exclusively via the dedicated LC3_READ characteristic
        // This prevents duplicate audio processing and follows the proper BLE characteristic separation
        
        // Process non-audio data based on command byte
        switch (commandByte) {
            case '{': // Likely a JSON message (starts with '{')
                try {
                    String jsonStr = new String(data, 0, size, StandardCharsets.UTF_8);
                    if (jsonStr.startsWith("{") && jsonStr.endsWith("}")) {
                        JSONObject json = new JSONObject(jsonStr);
                        processJsonMessage(json);
                    } else {
                        Log.w(TAG, "Received data that starts with '{' but is not valid JSON");
                    }
                } catch (JSONException e) {
                    Log.e(TAG, "Error parsing received JSON data", e);
                }
                break;

            default:
                // Unknown packet type (LC3 audio 0xA0 is handled via dedicated characteristic)
                // Log.w(TAG, "Received unknown packet type: " + String.format("0x%02X", commandByte));
                if (size > 10) {
                    // Log.d(TAG, "First 10 bytes: " + bytesToHex(Arrays.copyOfRange(data, 0, 10)));
                } else {
                    Log.d(TAG, "Data: " + bytesToHex(data));
                }
                break;
        }
    }

    /**
     * Process a JSON message
     */
    private void processJsonMessage(JSONObject json) {
        Log.d(TAG, "Got some JSON from glasses: " + json.toString());

        // Check if this is an ACK response first (for our phone → glasses messages)
        String type = json.optString("type", "");
        if ("msg_ack".equals(type)) {
            long messageId = json.optLong("mId", -1);
            if (messageId != -1) {
                processAckResponse(messageId);
                return; // Don't send ACK for ACKs!
            }
        }

        // Check for message ID that needs ACK (glasses → phone)
        // But only if it's NOT an ACK message
        if (json.has("mId")) {
            long messageId = json.optLong("mId", -1);
            if (messageId != -1) {
                // Send ACK back to glasses
                sendAckToGlasses(messageId);
            }
        }

        // Check if this is a K900 command format (has "C" field instead of "type")
        if (json.has("C")) {
            processK900JsonMessage(json);
            return;
        }

        switch (type) {
            case "file_announce":
                handleFileTransferAnnouncement(json);
                break;
            case "transfer_timeout":
                handleTransferTimeout(json);
                break;
            case "transfer_failed":
                handleTransferFailed(json);
                break;
            case "ble_photo_ready":
                processBlePhotoReady(json);
                break;
            case "rtmp_stream_status":
                // Process RTMP streaming status update from ASG client
                Log.d(TAG, "Received RTMP status update from glasses: " + json.toString());

                // Check if this is an error status
                String status = json.optString("status", "");
                if ("error".equals(status)) {
                    String errorDetails = json.optString("errorDetails", "");
                    Log.e(TAG, "🚨🚨🚨 RTMP STREAM ERROR DETECTED 🚨🚨🚨");
                    Log.e(TAG, "📄 Error details: " + errorDetails);
                    Log.e(TAG, "⏱️ Timestamp: " + System.currentTimeMillis());

                    // Check if it's the timeout error we're investigating
                    if (errorDetails.contains("Stream timed out") || errorDetails.contains("no keep-alive")) {
                        Log.e(TAG, "🔍 RTMP TIMEOUT ERROR - Dumping diagnostic info:");
                        Log.e(TAG, "💓 Last heartbeat counter: " + heartbeatCounter);
                        Log.e(TAG, "⏱️ Current timestamp: " + System.currentTimeMillis());

                        // Dump thread states for debugging
                        dumpThreadStates();

                        // Log BLE connection state
                        Log.e(TAG, "🔌 BLE Connection state:");
                        Log.e(TAG, "   - isConnected: " + isConnected);
                        Log.e(TAG, "   - bluetoothGatt: " + (bluetoothGatt != null ? "NOT NULL" : "NULL"));
                        Log.e(TAG, "   - txCharacteristic: " + (txCharacteristic != null ? "NOT NULL" : "NULL"));
                        Log.e(TAG, "   - rxCharacteristic: " + (rxCharacteristic != null ? "NOT NULL" : "NULL"));
                        Log.e(TAG, "   - mConnectState: " + mConnectState);
                        Log.e(TAG, "   - glassesReady: " + glassesReady);
                    }
                }

                // Forward via EventBus for cloud communication (consistent with battery/WiFi)
                EventBus.getDefault().post(new RtmpStreamStatusEvent(json));
                break;

            case "battery_status":
                // Process battery status
                int percent = json.optInt("percent", batteryLevel);
                boolean charging = json.optBoolean("charging", isCharging);
                updateBatteryStatus(percent, charging);
                break;

            case "pong":
                // Process heartbeat pong response
                Log.d(TAG, "💓 Received pong response - connection healthy");
                break;

            case "imu_response":
            case "imu_stream_response":
            case "imu_gesture_response":
            case "imu_gesture_subscribed":
            case "imu_ack":
            case "imu_error":
                // Handle IMU-related responses
                handleImuResponse(json);
                break;

            case "wifi_status":
                // Process WiFi status information
                boolean wifiConnected = json.optBoolean("connected", false);
                String ssid = json.optString("ssid", "");
                String localIp = json.optString("local_ip", "");

                // Update local tracking
                isWifiConnected = wifiConnected;
                wifiSsid = ssid;

                Log.d(TAG, "## Received WiFi status: connected=" + wifiConnected + ", SSID=" + ssid + ", Local IP=" + localIp);
                EventBus.getDefault().post(new GlassesWifiStatusChange(
                        smartGlassesDevice.deviceModelName,
                        wifiConnected,
                        ssid,
                        localIp));

                break;

            case "hotspot_status_update":
                // Process hotspot status information (same pattern as "wifi_status")
                boolean hotspotEnabled = json.optBoolean("hotspot_enabled", false);
                String hotspotSsid = json.optString("hotspot_ssid", "");
                String hotspotPassword = json.optString("hotspot_password", "");
                String hotspotGatewayIp = json.optString("hotspot_gateway_ip", "");

                Log.d(TAG, "## Received hotspot status: enabled=" + hotspotEnabled + 
                      ", SSID=" + hotspotSsid + ", IP=" + hotspotGatewayIp);
                
                // Post EventBus event (exactly like WiFi status)
                EventBus.getDefault().post(new GlassesHotspotStatusChange(
                        smartGlassesDevice.deviceModelName,
                        hotspotEnabled,
                        hotspotSsid,
                        hotspotPassword,
                        hotspotGatewayIp));
                break;

            case "photo_response":
                // Process photo response (success or failure)
                String requestId = json.optString("requestId", "");
                String appId = json.optString("appId", "");
                boolean photoSuccess = json.optBoolean("success", false);

                if (!photoSuccess) {
                    // Handle failed photo response
                    String errorMsg = json.optString("error", "Unknown error");
                    Log.d(TAG, "Photo request failed - requestId: " + requestId +
                          ", appId: " + appId + ", error: " + errorMsg);
                } else {
                    // Handle successful photo (in future implementation)
                    Log.d(TAG, "Photo request succeeded - requestId: " + requestId);
                }
                break;

            case "ble_photo_complete":
                // Process BLE photo transfer completion
                String bleRequestId = json.optString("requestId", "");
                String bleBleImgId = json.optString("bleImgId", "");
                boolean bleSuccess = json.optBoolean("success", false);

                Log.d(TAG, "BLE photo transfer complete - requestId: " + bleRequestId +
                     ", bleImgId: " + bleBleImgId + ", success: " + bleSuccess);

                // Send completion notification back to glasses using unified transfer_complete
                if (bleSuccess) {
                    sendTransferCompleteConfirmation(bleBleImgId, true);
                } else {
                    Log.e(TAG, "BLE photo transfer failed for requestId: " + bleRequestId);
                    sendTransferCompleteConfirmation(bleBleImgId, false);
                }
                break;

            case "wifi_scan_result":
                // Process WiFi scan results
                try {
                    // Get the list of networks from the JSON
                    List<String> networks = new ArrayList<>();

                    if (json.has("networks")) {
                        // Could be either a JSONArray or a comma-separated string
                        if (json.get("networks") instanceof org.json.JSONArray) {
                            org.json.JSONArray networksArray = json.getJSONArray("networks");
                            for (int i = 0; i < networksArray.length(); i++) {
                                networks.add(networksArray.getString(i));
                            }
                        } else {
                            // Handle as comma-separated string
                            String networksStr = json.getString("networks");
                            String[] networksArray = networksStr.split(",");
                            for (String network : networksArray) {
                                networks.add(network.trim());
                            }
                        }

                        // Log the found networks
                        Log.d(TAG, "Received WiFi scan results: " + networks.size() + " networks found");
                        for (String network : networks) {
                            Log.d(TAG, "  WiFi network: " + network);
                        }

                        // Post event with the scan results
                        EventBus.getDefault().post(new GlassesWifiScanResultEvent(
                                smartGlassesDevice.deviceModelName,
                                networks));
                    } else {
                        Log.w(TAG, "Received WiFi scan results without networks field");
                        // Post empty list to notify that scan completed with no results
                        EventBus.getDefault().post(new GlassesWifiScanResultEvent(
                                smartGlassesDevice.deviceModelName,
                                networks));
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error processing WiFi scan results", e);
                }
                break;

            case "token_status":
                // Process coreToken acknowledgment
                boolean success = json.optBoolean("success", false);
                Log.d(TAG, "Received token status from ASG client: " + (success ? "SUCCESS" : "FAILED"));
                break;

            case "button_press":
                // Process button press event
                String buttonId = json.optString("buttonId", "unknown");
                String pressType = json.optString("pressType", "short");
                long timestamp = json.optLong("timestamp", System.currentTimeMillis());

                Log.d(TAG, "Received button press - buttonId: " + buttonId + ", pressType: " + pressType);

                // Post button press event to EventBus for core to handle
                EventBus.getDefault().post(new ButtonPressEvent(
                        smartGlassesDevice.deviceModelName,
                        buttonId,
                        pressType,
                        timestamp));
                break;
                
            case "gallery_status":
                // Process gallery status response
                int photoCount = json.optInt("photos", 0);
                int videoCount = json.optInt("videos", 0);
                int totalCount = json.optInt("total", 0);
                long totalSize = json.optLong("total_size", 0);
                boolean hasContent = json.optBoolean("has_content", false);
                
                Log.d(TAG, "📸 Received gallery status: " + photoCount + " photos, " + 
                      videoCount + " videos, total size: " + totalSize + " bytes");
                
                // Post gallery status event to EventBus
                EventBus.getDefault().post(new GlassesGalleryStatusEvent(
                        smartGlassesDevice.deviceModelName,
                        photoCount,
                        videoCount,
                        totalCount,
                        totalSize,
                        hasContent));
                break;

            case "sensor_data":
                // Process sensor data
                // ...
                break;

            case "glasses_ready":
                // Glasses SOC has booted and is ready for communication
                Log.d(TAG, "🎉 Received glasses_ready message - SOC is booted and ready!");

                // Set the ready flag to stop any future readiness checks
                glassesReady = true;

                // Stop the readiness check loop since we got confirmation
                stopReadinessCheckLoop();

                // Now we can perform all SOC-dependent initialization
                Log.d(TAG, "🔄 Requesting battery and WiFi status from glasses");
                requestBatteryStatus();
                requestWifiStatus();

                // Request version info from ASG client
                Log.d(TAG, "🔄 Requesting version info from ASG client");
                try {
                    JSONObject versionRequest = new JSONObject();
                    versionRequest.put("type", "request_version");
                    sendJson(versionRequest);
                } catch (JSONException e) {
                    Log.e(TAG, "Error creating version request", e);
                }

                Log.d(TAG, "🔄 Sending coreToken to ASG client");
                sendCoreTokenToAsgClient();

                //startDebugVideoCommandLoop();

                // Start the heartbeat mechanism now that glasses are ready
                startHeartbeat();

                // Start the micbeat mechanism now that glasses are ready
                startMicBeat();

                // Send user settings to glasses
                sendUserSettings();

                // Initialize LC3 audio logging now that glasses are ready (only if supported)
                if (supportsLC3Audio) {
                    initializeLc3Logging();
                    Log.d(TAG, "✅ LC3 audio logging initialized for device");
                } else {
                    Log.d(TAG, "⏭️ Skipping LC3 audio logging - device does not support LC3 audio");
                }
                
                // Finally, mark the connection as fully established
                Log.d(TAG, "✅ Glasses connection is now fully established!");
                connectionEvent(SmartGlassesConnectionState.CONNECTED);
                break;

            case "keep_alive_ack":
                // Process keep-alive ACK from ASG client
                Log.d(TAG, "Received keep-alive ACK from glasses: " + json.toString());

                // Forward via EventBus for cloud communication (consistent with other message types)
                EventBus.getDefault().post(new KeepAliveAckEvent(json));
                break;

            case "version_info":
                // Process version information from ASG client
                Log.d(TAG, "Received version info from ASG client: " + json.toString());

                // Extract version information and post event
                String appVersion = json.optString("app_version", "");
                String buildNumber = json.optString("build_number", "");
                String deviceModel = json.optString("device_model", "");
                String androidVersion = json.optString("android_version", "");
                String otaVersionUrl = json.optString("ota_version_url", null);

                // Parse build number as integer for version checks
                try {
                    glassesBuildNumberInt = Integer.parseInt(buildNumber);
                    Log.d(TAG, "Parsed build number as integer: " + glassesBuildNumberInt);
                } catch (NumberFormatException e) {
                    glassesBuildNumberInt = 0;
                    Log.e(TAG, "Failed to parse build number as integer: " + buildNumber);
                }

                // Determine LC3 audio support: base K900 doesn't support LC3, variants do
                supportsLC3Audio = !"K900".equals(deviceModel);
                Log.d(TAG, "📱 LC3 audio support: " + supportsLC3Audio + " (device: " + deviceModel + ")");

                Log.d(TAG, "Glasses Version - App: " + appVersion +
                      ", Build: " + buildNumber +
                      ", Device: " + deviceModel +
                      ", Android: " + androidVersion +
                      ", OTA URL: " + otaVersionUrl);

                // Post event for version information
                EventBus.getDefault().post(new GlassesVersionInfoEvent(
                    appVersion, buildNumber, deviceModel, androidVersion, otaVersionUrl));
                break;

            case "ota_download_progress":
                // Process OTA download progress from ASG client
                Log.d(TAG, "📥 Received OTA download progress from ASG client: " + json.toString());

                // Extract download progress information
                String downloadStatus = json.optString("status", "");
                int downloadProgress = json.optInt("progress", 0);
                long bytesDownloaded = json.optLong("bytes_downloaded", 0);
                long totalBytes = json.optLong("total_bytes", 0);
                String downloadErrorMessage = json.optString("error_message", null);
                long downloadTimestamp = json.optLong("timestamp", System.currentTimeMillis());

                Log.d(TAG, "📥 OTA Download Progress - Status: " + downloadStatus +
                      ", Progress: " + downloadProgress + "%" +
                      ", Bytes: " + bytesDownloaded + "/" + totalBytes +
                      (downloadErrorMessage != null ? ", Error: " + downloadErrorMessage : ""));

                // Emit EventBus event for AugmentosService on main thread
                try {
                    DownloadProgressEvent.DownloadStatus downloadEventStatus;
                    final DownloadProgressEvent event;
                    switch (downloadStatus) {
                        case "STARTED":
                            downloadEventStatus = DownloadProgressEvent.DownloadStatus.STARTED;
                            event = new DownloadProgressEvent(downloadEventStatus, totalBytes);
                            break;
                        case "PROGRESS":
                            downloadEventStatus = DownloadProgressEvent.DownloadStatus.PROGRESS;
                            event = new DownloadProgressEvent(downloadEventStatus, downloadProgress, bytesDownloaded, totalBytes);
                            break;
                        case "FINISHED":
                            downloadEventStatus = DownloadProgressEvent.DownloadStatus.FINISHED;
                            event = new DownloadProgressEvent(downloadEventStatus, totalBytes, true);
                            break;
                        case "FAILED":
                            downloadEventStatus = DownloadProgressEvent.DownloadStatus.FAILED;
                            event = new DownloadProgressEvent(downloadEventStatus, downloadErrorMessage);
                            break;
                        default:
                            Log.w(TAG, "Unknown download status: " + downloadStatus);
                            return;
                    }

                    // Post event on main thread to ensure proper delivery
                    handler.post(() -> {
                        Log.d(TAG, "📡 Posting download progress event on main thread: " + downloadEventStatus);
                        EventBus.getDefault().post(event);
                    });
                } catch (Exception e) {
                    Log.e(TAG, "Error creating download progress event", e);
                }

                // Forward to data observable for cloud communication
                if (dataObservable != null) {
                    dataObservable.onNext(json);
                }
                break;

            case "ota_installation_progress":
                // Process OTA installation progress from ASG client
                Log.d(TAG, "🔧 Received OTA installation progress from ASG client: " + json.toString());

                // Extract installation progress information
                String installationStatus = json.optString("status", "");
                String apkPath = json.optString("apk_path", "");
                String installationErrorMessage = json.optString("error_message", null);
                long installationTimestamp = json.optLong("timestamp", System.currentTimeMillis());

                Log.d(TAG, "🔧 OTA Installation Progress - Status: " + installationStatus +
                      ", APK: " + apkPath +
                      (installationErrorMessage != null ? ", Error: " + installationErrorMessage : ""));

                // Emit EventBus event for AugmentosService on main thread
                try {
                    InstallationProgressEvent.InstallationStatus installationEventStatus;
                    final InstallationProgressEvent event;
                    switch (installationStatus) {
                        case "STARTED":
                            installationEventStatus = InstallationProgressEvent.InstallationStatus.STARTED;
                            event = new InstallationProgressEvent(installationEventStatus, apkPath);
                            break;
                        case "FINISHED":
                            installationEventStatus = InstallationProgressEvent.InstallationStatus.FINISHED;
                            event = new InstallationProgressEvent(installationEventStatus, apkPath);
                            break;
                        case "FAILED":
                            installationEventStatus = InstallationProgressEvent.InstallationStatus.FAILED;
                            event = new InstallationProgressEvent(installationEventStatus, apkPath, installationErrorMessage);
                            break;
                        default:
                            Log.w(TAG, "Unknown installation status: " + installationStatus);
                            return;
                    }

                    // Post event on main thread to ensure proper delivery
                    handler.post(() -> {
                        Log.d(TAG, "📡 Posting installation progress event on main thread: " + installationEventStatus);
                        EventBus.getDefault().post(event);
                    });
                } catch (Exception e) {
                    Log.e(TAG, "Error creating installation progress event", e);
                }

                // Forward to data observable for cloud communication
                if (dataObservable != null) {
                    dataObservable.onNext(json);
                }
                break;

            default:
                // Pass the data to the subscriber for custom processing
                if (dataObservable != null) {
                    dataObservable.onNext(json);
                }
                break;
        }
    }

    /**
     * Process K900 command format JSON messages (messages with "C" field)
     */
    /**
     * Process BLE photo ready notification from glasses
     */
    private void processBlePhotoReady(JSONObject json) {
        try {
            String bleImgId = json.optString("bleImgId", "");
            String requestId = json.optString("requestId", "");
            long compressionDurationMs = json.optLong("compressionDurationMs", 0);

            Log.d(TAG, "📸 BLE photo ready notification: bleImgId=" + bleImgId + ", requestId=" + requestId);

            // Update the transfer with glasses compression duration
            BlePhotoTransfer transfer = blePhotoTransfers.get(bleImgId);
            if (transfer != null) {
                transfer.glassesCompressionDurationMs = compressionDurationMs;
                transfer.bleTransferStartTime = System.currentTimeMillis();  // BLE transfer starts now
                Log.d(TAG, "⏱️ Glasses compression took: " + compressionDurationMs + "ms");
            } else {
                Log.w(TAG, "Received ble_photo_ready for unknown transfer: " + bleImgId);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing ble_photo_ready", e);
        }
    }

    /**
     * Handle transfer timeout notification from glasses
     */
    private void handleTransferTimeout(JSONObject json) {
        try {
            String fileName = json.optString("fileName", "");
            
            Log.e(TAG, "⏰ Transfer timeout notification received for: " + fileName);
            
            if (!fileName.isEmpty()) {
                // Clean up any active transfer for this file
                FileTransferSession session = activeFileTransfers.remove(fileName);
                if (session != null) {
                    Log.d(TAG, "🧹 Cleaned up timed out transfer session for: " + fileName);
                    Log.d(TAG, "📊 Transfer stats - Received: " + session.receivedPackets.size() + "/" + session.totalPackets + " packets");
                }
                
                // Clean up any BLE photo transfer
                String bleImgId = fileName;
                int dotIndex = bleImgId.lastIndexOf('.');
                if (dotIndex > 0) {
                    bleImgId = bleImgId.substring(0, dotIndex);
                }
                BlePhotoTransfer photoTransfer = blePhotoTransfers.remove(bleImgId);
                if (photoTransfer != null) {
                    Log.d(TAG, "🧹 Cleaned up timed out BLE photo transfer for: " + bleImgId);
                }
            }
            
        } catch (Exception e) {
            Log.e(TAG, "⏰ Error processing transfer timeout notification", e);
        }
    }

    /**
     * Handle transfer failed notification from glasses (max retries exceeded)
     */
    private void handleTransferFailed(JSONObject json) {
        try {
            String fileName = json.optString("fileName", "");
            String reason = json.optString("reason", "unknown");

            Log.e(TAG, "❌ Transfer failed notification received for: " + fileName + " (reason: " + reason + ")");

            if (!fileName.isEmpty()) {
                // Clean up any active transfer for this file
                FileTransferSession session = activeFileTransfers.remove(fileName);
                if (session != null) {
                    Log.d(TAG, "🧹 Cleaned up failed transfer session for: " + fileName);
                    Log.d(TAG, "📊 Transfer stats - Received: " + session.receivedPackets.size() + "/" + session.totalPackets + " packets");
                    Log.d(TAG, "❌ Failure reason: " + reason);
                }

                // Clean up any BLE photo transfer
                String bleImgId = fileName;
                int dotIndex = bleImgId.lastIndexOf('.');
                if (dotIndex > 0) {
                    bleImgId = bleImgId.substring(0, dotIndex);
                }
                BlePhotoTransfer photoTransfer = blePhotoTransfers.remove(bleImgId);
                if (photoTransfer != null) {
                    Log.d(TAG, "🧹 Cleaned up failed BLE photo transfer for: " + bleImgId);

                    // Notify that BLE photo transfer failed if we have a requestId
                    if (photoTransfer.requestId != null) {
                        // Could send failure notification to any listeners if needed
                        Log.e(TAG, "❌ BLE photo transfer failed for requestId: " + photoTransfer.requestId);
                    }
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "❌ Error processing transfer failed notification", e);
        }
    }

    /**
     * Handle file transfer announcement from glasses
     */
    private void handleFileTransferAnnouncement(JSONObject json) {
        try {
            // Extract data directly from JSON (same format as version_info)
            String fileName = json.optString("fileName", "");
            int totalPackets = json.optInt("totalPackets", 0);
            int fileSize = json.optInt("fileSize", 0);
            
            Log.d(TAG, "📢 File transfer announcement: " + fileName + ", " + totalPackets + " packets, " + fileSize + " bytes");
            
            if (fileName.isEmpty() || totalPackets <= 0) {
                Log.w(TAG, "📢 Invalid file transfer announcement");
                return;
            }
            
            // Check if we already have a session for this file (restart scenario)
            FileTransferSession existingSession = activeFileTransfers.get(fileName);
            if (existingSession != null) {
                Log.d(TAG, "📢 RESTART detected - clearing existing session for " + fileName);
                Log.d(TAG, "📊 Previous session had " + existingSession.receivedPackets.size() + "/" + existingSession.totalPackets + " packets");
                // Clear existing session for fresh start
                activeFileTransfers.remove(fileName);
            }
            
            // Create new announced file transfer session
            FileTransferSession session = new FileTransferSession(fileName, fileSize);
            // Override calculated packet count with announced count for accuracy
            session.totalPackets = totalPackets;
            session.isAnnounced = true;
            activeFileTransfers.put(fileName, session);
            
            Log.d(TAG, "📢 Prepared to receive " + totalPackets + " packets for " + fileName + (existingSession != null ? " (RESTART)" : " (NEW)"));
            
        } catch (Exception e) {
            Log.e(TAG, "📢 Error processing file transfer announcement", e);
        }
    }

    private void processK900JsonMessage(JSONObject json) {
        String command = json.optString("C", "");
        Log.d(TAG, "Processing K900 command: " + command);

        switch (command) {
            case "sr_hrt":
                try {
                    JSONObject bodyObj = json.optJSONObject("B");
                    if (bodyObj != null) {

                        int batteryPercentage = bodyObj.optInt("pt", -1);
                        int ready = bodyObj.optInt("ready", 0);
                        if (ready == 0 && batteryPercentage > 0 && batteryPercentage <= 20) {
                            Log.d(TAG, "K900 battery percentage: " + batteryPercentage);
                            EventBus.getDefault().post(new PairFailureEvent("errors:pairingBatteryTooLow"));
                            return;
                        }
                        if (ready == 1) {
                            Log.d(TAG, "K900 SOC ready");
                            JSONObject readyMsg = new JSONObject();
                            readyMsg.put("type", "phone_ready");
                            readyMsg.put("timestamp", System.currentTimeMillis());

                            // Send it through our data channel
                            sendJson(readyMsg, true);
                        }
                        int charg = bodyObj.optInt("charg", -1);
                        if (batteryPercentage != -1 && charg != -1)
                            updateBatteryStatus(batteryPercentage, charg == 1);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing sr_hrt response", e);
                }
                break;
            case "sr_batv":
                // K900 battery voltage response
                try {
                    JSONObject bodyObj = json.optJSONObject("B");
                    if (bodyObj != null) {
                        int voltageMillivolts = bodyObj.optInt("vt", 0);
                        int batteryPercentage = bodyObj.optInt("pt", 0);

                        // Convert to volts for logging
                        double voltageVolts = voltageMillivolts / 1000.0;

                        Log.d(TAG, "🔋 K900 Battery Status - Voltage: " + voltageVolts + "V (" + voltageMillivolts + "mV), Level: " + batteryPercentage + "%");

                        // Determine charging status based on voltage (K900 typical charging voltage is >4.0V)
                        boolean isCharging = voltageMillivolts > 4000;

                        // Update battery status using the existing method
                        updateBatteryStatus(batteryPercentage, isCharging);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing sr_batv response", e);
                }
                break;

            case "sr_shut":
                Log.d(TAG, "K900 shutdown command received - glasses shutting down");
                // Mark as killed to prevent reconnection attempts
                isKilled = true;
                // Clean disconnect without reconnection
                if (bluetoothGatt != null) {
                    Log.d(TAG, "Disconnecting from glasses due to shutdown");
                    bluetoothGatt.disconnect();
                }
                // Notify the system that glasses are intentionally disconnected
                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                break;

            default:
                Log.d(TAG, "Unknown K900 command: " + command);
                // Pass to data observable for custom processing
                if (dataObservable != null) {
                    dataObservable.onNext(json);
                }
                break;
        }
    }

    /**
     * Send the coreToken to the ASG client for direct backend authentication
     */
    private void sendCoreTokenToAsgClient() {
        Log.d(TAG, "Preparing to send coreToken to ASG client");

        // Get the coreToken from SharedPreferences
        SharedPreferences prefs = context.getSharedPreferences(AUTH_PREFS_NAME, Context.MODE_PRIVATE);
        String coreToken = prefs.getString(KEY_CORE_TOKEN, null);

        if (coreToken == null || coreToken.isEmpty()) {
            Log.e(TAG, "No coreToken available to send to ASG client");
            return;
        }

        try {
            // Create a JSON object with the token
            JSONObject tokenMsg = new JSONObject();
            tokenMsg.put("type", "auth_token");
            tokenMsg.put("coreToken", coreToken);
            tokenMsg.put("timestamp", System.currentTimeMillis());

            // Send the JSON object
            Log.d(TAG, "Sending coreToken to ASG client");
            sendJson(tokenMsg);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating coreToken JSON message", e);
        }
    }

    /**
     * Convert bytes to hex string for debugging
     */
    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02X ", b));
        }
        return sb.toString();
    }

    /**
     * Request battery status from the glasses
     */
    private void requestBatteryStatus() {
        //JSONObject json = new JSONObject();
        //json.put("type", "request_battery_state");
        //sendDataToGlasses(json.toString());

        requestBatteryK900();
    }

    /**
     * Update battery status and notify listeners
     */
    private void updateBatteryStatus(int level, boolean charging) {
        batteryLevel = level;
        isCharging = charging;

        // Post battery event so the system knows the battery level
        EventBus.getDefault().post(new BatteryLevelEvent(level, charging));

        // Send battery status via BLE to connected phone
        // This was necessary for OG beta units
        // Not required for newer beta units
        // TODO: remove this line post hackathon
        // Commented out to prevent battery status echo loop between phone and glasses
        // sendBatteryStatusOverBle(level, charging);
    }

    /**
     * Send battery status to connected phone via BLE
     */
    private void sendBatteryStatusOverBle(int level, boolean charging) {
        if (isConnected && bluetoothGatt != null) {
            try {
                JSONObject batteryStatus = new JSONObject();
                batteryStatus.put("type", "battery_status");
                batteryStatus.put("level", level);
                batteryStatus.put("charging", charging);
                batteryStatus.put("timestamp", System.currentTimeMillis());

                // Convert to string and send via BLE
                String jsonString = batteryStatus.toString();
                Log.d(TAG, "🔋 Sending battery status via BLE: " + level + "% " + (charging ? "(charging)" : "(not charging)"));
                sendDataToGlasses(jsonString, false);

            } catch (JSONException e) {
                Log.e(TAG, "Error creating battery status JSON", e);
            }
        } else {
            Log.d(TAG, "Cannot send battery status - not connected to BLE device");
        }
    }

    /**
     * Request WiFi status from the glasses
     */
    private void requestWifiStatus() {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "request_wifi_status");
            sendJson(json, true);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating WiFi status request", e);
        }
    }

    /**
     * Request WiFi scan from the glasses
     * This will ask the glasses to scan for available networks
     */
    @Override
    public void requestWifiScan() {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "request_wifi_scan");
            sendJson(json, true);
            Log.d(TAG, "Sending WiFi scan request to glasses");
        } catch (JSONException e) {
            Log.e(TAG, "Error creating WiFi scan request", e);
        }
    }
    
    /**
     * Query gallery status from the glasses
     */
    @Override
    public void queryGalleryStatus() {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "query_gallery_status");
            sendJson(json, true);
            Log.d(TAG, "📸 Sending gallery status query to glasses");
        } catch (JSONException e) {
            Log.e(TAG, "📸 Error creating gallery status query", e);
        }
    }

    /**
     * Send heartbeat ping to glasses and handle periodic battery requests
     */
    private void sendHeartbeat() {
        if (!glassesReady || mConnectState != SmartGlassesConnectionState.CONNECTED) {
            Log.d(TAG, "Skipping heartbeat - glasses not ready or not connected");
            return;
        }

        try {
            // Send ping message (no ACK needed for heartbeats)
            JSONObject pingMsg = new JSONObject();
            pingMsg.put("type", "ping");
            sendJsonWithoutAck(pingMsg);

            // Send custom audio TX command
            // sendEnableCustomAudioTxMessage(shouldUseGlassesMic);

            // Increment heartbeat counter
            heartbeatCounter++;
            Log.d(TAG, "💓 Heartbeat #" + heartbeatCounter + " sent");

            // Request battery status every N heartbeats
            if (heartbeatCounter % BATTERY_REQUEST_EVERY_N_HEARTBEATS == 0) {
                Log.d(TAG, "🔋 Requesting battery status (heartbeat #" + heartbeatCounter + ")");
                requestBatteryStatus();
            }

        } catch (JSONException e) {
            Log.e(TAG, "Error creating heartbeat message", e);
        }
    }

    /**
     * Start the heartbeat mechanism
     */
    private void startHeartbeat() {
        Log.d(TAG, "💓 Starting heartbeat mechanism");
        heartbeatCounter = 0;
        heartbeatHandler.removeCallbacks(heartbeatRunnable); // Remove any existing callbacks
        heartbeatHandler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL_MS);

        // Also start test messages for ACK verification
        // startTestMessages();
    }

    /**
     * Stop the heartbeat mechanism
     */
    private void stopHeartbeat() {
        Log.d(TAG, "💓 Stopping heartbeat mechanism");
        heartbeatHandler.removeCallbacks(heartbeatRunnable);
        heartbeatCounter = 0;

        // Also stop test messages
        // stopTestMessages();
    }

    /**
     * Start the micbeat mechanism - periodically enable custom audio TX
     */
    private void startMicBeat() {
        Log.d(TAG, "🎤 Starting micbeat mechanism");
        micBeatCount = 0;
        
        // Initialize custom audio TX immediately
        sendEnableCustomAudioTxMessage(shouldUseGlassesMic);

        micBeatRunnable = new Runnable() {
            @Override
            public void run() {
                Log.d(TAG, "🎤 Sending micbeat - enabling custom audio TX");
                sendEnableCustomAudioTxMessage(shouldUseGlassesMic);
                micBeatCount++;
                
                // Schedule next micbeat
                micBeatHandler.postDelayed(this, MICBEAT_INTERVAL_MS);
            }
        };

        micBeatHandler.removeCallbacks(micBeatRunnable); // Remove any existing callbacks
        micBeatHandler.postDelayed(micBeatRunnable, MICBEAT_INTERVAL_MS);
    }

    /**
     * Stop the micbeat mechanism
     */
    private void stopMicBeat() {
        Log.d(TAG, "🎤 Stopping micbeat mechanism");
        sendEnableCustomAudioTxMessage(false);        
        micBeatHandler.removeCallbacks(micBeatRunnable);
        micBeatCount = 0;
    }

    /**
     * Send a periodic test message to verify ACK system
     */
    private void sendTestMessage() {
        if (!glassesReady || mConnectState != SmartGlassesConnectionState.CONNECTED) {
            Log.d(TAG, "Skipping test message - glasses not ready or not connected");
            return;
        }

        try {
            testMessageCounter++;
            JSONObject testMsg = new JSONObject();
            testMsg.put("type", "test_message");
            testMsg.put("counter", testMessageCounter);
            testMsg.put("timestamp", System.currentTimeMillis());
            testMsg.put("message", "ACK test message #" + testMessageCounter);
            testMsg.put("deviceId", deviceId); // Include device ID for debugging

            Log.d(TAG, "🧪 Sending test message #" + testMessageCounter + " for ACK verification");
            sendJson(testMsg, true); // This will include esoteric mId and ACK tracking

        } catch (JSONException e) {
            Log.e(TAG, "Error creating test message", e);
        }
    }

    /**
     * Start the periodic test message system
     */
    private void startTestMessages() {
        Log.d(TAG, "🧪 Starting periodic test message system (every " + TEST_MESSAGE_INTERVAL_MS + "ms)");
        testMessageCounter = 0;
        testMessageHandler.removeCallbacks(testMessageRunnable); // Remove any existing callbacks
        testMessageHandler.postDelayed(testMessageRunnable, TEST_MESSAGE_INTERVAL_MS);
    }

    /**
     * Stop the periodic test message system
     */
    private void stopTestMessages() {
        Log.d(TAG, "🧪 Stopping periodic test message system");
        testMessageHandler.removeCallbacks(testMessageRunnable);
        testMessageCounter = 0;
    }

    /**
     * Dump all thread states for debugging BLE failures
     */
    private void dumpThreadStates() {
        Log.e(TAG, "📸 THREAD STATE DUMP - START");
        try {
            Map<Thread, StackTraceElement[]> allThreads = Thread.getAllStackTraces();
            for (Map.Entry<Thread, StackTraceElement[]> entry : allThreads.entrySet()) {
                Thread thread = entry.getKey();
                StackTraceElement[] stack = entry.getValue();

                Log.e(TAG, "📌 Thread: " + thread.getName() +
                      " (ID: " + thread.getId() +
                      ", State: " + thread.getState() +
                      ", Priority: " + thread.getPriority() + ")");

                // Only print first 5 stack frames to avoid log spam
                for (int i = 0; i < Math.min(5, stack.length); i++) {
                    Log.e(TAG, "    at " + stack[i].toString());
                }
                if (stack.length > 5) {
                    Log.e(TAG, "    ... " + (stack.length - 5) + " more frames");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error dumping thread states", e);
        }
        Log.e(TAG, "📸 THREAD STATE DUMP - END");
    }

    /**
     * Check if we have the necessary permissions
     */
    private boolean hasPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
                   PackageManager.PERMISSION_GRANTED;
        } else {
            return ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH) ==
                   PackageManager.PERMISSION_GRANTED;
        }
    }

    // Helper method for permission checking when needed in different contexts
    private boolean checkPermission() {
        return hasPermissions();
    }

    // SmartGlassesCommunicator interface implementation

    @Override
    public void findCompatibleDeviceNames() {
        Log.d(TAG, "Finding compatible Mentra Live glasses");

        if (bluetoothAdapter == null) {
            Log.e(TAG, "Bluetooth not available");
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            Log.e(TAG, "Bluetooth is not enabled");
            return;
        }

        // Start scanning for BLE devices
        startScan();
    }


    @Override
    public void connectToSmartGlasses(SmartGlassesDevice smartDevice) {
        Log.d(TAG, "Connecting to Mentra Live glasses");
        connectionEvent(SmartGlassesConnectionState.CONNECTING);

        if (isConnected) {
            Log.d(TAG, "#@32 Already connected to Mentra Live glasses");
            connectionEvent(SmartGlassesConnectionState.CONNECTED);
            return;
        }

        if (bluetoothAdapter == null) {
            Log.e(TAG, "Bluetooth not available");
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            Log.e(TAG, "Bluetooth is not enabled");
            connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
            return;
        }

        // Get last known device address
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String lastDeviceAddress = prefs.getString(PREF_DEVICE_NAME, null);

        if (lastDeviceAddress != null) {
            // Connect to last known device if available
            Log.d(TAG, "Attempting to connect to last known device: " + lastDeviceAddress);
            try {
                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(lastDeviceAddress);
                if (device != null) {
                    Log.d(TAG, "Found saved device, connecting directly: " + lastDeviceAddress);
                    connectToDevice(device);
                } else {
                    Log.e(TAG, "Could not create device from address: " + lastDeviceAddress);
                    connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                    startScan(); // Fallback to scanning
                }
            } catch (Exception e) {
                Log.e(TAG, "Error connecting to saved device: " + e.getMessage());
                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                startScan(); // Fallback to scanning
            }
        } else {
            // If no last known device, start scanning for devices
            Log.d(TAG, "No last known device, starting scan");
            startScan();
        }
    }

    @Override
    public void changeSmartGlassesMicrophoneState(boolean enable) {
        Log.d(TAG, "Microphone state changed: " + enable);
        
        // Update the microphone state tracker
        isMicrophoneEnabled = enable;
        
        // Post event for frontend notification
        EventBus.getDefault().post(new isMicEnabledForFrontendEvent(enable));
        
        // Update the shouldUseGlassesMic flag to reflect the current state
        this.shouldUseGlassesMic = enable && SmartGlassesManager.getSensingEnabled(context);
        Log.d(TAG, "Updated shouldUseGlassesMic to: " + shouldUseGlassesMic);

        if (this.shouldUseGlassesMic) {
            Log.d(TAG, "Microphone enabled, starting audio input handling");
            startMicBeat();
        } else {
            Log.d(TAG, "Microphone disabled, stopping audio input handling");
            stopMicBeat();
        }
    }

    /**
     * Returns whether the microphone is currently enabled
     * @return true if microphone is enabled, false otherwise
     */
    public boolean isMicrophoneEnabled() {
        return isMicrophoneEnabled;
    }

    @Override
    public void requestPhoto(String requestId, String appId, String webhookUrl, String authToken, String size) {
        Log.d(TAG, "Requesting photo: " + requestId + " for app: " + appId + " with webhookUrl: " + webhookUrl + ", authToken: " + (authToken.isEmpty() ? "none" : "***") + ", size=" + size);

        try {
            JSONObject json = new JSONObject();
            json.put("type", "take_photo");
            json.put("requestId", requestId);
            json.put("appId", appId);
            if (webhookUrl != null && !webhookUrl.isEmpty()) {
                json.put("webhookUrl", webhookUrl);
            }
            if (authToken != null && !authToken.isEmpty()) {
                json.put("authToken", authToken);
            }
            if (size != null && !size.isEmpty()) {
                json.put("size", size);
            }

            // Always generate BLE ID for potential fallback
            String bleImgId = "I" + String.format("%09d", System.currentTimeMillis() % 1000000000);
            json.put("bleImgId", bleImgId);

            // Use auto mode by default - glasses will decide based on connectivity
            json.put("transferMethod", "auto");

            // Always prepare for potential BLE transfer
            if (webhookUrl != null && !webhookUrl.isEmpty()) {
                // Store the transfer info for BLE route - include authToken
                BlePhotoTransfer transfer = new BlePhotoTransfer(bleImgId, requestId, webhookUrl);
                transfer.setAuthToken(authToken); // Store authToken for BLE transfer
                blePhotoTransfers.put(bleImgId, transfer);
            }

            Log.d(TAG, "Using auto transfer mode with BLE fallback ID: " + bleImgId);

            sendJson(json, true);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo request JSON", e);
        }
    }

    @Override
    public void requestRtmpStreamStart(JSONObject message) {
    //    try {
            JSONObject json = message;
            json.remove("timestamp");
            json.remove("appId");
            json.remove("video");
            json.remove("audio");
            //String rtmpUrl=json.getString("rtmpUrl");
            //Log.d(TAG, "Requesting RTMP stream to URL: " + rtmpUrl);
            sendJson(json, true);
//            json.put("type", "start_rtmp_stream");
//            json.put("rtmpUrl", rtmpUrl);
//
//            // Add parameters if provided
//            if (parameters != null) {
//                // Just pass the parameters object directly
//                json.put("parameters", parameters);
//            }
//
//            sendJson(json);
//        } catch (JSONException e) {
//            Log.e(TAG, "Error creating RTMP stream request JSON", e);
//        }
    }

    @Override
    public void stopRtmpStream() {
        Log.d(TAG, "Requesting to stop RTMP stream");
        try {
            JSONObject json = new JSONObject();
            json.put("type", "stop_rtmp_stream");

            sendJson(json, true);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating RTMP stream stop JSON", e);
        }
    }

    @Override
    public void sendRtmpStreamKeepAlive(JSONObject message) {
        Log.d(TAG, "Sending RTMP stream keep alive");
        try {
            // Forward the keep alive message directly to the glasses
            sendJson(message);
        } catch (Exception e) {
            Log.e(TAG, "Error sending RTMP stream keep alive", e);
        }
    }

    /**
     * Track a BLE photo transfer request
     */
    private void trackBlePhotoTransfer(String bleImgId, String requestId, String webhookUrl) {
        BlePhotoTransfer transfer = new BlePhotoTransfer(bleImgId, requestId, webhookUrl);
        blePhotoTransfers.put(bleImgId, transfer);
        Log.d(TAG, "Tracking BLE photo transfer - bleImgId: " + bleImgId + ", requestId: " + requestId);
    }

    /**
     * Check if the ASG client is connected to WiFi
     * @return true if connected to WiFi, false otherwise
     */
    public boolean isGlassesWifiConnected() {
        return isWifiConnected;
    }

    /**
     * Get the SSID of the WiFi network the ASG client is connected to
     * @return SSID string, or empty string if not connected
     */
    public String getGlassesWifiSsid() {
        return wifiSsid;
    }

    /**
     * Manually request a WiFi status update from the ASG client
     */
    public void refreshGlassesWifiStatus() {
        if (isConnected) {
            requestWifiStatus();
        }
    }

    // Debug video command loop vars
    private Runnable debugVideoCommandRunnable;
    private int debugCommandCounter = 0;
    private static final int DEBUG_VIDEO_INTERVAL_MS = 5000; // 5 seconds

    // SOC readiness check parameters
    private static final int READINESS_CHECK_INTERVAL_MS = 2500; // every 2.5 seconds
    private Runnable readinessCheckRunnable;
    private int readinessCheckCounter = 0;
    //private boolean glassesReady = false; // Track if glasses have confirmed they're ready

    /**
     * Starts the glasses SOC readiness check loop
     * This sends a "phone_ready" message every 5 seconds until
     * we receive a "glasses_ready" response, indicating the SOC is booted
     */
    private void startReadinessCheckLoop() {
        // Stop any existing readiness check
        stopReadinessCheckLoop();

        // Reset counter and ready flag
        readinessCheckCounter = 0;
        glassesReady = false;

        Log.d(TAG, "🔄 Starting glasses SOC readiness check loop");

        readinessCheckRunnable = new Runnable() {
            @Override
            public void run() {
                if (isConnected && !isKilled && !glassesReady) {
                    readinessCheckCounter++;

                    Log.d(TAG, "🔄 Readiness check #" + readinessCheckCounter + ": waiting for glasses SOC to boot");
                    requestReadyK900();


                    // Schedule next check only if glasses are still not ready
                    if (!glassesReady) {
                        handler.postDelayed(this, READINESS_CHECK_INTERVAL_MS);
                    }
                } else {
                    Log.d(TAG, "🔄 Readiness check loop stopping - connected: " + isConnected +
                          ", killed: " + isKilled + ", glassesReady: " + glassesReady);
                }
            }
        };

        // Start the loop
        handler.post(readinessCheckRunnable);
    }

    /**
     * Stops the glasses SOC readiness check loop
     */
    private void stopReadinessCheckLoop() {
        if (readinessCheckRunnable != null) {
            handler.removeCallbacks(readinessCheckRunnable);
            readinessCheckRunnable = null;
            Log.d(TAG, "🔄 Stopped glasses SOC readiness check loop");
        }
    }

    @Override
    public void destroy() {
        Log.d(TAG, "Destroying MentraLiveSGC");

        // Mark as killed to prevent reconnection attempts
        boolean wasKilled = isKilled;
        isKilled = true;

        // Stop scanning if in progress
        if (isScanning) {
            stopScan();
        }

        // Stop readiness check loop
        stopReadinessCheckLoop();

        // Stop heartbeat mechanism
        stopHeartbeat();

        // Stop micbeat mechanism
        stopMicBeat();

        // Cancel connection timeout
        if (connectionTimeoutRunnable != null) {
            connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
        }

        // Cancel any pending handlers
        handler.removeCallbacksAndMessages(null);
        heartbeatHandler.removeCallbacksAndMessages(null);
        micBeatHandler.removeCallbacksAndMessages(null);
        connectionTimeoutHandler.removeCallbacksAndMessages(null);
        testMessageHandler.removeCallbacksAndMessages(null);

        // Clean up message tracking
        pendingMessages.clear();
        Log.d(TAG, "Cleared pending message tracking");

        // Disconnect from GATT if connected
        if (bluetoothGatt != null) {
            bluetoothGatt.disconnect();
            bluetoothGatt.close();
            bluetoothGatt = null;
        }

        isConnected = false;
        isConnecting = false;

        // Clear the send queue
        sendQueue.clear();

        // Reset state variables
        reconnectAttempts = 0;
        glassesReady = false;

        // Note: We don't null context here to prevent race conditions with BLE callbacks
        // The isKilled flag above serves as our destruction indicator
        smartGlassesDevice = null;
        dataObservable = null;

        // Set connection state to disconnected
        connectionEvent(SmartGlassesConnectionState.DISCONNECTED);

        // Clean up LC3 audio player
        if (lc3AudioPlayer != null) {
            lc3AudioPlayer.stopPlay();
        }

        // Clean up LC3 decoder
        if (lc3DecoderPtr != 0) {
            L3cCpp.freeDecoder(lc3DecoderPtr);
            lc3DecoderPtr = 0;
            Log.d(TAG, "Freed LC3 decoder resources");
        }
    }

    // Display methods - all stub implementations since Mentra Live has no display

    @Override
    public void setFontSize(SmartGlassesFontSize fontSize) {
        Log.d(TAG, "[STUB] Device has no display. Cannot set font size: " + fontSize);
    }

    @Override
    public void sendButtonPhotoSettings(String size) {
        // Send photo size settings to glasses
        JSONObject command = new JSONObject();
        try {
            command.put("type", "button_photo_setting");
            command.put("size", size);
            sendJson(command, true);
        } catch (Exception e) {
            Log.e(TAG, "Error sending button photo settings", e);
        }
    }

    public void sendButtonVideoRecordingSettings() {
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        int videoWidth = prefs.getInt("button_video_width", 1280);
        int videoHeight = prefs.getInt("button_video_height", 720);
        int videoFps = prefs.getInt("button_video_fps", 30);
        
        Log.d(TAG, "Sending button video recording settings: " + videoWidth + "x" + videoHeight + "@" + videoFps + "fps");
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "button_video_recording_setting");
            JSONObject settings = new JSONObject();
            settings.put("width", videoWidth);
            settings.put("height", videoHeight);
            settings.put("fps", videoFps);
            json.put("params", settings);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating button video recording settings message", e);
        }
    }

    @Override
    public void sendButtonCameraLedSetting(boolean enabled) {
        // Send LED setting to glasses
        JSONObject command = new JSONObject();
        try {
            command.put("type", "button_camera_led");
            command.put("enabled", enabled);
            sendJson(command, true);
        } catch (Exception e) {
            Log.e(TAG, "Error sending button camera LED setting", e);
        }
    }

    @Override
    public void displayTextWall(String text) {
        Log.d(TAG, "[STUB] Device has no display. Text wall would show: " + text);
    }

    @Override
    public void displayBitmap(Bitmap bitmap) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display bitmap.");
    }

    @Override
    public void displayTextLine(String text) {
        Log.d(TAG, "[STUB] Device has no display. Text line would show: " + text);
    }

    @Override
    public void displayReferenceCardSimple(String title, String body) {
        Log.d(TAG, "[STUB] Device has no display. Reference card would show: " + title);
    }

    @Override
    public void updateGlassesBrightness(int brightness) {
        Log.d(TAG, "[STUB] Device has no display. Cannot set brightness: " + brightness);
    }

    @Override
    public void showHomeScreen() {
        Log.d(TAG, "[STUB] Device has no display. Cannot show home screen.");
    }

    @Override
    public void blankScreen() {
        Log.d(TAG, "[STUB] Device has no display. Cannot blank screen.");
    }

    @Override
    public void displayRowsCard(String[] rowStrings) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display rows card with " + rowStrings.length + " rows");
    }

    @Override
    public void showNaturalLanguageCommandScreen(String prompt, String naturalLanguageArgs) {
        Log.d(TAG, "[STUB] Device has no display. Cannot show natural language command screen: " + prompt);
    }

    @Override
    public void updateNaturalLanguageCommandScreen(String naturalLanguageArgs) {
        Log.d(TAG, "[STUB] Device has no display. Cannot update natural language command screen");
    }

    @Override
    public void scrollingTextViewIntermediateText(String text) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display scrolling text: " + text);
    }

    @Override
    public void displayPromptView(String title, String[] options) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display prompt view: " + title);
    }

    @Override
    public void displayCustomContent(String json) {
        Log.d(TAG, "[STUB] Device has no display. Cannot display custom content");
    }

    @Override
    public void clearDisplay() {
        if (!isConnected()) {
            Log.d(TAG, "Not connected to glasses");
            return;
        }
        Log.w(TAG, "MentraLiveSGC does not support clearDisplay");
    }

    @Override
    public void displayReferenceCardImage(String title, String body, String imgUrl) {
        Log.d(TAG, "[STUB] Device has no display. Reference card with image would show: " + title);
    }

    @Override
    public void displayDoubleTextWall(String textTop, String textBottom) {
        Log.d(TAG, "[STUB] Device has no display. Double text wall would show: " + textTop + " / " + textBottom);
    }

    @Override
    public void displayBulletList(String title, String[] bullets) {
        Log.d(TAG, "[STUB] Device has no display. Bullet list would show: " + title + " with " + bullets.length + " items");
    }

    @Override
    public void startScrollingTextViewMode(String title) {
        Log.d(TAG, "[STUB] Device has no display. Scrolling text view would start with: " + title);
    }

    @Override
    public void scrollingTextViewFinalText(String text) {
        Log.d(TAG, "[STUB] Device has no display. Scrolling text view would show: " + text);
    }

    @Override
    public void stopScrollingTextViewMode() {
        // Not supported on Mentra Live
    }

    /**
     * Enable or disable receiving custom GATT audio from the glasses microphone.
     * @param enable True to enable, false to disable.
     */
    public void sendEnableCustomAudioTxMessage(boolean enable) {
        try {
            JSONObject cmd = new JSONObject();
            cmd.put("C", "enable_custom_audio_tx");
            JSONObject enableObj = new JSONObject();
            enableObj.put("enable", enable);
            cmd.put("B", enableObj.toString());

            String jsonStr = cmd.toString();
            Log.d(TAG, "Sending hrt command: " + jsonStr);
            byte[] packedData = K900ProtocolUtils.packDataToK900(jsonStr.getBytes(StandardCharsets.UTF_8), K900ProtocolUtils.CMD_TYPE_STRING);
            queueData(packedData);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating enable_custom_audio_tx command", e);
        }
    }

    /**
     * Enable or disable sending custom GATT audio to the glasses speaker.
     * @param enable True to enable, false to disable.
     */
    public void enableCustomAudioRx(boolean enable) {
        try {
            JSONObject cmd = new JSONObject();
            cmd.put("C", "enable_custom_audio_rx");
            cmd.put("B", enable);
            sendJson(cmd);
            Log.d(TAG, "Setting custom audio RX (speaker) to: " + enable);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating enable_custom_audio_rx command", e);
        }
    }

    /**
     * Enable or disable the standard HFP audio service on the glasses.
     * @param enable True to enable, false to disable.
     */
    public void enableHfpAudioServer(boolean enable) {
        try {
            JSONObject cmd = new JSONObject();
            cmd.put("C", "enable_hfp_audio_server");
            cmd.put("B", enable);
            sendJson(cmd);
            Log.d(TAG, "Setting HFP audio server to: " + enable);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating enable_hfp_audio_server command", e);
        }
    }
    
    /**
     * Enable or disable audio playback through phone speakers when receiving LC3 audio from glasses.
     * @param enable True to enable audio playback, false to disable.
     */
    public void enableAudioPlayback(boolean enable) {
        audioPlaybackEnabled = enable;
        if (enable) {
            Log.d(TAG, "Audio playback enabled - LC3 audio will be played through phone speakers");
            // Note: LC3Player is already started during initialization
        } else {
            Log.d(TAG, "Audio playback disabled - LC3 audio will not be played through phone speakers");
            // Note: We keep LC3Player running but just stop feeding it data
        }
    }

    /**
     * Check if audio playback is currently enabled.
     * @return True if audio playback is enabled, false otherwise.
     */
    public boolean isAudioPlaybackEnabled() {
        return audioPlaybackEnabled;
    }
    
    /**
     * Set the volume for audio playback.
     * @param volume Volume level from 0.0f (muted) to 1.0f (full volume).
     */
    public void setAudioPlaybackVolume(float volume) {
        if (lc3AudioPlayer != null) {
            // Clamp volume to valid range
            float clampedVolume = Math.max(0.0f, Math.min(1.0f, volume));
            // Note: LC3Player doesn't have setVolume method, using system volume
            Log.d(TAG, "Audio playback volume request: " + clampedVolume + " (handled by system volume)");
        }
    }
    
    /**
     * Get the current audio playback volume.
     * @return Current volume level from 0.0f to 1.0f.
     */
    public float getAudioPlaybackVolume() {
        // Note: LC3Player doesn't have a getVolume method, so we'll return a default
        // In a real implementation, you might want to track this separately
        return 1.0f; // Default to full volume
    }
    
    /**
     * Stop any currently playing audio immediately.
     */
    public void stopAudioPlayback() {
        if (lc3AudioPlayer != null) {
            lc3AudioPlayer.stopPlay();
            Log.d(TAG, "Audio playback stopped");
        }
    }
    
    /**
     * Check if audio is currently playing.
     * @return True if audio is currently playing, false otherwise.
     */
    public boolean isAudioPlaying() {
        return lc3AudioPlayer != null && audioPlaybackEnabled;
    }
    
    /**
     * Pause audio playback.
     */
    public void pauseAudioPlayback() {
        if (lc3AudioPlayer != null) {
            lc3AudioPlayer.stopPlay();
            Log.d(TAG, "Audio playback paused");
        }
    }
    
    /**
     * Resume audio playback.
     */
    public void resumeAudioPlayback() {
        if (lc3AudioPlayer != null) {
            lc3AudioPlayer.startPlay();
            Log.d(TAG, "Audio playback resumed");
        }
    }
    
    /**
     * Get audio playback statistics and status information.
     * @return JSONObject containing audio playback information.
     */
    public JSONObject getAudioPlaybackStatus() {
        JSONObject status = new JSONObject();
        try {
            status.put("enabled", audioPlaybackEnabled);
            status.put("playing", isAudioPlaying());
            status.put("volume", getAudioPlaybackVolume());
            status.put("initialized", lc3AudioPlayer != null);
            status.put("playerType", "LC3Player");
        } catch (JSONException e) {
            Log.e(TAG, "Error creating audio playback status JSON", e);
        }
        return status;
    }

    public void requestReadyK900(){
        try{
            JSONObject cmdObject = new JSONObject();
            cmdObject.put("C", "cs_hrt"); // Video command
            // cmdObject.put("W", 1);        // Wake up MTK system
            cmdObject.put("B", "");       // Add the body
            String jsonStr = cmdObject.toString();
            Log.d(TAG, "Sending hrt command: " + jsonStr);
            byte[] packedData = K900ProtocolUtils.packDataToK900(jsonStr.getBytes(StandardCharsets.UTF_8), K900ProtocolUtils.CMD_TYPE_STRING);
            queueData(packedData);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating video command", e);
        }
    }

    public void requestBatteryK900() {
        try {
            JSONObject cmdObject = new JSONObject();
            cmdObject.put("C", "cs_batv"); // Video command
            cmdObject.put("V", 1);        // Version is always 1
            cmdObject.put("B", "");     // Add the body
            String jsonStr = cmdObject.toString();
            Log.d(TAG, "Sending hotspot command: " + jsonStr);
            byte[] packedData = K900ProtocolUtils.packDataToK900(jsonStr.getBytes(StandardCharsets.UTF_8), K900ProtocolUtils.CMD_TYPE_STRING);
            queueData(packedData);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating video command", e);
        }
    }


    //---------------------------------------
    // IMU Methods
    //---------------------------------------

    /**
     * Request a single IMU reading from the glasses
     * Power-optimized: sensors turn on briefly then off
     */
    public void requestImuSingle() {
        Log.d(TAG, "Requesting single IMU reading");
        try {
            JSONObject json = new JSONObject();
            json.put("type", "imu_single");
            sendJson(json, false);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating IMU single request", e);
        }
    }

    /**
     * Start IMU streaming from the glasses
     * @param rateHz Sampling rate in Hz (1-100)
     * @param batchMs Batching period in milliseconds (0-1000)
     */
    public void startImuStream(int rateHz, long batchMs) {
        Log.d(TAG, "Starting IMU stream: " + rateHz + "Hz, batch: " + batchMs + "ms");
        try {
            JSONObject json = new JSONObject();
            json.put("type", "imu_stream_start");
            json.put("rate_hz", rateHz);
            json.put("batch_ms", batchMs);
            sendJson(json, false);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating IMU stream start request", e);
        }
    }

    /**
     * Stop IMU streaming from the glasses
     */
    public void stopImuStream() {
        Log.d(TAG, "Stopping IMU stream");
        try {
            JSONObject json = new JSONObject();
            json.put("type", "imu_stream_stop");
            sendJson(json, false);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating IMU stream stop request", e);
        }
    }

    /**
     * Subscribe to gesture detection on the glasses
     * Power-optimized: uses accelerometer-only at low rate
     * @param gestures List of gestures to detect ("head_up", "head_down", "nod_yes", "shake_no")
     */
    public void subscribeToImuGestures(List<String> gestures) {
        Log.d(TAG, "Subscribing to IMU gestures: " + gestures);
        try {
            JSONObject json = new JSONObject();
            json.put("type", "imu_subscribe_gesture");
            json.put("gestures", new JSONArray(gestures));
            sendJson(json, false);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating IMU gesture subscription", e);
        }
    }

    /**
     * Unsubscribe from all gesture detection
     */
    public void unsubscribeFromImuGestures() {
        Log.d(TAG, "Unsubscribing from IMU gestures");
        try {
            JSONObject json = new JSONObject();
            json.put("type", "imu_unsubscribe_gesture");
            sendJson(json, false);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating IMU gesture unsubscription", e);
        }
    }

    /**
     * Handle IMU response from glasses
     */
    private void handleImuResponse(JSONObject json) {
        try {
            String type = json.getString("type");
            
            switch(type) {
                case "imu_response":
                    // Single IMU reading
                    handleSingleImuData(json);
                    break;
                    
                case "imu_stream_response":
                    // Stream of IMU readings
                    handleStreamImuData(json);
                    break;
                    
                case "imu_gesture_response":
                    // Gesture detected
                    handleImuGesture(json);
                    break;
                    
                case "imu_gesture_subscribed":
                    // Gesture subscription confirmed
                    Log.d(TAG, "IMU gesture subscription confirmed: " + json.optJSONArray("gestures"));
                    break;
                    
                case "imu_ack":
                    // Command acknowledgment
                    Log.d(TAG, "IMU command acknowledged: " + json.optString("message"));
                    break;
                    
                case "imu_error":
                    // Error response
                    Log.e(TAG, "IMU error: " + json.optString("error"));
                    break;
                    
                default:
                    Log.w(TAG, "Unknown IMU response type: " + type);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error handling IMU response", e);
        }
    }

    private void handleSingleImuData(JSONObject json) {
        try {
            // Extract IMU data
            JSONArray accel = json.getJSONArray("accel");
            JSONArray gyro = json.getJSONArray("gyro");
            JSONArray mag = json.getJSONArray("mag");
            JSONArray quat = json.getJSONArray("quat");
            JSONArray euler = json.getJSONArray("euler");
            
            Log.d(TAG, String.format("IMU Single Reading - Accel: [%.2f, %.2f, %.2f], Euler: [%.1f°, %.1f°, %.1f°]",
                accel.getDouble(0), accel.getDouble(1), accel.getDouble(2),
                euler.getDouble(0), euler.getDouble(1), euler.getDouble(2)));
            
            // Post event for other components
            EventBus.getDefault().post(new ImuDataEvent(
                accel, gyro, mag, quat, euler, System.currentTimeMillis()
            ));
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing single IMU data", e);
        }
    }

    private void handleStreamImuData(JSONObject json) {
        try {
            JSONArray readings = json.getJSONArray("readings");
            
            for (int i = 0; i < readings.length(); i++) {
                JSONObject reading = readings.getJSONObject(i);
                handleSingleImuData(reading);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing stream IMU data", e);
        }
    }

    private void handleImuGesture(JSONObject json) {
        try {
            String gesture = json.getString("gesture");
            long timestamp = json.optLong("timestamp", System.currentTimeMillis());
            
            Log.d(TAG, "IMU Gesture detected: " + gesture);
            
            // Post event for other components
            EventBus.getDefault().post(new ImuGestureEvent(gesture, timestamp));
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing IMU gesture", e);
        }
    }

    /**
     * Send data directly to the glasses using the K900 protocol utility.
     * This method uses K900ProtocolUtils.packJsonToK900 to handle C-wrapping and protocol formatting.
     * Large messages are automatically chunked if they exceed the 400-byte threshold.
     *
     * @param data The string data to be sent to the glasses
     */
    public void sendDataToGlasses(String data, boolean wakeup) {
        if (data == null || data.isEmpty()) {
            Log.e(TAG, "Cannot send empty data to glasses");
            return;
        }

        try {
            // First check if the message needs chunking
            // Create a test C-wrapped version to check size
            JSONObject testWrapper = new JSONObject();
            testWrapper.put("C", data);
            if (wakeup) {
                testWrapper.put("W", 1);
            }
            String testWrappedJson = testWrapper.toString();
            
            // Check if chunking is needed
            if (MessageChunker.needsChunking(testWrappedJson)) {
                Log.d(TAG, "Message exceeds threshold, chunking required");
                
                // Extract message ID if present for ACK tracking
                long messageId = -1;
                try {
                    JSONObject originalJson = new JSONObject(data);
                    messageId = originalJson.optLong("mId", -1);
                } catch (JSONException e) {
                    // Not a JSON message or no mId, that's okay
                }
                
                // Create chunks
                List<JSONObject> chunks = MessageChunker.createChunks(data, messageId);
                Log.d(TAG, "Sending " + chunks.size() + " chunks");
                
                // Send each chunk
                for (int i = 0; i < chunks.size(); i++) {
                    JSONObject chunk = chunks.get(i);
                    String chunkStr = chunk.toString();
                    
                    // Pack each chunk using the normal K900 protocol
                    byte[] packedData = K900ProtocolUtils.packJsonToK900(chunkStr, wakeup && i == 0); // Only wakeup on first chunk
                    
                    // Queue the chunk for sending
                    queueData(packedData);
                    
                    // Add small delay between chunks to avoid overwhelming the connection
                    if (i < chunks.size() - 1) {
                        try {
                            Thread.sleep(50); // 50ms delay between chunks
                        } catch (InterruptedException e) {
                            Log.w(TAG, "Interrupted during chunk delay");
                        }
                    }
                }
                
                Log.d(TAG, "All chunks queued for transmission");
            } else {
                // Normal single message transmission
                Log.d(TAG, "Sending data to glasses: " + data);
                
                // Pack the data using the centralized utility
                byte[] packedData = K900ProtocolUtils.packJsonToK900(data, wakeup);
                
                // Queue the data for sending
                queueData(packedData);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error creating data JSON", e);
        }
    }

    public void sendStartVideoStream(){
        try {
            JSONObject command = new JSONObject();
            command.put("type", "start_video_stream");
            sendJson(command, true);
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }

    public void sendStopVideoStream(){
        try {
            JSONObject command = new JSONObject();
            command.put("type", "stop_video_stream");
            sendJson(command, true);
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Sends WiFi credentials to the smart glasses
     *
     * @param ssid The WiFi network name
     * @param password The WiFi password
     */
    @Override
    public void sendWifiCredentials(String ssid, String password) {
        Log.d(TAG, "432432 Sending WiFi credentials to glasses - SSID: " + ssid);

        // Validate inputs
        if (ssid == null || ssid.isEmpty()) {
            Log.e(TAG, "Cannot set WiFi credentials - SSID is empty");
            return;
        }

        try {
            // Send WiFi credentials to the ASG client
            JSONObject wifiCommand = new JSONObject();
            wifiCommand.put("type", "set_wifi_credentials");
            wifiCommand.put("ssid", ssid);
            wifiCommand.put("password", password != null ? password : "");
            sendJson(wifiCommand, true);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating WiFi credentials JSON", e);
        }
    }

    /**
     * Disconnect from WiFi on the glasses
     */
    @Override
    public void disconnectFromWifi() {
        Log.d(TAG, "📶 Sending WiFi disconnect command to glasses");

        try {
            // Send WiFi disconnect command to the ASG client
            JSONObject wifiCommand = new JSONObject();
            wifiCommand.put("type", "disconnect_wifi");
            sendJson(wifiCommand, true);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating WiFi disconnect JSON", e);
        }
    }

    @Override
    public void sendHotspotState(boolean enabled) {
        Log.d(TAG, "🔥 Sending hotspot state to glasses - enabled: " + enabled);
        try {
            // Send hotspot state command to the ASG client
            JSONObject hotspotCommand = new JSONObject();
            hotspotCommand.put("type", "set_hotspot_state");
            hotspotCommand.put("enabled", enabled);
            sendJson(hotspotCommand, true);
            Log.d(TAG, "🔥 ✅ Hotspot state command sent successfully");
        } catch (JSONException e) {
            Log.e(TAG, "🔥 💥 Error creating hotspot state JSON", e);
        }
    }

    @Override
    public void sendCustomCommand(String commandJson) {
        Log.d(TAG, "Received custom command: " + commandJson);

        try {
            JSONObject json = new JSONObject(commandJson);
            String type = json.optString("type", "");

            switch (type) {
                case "request_wifi_scan":
                    requestWifiScan();
                    break;
                default:
                    Log.w(TAG, "Unknown custom command type: " + type);
                    break;
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing custom command JSON", e);
        }
    }

    /**
     * Send a JSON object to the glasses without ACK tracking (for non-critical messages)
     */
    private void sendJsonWithoutAck(JSONObject json, boolean wakeup) {
        if (json != null) {
            String jsonStr = json.toString();
            Log.d(TAG, "📤 Sending JSON without ACK tracking: " + jsonStr);
            sendDataToGlasses(jsonStr, wakeup);
        } else {
            Log.d(TAG, "Cannot send JSON to ASG, JSON is null");
        }
    }

    private void sendJsonWithoutAck(JSONObject json){
        sendJsonWithoutAck(json, false);
    }

    /**
     * Get statistics about the message tracking system
     * @return String with tracking statistics
     */
    public String getMessageTrackingStats() {
        StringBuilder stats = new StringBuilder();
        stats.append("Message Tracking Stats:\n");
        stats.append("- Pending messages: ").append(pendingMessages.size()).append("\n");
        stats.append("- Next message ID: ").append(messageIdCounter.get()).append("\n");
        stats.append("- ACK timeout: ").append(ACK_TIMEOUT_MS).append("ms\n");
        stats.append("- Max retries: ").append(MAX_RETRY_ATTEMPTS).append("\n");

        if (!pendingMessages.isEmpty()) {
            stats.append("- Pending message IDs: ");
            for (Long messageId : pendingMessages.keySet()) {
                PendingMessage msg = pendingMessages.get(messageId);
                if (msg != null) {
                    stats.append(messageId).append("(retry:").append(msg.retryCount).append(") ");
                }
            }
        }

        return stats.toString();
    }

    //---------------------------------------
    // File Transfer Methods
    //---------------------------------------

    /**
     * Process a received file packet
     */
    private void processFilePacket(K900ProtocolUtils.FilePacketInfo packetInfo) {
        Log.d(TAG, "📦 Processing file packet: " + packetInfo.fileName +
              " [" + packetInfo.packIndex + "/" + ((packetInfo.fileSize + K900ProtocolUtils.FILE_PACK_SIZE - 1) / K900ProtocolUtils.FILE_PACK_SIZE - 1) + "]" +
              " (" + packetInfo.packSize + " bytes)");

        // Check if this is a BLE photo transfer we're tracking
        // The filename might have an extension (.avif or .jpg), but we track by ID only
        String bleImgId = packetInfo.fileName;
        int dotIndex = bleImgId.lastIndexOf('.');
        if (dotIndex > 0) {
            bleImgId = bleImgId.substring(0, dotIndex);
        }

        BlePhotoTransfer photoTransfer = blePhotoTransfers.get(bleImgId);
        if (photoTransfer != null) {
            // This is a BLE photo transfer
            Log.d(TAG, "📦 BLE photo transfer packet for requestId: " + photoTransfer.requestId);

            // Get or create session for this transfer
            if (photoTransfer.session == null) {
                photoTransfer.session = new FileTransferSession(packetInfo.fileName, packetInfo.fileSize);
                Log.d(TAG, "📦 Started BLE photo transfer: " + packetInfo.fileName +
                      " (" + packetInfo.fileSize + " bytes, " + photoTransfer.session.totalPackets + " packets)");
            }

            // Add packet to session
            boolean added = photoTransfer.session.addPacket(packetInfo.packIndex, packetInfo.data);

            // Check completion when final packet arrives or transfer is complete
            if (added && photoTransfer.session.shouldCheckCompletion(packetInfo.packIndex)) {
                if (photoTransfer.session.isComplete) {
                    // Transfer is complete - process successfully
                    long transferEndTime = System.currentTimeMillis();
                    long totalDuration = transferEndTime - photoTransfer.phoneStartTime;
                    long bleTransferDuration = photoTransfer.bleTransferStartTime > 0 ?
                        (transferEndTime - photoTransfer.bleTransferStartTime) : 0;

                    Log.d(TAG, "✅ BLE photo transfer complete: " + packetInfo.fileName);
                    Log.d(TAG, "⏱️ Total duration (request to complete): " + totalDuration + "ms");
                    Log.d(TAG, "⏱️ Glasses compression: " + photoTransfer.glassesCompressionDurationMs + "ms");
                    if (bleTransferDuration > 0) {
                        Log.d(TAG, "⏱️ BLE transfer duration: " + bleTransferDuration + "ms");
                        Log.d(TAG, "📊 Transfer rate: " + (packetInfo.fileSize * 1000 / bleTransferDuration) + " bytes/sec");
                    }

                    // Get complete image data (AVIF or JPEG)
                    byte[] imageData = photoTransfer.session.assembleFile();
                    if (imageData != null) {
                        // Process and upload the photo
                        processAndUploadBlePhoto(photoTransfer, imageData);
                    }

                    // Send completion confirmation to glasses
                    sendTransferCompleteConfirmation(packetInfo.fileName, true);

                    // Clean up - use the bleImgId without extension
                    blePhotoTransfers.remove(bleImgId);
                } else {
                    // Final packet received but transfer incomplete - request missing packets
                    List<Integer> missingPackets = photoTransfer.session.getMissingPackets();
                    Log.w(TAG, "📦 BLE photo transfer incomplete after final packet. Missing " + missingPackets.size() + " packets: " + missingPackets);
                    
                    // Request missing packets from glasses
                    requestMissingPackets(packetInfo.fileName, missingPackets);
                }
            }

            return; // Exit after handling BLE photo
        }

        // Regular file transfer (not a BLE photo)
        FileTransferSession session = activeFileTransfers.get(packetInfo.fileName);
        if (session == null) {
            // New file transfer
            session = new FileTransferSession(packetInfo.fileName, packetInfo.fileSize);
            activeFileTransfers.put(packetInfo.fileName, session);

            Log.d(TAG, "📦 Started new file transfer: " + packetInfo.fileName +
                  " (" + packetInfo.fileSize + " bytes, " + session.totalPackets + " packets)");
        }

            // Add packet to session
            boolean added = session.addPacket(packetInfo.packIndex, packetInfo.data);

            if (added) {
                // BES chip handles ACKs automatically
                Log.d(TAG, "📦 Packet " + packetInfo.packIndex + " received successfully (BES will auto-ACK)");

                // Check completion when final packet arrives or transfer is complete
                if (session.shouldCheckCompletion(packetInfo.packIndex)) {
                    if (session.isComplete) {
                        // Transfer is complete - process successfully
                        Log.d(TAG, "📦 File transfer complete: " + packetInfo.fileName);

                        // Assemble and save the file
                        byte[] fileData = session.assembleFile();
                        if (fileData != null) {
                            saveReceivedFile(packetInfo.fileName, fileData, packetInfo.fileType);
                        }

                        // Send completion confirmation to glasses
                        sendTransferCompleteConfirmation(packetInfo.fileName, true);

                        // Remove from active transfers
                        activeFileTransfers.remove(packetInfo.fileName);
                    } else {
                        // Final packet received but transfer incomplete - request missing packets
                        List<Integer> missingPackets = session.getMissingPackets();
                        Log.w(TAG, "📦 File transfer incomplete after final packet. Missing " + missingPackets.size() + " packets: " + missingPackets);
                        
                        // Request missing packets from glasses
                        requestMissingPackets(packetInfo.fileName, missingPackets);
                    }
                }
            } else {
                // Packet already received or invalid index
                Log.w(TAG, "📦 Duplicate or invalid packet: " + packetInfo.packIndex);
                // BES chip handles ACKs automatically
            }
    }

    /**
     * Request missing packets from glasses
     */
    private void requestMissingPackets(String fileName, List<Integer> missingPackets) {
        if (missingPackets.isEmpty()) {
            Log.d(TAG, "✅ No missing packets for " + fileName + " - should not have been called");
            return;
        }

        // ANY missing packets trigger a full restart (for now)
        // TODO: In future, implement selective packet retransmission instead of full restart
        Log.d(TAG, "🔍 Requesting full retransmission due to " + missingPackets.size() + " missing packets for " + fileName + ": " + missingPackets);
        
        try {
            // Send missing packets request to glasses
            JSONObject request = new JSONObject();
            request.put("type", "request_missing_packets");
            request.put("fileName", fileName);
            
            JSONArray missingArray = new JSONArray();
            for (Integer packetIndex : missingPackets) {
                missingArray.put(packetIndex);
            }
            request.put("missingPackets", missingArray);
            
            sendJson(request, true); // Wake up glasses for this request
            
        } catch (JSONException e) {
            Log.e(TAG, "Error creating missing packets request", e);
        }
    }
    
    /**
     * Send transfer completion confirmation to glasses
     */
    private void sendTransferCompleteConfirmation(String fileName, boolean success) {
        try {
            JSONObject confirmation = new JSONObject();
            confirmation.put("type", "transfer_complete");
            confirmation.put("fileName", fileName);
            confirmation.put("success", success);
            confirmation.put("timestamp", System.currentTimeMillis());
            
            Log.d(TAG, (success ? "✅" : "❌") + " Sending transfer completion confirmation for: " + fileName + " (success: " + success + ")");
            sendJson(confirmation, true);
            
        } catch (JSONException e) {
            Log.e(TAG, "Error creating transfer completion confirmation", e);
        }
    }

    /**
     * Save received file to storage
     */
    private void saveReceivedFile(String fileName, byte[] fileData, byte fileType) {
        try {
            // Get or create the directory for saving files
            File dir = new File(context.getExternalFilesDir(null), FILE_SAVE_DIR);
            if (!dir.exists()) {
                dir.mkdirs();
            }

            // Generate unique filename with timestamp
            SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US);
            String timestamp = sdf.format(new Date());

            // Determine file extension based on type
            String extension = "";
            switch (fileType) {
                case K900ProtocolUtils.CMD_TYPE_PHOTO:
                    // For photos, try to preserve the original extension
                    int photoExtIndex = fileName.lastIndexOf('.');
                    if (photoExtIndex > 0) {
                        extension = fileName.substring(photoExtIndex);
                    } else {
                        extension = ".jpg"; // Default to JPEG if no extension
                    }
                    break;
                case K900ProtocolUtils.CMD_TYPE_VIDEO:
                    extension = ".mp4";
                    break;
                case K900ProtocolUtils.CMD_TYPE_AUDIO:
                    extension = ".wav";
                    break;
                default:
                    // Try to get extension from original filename
                    int dotIndex = fileName.lastIndexOf('.');
                    if (dotIndex > 0) {
                        extension = fileName.substring(dotIndex);
                    }
                    break;
            }

            // Create unique filename
            String baseFileName = fileName;
            if (baseFileName.contains(".")) {
                baseFileName = baseFileName.substring(0, baseFileName.lastIndexOf('.'));
            }
            String uniqueFileName = baseFileName + "_" + timestamp + extension;

            // Save the file
            File file = new File(dir, uniqueFileName);
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(fileData);
                fos.flush();

                Log.d(TAG, "💾 Saved file: " + file.getAbsolutePath());

                // Notify about the received file
                notifyFileReceived(file.getAbsolutePath(), fileType);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error saving received file: " + fileName, e);
        }
    }

    /**
     * Notify listeners about received file
     */
    private void notifyFileReceived(String filePath, byte fileType) {
        // Create event based on file type
        JSONObject event = new JSONObject();
        try {
            event.put("type", "file_received");
            event.put("filePath", filePath);
            event.put("fileType", String.format("0x%02X", fileType));
            event.put("timestamp", System.currentTimeMillis());

            // Emit event through data observable
            if (dataObservable != null) {
                dataObservable.onNext(event);
            }

            // You could also post an EventBus event here if needed
            // EventBus.getDefault().post(new FileReceivedEvent(filePath, fileType));

        } catch (JSONException e) {
            Log.e(TAG, "Error creating file received event", e);
        }
    }

    /**
     * Process and upload a BLE photo transfer
     */
    private void processAndUploadBlePhoto(BlePhotoTransfer transfer, byte[] imageData) {
        Log.d(TAG, "Processing BLE photo for upload. RequestId: " + transfer.requestId);
        long uploadStartTime = System.currentTimeMillis();

        // Save BLE photo locally for debugging/backup
        try {
            File dir = new File(context.getExternalFilesDir(null), FILE_SAVE_DIR);
            if (!dir.exists()) {
                dir.mkdirs();
            }

            // BLE photos are ALWAYS AVIF format
            String fileName = "BLE_" + transfer.bleImgId + "_" + System.currentTimeMillis() + ".avif";
            File file = new File(dir, fileName);

            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(imageData);
                Log.d(TAG, "💾 Saved BLE photo locally: " + file.getAbsolutePath());
            }
        } catch (Exception e) {
            Log.e(TAG, "Error saving BLE photo locally", e);
        }

        // Get core token for authentication
        String coreToken = getCoreToken();

        // Use BlePhotoUploadService to handle decoding and upload
        BlePhotoUploadService.processAndUploadPhoto(
            imageData,
            transfer.requestId,
            transfer.webhookUrl,
            coreToken,
            new BlePhotoUploadService.UploadCallback() {
                @Override
                public void onSuccess(String requestId) {
                    long uploadDuration = System.currentTimeMillis() - uploadStartTime;
                    long totalDuration = System.currentTimeMillis() - transfer.phoneStartTime;

                    Log.d(TAG, "✅ BLE photo uploaded successfully via phone relay for requestId: " + requestId);
                    Log.d(TAG, "⏱️ Upload duration: " + uploadDuration + "ms");
                    Log.d(TAG, "⏱️ Total end-to-end duration: " + totalDuration + "ms");
                    //sendPhotoUploadSuccess(requestId);
                }

                @Override
                public void onError(String requestId, String error) {
                    long uploadDuration = System.currentTimeMillis() - uploadStartTime;
                    Log.e(TAG, "❌ BLE photo upload failed for requestId: " + requestId + ", error: " + error);
                    Log.e(TAG, "⏱️ Failed after: " + uploadDuration + "ms");
                    //sendPhotoUploadError(requestId, error);
                }
            }
        );
    }

    /**
     * Send photo upload success notification to glasses
     */
    private void sendPhotoUploadSuccess(String requestId) {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "photo_upload_result");
            json.put("requestId", requestId);
            json.put("success", true);

            sendJson(json, true);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo upload success message", e);
        }
    }

    /**
     * Send photo upload error notification to glasses
     */
    private void sendPhotoUploadError(String requestId, String error) {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "photo_upload_result");
            json.put("requestId", requestId);
            json.put("success", false);
            json.put("error", error);

            sendJson(json, true);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo upload error message", e);
        }
    }

    /**
     * Get the core authentication token
     */
    private String getCoreToken() {
        SharedPreferences prefs = context.getSharedPreferences(AUTH_PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_CORE_TOKEN, "");
    }


    /**
     * Send button mode setting to the smart glasses
     *
     * @param mode The button mode (photo, apps, both)
     */
    @Override
    public void sendButtonModeSetting(String mode) {
        Log.d(TAG, "Sending button mode setting to glasses: " + mode);

        if (!isConnected) {
            Log.w(TAG, "Cannot send button mode - not connected");
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("type", "button_mode_setting");
            json.put("mode", mode);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating button mode message", e);
        }
    }

    /**
     * Start buffer recording on glasses
     */
    @Override
    public void startBufferRecording() {
        Log.d(TAG, "Starting buffer recording on glasses");

        if (!isConnected) {
            Log.w(TAG, "Cannot start buffer recording - not connected");
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("type", "start_buffer_recording");
            sendJson(json, true); // Wake up glasses for this command
        } catch (JSONException e) {
            Log.e(TAG, "Error creating start buffer recording message", e);
        }
    }

    /**
     * Stop buffer recording on glasses
     */
    @Override
    public void stopBufferRecording() {
        Log.d(TAG, "Stopping buffer recording on glasses");

        if (!isConnected) {
            Log.w(TAG, "Cannot stop buffer recording - not connected");
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("type", "stop_buffer_recording");
            sendJson(json, true); // Wake up glasses for this command
        } catch (JSONException e) {
            Log.e(TAG, "Error creating stop buffer recording message", e);
        }
    }

    /**
     * Save buffer video from glasses
     */
    @Override
    public void saveBufferVideo(String requestId, int durationSeconds) {
        Log.d(TAG, "Saving buffer video: requestId=" + requestId + ", duration=" + durationSeconds + " seconds");

        if (!isConnected) {
            Log.w(TAG, "Cannot save buffer video - not connected");
            return;
        }

        // Validate duration
        if (durationSeconds < 1 || durationSeconds > 30) {
            Log.e(TAG, "Invalid duration: " + durationSeconds + " (must be 1-30 seconds)");
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("type", "save_buffer_video");
            json.put("requestId", requestId);
            json.put("duration", durationSeconds);
            sendJson(json, true); // Wake up glasses for this command
        } catch (JSONException e) {
            Log.e(TAG, "Error creating save buffer video message", e);
        }
    }

    /**
     * Send user settings to glasses after connection is established
     */
    private void sendUserSettings() {
        Log.d(TAG, "Sending user settings to glasses");

        // Send button mode setting
        String buttonMode = PreferenceManager.getDefaultSharedPreferences(context)
                .getString("button_press_mode", "photo");
        sendButtonModeSetting(buttonMode);
        
        // Send button video recording settings
        sendButtonVideoRecordingSettings();
        
        // Send button photo settings
        sendButtonPhotoSettings();
        
        // Send button camera LED setting
        sendButtonCameraLedSetting();
    }
    
    /**
     * Send button photo settings to glasses
     */
    public void sendButtonPhotoSettings() {
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        String size = prefs.getString("button_photo_size", "medium");
        
        Log.d(TAG, "Sending button photo setting: " + size);
        
        if (!isConnected) {
            Log.w(TAG, "Cannot send button photo settings - not connected");
            return;
        }
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "button_photo_setting");
            json.put("size", size);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating button photo settings message", e);
        }
    }

    /**
     * Send button camera LED setting to glasses
     */
    public void sendButtonCameraLedSetting() {
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        boolean enabled = prefs.getBoolean("button_camera_led", true);
        
        Log.d(TAG, "Sending button camera LED setting: " + enabled);
        
        if (!isConnected) {
            Log.w(TAG, "Cannot send button camera LED setting - not connected");
            return;
        }
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "button_camera_led");
            json.put("enabled", enabled);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating button camera LED settings message", e);
        }
    }
    
    @Override
    public void startVideoRecording(String requestId, boolean save) {
        startVideoRecording(requestId, save, 0, 0, 0); // Use defaults
    }
    
    /**
     * Start video recording with optional resolution settings
     * @param requestId Request ID for tracking
     * @param save Whether to save the video
     * @param width Video width (0 for default)
     * @param height Video height (0 for default)
     * @param fps Video frame rate (0 for default)
     */
    public void startVideoRecording(String requestId, boolean save, int width, int height, int fps) {
        Log.d(TAG, "Starting video recording: requestId=" + requestId + ", save=" + save + 
                   ", resolution=" + width + "x" + height + "@" + fps + "fps");
        
        if (!isConnected) {
            Log.w(TAG, "Cannot start video recording - not connected");
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("type", "start_video_recording");
            json.put("requestId", requestId);
            json.put("save", save);
            
            // Add video settings if provided
            if (width > 0 && height > 0) {
                JSONObject settings = new JSONObject();
                settings.put("width", width);
                settings.put("height", height);
                settings.put("fps", fps > 0 ? fps : 30);
                json.put("settings", settings);
            }
            
            sendJson(json, true); // Wake up glasses for this command
        } catch (JSONException e) {
            Log.e(TAG, "Failed to create start video recording command", e);
        }
    }

    @Override
    public void stopVideoRecording(String requestId) {
        Log.d(TAG, "Stopping video recording: requestId=" + requestId);

        if (!isConnected) {
            Log.w(TAG, "Cannot stop video recording - not connected");
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("type", "stop_video_recording");
            json.put("requestId", requestId);
            sendJson(json, true); // Wake up glasses for this command
        } catch (JSONException e) {
            Log.e(TAG, "Failed to create stop video recording command", e);
        }
    }

    /**
     * Process incoming LC3 audio packet from the glasses.
     * Packet Structure:
     * Byte 0: 0xF1 (Audio data identifier)
     * Byte 1: Sequence number (0-255)
     * Bytes 2-401: LC3 encoded audio data (400 bytes - 10 frames × 40 bytes per frame)
     */
    private void processLc3AudioPacket(byte[] data) {
        if (data == null || data.length < 2) {
            Log.w(TAG, "Invalid LC3 audio packet received: too short");
            return;
        }

        // Check for audio packet header
        if (data[0] == (byte) 0xF1) {
            byte sequenceNumber = data[1];
            long receiveTime = System.currentTimeMillis();
            
            // Basic sequence validation
            if (lastReceivedLc3Sequence != -1 && (byte)(lastReceivedLc3Sequence + 1) != sequenceNumber) {
                Log.w(TAG, "LC3 packet sequence mismatch. Expected: " + (lastReceivedLc3Sequence + 1) + ", Got: " + sequenceNumber);
            }
            lastReceivedLc3Sequence = sequenceNumber;

            byte[] lc3Data = Arrays.copyOfRange(data, 2, data.length);
            
            // Enhanced LC3 packet logging and saving
            logLc3PacketDetails(lc3Data, sequenceNumber, receiveTime);
            // saveLc3AudioPacket(lc3Data, sequenceNumber);
            
            // Log.d(TAG, "Received LC3 audio packet seq=" + sequenceNumber + ", size=" + lc3Data.length);

            // Decode LC3 to PCM and forward to audio processing system
            if (audioProcessingCallback != null) {
                if (lc3DecoderPtr != 0) {
                    // Decode LC3 to PCM using the native decoder with Mentra Live frame size
                    byte[] pcmData = L3cCpp.decodeLC3(lc3DecoderPtr, lc3Data, LC3_FRAME_SIZE);
                    
                    if (pcmData != null && pcmData.length > 0) {
                        // Forward PCM data to audio processing system (like Even Realities G1)
                        audioProcessingCallback.onAudioDataAvailable(pcmData);
                        // Log.d(TAG, "Decoded and forwarded LC3 to PCM: " + lc3Data.length + " -> " + pcmData.length + " bytes");
                    } else {
                        // Log.e(TAG, "Failed to decode LC3 data to PCM - got null or empty result");
                    }
                } else {
                    Log.e(TAG, "LC3 decoder not initialized - cannot decode to PCM");

                }
            } else {
                Log.w(TAG, "No audio processing callback registered - audio data will not be processed");
            }

            // Play LC3 audio directly through LC3 player if enabled
            if (audioPlaybackEnabled && lc3AudioPlayer != null) {
                // The data array already contains the full packet with F1 header and sequence
                // Just pass it directly to the LC3 player
                lc3AudioPlayer.write(data, 0, data.length);
                // Log.d(TAG, "Playing LC3 audio directly through LC3 player: " + data.length + " bytes");
            } else {
                Log.d(TAG, "Audio playback disabled - skipping LC3 audio output");
            }

        } else {
            Log.w(TAG, "Received non-audio packet on LC3 characteristic.");
        }
    }

    /**
     * Sends an LC3 audio packet to the glasses.
     * @param lc3Data The raw LC3 encoded audio data (e.g., 400 bytes - 10 frames × 40 bytes per frame).
     */
    public void sendLc3AudioPacket(byte[] lc3Data) {
        if (!supportsLC3Audio) {
            Log.w(TAG, "Cannot send LC3 audio packet - device does not support LC3 audio.");
            return;
        }
        if (lc3WriteCharacteristic == null) {
            Log.w(TAG, "Cannot send LC3 audio packet, characteristic not available.");
            return;
        }
        if (lc3Data == null || lc3Data.length == 0) {
            Log.w(TAG, "Cannot send empty LC3 data.");
            return;
        }

        // Packet Structure: Header (1) + Sequence (1) + Data (N)
        byte[] packet = new byte[lc3Data.length + 2];
        packet[0] = (byte) 0xF1; // Audio data identifier
        packet[1] = lc3SequenceNumber++; // Sequence number

        System.arraycopy(lc3Data, 0, packet, 2, lc3Data.length);

        // We use queueData to handle rate-limiting and sending
        queueData(packet);
    }

    /**
     * Initialize LC3 audio logging and file saving
     */
    private void initializeLc3Logging() {
        if (!LC3_LOGGING_ENABLED) {
            return;
        }

        try {
            // Create logs directory
            File logsDir = new File(context.getExternalFilesDir(null), LC3_LOG_DIR);
            Log.d(TAG, "🎯 Attempting to create LC3 logs directory: " + logsDir.getAbsolutePath());
            
            if (!logsDir.exists()) {
                boolean created = logsDir.mkdirs();
                if (created) {
                    Log.i(TAG, "✅ Successfully created LC3 logs directory: " + logsDir.getAbsolutePath());
                } else {
                    Log.e(TAG, "❌ Failed to create LC3 logs directory: " + logsDir.getAbsolutePath());
                    // Try to get more info about why it failed
                    File parentDir = logsDir.getParentFile();
                    if (parentDir != null) {
                        Log.e(TAG, "📁 Parent directory exists: " + parentDir.exists() + ", writable: " + parentDir.canWrite());
                    }
                    return; // Exit early if directory creation fails
                }
            } else {
                Log.i(TAG, "✅ LC3 logs directory already exists: " + logsDir.getAbsolutePath());
            }

            // Create new audio file with timestamp
            String timestamp = lc3TimestampFormat.format(new Date());
            currentLc3FileName = "lc3_audio_" + timestamp + ".raw";
            File audioFile = new File(logsDir, currentLc3FileName);
            
            lc3AudioFileStream = new FileOutputStream(audioFile);
            
            // Reset statistics
            totalLc3PacketsReceived = 0;
            totalLc3BytesReceived = 0;
            firstLc3PacketTime = System.currentTimeMillis();
            lastLc3PacketTime = firstLc3PacketTime;
            
            Log.i(TAG, "🎵 LC3 Audio logging initialized - File: " + currentLc3FileName);
            Log.i(TAG, "📁 LC3 logs directory: " + logsDir.getAbsolutePath());
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to initialize LC3 audio logging", e);
        }
    }

    /**
     * Save LC3 audio packet to file
     */
    private void saveLc3AudioPacket(byte[] lc3Data, byte sequenceNumber) {
        Log.d(TAG, "🎵 Saving LC3 audio packet to file: " + lc3Data.length + " bytes");
        if (!LC3_SAVING_ENABLED || lc3AudioFileStream == null) {
            Log.d(TAG, "🎵 LC3 audio saving disabled or file stream not initialized");
            return;
        }
        
        // Log the current file path for debugging
        if (currentLc3FileName != null) {
            File logsDir = new File(context.getExternalFilesDir(null), LC3_LOG_DIR);
            String fullPath = new File(logsDir, currentLc3FileName).getAbsolutePath();
            Log.i(TAG, "📁 LC3 Audio file path #####: " + fullPath);
        } else {
            Log.i(TAG, "📁 LC3 Audio file path for saving failed %%%%%%%: " + currentLc3FileName);
        }


        try {
            // Write packet header: [timestamp][sequence][length][data]
            long timestamp = System.currentTimeMillis();
            String timeStr = lc3PacketTimestampFormat.format(new Date(timestamp));
            
            // Write timestamp and metadata
            String header = String.format("[%s] SEQ:%d LEN:%d\n", timeStr, sequenceNumber, lc3Data.length);
            lc3AudioFileStream.write(header.getBytes(StandardCharsets.UTF_8));
            
            // Write raw LC3 data
            lc3AudioFileStream.write(lc3Data);
            lc3AudioFileStream.write('\n'); // Newline separator
            
            lc3AudioFileStream.flush();
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to save LC3 audio packet", e);
        }
    }

    /**
     * Log detailed LC3 packet information
     */
    private void logLc3PacketDetails(byte[] data, byte sequenceNumber, long receiveTime) {
        if (!LC3_LOGGING_ENABLED) {
            return;
        }

        // Update statistics
        totalLc3PacketsReceived++;
        totalLc3BytesReceived += data.length;
        lastLc3PacketTime = receiveTime;
        
        if (firstLc3PacketTime == 0) {
            firstLc3PacketTime = receiveTime;
        }

        // Calculate packet timing
        long timeSinceFirst = receiveTime - firstLc3PacketTime;
        long timeSinceLast = receiveTime - lastLc3PacketTime;
        
        // Log detailed packet information
        // Log.i(TAG, String.format("🎵 LC3 PACKET #%d RECEIVED:", sequenceNumber));
        // Log.i(TAG, String.format("   📊 Size: %d bytes", data.length));
        // Log.i(TAG, String.format("   ⏰ Time: %s", lc3PacketTimestampFormat.format(new Date(receiveTime))));
        // Log.i(TAG, String.format("   ⏱️  Since first: +%dms", timeSinceFirst));
        // Log.i(TAG, String.format("   ⏱️  Since last: +%dms", timeSinceLast));
        // Log.i(TAG, String.format("   📈 Total packets: %d", totalLc3PacketsReceived));
        // Log.i(TAG, String.format("   📈 Total bytes: %d", totalLc3BytesReceived));
        
        // Log first few bytes for debugging
        if (data.length > 0) {
            StringBuilder hexDump = new StringBuilder("   🔍 First 16 bytes: ");
            for (int i = 0; i < Math.min(16, data.length); i++) {
                hexDump.append(String.format("%02X ", data[i] & 0xFF));
            }
            // Log.d(TAG, hexDump.toString());
        }
        
        // Log packet statistics every 10 packets
        if (totalLc3PacketsReceived % 10 == 0) {
            long duration = lastLc3PacketTime - firstLc3PacketTime;
            double packetsPerSecond = duration > 0 ? (totalLc3PacketsReceived * 1000.0) / duration : 0;
            double bytesPerSecond = duration > 0 ? (totalLc3BytesReceived * 1000.0) / duration : 0;
            
            // Log.i(TAG, String.format("📊 LC3 STATS UPDATE:"));
            // Log.i(TAG, String.format("   🎯 Packets/sec: %.2f", packetsPerSecond));
            // Log.i(TAG, String.format("   🎯 Bytes/sec: %.2f", bytesPerSecond));
            // Log.i(TAG, String.format("   🎯 Average packet size: %.1f bytes", 
            //     totalLc3PacketsReceived > 0 ? (double) totalLc3BytesReceived / totalLc3PacketsReceived : 0));
        }
    }

    /**
     * Close LC3 audio logging and save final statistics
     */
    private void closeLc3Logging() {
        if (lc3AudioFileStream != null) {
            try {
                // Write final statistics to file
                if (totalLc3PacketsReceived > 0) {
                    long duration = lastLc3PacketTime - firstLc3PacketTime;
                    double packetsPerSecond = duration > 0 ? (totalLc3PacketsReceived * 1000.0) / duration : 0;
                    double bytesPerSecond = duration > 0 ? (totalLc3BytesReceived * 1000.0) / duration : 0;
                    
                    String stats = String.format("\n=== LC3 AUDIO SESSION STATISTICS ===\n");
                    stats += String.format("Total packets received: %d\n", totalLc3PacketsReceived);
                    stats += String.format("Total bytes received: %d\n", totalLc3BytesReceived);
                    stats += String.format("Session duration: %d ms\n", duration);
                    stats += String.format("Average packets/sec: %.2f\n", packetsPerSecond);
                    stats += String.format("Average bytes/sec: %.2f\n", bytesPerSecond);
                    stats += String.format("Average packet size: %.1f bytes\n", 
                        (double) totalLc3BytesReceived / totalLc3PacketsReceived);
                    stats += String.format("Session ended: %s\n", 
                        lc3TimestampFormat.format(new Date()));
                    stats += "==========================================\n";
                    
                    lc3AudioFileStream.write(stats.getBytes(StandardCharsets.UTF_8));
                }
                
                lc3AudioFileStream.close();
                lc3AudioFileStream = null;
                
                Log.i(TAG, "🎵 LC3 Audio logging closed - Final stats written to: " + currentLc3FileName);
                Log.i(TAG, String.format("📊 Final Statistics: %d packets, %d bytes, %.2f packets/sec", 
                    totalLc3PacketsReceived, totalLc3BytesReceived,
                    totalLc3PacketsReceived > 0 ? (totalLc3PacketsReceived * 1000.0) / (lastLc3PacketTime - firstLc3PacketTime) : 0));
                
            } catch (Exception e) {
                Log.e(TAG, "❌ Error closing LC3 audio logging", e);
            }
        }
    }

    /**
     * Public method to manually initialize LC3 logging (for testing/debugging)
     */
    public void manualInitializeLc3Logging() {
        Log.i(TAG, "🔧 Manual LC3 logging initialization requested");
        initializeLc3Logging();
    }

    /**
     * Get current LC3 logging statistics
     */
    public String getLc3LoggingStats() {
        if (totalLc3PacketsReceived == 0) {
            return "No LC3 packets received yet";
        }
        
        long duration = lastLc3PacketTime - firstLc3PacketTime;
        double packetsPerSecond = duration > 0 ? (totalLc3PacketsReceived * 1000.0) / duration : 0;
        double bytesPerSecond = duration > 0 ? (totalLc3BytesReceived * 1000.0) / duration : 0;
        
        return String.format("LC3 Stats: %d packets, %d bytes, %.2f packets/sec, %.2f bytes/sec, avg size: %.1f bytes",
            totalLc3PacketsReceived, totalLc3BytesReceived, packetsPerSecond, bytesPerSecond,
            (double) totalLc3BytesReceived / totalLc3PacketsReceived);
    }

    /**
     * Get the current LC3 log file path
     */
    public String getCurrentLc3LogFilePath() {
        if (currentLc3FileName == null) {
            return "No LC3 log file active";
        }
        File logsDir = new File(context.getExternalFilesDir(null), LC3_LOG_DIR);
                 return new File(logsDir, currentLc3FileName).getAbsolutePath();
     }
 
     /**
      * List all LC3 log files with their sizes
      */
     public String listAllLc3LogFiles() {
         try {
             File logsDir = new File(context.getExternalFilesDir(null), LC3_LOG_DIR);
             if (!logsDir.exists()) {
                 return "LC3 logs directory does not exist";
             }
             
             File[] files = logsDir.listFiles((dir, name) -> name.endsWith(".raw"));
             if (files == null || files.length == 0) {
                 return "No LC3 log files found";
             }
             
             StringBuilder result = new StringBuilder("LC3 Log Files:\n");
             for (File file : files) {
                 long sizeKB = file.length() / 1024;
                 result.append(String.format("  📄 %s (%d KB)\n", file.getName(), sizeKB));
             }
             return result.toString();
             
         } catch (Exception e) {
             return "Error listing LC3 log files: " + e.getMessage();
         }
     }
}