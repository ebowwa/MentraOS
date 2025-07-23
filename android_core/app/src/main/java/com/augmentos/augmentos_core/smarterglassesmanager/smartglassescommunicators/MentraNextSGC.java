package com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators;

import com.augmentos.augmentos_core.smarterglassesmanager.utils.BitmapJavaUtils;

import mentraos.ble.MentraosBle.DisplayText;
import mentraos.ble.MentraosBle.PhoneToGlasses;
import mentraos.ble.MentraosBle.PingRequest;

import com.google.protobuf.InvalidProtocolBufferException;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Message;
import android.os.Handler.Callback;
import android.os.Looper;
import android.util.Log;
import android.util.SparseArray;

import androidx.preference.PreferenceManager;

import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.BlockingQueue;

import org.json.JSONException;
import org.json.JSONObject;

//BMP

import java.util.Random;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.zip.CRC32;
import java.nio.ByteBuffer;

import com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.isMicEnabledForFrontendEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.SmartGlassesCommunicator;
import com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators.SmartGlassesFontSize;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.HeadUpAngleEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.BitmapJavaUtils;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.G1FontLoader;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;
import com.google.gson.Gson;
import com.augmentos.smartglassesmanager.cpp.L3cCpp;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BatteryLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.CaseEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.BrightnessLevelEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchStopEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadDownEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHeadUpEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.R;

import org.greenrobot.eventbus.EventBus;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.Map;
import java.util.HashMap;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesSerialNumberEvent;
import com.augmentos.augmentos_core.statushelpers.DeviceInfo;

import mentraos.ble.MentraosBle;

public final class MentraNextSGC extends SmartGlassesCommunicator {
    private final String TAG = "WearableAi_MentraNextSGC";
    public final String SHARED_PREFS_NAME = "NextGlassesPrefs";
    private int heartbeatCount = 0;
    private int micBeatCount = 0;
    private BluetoothAdapter bluetoothAdapter;

    public final String NEXT_MAIN_DEVICE_KEY = "SavedNextDeviceName";

    private boolean isKilled = false;

    private final UUID UART_SERVICE_UUID = UUID.fromString("00004860-0000-1000-8000-00805f9b34fb");
    private final UUID UART_TX_CHAR_UUID = UUID.fromString("000071FF-0000-1000-8000-00805f9b34fb");
    private final UUID UART_RX_CHAR_UUID = UUID.fromString("000070FF-0000-1000-8000-00805f9b34fb");
    private final UUID CLIENT_CHARACTERISTIC_CONFIG_UUID = UUID
            .fromString("00002902-0000-1000-8000-00805f9b34fb");
    private final String SAVED_NEXT_ID_KEY = "SAVED_Next_New_ID_KEY";

    private final byte PACKET_TYPE_JSON = (byte) 0x01;
    private final byte PACKET_TYPE_PROTOBUF = (byte) 0x02;
    private final byte PACKET_TYPE_AUDIO = (byte) 0xA0;
    private final byte PACKET_TYPE_IMAGE = (byte) 0xB0;
    private final Random random = new Random();

    private Context context;
    private BluetoothGatt mainGlassGatt;
    private BluetoothGattCharacteristic mainTxChar;
    private BluetoothGattCharacteristic mainRxChar;
    private final int MTU_512 = 512;
    private final int MTU_256 = 256;
    private int currentMTU = 0;

    private SmartGlassesConnectionState connectionState = SmartGlassesConnectionState.DISCONNECTED;
    // gatt callbacks
    private final int MAIN_TASK_HANDLER_CODE_GATT_STATUS_CHANGED = 110;
    private final int MAIN_TASK_HANDLER_CODE_DISCOVER_SERVICES = 120;
    private final int MAIN_TASK_HANDLER_CODE_CHARACTERISTIC_VALUE_NOTIFIED = 210;
    // actions of device or gatt
    private final int MAIN_TASK_HANDLER_CODE_CONNECT_DEVICE = 310;
    private final int MAIN_TASK_HANDLER_CODE_DISCONNECT_DEVICE = 320;
    private final int MAIN_TASK_HANDLER_CODE_RECONNECT_DEVICE = 350;
    private final int MAIN_TASK_HANDLER_CODE_RECONNECT_GATT = 360;
    private final int MAIN_TASK_HANDLER_CODE_SCAN_START = 410;
    private final int MAIN_TASK_HANDLER_CODE_SCAN_END = 420;
    private final Handler mainTaskMandler = new Handler(Looper.getMainLooper(), new Callback() {
        @Override
        public boolean handleMessage(Message msg) {
            final int msgCode = msg.what;
            switch (msgCode) {
                case MAIN_TASK_HANDLER_CODE_GATT_STATUS_CHANGED:
                    break;
                case MAIN_TASK_HANDLER_CODE_DISCOVER_SERVICES:
                    break;
                case MAIN_TASK_HANDLER_CODE_CHARACTERISTIC_VALUE_NOTIFIED:
                    break;
                case MAIN_TASK_HANDLER_CODE_CONNECT_DEVICE:
                    break;
                case MAIN_TASK_HANDLER_CODE_DISCONNECT_DEVICE:
                    break;
                case MAIN_TASK_HANDLER_CODE_RECONNECT_DEVICE:
                    break;
                case MAIN_TASK_HANDLER_CODE_RECONNECT_GATT:
                    break;
                case MAIN_TASK_HANDLER_CODE_SCAN_START:
                    break;
                case MAIN_TASK_HANDLER_CODE_SCAN_END:
                    break;
                default:
                    break;
            }
            return true;
        }
    });
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Handler queryBatteryStatusHandler = new Handler(Looper.getMainLooper());
    private final Handler sendBrightnessCommandHandler = new Handler(Looper.getMainLooper());
    private Handler connectHandler = new Handler(Looper.getMainLooper());
    private Handler reconnectHandler = new Handler(Looper.getMainLooper());
    private Handler characteristicHandler = new Handler(Looper.getMainLooper());
    private final Semaphore sendSemaphore = new Semaphore(1);
    private boolean isMainConnected = false;
    private int currentSeq = 0;
    private boolean stopper = false;
    private boolean debugStopper = false;
    private boolean shouldUseAutoBrightness = false;
    private int brightnessValue;
    private boolean updatingScreen = false;

    private final long DELAY_BETWEEN_SENDS_MS = 5; // not using now
    private final long DELAY_BETWEEN_CHUNKS_SEND = 5; // super small just in case
    private final long DELAY_BETWEEN_ACTIONS_SEND = 250; // not using now
    private final long HEARTBEAT_INTERVAL_MS = 15000;
    private final long MICBEAT_INTERVAL_MS = (1000 * 60) * 30; // micbeat every 30 minutes
    private int caseBatteryLevel = -1;
    private boolean caseCharging = false;
    private boolean caseOpen = false;
    private boolean caseRemoved = true;
    private int batteryMain = -1;
    private int mainReconnectAttempts = 0;
    private int reconnectAttempts = 0; // Counts the number of reconnect attempts
    private final long BASE_RECONNECT_DELAY_MS = 3000; // Start with 3 seconds
    private final long MAX_RECONNECT_DELAY_MS = 60000;

    // heartbeat sender
    private Handler heartbeatHandler = new Handler();
    private Handler findCompatibleDevicesHandler;
    private boolean isScanningForCompatibleDevices = false;
    private boolean isScanning = false;

    private ScanCallback bleScanCallback;

    private Runnable heartbeatRunnable;

    // mic heartbeat turn on
    private Handler micBeatHandler = new Handler();
    private Runnable micBeatRunnable;

    // white list sender
    private Handler whiteListHandler = new Handler();
    private boolean whiteListedAlready = false;

    // mic enable Handler
    private Handler micEnableHandler = new Handler();
    private boolean micEnabledAlready = false;
    private boolean isMicrophoneEnabled = false; // Track current microphone state

    // notification period sender
    private Handler notificationHandler = new Handler();
    private Runnable notificationRunnable;
    private boolean notifysStarted = false;
    private int notificationNum = 10;

    // text wall periodic sender
    private Handler textWallHandler = new Handler();
    private Runnable textWallRunnable;
    private boolean textWallsStarted = false;
    private int textWallNum = 10;

    private BluetoothDevice mainDevice = null;
    private String preferredNextId = null;
    private String pendingSavedNextMainName = null;
    private String savedNextMainName = null;
    private String preferredMainDeviceId = null;

    // handler to turn off screen
    // Handler goHomeHandler;
    // Runnable goHomeRunnable;

    // Retry handler
    Handler retryBondHandler;
    private final long BOND_RETRY_DELAY_MS = 5000; // 5-second backoff

    // remember when we connected
    private long lastConnectionTimestamp = 0;
    private SmartGlassesDevice smartGlassesDevice;

    private final long CONNECTION_TIMEOUT_MS = 10000; // 10 seconds

    // Handlers for connection timeouts
    private final Handler mainConnectionTimeoutHandler = new Handler(Looper.getMainLooper());

    // Runnable tasks for handling timeouts
    private Runnable mainConnectionTimeoutRunnable;
    private boolean isBondingReceiverRegistered = false;
    private boolean shouldUseGlassesMic;
    private boolean lastThingDisplayedWasAnImage = false;

    // lock writing until the last write is successful
    // fonts in NextGlasses
    private G1FontLoader fontLoader;

    private final long DEBOUNCE_DELAY_MS = 270; // Minimum time between chunk sends
    private volatile long lastSendTimestamp = 0;
    private long lc3DecoderPtr = 0;

    private final Gson gson = new Gson();

    public MentraNextSGC(Context context, SmartGlassesDevice smartGlassesDevice) {
        super();
        this.context = context;
        Log.d(TAG, "Init MentraNextSGC");
        // loadPairedDeviceNames();
        // goHomeHandler = new Handler();
        this.smartGlassesDevice = smartGlassesDevice;
        preferredMainDeviceId = getPreferredMainDeviceId(context);
        brightnessValue = getSavedBrightnessValue(context);
        shouldUseAutoBrightness = getSavedAutoBrightnessValue(context);
        this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        this.shouldUseGlassesMic = SmartGlassesManager.getSensingEnabled(context)
                && !"phone".equals(SmartGlassesManager.getPreferredMic(context));

        // setup LC3 decoder
        if (lc3DecoderPtr == 0) {
            lc3DecoderPtr = L3cCpp.initDecoder();
        }
        // setup fonts
        fontLoader = new G1FontLoader(context);
    }

    private final BluetoothGattCallback mainGattCallback = createGattCallback();

