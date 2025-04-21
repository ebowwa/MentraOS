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
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BatteryLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
//import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.SmartGlassesBatteryEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesNeedWifiCredentialsEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;

import org.greenrobot.eventbus.EventBus;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

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
    
    // Reconnection parameters
    private static final int BASE_RECONNECT_DELAY_MS = 1000; // Start with 1 second
    private static final int MAX_RECONNECT_DELAY_MS = 30000; // Max 30 seconds
    private static final int MAX_RECONNECT_ATTEMPTS = 10;
    private int reconnectAttempts = 0;
    
    // Keep-alive parameters
    private static final int KEEP_ALIVE_INTERVAL_MS = 5000; // 5 seconds
    private static final int CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
    
    // Device settings
    public static final String PREFS_NAME = "MentraLivePrefs";
    public static final String PREF_DEVICE_NAME = "LastConnectedDeviceName"; // Store device NAME, not address, since address rotates
    
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
    // Use a dedicated background thread for BLE operations
    private HandlerThread bleThread = new HandlerThread("BLEThread");
    private Handler handler;
    private ScheduledExecutorService scheduler;
    private boolean isScanning = false;
    private boolean isConnecting = false;
    private boolean isKilled = false;
    private ConcurrentLinkedQueue<byte[]> sendQueue = new ConcurrentLinkedQueue<>();
    private Runnable connectionTimeoutRunnable;
    // Also use the background thread for connection timeout handling
    private Handler connectionTimeoutHandler;
    private Runnable processSendQueueRunnable;
    // Current MTU size
    private int currentMtu = 23; // Default BLE MTU
    
    // Battery state tracking
    private int batteryLevel = 50; // Default until we get actual value
    private boolean isCharging = false;
    private boolean isConnected = false;
    
    // WiFi state tracking
    private boolean isWifiConnected = false;
    private String wifiSsid = "";
    
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
        
        // Start the BLE thread and create handlers
        bleThread.start();
        handler = new Handler(bleThread.getLooper());
        connectionTimeoutHandler = new Handler(bleThread.getLooper());
        
        // Initialize connection state
        mConnectState = SmartGlassesConnectionState.DISCONNECTED;
        
        // Initialize the send queue processor
        processSendQueueRunnable = new Runnable() {
            @Override
            public void run() {
                processSendQueue();
                // Schedule next check
                if (isConnected) {
                    handler.postDelayed(this, 100); // Process queue every 100ms
                }
            }
        };
        
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
            EventBus.getDefault().post(new GlassesBluetoothSearchStopEvent(smartGlassesDevice.deviceModelName));
        } catch (Exception e) {
            Log.e(TAG, "Error stopping BLE scan", e);
        }
    }
    
    /**
     * BLE Scan callback
     */
    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result.getDevice() == null || result.getDevice().getName() == null) {
                return;
            }
            
            String deviceName = result.getDevice().getName();
            String deviceAddress = result.getDevice().getAddress();
            
            Log.d(TAG, "Found BLE device: " + deviceName + " (" + deviceAddress + ")");
            
            // Since StandardBluetoothManager addresses rotate, we look for the name pattern instead
            if (deviceName.startsWith("Xy_A")) { // Pattern for standard glasses
                String glassType = "Standard";
                Log.d(TAG, "Found compatible " + glassType + " glasses device: " + deviceAddress);
                
                // Post the discovered device to the event bus
                EventBus.getDefault().post(new GlassesBluetoothSearchDiscoverEvent(
                        smartGlassesDevice.deviceModelName, deviceName));
                
                // Save this device NAME (not address) for potential future use
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit().putString(PREF_DEVICE_NAME, deviceName).apply();
                Log.d(TAG, "Saved device name for future reference: " + deviceName);
                
                // Connect immediately since this is the device we're looking for
                stopScan();
                connectToDevice(result.getDevice());
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
     * Try to reconnect to the last known device
     */
    private void reconnectToLastKnownDevice() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String lastDeviceAddress = prefs.getString(PREF_DEVICE_NAME, null);
        
        if (lastDeviceAddress != null && bluetoothAdapter != null) {
            Log.d(TAG, "Attempting to reconnect to last known device: " + lastDeviceAddress);
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
            // No last device to connect to, start scanning
            Log.d(TAG, "No last known device, starting scan");
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
                    // For reconnection, we need to start scanning again
                    // since the device address likely changed due to rotation
                    Log.d(TAG, "Reconnection attempt " + reconnectAttempts + " - starting scan to find glasses");
                    startScan();
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
                    
                    // Save the connected device NAME for future reference
                    if (connectedDevice != null && connectedDevice.getName() != null) {
                        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                        prefs.edit().putString(PREF_DEVICE_NAME, connectedDevice.getName()).apply();
                        Log.d(TAG, "Saved connected device name: " + connectedDevice.getName());
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
                    connectionEvent(SmartGlassesConnectionState.DISCONNECTED);
                    
                    // Stop keep-alive and queue processing
                    stopKeepAlive();
                    handler.removeCallbacks(processSendQueueRunnable);
                    
                    // Stop the readiness check loop
                    stopReadinessCheckLoop();
                    
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
                
                // Log all available services and characteristics for debugging
                Log.d(TAG, "🔍 Discovered Services:");
                for (BluetoothGattService svc : gatt.getServices()) {
                    Log.d(TAG, "  - Service: " + svc.getUuid());
                    for (BluetoothGattCharacteristic chr : svc.getCharacteristics()) {
                        int props = chr.getProperties();
                        String propStr = "";
                        if ((props & BluetoothGattCharacteristic.PROPERTY_READ) != 0) propStr += "READ ";
                        if ((props & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) propStr += "WRITE ";
                        if ((props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) propStr += "WRITE_NO_RESP ";
                        if ((props & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) propStr += "NOTIFY ";
                        if ((props & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0) propStr += "INDICATE ";
                        
                        Log.d(TAG, "    - Characteristic: " + chr.getUuid() + 
                              " (Props: " + propStr + ")");
                    }
                }
                
                // Find our service and characteristics
                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                if (service != null) {
                    // Get our characteristics by UUID
                    txCharacteristic = service.getCharacteristic(TX_CHAR_UUID);
                    rxCharacteristic = service.getCharacteristic(RX_CHAR_UUID);
                    
                    Log.d(TAG, "🔍 Our service found, checking characteristics:");
                    Log.d(TAG, "  - Looking for TX characteristic: " + TX_CHAR_UUID);
                    Log.d(TAG, "  - Looking for RX characteristic: " + RX_CHAR_UUID);
                    
                    if (txCharacteristic != null) {
                        int txProps = txCharacteristic.getProperties();
                        Log.d(TAG, "  - TX characteristic found with properties: " + txProps + 
                              " (WRITE=" + ((txProps & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) + 
                              ", WRITE_NO_RESP=" + ((txProps & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) + 
                              ", READ=" + ((txProps & BluetoothGattCharacteristic.PROPERTY_READ) != 0) + 
                              ", NOTIFY=" + ((txProps & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) + ")");
                    } else {
                        Log.e(TAG, "  - TX characteristic NOT found!");
                    }
                    
                    if (rxCharacteristic != null) {
                        int rxProps = rxCharacteristic.getProperties();
                        Log.d(TAG, "  - RX characteristic found with properties: " + rxProps + 
                              " (WRITE=" + ((rxProps & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) + 
                              ", WRITE_NO_RESP=" + ((rxProps & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) + 
                              ", READ=" + ((rxProps & BluetoothGattCharacteristic.PROPERTY_READ) != 0) + 
                              ", NOTIFY=" + ((rxProps & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) + ")");
                    } else {
                        Log.e(TAG, "  - RX characteristic NOT found!");
                    }
                    
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
                        
                        // Start keep-alive mechanism
                        startKeepAlive();

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
                    
                    // Try to find any service that MIGHT have our characteristics as a fallback
                    boolean foundAlternative = false;
                    Log.d(TAG, "🔍 Attempting to find alternative service with our characteristics...");
                    
                    for (BluetoothGattService svc : gatt.getServices()) {
                        BluetoothGattCharacteristic potentialTx = null;
                        BluetoothGattCharacteristic potentialRx = null;
                        
                        for (BluetoothGattCharacteristic chr : svc.getCharacteristics()) {
                            if (TX_CHAR_UUID.equals(chr.getUuid())) {
                                potentialTx = chr;
                                Log.d(TAG, "🔍 Found TX characteristic in alternative service: " + svc.getUuid());
                            } else if (RX_CHAR_UUID.equals(chr.getUuid())) {
                                potentialRx = chr;
                                Log.d(TAG, "🔍 Found RX characteristic in alternative service: " + svc.getUuid());
                            }
                        }
                        
                        if (potentialTx != null && potentialRx != null) {
                            // Found alternative service with our characteristics
                            txCharacteristic = potentialTx;
                            rxCharacteristic = potentialRx;
                            foundAlternative = true;
                            Log.d(TAG, "✅ Found alternative service with both characteristics: " + svc.getUuid());
                            break;
                        }
                    }
                    
                    if (!foundAlternative) {
                        gatt.disconnect();
                    } else {
                        // Continue with the alternative service
                        // Keep the state as CONNECTING until the glasses SOC responds
                        connectionEvent(SmartGlassesConnectionState.CONNECTING);
                        
                        // Request MTU size
                        if (checkPermission()) {
                            boolean mtuRequested = gatt.requestMtu(512);
                            Log.d(TAG, "🔄 Requested MTU size 512, success: " + mtuRequested);
                        }
                        
                        // Enable notifications
                        enableNotifications();
                        
                        // Start queue processing for sending data
                        handler.post(processSendQueueRunnable);
                        
                        // Start keep-alive mechanism
                        startKeepAlive();
                        
                        openhotspot(); //TODO: REMOVE AFTER DONE DEVELOPING
                        // Start SOC readiness check loop
                        startReadinessCheckLoop();
                    }
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
                Log.d(TAG, "Characteristic write successful");
                // Continue processing the send queue if we have more items
                handler.post(processSendQueueRunnable);
            } else {
                Log.e(TAG, "Characteristic write failed with status: " + status);
                // If write fails, try again later
                handler.postDelayed(processSendQueueRunnable, 500);
            }
        }
        
        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            // Get thread ID for tracking thread issues
            long threadId = Thread.currentThread().getId();
            UUID uuid = characteristic.getUuid();
            
            Log.e(TAG, "Thread-" + threadId + ": 🎉 onCharacteristicChanged CALLBACK TRIGGERED! Characteristic: " + uuid);
            Log.e(TAG, "Thread-" + threadId + ": 📝 OUR RX_CHAR_UUID: " + RX_CHAR_UUID);
            Log.e(TAG, "Thread-" + threadId + ": 📝 OUR TX_CHAR_UUID: " + TX_CHAR_UUID);
            
            // Process data from ANY characteristic that sends notifications
            // This way we'll catch data even if it's coming on an unexpected characteristic
            boolean isRxCharacteristic = uuid.equals(RX_CHAR_UUID);
            boolean isTxCharacteristic = uuid.equals(TX_CHAR_UUID);
            
            if (isRxCharacteristic) {
                Log.e(TAG, "Thread-" + threadId + ": 🎯 RECEIVED DATA ON RX CHARACTERISTIC (Peripheral's TX = 71FF)");
            } else if (isTxCharacteristic) {
                Log.e(TAG, "Thread-" + threadId + ": 🎯 RECEIVED DATA ON TX CHARACTERISTIC (Peripheral's RX = 70FF)");
            } else {
                Log.e(TAG, "Thread-" + threadId + ": 🎯 RECEIVED DATA ON UNKNOWN CHARACTERISTIC: " + uuid);
            }
            
            // Process ALL data regardless of which characteristic it came from
            {
                Log.e(TAG, "Thread-" + threadId + ": 🔍 Processing received data");
                byte[] data = characteristic.getValue();
                
                // Convert first few bytes to hex for better viewing
                StringBuilder hexDump = new StringBuilder();
                for (int i = 0; i < Math.min(data.length, 40); i++) {
                    hexDump.append(String.format("%02X ", data[i]));
                }
                Log.e(TAG, "Thread-" + threadId + ": 🔍 First 40 bytes: " + hexDump);
                Log.e(TAG, "Thread-" + threadId + ": 🔍 Total data length: " + data.length + " bytes");
                
                // NEW: Try to interpret as a string if the data looks like text
                try {
                    if (data.length > 0 && data[0] == '{') {
                        String textData = new String(data, StandardCharsets.UTF_8);
                        Log.e(TAG, "Thread-" + threadId + ": 📥 RECEIVED TEXT DATA: " + textData);
                        
                        // Try to parse as JSON
                        try {
                            JSONObject json = new JSONObject(textData);
                            Log.e(TAG, "Thread-" + threadId + ": 📥 PARSED JSON: type=" + 
                                  json.optString("type", "unknown"));
                            
                            // Send a reply to test bidirectional communication
                            if (json.optString("type", "").equals("test_message")) {
                                Log.e(TAG, "Thread-" + threadId + ": 📤 SENDING REPLY TO TEST MESSAGE");
                                JSONObject reply = new JSONObject();
                                reply.put("type", "test_reply");
                                reply.put("message", "Hello from central device!");
                                sendJson(reply);
                            }
                        } catch (JSONException e) {
                            Log.e(TAG, "Thread-" + threadId + ": ❌ Not valid JSON: " + e.getMessage());
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Error processing text data: " + e.getMessage());
                }
                
                if (data != null && data.length > 0) {
                    // Critical debugging for LC3 audio issue - dump ALL received data
                    
                    // Check for LC3 audio data multiple ways
                    boolean isLc3Command = false;
                    
                    // Method 1: Exact byte comparison
                    boolean method1 = data[0] == (byte)0xA0;
                    
                    // Method 2: Unsigned integer comparison
                    boolean method2 = (data[0] & 0xFF) == 0xA0;
                    
                    // Method 3: Comparison with signed value equivalent
                    boolean method3 = data[0] == -96; // 0xA0 as signed byte is -96 decimal
                    
                    // Combined result
                    isLc3Command = method1 || method2 || method3;
                    
//                    Log.e(TAG, "Thread-" + threadId + ": 🎤 BLE PACKET RECEIVED - " + data.length + " bytes");
//                    Log.e(TAG, "Thread-" + threadId + ": 🔍 LC3 Detection - Method1: " + method1 + ", Method2: " + method2 + ", Method3: " + method3);
//                    Log.e(TAG, "Thread-" + threadId + ": 🔍 Command byte: 0x" + String.format("%02X", data[0]) + " (" + (int)(data[0] & 0xFF) + ")");
//                    Log.e(TAG, "Thread-" + threadId + ": 🔍 First 32 bytes: " + hexDump);
                    
                    // Log MTU information with packet
                    int mtuSize = -1;
                    if (gatt != null) {
                        try {
                            // Calculate effective MTU (current MTU - 3 bytes BLE overhead)
                            int effectiveMtu = currentMtu - 3;
                            //Log.e(TAG, "Thread-" + threadId + ": 📏 Packet size: " + data.length + " bytes, MTU limit: " + effectiveMtu + " bytes");
                            
                            if (data.length > effectiveMtu) {
                                Log.e(TAG, "Thread-" + threadId + ": ⚠️ WARNING: Packet size exceeds MTU limit - may be truncated!");
                            }
                        } catch (Exception e) {
                            Log.e(TAG, "Thread-" + threadId + ": ❌ Error getting MTU size: " + e.getMessage());
                        }
                    }
                    
                    // Check if this looks like LC3 audio data based on combined detection
                    if (isLc3Command && data.length >= 20) {
                        //Log.e(TAG, "Thread-" + threadId + ": 🎵 LC3 AUDIO PACKET CONFIRMED! Length: " + data.length + " bytes");
                        
                        // Additional debugging: Check LC3 packet structure
                        if (data.length > 2) {
                            int packetLength = data.length;
                            //Log.e(TAG, "Thread-" + threadId + ": 📦 LC3 packet structure analysis:");
                            //Log.e(TAG, "Thread-" + threadId + ": 📦 Command: 0x" + String.format("%02X", data[0]));
                            
                            if (packetLength >= 60) {
                                //Log.e(TAG, "Thread-" + threadId + ": ✅ LC3 packet size looks good for audio data");
                            } else {
                                Log.e(TAG, "Thread-" + threadId + ": ⚠️ LC3 packet size may be truncated");
                                if (mtuSize > 0 && packetLength >= mtuSize) {
                                    Log.e(TAG, "Thread-" + threadId + ": ❌ Packet size matches MTU limit - likely truncated!");
                                }
                            }
                            
                            // Check if audioProcessingCallback is registered
                            //Log.e(TAG, "Thread-" + threadId + ": ⭐ Audio callback registered: " + (audioProcessingCallback != null ? "YES" : "NO"));
                        }
                    }
                    
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
     * Enable notifications for both RX and TX characteristics
     * This ensures we receive data regardless of which characteristic the peripheral uses to send notifications
     */
    private void enableNotifications() {
        long threadId = Thread.currentThread().getId();
        Log.d(TAG, "Thread-" + threadId + ": 🔵 enableNotifications() called");
        
        if (bluetoothGatt == null) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Cannot enable notifications - bluetoothGatt is null");
            return;
        }
        
        if (!hasPermissions()) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ Cannot enable notifications - missing permissions");
            return;
        }
        
        // Use the characteristics we already discovered and stored
        if (rxCharacteristic == null) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ RX characteristic not available");
        } else {
            Log.d(TAG, "Thread-" + threadId + ": ✅ Using existing RX characteristic: " + rxCharacteristic.getUuid());
        }
        
        if (txCharacteristic == null) {
            Log.e(TAG, "Thread-" + threadId + ": ❌ TX characteristic not available");
        } else {
            Log.d(TAG, "Thread-" + threadId + ": ✅ Using existing TX characteristic: " + txCharacteristic.getUuid());
        }
        
        // SUBSCRIBE TO BOTH CHARACTERISTICS FOR MAXIMUM COMPATIBILITY
        
        // 1. First enable notifications for the RX characteristic (peripheral's TX - 70FF)
        if (rxCharacteristic != null) {
            int properties = rxCharacteristic.getProperties();
            boolean hasNotify = (properties & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0;
            boolean hasIndicate = (properties & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0;
            boolean hasRead = (properties & BluetoothGattCharacteristic.PROPERTY_READ) != 0;
            
            Log.d(TAG, "Thread-" + threadId + ": 🔍 RX characteristic properties - READ: " + hasRead + 
                  ", NOTIFY: " + hasNotify + ", INDICATE: " + hasIndicate);
            
            try {
                // Always enable local notifications anyway - will fail silently if not supported
                boolean success = bluetoothGatt.setCharacteristicNotification(rxCharacteristic, true);
                Log.d(TAG, "Thread-" + threadId + ": 📱 Set local notification for RX characteristic: " + success);
                
                // Check for the notification/indication properties
                if (hasNotify || hasIndicate) {
                    // Write to descriptor to enable remote notifications
                    BluetoothGattDescriptor descriptor = rxCharacteristic.getDescriptor(
                        CLIENT_CHARACTERISTIC_CONFIG_UUID);
                    
                    if (descriptor != null) {
                        byte[] value = hasNotify ? 
                            BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE : 
                            BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
                        
                        descriptor.setValue(value);
                        boolean writeSuccess = bluetoothGatt.writeDescriptor(descriptor);
                        Log.d(TAG, "Thread-" + threadId + ": 📱 Write descriptor for RX characteristic: " + writeSuccess);
                    } else {
                        Log.e(TAG, "Thread-" + threadId + ": ⚠️ No notification descriptor found for RX characteristic");
                        
                        // Try the alternative approach - look for a descriptor that might work
                        for (BluetoothGattDescriptor desc : rxCharacteristic.getDescriptors()) {
                            Log.d(TAG, "Thread-" + threadId + ": 🔍 Found descriptor: " + desc.getUuid());
                            
                            // Try to enable notifications on this descriptor
                            try {
                                byte[] value = hasNotify ? 
                                    BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE : 
                                    BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
                                
                                desc.setValue(value);
                                boolean alternativeSuccess = bluetoothGatt.writeDescriptor(desc);
                                Log.d(TAG, "Thread-" + threadId + ": 📱 Write alternative descriptor: " + alternativeSuccess);
                                
                                // Only try one descriptor
                                break;
                            } catch (Exception e) {
                                Log.e(TAG, "Thread-" + threadId + ": ❌ Error writing to alternative descriptor: " + e.getMessage());
                            }
                        }
                    }
                } else {
                    Log.d(TAG, "Thread-" + threadId + ": ⚠️ RX characteristic does not support notifications or indications");
                    
                    // If notification is not supported, but READ is supported, we'll use polling
                    if (hasRead) {
                        Log.d(TAG, "Thread-" + threadId + ": 🔄 READ is supported - will use polling as fallback");
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Thread-" + threadId + ": ❌ Exception enabling notifications for RX characteristic: " + e.getMessage());
            }
        }
        
        // 2. Now also enable notifications for the TX characteristic (peripheral's RX - 71FF)
        if (txCharacteristic != null) {
            // Check TX characteristic properties for notification capability
            int txProperties = txCharacteristic.getProperties();
            boolean hasWrite = (txProperties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
            boolean hasWriteNoResponse = (txProperties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
            boolean hasTxNotify = (txProperties & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0;
            boolean hasTxIndicate = (txProperties & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0;
            boolean hasTxRead = (txProperties & BluetoothGattCharacteristic.PROPERTY_READ) != 0;
            
            Log.d(TAG, "Thread-" + threadId + ": 🔍 TX characteristic properties - WRITE: " + hasWrite + 
                  ", WRITE_NO_RESPONSE: " + hasWriteNoResponse +
                  ", READ: " + hasTxRead +
                  ", NOTIFY: " + hasTxNotify +
                  ", INDICATE: " + hasTxIndicate);
            
            // Check write capabilities first
            if (!hasWrite && !hasWriteNoResponse) {
                Log.e(TAG, "Thread-" + threadId + ": ⚠️ TX characteristic does not support any write operations!");
                Log.e(TAG, "Thread-" + threadId + ": ⚠️ This will prevent us from sending data to the peripheral!");
            }
            
            // Also enable notifications on TX characteristic - this is the fix for the one-way communication issue
            try {
                boolean success = bluetoothGatt.setCharacteristicNotification(txCharacteristic, true);
                Log.d(TAG, "Thread-" + threadId + ": 📱 Set local notification for TX characteristic: " + success);
                
                // If the TX characteristic has notify or indicate, enable remote notifications
                if (hasTxNotify || hasTxIndicate) {
                    BluetoothGattDescriptor txDescriptor = txCharacteristic.getDescriptor(
                        CLIENT_CHARACTERISTIC_CONFIG_UUID);
                        
                    if (txDescriptor != null) {
                        byte[] value = hasTxNotify ? 
                            BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE : 
                            BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
                        
                        txDescriptor.setValue(value);
                        boolean writeSuccess = bluetoothGatt.writeDescriptor(txDescriptor);
                        Log.d(TAG, "Thread-" + threadId + ": 📱 Write descriptor for TX characteristic: " + writeSuccess);
                    } else {
                        Log.e(TAG, "Thread-" + threadId + ": ⚠️ No notification descriptor found for TX characteristic");
                        
                        // Try the alternative approach for TX characteristic too
                        for (BluetoothGattDescriptor desc : txCharacteristic.getDescriptors()) {
                            Log.d(TAG, "Thread-" + threadId + ": 🔍 Found TX descriptor: " + desc.getUuid());
                            
                            try {
                                byte[] value = hasTxNotify ? 
                                    BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE : 
                                    BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
                                
                                desc.setValue(value);
                                boolean alternativeSuccess = bluetoothGatt.writeDescriptor(desc);
                                Log.d(TAG, "Thread-" + threadId + ": 📱 Write alternative TX descriptor: " + alternativeSuccess);
                                
                                // Only try one descriptor
                                break;
                            } catch (Exception e) {
                                Log.e(TAG, "Thread-" + threadId + ": ❌ Error writing to alternative TX descriptor: " + e.getMessage());
                            }
                        }
                    }
                } else {
                    Log.d(TAG, "Thread-" + threadId + ": ℹ️ TX characteristic does not support notifications or indications");
                }
            } catch (Exception e) {
                Log.e(TAG, "Thread-" + threadId + ": ❌ Exception enabling notifications for TX characteristic: " + e.getMessage());
            }
        }
        
        Log.d(TAG, "Thread-" + threadId + ": 🔔 Notification setup complete - subscribed to both characteristics for maximum compatibility");
    }
    
    /**
     * Start the keep-alive mechanism to maintain connection
     */
    private void startKeepAlive() {
        if (scheduler == null) {
            scheduler = Executors.newScheduledThreadPool(1);
        }
        
        scheduler.scheduleAtFixedRate(new Runnable() {
            @Override
            public void run() {
                if (isConnected) {
                    // Send a keep-alive packet
                    try {
                        JSONObject keepAliveJson = new JSONObject();
                        keepAliveJson.put("type", "keep_alive");
                        keepAliveJson.put("timestamp", System.currentTimeMillis());
                        sendJson(keepAliveJson);
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating keep-alive JSON", e);
                    }
                }
            }
        }, KEEP_ALIVE_INTERVAL_MS, KEEP_ALIVE_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }
    
    /**
     * Stop the keep-alive mechanism
     */
    private void stopKeepAlive() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
            try {
                if (!scheduler.awaitTermination(1000, TimeUnit.MILLISECONDS)) {
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
            }
        }
    }
    
    /**
     * Process the send queue
     */
    private void processSendQueue() {
        if (!isConnected || bluetoothGatt == null || txCharacteristic == null) {
            return;
        }
        
        // Send the next item from the queue
        byte[] data = sendQueue.poll();
        if (data != null) {
            sendDataInternal(data);
        }
    }
    
    /**
     * Send data through BLE
     */
    private void sendDataInternal(byte[] data) {
        if (!isConnected || bluetoothGatt == null || data == null) {
            return;
        }
        
        try {
            // Enhanced logging to debug data transmission
            long threadId = Thread.currentThread().getId();
            StringBuilder hexData = new StringBuilder();
            for (int i = 0; i < Math.min(data.length, 16); i++) {
                hexData.append(String.format("%02X ", data[i]));
            }
            
            Log.d(TAG, "Thread-" + threadId + ": 📤 Sending data: " + data.length + " bytes, first 16 bytes: " + hexData);
            
            // IMPORTANT: For writing data, we need to use the RX characteristic (70FF)
            // This is because from the central device perspective:
            // - RX (70FF) is for WRITING to the peripheral
            // - TX (71FF) is for READING from the peripheral
            BluetoothGattCharacteristic writeChar = rxCharacteristic; // Use RX for writing
            
            if (writeChar == null) {
                Log.e(TAG, "Thread-" + threadId + ": ❌ RX characteristic is null - cannot write data");
                return;
            }
            
            Log.d(TAG, "Thread-" + threadId + ": 📤 Writing to characteristic UUID: " + writeChar.getUuid());
            
            // Check properties for debugging
            int properties = writeChar.getProperties();
            boolean hasWriteNoResponse = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
            boolean hasWrite = (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
            
            Log.d(TAG, "Thread-" + threadId + ": 📤 Characteristic supports WRITE: " + hasWrite + 
                  ", WRITE_NO_RESPONSE: " + hasWriteNoResponse);
            
            if (!hasWrite && !hasWriteNoResponse) {
                Log.e(TAG, "Thread-" + threadId + ": ❌ Selected characteristic doesn't support any write operations");
                Log.e(TAG, "Thread-" + threadId + ": ❌ This would be a serious problem with the peripheral device configuration");
                return;
            }
            
            // Set the data payload
            writeChar.setValue(data);
            
            // For StandardBluetoothManager, prefer WRITE_TYPE_DEFAULT if available
            boolean isStandardBTManager = false;
            if (connectedDevice != null && connectedDevice.getName() != null) {
                isStandardBTManager = connectedDevice.getName().startsWith("Xy_A");
            }
            
            if (isStandardBTManager && hasWrite) {
                // Use DEFAULT for StandardBluetoothManager if possible
                Log.d(TAG, "Thread-" + threadId + ": 📤 Using WRITE_TYPE_DEFAULT for StandardBluetoothManager");
                writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            } else if (hasWriteNoResponse) {
                // Otherwise prefer WRITE_NO_RESPONSE if available
                Log.d(TAG, "Thread-" + threadId + ": 📤 Using WRITE_TYPE_NO_RESPONSE");
                writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            } else if (hasWrite) {
                // Fall back to WRITE_TYPE_DEFAULT as last option
                Log.d(TAG, "Thread-" + threadId + ": 📤 Using WRITE_TYPE_DEFAULT");
                writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            }
            
            // Perform the write operation with a retry mechanism
            boolean success = false;
            
            // First attempt
            try {
                success = bluetoothGatt.writeCharacteristic(writeChar);
                Log.d(TAG, "Thread-" + threadId + ": 📤 WriteCharacteristic attempt 1 returned: " + (success ? "SUCCESS" : "FAILED"));
            } catch (Exception e) {
                Log.e(TAG, "Thread-" + threadId + ": ❌ Error on first write attempt: " + e.getMessage());
            }
            
            // If first attempt failed, try the other write type
            if (!success) {
                if (writeChar.getWriteType() == BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT && hasWriteNoResponse) {
                    Log.d(TAG, "Thread-" + threadId + ": 📤 DEFAULT write failed, trying NO_RESPONSE");
                    writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                } else if (writeChar.getWriteType() == BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE && hasWrite) {
                    Log.d(TAG, "Thread-" + threadId + ": 📤 NO_RESPONSE write failed, trying DEFAULT");
                    writeChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                }
                
                // Second attempt
                try {
                    success = bluetoothGatt.writeCharacteristic(writeChar);
                    Log.d(TAG, "Thread-" + threadId + ": 📤 WriteCharacteristic attempt 2 returned: " + (success ? "SUCCESS" : "FAILED"));
                } catch (Exception e) {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Error on second write attempt: " + e.getMessage());
                }
                
                // If second attempt also failed, schedule a retry after delay rather than blocking
                if (!success) {
                    Log.d(TAG, "Thread-" + threadId + ": 📤 Scheduling delayed retry");
                    
                    // Use an exponential delay if we've had consecutive failures
                    final int delayMs = 150 + (consecutiveWriteFailures * 50);
                    Log.d(TAG, "Thread-" + threadId + ": ⏱️ Scheduling retry after " + delayMs + "ms");
                    
                    // Instead of Thread.sleep, use the handler for non-blocking delay
                    // Store characteristics in final variables for the runnable
                    final BluetoothGattCharacteristic finalWriteChar = writeChar;
                    final BluetoothGatt finalGatt = bluetoothGatt;
                    final long finalThreadId = threadId;
                    
                    handler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                // Third attempt in a separate scheduled task
                                boolean retrySuccess = finalGatt.writeCharacteristic(finalWriteChar);
                                Log.d(TAG, "Thread-" + finalThreadId + ": 📤 Delayed writeCharacteristic attempt returned: " + 
                                    (retrySuccess ? "SUCCESS" : "FAILED"));
                                
                                // Update consecutive failures counter based on result
                                if (retrySuccess) {
                                    consecutiveWriteFailures = 0;
                                } else {
                                    consecutiveWriteFailures++;
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Thread-" + finalThreadId + ": ❌ Error on delayed write attempt: " + e.getMessage());
                                consecutiveWriteFailures++;
                            }
                        }
                    }, delayMs);
                    
                    // We'll exit this method now, the retry will happen asynchronously
                    return;
                }
            }
            
            // Log the final success/failure status and update consecutive failures counter
            if (success) {
                Log.d(TAG, "Thread-" + threadId + ": ✅ Successfully queued data for transmission");
                // Reset consecutive failures on success
                consecutiveWriteFailures = 0;
            } else {
                // Increment consecutive failures counter, for adaptive delay calculation
                consecutiveWriteFailures++;
                Log.e(TAG, "Thread-" + threadId + ": ❌ Failed to queue data for transmission after multiple attempts (failures: " + consecutiveWriteFailures + ")");
                
                // If we've had many consecutive failures, log it but don't block with sleep
                // The adaptive delay in queueData will naturally add more delay between operations
                if (consecutiveWriteFailures > 3) {
                    Log.d(TAG, "Thread-" + threadId + ": ⚠️ Multiple consecutive failures detected: " + consecutiveWriteFailures);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending data via BLE: " + e.getMessage(), e);
        }
    }
    
    /**
     * Queue data to be sent
     */
    // Track consecutive write failures to implement adaptive delay
    private int consecutiveWriteFailures = 0;
    private static final int BASE_QUEUE_DELAY_MS = 200; // Increased from 50ms to 200ms
    private static final int MAX_QUEUE_DELAY_MS = 500; // Maximum delay of 500ms
    
    private void queueData(byte[] data) {
        if (data != null) {
            sendQueue.add(data);
            
            // Calculate delay based on failure history - add 50ms per consecutive failure
            int currentDelay = BASE_QUEUE_DELAY_MS + (consecutiveWriteFailures * 50);
            // Cap at maximum delay
            currentDelay = Math.min(currentDelay, MAX_QUEUE_DELAY_MS);
            
            // Add a delay before processing the queue to avoid transaction congestion
            // This helps alleviate race conditions with multiple BLE operations
            handler.removeCallbacks(processSendQueueRunnable);
            handler.postDelayed(processSendQueueRunnable, currentDelay);
            
            Log.d(TAG, "Queued data with " + currentDelay + "ms delay (failures: " + consecutiveWriteFailures + ")");
        }
    }
    
    /**
     * Send a JSON object to the glasses
     */
    private void sendJson(JSONObject json) {
        if (json != null) {
            String jsonStr = json.toString();
            queueData(jsonStr.getBytes(StandardCharsets.UTF_8));
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
            
            // Extract the command type and length
            byte commandType = data[2];
            
            // Determine endianness based on device name pattern
            boolean isStandardBTManager = false;
            if (connectedDevice != null && connectedDevice.getName() != null) {
                String deviceName = connectedDevice.getName();
                isStandardBTManager = deviceName.startsWith("Xy_A"); // Standard BT Manager uses "Xy_A" prefix
                Log.d(TAG, "Thread-" + threadId + ": 🔍 Device name: " + deviceName + 
                      ", using " + (isStandardBTManager ? "little" : "big") + "-endian format");
            }
            
            // Use the appropriate endianness based on device type
            int payloadLength;
            if (isStandardBTManager) {
                // Little-endian for StandardBluetoothManager
                payloadLength = ((data[3] & 0xFF)) | ((data[4] & 0xFF) << 8);
            } else {
                // Big-endian for original K900BluetoothManager
                payloadLength = ((data[3] & 0xFF) << 8) | (data[4] & 0xFF);
            }
            
            Log.d(TAG, "Thread-" + threadId + ": 🔍 Command type: 0x" + String.format("%02X", commandType) + 
                  ", Payload length: " + payloadLength + " (" + (isStandardBTManager ? "little" : "big") + "-endian)");
            
            // Verify expected message format
            if (commandType == 0x30) { // 0x30 is the command type for string/JSON data
                Log.d(TAG, "Thread-" + threadId + ": 🔍 Command type 0x30 indicates JSON data");
                
                // Safety check for payload length
                if (payloadLength > size - 7) {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Calculated payload length (" + payloadLength + 
                         ") is too large for packet size (" + size + ")");
                    return;
                }
                
                // Extract the payload
                if (size >= payloadLength + 7) { // Make sure we have enough data
                    // Check for end markers
                    if (5 + payloadLength + 1 < size && 
                        data[5 + payloadLength] == 0x24 && data[5 + payloadLength + 1] == 0x24) {
                        // Extract the payload
                        byte[] payload = Arrays.copyOfRange(data, 5, 5 + payloadLength);
                        
                        // Convert to string
                        String payloadStr = new String(payload, StandardCharsets.UTF_8);
                        Log.d(TAG, "Thread-" + threadId + ": 🔍 Extracted payload: " + payloadStr);
                        
                        // Check if it's JSON
                        if (payloadStr.startsWith("{") && payloadStr.endsWith("}")) {
                            Log.d(TAG, "Thread-" + threadId + ": 🔍 Payload is valid JSON");
                            try {
                                JSONObject json = new JSONObject(payloadStr);
                                
                                // Check if this is C-wrapped format {"C": "..."}
                                if (json.has("C") && json.length() == 1) {
                                    String innerContent = json.optString("C", "");
                                    Log.d(TAG, "Thread-" + threadId + ": 🔍 Detected C-wrapped format, inner content: " + innerContent);
                                    
                                    // Try to parse the inner content as JSON
                                    try {
                                        JSONObject innerJson = new JSONObject(innerContent);
                                        processJsonMessage(innerJson);
                                    } catch (JSONException e) {
                                        Log.d(TAG, "Thread-" + threadId + ": Inner content is not JSON, processing raw inner content");
                                        // If inner content is not JSON, process the outer JSON
                                        processJsonMessage(json);
                                    }
                                } else {
                                    // Not C-wrapped, process the JSON directly
                                    processJsonMessage(json);
                                }
                            } catch (JSONException e) {
                                Log.e(TAG, "Thread-" + threadId + ": ❌ Error parsing JSON payload: " + e.getMessage());
                            }
                        } else {
                            Log.w(TAG, "Thread-" + threadId + ": ⚠️ Payload is not valid JSON: " + payloadStr);
                        }
                    } else {
                        Log.e(TAG, "Thread-" + threadId + ": ❌ End markers ($$) not found where expected");
                    }
                } else {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Received data size (" + size + 
                         ") is less than expected size (" + (payloadLength + 7) + ")");
                }
            } else {
                // Handle other command types if needed
                Log.d(TAG, "Thread-" + threadId + ": 🔍 Non-JSON command type: 0x" + String.format("%02X", commandType));
            }
            
            return; // Exit after processing K900 protocol format
        }
        
        // Check if this is a JSON message (starts with '{')
        if (data.length > 0 && data[0] == '{') {
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
            return;
        }
        
        // For backward compatibility, check for binary LC3 audio data
        // This block can be removed once all clients are updated to use the JSON format
        byte commandByte = data[0];
        
        // Check if this is binary LC3 audio data (0xA0)
        if (commandByte == (byte)0xA0) {
            Log.d(TAG, "Thread-" + threadId + ": ⚠️ Detected legacy binary LC3 audio packet");
            
            if (size > 1) {
                // Extract the LC3 audio data (skip the command byte)
                byte[] lc3AudioData = Arrays.copyOfRange(data, 1, data.length);
                
                // Forward to the audio processing system
                if (audioProcessingCallback != null) {
                    try {
                        Log.d(TAG, "Thread-" + threadId + ": ⏩ Forwarding legacy LC3 audio data (" + lc3AudioData.length + " bytes)");
                        audioProcessingCallback.onLC3AudioDataAvailable(lc3AudioData);
                    } catch (Exception e) {
                        Log.e(TAG, "Thread-" + threadId + ": ❌ Error forwarding legacy LC3 audio: " + e.getMessage());
                    }
                } else {
                    Log.e(TAG, "Thread-" + threadId + ": ❌ Received legacy LC3 audio data but no callback registered");
                }
            }
            return;
        }
        
        // Unknown packet type
        Log.w(TAG, "Received unknown packet type: " + String.format("0x%02X", commandByte));
        if (size > 10) { 
            Log.d(TAG, "First 10 bytes: " + bytesToHex(Arrays.copyOfRange(data, 0, 10)));
        } else {
            Log.d(TAG, "Data: " + bytesToHex(data));
        }
    }
    
    /**
     * Process a JSON message
     */
    private void processJsonMessage(JSONObject json) {
        Log.d(TAG, "Got some JSON from glasses: " + json.toString());
        
        // ENHANCED PARSING: Handle nested JSON inside C field
        if (json.has("C")) {
            try {
                // This is likely the C-wrapped format from StandardBluetoothManager
                // Extract and parse the C field which contains the actual message
                String innerContent = json.optString("C", "");
                Log.d(TAG, "Detected special format with C field. Inner content: " + innerContent);
                
                // Check if inner content is JSON
                if (innerContent.startsWith("{") && innerContent.endsWith("}")) {
                    try {
                        // Parse the inner JSON message
                        JSONObject innerJson = new JSONObject(innerContent);
                        Log.d(TAG, "Successfully parsed inner JSON: " + innerJson.toString());
                        
                        // Process the inner JSON instead
                        processInnerJsonMessage(innerJson);
                        return;
                    } catch (JSONException e) {
                        Log.e(TAG, "Error parsing inner JSON content: " + e.getMessage());
                        // Fall through to normal processing
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Error processing C-wrapped format: " + e.getMessage());
                // Fall through to normal processing
            }
        }
        
        // Regular processing for non-nested JSON
        processInnerJsonMessage(json);
    }
    
    /**
     * Process the actual JSON message content after unwrapping from any container format
     */
    private void processInnerJsonMessage(JSONObject json) {
        // Extract the message type
        String type = json.optString("type", "");
        Log.d(TAG, "Processing JSON message type: " + type);
        
        switch (type) {
            case "battery_status":
                // Process battery status
                int level = json.optInt("level", batteryLevel);
                boolean charging = json.optBoolean("charging", isCharging);
                updateBatteryStatus(level, charging);
                break;
                
            case "wifi_status":
                // Process WiFi status information
                boolean wifiConnected = json.optBoolean("connected", false);
                String ssid = json.optString("ssid", "");
                updateWifiStatus(wifiConnected, ssid);
                break;
                
            case "token_status":
                // Process coreToken acknowledgment
                boolean success = json.optBoolean("success", false);
                Log.d(TAG, "Received token status from ASG client: " + (success ? "SUCCESS" : "FAILED"));
                break;
                
            case "button_press":
                // Process button press event
                // ...
                break;
                
            case "sensor_data":
                // Process sensor data
                // ...
                break;
                
            case "lc3_audio":
                // Extract the Base64-encoded audio data
                String encodedData = json.optString("data", "");
                if (encodedData.isEmpty()) {
                    Log.e(TAG, "❌ LC3 audio JSON received but data field is empty");
                    return;
                }
                
                try {
                    // Decode the Base64 data
                    byte[] lc3AudioData = android.util.Base64.decode(
                        encodedData, android.util.Base64.DEFAULT);
                    // Forward to the audio processing system
                    if (audioProcessingCallback != null) {
                        try {
                            Log.d(TAG, "⏩ Forwarding LC3 audio data to processing system");
                            audioProcessingCallback.onLC3AudioDataAvailable(lc3AudioData);
                        } catch (Exception e) {
                            Log.e(TAG, "❌ Error forwarding LC3 audio: " + e.getMessage());
                        }
                    } else {
                        Log.e(TAG, "❌ Received LC3 audio data but no callback registered");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "❌ Error decoding Base64 LC3 audio data: " + e.getMessage());
                }
                break;
                
            case "glasses_ready":
                // Glasses SOC has booted and is ready for communication
                Log.d(TAG, "🎉 Received glasses_ready message - SOC is booted and ready!");
                
                // Stop the readiness check loop since we got confirmation
                stopReadinessCheckLoop();
                
                // Now we can perform all SOC-dependent initialization
                Log.d(TAG, "🔄 Requesting battery and WiFi status from glasses");
                requestBatteryStatus();
                requestWifiStatus();
                
                Log.d(TAG, "🔄 Sending coreToken to ASG client");
                sendCoreTokenToAsgClient();
                
                Log.d(TAG, "🔄 Starting debug video command loop");
                //startDebugVideoCommandLoop();
                
                // Finally, mark the connection as fully established
                Log.d(TAG, "✅ Glasses connection is now fully established!");
                connectionEvent(SmartGlassesConnectionState.CONNECTED);
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
        try {
            JSONObject json = new JSONObject();
            json.put("type", "request");
            json.put("request", "battery_status");
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating battery status request", e);
        }
    }
    
    /**
     * Update battery status and notify listeners
     */
    private void updateBatteryStatus(int level, boolean charging) {
        batteryLevel = level;
        isCharging = charging;
        
        // Post battery event so the system knows the battery level
        EventBus.getDefault().post(new BatteryLevelEvent(level, charging));
    }
    
    /**
     * Update WiFi status and notify listeners
     */
    private void updateWifiStatus(boolean connected, String ssid) {
        boolean wasConnected = isWifiConnected;
        String previousSsid = wifiSsid;
        
        isWifiConnected = connected;
        wifiSsid = ssid;
        
        Log.d(TAG, "ASG WiFi status: " + (connected ? "Connected" : "Disconnected") + 
                  (connected ? " to " + ssid : ""));
        
        // Post WiFi status event to the event bus so AugmentosService and other components can react
        boolean needsCredentials = !connected; // If not connected, credentials are needed
        EventBus.getDefault().post(new GlassesNeedWifiCredentialsEvent(
                smartGlassesDevice.deviceModelName, 
                needsCredentials,
                connected, 
                ssid));
        
        // If WiFi connection status has changed, update the status
        if (wasConnected != connected || !ssid.equals(previousSsid)) {
            // This will trigger a status update that includes the new WiFi state
            connectionEvent(mConnectState);
        }
    }
    
    /**
     * Request WiFi status from the glasses
     */
    private void requestWifiStatus() {
        try {
            JSONObject json = new JSONObject();
            json.put("type", "request_wifi_status");
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating WiFi status request", e);
        }
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
        
        // We don't use the saved device name here since we're scanning anyway
        // The scan callback will match devices with the right naming pattern
        
        // For StandardBluetoothManager, the address rotates, so we can't connect directly by address
        // We need to start scanning and match by the device name pattern
        Log.d(TAG, "Starting scan to find glasses with appropriate naming pattern");
        startScan();
    }
    
    @Override
    public void changeSmartGlassesMicrophoneState(boolean enable) {
        Log.d(TAG, "Changing microphone state to: " + enable);
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "command");
            json.put("command", "microphone");
            json.put("enable", enable);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating microphone command", e);
        }
    }
    
    @Override
    public void requestPhoto(String requestId, String appId) {
        Log.d(TAG, "Requesting photo: " + requestId + " for app: " + appId);
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "command");
            json.put("command", "camera");
            json.put("action", "take_photo");
            json.put("requestId", requestId);
            json.put("appId", appId);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating photo request JSON", e);
        }
    }
    
    @Override
    public void requestVideoStream(String appId) {
        Log.d(TAG, "Requesting video stream for app: " + appId);
        
        try {
            JSONObject json = new JSONObject();
            json.put("type", "command");
            json.put("command", "camera");
            json.put("action", "start_video_stream");
            json.put("appId", appId);
            sendJson(json);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating video stream request JSON", e);
        }
    }
    
    /**
     * Check if the ASG client is connected to WiFi
     * @return true if connected to WiFi, false otherwise
     */
    public boolean isAsgWifiConnected() {
        return isWifiConnected;
    }
    
    /**
     * Get the SSID of the WiFi network the ASG client is connected to
     * @return SSID string, or empty string if not connected
     */
    public String getAsgWifiSsid() {
        return wifiSsid;
    }
    
    /**
     * Manually request a WiFi status update from the ASG client
     */
    public void refreshAsgWifiStatus() {
        if (isConnected) {
            requestWifiStatus();
        }
    }
    
    // Debug video command loop vars
    private Runnable debugVideoCommandRunnable;
    private int debugCommandCounter = 0;
    private static final int DEBUG_VIDEO_INTERVAL_MS = 5000; // 5 seconds
    
    // SOC readiness check parameters
    private static final int READINESS_CHECK_INTERVAL_MS = 7000; // 7 seconds
    private Runnable readinessCheckRunnable;
    private int readinessCheckCounter = 0;
    
    /**
     * Starts the glasses SOC readiness check loop
     * This sends a "phone_ready" message every 5 seconds until
     * we receive a "glasses_ready" response, indicating the SOC is booted
     */
    private void startReadinessCheckLoop() {
        // Stop any existing readiness check
        stopReadinessCheckLoop();
        
        // Reset counter
        readinessCheckCounter = 0;
        
        Log.d(TAG, "🔄 Starting glasses SOC readiness check loop");
        
        readinessCheckRunnable = new Runnable() {
            @Override
            public void run() {
                if (isConnected && !isKilled) {
                    readinessCheckCounter++;
                    
                    Log.d(TAG, "🔄 Readiness check #" + readinessCheckCounter + ": waiting for glasses SOC to boot");
                    //openhotspot();
                    try {
                        // Create a simple phone_ready message
                        JSONObject readyMsg = new JSONObject();
                        readyMsg.put("type", "phone_ready");
                        readyMsg.put("timestamp", System.currentTimeMillis());
                        
                        // Send it through our data channel
                        sendDataToGlasses(readyMsg.toString());
                    } catch (JSONException e) {
                        Log.e(TAG, "Error creating phone_ready message", e);
                    }
                    
                    // Schedule next check
                    handler.postDelayed(this, READINESS_CHECK_INTERVAL_MS);
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
        
        // Stop keep-alive
        stopKeepAlive();
        
        // Stop readiness check loop
        stopReadinessCheckLoop();
        
        // Cancel connection timeout
        if (connectionTimeoutRunnable != null) {
            connectionTimeoutHandler.removeCallbacks(connectionTimeoutRunnable);
        }
        
        // Cancel any pending handlers and cleanup resources
        handler.removeCallbacksAndMessages(null);
        connectionTimeoutHandler.removeCallbacksAndMessages(null);
        
        // Quit the background thread properly
        if (bleThread != null) {
            bleThread.quitSafely();
            try {
                // Wait for thread to terminate
                bleThread.join(1000);
            } catch (InterruptedException e) {
                Log.w(TAG, "Interrupted while waiting for BLE thread to quit", e);
            }
            Log.d(TAG, "Background BLE thread shutdown complete");
        }
        
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
        
        context = null;
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
    
    /**
     * Send video recording command to BES2700 MCU using the K900 protocol format
     * Formats the command with proper start/end codes
     * 
     * @param filename Filename for the video without extension
     * @param videoType Type of recording (0 for normal)
     */
    public void sendVideoCommand(String filename, int videoType) {
        try {
            // Create video command body
            JSONObject body = new JSONObject();
            body.put("type", videoType);
            body.put("fname", filename);
            
            // Create the full command
            JSONObject cmdObject = new JSONObject();
            cmdObject.put("C", "cs_vdo"); // Video command
            cmdObject.put("V", 1);        // Version is always 1
            cmdObject.put("B", body);     // Add the body
            
            // Convert to string
            String jsonStr = cmdObject.toString();
            Log.d(TAG, "Sending video command: " + jsonStr);
            
            // Format with start/end codes manually (since we don't have XyCmd)
            byte[] packedData = packCommand(jsonStr);
            
            // Queue the data for sending
            queueData(packedData);
            
        } catch (JSONException e) {
            Log.e(TAG, "Error creating video command", e);
        }
    }

    public void openhotspot() {
        try {
            JSONObject cmdObject = new JSONObject();
            cmdObject.put("C", "cs_batv"); // Video command
            cmdObject.put("V", 1);        // Version is always 1
            cmdObject.put("B", "");     // Add the body
            String jsonStr = cmdObject.toString();
            Log.d(TAG, "Sending hotspot command: " + jsonStr);
            byte[] packedData = packCommand(jsonStr);
            queueData(packedData);

        } catch (JSONException e) {
            Log.e(TAG, "Error creating video command", e);
        }
    }
    
    /**
     * Simple implementation of the command packing function
     * Adds start/end markers and length information to match K900 protocol
     */
    private byte[] packCommand(String jsonData) {
        byte[] jsonBytes = jsonData.getBytes(StandardCharsets.UTF_8);
        int jsonLength = jsonBytes.length;
        
        // Command structure: ## + type + length(2 bytes) + data + $$
        byte[] result = new byte[jsonLength + 7]; // 2(start) + 1(type) + 2(length) + data + 2(end)
        
        // Start code ##
        result[0] = 0x23; // #
        result[1] = 0x23; // #
        
        // Command type (0x30 for string data - FIXED based on K900Server code)
        result[2] = 0x30; // Changed from 0x01 to 0x30 to match expected value
        
        // Length (2 bytes, little-endian)
        result[3] = (byte)(jsonLength & 0xFF);
        result[4] = (byte)((jsonLength >> 8) & 0xFF);
        
        // Copy the JSON data
        System.arraycopy(jsonBytes, 0, result, 5, jsonLength);
        
        // End code $$
        result[5 + jsonLength] = 0x24; // $
        result[6 + jsonLength] = 0x24; // $
        
        // Debug log the formatted data (FULL output)
        StringBuilder hexDump = new StringBuilder();
        for (int i = 0; i < result.length; i++) {
            hexDump.append(String.format("%02X ", result[i]));
        }
        Log.d(TAG, "Packed data (" + result.length + " bytes) FULL HEX: " + hexDump.toString());
        
        return result;
    }
    
    /**
     * Send data directly to the glasses using the C field of JSON
     * This method provides a simple way to transmit arbitrary data through the BLE connection
     * utilizing the discovery that the BES2700 MCU passes messages with C field to the SOC
     * 
     * @param data The string data to be sent to the glasses
     */
    public void sendDataToGlasses(String data) {
        if (data == null || data.isEmpty()) {
            Log.e(TAG, "Cannot send empty data to glasses");
            return;
        }
        
        try {
            // Create a simple JSON object with just the C field containing our data
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("C", data);  // The C field is used to carry our data payload
            
            // Convert to string
            String jsonStr = jsonObject.toString();
            Log.d(TAG, "Sending data to glasses: " + jsonStr);
            
            // Log the UTF-8 bytes of the original string for comparison
            byte[] jsonBytes = jsonStr.getBytes(StandardCharsets.UTF_8);
            StringBuilder bytesHex = new StringBuilder();
            for (byte b : jsonBytes) {
                bytesHex.append(String.format("%02X ", b));
            }
            Log.d(TAG, "Data JSON as bytes (" + jsonBytes.length + " bytes): " + bytesHex.toString());
            
            // Format with start/end codes using the same packing function
            byte[] packedData = packCommand(jsonStr);
            
            // Queue the data for sending
            queueData(packedData);
            
        } catch (JSONException e) {
            Log.e(TAG, "Error creating data JSON", e);
        }
    }
    
    @Override
    public void sendCustomCommand(String commandJson) {
        Log.d(TAG, "Received custom command: " + commandJson);
        
        try {
            JSONObject json = new JSONObject(commandJson);
            String type = json.optString("type", "");
            
            switch (type) {
                case "wifi_credentials":
                    String ssid = json.optString("ssid", "");
                    String password = json.optString("password", "");
                    
                    // Validate inputs
                    if (ssid.isEmpty()) {
                        Log.e(TAG, "Cannot set WiFi credentials - SSID is empty");
                        return;
                    }
                    
                    // Send WiFi credentials to the ASG client
                    JSONObject wifiCommand = new JSONObject();
                    wifiCommand.put("type", "command");
                    wifiCommand.put("command", "set_wifi");
                    wifiCommand.put("ssid", ssid);
                    wifiCommand.put("password", password);
                    sendJson(wifiCommand);
                    
                    // Update local state - we don't actually know if it will connect yet,
                    // but the device will send a wifi_status update once it tries
                    Log.d(TAG, "Sent WiFi credentials to connect to: " + ssid);
                    break;
                
                case "k900_record_video":
                    // Extract parameters for video recording
                    String filename = json.optString("filename", "video_" + System.currentTimeMillis());
                    int videoType = json.optInt("videoType", 0);
                    
                    // Call our video recording function
                    sendVideoCommand(filename, videoType);
                    break;
                    
                default:
                    Log.w(TAG, "Unknown custom command type: " + type);
                    break;
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing custom command JSON", e);
        }
    }
}