package com.augmentos.asg_client.io.bluetooth.managers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.bluetooth.core.ComManager;
import com.augmentos.asg_client.io.bluetooth.interfaces.SerialListener;
import com.augmentos.asg_client.io.bluetooth.utils.K900MessageParser;
import com.augmentos.asg_client.io.bluetooth.utils.ByteUtil;
import com.augmentos.asg_client.io.bluetooth.core.BaseBluetoothManager;
import com.augmentos.asg_client.io.bluetooth.utils.DebugNotificationManager;

import java.util.Arrays;
import java.util.List;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.json.JSONObject;
import org.json.JSONException;

import com.augmentos.asg_client.reporting.domains.BluetoothReporting;

/**
 * Implementation of IBluetoothManager for K900 devices.
 * Uses the K900's serial port to communicate with the BES2700 Bluetooth module.
 */
public class K900BluetoothManager extends BaseBluetoothManager implements SerialListener {
    private static final String TAG = "K900BluetoothManager";

    private ComManager comManager;
    private boolean isSerialOpen = false;
    private DebugNotificationManager notificationManager;
    private K900MessageParser messageParser;

    // File transfer state management
    private FileTransferSession currentFileTransfer = null;
    private ScheduledExecutorService fileTransferExecutor;
    private ConcurrentHashMap<Integer, FilePacketState> pendingPackets = new ConcurrentHashMap<>();
    private static final int FILE_TRANSFER_ACK_TIMEOUT_MS = 3000;
    private static final int FILE_TRANSFER_MAX_RETRIES = 5;

    // Inner class to track file transfer state
    private static class FileTransferSession {
        String filePath;
        String fileName;
        byte[] fileData;
        int fileSize;
        int totalPackets;
        int currentPacketIndex;
        boolean isActive;
        long startTime;

        FileTransferSession(String filePath, String fileName, byte[] fileData) {
            this.filePath = filePath;
            this.fileName = fileName;
            this.fileData = fileData;
            this.fileSize = fileData.length;
            this.totalPackets = (fileSize + com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.FILE_PACK_SIZE - 1) /
                    com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.FILE_PACK_SIZE;
            this.currentPacketIndex = 0;
            this.isActive = true;
            this.startTime = System.currentTimeMillis();
        }
    }

    // Inner class to track packet state
    private static class FilePacketState {
        int retryCount;
        long lastSendTime;

        FilePacketState() {
            this.retryCount = 0;
            this.lastSendTime = System.currentTimeMillis();
        }
    }

    /**
     * Create a new K900BluetoothManager
     *
     * @param context The application context
     */
    public K900BluetoothManager(Context context) {
        super(context);

        // Create the notification manager
        notificationManager = new DebugNotificationManager(context);
        notificationManager.showDeviceTypeNotification(true);

        // Create the communication manager
        comManager = new ComManager(context);
        comManager.registerListener(this);
        comManager.start();

        // Create the message parser to handle fragmented messages
        messageParser = new K900MessageParser();

        // Initialize file transfer executor
        fileTransferExecutor = Executors.newSingleThreadScheduledExecutor();
    }

    @Override
    public boolean sendData(byte[] data) {
        if (data == null || data.length == 0) {
            Log.w(TAG, "Attempted to send null or empty data");
            return false;
        }

        if (!isSerialOpen) {
            Log.w(TAG, "Cannot send data - serial port not open");
            notificationManager.showDebugNotification("Bluetooth Error",
                    "Cannot send data - serial port not open");
            return false;
        }

        // Implementation would go here for sending data via serial
        Log.d(TAG, "Sending " + data.length + " bytes via K900 serial");
        return true;
    }

    @Override
    public void disconnect() {
        // For K900, we don't directly disconnect BLE
        Log.d(TAG, "K900 manages BT connections at the hardware level");
        notificationManager.showDebugNotification("Bluetooth",
                "K900 manages BT connections at the hardware level");

        // But we update the state for our listeners
        if (isConnected()) {
            notifyConnectionStateChanged(false);
            notificationManager.showBluetoothStateNotification(false);
        }
    }

    @Override
    public void stopAdvertising() {
        // K900 doesn't need to stop advertising manually
        Log.d(TAG, "K900 BT module handles advertising automatically");
    }

    @Override
    public boolean isConnected() {
        // For K900, we consider the device connected if the serial port is open
        return isSerialOpen && super.isConnected();
    }

    @Override
    public void startAdvertising() {
        // K900 doesn't need to advertise manually, as BES2700 handles this
        Log.d(TAG, "K900 BT module handles advertising automatically");
        notificationManager.showDebugNotification("Bluetooth",
                "K900 BT module handles advertising automatically");
    }

    @Override
    public void onSerialClose(String serialPath) {
        Log.d(TAG, "Serial port closed: " + serialPath);
        isSerialOpen = false;

        // When the serial port closes, we consider ourselves disconnected
        notifyConnectionStateChanged(false);
        notificationManager.showBluetoothStateNotification(false);
        notificationManager.showDebugNotification("Serial Closed",
                "Serial port closed: " + serialPath);
    }

    @Override
    public void onSerialRead(String serialPath, byte[] data, int size) {
        Log.d(TAG, "onSerialRead called with " + size + " bytes");
        if (data != null && size > 0) {
            // Copy the data to avoid issues with buffer reuse
            byte[] dataCopy = new byte[size];
            System.arraycopy(data, 0, dataCopy, 0, size);

            // Add the data to our message parser (if available)
            // if (messageParser.addData(dataCopy, size)) {
            //     // Try to extract complete messages
            //     List<byte[]> completeMessages = messageParser.parseMessages();
            //     if (completeMessages != null && !completeMessages.isEmpty()) {
            //         // Process each complete message
            //         for (byte[] message : completeMessages) {
            //             // Check for file transfer acknowledgments
            //             processReceivedMessage(message);
            //             
            //             // Notify listeners of the received message
            //             notifyDataReceived(message);
            //         }
            //     }
            // }

            // For now, just notify listeners of the raw data
            notifyDataReceived(dataCopy);
        }
    }

    @Override
    public void onSerialReady(String serialPath) {
        Log.d(TAG, "Serial port ready: " + serialPath);
        isSerialOpen = true;

        // For K900, when the serial port is ready, we consider ourselves "connected"
        // to the BT module
        notifyConnectionStateChanged(true);
        notificationManager.showBluetoothStateNotification(true);
        notificationManager.showDebugNotification("Serial Ready",
                "Serial port ready: " + serialPath);
    }

    @Override
    public void onSerialOpen(boolean bSucc, int code, String serialPath, String msg) {
        Log.d(TAG, "Serial port open: " + bSucc + " path: " + serialPath);
        isSerialOpen = bSucc;

        if (bSucc) {
            notificationManager.showDebugNotification("Serial Open",
                    "Serial port opened successfully: " + serialPath);
        } else {
            notificationManager.showDebugNotification("Serial Error",
                    "Failed to open serial port: " + serialPath + " - " + msg);
        }
    }
} 