    private BluetoothGattCallback createGattCallback() {
        return new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                Log.d(TAG, "onConnectionStateChange action State " + (status == BluetoothGatt.GATT_SUCCESS));
                Log.d(TAG, "onConnectionStateChange connected State " + (newState == BluetoothProfile.STATE_CONNECTED));
                // Cancel the connection timeout
                if (mainConnectionTimeoutRunnable != null) {
                    mainConnectionTimeoutHandler.removeCallbacks(mainConnectionTimeoutRunnable);
                    mainConnectionTimeoutRunnable = null;
                }

                if (status == BluetoothGatt.GATT_SUCCESS) {

                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        Log.d(TAG, " glass connected, discovering services...");
                        gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
                        gatt.setPreferredPhy(
                                BluetoothDevice.PHY_LE_2M_MASK,
                                BluetoothDevice.PHY_LE_2M_MASK,
                                BluetoothDevice.PHY_OPTION_NO_PREFERRED);

                        isMainConnected = true;
                        mainReconnectAttempts = 0;
                        Log.d(TAG, "Both glasses connected. Stopping BLE scan.");
                        stopScan();
                        Log.d(TAG, "Discover services calling...");
                        gatt.discoverServices();
                        updateConnectionState();
                        // just for test
                        // EventBus.getDefault().post(new BatteryLevelEvent(20, true));
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        Log.d(TAG, " glass disconnected, stopping heartbeats");
                        Log.d(TAG, "Entering STATE_DISCONNECTED branch for side: ");
                        // Mark both sides as not ready (you could also clear both if one disconnects)
                        MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT;
                        BMP_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT;
                        mainServicesWaiter.setTrue();
                        Log.d(TAG, "Set mainServicesWaiter and rightServicesWaiter to true.");
                        forceSideDisconnection();
                        Log.d(TAG, "Called forceSideDisconnection().");
                        currentMTU = 0;
                        // Stop any periodic transmissions
                        stopHeartbeat();
                        stopMicBeat();
                        sendQueue.clear();
                        Log.d(TAG, "Stopped heartbeat and mic beat; cleared sendQueue.");
                        updateConnectionState();
                        Log.d(TAG, "Updated connection state after disconnection.");
                        // Compute reconnection delay for both sides (here you could choose the maximum
                        // of the two delays or a new delay)
                        // long delayLeft = Math.min(BASE_RECONNECT_DELAY_MS * (1L <<
                        // leftReconnectAttempts), MAX_RECONNECT_DELAY_MS);
                        // long delayRight = Math.min(BASE_RECONNECT_DELAY_MS * (1L <<
                        // rightReconnectAttempts), MAX_RECONNECT_DELAY_MS);
                        long delay = 2000; // or choose another strategy
                        // Log.d(TAG, "Computed delayLeft: " + delayLeft + " ms, delayRight: " +
                        // delayRight + " ms. Using delay: " + delay + " ms.");

                        Log.d(TAG,
                                " glass disconnected. Scheduling reconnection for both glasses in " + delay
                                        + " ms (main attempts: " + mainReconnectAttempts);

                        if (gatt.getDevice() != null) {
                            // Close the current gatt connection
                            Log.d(TAG, "Closing GATT connection for device: " +
                                    gatt.getDevice().getAddress());
                            gatt.disconnect();
                            gatt.close();
                            Log.d(TAG, "GATT connection closed.");
                        } else {
                            Log.d(TAG, "No GATT device available to disconnect.");
                        }

                        // Schedule a reconnection for both devices after the delay
                        // cancel
                        // reconnectHandler.postDelayed(() -> {
                        // Log.d(TAG, "Reconnect handler triggered after delay.");
                        // if (gatt.getDevice() != null && !isKilled) {
                        // Log.d(TAG, "Reconnecting to both glasses. isKilled = " + isKilled);
                        // // Assuming you have stored references to both devices:
                        // if (mainDevice != null) {
                        // Log.d(TAG, "Attempting to reconnect to mainDevice: " +
                        // mainDevice.getAddress());
                        // reconnectToGatt(mainDevice);
                        // } else {
                        // Log.d(TAG, "Main device reference is null.");
                        // }
                        //
                        // } else {
                        // Log.d(TAG, "Reconnect handler aborted: either no GATT device or system is
                        // killed.");
                        // }
                        // }, delay);
                    }
                } else {
                    currentMTU = 0;
                    MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT;
                    BMP_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT;
                    Log.d(TAG, "Unexpected connection state encountered for " + " glass: " + newState);
                    stopHeartbeat();
                    stopMicBeat();
                    sendQueue.clear();

                    // Mark both sides as not ready (you could also clear both if one disconnects)
                    mainServicesWaiter.setTrue();

                    Log.d(TAG, "Stopped heartbeat and mic beat; cleared sendQueue due to connection failure.");

                    Log.d(TAG, " glass connection failed with status: " + status);
                    isMainConnected = false;
                    mainReconnectAttempts++;
                    if (mainGlassGatt != null) {
                        mainGlassGatt.disconnect();
                        mainGlassGatt.close();
                    }
                    mainGlassGatt = null;

                    forceSideDisconnection();
                    Log.d(TAG, "Called forceSideDisconnection() after connection failure.");

                    // gatt.disconnect();
                    // gatt.close();
                    Log.d(TAG, "GATT connection disconnected and closed due to failure.");

                    connectHandler.postDelayed(() -> {
                        Log.d(TAG, "Attempting GATT connection for mainDevice immediately.");
                        attemptGattConnection(mainDevice);
                    }, 0);

                }
            }

            private void forceSideDisconnection() {
                Log.d(TAG, "forceSideDisconnection() called for side: ");
                // Force disconnection from the other side if necessary
                isMainConnected = false;
                mainReconnectAttempts++;
                Log.d(TAG, "Main glass: Marked as disconnected and incremented mainReconnectAttempts to "
                        + mainReconnectAttempts);
                if (mainGlassGatt != null) {
                    Log.d(TAG, "Main glass GATT exists. Disconnecting and closing mainGlassGatt.");
                    mainGlassGatt.disconnect();
                    mainGlassGatt.close();
                    mainGlassGatt = null;
                } else {
                    Log.d(TAG, "Main glass GATT is already null.");
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    new Handler(Looper.getMainLooper()).post(() -> initNextGlasses(gatt));
                }
            }

            @Override
            public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic,
                    int status) {
                Log.d(TAG, "onCharacteristicWrite callback - ");
                final byte[] values = characteristic.getValue();
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    Log.d(TAG, "onCharacteristicWrite PROC_QUEUE - " + " glass write successful");
                    Log.d(TAG, "onCharacteristicWrite Values - " + bytesToHex(values));
                    final int dataLen = values.length;
                    if (dataLen > 0) {
                        final byte packetType = values[0];
                        final byte[] protobufData = Arrays.copyOfRange(values, 1, dataLen);
                        switch (packetType) {
                            case PACKET_TYPE_PROTOBUF:
                                decodeProtobufs(protobufData);
                                break;
                        }
                    }
                } else {
                    Log.e(TAG, " glass write failed with status: " + status);
                    if (status == 133) {
                        Log.d(TAG, "GOT THAT 133 STATUS!");
                    }
                }
                // clear the waiter
                mainWaiter.setFalse();
            }

            @Override
            public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
                Log.d(TAG, "PROC - GOT DESCRIPTOR WRITE: " + status);
                // clear the waiter
                mainServicesWaiter.setFalse();
            }

            @Override
            public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
                final boolean statusBool = status == BluetoothGatt.GATT_SUCCESS;
                Log.d(TAG, "onMtuChanged: " + statusBool + "  " + mtu);
                if (statusBool) {
                    currentMTU = mtu;
                    MAX_CHUNK_SIZE = currentMTU - 10;
                    // BMP has more cofig bytes
                    BMP_CHUNK_SIZE = currentMTU - 20;
                } else {
                    if (mtu == MTU_512) {
                        gatt.requestMtu(MTU_256);
                    }
                    currentMTU = 0;
                    MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT;
                    BMP_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT;
                }
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
                characteristicHandler.post(() -> {
                    if (characteristic.getUuid().equals(UART_RX_CHAR_UUID)) {
                        byte[] data = characteristic.getValue();
                        String deviceName = gatt.getDevice().getName();
                        if (deviceName == null) {
                            return;
                        }
                        final int dataLen = data.length;
                        if (dataLen == 0) {
                            return;
                        }
                        byte packetType = data[0];
                        switch (packetType) {
                            case PACKET_TYPE_JSON: {
                                byte[] jsonData = Arrays.copyOfRange(data, 1, dataLen);
                                decodeJsons(jsonData);
                            }
                                break;
                            case PACKET_TYPE_PROTOBUF: {
                                byte[] jsonData = Arrays.copyOfRange(data, 1, dataLen);
                                decodeProtobufs(jsonData);
                            }
                                break;
                            case PACKET_TYPE_AUDIO: {
                                // Log.d(TAG, "Lc3 Audio data received. Data: " + Arrays.toString(data) + ",
                                // from: " + deviceName);
                                final int streamId = data[1] & 0xFF; // Sequence number
                                // eg. LC3 to PCM
                                final byte[] lc3 = Arrays.copyOfRange(data, 2, dataLen);
                                // byte[] pcmData = L3cCpp.decodeLC3(lc3);
                                // if (pcmData == null) {
                                // throw new IllegalStateException("Failed to decode LC3 data");
                                // }

                                // decode the LC3 audio
                                if (lc3DecoderPtr != 0) {
                                    final byte[] pcmData = L3cCpp.decodeLC3(lc3DecoderPtr, lc3);
                                    // send the PCM out
                                    if (shouldUseGlassesMic) {
                                        if (audioProcessingCallback != null) {
                                            if (pcmData != null && pcmData.length > 0) {
                                                audioProcessingCallback.onAudioDataAvailable(pcmData);
                                            }
                                        } else {
                                            // If we get here, it means the callback wasn't properly registered
                                            Log.e(TAG,
                                                    "Audio processing callback is null - callback registration failed!");
                                        }
                                    }

                                    // if (shouldUseGlassesMic) { TODO: add this back if needed
                                    // EventBus.getDefault().post(new AudioChunkNewEvent(pcmData));
                                    // } else {
                                    // Log.e(TAG, "Failed to decode LC3 frame, got null or empty result");
                                    // }
                                }

                                // send through the LC3
                                audioProcessingCallback.onLC3AudioDataAvailable(lc3);
                            }
                                break;
                            case PACKET_TYPE_IMAGE:
                                break;
                        }

                        // Handle MIC audio data
                        if (data.length > 0 && (data[0] & 0xFF) == 0xA0) {
                            // Log.d(TAG, "Lc3 Audio data received. Data: " + Arrays.toString(data) + ",
                            // from: " + deviceName);
                            int seq = data[1] & 0xFF; // Sequence number
                            // eg. LC3 to PCM
                            byte[] lc3 = Arrays.copyOfRange(data, 2, 202);
                            // byte[] pcmData = L3cCpp.decodeLC3(lc3);
                            // if (pcmData == null) {
                            // throw new IllegalStateException("Failed to decode LC3 data");
                            // }

                            // decode the LC3 audio
                            if (lc3DecoderPtr != 0) {
                                byte[] pcmData = L3cCpp.decodeLC3(lc3DecoderPtr, lc3);
                                // send the PCM out
                                if (shouldUseGlassesMic) {
                                    if (audioProcessingCallback != null) {
                                        if (pcmData != null && pcmData.length > 0) {
                                            audioProcessingCallback.onAudioDataAvailable(pcmData);
                                        }
                                    } else {
                                        // If we get here, it means the callback wasn't properly registered
                                        Log.e(TAG,
                                                "Audio processing callback is null - callback registration failed!");
                                    }
                                }

                                // if (shouldUseGlassesMic) { TODO: add this back if needed
                                // EventBus.getDefault().post(new AudioChunkNewEvent(pcmData));
                                // } else {
                                // Log.e(TAG, "Failed to decode LC3 frame, got null or empty result");
                                // }
                            }

                            // send through the LC3
                            audioProcessingCallback.onLC3AudioDataAvailable(lc3);

                        }
                        // HEAD UP MOVEMENTS
                        else if (data.length > 1 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x02) {
                            // Only check head movements from the right sensor
                            if (deviceName.contains("R_")) {
                                // Check for head down movement - initial F5 02 signal
                                Log.d(TAG, "HEAD UP MOVEMENT DETECTED");
                                EventBus.getDefault().post(new GlassesHeadUpEvent());
                            }
                        }
                        // HEAD DOWN MOVEMENTS
                        else if (data.length > 1 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x03) {
                            if (deviceName.contains("R_")) {
                                Log.d(TAG, "HEAD DOWN MOVEMENT DETECTED");
                                // clearBmpDisplay();
                                EventBus.getDefault().post(new GlassesHeadDownEvent());
                            }
                        }
                        // DOUBLE TAP
                        // appears to be completely broken - clears the screen - we should not tell
                        // people to use the touchpads yet til this is fixed
                        // else if (data.length > 1 && (data[0] & 0xFF) == 0xF5 && ((data[1] & 0xFF) ==
                        // 0x20) || ((data[1] & 0xFF) == 0x00)) {
                        // boolean isRight = deviceName.contains("R_");
                        // Log.d(TAG, "GOT DOUBLE TAP from isRight?: " + isRight);
                        // EventBus.getDefault().post(new GlassesTapOutputEvent(2, isRight,
                        // System.currentTimeMillis()));
                        // }
                        // BATTERY RESPONSE
                        else if (data.length > 2 && data[0] == 0x2C && data[1] == 0x66) {

                            batteryMain = data[2];

                            if (batteryMain != -1) {
                                int minBatt = batteryMain;
                                // Log.d(TAG, "Minimum Battery Level: " + minBatt);
                                EventBus.getDefault().post(new BatteryLevelEvent(minBatt, false));
                            }
                        }
                        // CASE REMOVED
                        else if (data.length > 1 && (data[0] & 0xFF) == 0xF5
                                && ((data[1] & 0xFF) == 0x07 || (data[1] & 0xFF) == 0x06)) {
                            caseRemoved = true;
                            Log.d("AugmentOsService", "CASE REMOVED");
                            EventBus.getDefault()
                                    .post(new CaseEvent(caseBatteryLevel, caseCharging, caseOpen, caseRemoved));
                        }
                        // CASE OPEN
                        else if (data.length > 1 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x08) {
                            caseOpen = true;
                            caseRemoved = false;
                            EventBus.getDefault()
                                    .post(new CaseEvent(caseBatteryLevel, caseCharging, caseOpen, caseRemoved));
                        }
                        // CASE CLOSED
                        else if (data.length > 1 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x0B) {
                            caseOpen = false;
                            caseRemoved = false;
                            EventBus.getDefault()
                                    .post(new CaseEvent(caseBatteryLevel, caseCharging, caseOpen, caseRemoved));
                        }
                        // CASE CHARGING STATUS
                        else if (data.length > 3 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x0E) {
                            caseCharging = (data[2] & 0xFF) == 0x01;// TODO: verify this is correct
                            EventBus.getDefault()
                                    .post(new CaseEvent(caseBatteryLevel, caseCharging, caseOpen, caseRemoved));
                        }
                        // CASE CHARGING INFO
                        else if (data.length > 3 && (data[0] & 0xFF) == 0xF5 && (data[1] & 0xFF) == 0x0F) {
                            caseBatteryLevel = (data[2] & 0xFF);// TODO: verify this is correct
                            EventBus.getDefault()
                                    .post(new CaseEvent(caseBatteryLevel, caseCharging, caseOpen, caseRemoved));
                        }
                        // case .CASE_REMOVED:
                        // print("REMOVED FROM CASE")
                        // self.caseRemoved = true
                        // case .CASE_OPEN:
                        // self.caseOpen = true
                        // self.caseRemoved = false
                        // print("CASE OPEN");
                        // case .CASE_CLOSED:
                        // self.caseOpen = false
                        // self.caseRemoved = false
                        // print("CASE CLOSED");
                        // case .CASE_CHARGING_STATUS:
                        // guard data.count >= 3 else { break }
                        // let status = data[2]
                        // if status == 0x01 {
                        // self.caseCharging = true
                        // print("CASE CHARGING")
                        // } else {
                        // self.caseCharging = false
                        // print("CASE NOT CHARGING")
                        // }
                        // case .CASE_CHARGE_INFO:
                        // print("CASE CHARGE INFO")
                        // guard data.count >= 3 else { break }
                        // caseBatteryLevel = Int(data[2])
                        // print("Case battery level: \(caseBatteryLevel)%")
                        // HEARTBEAT RESPONSE
                        else if (data.length > 0 && data[0] == 0x25) {
                            Log.d(TAG, "Heartbeat response received");
                        }
                        // TEXT RESPONSE
                        else if (data.length > 0 && data[0] == 0x4E) {
                            Log.d(TAG, "Text response on side " + (deviceName.contains("L_") ? "Left" : "Right")
                                    + " was: " + ((data.length > 1 && (data[1] & 0xFF) == 0xC9) ? "SUCCEED" : "FAIL"));
                        }

                        // Handle other non-audio responses
                        else {
                            Log.d(TAG, "PROC - Received other Even Realities response: " + bytesToHex(data) + ", from: "
                                    + deviceName);
                        }

                        // clear the waiter
                        // if ((data.length > 1 && (data[1] & 0xFF) == 0xC9)){
                        // if (deviceName.contains("L_")) {
                        // Log.d(TAG, "PROC - clearing LEFT waiter on success");
                        // leftWaiter.setFalse();
                        // } else {
                        // Log.d(TAG, "PROC - clearing RIGHT waiter on success");
                        // rightWaiter.setFalse();
                        // }
                        // }
                    }
                });
            }

        };
    }

    private void initNextGlasses(BluetoothGatt gatt) {
        gatt.requestMtu(MTU_512); // Request a higher MTU size
        Log.d(TAG, "Requested MTU size: 512");

        BluetoothGattService uartService = gatt.getService(UART_SERVICE_UUID);

        if (uartService != null) {
            BluetoothGattCharacteristic txChar = uartService.getCharacteristic(UART_TX_CHAR_UUID);
            BluetoothGattCharacteristic rxChar = uartService.getCharacteristic(UART_RX_CHAR_UUID);

            if (txChar != null) {
                mainTxChar = txChar;
                // enableNotification(gatt, txChar, side);
                // txChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                Log.d(TAG, " glass TX characteristic found");
            }

            if (rxChar != null) {
                mainRxChar = rxChar;
                enableNotification(gatt, rxChar);
                // rxChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                Log.d(TAG, " glass RX characteristic found");
            }

            // Mark as connected but wait for setup below to update connection state
            isMainConnected = true;
            Log.d(TAG, "PROC_QUEUE - left side setup complete");

            // Manufacturer data decoding moved to connection start

            // setup the Nexts
            if (isMainConnected) {
                // only for G1，not for Mentra Next Glasses
                // Log.d(TAG, "Sending firmware request Command");
                // sendDataSequentially(new byte[] { (byte) 0x6E, (byte) 0x74 });

                // Log.d(TAG, "Sending init 0x4D Command");
                // sendDataSequentially(new byte[] { (byte) 0x4D, (byte) 0xFB }); // told this
                // is only left

                // Log.d(TAG, "Sending turn off wear detection command");
                // sendDataSequentially(new byte[] { (byte) 0x27, (byte) 0x00 });

                // Log.d(TAG, "Sending turn off silent mode Command");
                // sendDataSequentially(new byte[] { (byte) 0x03, (byte) 0x0A });

                // debug command
                // Log.d(TAG, "Sending debug 0xF4 Command");
                // sendDataSequentially(new byte[]{(byte) 0xF4, (byte) 0x01});

                // no longer need to be staggered as we fixed the sender
                // do first battery status query
                // queryBatteryStatusHandler.postDelayed(() -> queryBatteryStatus(), 10);

                // setup brightness
                // sendBrightnessCommandHandler
                // .postDelayed(() -> sendBrightnessCommand(brightnessValue,
                // shouldUseAutoBrightness), 10);

                // Maybe start MIC streaming
                setMicEnabled(false, 10); // Disable the MIC

                // enable our AugmentOS notification key
                sendWhiteListCommand(10);

                // start heartbeat
                startHeartbeat(10000);

                // start mic beat
                // startMicBeat(30000);

                showHomeScreen(); // turn on the nextGlasses display

                updateConnectionState();

                // start sending debug notifications
                // startPeriodicNotifications(302);
                // start sending debug notifications
                startPeriodicTextWall(302);
            }
        } else {
            Log.e(TAG, " glass UART service not found");
        }
    }

    // working on all phones - must keep the delay
    private void enableNotification(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
        Log.d(TAG, "PROC_QUEUE - Starting notification setup for ");

        // Simply enable notifications
        Log.d(TAG, "PROC_QUEUE - setting characteristic notification on side: ");
        boolean result = gatt.setCharacteristicNotification(characteristic, true);
        Log.d(TAG, "PROC_QUEUE - setCharacteristicNotification result for " + ": " + result);

        // Set write type for the characteristic
        characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
        Log.d(TAG, "PROC_QUEUE - write type set for ");

        // wait
        Log.d(TAG, "PROC_QUEUE - waiting to enable it on this side: ");

        try {
            Thread.sleep(500);
        } catch (InterruptedException e) {
            Log.e(TAG, "Error sending data: " + e.getMessage());
        }

        Log.d(TAG, "PROC_QUEUE - get descriptor on side: ");
        BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID);
        if (descriptor != null) {
            Log.d(TAG, "PROC_QUEUE - setting descriptor on side: ");
            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            boolean r_result = gatt.writeDescriptor(descriptor);
            Log.d(TAG, "PROC_QUEUE - set descriptor on side: " + " with result: " + r_result);
        }
    }

    private void updateConnectionState() {
        if (isMainConnected) {
            connectionState = SmartGlassesConnectionState.CONNECTED;
            Log.d(TAG, "Main glasses connected");
            lastConnectionTimestamp = System.currentTimeMillis();
            // try {
            // Thread.sleep(100);
            // } catch (InterruptedException e) {
            // e.printStackTrace();
            // }
            connectionEvent(connectionState);
        } else

        {
            connectionState = SmartGlassesConnectionState.DISCONNECTED;
            Log.d(TAG, "No Main glasses connected");
            connectionEvent(connectionState);
        }
    }

    public boolean doPendingPairingIdsMatch() {
        String mainId = parsePairingIdFromDeviceName(pendingSavedNextMainName);
        Log.d(TAG, "MainID: " + mainId);

        // ok, HACKY, but if one of them is null, that means that we connected to the
        // other on a previous connect
        // this whole function shouldn't matter anymore anyway as we properly filter for
        // the device name, so it should be fine
        // in the future, the way to actually check this would be to check the final ID
        // string, which is the only one guaranteed to be unique
        if (mainId == null) {
            return true;
        }

        return mainId != null;
    }

    public String parsePairingIdFromDeviceName(String input) {
        if (input == null || input.isEmpty())
            return null;
        // Regular expression to match the number after "G1_"
        Pattern pattern = Pattern.compile("G1_(\\d+)_");
        Matcher matcher = pattern.matcher(input);

        if (matcher.find()) {
            return matcher.group(1); // Group 1 contains the number
        }
        return null; // Return null if no match is found
    }

    public void savePreferredNextGlassesDeviceId(Context context, String deviceName) {
        context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(SAVED_NEXT_ID_KEY, deviceName)
                .apply();
    }

    public String getPreferredMainDeviceId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(SAVED_NEXT_ID_KEY, null);
    }

    public int getSavedBrightnessValue(Context context) {
        return Integer.parseInt(PreferenceManager.getDefaultSharedPreferences(context)
                .getString(context.getResources().getString(R.string.SHARED_PREF_BRIGHTNESS), "50"));
    }

    public boolean getSavedAutoBrightnessValue(Context context) {
        return PreferenceManager.getDefaultSharedPreferences(context)
                .getBoolean(context.getResources().getString(R.string.SHARED_PREF_AUTO_BRIGHTNESS), false);
    }

    private void savePairedDeviceNames() {
        if (savedNextMainName != null) {
            context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(NEXT_MAIN_DEVICE_KEY, savedNextMainName)
                    .apply();
            Log.d(TAG, "Saved paired device names: " + savedNextMainName);
        }
    }

    private void loadPairedDeviceNames() {
        SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        savedNextMainName = prefs.getString(NEXT_MAIN_DEVICE_KEY, null);
        Log.d(TAG, "Loaded paired device names: " + savedNextMainName);
    }

    public void deleteEvenSharedPreferences(Context context) {
        savePreferredNextGlassesDeviceId(context, null);
        SharedPreferences prefs = context.getSharedPreferences(SHARED_PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
        Log.d(TAG, "Nuked EvenRealities SharedPreferences");
    }

    private void connectToGatt(BluetoothDevice device) {
        if (device == null) {
            Log.e(TAG, "Cannot connect to GATT: device is null");
            return;
        }

        Log.d(TAG, "connectToGatt called for device: " + device.getName() + " (" + device.getAddress() + ")");
        BluetoothAdapter bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            Log.e(TAG, "Bluetooth is disabled or not available. Cannot reconnect to glasses.");
            return;
        }

        // Reset the services waiter based on device name
        Log.d(TAG, "Device identified as main side. Resetting ServicesWaiter.");
        mainServicesWaiter.setTrue();

        // Establish GATT connection based on device name and current connection state
        Log.d(TAG, "Connecting GATT to main side.");
        mainGlassGatt = device.connectGatt(context, false, mainGattCallback);
        isMainConnected = false; // Reset connection state
        Log.d(TAG, "Main GATT connection initiated. isMainConnected set to false.");
    }

    private void reconnectToGatt(BluetoothDevice device) {
        if (isKilled) {
            return;
        }
        connectToGatt(device); // Reuse the connectToGatt method
    }

    private final ScanCallback modernScanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = device.getName();

            // Now you can reference the bluetoothAdapter field if needed:
            if (!bluetoothAdapter.isEnabled()) {
                Log.e(TAG, "Bluetooth is disabled");
                return;
            }

            // Check if next glasses arm filter device
            // if (name == null || !name.contains("Even G1_")) {
            // return;
            // }
            if (name == null || !name.toUpperCase().startsWith("E2:D5")) {
                return;
            }
            Log.d(TAG, " === New Device is Found ===" + name + " " + device.getAddress());
            Log.d(TAG, " === new Glasses Device Information ===");

            // Log all available device information for debugging
            Log.d(TAG, "=== Device Information ===");
            Log.d(TAG, "Device Name: " + name);
            Log.d(TAG, "Device Address: " + device.getAddress());
            Log.d(TAG, "Device Type: " + device.getType());
            Log.d(TAG, "Device Class: " + device.getBluetoothClass());
            Log.d(TAG, "Bond State: " + device.getBondState());

            // Try to get additional device information using reflection
            // try {
            // // Try to get the full device name (might contain serial number)
            // Method getAliasMethod = device.getClass().getMethod("getAlias");
            // String alias = (String) getAliasMethod.invoke(device);
            // Log.d(TAG, "Device Alias: " + alias);
            // } catch (Exception e) {
            // Log.d(TAG, "Could not get device alias: " + e.getMessage());
            // }

            // Capture manufacturer data for main device during scanning
            // if (name != null && result.getScanRecord() != null) {
            // SparseArray<byte[]> allManufacturerData =
            // result.getScanRecord().getManufacturerSpecificData();
            // for (int i = 0; i < allManufacturerData.size(); i++) {
            // String parsedDeviceName = parsePairingIdFromDeviceName(name);
            // if (parsedDeviceName != null) {
            // Log.d(TAG, "Parsed Device Name: " + parsedDeviceName);
            // }

            // int manufacturerId = allManufacturerData.keyAt(i);
            // byte[] data = allManufacturerData.valueAt(i);
            // Log.d(TAG, "Main Device Manufacturer ID " + manufacturerId + ": " +
            // bytesToHex(data));

            // // Try to decode serial number from this manufacturer data
            // String decodedSerial = decodeSerialFromManufacturerData(data);
            // if (decodedSerial != null) {
            // Log.d(TAG,
            // "MAIN DEVICE DECODED SERIAL NUMBER from ID " + manufacturerId + ": " +
            // decodedSerial);
            // String[] decoded = decodeEvenG1SerialNumber(decodedSerial);
            // Log.d(TAG, "MAIN DEVICE Style: " + decoded[0] + ", Color: " + decoded[1]);

            // if (preferredG1DeviceId != null &&
            // preferredG1DeviceId.equals(parsedDeviceName)) {
            // EventBus.getDefault()
            // .post(new GlassesSerialNumberEvent(decodedSerial, decoded[0], decoded[1]));
            // }
            // break;
            // }
            // }
            // }

            // Log.d(TAG, "PREFERRED ID: " + preferredG1DeviceId);
            // if (preferredG1DeviceId == null || !name.contains(preferredG1DeviceId + "_"))
            // {
            // Log.d(TAG, "NOT PAIRED GLASSES");
            // return;
            // }

            // Log.d(TAG, "FOUND OUR PREFERRED ID: " + preferredG1DeviceId);

            // If we already have saved device names for main...
            if (savedNextMainName != null) {
                if (!(name.contains(savedNextMainName))) {
                    return; // Not a matching device
                }
            }

            // Identify which side (main)
            stopScan();
            mainDevice = device;
            connectHandler.postDelayed(() -> {
                attemptGattConnection(mainDevice);
            }, 0);
        }

        @Override
        public void onScanFailed(int errorCode) {
            Log.e(TAG, "Scan failed with error: " + errorCode);
        }
    };

    private void resetAllBondsAndState() {
        Log.d(TAG, "Resetting ALL bonds and internal state for complete fresh start");

        // Remove both bonds if devices exist
        if (mainDevice != null) {
            removeBond(mainDevice);
        }

        // Reset all internal state
        isMainConnected = false;

        // Clear saved device names
        pendingSavedNextMainName = null;

        // Close any existing GATT connections
        if (mainGlassGatt != null) {
            mainGlassGatt.disconnect();
            mainGlassGatt.close();
            mainGlassGatt = null;
        }

        // Wait briefly for bond removal to complete
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Log.d(TAG, "Restarting scan after complete bond/state reset");
            connectionState = SmartGlassesConnectionState.SCANNING;
            connectionEvent(connectionState);
            startScan();
        }, 2000);
    }

    /**
     * Handles a device with a valid bond
     */
    private void handleValidBond(BluetoothDevice device, boolean isLeft) {
        Log.d(TAG, "Handling valid bond for " + (isLeft ? "left" : "right") + " glass");

        // Update state

        // If both glasses are bonded, connect to GATT
        if (mainDevice != null) {
            Log.d(TAG, "Both glasses have valid bonds - ready to connect to GATT");

            connectHandler.postDelayed(() -> {
                attemptGattConnection(mainDevice);
            }, 0);
        } else {
            // Continue scanning for the other glass
            Log.d(TAG, "Still need to find " + (isLeft ? "right" : "left") + " glass - resuming scan");
            startScan();
        }
    }

    /**
     * Removes an existing bond with a Bluetooth device to force fresh pairing
     */
    private boolean removeBond(BluetoothDevice device) {
        try {
            if (device == null) {
                Log.e(TAG, "Cannot remove bond: device is null");
                return false;
            }

            Method method = device.getClass().getMethod("removeBond");
            boolean result = (Boolean) method.invoke(device);
            Log.d(TAG, "Removing bond for device " + device.getName() + ", result: " + result);
            return result;
        } catch (Exception e) {
            Log.e(TAG, "Error removing bond: " + e.getMessage(), e);
            return false;
        }
    }

    @Override
    public void connectToSmartGlasses(SmartGlassesDevice device) {
        // Register bonding receiver

        Log.d(TAG, "try to ConnectToSmartGlassesing deviceModelName:" + device.deviceModelName + "  deviceAddress:"
                + device.deviceAddress);

        preferredMainDeviceId = getPreferredMainDeviceId(context);

        if (!bluetoothAdapter.isEnabled()) {
            return;
        }

        // Start scanning for devices
        if (device.deviceModelName != null && device.deviceAddress != null) {
            stopScan();
            mainDevice = bluetoothAdapter.getRemoteDevice(device.deviceAddress);
            connectHandler.postDelayed(() -> {
                attemptGattConnection(mainDevice);
            }, 0);
        } else {
            stopScan();
            connectionState = SmartGlassesConnectionState.SCANNING;
            connectionEvent(connectionState);
            startScan();
        }

    }

    private void startScan() {
        BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner == null) {
            Log.e(TAG, "BluetoothLeScanner not available.");
            return;
        }

        // Optionally, define filters if needed
        List<ScanFilter> filters = new ArrayList<>();
        // For example, to filter by device name:
        // filters.add(new ScanFilter.Builder().setDeviceName("Even G1_").build());

        // Set desired scan settings
        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        // Start scanning
        isScanning = true;
        scanner.startScan(filters, settings, modernScanCallback);
        scanner.flushPendingScanResults(modernScanCallback);
        Log.d(TAG, "CALL START SCAN - Started scanning for devices...");

        // Ensure scanning state is immediately communicated to UI
        connectionState = SmartGlassesConnectionState.SCANNING;
        connectionEvent(connectionState);

        // Stop the scan after some time (e.g., 10-15s instead of 60 to avoid
        // throttling)
        // handler.postDelayed(() -> stopScan(), 10000);
    }

    private void stopScan() {
        BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner != null) {
            scanner.stopScan(modernScanCallback);
        }
        isScanning = false;
        Log.d(TAG, "Stopped scanning for devices");
        if (bleScanCallback != null && isScanningForCompatibleDevices) {
            scanner.stopScan(bleScanCallback);
            isScanningForCompatibleDevices = false;
        }

    }

    private void bondDevice(BluetoothDevice device) {
        try {
            Log.d(TAG, "Attempting to bond with device: " + device.getName());
            Method method = device.getClass().getMethod("createBond");
            method.invoke(device);
        } catch (Exception e) {
            Log.e(TAG, "Bonding failed: " + e.getMessage());
        }
    }

    private void attemptGattConnection(BluetoothDevice device) {
        // if (!isKilled)

        if (device == null) {
            Log.d(TAG, "Cannot connect to GATT: Device is null");
            return;
        }

        String deviceName = device.getName();
        if (deviceName == null) {
            Log.d(TAG, "Skipping null device name: " + device.getAddress()
                    + "... this means something horriffic has occured. Look into this.");
            return;
        }

        Log.d(TAG, "attemptGattConnection called for device: " + deviceName + " (" + device.getAddress() + ")");

        connectionState = SmartGlassesConnectionState.CONNECTING;
        Log.d(TAG, "Setting connectionState to CONNECTING. Notifying connectionEvent.");
        connectionEvent(connectionState);

        connectLeftDevice(device);
    }

    private void connectLeftDevice(BluetoothDevice device) {
        if (mainGlassGatt == null) {
            Log.d(TAG, "Attempting GATT connection for Main Glass...");
            mainGlassGatt = device.connectGatt(context, false, mainGattCallback);
            isMainConnected = false;
            Log.d(TAG, "Main GATT connection initiated. isMainConnected set to false.");
        } else {
            Log.d(TAG, "Main Glass GATT already exists");
        }
    }

    private byte[] createTextPackage(String text, int currentPage, int totalPages, int screenStatus) {
        byte[] textBytes = text.getBytes();
        ByteBuffer buffer = ByteBuffer.allocate(9 + textBytes.length);
        buffer.put((byte) 0x4E);
        buffer.put((byte) (currentSeq++ & 0xFF));
        buffer.put((byte) 1);
        buffer.put((byte) 0);
        buffer.put((byte) screenStatus);
        buffer.put((byte) 0);
        buffer.put((byte) 0);
        buffer.put((byte) currentPage);
        buffer.put((byte) totalPages);
        buffer.put(textBytes);

        return buffer.array();
    }

    private void sendDataSequentially(byte[] data) {
        sendDataSequentially(data, false);
    }

    private void sendDataSequentially(List<byte[]> data) {
        sendDataSequentially(data, false);
    }

    // private void sendDataSequentially(byte[] data, boolean onlyLeft) {
    // if (stopper) return;
    // stopper = true;
    //
    // new Thread(() -> {
    // try {
    // if (leftGlassGatt != null && leftTxChar != null) {
    // leftTxChar.setValue(data);
    // leftGlassGatt.writeCharacteristic(leftTxChar);
    // Thread.sleep(DELAY_BETWEEN_SENDS_MS);
    // }
    //
    // if (!onlyLeft && rightGlassGatt != null && rightTxChar != null) {
    // rightTxChar.setValue(data);
    // rightGlassGatt.writeCharacteristic(rightTxChar);
    // Thread.sleep(DELAY_BETWEEN_SENDS_MS);
    // }
    // stopper = false;
    // } catch (InterruptedException e) {
    // Log.e(TAG, "Error sending data: " + e.getMessage());
    // }
    // }).start();
    // }

    // Data class to represent a send request
    private class SendRequest {
        final byte[] data;
        final boolean onlyLeft;
        final boolean onlyRight;
        public int waitTime = -1;

        SendRequest(byte[] data, boolean onlyLeft, boolean onlyRight) {
            this.data = data;
            this.onlyLeft = onlyLeft;
            this.onlyRight = onlyRight;
        }

        SendRequest(byte[] data, boolean onlyLeft, boolean onlyRight, int waitTime) {
            this.data = data;
            this.onlyLeft = onlyLeft;
            this.onlyRight = onlyRight;
            this.waitTime = waitTime;
        }
    }

    // Queue to hold pending requests
    private final BlockingQueue<SendRequest[]> sendQueue = new LinkedBlockingQueue<>();

    private volatile boolean isWorkerRunning = false;

    // Non-blocking function to add new send request
    private void sendDataSequentially(byte[] data, boolean onlyLeft) {
        SendRequest[] chunks = { new SendRequest(data, onlyLeft, false) };
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    // Non-blocking function to add new send request
    private void sendDataSequentially(byte[] data, boolean onlyLeft, int waitTime) {
        SendRequest[] chunks = { new SendRequest(data, onlyLeft, false, waitTime) };
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    // Overloaded function to handle multiple chunks (List<byte[]>)
    private void sendDataSequentially(List<byte[]> data, boolean onlyLeft) {
        sendDataSequentially(data, onlyLeft, false);
    }

    private void sendDataSequentially(byte[] data, boolean onlyLeft, boolean onlyRight) {
        SendRequest[] chunks = { new SendRequest(data, onlyLeft, onlyRight) };
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    private void sendDataSequentially(byte[] data, boolean onlyLeft, boolean onlyRight, int waitTime) {
        SendRequest[] chunks = { new SendRequest(data, onlyLeft, onlyRight, waitTime) };
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    private void sendDataSequentially(List<byte[]> data, boolean onlyLeft, boolean onlyRight) {
        SendRequest[] chunks = new SendRequest[data.size()];
        for (int i = 0; i < data.size(); i++) {
            chunks[i] = new SendRequest(data.get(i), onlyLeft, onlyRight);
        }
        sendQueue.offer(chunks);
        startWorkerIfNeeded();
    }

    // Start the worker thread if it's not already running
    private synchronized void startWorkerIfNeeded() {
        if (!isWorkerRunning) {
            isWorkerRunning = true;
            new Thread(this::processQueue, "MentraNextSGCProcessQueue").start();
        }
    }

    public class BooleanWaiter {
        private boolean flag = true; // initially true

        public synchronized void waitWhileTrue() throws InterruptedException {
            while (flag) {
                wait();
            }
        }

        public synchronized void setTrue() {
            flag = true;
        }

        public synchronized void setFalse() {
            flag = false;
            notifyAll();
        }
    }

    private final BooleanWaiter mainWaiter = new BooleanWaiter();
    private final BooleanWaiter mainServicesWaiter = new BooleanWaiter();
    private final long INITIAL_CONNECTION_DELAY_MS = 350; // Adjust this value as needed

    private void processQueue() {
        // First wait until the services are setup and ready to receive data
        Log.d(TAG, "PROC_QUEUE - waiting on services waiters");
        try {
            mainServicesWaiter.waitWhileTrue();
        } catch (InterruptedException e) {
            Log.e(TAG, "Interrupted waiting for descriptor writes: " + e);
        }
        Log.d(TAG, "PROC_QUEUE - DONE waiting on services waiters");

        while (!isKilled) {
            try {
                // Make sure services are ready before processing requests
                mainServicesWaiter.waitWhileTrue();

                // This will block until data is available - no CPU spinning!
                SendRequest[] requests = sendQueue.take();

                for (SendRequest request : requests) {
                    if (request == null) {
                        isWorkerRunning = false;
                        break;
                    }

                    try {
                        // Force an initial delay so BLE gets all setup
                        long timeSinceConnection = System.currentTimeMillis() - lastConnectionTimestamp;
                        if (timeSinceConnection < INITIAL_CONNECTION_DELAY_MS) {
                            Thread.sleep(INITIAL_CONNECTION_DELAY_MS - timeSinceConnection);
                        }

                        // Send to main glass
                        if (!request.onlyRight && mainGlassGatt != null && mainTxChar != null && isMainConnected) {
                            mainWaiter.setTrue();
                            mainTxChar.setValue(request.data);
                            mainGlassGatt.writeCharacteristic(mainTxChar);
                            lastSendTimestamp = System.currentTimeMillis();
                        }

                        mainWaiter.waitWhileTrue();

                        Thread.sleep(DELAY_BETWEEN_CHUNKS_SEND);

                        // If the packet asked us to do a delay, then do it
                        if (request.waitTime != -1) {
                            Thread.sleep(request.waitTime);
                        }
                    } catch (InterruptedException e) {
                        Log.e(TAG, "Error sending data: " + e.getMessage());
                        if (isKilled)
                            break;
                    }
                }
            } catch (InterruptedException e) {
                if (isKilled) {
                    Log.d(TAG, "Process queue thread interrupted - shutting down");
                    break;
                }
                Log.e(TAG, "Error in queue processing: " + e.getMessage());
            }
        }

        Log.d(TAG, "Process queue thread exiting");
    }

    // @Override
    // public void displayReferenceCardSimple(String title, String body, int
    // lingerTimeMs) {
    // displayReferenceCardSimple(title, body, lingerTimeMs);
    // }

    private final int NOTIFICATION = 0x4B; // Notification command

    private String createNotificationJson(String appIdentifier, String title, String subtitle, String message) {
        long currentTime = System.currentTimeMillis() / 1000L; // Unix timestamp in seconds
        String currentDate = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date()); // Date
        // format
        // for
        // 'date'
        // field

        NCSNotification ncsNotification = new NCSNotification(
                notificationNum++, // Increment sequence ID for uniqueness
                1, // type (e.g., 1 = notification type)
                appIdentifier,
                title,
                subtitle,
                message,
                (int) currentTime, // Cast long to int to match Python
                currentDate, // Add the current date to the notification
                "AugmentOS" // display_name
        );

        Notification notification = new Notification(ncsNotification, "Add");

        return gson.toJson(notification);
    }

    class Notification {
        NCSNotification ncs_notification;
        String type;

        public Notification() {
            // Default constructor
        }

        public Notification(NCSNotification ncs_notification, String type) {
            this.ncs_notification = ncs_notification;
            this.type = type;
        }
    }

    class NCSNotification {
        int msg_id;
        int type;
        String app_identifier;
        String title;
        String subtitle;
        String message;
        int time_s; // Changed from long to int for consistency
        String date; // Added to match Python's date field
        String display_name;

        public NCSNotification(int msg_id, int type, String app_identifier, String title, String subtitle,
                String message, int time_s, String date, String display_name) {
            this.msg_id = msg_id;
            this.type = type;
            this.app_identifier = app_identifier;
            this.title = title;
            this.subtitle = subtitle;
            this.message = message;
            this.time_s = time_s;
            this.date = date; // Initialize the date field
            this.display_name = display_name;
        }
    }

    private List<byte[]> createNotificationChunks(String json) {
        final int MAX_CHUNK_SIZE = 176; // 180 - 4 header bytes
        byte[] jsonBytes = json.getBytes(StandardCharsets.UTF_8);
        int totalChunks = (int) Math.ceil((double) jsonBytes.length / MAX_CHUNK_SIZE);

        List<byte[]> chunks = new ArrayList<>();
        for (int i = 0; i < totalChunks; i++) {
            int start = i * MAX_CHUNK_SIZE;
            int end = Math.min(start + MAX_CHUNK_SIZE, jsonBytes.length);
            byte[] payloadChunk = Arrays.copyOfRange(jsonBytes, start, end);

            // Create the header
            byte[] header = new byte[] {
                    (byte) NOTIFICATION,
                    0x00, // notify_id (can be updated as needed)
                    (byte) totalChunks,
                    (byte) i
            };

            // Combine header and payload
            ByteBuffer chunk = ByteBuffer.allocate(header.length + payloadChunk.length);
            chunk.put(header);
            chunk.put(payloadChunk);

            chunks.add(chunk.array());
        }

        return chunks;
    }

    @Override
    public void displayReferenceCardSimple(String title, String body) {
        if (!isConnected()) {
            Log.d(TAG, "Not connected to glasses");
            return;
        }

        List<byte[]> chunks = createTextWallChunks(title + "\n\n" + body);
        for (int i = 0; i < chunks.size(); i++) {
            byte[] chunk = chunks.get(i);
            boolean isLastChunk = (i == chunks.size() - 1);

            if (isLastChunk) {
                sendDataSequentially(chunk, false);
            } else {
                sendDataSequentially(chunk, false, 300);
            }
        }
        Log.d(TAG, "Send simple reference card");
    }

    @Override
    public void destroy() {
        Log.d(TAG, "MentraNextSGC ONDESTROY");
        showHomeScreen();
        isKilled = true;

        // stop BLE scanning
        stopScan();

        // disable the microphone
        setMicEnabled(false, 0);

        // stop sending heartbeat
        stopHeartbeat();

        // stop sending micbeat
        stopMicBeat();

        // Stop periodic notifications
        stopPeriodicNotifications();

        // Stop periodic text wall
        // stopPeriodicNotifications();

        if (mainGlassGatt != null) {
            mainGlassGatt.disconnect();
            mainGlassGatt.close();
            mainGlassGatt = null;
        }

        mainTaskMandler.removeCallbacksAndMessages(null);

        if (handler != null)
            handler.removeCallbacksAndMessages(null);
        if (heartbeatHandler != null)
            heartbeatHandler.removeCallbacks(heartbeatRunnable);
        if (whiteListHandler != null)
            whiteListHandler.removeCallbacksAndMessages(null);
        if (micEnableHandler != null)
            micEnableHandler.removeCallbacksAndMessages(null);
        if (notificationHandler != null)
            notificationHandler.removeCallbacks(notificationRunnable);
        if (textWallHandler != null)
            textWallHandler.removeCallbacks(textWallRunnable);
        // if (goHomeHandler != null)
        // goHomeHandler.removeCallbacks(goHomeRunnable);
        if (findCompatibleDevicesHandler != null)
            findCompatibleDevicesHandler.removeCallbacksAndMessages(null);
        if (connectHandler != null)
            connectHandler.removeCallbacksAndMessages(null);
        if (retryBondHandler != null)
            retryBondHandler.removeCallbacksAndMessages(null);
        if (characteristicHandler != null) {
            characteristicHandler.removeCallbacksAndMessages(null);
        }
        if (reconnectHandler != null) {
            reconnectHandler.removeCallbacksAndMessages(null);
        }
        if (mainConnectionTimeoutHandler != null && mainConnectionTimeoutRunnable != null) {
            mainConnectionTimeoutHandler.removeCallbacks(mainConnectionTimeoutRunnable);
        }

        if (queryBatteryStatusHandler != null && queryBatteryStatusHandler != null) {
            queryBatteryStatusHandler.removeCallbacksAndMessages(null);
        }

        // free LC3 decoder
        if (lc3DecoderPtr != 0) {
            L3cCpp.freeDecoder(lc3DecoderPtr);
            lc3DecoderPtr = 0;
        }

        sendQueue.clear();

        // Add a dummy element to unblock the take() call if needed
        sendQueue.offer(new SendRequest[0]); // is this needed?

        isWorkerRunning = false;

        isMainConnected = false;

        Log.d(TAG, "MentraNextSGC cleanup complete");
    }

    @Override
    public boolean isConnected() {
        return connectionState == SmartGlassesConnectionState.CONNECTED;
    }

    // Remaining methods
    @Override
    public void showNaturalLanguageCommandScreen(String prompt, String naturalLanguageInput) {
    }

    @Override
    public void updateNaturalLanguageCommandScreen(String naturalLanguageArgs) {
    }

    @Override
    public void scrollingTextViewIntermediateText(String text) {
    }

    @Override
    public void scrollingTextViewFinalText(String text) {
    }

    @Override
    public void stopScrollingTextViewMode() {
    }

    @Override
    public void displayPromptView(String title, String[] options) {
        Log.d(TAG, "displayPromptView text:" + title);
    }

    @Override
    public void displayTextLine(String text) {
        Log.d(TAG, "displayTextLine text:" + text);
    }

    @Override
    public void displayBitmap(Bitmap bmp) {
        try {
            byte[] bmpBytes = BitmapJavaUtils.convertBitmapTo1BitBmpBytes(bmp, false);
            displayBitmapImage(bmpBytes);
        } catch (Exception e) {
            Log.e(TAG, e.getMessage());
        }
    }

    public void blankScreen() {
    }

    public void displayDoubleTextWall(String textTop, String textBottom) {
        Log.d(TAG, "displayDoubleTextWall textTop:" + textTop + " textBottom:" + textBottom);
        if (updatingScreen) {
            return;
        }
        List<byte[]> chunks = createDoubleTextWallChunks(textTop, textBottom);
        sendChunks(chunks);
    }

    public void showHomeScreen() {
        Log.d(TAG, "showHomeScreen ");
        displayTextWall(" ");

        if (lastThingDisplayedWasAnImage) {
            // clearNextScreen();
            lastThingDisplayedWasAnImage = false;
        }
    }

    public void clearNextGlassesScreen() {
        Log.d(TAG, "Clearing NextGlasses screen");
        byte[] exitCommand = new byte[] { (byte) 0x18 };
        // sendDataSequentially(exitCommand, false);
        byte[] theClearBitmapOrSomething = loadEmptyBmpFromAssets();
        Bitmap bmp = BitmapJavaUtils.bytesToBitmap(theClearBitmapOrSomething);
        try {
            byte[] bmpBytes = BitmapJavaUtils.convertBitmapTo1BitBmpBytes(bmp, false);
            displayBitmapImage(bmpBytes);
        } catch (Exception e) {
            Log.e(TAG, "Error displaying clear bitmap: " + e.getMessage());
        }
    }

    @Override
    public void setFontSize(SmartGlassesFontSize fontSize) {
    }

    public void displayRowsCard(String[] rowStrings) {
    }

    public void displayBulletList(String title, String[] bullets) {
    }

    public void displayReferenceCardImage(String title, String body, String imgUrl) {
    }

    public void displayTextWall(String text) {
        Log.d(TAG, "displayTextWall updatingScreen: " + updatingScreen + " text:" + text);

        if (updatingScreen) {
            return;
        }
        List<byte[]> chunks = createTextWallChunks(text);
        sendChunks(chunks);
    }

    @Override
    public void setUpdatingScreen(boolean updatingScreen) {
        this.updatingScreen = updatingScreen;
    }

    public void setFontSizes() {
    }

    // Heartbeat methods for g1
    private byte[] constructHeartbeat() {
        ByteBuffer buffer = ByteBuffer.allocate(6);
        buffer.put((byte) 0x25);
        buffer.put((byte) 6);
        buffer.put((byte) (currentSeq & 0xFF));
        buffer.put((byte) 0x00);
        buffer.put((byte) 0x04);
        buffer.put((byte) (currentSeq++ & 0xFF));
        return buffer.array();
    }

    // get the final binary packet
    private byte[] generateJsonCommandBytes(PhoneToGlasses phoneToGlasses) {
        final byte[] contentBytes = phoneToGlasses.toByteArray();
        final ByteBuffer chunk = ByteBuffer.allocate(contentBytes.length + 1);

        chunk.put(PACKET_TYPE_PROTOBUF);
        chunk.put(contentBytes);
        return chunk.array();
    }

    // Heartbeat methods for Next Glass
    private byte[] constructHeartbeatForNextGlasses() {
        // NextGlassesHeartBeat nextGlassesHeartBeat = new NextGlassesHeartBeat();
        // nextGlassesHeartBeat.setType("ping");
        // nextGlassesHeartBeat.setMsg_id("ping_001");

        // final String jsonData = gson.toJson(nextGlassesHeartBeat);
        // Log.d(TAG, "constructHeartbeatForNextGlasses " + jsonData);

        // byte[] contentBytes = jsonData.getBytes(StandardCharsets.UTF_8);

        // ByteBuffer chunk = ByteBuffer.allocate(contentBytes.length + 1);

        // chunk.put(PACKET_TYPE_JSON);
        // chunk.put(contentBytes);

        // byte[] result = new byte[chunk.position()];
        // chunk.flip();
        // chunk.get(result);

        PingRequest pingNewBuilder = PingRequest.newBuilder()
                .build();

        // Create the PhoneToGlasses using its builder and set the DisplayText
        PhoneToGlasses phoneToGlasses = PhoneToGlasses.newBuilder()
                .setPing(pingNewBuilder) // This expects a DisplayText object, not a builder
                .build();

        return generateJsonCommandBytes(phoneToGlasses);
    }

    private byte[] constructBatteryLevelQuery() {
        ByteBuffer buffer = ByteBuffer.allocate(2);
        buffer.put((byte) 0x2C); // Command
        buffer.put((byte) 0x01); // use 0x02 for iOS
        return buffer.array();
    }

    private void startHeartbeat(int delay) {
        Log.d(TAG, "Starting heartbeat");
        if (heartbeatCount > 0)
            stopHeartbeat();

        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                sendHeartbeat();
                // sendLoremIpsum();

                // quickRestartNextGlasses();

                heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
            }
        };

        heartbeatHandler.postDelayed(heartbeatRunnable, delay);
    }

    // periodically send a mic ON request so it never turns off
    private void startMicBeat(int delay) {
        Log.d(TAG, "Starting micbeat");
        if (micBeatCount > 0) {
            stopMicBeat();
        }
        setMicEnabled(true, 10);

        micBeatRunnable = new Runnable() {
            @Override
            public void run() {
                Log.d(TAG, "SENDING MIC BEAT");
                setMicEnabled(shouldUseGlassesMic, 1);
                micBeatHandler.postDelayed(this, MICBEAT_INTERVAL_MS);
            }
        };

        micBeatHandler.postDelayed(micBeatRunnable, delay);
    }

    @Override
    public void findCompatibleDeviceNames() {
        Log.d(TAG, "findCompatibleDeviceNames action");
        findCompatibleDeviceNamesHandler();

    }

    private void findCompatibleDeviceNamesHandler() {
        if (isScanningForCompatibleDevices) {
            Log.d(TAG, "Scan already in progress, skipping...");
            return;
        }
        isScanningForCompatibleDevices = true;
        BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
        if (scanner == null) {
            Log.e(TAG, "BluetoothLeScanner not available");
            isScanningForCompatibleDevices = false;
            return;
        }

        List<String> foundDeviceNames = new ArrayList<>();
        if (findCompatibleDevicesHandler == null) {
            findCompatibleDevicesHandler = new Handler(Looper.getMainLooper());
        }

        // Optional: add filters if you want to narrow the scan
        List<ScanFilter> filters = new ArrayList<>();
        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
                .build();

        // Create a modern ScanCallback instead of the deprecated LeScanCallback
        bleScanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice device = result.getDevice();
                String name = device.getName();
                String address = device.getAddress();
                // if (name != null && name.contains("Even G1_") && name.contains("_L_")) {
                if (name != null && name.toUpperCase().startsWith("E2:D5")) {
                    Log.d(TAG, "bleScanCallback onScanResult: " + name + " address " + device.getAddress());
                    synchronized (foundDeviceNames) {
                        if (!foundDeviceNames.contains(name)) {
                            foundDeviceNames.add(name);
                            Log.d(TAG, "Found smart glasses: " + name);
                            // String adjustedName = parsePairingIdFromDeviceName(name);
                            String adjustedName = smartGlassesDevice.deviceModelName;// parsePairingIdFromDeviceName(name);
                            EventBus.getDefault().post(
                                    new GlassesBluetoothSearchDiscoverEvent(
                                            smartGlassesDevice.deviceModelName,
                                            adjustedName,
                                            address));
                        }
                    }
                }
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                // If needed, handle batch results here
            }

            @Override
            public void onScanFailed(int errorCode) {
                Log.e(TAG, "BLE scan failed with code: " + errorCode);
            }
        };

        // Start scanning
        scanner.startScan(filters, settings, bleScanCallback);
        Log.d(TAG, "Started scanning for smart glasses with BluetoothLeScanner...");
        scanner.flushPendingScanResults(bleScanCallback);
        // Stop scanning after 10 seconds (adjust as needed)
        findCompatibleDevicesHandler.postDelayed(() -> {
            if (bleScanCallback != null) {
                scanner.stopScan(bleScanCallback);
            }
            isScanningForCompatibleDevices = false;
            bleScanCallback = null;
            Log.d(TAG, "Stopped scanning for smart glasses.");
            EventBus.getDefault().post(
                    new GlassesBluetoothSearchStopEvent(
                            smartGlassesDevice.deviceModelName));
        }, 10000);
    }

    private void sendWhiteListCommand(int delay) {
        if (whiteListedAlready) {
            return;
        }
        whiteListedAlready = true;

        Log.d(TAG, "Sending whitelist command");
        whiteListHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                List<byte[]> chunks = getWhitelistChunks();
                sendDataSequentially(chunks, false);
                // for (byte[] chunk : chunks) {
                // Log.d(TAG, "Sending this chunk for white list:" + bytesToUtf8(chunk));
                // sendDataSequentially(chunk, false);
                //
                //// // Sleep for 100 milliseconds between sending each chunk
                //// try {
                //// Thread.sleep(150);
                //// } catch (InterruptedException e) {
                //// e.printStackTrace();
                //// }
                // }
            }
        }, delay);
    }

    private void stopHeartbeat() {
        if (heartbeatHandler != null) {
            heartbeatHandler.removeCallbacksAndMessages(null);
            heartbeatHandler.removeCallbacksAndMessages(heartbeatRunnable);
            heartbeatCount = 0;
        }
    }

    private void stopMicBeat() {
        setMicEnabled(false, 10);
        if (micBeatHandler != null) {
            micBeatHandler.removeCallbacksAndMessages(null);
            micBeatHandler.removeCallbacksAndMessages(micBeatRunnable);
            micBeatRunnable = null;
            micBeatCount = 0;
        }
    }

    private void sendHeartbeat() {
        // for G1
        // byte[] heartbeatPacket = constructHeartbeat();
        // for Mentra Nex Glasses
        byte[] heartbeatPacket = constructHeartbeatForNextGlasses();
        // Log.d(TAG, "Sending heartbeat: " + bytesToHex(heartbeatPacket));

        sendDataSequentially(heartbeatPacket, false, 100);

        if (batteryMain == -1 || heartbeatCount % 10 == 0) {
            queryBatteryStatusHandler.postDelayed(this::queryBatteryStatus, 500);
        }
        // queryBatteryStatusHandler.postDelayed(this::queryBatteryStatus, 500);

        heartbeatCount++;
    }

    private void queryBatteryStatus() {
        byte[] batteryQueryPacket = constructBatteryLevelQuery();
        // Log.d(TAG, "Sending battery status query: " +
        // bytesToHex(batteryQueryPacket));

        sendDataSequentially(batteryQueryPacket, false, 250);
    }

    public void sendBrightnessCommand(int brightness, boolean autoLight) {
        // Validate brightness range

        int validBrightness;
        if (brightness != -1) {
            validBrightness = (brightness * 63) / 100;
        } else {
            validBrightness = (30 * 63) / 100;
        }

        // Construct the command
        ByteBuffer buffer = ByteBuffer.allocate(3);
        buffer.put((byte) 0x01); // Command
        buffer.put((byte) validBrightness); // Brightness level (0~63)
        buffer.put((byte) (autoLight ? 1 : 0)); // Auto light (0 = close, 1 = open)

        sendDataSequentially(buffer.array(), false, 100);

        Log.d(TAG, "Sent auto light brightness command => Brightness: " + brightness + ", Auto Light: "
                + (autoLight ? "Open" : "Close"));

        // send to AugmentOS core
        // if (autoLight) {
        // EventBus.getDefault().post(new BrightnessLevelEvent(autoLight));
        // } else {
        // EventBus.getDefault().post(new BrightnessLevelEvent(brightness));
        // }
    }

    public void sendHeadUpAngleCommand(int headUpAngle) {
        // Validate headUpAngle range (0 ~ 60)
        if (headUpAngle < 0) {
            headUpAngle = 0;
        } else if (headUpAngle > 60) {
            headUpAngle = 60;
        }

        // Construct the command
        ByteBuffer buffer = ByteBuffer.allocate(3);
        buffer.put((byte) 0x0B); // Command for configuring headUp angle
        buffer.put((byte) headUpAngle); // Angle value (0~60)
        buffer.put((byte) 0x01); // Level (fixed at 0x01)

        sendDataSequentially(buffer.array(), false, 100);

        Log.d(TAG, "Sent headUp angle command => Angle: " + headUpAngle);
        EventBus.getDefault().post(new HeadUpAngleEvent(headUpAngle));
    }

    public void sendDashboardPositionCommand(int height, int depth) {
        // clamp height and depth to 0-8 and 1-9 respectively:
        height = Math.max(0, Math.min(height, 8));
        depth = Math.max(1, Math.min(depth, 9));

        int globalCounter = 0;// TODO: must be incremented each time this command is sent!

        ByteBuffer buffer = ByteBuffer.allocate(8);
        buffer.put((byte) 0x26); // Command for dashboard height
        buffer.put((byte) 0x08); // Length
        buffer.put((byte) 0x00); // Sequence
        buffer.put((byte) (globalCounter & 0xFF));// counter
        buffer.put((byte) 0x02); // Fixed value
        buffer.put((byte) 0x01); // State ON
        buffer.put((byte) height); // Height value (0-8)
        buffer.put((byte) depth); // Depth value (0-9)

        sendDataSequentially(buffer.array(), false, 100);

        Log.d(TAG, "Sent dashboard height/depth command => Height: " + height + ", Depth: " + depth);
        // EventBus.getDefault().post(new DashboardPositionEvent(height, depth));
    }

    @Override
    public void updateGlassesBrightness(int brightness) {
        Log.d(TAG, "Updating glasses brightness: " + brightness);
        sendBrightnessCommand(brightness, false);
    }

    @Override
    public void updateGlassesAutoBrightness(boolean autoBrightness) {
        Log.d(TAG, "Updating glasses auto brightness: " + autoBrightness);
        // sendBrightnessCommand(-1, autoBrightness);
        sendPeriodicTextWall();
    }

    @Override
    public void updateGlassesHeadUpAngle(int headUpAngle) {
        sendHeadUpAngleCommand(headUpAngle);
    }

    @Override
    public void updateGlassesDepthHeight(int depth, int height) {
        sendDashboardPositionCommand(height, depth);
    }

    @Override
    public void sendExitCommand() {
        sendDataSequentially(new byte[] { (byte) 0x18 }, false, 100);
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02X ", b));
        }
        return sb.toString().trim();
    }

    // microphone stuff
    public void setMicEnabled(boolean enable, int delay) {
        // Log.d(TAG, "^^^^^^^^^^^^^");
        // Log.d(TAG, "^^^^^^^^^^^^^");
        // Log.d(TAG, "^^^^^^^^^^^^^");
        // Log.d(TAG, "Running set mic enabled: " + enable);
        // Log.d(TAG, "^^^^^^^^^^^^^");
        // Log.d(TAG, "^^^^^^^^^^^^^");
        // Log.d(TAG, "^^^^^^^^^^^^^");

        isMicrophoneEnabled = enable; // Update the state tracker
        EventBus.getDefault().post(new isMicEnabledForFrontendEvent(enable));
        micEnableHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isConnected()) {
                    Log.d(TAG, "Tryna start mic: Not connected to glasses");
                    return;
                }

                byte command = 0x0E; // Command for MIC control
                byte enableByte = (byte) (enable ? 1 : 0); // 1 to enable, 0 to disable

                ByteBuffer buffer = ByteBuffer.allocate(2);
                buffer.put(command);
                buffer.put(enableByte);

                sendDataSequentially(buffer.array(), false, true, 300); // wait some time to setup the mic
                Log.d(TAG, "Sent MIC command: " + bytesToHex(buffer.array()));
            }
        }, delay);
    }

    // notifications
    private void startPeriodicNotifications(int delay) {
        if (notifysStarted) {
            return;
        }
        notifysStarted = true;

        notificationRunnable = new Runnable() {
            @Override
            public void run() {
                // Send notification
                sendPeriodicNotification();

                // Schedule the next notification
                notificationHandler.postDelayed(this, 12000);
            }
        };

        // Start the first notification after 5 seconds
        notificationHandler.postDelayed(notificationRunnable, delay);
    }

    private void sendPeriodicNotification() {
        if (!isConnected()) {
            Log.d(TAG, "Cannot send notification: Not connected to glasses");
            return;
        }

        // Example notification data (replace with your actual data)
        // String json = createNotificationJson("com.augment.os", "QuestionAnswerer",
        // "How much caffeine in dark chocolate?", "25 to 50 grams per piece");
        String json = createNotificationJson("com.augment.os", "QuestionAnswerer",
                "How much caffeine in dark chocolate?", "25 to 50 grams per piece");
        Log.d(TAG, "the JSON to send: " + json);
        List<byte[]> chunks = createNotificationChunks(json);
        // Log.d(TAG, "THE CHUNKS:");
        // Log.d(TAG, chunks.get(0).toString());
        // Log.d(TAG, chunks.get(1).toString());
        for (byte[] chunk : chunks) {
            Log.d(TAG, "Sent chunk to glasses: " + bytesToUtf8(chunk));
        }

        // Send each chunk with a short sleep between each send
        sendDataSequentially(chunks, false);
        // for (byte[] chunk : chunks) {
        // sendDataSequentially(chunk);
        //
        //// // Sleep for 100 milliseconds between sending each chunk
        //// try {
        //// Thread.sleep(150);
        //// } catch (InterruptedException e) {
        //// e.printStackTrace();
        //// }
        // }

        Log.d(TAG, "Sent periodic notification");
    }

    // text wall debug
    private void startPeriodicTextWall(int delay) {
        if (textWallsStarted) {
            return;
        }
        textWallsStarted = true;

        textWallRunnable = new Runnable() {
            @Override
            public void run() {
                // Send notification
                sendPeriodicTextWall();

                // Schedule the next notification
                textWallHandler.postDelayed(this, 12000);
            }
        };

        // Start the first text wall send after 5 seconds
        textWallHandler.postDelayed(textWallRunnable, delay);
    }

    // Constants for text wall display
    private final int TEXT_COMMAND = 0x4E; // Text command
    private final int DISPLAY_WIDTH = 488;
    private final int DISPLAY_USE_WIDTH = 488; // How much of the display to use
    private final float FONT_MULTIPLIER = 1 / 50.0f;
    private final int OLD_FONT_SIZE = 21; // Font size
    private final float FONT_DIVIDER = 2.0f;
    private final int LINES_PER_SCREEN = 5; // Lines per screen
    private final int MAX_CHUNK_SIZE_DEFAULT = 176; // Maximum chunk size for BLE packets
    private int MAX_CHUNK_SIZE = MAX_CHUNK_SIZE_DEFAULT; // Maximum chunk size for BLE packets
    private int BMP_CHUNK_SIZE = 194;

    // private final int INDENT_SPACES = 32; // Number of spaces to indent
    // text

    private int textSeqNum = 0; // Sequence number for text packets

    // currently only a single page - 1PAGE CHANGE
    private List<byte[]> createTextWallChunks(String text) {
        int margin = 5;

        // Get width of single space character
        int spaceWidth = calculateTextWidth(" ");

        // Calculate effective display width after accounting for Main margins
        // in spaces
        int marginWidth = margin * spaceWidth; // Width of left margin in pixels
        int effectiveWidth = DISPLAY_WIDTH - (2 * marginWidth); // Subtract left and right margins

        // Split text into lines based on effective display width
        List<String> lines = splitIntoLines(text, effectiveWidth);

        // Calculate total pages
        int totalPages = 1; // hard set to 1 since we only do 1 page - 1PAGECHANGE

        List<byte[]> allChunks = new ArrayList<>();

        // Process each page
        for (int page = 0; page < totalPages; page++) {
            // Get lines for current page
            int startLine = page * LINES_PER_SCREEN;
            int endLine = Math.min(startLine + LINES_PER_SCREEN, lines.size());
            List<String> pageLines = lines.subList(startLine, endLine);

            // Combine lines for this page with proper indentation
            StringBuilder pageText = new StringBuilder();

            for (String line : pageLines) {
                // Add the exact number of spaces for indentation
                String indentation = " ".repeat(margin);
                pageText.append(indentation).append(line).append("\n");
            }

            byte[] textBytes = pageText.toString().getBytes(StandardCharsets.UTF_8);
            int totalChunks = (int) Math.ceil((double) textBytes.length / MAX_CHUNK_SIZE);

            // Create chunks for this page
            for (int i = 0; i < totalChunks; i++) {
                int start = i * MAX_CHUNK_SIZE;
                int end = Math.min(start + MAX_CHUNK_SIZE, textBytes.length);
                byte[] payloadChunk = Arrays.copyOfRange(textBytes, start, end);

                // Create header with protocol specifications
                byte screenStatus = 0x71; // New content (0x01) + Text Show (0x70)
                byte[] header = new byte[] {
                        (byte) TEXT_COMMAND, // Command type
                        (byte) textSeqNum, // Sequence number
                        (byte) totalChunks, // Total packages
                        (byte) i, // Current package number
                        screenStatus, // Screen status
                        (byte) 0x00, // new_char_pos0 (high)
                        (byte) 0x00, // new_char_pos1 (low)
                        (byte) page, // Current page number
                        (byte) totalPages // Max page number
                };

                // Combine header and payload
                ByteBuffer chunk = ByteBuffer.allocate(header.length + payloadChunk.length);
                chunk.put(header);
                chunk.put(payloadChunk);

                allChunks.add(chunk.array());
            }

            // Increment sequence number for next page
            textSeqNum = (textSeqNum + 1) % 256;
            break; // hard set to 1 - 1PAGECHANGE
        }

        return allChunks;
    }

    // currently only a single page - 1PAGE CHANGE ,for next glasses
    private byte[] createTextWallChunksForNext(String text) {
        DisplayText textNewBuilder = DisplayText.newBuilder()
                .setText(text)
                .setSize(20)
                .setX(0)
                .setY(0)
                .setFontCode(20)
                .setColor(10000)
                .build();

        Log.d(TAG, "createTextWallChunksForNext " + textNewBuilder.toString());
        // Create the PhoneToGlasses using its builder and set the DisplayText
        PhoneToGlasses phoneToGlasses = PhoneToGlasses.newBuilder()
                .setDisplayText(textNewBuilder) // This expects a DisplayText object, not a builder
                .build();

        return generateJsonCommandBytes(phoneToGlasses);
    }

    // create a VerticalScrollingfor next glasses
    private byte[] createVerticalScrollingTextWallChunksForNext(String text) {
        // DisplayVerticalScrollingText displayText = new
        // DisplayVerticalScrollingText();
        // displayText.setText(text);
        // displayText.setSize(20);
        // final String jsonData = gson.toJson(displayText);

        // Log.d(TAG, "createVerticalScrollingTextWallChunksForNext json " + jsonData);

        // byte[] contentBytes = jsonData.getBytes(StandardCharsets.UTF_8);

        // ByteBuffer chunk = ByteBuffer.allocate(contentBytes.length + 1);

        // chunk.put(PACKET_TYPE_JSON);
        // chunk.put(contentBytes);

        // byte[] result = new byte[chunk.position()];
        // chunk.flip();
        // chunk.get(result);

        DisplayText textNewBuilder = DisplayText.newBuilder()
                .setText("11111")
                .setSize(20)
                .setX(0)
                .setY(0)
                .build();

        // Create the PhoneToGlasses using its builder and set the DisplayText
        PhoneToGlasses phoneToGlasses = PhoneToGlasses.newBuilder()
                .setDisplayText(textNewBuilder) // This expects a DisplayText object, not a builder
                .build();

        return generateJsonCommandBytes(phoneToGlasses);
    }

    // send a tast image and display
    private void startSendingDisplayImageTest() {

        // byte[] exitCommand = new byte[] { (byte) 0x18 };
        // sendDataSequentially(exitCommand, false);

        byte[] theClearBitmapOrSomething = loadEmptyBmpFromAssets();
        Bitmap bmp = BitmapJavaUtils.bytesToBitmap(theClearBitmapOrSomething);
        try {
            byte[] bmpBytes = BitmapJavaUtils.convertBitmapTo1BitBmpBytes(bmp, false);
            displayBitmapImageForNextGlass(bmpBytes);
        } catch (Exception e) {
            Log.e(TAG, "Error displaying clear bitmap: " + e.getMessage());
        }
    }

    private byte[] createSendingImageChunksCommand(char streamId, int totalChunks) {

        // DisplayBitmapCommand displayBitmapCommand = new DisplayBitmapCommand();
        // displayBitmapCommand.setStream_id(streamId);
        // displayBitmapCommand.setTotal_chunks(totalChunks);
        // final String jsonData = gson.toJson(displayBitmapCommand);

        // byte[] contentBytes = jsonData.getBytes(StandardCharsets.UTF_8);

        // ByteBuffer chunk = ByteBuffer.allocate(contentBytes.length + 1);

        // chunk.put(PACKET_TYPE_JSON);
        // chunk.put(contentBytes);

        // byte[] result = new byte[chunk.position()];
        // chunk.flip(); // 切换到读模式
        // chunk.get(result);
        // return result;
        DisplayText textNewBuilder = DisplayText.newBuilder()
                .setText("11111")
                .setSize(20)
                .setX(0)
                .setY(0)
                .build();

        // Create the PhoneToGlasses using its builder and set the DisplayText
        PhoneToGlasses phoneToGlasses = PhoneToGlasses.newBuilder()
                .setDisplayText(textNewBuilder) // This expects a DisplayText object, not a builder
                .build();

        return generateJsonCommandBytes(phoneToGlasses);
    }

    private int calculateTextWidth(String text) {
        int width = 0;
        for (char c : text.toCharArray()) {
            G1FontLoader.FontGlyph glyph = fontLoader.getGlyph(c);
            width += glyph.width + 1; // Add 1 pixel per character for spacing
        }
        return width * 2;
    }

    private List<byte[]> createDoubleTextWallChunks(String text1, String text2) {
        // Define column widths and positions
        final int LEFT_COLUMN_WIDTH = (int) (DISPLAY_WIDTH * 0.5); // 40% of display for left column
        final int RIGHT_COLUMN_START = (int) (DISPLAY_WIDTH * 0.55); // Right column starts at 60%

        // Split texts into lines with specific width constraints
        List<String> lines1 = splitIntoLines(text1, LEFT_COLUMN_WIDTH);
        List<String> lines2 = splitIntoLines(text2, DISPLAY_WIDTH - RIGHT_COLUMN_START);

        // Ensure we have exactly LINES_PER_SCREEN lines (typically 5)
        while (lines1.size() < LINES_PER_SCREEN) {
            lines1.add("");
        }
        while (lines2.size() < LINES_PER_SCREEN) {
            lines2.add("");
        }

        lines1 = lines1.subList(0, LINES_PER_SCREEN);
        lines2 = lines2.subList(0, LINES_PER_SCREEN);

        // Get precise space width
        int spaceWidth = calculateTextWidth(" ");

        // Construct the text output by merging the lines with precise positioning
        StringBuilder pageText = new StringBuilder();
        for (int i = 0; i < LINES_PER_SCREEN; i++) {
            String leftText = lines1.get(i).replace("\u2002", ""); // Drop enspaces
            String rightText = lines2.get(i).replace("\u2002", "");

            // Calculate width of left text in pixels
            int leftTextWidth = calculateTextWidth(leftText);

            // Calculate exactly how many spaces are needed to position the right column
            // correctly
            int spacesNeeded = calculateSpacesForAlignment(leftTextWidth, RIGHT_COLUMN_START, spaceWidth);

            // Log detailed alignment info for debugging
            Log.d(TAG, String.format("Line %d: Left='%s' (width=%dpx) | Spaces=%d | Right='%s'",
                    i, leftText, leftTextWidth, spacesNeeded, rightText));

            // Construct the full line with precise alignment
            pageText.append(leftText)
                    .append(" ".repeat(spacesNeeded))
                    .append(rightText)
                    .append("\n");
        }

        // Convert to bytes and chunk for transmission
        return chunkTextForTransmission(pageText.toString());
    }

    private int calculateSpacesForAlignment(int currentWidth, int targetPosition, int spaceWidth) {
        // Calculate space needed in pixels
        int pixelsNeeded = targetPosition - currentWidth;

        // Calculate spaces needed (with minimum of 1 space for separation)
        if (pixelsNeeded <= 0) {
            return 1; // Ensure at least one space between columns
        }

        // Calculate the exact number of spaces needed
        int spaces = (int) Math.ceil((double) pixelsNeeded / spaceWidth);

        // Cap at a reasonable maximum
        return Math.min(spaces, 100);
    }

    private List<byte[]> chunkTextForTransmission(String text) {
        byte[] textBytes = text.getBytes(StandardCharsets.UTF_8);
        int totalChunks = (int) Math.ceil((double) textBytes.length / MAX_CHUNK_SIZE);

        List<byte[]> allChunks = new ArrayList<>();
        for (int i = 0; i < totalChunks; i++) {
            int start = i * MAX_CHUNK_SIZE;
            int end = Math.min(start + MAX_CHUNK_SIZE, textBytes.length);
            byte[] payloadChunk = Arrays.copyOfRange(textBytes, start, end);

            // Create header with protocol specifications
            byte screenStatus = 0x71; // New content (0x01) + Text Show (0x70)
            byte[] header = new byte[] {
                    (byte) TEXT_COMMAND, // Command type
                    (byte) textSeqNum, // Sequence number
                    (byte) totalChunks, // Total packages
                    (byte) i, // Current package number
                    screenStatus, // Screen status
                    (byte) 0x00, // new_char_pos0 (high)
                    (byte) 0x00, // new_char_pos1 (low)
                    (byte) 0x00, // Current page number (always 0 for now)
                    (byte) 0x01 // Max page number (always 1)
            };

            // Combine header and payload
            ByteBuffer chunk = ByteBuffer.allocate(header.length + payloadChunk.length);
            chunk.put(header);
            chunk.put(payloadChunk);

            allChunks.add(chunk.array());
        }

        // Increment sequence number for next page
        textSeqNum = (textSeqNum + 1) % 256;

        return allChunks;
    }

    private int calculateSubstringWidth(String text, int start, int end) {
        return calculateTextWidth(text.substring(start, end));
    }

    private List<String> splitIntoLines(String text, int maxDisplayWidth) {
        // Replace specific symbols
        text = text.replace("⬆", "^").replace("⟶", "-");

        List<String> lines = new ArrayList<>();

        // Handle empty or single space case
        if (text.isEmpty() || " ".equals(text)) {
            lines.add(text);
            return lines;
        }

        // Split by newlines first
        String[] rawLines = text.split("\n");

        Log.d(TAG, "Splitting text into lines..." + Arrays.toString(rawLines));

        for (String rawLine : rawLines) {
            // Add empty lines for newlines
            if (rawLine.isEmpty()) {
                lines.add("");
                continue;
            }

            int lineLength = rawLine.length();
            int startIndex = 0;

            while (startIndex < lineLength) {
                // Get maximum possible end index
                int endIndex = lineLength;

                // Calculate width of the entire remaining text
                int lineWidth = calculateSubstringWidth(rawLine, startIndex, endIndex);

                Log.d(TAG, "Line length: " + rawLine);
                Log.d(TAG, "Calculating line width: " + lineWidth);

                // If entire line fits, add it and move to next line
                if (lineWidth <= maxDisplayWidth) {
                    lines.add(rawLine.substring(startIndex));
                    break;
                }

                // Binary search to find the maximum number of characters that fit
                int left = startIndex + 1;
                int right = lineLength;
                int bestSplitIndex = startIndex + 1;

                while (left <= right) {
                    int mid = left + (right - left) / 2;
                    int width = calculateSubstringWidth(rawLine, startIndex, mid);

                    if (width <= maxDisplayWidth) {
                        bestSplitIndex = mid;
                        left = mid + 1;
                    } else {
                        right = mid - 1;
                    }
                }

                // Now find a good place to break (preferably at a space)
                int splitIndex = bestSplitIndex;

                // Look for a space to break at
                boolean foundSpace = false;
                for (int i = bestSplitIndex; i > startIndex; i--) {
                    if (rawLine.charAt(i - 1) == ' ') {
                        splitIndex = i;
                        foundSpace = true;
                        break;
                    }
                }

                // If we couldn't find a space in a reasonable range, use the calculated split
                // point
                if (!foundSpace && bestSplitIndex - startIndex > 2) {
                    splitIndex = bestSplitIndex;
                }

                // Add the line
                String line = rawLine.substring(startIndex, splitIndex).trim();
                lines.add(line);

                // Skip any spaces at the beginning of the next line
                while (splitIndex < lineLength && rawLine.charAt(splitIndex) == ' ') {
                    splitIndex++;
                }

                startIndex = splitIndex;
            }
        }

        return lines;
    }

    private void sendPeriodicTextWall() {
        if (!isConnected()) {
            Log.d(TAG, "Cannot send text wall: Not connected to glasses");
            return;
        }

        Log.d(TAG, "^^^^^^^^^^^^^ SENDING DEBUG TEXT WALL");

        // Example text wall content - replace with your actual text content
        String sampleText = "This is an example of a text wall that will be displayed on the glasses. " +
                "It demonstrates how text can be split into multiple pages and displayed sequentially. " +
                "Each page contains multiple lines, and each line is carefully formatted to fit the display width. " +
                "The text continues across multiple pages, showing how longer content can be handled effectively.";
        final boolean isForG1Glasses = false;
        // for g1
        if (isForG1Glasses) {
            List<byte[]> chunks = createTextWallChunks(sampleText);
            // for next glasses
            // Send each chunk with a delay between sends
            for (byte[] chunk : chunks) {
                sendDataSequentially(chunk);

                // try {
                // Thread.sleep(150); // 150ms delay between chunks
                // } catch (InterruptedException e) {
                // e.printStackTrace();
                // }
            }

            // Log.d(TAG, "Sent text wall");
        } else {
            final boolean isDisplayVerticalScrollingText = false;
            if (isDisplayVerticalScrollingText) {
                Log.d(TAG, "Sent scrolling text wall " + sampleText + " to Next Glasses ");

                byte[] singleChunks = createVerticalScrollingTextWallChunksForNext(sampleText);
                sendDataSequentially(singleChunks);
            } else {
                sampleText = "Hello world";
                Log.d(TAG, "Sent text wall " + sampleText + " to Next Glasses ");

                byte[] singleChunks = createTextWallChunksForNext(sampleText);
                sendDataSequentially(singleChunks);
            }

        }
    }

    private String bytesToUtf8(byte[] bytes) {
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private void stopPeriodicNotifications() {
        if (notificationHandler != null && notificationRunnable != null) {
            notificationHandler.removeCallbacks(notificationRunnable);
            Log.d(TAG, "Stopped periodic notifications");
        }
    }

    // handle white list stuff
    private final int WHITELIST_CMD = 0x04; // Command ID for whitelist

    public List<byte[]> getWhitelistChunks() {
        // Define the hardcoded whitelist JSON
        List<AppInfo> apps = new ArrayList<>();
        apps.add(new AppInfo("com.augment.os", "AugmentOS"));
        String whitelistJson = createWhitelistJson(apps);

        Log.d(TAG, "Creating chunks for hardcoded whitelist: " + whitelistJson);

        // Convert JSON to bytes and split into chunks
        return createWhitelistChunks(whitelistJson);
    }

    private String createWhitelistJson(List<AppInfo> apps) {
        JSONArray appList = new JSONArray();
        try {
            // Add each app to the list
            for (AppInfo app : apps) {
                JSONObject appJson = new JSONObject();
                appJson.put("id", app.getId());
                appJson.put("name", app.getName());
                appList.put(appJson);
            }

            JSONObject whitelistJson = new JSONObject();
            whitelistJson.put("calendar_enable", false);
            whitelistJson.put("call_enable", false);
            whitelistJson.put("msg_enable", false);
            whitelistJson.put("ios_mail_enable", false);

            JSONObject appObject = new JSONObject();
            appObject.put("list", appList);
            appObject.put("enable", true);

            whitelistJson.put("app", appObject);

            return whitelistJson.toString();
        } catch (JSONException e) {
            Log.e(TAG, "Error creating whitelist JSON: " + e.getMessage());
            return "{}";
        }
    }

    // Simple class to hold app info
    class AppInfo {
        private String id;
        private String name;

        public AppInfo(String id, String name) {
            this.id = id;
            this.name = name;
        }

        public String getId() {
            return id;
        }

        public String getName() {
            return name;
        }
    }

    // Helper function to split JSON into chunks
    private List<byte[]> createWhitelistChunks(String json) {
        // final int MAX_CHUNK_SIZE = 180 - 4; // Reserve space for the header
        byte[] jsonBytes = json.getBytes(StandardCharsets.UTF_8);
        int totalChunks = (int) Math.ceil((double) jsonBytes.length / MAX_CHUNK_SIZE);

        List<byte[]> chunks = new ArrayList<>();
        for (int i = 0; i < totalChunks; i++) {
            int start = i * MAX_CHUNK_SIZE;
            int end = Math.min(start + MAX_CHUNK_SIZE, jsonBytes.length);
            byte[] payloadChunk = Arrays.copyOfRange(jsonBytes, start, end);

            // Create the header: [WHITELIST_CMD, total_chunks, chunk_index]
            byte[] header = new byte[] {
                    (byte) WHITELIST_CMD, // Command ID
                    (byte) totalChunks, // Total number of chunks
                    (byte) i // Current chunk index
            };

            // Combine header and payload
            ByteBuffer buffer = ByteBuffer.allocate(header.length + payloadChunk.length);
            buffer.put(header);
            buffer.put(payloadChunk);

            chunks.add(buffer.array());
        }

        return chunks;
    }

    @Override
    public void displayCustomContent(String content) {
        Log.d(TAG, "DISPLAY CUSTOM CONTENT");
    }

    private void sendChunks(List<byte[]> chunks) {
        // Send each chunk with a delay between sends
        for (byte[] chunk : chunks) {
            sendDataSequentially(chunk);

            // try {
            // Thread.sleep(DELAY_BETWEEN_CHUNKS_SEND); // delay between chunks
            // } catch (InterruptedException e) {
            // e.printStackTrace();
            // }
        }
    }

    // public int DEFAULT_CARD_SHOW_TIME = 6;
    // public void homeScreenInNSeconds(int n){
    // if (n == -1){
    // return;
    // }
    //
    // if (n == 0){
    // n = DEFAULT_CARD_SHOW_TIME;
    // }
    //
    // //disconnect after slight delay, so our above text gets a chance to show up
    // goHomeHandler.removeCallbacksAndMessages(goHomeRunnable);
    // goHomeHandler.removeCallbacksAndMessages(null);
    // goHomeRunnable = new Runnable() {
    // @Override
    // public void run() {
    // showHomeScreen();
    // }};
    // goHomeHandler.postDelayed(goHomeRunnable, n * 1000);
    // }

    // BMP handling

    // Add these class variables
    private final byte[] GLASSES_ADDRESS = new byte[] { 0x00, 0x1c, 0x00, 0x00 };
    private final byte[] END_COMMAND = new byte[] { 0x20, 0x0d, 0x0e };

    // for g1 glasses
    public void displayBitmapImage(byte[] bmpData) {
        Log.d(TAG, "Starting BMP display process");

        try {
            if (bmpData == null || bmpData.length == 0) {
                Log.e(TAG, "Invalid BMP data provided");
                return;
            }
            Log.d(TAG, "Processing BMP data, size: " + bmpData.length + " bytes");

            // Split into chunks and send
            List<byte[]> chunks = createBmpChunks(bmpData);
            Log.d(TAG, "Created " + chunks.size() + " chunks");

            // Send all chunks
            sendBmpChunks(chunks);

            // Send end command
            sendBmpEndCommand();

            // Calculate and send CRC
            sendBmpCRC(bmpData);

            lastThingDisplayedWasAnImage = true;

        } catch (Exception e) {
            Log.e(TAG, "Error in displayBitmapImage: " + e.getMessage());
        }
    }

    // for Next Glasses
    public void displayBitmapImageForNextGlass(byte[] bmpData) {
        Log.d(TAG, "Starting BMP display process");

        try {
            if (bmpData == null || bmpData.length == 0) {
                Log.e(TAG, "Invalid BMP data provided");
                return;
            }
            Log.d(TAG, "Processing BMP data, size: " + bmpData.length + " bytes");

            // Split into chunks and send
            final int totalChunks = (int) Math.ceil((double) bmpData.length / BMP_CHUNK_SIZE);
            final char streamId = (char) random.nextInt();

            byte[] startImageSendingBytes = createSendingImageChunksCommand(streamId, totalChunks);
            sendDataSequentially(startImageSendingBytes);
            // Send all chunks
            // Split into chunks and send
            List<byte[]> chunks = createBmpChunksForNextGlasses(streamId, bmpData, totalChunks);

            sendBmpChunks(chunks);

            // Send end command
            // sendBmpEndCommand();

            // Calculate and send CRC
            // sendBmpCRC(bmpData);

            // lastThingDisplayedWasAnImage = true;

        } catch (Exception e) {
            Log.e(TAG, "Error in displayBitmapImage: " + e.getMessage());
        }
    }

    // for g1
    private List<byte[]> createBmpChunks(byte[] bmpData) {
        List<byte[]> chunks = new ArrayList<>();
        int totalChunks = (int) Math.ceil((double) bmpData.length / BMP_CHUNK_SIZE);
        Log.d(TAG, "Creating " + totalChunks + " chunks from " + bmpData.length + " bytes");

        for (int i = 0; i < totalChunks; i++) {
            int start = i * BMP_CHUNK_SIZE;
            int end = Math.min(start + BMP_CHUNK_SIZE, bmpData.length);
            byte[] chunk = Arrays.copyOfRange(bmpData, start, end);

            // First chunk needs address bytes
            if (i == 0) {
                byte[] headerWithAddress = new byte[2 + GLASSES_ADDRESS.length + chunk.length];
                headerWithAddress[0] = 0x15; // Command
                headerWithAddress[1] = (byte) (i & 0xFF); // Sequence
                System.arraycopy(GLASSES_ADDRESS, 0, headerWithAddress, 2, GLASSES_ADDRESS.length);
                System.arraycopy(chunk, 0, headerWithAddress, 6, chunk.length);
                chunks.add(headerWithAddress);
            } else {
                byte[] header = new byte[2 + chunk.length];
                header[0] = 0x15; // Command
                header[1] = (byte) (i & 0xFF); // Sequence
                System.arraycopy(chunk, 0, header, 2, chunk.length);
                chunks.add(header);
            }
        }
        return chunks;
    }

    // for Next Glasses
    private List<byte[]> createBmpChunksForNextGlasses(char streamId, byte[] bmpData, int totalChunks) {
        List<byte[]> chunks = new ArrayList<>();
        // int totalChunks = (int) Math.ceil((double) bmpData.length / BMP_CHUNK_SIZE);
        Log.d(TAG, "Creating " + totalChunks + " chunks from " + bmpData.length + " bytes");
        int start;
        int end;
        byte[] chunk;
        byte[] header;
        for (int i = 0; i < totalChunks; i++) {
            start = i * BMP_CHUNK_SIZE;
            end = Math.min(start + BMP_CHUNK_SIZE, bmpData.length);
            chunk = Arrays.copyOfRange(bmpData, start, end);
            header = new byte[4 + chunk.length];
            header[0] = PACKET_TYPE_IMAGE; // Command
            header[1] = (byte) ((streamId >> 8) & 0xFF); // Sequence
            header[2] = (byte) (streamId & 0xFF); // Sequence
            header[3] = (byte) (i & 0xFF); // Sequence
            System.arraycopy(chunk, 0, header, 4, chunk.length);
            chunks.add(header);
        }
        return chunks;
    }

    private void sendBmpChunks(List<byte[]> chunks) {
        if (updatingScreen)
            return;
        for (int i = 0; i < chunks.size(); i++) {
            byte[] chunk = chunks.get(i);
            Log.d(TAG, "Sending chunk " + i + " of " + chunks.size() + ", size: " + chunk.length);
            sendDataSequentially(chunk);

            // try {
            // Thread.sleep(25); // Small delay between chunks
            // } catch (InterruptedException e) {
            // Log.e(TAG, "Sleep interrupted: " + e.getMessage());
            // }
        }
    }

    private void sendBmpEndCommand() {
        if (updatingScreen) {
            return;
        }
        Log.d(TAG, "Sending BMP end command");
        sendDataSequentially(END_COMMAND);

        // try {
        // Thread.sleep(100); // Give it time to process
        // } catch (InterruptedException e) {
        // Log.e(TAG, "Sleep interrupted: " + e.getMessage());
        // }
    }

    private void sendBmpCRC(byte[] bmpData) {
        // Create data with address for CRC calculation
        byte[] dataWithAddress = new byte[GLASSES_ADDRESS.length + bmpData.length];
        System.arraycopy(GLASSES_ADDRESS, 0, dataWithAddress, 0, GLASSES_ADDRESS.length);
        System.arraycopy(bmpData, 0, dataWithAddress, GLASSES_ADDRESS.length, bmpData.length);

        // Calculate CRC32
        CRC32 crc = new CRC32();
        crc.update(dataWithAddress);
        long crcValue = crc.getValue();

        // Create CRC command packet
        byte[] crcCommand = new byte[5];
        crcCommand[0] = 0x16; // CRC command
        crcCommand[1] = (byte) ((crcValue >> 24) & 0xFF);
        crcCommand[2] = (byte) ((crcValue >> 16) & 0xFF);
        crcCommand[3] = (byte) ((crcValue >> 8) & 0xFF);
        crcCommand[4] = (byte) (crcValue & 0xFF);

        Log.d(TAG, "Sending CRC command, CRC value: " + Long.toHexString(crcValue));
        sendDataSequentially(crcCommand);
    }

    private byte[] loadEmptyBmpFromAssets() {
        try {
            try (InputStream is = context.getAssets().open("empty_bmp.bmp")) {
                return is.readAllBytes();
            }
        } catch (IOException e) {
            Log.e(TAG, "Failed to load BMP from assets: " + e.getMessage());
            return null;
        }
    }

    public void clearBmpDisplay() {
        if (updatingScreen) {
            return;
        }
        Log.d(TAG, "Clearing BMP display with EXIT command");
        byte[] exitCommand = new byte[] { 0x18 };
        sendDataSequentially(exitCommand);
    }

    private void sendLoremIpsum() {
        if (updatingScreen) {
            return;
        }
        String text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ";
        sendDataSequentially(createTextWallChunks(text));
    }

    private void quickRestartNextGlasses() {
        Log.d(TAG, "Sending restart 0x23 0x72 Command");
        sendDataSequentially(new byte[] { (byte) 0x23, (byte) 0x72 }); // quick restart comand
    }

    @Override
    public void changeSmartGlassesMicrophoneState(boolean isMicrophoneEnabled) {
        Log.d(TAG, "Microphone state changed: " + isMicrophoneEnabled);

        // Update the shouldUseGlassesMic flag to reflect the current state
        this.shouldUseGlassesMic = isMicrophoneEnabled && SmartGlassesManager.getSensingEnabled(context);// &&
        // !SmartGlassesManager.getForceCoreOnboardMic(context);
        Log.d(TAG, "Updated shouldUseGlassesMic to: " + shouldUseGlassesMic);

        if (isMicrophoneEnabled) {
            Log.d(TAG, "Microphone enabled, starting audio input handling");
            setMicEnabled(true, 10);
            startMicBeat((int) MICBEAT_INTERVAL_MS);
        } else {
            Log.d(TAG, "Microphone disabled, stopping audio input handling");
            setMicEnabled(false, 10);
            stopMicBeat();
        }
    }

    /**
     * Returns whether the microphone is currently enabled
     *
     * @return true if microphone is enabled, false otherwise
     */
    public boolean isMicrophoneEnabled() {
        return isMicrophoneEnabled;
    }

    /**
     * Decodes Even NextGlasses serial number to extract style and color information
     *
     * @param serialNumber The full serial number (e.g., "S110LABD020021")
     * @return Array containing [style, color] or ["Unknown", "Unknown"] if invalid
     */
    public String[] decodeEvenNextGlassesSerialNumber(String serialNumber) {
        if (serialNumber == null || serialNumber.length() < 6) {
            return new String[] { "Unknown", "Unknown" };
        }

        // Style mapping: 3rd character (index 2)
        String style;
        switch (serialNumber.charAt(1)) {
            case '0':
                style = "Round";
                break;
            case '1':
                style = "Rectangular";
                break;
            default:
                style = "Round";
                break;
        }

        // Color mapping: 5th character (index 4)
        String color;
        switch (serialNumber.charAt(4)) {
            case 'A':
                color = "Grey";
                break;
            case 'B':
                color = "Brown";
                break;
            case 'C':
                color = "Green";
                break;
            default:
                color = "Grey";
                break;
        }

        return new String[] { style, color };
    }

    private void decodeJsons(byte[] jsonBytes) {
        final String jsoString = new String(jsonBytes, Charset.defaultCharset());
        try {
            JSONObject commandObject = new JSONObject(jsoString);
            String type = commandObject.getString("type");
            switch (type) {
                case "image_transfer_complete":
                    break;
                case "disconnect":
                    break;
                case "request_battery_state":
                    break;
                case "charging_state":
                    break;
                case "device_info":
                    final DeviceInfo deviceInfo = gson.fromJson(jsoString, DeviceInfo.class);
                    break;
                case "enter_pairing_mode":
                    break;
                case "request_head_position":
                    break;
                case "set_head_up_angle":
                    break;
                case "ping":
                    break;
                case "vad_event":
                    break;
                case "imu_data":
                    break;
                case "button_event":
                    break;
                case "head_gesture":
                    break;
                default:
                    break;
            }
        } catch (Exception e) {
        }
    }

    private void decodeProtobufs(byte[] protobufBytes) {
        try {
            final PhoneToGlasses receivedBytes = PhoneToGlasses.parseFrom(protobufBytes);
            Log.d(TAG, "decodeProtobufs data: " + receivedBytes.toString());
            Log.d(TAG, "decodeProtobufs case: " + receivedBytes.getPayloadCase());

        } catch (InvalidProtocolBufferException e) {
            e.printStackTrace(); // Handle parsing error
        }

    }

    /**
     * Decodes serial number from manufacturer data bytes
     *
     * @param manufacturerData The manufacturer data bytes
     * @return Decoded serial number string or null if not found
     */
    private String decodeSerialFromManufacturerData(byte[] manufacturerData) {
        if (manufacturerData == null || manufacturerData.length < 10) {
            return null;
        }

        try {
            // Convert hex bytes to ASCII string
            StringBuilder serialBuilder = new StringBuilder();
            for (int i = 0; i < manufacturerData.length; i++) {
                byte b = manufacturerData[i];
                if (b == 0x00) {
                    // Stop at null terminator
                    break;
                }
                if (b >= 0x20 && b <= 0x7E) {
                    // Only include printable ASCII characters
                    serialBuilder.append((char) b);
                }
            }

            String decodedString = serialBuilder.toString().trim();

            // Check if it looks like a valid Even NextGlasses serial number
            if (decodedString.length() >= 12 &&
                    (decodedString.startsWith("S1") || decodedString.startsWith("100")
                            || decodedString.startsWith("110"))) {
                return decodedString;
            }

            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error decoding manufacturer data: " + e.getMessage());
            return null;
        }
    }
}
