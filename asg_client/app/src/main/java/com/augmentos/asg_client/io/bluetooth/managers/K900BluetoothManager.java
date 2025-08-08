package com.augmentos.asg_client.io.bluetooth.managers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.bluetooth.core.ComManager;
import com.augmentos.asg_client.io.bluetooth.interfaces.SerialListener;
import com.augmentos.asg_client.io.bluetooth.utils.K900MessageParser;
import com.augmentos.asg_client.io.bluetooth.core.BaseBluetoothManager;
import com.augmentos.asg_client.io.bluetooth.utils.DebugNotificationManager;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;

import com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils;

/**
 * Implementation of IBluetoothManager for K900 devices.
 * Uses the K900's serial port to communicate with the BES2700 Bluetooth module.
 */
public class K900BluetoothManager extends BaseBluetoothManager implements SerialListener {
    private static final String TAG = "K900BluetoothManager";

    private final ComManager comManager;
    private boolean isSerialOpen = false;
    private final DebugNotificationManager notificationManager;
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
            this.totalPackets = (fileSize + K900ProtocolUtils.FILE_PACK_SIZE - 1) / K900ProtocolUtils.FILE_PACK_SIZE;
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
        Log.d(TAG, "📡 =========================================");
        Log.d(TAG, "📡 K900 BLUETOOTH SEND DATA");
        Log.d(TAG, "📡 =========================================");
        Log.d(TAG, "📡 Data length: " + (data != null ? data.length : 0) + " bytes");

        if (data == null || data.length == 0) {
            Log.w(TAG, "📡 ❌ Attempted to send null or empty data");
            return false;
        }

        if (!isSerialOpen) {
            Log.w(TAG, "📡 ❌ Cannot send data - serial port not open");
            notificationManager.showDebugNotification("Bluetooth Error", "Cannot send data - serial port not open");
            return false;
        }


        Log.d(TAG, "📡 🔍 Checking if data is already in K900 protocol format...");
        //First check if it 's already in protocol format
        if (!K900ProtocolUtils.isK900ProtocolFormat(data)) {
            Log.d(TAG, "📡 📝 Data not in protocol format, processing...");
            // Try to interpret as a JSON string that needs C-wrapping and protocol formatting
            try {
                // Convert to string for processing
                String originalData = new String(data, "UTF-8");
                Log.d(TAG, "📡 📄 Original data as string: " + originalData.substring(0, Math.min(originalData.length(), 100)) + "...");

                // If looks like JSON but not C-wrapped, use the full formatting function
                if (originalData.startsWith("{") && !K900ProtocolUtils.isCWrappedJson(originalData)) {
                    Log.d(TAG, "📡 🔧 JSON data detected, applying C-wrapping and protocol formatting...");
                    Log.d(TAG, "📡 📦 JSON DATA BEFORE C-WRAPPING: " + originalData);
                    data = K900ProtocolUtils.formatMessageForTransmission(originalData);

                    // Log the first 50 bytes of the hex representation
                    StringBuilder hexDump = new StringBuilder();
                    for (int i = 0; i < Math.min(data.length, 50); i++) {
                        hexDump.append(String.format("%02X ", data[i]));
                    }
                    Log.d(TAG, "📡 📦 AFTER C-WRAPPING & PROTOCOL FORMATTING (first 50 bytes): " + hexDump.toString());
                    Log.d(TAG, "📡 📦 Total formatted length: " + data.length + " bytes");
                } else {
                    // Otherwise just apply protocol formatting
                    Log.d(TAG, "📡 📝 Data already C-wrapped or not JSON: " + originalData);
                    Log.d(TAG, "📡 🔧 Formatting data with K900 protocol (adding ##...)");
                    data = K900ProtocolUtils.packDataCommand(data, K900ProtocolUtils.CMD_TYPE_STRING);
                }
            } catch (Exception e) {
                // If we can't interpret as string, just apply protocol formatting to raw bytes
                Log.d(TAG, "📡 🔧 Applying protocol format to raw bytes");
                data = K900ProtocolUtils.packDataCommand(data, K900ProtocolUtils.CMD_TYPE_STRING);
            }
        } else {
            Log.d(TAG, "📡 ✅ Data already in K900 protocol format");
        }


        Log.d(TAG, "📡 📤 Sending " + data.length + " bytes via K900 serial");

        // Send the data via the serial port
        boolean sent = comManager.send(data);
        Log.d(TAG, "📡 " + (sent ? "✅ Data sent successfully via serial port" : "❌ Failed to send data via serial port"));

        // Only show notification for larger data packets to avoid spam
        if (data.length > 10) {
            notificationManager.showDebugNotification("Bluetooth Data", "Sent " + data.length + " bytes via serial port");
        }

