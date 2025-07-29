package com.augmentos.asg_client.bluetooth;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.bluetooth.serial.ComManager;
import com.augmentos.asg_client.bluetooth.serial.SerialListener;
import com.augmentos.asg_client.bluetooth.utils.K900MessageParser;
import com.augmentos.asg_client.bluetooth.utils.ByteUtil;

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

import com.augmentos.asg_client.reporting.ReportUtils;

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
     * @param context The application context
     */
    public K900BluetoothManager(Context context) {
        super(context);
        
        // Create the notification manager
        notificationManager = new DebugNotificationManager(context);
        notificationManager.showDeviceTypeNotification(true);
        
        // Create the communication manager
        comManager = new ComManager(context);
        
        // Create the message parser to handle fragmented messages
        messageParser = new K900MessageParser();
        
        // Initialize file transfer executor
        fileTransferExecutor = Executors.newSingleThreadScheduledExecutor();
    }
    
    @Override
    public void initialize() {
        super.initialize();
        
        // Register for serial events
        comManager.registerListener(this);
        
        // Start the serial communication
        boolean success = comManager.start();
        if (!success) {
            Log.e(TAG, "Failed to start serial communication");
            notificationManager.showDebugNotification("Bluetooth Error", 
                "Failed to start serial communication");
            
            // Report serial communication failure
            ReportUtils.reportSerialCommunicationFailure(context, "start_serial", 
                "unknown", -1, new Exception("Failed to start serial communication"));
        } else {
            Log.d(TAG, "Serial communication started successfully");
        }
    }
    
    @Override
    public void startAdvertising() {
        // K900 doesn't need to advertise manually, as BES2700 handles this
        Log.d(TAG, "K900 BT module handles advertising automatically");
        notificationManager.showDebugNotification("Bluetooth", 
            "K900 BT module handles advertising automatically");
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
    public boolean sendData(byte[] data) {
        if (data == null || data.length == 0) {
            Log.w(TAG, "Attempted to send null or empty data");
            return false;
        }
        
        if (!isSerialOpen) {
            Log.w(TAG, "Cannot send data - serial port not open");
            notificationManager.showDebugNotification("Bluetooth Error", 
                "Cannot send data - serial port not open");
            
            // Report data transmission failure
            ReportUtils.reportDataTransmissionFailure(context, "k900", 
                "unknown", data.length, "serial_port_not_open", null);
            return false;
        }
        
        // First check if it's already in protocol format
        if (!com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.isK900ProtocolFormat(data)) {
            // Try to interpret as a JSON string that needs C-wrapping and protocol formatting
            try {
                // Convert to string for processing
                String originalData = new String(data, "UTF-8");
                
                // If looks like JSON but not C-wrapped, use the full formatting function
                if (originalData.startsWith("{") &&
                    !com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.isCWrappedJson(originalData)) {
                    
                    Log.e(TAG, "📦 JSON DATA BEFORE C-WRAPPING: " + originalData);
                    data = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.formatMessageForTransmission(originalData);
                    
                    // Log the first 100 chars of the hex representation
                    StringBuilder hexDump = new StringBuilder();
                    for (int i = 0; i < Math.min(data.length, 50); i++) {
                        hexDump.append(String.format("%02X ", data[i]));
                    }
                    //Log.e(TAG, "📦 AFTER C-WRAPPING & PROTOCOL FORMATTING (first 50 bytes): " + hexDump.toString());
                    //Log.e(TAG, "📦 Total formatted length: " + data.length + " bytes");
                } else {
                    // Otherwise just apply protocol formatting
                    Log.e(TAG, "📦 Data already C-wrapped or not JSON: " + originalData);
                    Log.d(TAG, "Formatting data with K900 protocol (adding ##...)");
                    data = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.packDataCommand(
                        data, com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.CMD_TYPE_STRING);
                }
            } catch (Exception e) {
                // If we can't interpret as string, just apply protocol formatting to raw bytes
                Log.d(TAG, "Applying protocol format to raw bytes");
                data = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.packDataCommand(
                    data, com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.CMD_TYPE_STRING);
            }
        }
        
        // Send the data via the serial port
        comManager.send(data);
        
        // Only show notification for larger data packets to avoid spam
        if (data.length > 10) {
            notificationManager.showDebugNotification("Bluetooth Data", 
                "Sent " + data.length + " bytes via serial port");
        }
        
        return true;
    }
    
    @Override
    public void shutdown() {
        super.shutdown();
        
        // Stop the serial communication
        comManager.registerListener(null);
        comManager.stop();
        isSerialOpen = false;
        
        // Clear the message parser
        if (messageParser != null) {
            messageParser.clear();
        }
        
        // Stop file transfer executor
        if (fileTransferExecutor != null) {
            fileTransferExecutor.shutdownNow();
        }
        
        // Cancel any active file transfer
        if (currentFileTransfer != null) {
            currentFileTransfer.isActive = false;
            currentFileTransfer = null;
            // Disable fast mode
            comManager.setFastMode(false);
        }
        pendingPackets.clear();
        
        Log.d(TAG, "K900BluetoothManager shut down");
    }
    
    //---------------------------------------
    // SerialListener implementation
    //---------------------------------------
    
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
    public void onSerialRead(String serialPath, byte[] data, int size) {
        Log.d(TAG, "onSerialRead called with " + size + " bytes");
        if (data != null && size > 0) {
            // Copy the data to avoid issues with buffer reuse
            byte[] dataCopy = new byte[size];
            System.arraycopy(data, 0, dataCopy, 0, size);
            
            // Add the data to our message parser
            if (messageParser.addData(dataCopy, size)) {
                // Try to extract complete messages
                List<byte[]> completeMessages = messageParser.parseMessages();
                if (completeMessages != null && !completeMessages.isEmpty()) {
                    // Process each complete message
                    for (byte[] message : completeMessages) {
                        // Check for file transfer acknowledgments
                        processReceivedMessage(message);
                        
                        // Notify listeners of the received message
                        notifyDataReceived(message);
                        
                        // Show notification for debugging (only for larger messages to avoid spam)
                        if (message.length > 10) {
                            notificationManager.showDataReceivedNotification(message.length);
                        }
                    }
                }
            } else {
                Log.e(TAG, "Failed to add data to message parser buffer");
            }
        }
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
    
    //---------------------------------------
    // File Transfer Methods
    //---------------------------------------
    
    /**
     * Send an image file via BLE using the K900 file transfer protocol
     * 
     * @param filePath Path to the image file
     * @return true if transfer started successfully, false otherwise
     */
    @Override
    public boolean sendImageFile(String filePath) {
        if (!isSerialOpen) {
            Log.e(TAG, "Cannot send file - serial port not open");
            
            // Report file transfer failure
            ReportUtils.reportFileTransferFailure(context, filePath, "send_file", 
                "serial_port_not_open", null);
            return false;
        }
        
        if (currentFileTransfer != null && currentFileTransfer.isActive) {
            Log.e(TAG, "File transfer already in progress");
            
            // Report file transfer failure
            ReportUtils.reportFileTransferFailure(context, filePath, "send_file", 
                "transfer_already_in_progress", null);
            return false;
        }
        
        File file = new File(filePath);
        if (!file.exists() || !file.isFile()) {
            Log.e(TAG, "File not found: " + filePath);
            
            // Report file transfer failure
            ReportUtils.reportFileTransferFailure(context, filePath, "send_file", 
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
                ReportUtils.reportFileTransferFailure(context, filePath, "send_file", 
                    "incomplete_file_read", null);
                return false;
            }
        } catch (IOException e) {
            Log.e(TAG, "Error reading file: " + filePath, e);
            
            // Report file transfer failure with exception
            ReportUtils.reportFileTransferFailure(context, filePath, "send_file", 
                "io_exception", e);
            return false;
        }
        
        // Create file transfer session
        String fileName = file.getName();
        if (fileName.length() > 16) {
            fileName = fileName.substring(0, 16); // Truncate to 16 chars max
        }
        
        currentFileTransfer = new FileTransferSession(filePath, fileName, fileData);
        pendingPackets.clear();
        
        Log.d(TAG, "Starting file transfer: " + fileName + " (" + fileData.length + " bytes, " + 
                   currentFileTransfer.totalPackets + " packets)");
        
        notificationManager.showDebugNotification("File Transfer", 
            "Starting transfer of " + fileName + " (" + currentFileTransfer.totalPackets + " packets)");
        
        // Enable fast mode for file transfer
        comManager.setFastMode(true);
        
        // Send the first packet
        sendNextFilePacket();
        
        return true;
    }
    
    /**
     * Send the next file packet
     */
    private void sendNextFilePacket() {
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            return;
        }
        
        if (currentFileTransfer.currentPacketIndex >= currentFileTransfer.totalPackets) {
            // Transfer complete
            long transferDuration = System.currentTimeMillis() - currentFileTransfer.startTime;
            Log.d(TAG, "✅ File transfer complete: " + currentFileTransfer.fileName);
            Log.d(TAG, "⏱️ Transfer took: " + transferDuration + "ms for " + currentFileTransfer.fileSize + " bytes");
            Log.d(TAG, "📊 Transfer rate: " + (currentFileTransfer.fileSize * 1000 / transferDuration) + " bytes/sec");
            
            notificationManager.showDebugNotification("File Transfer Complete", 
                currentFileTransfer.fileName + " in " + transferDuration + "ms");
            
            // Delete the file after successful transfer
            try {
                File file = new File(currentFileTransfer.filePath);
                if (file.exists() && file.delete()) {
                    Log.d(TAG, "🗑️ Deleted file after successful BLE transfer: " + currentFileTransfer.filePath);
                } else {
                    Log.w(TAG, "Failed to delete file: " + currentFileTransfer.filePath);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error deleting file after BLE transfer", e);
            }
            
            // Disable fast mode
            comManager.setFastMode(false);
            
            currentFileTransfer = null;
            pendingPackets.clear();
            return;
        }
        
        // Calculate packet data
        int packetIndex = currentFileTransfer.currentPacketIndex;
        int offset = packetIndex * com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.FILE_PACK_SIZE;
        int packSize = Math.min(com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.FILE_PACK_SIZE, 
                                currentFileTransfer.fileSize - offset);
        
        // Extract packet data
        byte[] packetData = new byte[packSize];
        System.arraycopy(currentFileTransfer.fileData, offset, packetData, 0, packSize);
        
        // Pack the file packet
        byte[] packet = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.packFilePacket(
            packetData, packetIndex, packSize, currentFileTransfer.fileSize,
            currentFileTransfer.fileName, 0, // flags = 0
            com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.CMD_TYPE_PHOTO
        );
        
        if (packet == null) {
            Log.e(TAG, "Failed to pack file packet " + packetIndex);
            currentFileTransfer = null;
            return;
        }
        
        // Send the packet using sendFile (no logging)
        comManager.sendFile(packet);
        
        // Track packet state for acknowledgment
        pendingPackets.put(packetIndex, new FilePacketState());
        
        Log.d(TAG, "Sent file packet " + packetIndex + "/" + (currentFileTransfer.totalPackets - 1) + 
                   " (" + packSize + " bytes)");
        
        // Schedule acknowledgment timeout check
        fileTransferExecutor.schedule(() -> checkFilePacketAck(packetIndex), 
                                     FILE_TRANSFER_ACK_TIMEOUT_MS, TimeUnit.MILLISECONDS);
    }
    
    /**
     * Check if a file packet was acknowledged
     */
    private void checkFilePacketAck(int packetIndex) {
        FilePacketState packetState = pendingPackets.get(packetIndex);
        if (packetState == null) {
            // Packet was acknowledged and removed
            return;
        }
        
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            // Transfer was cancelled
            return;
        }
        
        // Check retry count
        if (packetState.retryCount >= FILE_TRANSFER_MAX_RETRIES) {
            Log.e(TAG, "File packet " + packetIndex + " failed after " + FILE_TRANSFER_MAX_RETRIES + " retries");
            notificationManager.showDebugNotification("File Transfer Error", 
                "Failed to send packet " + packetIndex);
            
            // Report file transfer retry exhaustion
            if (currentFileTransfer != null) {
                ReportUtils.reportFileTransferRetryExhaustion(context, currentFileTransfer.filePath, 
                    packetIndex, FILE_TRANSFER_MAX_RETRIES);
            }
            
            // Disable fast mode on failure
            comManager.setFastMode(false);
            
            currentFileTransfer = null;
            pendingPackets.clear();
            return;
        }
        
        // Retry sending the packet
        packetState.retryCount++;
        packetState.lastSendTime = System.currentTimeMillis();
        
        Log.w(TAG, "Retrying file packet " + packetIndex + " (attempt " + packetState.retryCount + ")");
        
        // Resend the packet
        int offset = packetIndex * com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.FILE_PACK_SIZE;
        int packSize = Math.min(com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.FILE_PACK_SIZE, 
                                currentFileTransfer.fileSize - offset);
        
        byte[] packetData = new byte[packSize];
        System.arraycopy(currentFileTransfer.fileData, offset, packetData, 0, packSize);
        
        byte[] packet = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.packFilePacket(
            packetData, packetIndex, packSize, currentFileTransfer.fileSize,
            currentFileTransfer.fileName, 0,
            com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.CMD_TYPE_PHOTO
        );
        
        if (packet != null) {
            comManager.sendFile(packet);
            
            // Schedule another timeout check
            fileTransferExecutor.schedule(() -> checkFilePacketAck(packetIndex), 
                                         FILE_TRANSFER_ACK_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        }
    }
    
    /**
     * Handle file transfer acknowledgment from BES chip
     * Note: BES chip auto-acknowledges packets, not the phone
     */
    private void handleFileTransferAck(int state, int index) {
        Log.d(TAG, "Received BES chip ACK: state=" + state + ", index=" + index);
        
        if (currentFileTransfer == null || !currentFileTransfer.isActive) {
            Log.w(TAG, "Received ACK but no active file transfer");
            return;
        }
        
        // BES chip sends ACK with index+1 (e.g., sends index=1 for packet 0)
        // This is expected behavior from the BES chip
        int expectedBesIndex = currentFileTransfer.currentPacketIndex + 1;
        if (index != expectedBesIndex) {
            Log.w(TAG, "Ignoring ACK with unexpected index " + index + 
                      " (expected BES index " + expectedBesIndex + " for packet " + 
                      currentFileTransfer.currentPacketIndex + ")");
            return;
        }
        
        if (state == 1) {
            // Success - BES chip acknowledged receipt
            // Convert BES index back to packet index
            int packetIndex = index - 1;
            FilePacketState packetState = pendingPackets.remove(packetIndex);
            
            if (packetState != null) {
                Log.d(TAG, "BES ACK received for packet " + packetIndex + " after " + 
                          (System.currentTimeMillis() - packetState.lastSendTime) + "ms");
            }
            
            if (packetIndex == currentFileTransfer.currentPacketIndex) {
                currentFileTransfer.currentPacketIndex++;
                Log.d(TAG, "BES confirmed packet " + packetIndex + ", moving to packet " + 
                          currentFileTransfer.currentPacketIndex);
                sendNextFilePacket();
            } else if (packetIndex < currentFileTransfer.currentPacketIndex) {
                Log.d(TAG, "Received late BES ACK for already processed packet " + packetIndex);
            }
        } else {
            // Failure - BES chip failed to receive packet
            Log.w(TAG, "BES chip reported failure for packet index " + (index - 1));
        }
    }
    
    /**
     * Process received message to check for file transfer acknowledgments
     */
    private void processReceivedMessage(byte[] message) {
        Log.d(TAG, "processReceivedMessage called with " + message.length + " bytes");
        
        // First check if it's a K900 protocol message
        if (!com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.isK900ProtocolFormat(message)) {
            Log.d(TAG, "Message is not K900 protocol format");
            return;
        }
        
        // Extract payload - try big-endian first (BES chip uses big-endian)
        byte[] payload = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.extractPayload(message);
        if (payload == null) {
            // Fallback to little-endian
            payload = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.extractPayloadFromK900(message);
            if (payload == null) {
                Log.e(TAG, "Failed to extract payload from message");
                // Log first few bytes for debugging
                if (message.length >= 10) {
                    StringBuilder hex = new StringBuilder();
                    for (int i = 0; i < Math.min(10, message.length); i++) {
                        hex.append(String.format("%02X ", message[i]));
                    }
                    Log.e(TAG, "Message start: " + hex.toString());
                }
                return;
            }
        }
        
        // Try to parse as JSON
        try {
            String jsonStr = new String(payload, "UTF-8");
            Log.d(TAG, "Extracted payload JSON: " + jsonStr);
            JSONObject json = new JSONObject(jsonStr);
            
            // Check if it's a C-wrapped message
            if (json.has("C")) {
                String command = json.getString("C");
                Log.d(TAG, "Found C-wrapped command: " + command);
                
                // Check for file transfer acknowledgment from BES chip
                if ("cs_flts".equals(command) && json.has("B")) {
                    JSONObject body;
                    
                    // Handle both string and object formats for B field
                    if (json.get("B") instanceof String) {
                        String bodyStr = json.getString("B");
                        body = new JSONObject(bodyStr);
                    } else {
                        body = json.getJSONObject("B");
                    }
                    
                    int state = body.optInt("state", 0);
                    int index = body.optInt("index", -1);
                    
                    if (index >= 0) {
                        // This is a BES chip auto-acknowledgment
                        Log.d(TAG, "BES chip auto-ACK detected: state=" + state + ", index=" + index);
                        handleFileTransferAck(state, index);
                    } else {
                        Log.e(TAG, "BES ACK missing index field!");
                    }
                }
            }
        } catch (Exception e) {
            // Not a JSON message or parsing error - log it
            Log.e(TAG, "Error parsing received message as JSON", e);
        }
    }
    
    /**
     * Test method: Send a test image from assets folder
     * 
     * @param assetFileName Name of the image file in assets folder (e.g., "test_image.jpg")
     * @return true if transfer started successfully, false otherwise
     */
    @Override
    public boolean sendTestImageFromAssets(String assetFileName) {
        if (!isSerialOpen) {
            Log.e(TAG, "Cannot send file - serial port not open");
            return false;
        }
        
        if (currentFileTransfer != null && currentFileTransfer.isActive) {
            Log.e(TAG, "File transfer already in progress");
            return false;
        }
        
        try {
            // Read image from assets
            byte[] fileData;
            try (java.io.InputStream is = context.getAssets().open(assetFileName)) {
                fileData = new byte[is.available()];
                int bytesRead = is.read(fileData);
                if (bytesRead != fileData.length) {
                    Log.e(TAG, "Failed to read complete asset file");
                    return false;
                }
            }
            
            // Create file transfer session
            String fileName = assetFileName;
            if (fileName.length() > 16) {
                fileName = fileName.substring(0, 16); // Truncate to 16 chars max
            }
            
            currentFileTransfer = new FileTransferSession("assets/" + assetFileName, fileName, fileData);
            pendingPackets.clear();
            
            Log.d(TAG, "🎾 TEST: Starting file transfer from assets: " + fileName + 
                       " (" + fileData.length + " bytes, " + currentFileTransfer.totalPackets + " packets)");
            Log.d(TAG, "📡 Using BES chip auto-acknowledgment protocol");
            
            notificationManager.showDebugNotification("Test File Transfer", 
                "Starting transfer of " + fileName + " from assets (" + currentFileTransfer.totalPackets + " packets)");
            
            // Enable fast mode for file transfer
            comManager.setFastMode(true);
            
            // Send the first packet
            sendNextFilePacket();
            
            return true;
            
        } catch (IOException e) {
            Log.e(TAG, "Error reading asset file: " + assetFileName, e);
            notificationManager.showDebugNotification("Test File Transfer Error", 
                "Failed to read asset: " + assetFileName);
            return false;
        }
    }
}