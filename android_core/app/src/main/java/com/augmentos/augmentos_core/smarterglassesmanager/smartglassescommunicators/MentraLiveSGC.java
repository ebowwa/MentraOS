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
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesWifiScanResultEvent;
//import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesBatteryEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesWifiStatusChange;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.KeepAliveAckEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.RtmpStreamStatusEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesVersionInfoEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.DownloadProgressEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.InstallationProgressEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.PairFailureEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.BlePhotoUploadService;

import org.greenrobot.eventbus.EventBus;
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

    // Glasses version information
    private String glassesAppVersion = "";
    private String glassesBuildNumber = "";
    private int glassesBuildNumberInt = 0; // Build number as integer for version checks
    private String glassesDeviceModel = "";
    private String glassesAndroidVersion = "";

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
        FileTransferSession session;
        long phoneStartTime;  // When phone received the request
        long bleTransferStartTime;  // When BLE transfer actually started
        long glassesCompressionDurationMs;  // How long glasses took to compress

        BlePhotoTransfer(String bleImgId, String requestId, String webhookUrl) {
            this.bleImgId = bleImgId;
            this.requestId = requestId;
            this.webhookUrl = webhookUrl;
            this.phoneStartTime = System.currentTimeMillis();
            this.bleTransferStartTime = 0;
            this.glassesCompressionDurationMs = 0;
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

        FileTransferSession(String fileName, int fileSize) {
            this.fileName = fileName;
            this.fileSize = fileSize;
            this.totalPackets = (fileSize + K900ProtocolUtils.FILE_PACK_SIZE - 1) / K900ProtocolUtils.FILE_PACK_SIZE;
            this.expectedNextPacket = 0;
            this.receivedPackets = new ConcurrentHashMap<>();
            this.startTime = System.currentTimeMillis();
            this.isComplete = false;
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

    // Message tracking for reliable delivery
    private final ConcurrentHashMap<Long, PendingMessage> pendingMessages = new ConcurrentHashMap<>();
    private final AtomicLong messageIdCounter = new AtomicLong(1);
    private static final long ACK_TIMEOUT_MS = 2000; // 2 seconds
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final long RETRY_DELAY_MS = 1000; // 1 second base delay

    // Esoteric message ID generation
    private final SecureRandom secureRandom = new SecureRandom();
    private final long deviceId = System.currentTimeMillis() ^ new Random().nextLong();

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

                    // Clean up GATT resources
                    if (bluetoothGatt != null) {
                        bluetoothGatt.close();
                        bluetoothGatt = null;
                    }

                    // Attempt reconnection
                    handleReconnection();
                }
            } else {
                // Connection error
                Log.e(TAG, "GATT connection error: " + status);
                isConnected = false;
                isConnecting = false;
                connectionEvent(SmartGlassesConnectionState.DISCONNECTED);

                // Stop heartbeat mechanism
                stopHeartbeat();

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

                    if (rxCharacteristic != null && txCharacteristic != null) {
                        // BLE connection established, but we still need to wait for glasses SOC
                        Log.d(TAG, "✅ Both TX and RX characteristics found - BLE connection ready");
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

            Log.d(TAG, "onCharacteristicChanged triggered for: " + uuid);

            boolean isRxCharacteristic = uuid.equals(RX_CHAR_UUID);
            boolean isTxCharacteristic = uuid.equals(TX_CHAR_UUID);

            if (isRxCharacteristic) {
                Log.d(TAG, "Received data on RX characteristic");
            } else if (isTxCharacteristic) {
                Log.d(TAG, "Received data on TX characteristic");
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

                    // Track the message for ACK
                    trackMessageForAck(messageId, jsonStr);

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

        // Schedule ACK timeout
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                checkMessageAck(messageId);
            }
        }, ACK_TIMEOUT_MS);

        Log.d(TAG, "📋 Tracking message " + messageId + " for ACK (timeout: " + ACK_TIMEOUT_MS + "ms)");
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
     * Process data received from the glasses
     */
    private void processReceivedData(byte[] data, int size) {
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
        Log.d(TAG, "Processing data packet, first " + Math.min(size, 16) + " bytes: " + hexData.toString());

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
        Log.d(TAG, "Command byte: 0x" + String.format("%02X", commandByte) + " (" + (int)(commandByte & 0xFF) + ")");

        // CRITICAL DEBUG: Try multiple ways to detect LC3 audio data
        boolean isLc3Audio = false;

        // Method 1: Check using switch case (what we were doing)
        if (commandByte == (byte)0xA0) {
            isLc3Audio = true;
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 1 (switch): MATCH");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 1 (switch): NO MATCH");
        }

        // Method 2: Check by comparing integer values
        int cmdByteInt = commandByte & 0xFF; // Convert signed byte to unsigned int
        if (cmdByteInt == 0xA0) {
            isLc3Audio = true;
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 2 (int compare): MATCH");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 2 (int compare): NO MATCH - Value: " + cmdByteInt);
        }

        // Method 3: Explicit check against -96 (0xA0 as signed byte)
        if (commandByte == -96) {
            isLc3Audio = true;
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 3 (signed byte): MATCH");
        } else {
            Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 DETECTION METHOD 3 (signed byte): NO MATCH - Value: " + (int)commandByte);
        }

        // Process based on detection results
        if (isLc3Audio) {
            Log.e(TAG, "Thread-" + threadId + ": ✅ DETECTED LC3 AUDIO PACKET!");

            // Report packet size vs. MTU diagnostic
            if (bluetoothGatt != null) {
                try {
                    int effectiveMtu = currentMtu - 3;
                    Log.e(TAG, "Thread-" + threadId + ": 📏 Packet size: " + size + " bytes, MTU limit: " + effectiveMtu + " bytes");

                    if (size > effectiveMtu) {
                        Log.e(TAG, "Thread-" + threadId + ": ⚠️ WARNING: Packet size exceeds MTU limit - may be truncated!");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Error getting MTU size: " + e.getMessage());
                }
            }

            if (size > 1) {
                // Extract the LC3 audio data (skip the command byte)
                byte[] lc3AudioData = Arrays.copyOfRange(data, 1, data.length);

                // Log callback status
                Log.e(TAG, "Thread-" + threadId + ": ⭐ Audio callback registered: " + (audioProcessingCallback != null ? "YES" : "NO"));

                // Forward to the audio processing system
                if (audioProcessingCallback != null) {
                    try {
                        Log.e(TAG, "Thread-" + threadId + ": ⏩ Forwarding LC3 audio data (" + lc3AudioData.length + " bytes) to processing system");
                        audioProcessingCallback.onLC3AudioDataAvailable(lc3AudioData);
                        Log.e(TAG, "Thread-" + threadId + ": ✅ LC3 audio data forwarded successfully");
                    } catch (Exception e) {
                        //Log.e(TAG, "Thread-" + threadId + ": ❌ EXCEPTION during audio data forwarding: " + e.getMessage(), e);
                    }
                } else {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Received LC3 audio data but no processing callback is registered");

                    // Fire a warning event that we're receiving audio but not processing it
                    // This will help the user understand why audio isn't working
                    handler.post(() -> {
                        Log.e(TAG, "Thread-" + threadId + ": 📢 Posting warning about missing audio callback");
                        // TODO: Consider adding a specific event for missing audio callback
                    });
                }
            } else {
                Log.e(TAG, "Thread-" + threadId + ": ⚠️ Received audio packet with no data");
            }
        } else {
            // Not LC3 audio, continue with regular switch statement
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
                // Unknown packet type
                Log.w(TAG, "Received unknown packet type: " + String.format("0x%02X", commandByte));
                if (size > 10) {
                    Log.d(TAG, "First 10 bytes: " + bytesToHex(Arrays.copyOfRange(data, 0, 10)));
                } else {
                    Log.d(TAG, "Data: " + bytesToHex(data));
                }
                break;
            }
        }
    }

    /**
     * Process a JSON message
     */
    private void processJsonMessage(JSONObject json) {
        Log.d(TAG, "Got some JSON from glasses: " + json.toString());

        // Check if this is an ACK response
        String type = json.optString("type", "");
        if ("msg_ack".equals(type)) {
            long messageId = json.optLong("mId", -1);
            if (messageId != -1) {
                processAckResponse(messageId);
                return;
            }
        }

        // Check if this is a K900 command format (has "C" field instead of "type")
        if (json.has("C")) {
            processK900JsonMessage(json);
            return;
        }

        switch (type) {
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

                // Send completion notification back to glasses
                if (bleSuccess) {
                    sendBleTransferComplete(bleRequestId, bleBleImgId, true);
                } else {
                    Log.e(TAG, "BLE photo transfer failed for requestId: " + bleRequestId);
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

                // Send user settings to glasses
                sendUserSettings();

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
    public void connectToSmartGlasses() {
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
        Log.d(TAG, "Changing microphone state to: " + enable);

        try {
            JSONObject json = new JSONObject();
            json.put("type", "set_mic_state");
            json.put("enabled", enable);
            sendJson(json, false);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating microphone command", e);
        }
    }

    @Override
    public void requestPhoto(String requestId, String appId, String webhookUrl, String size) {
        Log.d(TAG, "Requesting photo: " + requestId + " for app: " + appId + " with webhookUrl: " + webhookUrl + ", size=" + size);

        try {
            JSONObject json = new JSONObject();
            json.put("type", "take_photo");
            json.put("requestId", requestId);
            json.put("appId", appId);
            if (webhookUrl != null && !webhookUrl.isEmpty()) {
                json.put("webhookUrl", webhookUrl);
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
                // Store the transfer info for BLE route
                blePhotoTransfers.put(bleImgId, new BlePhotoTransfer(bleImgId, requestId, webhookUrl));
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

        // Cancel connection timeout
        if (connectionTimeoutRunnable != null) {
            connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
        }

        // Cancel any pending handlers
        handler.removeCallbacksAndMessages(null);
        heartbeatHandler.removeCallbacksAndMessages(null);
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
    }

    // Display methods - all stub implementations since Mentra Live has no display

    @Override
    public void setFontSize(SmartGlassesFontSize fontSize) {
        Log.d(TAG, "[STUB] Device has no display. Cannot set font size: " + fontSize);
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
        Log.d(TAG, "[STUB] Device has no display. Scrolling text view would stop");
    }

    public void requestReadyK900(){
        try{
            JSONObject cmdObject = new JSONObject();
            cmdObject.put("C", "cs_hrt"); // Video command
            cmdObject.put("B", "");     // Add the body
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


    /**
     * Send data directly to the glasses using the K900 protocol utility.
     * This method uses K900ProtocolUtils.packJsonToK900 to handle C-wrapping and protocol formatting.
     *
     * @param data The string data to be sent to the glasses
     */
    public void sendDataToGlasses(String data, boolean wakeup) {
        if (data == null || data.isEmpty()) {
            Log.e(TAG, "Cannot send empty data to glasses");
            return;
        }

        try {
            // Use K900ProtocolUtils to handle C-wrapping and protocol formatting
            Log.d(TAG, "Sending data to glasses: " + data);

            // Pack the data using the centralized utility
            byte[] packedData = K900ProtocolUtils.packJsonToK900(data, wakeup);

            // Queue the data for sending
            queueData(packedData);

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

            if (added && photoTransfer.session.isComplete) {
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

                // Clean up - use the bleImgId without extension
                blePhotoTransfers.remove(bleImgId);
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

            // Check if transfer is complete
            if (session.isComplete) {
                Log.d(TAG, "📦 File transfer complete: " + packetInfo.fileName);

                // Assemble and save the file
                byte[] fileData = session.assembleFile();
                if (fileData != null) {
                    saveReceivedFile(packetInfo.fileName, fileData, packetInfo.fileType);
                }

                // Remove from active transfers
                activeFileTransfers.remove(packetInfo.fileName);
            }
        } else {
            // Packet already received or invalid index
            Log.w(TAG, "📦 Duplicate or invalid packet: " + packetInfo.packIndex);
            // BES chip handles ACKs automatically
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
     * Send BLE transfer completion notification
     */
    private void sendBleTransferComplete(String requestId, String bleImgId, boolean success) {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "ble_photo_transfer_complete");
            json.put("requestId", requestId);
            json.put("bleImgId", bleImgId);
            json.put("success", success);

            sendJson(json, true);
            Log.d(TAG, "Sent BLE transfer complete notification: " + json.toString());
        } catch (JSONException e) {
            Log.e(TAG, "Error creating BLE transfer complete message", e);
        }
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
    }

    @Override
    public void startVideoRecording(String requestId, boolean save) {
        Log.d(TAG, "Starting video recording: requestId=" + requestId + ", save=" + save);

        if (!isConnected) {
            Log.w(TAG, "Cannot start video recording - not connected");
            return;
        }

        try {
            JSONObject json = new JSONObject();
            json.put("type", "start_video_recording");
            json.put("requestId", requestId);
            json.put("save", save);
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
}