        return sent;
    }

    @Override
    public void disconnect() {
        // For K900, we don't directly disconnect BLE
        Log.d(TAG, "K900 manages BT connections at the hardware level");
        notificationManager.showDebugNotification("Bluetooth", "K900 manages BT connections at the hardware level");

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
        notificationManager.showDebugNotification("Bluetooth", "K900 BT module handles advertising automatically");
    }

    @Override
    public void onSerialClose(String serialPath) {
        Log.d(TAG, "🔌 =========================================");
        Log.d(TAG, "🔌 K900 SERIAL CLOSE");
        Log.d(TAG, "🔌 =========================================");
        Log.d(TAG, "🔌 Serial path: " + serialPath);

        isSerialOpen = false;
        Log.d(TAG, "🔌 ✅ Serial port marked as closed");

        // When the serial port closes, we consider ourselves disconnected
        Log.d(TAG, "🔌 📡 Notifying connection state changed to false...");
        notifyConnectionStateChanged(false);
        Log.d(TAG, "🔌 ✅ Connection state notification sent");

        notificationManager.showBluetoothStateNotification(false);
        notificationManager.showDebugNotification("Serial Closed", "Serial port closed: " + serialPath);
        Log.d(TAG, "🔌 ✅ Bluetooth state notifications sent");
    }

    @Override
    public void onSerialRead(String serialPath, byte[] data, int size) {
        Log.d(TAG, "📥 =========================================");
        Log.d(TAG, "📥 K900 SERIAL READ");
        Log.d(TAG, "📥 =========================================");
        Log.d(TAG, "📥 Serial path: " + serialPath);
        Log.d(TAG, "📥 Received " + size + " bytes");

        if (data != null && size > 0) {
            Log.d(TAG, "📥 ✅ Valid data received, processing...");

            // Copy the data to avoid issues with buffer reuse
            byte[] dataCopy = new byte[size];
            System.arraycopy(data, 0, dataCopy, 0, size);
            Log.d(TAG, "📥 📋 Data copied successfully");

            // Log first few bytes for debugging
            if (size > 0) {
                StringBuilder hexDump = new StringBuilder();
                for (int i = 0; i < Math.min(size, 20); i++) {
                    hexDump.append(String.format("%02X ", dataCopy[i]));
                }
                Log.d(TAG, "📥 📦 First 20 bytes: " + hexDump.toString());
            }

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
            Log.d(TAG, "📥 📤 Notifying listeners of received data...");
            notifyDataReceived(dataCopy);
            Log.d(TAG, "📥 ✅ Data processing complete");
        } else {
            Log.w(TAG, "📥 ❌ Invalid data received - null or empty");
        }
    }

    @Override
    public void onSerialReady(String serialPath) {
        Log.d(TAG, "🔌 =========================================");
        Log.d(TAG, "🔌 K900 SERIAL READY");
        Log.d(TAG, "🔌 =========================================");
        Log.d(TAG, "🔌 Serial path: " + serialPath);

        isSerialOpen = true;
        Log.d(TAG, "🔌 ✅ Serial port marked as open");

        // For K900, when the serial port is ready, we consider ourselves "connected"
        // to the BT module
        Log.d(TAG, "🔌 📡 Notifying connection state changed to true...");
        notifyConnectionStateChanged(true);
        Log.d(TAG, "🔌 ✅ Connection state notification sent");

        notificationManager.showBluetoothStateNotification(true);
        notificationManager.showDebugNotification("Serial Ready", "Serial port ready: " + serialPath);
        Log.d(TAG, "🔌 ✅ Bluetooth state notifications sent");
    }

    @Override
    public void onSerialOpen(boolean bSucc, int code, String serialPath, String msg) {
        Log.d(TAG, "🔌 =========================================");
        Log.d(TAG, "🔌 K900 SERIAL OPEN");
        Log.d(TAG, "🔌 =========================================");
        Log.d(TAG, "🔌 Success: " + bSucc);
        Log.d(TAG, "🔌 Code: " + code);
        Log.d(TAG, "🔌 Serial path: " + serialPath);
        Log.d(TAG, "🔌 Message: " + msg);

        isSerialOpen = bSucc;
        Log.d(TAG, "🔌 Serial port open state set to: " + bSucc);

        if (bSucc) {
            Log.d(TAG, "🔌 ✅ Serial port opened successfully");
            notificationManager.showDebugNotification("Serial Open", "Serial port opened successfully: " + serialPath);
        } else {
            Log.d(TAG, "🔌 ❌ Failed to open serial port");
            notificationManager.showDebugNotification("Serial Error", "Failed to open serial port: " + serialPath + " - " + msg);
        }
    }
} 