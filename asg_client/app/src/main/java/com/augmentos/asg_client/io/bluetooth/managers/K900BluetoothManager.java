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
import java.util.concurrent.ScheduledFuture;
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
    private ScheduledFuture<?> timeoutTask = null; // Track timeout task for cancellation
    private static final int TRANSFER_TIMEOUT_MS = 5000; // 5 seconds timeout (reset on each retry)
    
    // Callback for file transfer completion events
    public interface FileTransferCompletionCallback {
        void onFileTransferCompleted(boolean success, String fileName);
    }
    private FileTransferCompletionCallback transferCompletionCallback;
    
    
    // Packet transmission timing configuration
    private static final int PACKET_SEND_DELAY_MS = 20; // Delay between packets to prevent UART overflow
    private static final int RETRANSMISSION_DELAY_MS = 10; // Delay between retransmissions
    
    // Testing: Packet drop simulation
    private static final boolean ENABLE_PACKET_DROP_TEST = false; // Disabled for production (set to true for testing)
    private static final int PACKET_TO_DROP = 5; // Drop packet #5 for testing
    private boolean hasDroppedTestPacket = false; // Track if we've already dropped the test packet

    // Retry limits
    private static final int MAX_TRANSFER_RETRIES = 3; // Maximum number of retry attempts

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
        int retryCount; // Track number of retry attempts

        FileTransferSession(String filePath, String fileName, byte[] fileData) {
            this.filePath = filePath;
            this.fileName = fileName;
            this.fileData = fileData;
            this.fileSize = fileData.length;
            this.totalPackets = (fileSize + K900ProtocolUtils.FILE_PACK_SIZE - 1) / K900ProtocolUtils.FILE_PACK_SIZE;
            this.currentPacketIndex = 0;
            this.isActive = true;
            this.startTime = System.currentTimeMillis();
            this.retryCount = 0; // Initialize retry counter
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
     * Set callback for file transfer completion events
     */
    public void setFileTransferCompletionCallback(FileTransferCompletionCallback callback) {
        this.transferCompletionCallback = callback;
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

        // Schedule transfer timeout check
        scheduleTimeoutCheck();

        // Send all packets using iterative approach (from remote)
        sendAllFilePackets();

        return true;
    }
    
    /**
     * Restart entire file transfer due to missing packets (for now - will be optimized to selective retransmission)
     */
    public void retransmitMissingPackets(String fileName, List<Integer> missingPackets) {
        Log.d(TAG, "🔄 retransmitMissingPackets() called - fileName: " + fileName + ", missing " + missingPackets.size() + " packets: " + missingPackets);

        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            Log.w(TAG, "🔄 Cannot restart - no active transfer (currentFileTransfer: " + (currentFileTransfer != null ? "exists but inactive" : "null") + ")");
            return;
        }

        if (!currentFileTransfer.fileName.equals(fileName)) {
            Log.w(TAG, "🔄 Cannot restart - filename mismatch. Expected: " + currentFileTransfer.fileName + ", Got: " + fileName);
            return;
        }

        // Increment retry counter
        currentFileTransfer.retryCount++;
        Log.w(TAG, "🔄 Retry attempt " + currentFileTransfer.retryCount + "/" + MAX_TRANSFER_RETRIES + " for " + fileName);

        // Check if we've exceeded max retries
        if (currentFileTransfer.retryCount > MAX_TRANSFER_RETRIES) {
            Log.e(TAG, "❌ Max retries exceeded (" + MAX_TRANSFER_RETRIES + ") for " + fileName + ". Giving up.");

            // Report failure
            BluetoothReporting.reportFileTransferFailure(context, currentFileTransfer.filePath,
                "send_file", "max_retries_exceeded", null);

            notificationManager.showDebugNotification("File Transfer Failed",
                "Max retries exceeded for " + currentFileTransfer.fileName);

            // Send final failure notification to phone
            sendTransferFailureNotification(currentFileTransfer.fileName, "max_retries_exceeded");

            // Clean up but keep the file for manual retry or debugging
            Log.d(TAG, "Disabling fast mode after max retries");
            comManager.setFastMode(false);
            currentFileTransfer = null;

            return;
        }

        Log.w(TAG, "🔄 RESTARTING entire file transfer due to " + missingPackets.size() + " missing packets for " + fileName);

        // Reset transfer state to beginning
        currentFileTransfer.currentPacketIndex = 0;
        currentFileTransfer.startTime = System.currentTimeMillis(); // Reset start time for fresh timeout

        // Cancel existing timeout and reschedule for the retry
        cancelTimeoutCheck();
        scheduleTimeoutCheck();

        // Send file transfer announcement again to notify phone of restart
        sendFileTransferAnnouncement();

        // Send all packets from the beginning
        Log.d(TAG, "🔄 Restarting transmission of all " + currentFileTransfer.totalPackets + " packets");
        sendAllFilePackets();
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
     * Complete encapsulated packet transmission - handles everything for one packet index
     * @param packetIndex The packet index to transmit
     * @return true if packet was sent successfully, false otherwise
     */
    private boolean transmitSinglePacket(int packetIndex) {
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            Log.w(TAG, "📦 Cannot transmit packet " + packetIndex + " - no active transfer");
            return false;
        }
        
        if (packetIndex < 0 || packetIndex >= currentFileTransfer.totalPackets) {
            Log.w(TAG, "📦 Invalid packet index " + packetIndex + " (valid range: 0-" + (currentFileTransfer.totalPackets - 1) + ")");
            return false;
        }
        
        // TESTING: Simulate packet drop for testing missing packet detection (only on first attempt)
        if (ENABLE_PACKET_DROP_TEST && packetIndex == PACKET_TO_DROP && !hasDroppedTestPacket) {
            Log.w(TAG, "🧪 TESTING: Deliberately dropping packet " + packetIndex + " to test restart behavior (FIRST ATTEMPT ONLY)");
            hasDroppedTestPacket = true; // Mark that we've dropped the test packet
            return true; // Return true to continue with other packets
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
            Log.e(TAG, "📦 Failed to pack packet " + packetIndex);
            return false;
        }
        
        // Commander, mission objective: Log the full contents of the outgoing UART packet before transmission for maximum battlefield visibility.
        // Plan of attack: We'll log the packet in hex format, up to the first 64 bytes for recon, and if it's longer, indicate the total size.
        StringBuilder hexDump = new StringBuilder();
        int dumpLen = Math.min(packet.length, 64);
        for (int i = 0; i < dumpLen; i++) {
            hexDump.append(String.format("%02X ", packet[i]));
        }
        Log.d(TAG, "📦 UART packet dump (" + packet.length + " bytes): " + hexDump.toString() + (packet.length > 64 ? "... [truncated]" : ""));

        // Send the packet via UART
        long sendStartTime = System.currentTimeMillis();
        comManager.sendFile(packet);
        long sendEndTime = System.currentTimeMillis();
        
        // Log transmission details
        Log.d(TAG, "📦 Sent packet " + packetIndex + "/" + (currentFileTransfer.totalPackets - 1) + 
                   " (" + packSize + " bytes) - UART send took " + (sendEndTime - sendStartTime) + "ms");

        return true;
    }
    
    /**
     * Schedule a timeout check for the current transfer
     */
    private void scheduleTimeoutCheck() {
        if (fileTransferExecutor != null && currentFileTransfer != null) {
            // Cancel any existing timeout
            cancelTimeoutCheck();

            // Schedule new timeout
            timeoutTask = fileTransferExecutor.schedule(() -> checkTransferTimeout(),
                                                        TRANSFER_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            Log.d(TAG, "⏱️ Scheduled transfer timeout check for " + TRANSFER_TIMEOUT_MS + "ms");
        }
    }

    /**
     * Cancel the current timeout check
     */
    private void cancelTimeoutCheck() {
        if (timeoutTask != null && !timeoutTask.isDone()) {
            timeoutTask.cancel(false);
            Log.d(TAG, "⏱️ Cancelled existing timeout check");
        }
    }

    /**
     * Check if transfer has timed out (5 seconds elapsed)
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
     * Send transfer failure notification to phone (when max retries exceeded)
     */
    private void sendTransferFailureNotification(String fileName, String reason) {
        try {
            JSONObject failureNotification = new JSONObject();
            failureNotification.put("type", "transfer_failed");
            failureNotification.put("fileName", fileName);
            failureNotification.put("reason", reason);
            failureNotification.put("timestamp", System.currentTimeMillis());

            String jsonStr = failureNotification.toString();
            Log.d(TAG, "❌ Sending transfer failure notification: " + jsonStr);

            // Send directly as JSON (same format as announcement)
            boolean sent = sendData(jsonStr.getBytes(StandardCharsets.UTF_8));
            if (sent) {
                Log.d(TAG, "❌ Transfer failure notification sent successfully");
            } else {
                Log.e(TAG, "❌ Failed to send transfer failure notification");
            }

        } catch (Exception e) {
            Log.e(TAG, "❌ Error creating transfer failure notification", e);
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

        // Cancel timeout since we got a response
        cancelTimeoutCheck();

        // Store file path before cleaning up transfer session
        String filePath = currentFileTransfer.filePath;

        // Clean up transfer session
        currentFileTransfer = null;

        Log.d(TAG, "4 Disabling fast mode");
        // Disable fast mode
        comManager.setFastMode(false);
        

        if (success) {
            Log.d(TAG, "✅ File transfer completed successfully: " + fileName);

            // Delete the file after successful transfer confirmation
            if (filePath != null) {
                try {
                    File file = new File(filePath);
                    if (file.exists() && file.delete()) {
                        Log.d(TAG, "🗑️ Deleted file after confirmed successful BLE transfer: " + filePath);
                    } else {
                        Log.w(TAG, "Failed to delete file: " + filePath);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error deleting file after BLE transfer", e);
                }
            }
        } else {
            Log.e(TAG, "❌ File transfer failed: " + fileName);
            // Keep file for potential retry or debugging
        }
        
        // Notify callback about transfer completion
        if (transferCompletionCallback != null) {
            transferCompletionCallback.onFileTransferCompleted(success, fileName);
        }
    }
    
    /**
     * Send all file packets using iterative approach (non-recursive)
     */
    private void sendAllFilePackets() {
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            Log.w(TAG, "📦 Cannot send packets - no active transfer");
            return;
        }
        
        Log.d(TAG, "🚀 Starting iterative transmission of " + currentFileTransfer.totalPackets + " packets");
        
        // Send all packets with rate limiting using executor scheduling
        for (int i = 0; i < currentFileTransfer.totalPackets; i++) {
            final int packetIndex = i;
            
            // Schedule packet transmission with rate limiting
            long delay = i * PACKET_SEND_DELAY_MS; // Stagger packets by 10ms each
            fileTransferExecutor.schedule(() -> {
                // Use encapsulated single packet transmission (handles drop logic internally)
                boolean sent = transmitSinglePacket(packetIndex);
                if (!sent) {
                    Log.e(TAG, "📦 Failed to transmit packet " + packetIndex + " - aborting transfer");
                    currentFileTransfer = null;
                    comManager.setFastMode(false);
                    
                    return;
                }
                
                // Check if this was the last packet
                if (packetIndex == currentFileTransfer.totalPackets - 1) {
                    long transferDuration = System.currentTimeMillis() - currentFileTransfer.startTime;
                    Log.d(TAG, "📦 All packets sent: " + currentFileTransfer.fileName);
                    Log.d(TAG, "⏱️ Transmission took: " + transferDuration + "ms for " + currentFileTransfer.fileSize + " bytes");
                    Log.d(TAG, "📊 Transmission rate: " + (currentFileTransfer.fileSize * 1000 / transferDuration) + " bytes/sec");
                    Log.d(TAG, "⏳ Waiting for phone confirmation or timeout before cleanup...");
                }
            }, delay, TimeUnit.MILLISECONDS);
        }
    }
    
    /**
     * Send the next file packet (legacy wrapper - now just starts all packets)
     */
    private void sendNextFilePacket() {
        Log.d(TAG, "📦 Legacy sendNextFilePacket() called - starting all packets transmission");
        sendAllFilePackets();
    }
}