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
import com.augmentos.asg_client.reporting.domains.BluetoothReporting;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.json.JSONObject;
import org.json.JSONException;

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
    private static final int TRANSFER_TIMEOUT_MS = 3000; // 3 seconds total transfer timeout
    
    // Packet transmission timing configuration
    private static final int PACKET_SEND_DELAY_MS = 10; // Delay between packets to prevent UART overflow
    private static final int RETRANSMISSION_DELAY_MS = 10; // Delay between retransmissions
    
    // Testing: Packet drop simulation
    private static final boolean ENABLE_PACKET_DROP_TEST = true; // Set to false to disable
    private static final int PACKET_TO_DROP = 5; // Drop packet #5 for testing
    private boolean hasDroppedTestPacket = false; // Track if we've already dropped the test packet

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
    public void shutdown() {
        Log.d(TAG, "Shutting down K900BluetoothManager");
        
        // Cancel any active file transfer
        if (currentFileTransfer != null && currentFileTransfer.isActive) {
            Log.d(TAG, "Cancelling active file transfer");
            currentFileTransfer.isActive = false;
            Log.d(TAG, "5 Disabling fast mode");
            comManager.setFastMode(false);
        }
        
        
        // Shutdown file transfer executor
        if (fileTransferExecutor != null) {
            fileTransferExecutor.shutdownNow();
        }
        
        // Stop the ComManager
        if (comManager != null) {
            comManager.stop();
        }
        
        // Call parent shutdown
        super.shutdown();
        
        Log.d(TAG, "K900BluetoothManager shut down");
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
        // Suppress verbose serial read logging to prevent logcat overflow
        // Log.d(TAG, "📥 K900 SERIAL READ - " + size + " bytes");

        if (data != null && size > 0) {
            // Copy the data to avoid issues with buffer reuse
            byte[] dataCopy = new byte[size];
            System.arraycopy(data, 0, dataCopy, 0, size);
            
            // Hex dump suppressed to prevent logcat overflow
            // Enable only when debugging specific issues

            // Add the data to our message parser
            if (messageParser != null && messageParser.addData(dataCopy, size)) {
                // Try to extract complete messages
                List<byte[]> completeMessages = messageParser.parseMessages();
                if (completeMessages != null && !completeMessages.isEmpty()) {
                    // Log.d(TAG, "📥 Extracted " + completeMessages.size() + " complete messages");
                    // Process each complete message
                    for (byte[] message : completeMessages) {
                        // Extract payload from K900 protocol message for listeners
                        if (K900ProtocolUtils.isK900ProtocolFormat(message)) {
                            // Try to extract payload (big-endian first, then little-endian)
                            byte[] payload = K900ProtocolUtils.extractPayload(message);
                            if (payload == null) {
                                payload = K900ProtocolUtils.extractPayloadFromK900(message);
                            }
                            
                            if (payload != null && payload.length > 0) {
                                // Notify listeners with the clean payload (JSON data without markers)
                                // Suppress verbose notification logging
                                notifyDataReceived(payload);
                            } else {
                                Log.w(TAG, "📥 Failed to extract payload from K900 message");
                            }
                        } else {
                            // Not a K900 protocol message, pass as-is
                            Log.d(TAG, "📥 Non-K900 message, passing as-is");
                            notifyDataReceived(message);
                        }
                    }
                } else {
                    // No complete messages yet, just accumulating data
                    Log.d(TAG, "📥 Data added to parser, waiting for complete message");
                }
            } else {
                // If parser is not available or data couldn't be added, send raw data
                Log.d(TAG, "📥 📤 Parser unavailable, notifying listeners of raw data...");
                notifyDataReceived(dataCopy);
            }
            // Data processing complete
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
    
    /**
     * Check if a file transfer is currently in progress
     * @return true if a transfer is active, false otherwise
     */
    public boolean isFileTransferInProgress() {
        return currentFileTransfer != null && currentFileTransfer.isActive;
    }
    
    /**
     * Send an image file over the K900 Bluetooth connection
     * @param filePath Path to the image file to send
     * @return true if transfer started successfully
     */
    @Override
    public boolean sendImageFile(String filePath) {
        if (!isSerialOpen) {
            Log.e(TAG, "Cannot send file - serial port not open");
            
            // Report file transfer failure
            BluetoothReporting.reportFileTransferFailure(context, filePath, "send_file", 
                "serial_port_not_open", null);
            return false;
        }
        
        if (currentFileTransfer != null && currentFileTransfer.isActive) {
            Log.e(TAG, "File transfer already in progress");
            
            // Report file transfer failure
            BluetoothReporting.reportFileTransferFailure(context, filePath, "send_file", 
                "transfer_already_in_progress", null);
            return false;
        }
        
        File file = new File(filePath);
        if (!file.exists() || !file.isFile()) {
            Log.e(TAG, "File not found: " + filePath);
            
            // Report file transfer failure
            BluetoothReporting.reportFileTransferFailure(context, filePath, "send_file", 
                "file_not_found", null);
            return false;
        }
        
        // Read the file data
        byte[] fileData;
        try (FileInputStream fis = new FileInputStream(file)) {
            fileData = new byte[(int) file.length()];
            int bytesRead = fis.read(fileData);
            if (bytesRead != fileData.length) {
                Log.e(TAG, "Failed to read complete file");
                
                // Report file transfer failure
                BluetoothReporting.reportFileTransferFailure(context, filePath, "send_file", 
                    "incomplete_file_read", null);
                return false;
            }
        } catch (IOException e) {
            Log.e(TAG, "Error reading file: " + filePath, e);
            
            // Report file transfer failure with exception
            BluetoothReporting.reportFileTransferFailure(context, filePath, "send_file", 
                "io_exception", e);
            return false;
        }
        
        // Create file transfer session
        String fileName = file.getName();
        if (fileName.length() > 16) {
            fileName = fileName.substring(0, 16); // Truncate to 16 chars max
        }
        
        currentFileTransfer = new FileTransferSession(filePath, fileName, fileData);
        
        Log.d(TAG, "Starting file transfer: " + fileName + " (" + fileData.length + " bytes, " + 
                   currentFileTransfer.totalPackets + " packets)");
        
        notificationManager.showDebugNotification("File Transfer", 
            "Starting transfer of " + fileName + " (" + currentFileTransfer.totalPackets + " packets)");
        
        // Enable fast mode for file transfer
        comManager.setFastMode(true);
        
        // Send file transfer announcement first
        sendFileTransferAnnouncement();
        
        // // Schedule transfer timeout check
        // fileTransferExecutor.schedule(() -> checkTransferTimeout(), 
        //                              TRANSFER_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        
        // Send the first packet
        sendNextFilePacket();
        
        return true;
    }
    
    /**
     * Retransmit only the missing packets
     */
    public void retransmitMissingPackets(String fileName, List<Integer> missingPackets) {
        Log.d(TAG, "🔍 retransmitMissingPackets() called - fileName: " + fileName + ", missing " + missingPackets.size() + " packets: " + missingPackets);
        
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            Log.w(TAG, "🔍 Cannot retransmit - no active transfer (currentFileTransfer: " + (currentFileTransfer != null ? "exists but inactive" : "null") + ")");
            return;
        }
        
        if (!currentFileTransfer.fileName.equals(fileName)) {
            Log.w(TAG, "🔍 Cannot retransmit - filename mismatch. Expected: " + currentFileTransfer.fileName + ", Got: " + fileName);
            return;
        }
        
        Log.d(TAG, "🔍 Retransmitting " + missingPackets.size() + " missing packets for " + fileName + ": " + missingPackets);
        
        // Send only the missing packets with rate limiting
        for (int i = 0; i < missingPackets.size(); i++) {
            Integer packetIndex = missingPackets.get(i);
            if (packetIndex >= 0 && packetIndex < currentFileTransfer.totalPackets) {
                // Schedule retransmission with delay to prevent UART overflow
                final int finalPacketIndex = packetIndex;
                fileTransferExecutor.schedule(() -> sendFilePacket(finalPacketIndex), 
                                            i * RETRANSMISSION_DELAY_MS, TimeUnit.MILLISECONDS);
                Log.d(TAG, "🔍 Scheduled retransmission of packet " + packetIndex + " in " + (i * RETRANSMISSION_DELAY_MS) + "ms");
            } else {
                Log.w(TAG, "🔍 Invalid packet index for retransmission: " + packetIndex);
            }
        }
    }
    
    /**
     * Send file transfer announcement to phone
     */
    private void sendFileTransferAnnouncement() {
        if (currentFileTransfer == null) {
            return;
        }
        
        try {
            // Create announcement message in same format as version_info
            JSONObject announcement = new JSONObject();
            announcement.put("type", "file_announce");
            announcement.put("fileName", currentFileTransfer.fileName);
            announcement.put("totalPackets", currentFileTransfer.totalPackets);
            announcement.put("fileSize", currentFileTransfer.fileSize);
            announcement.put("timestamp", System.currentTimeMillis());
            
            String jsonStr = announcement.toString();
            Log.d(TAG, "📢 Sending file transfer announcement: " + jsonStr);
            
            // Send directly as JSON (same format as version_info)
            boolean sent = sendData(jsonStr.getBytes(StandardCharsets.UTF_8));
            if (sent) {
                Log.d(TAG, "📢 File transfer announcement sent successfully");
            } else {
                Log.e(TAG, "📢 Failed to send file transfer announcement");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "📢 Error creating file transfer announcement", e);
        }
    }
    
    /**
     * Unified packet transmission function - handles both normal and retransmitted packets
     */
    private boolean transmitPacket(int packetIndex, boolean isRetransmission) {
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            Log.w(TAG, (isRetransmission ? "🔍" : "📦") + " Cannot transmit packet " + packetIndex + " - no active transfer");
            return false;
        }
        
        // Calculate packet data
        int offset = packetIndex * K900ProtocolUtils.FILE_PACK_SIZE;
        int packSize = Math.min(K900ProtocolUtils.FILE_PACK_SIZE, 
                                currentFileTransfer.fileSize - offset);
        
        // Extract packet data
        byte[] packetData = new byte[packSize];
        System.arraycopy(currentFileTransfer.fileData, offset, packetData, 0, packSize);
        
        // Pack the file packet
        byte[] packet = K900ProtocolUtils.packFilePacket(
            packetData, packetIndex, packSize, currentFileTransfer.fileSize,
            currentFileTransfer.fileName, 0, // flags = 0
            K900ProtocolUtils.CMD_TYPE_PHOTO
        );
        
        if (packet == null) {
            Log.e(TAG, (isRetransmission ? "🔍" : "📦") + " Failed to pack packet " + packetIndex);
            return false;
        }
        
        // Commander, mission objective: Log the full contents of the outgoing UART packet before transmission for maximum battlefield visibility.
        // Plan of attack: We'll log the packet in hex format, up to the first 64 bytes for recon, and if it's longer, indicate the total size.
        StringBuilder hexDump = new StringBuilder();
        int dumpLen = Math.min(packet.length, 64);
        for (int i = 0; i < dumpLen; i++) {
            hexDump.append(String.format("%02X ", packet[i]));
        }
        Log.d(TAG, (isRetransmission ? "🔍" : "📦") + " UART packet dump (" + packet.length + " bytes): " + hexDump.toString() + (packet.length > 64 ? "... [truncated]" : ""));

        // Send the packet
        long sendStartTime = System.currentTimeMillis();
        comManager.sendFile(packet);
        long sendEndTime = System.currentTimeMillis();
        
        // Log transmission details
        String prefix = isRetransmission ? "🔍 Retransmitted" : "📊 Sent";
        Log.d(TAG, prefix + " file packet " + packetIndex + "/" + (currentFileTransfer.totalPackets - 1) + 
                   " (" + packSize + " bytes) - UART send took " + (sendEndTime - sendStartTime) + "ms");

        return true;
    }
    
    /**
     * Retransmit a single packet by index
     */
    private void retransmitSinglePacket(int packetIndex) {
        Log.d(TAG, "🧪 TESTING: Sending hardcoded test packet instead of retransmitting packet " + packetIndex);
        
        // Hardcoded test packet data (Commander's specific test packet)
        String hexData = "23 23 31 00 EC 00 0D 00 00 15 3C 49 33 36 30 38 34 35 36 30 33 00 00 00 00 00 00 00 00 C5 98 97 18 E3 F5 3A 3F 6F 07 4E D9 C3 AB 91 C5 6D 23 09 63 E0 85 1C B5 7C 65 85 08 28 1B 09 C3 0C 25 DA 48 FF 57 3F CF 08 A7 B4 57 D4 D2 F0 36 03 E6 00 1B 13 41 6D E3 23 40 F7 BF 7F A5 AB C4 90 A5 73 6B 78 02 B0 47 BE 2D 25 88 70 34 0A CB 0E D0 16 21 24 B8 F2 24 E2 4C 2C 56 E6 3A 48 16 0B 64 43 84 4A B4 F4 6A 95 6C 65 A1 92 E5 D5 7D DA 80 23 01 F9 B3 B4 D9 1C FA 55 12 69 18 C2 2E 74 AC E4 15 A8 8E D1 48 D5 AF 10 69 D8 E3 79 94 D9 F9 CC DE 8E 17 68 1B 90 E0 3A ED 2C A1 C0 A6 7B 0C 4E 54 DE 28 A8 6C B4 78 2A D6 19 CD B9 C7 91 70 9C 61 50 C0 E2 38 88 E6 65 7C DE 22 07 58 3E E0 B8 E2 E2 39 7E 65 B5 0A 42 C2 98 6E A4 ED 59 96 E8 76 2B BA BF 86 78 CB 85 81 08 7B 57 B2 85 71 3B E4 FF FA 04 9A D5 08 5B 80 D5 24 24";
        
        // Convert hex string to byte array
        String[] hexBytes = hexData.split(" ");
        byte[] testPacket = new byte[hexBytes.length];
        
        try {
            for (int i = 0; i < hexBytes.length; i++) {
                testPacket[i] = (byte) Integer.parseInt(hexBytes[i], 16);
            }
            
            Log.d(TAG, "🧪 Converted hex data to " + testPacket + " bytes");
            
            // Send the hardcoded test packet
            long sendStartTime = System.currentTimeMillis();
            comManager.sendFile(testPacket);
            long sendEndTime = System.currentTimeMillis();
            
            Log.d(TAG, "🧪 Sent hardcoded test packet (" + testPacket.length + " bytes) - UART send took " + (sendEndTime - sendStartTime) + "ms");
            
        } catch (NumberFormatException e) {
            Log.e(TAG, "🧪 Error converting hex data to bytes", e);
            // Fallback to normal retransmission
            transmitPacket(packetIndex, true);
        }
    }
    
    /**
     * Check if transfer has timed out (3 seconds elapsed)
     */
    private void checkTransferTimeout() {
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            return; // Transfer already completed or cancelled
        }
        
        long transferDuration = System.currentTimeMillis() - currentFileTransfer.startTime;
        if (transferDuration >= TRANSFER_TIMEOUT_MS) {
            Log.e(TAG, "⏰ File transfer timeout after " + transferDuration + "ms for " + currentFileTransfer.fileName);
            
            // Report transfer failure
            BluetoothReporting.reportFileTransferFailure(context, currentFileTransfer.filePath, 
                "send_file", "transfer_timeout", null);
            
            notificationManager.showDebugNotification("File Transfer Timeout", 
                "Transfer of " + currentFileTransfer.fileName + " timed out after 3 seconds");
            
            // Send timeout notification to phone
            sendTransferTimeoutNotification(currentFileTransfer.fileName);
            
            Log.d(TAG, "3 Disabling fast mode");
            // Clean up and disable fast mode
            comManager.setFastMode(false);
            currentFileTransfer = null;
        }
    }
    
    /**
     * Send transfer timeout notification to phone
     */
    private void sendTransferTimeoutNotification(String fileName) {
        try {
            JSONObject timeoutNotification = new JSONObject();
            timeoutNotification.put("type", "transfer_timeout");
            timeoutNotification.put("fileName", fileName);
            timeoutNotification.put("timestamp", System.currentTimeMillis());
            
            String jsonStr = timeoutNotification.toString();
            Log.d(TAG, "⏰ Sending transfer timeout notification: " + jsonStr);
            
            // Send directly as JSON (same format as announcement)
            boolean sent = sendData(jsonStr.getBytes(StandardCharsets.UTF_8));
            if (sent) {
                Log.d(TAG, "⏰ Transfer timeout notification sent successfully");
            } else {
                Log.e(TAG, "⏰ Failed to send transfer timeout notification");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "⏰ Error creating transfer timeout notification", e);
        }
    }
    
    /**
     * Handle transfer completion confirmation from phone
     */
    public void handleTransferCompletion(String fileName, boolean success) {
        if (currentFileTransfer == null) {
            Log.w(TAG, "✅ Transfer completion received but no active transfer");
            return;
        }
        
        if (!currentFileTransfer.fileName.equals(fileName)) {
            Log.w(TAG, "✅ Transfer completion filename mismatch. Expected: " + currentFileTransfer.fileName + ", Got: " + fileName);
            return;
        }
        
        Log.d(TAG, (success ? "✅" : "❌") + " Transfer completion confirmed for: " + fileName + " (success: " + success + ")");
        
        // Clean up transfer session
        currentFileTransfer = null;
    
        Log.d(TAG, "4 Disabling fast mode");
        // Disable fast mode
        comManager.setFastMode(false);
        
        if (success) {
            Log.d(TAG, "✅ File transfer completed successfully: " + fileName);
        } else {
            Log.e(TAG, "❌ File transfer failed: " + fileName);
        }
    }
    
    /**
     * Send a specific file packet by index
     */
    private void sendFilePacket(int packetIndex) {
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            return;
        }
        
        if (packetIndex >= currentFileTransfer.totalPackets) {
            // All packets sent - wait for phone confirmation before cleanup
            long transferDuration = System.currentTimeMillis() - currentFileTransfer.startTime;
            Log.d(TAG, "📦 All packets sent: " + currentFileTransfer.fileName);
            Log.d(TAG, "⏱️ Transmission took: " + transferDuration + "ms for " + currentFileTransfer.fileSize + " bytes");
            Log.d(TAG, "📊 Transmission rate: " + (currentFileTransfer.fileSize * 1000 / transferDuration) + " bytes/sec");
            Log.d(TAG, "⏳ Waiting for phone confirmation or timeout before cleanup...");
            
            // Keep transfer session alive for potential retransmission
            // Keep fast mode enabled for potential retransmission
            // Cleanup will happen in handleTransferCompletion() or checkTransferTimeout()
            return;
        }
        
        // TESTING: Simulate packet drop for testing missing packet detection (only on first attempt)
        if (ENABLE_PACKET_DROP_TEST && packetIndex == PACKET_TO_DROP && !hasDroppedTestPacket) {
            Log.w(TAG, "🧪 TESTING: Deliberately dropping packet " + packetIndex + " to test restart behavior (FIRST ATTEMPT ONLY)");
            hasDroppedTestPacket = true; // Mark that we've dropped the test packet
            
            // Skip this packet but continue with next one
            int nextPacketIndex = packetIndex + 1;
            if (nextPacketIndex < currentFileTransfer.totalPackets) {
                fileTransferExecutor.schedule(() -> sendFilePacket(nextPacketIndex), PACKET_SEND_DELAY_MS, TimeUnit.MILLISECONDS);
            }
            return;
        }
        
        // Use unified transmission function
        boolean sent = transmitPacket(packetIndex, false);
        if (!sent) {
            Log.e(TAG, "📦 Failed to transmit packet " + packetIndex + " - aborting transfer");
            currentFileTransfer = null;
            Log.d(TAG, "2 Disabling fast mode");
            comManager.setFastMode(false);
            return;
        }
        
        // Send next packet with rate limiting to prevent UART overflow
        int nextPacketIndex = packetIndex + 1;
        if (nextPacketIndex < currentFileTransfer.totalPackets) {
            // Add configurable delay to prevent UART buffer overflow (EAGAIN errors)
            fileTransferExecutor.schedule(() -> sendFilePacket(nextPacketIndex), PACKET_SEND_DELAY_MS, TimeUnit.MILLISECONDS);
        }
    }
    
    /**
     * Send the next file packet (legacy wrapper)
     */
    private void sendNextFilePacket() {
        if (currentFileTransfer != null) {
            sendFilePacket(currentFileTransfer.currentPacketIndex);
        }
    }
} 