package com.augmentos.asg_client.bluetooth;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.augmentos.asg_client.bluetooth.serial.ComManager;
import com.augmentos.asg_client.bluetooth.serial.SerialListener;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Implementation of IBluetoothManager for K900 devices.
 * Uses the K900's serial port to communicate with the BES2700 Bluetooth module.
 */
public class K900BluetoothManager extends BaseBluetoothManager implements SerialListener {
    private static final String TAG = "K900BluetoothManager";
    
    private ComManager comManager;
    private boolean isSerialOpen = false;
    private DebugNotificationManager notificationManager;
    
    // Heart beat timer for K900 BES2700 MCU
    private Handler heartbeatHandler;
    private final long HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds, matching the SDK
    
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
        } else {
            Log.d(TAG, "Serial communication started successfully");
        }
    }
    
    /**
     * Start the heart beat timer to keep the BES2700 active
     * This sends regular heartbeats to maintain communication with the MCU
     */
    private void startHeartbeatTimer() {
        if (heartbeatHandler == null) {
            heartbeatHandler = new Handler(Looper.getMainLooper());
        }
        
        Log.d(TAG, "🔄 Starting UART heart beat timer");
        heartbeatHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                sendUartHeart();
                heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
            }
        }, 3000); // First heartbeat after 3 seconds
    }
    
    /**
     * Stop the heart beat timer
     */
    private void stopHeartbeatTimer() {
        Log.d(TAG, "🔄 Stopping UART heart beat timer");
        if (heartbeatHandler != null) {
            heartbeatHandler.removeCallbacksAndMessages(null);
        }
    }
    
    /**
     * Send a heart beat to the BES2700 MCU
     * This uses the same format as the K900 SDK
     */
    private void sendUartHeart() {
        try {
            // Create K900 format heart beat command
            JSONObject command = new JSONObject();
            command.put("C", "u_heart"); // UART_HEART from the SDK
            command.put("V", 1);
            command.put("B", "");
            
            // Convert to string
            String jsonString = command.toString();
            Log.d(TAG, "🔄 Sending UART heart beat: " + jsonString);
            
            // Send via serial port
            if (isSerialOpen) {
                sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "✅ Sent heart beat to BES2700");
            } else {
                Log.d(TAG, "❌ Cannot send heart beat - serial port not open");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending heart beat", e);
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
            return false;
        }
        
        // Format the data using the unified utility method
        data = com.augmentos.augmentos_core.smarterglassesmanager.utils.K900ProtocolUtils.prepareDataForTransmission(data);
        
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
        
        // Stop the heartbeat timer
        stopHeartbeatTimer();
        
        // Stop the serial communication
        comManager.registerListener(null);
        comManager.stop();
        isSerialOpen = false;
        
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
        
        // Start the heartbeat timer to maintain communication with BES2700
        startHeartbeatTimer();
        
        // For K900, when the serial port is ready, we consider ourselves "connected"
        // to the BT module
        notifyConnectionStateChanged(true);
        notificationManager.showBluetoothStateNotification(true);
        notificationManager.showDebugNotification("Serial Ready", 
            "Serial port ready: " + serialPath);
    }
    
    @Override
    public void onSerialRead(String serialPath, byte[] data, int size) {
        if (data != null && size > 0) {
            // Copy the data to avoid issues with buffer reuse
            byte[] dataCopy = new byte[size];
            System.arraycopy(data, 0, dataCopy, 0, size);
            
            // Notify listeners of the received data
            Log.d(TAG, "GOT SUM DATA? " + Arrays.toString(dataCopy));
            notifyDataReceived(dataCopy);
            
            // Show notification for debugging (only for larger data packets to avoid spam)
            if (size > 10) {
                notificationManager.showDataReceivedNotification(size);
            }
        }
    }
    
    @Override
    public void onSerialClose(String serialPath) {
        Log.d(TAG, "Serial port closed: " + serialPath);
        isSerialOpen = false;
        
        // Stop the heartbeat timer
        stopHeartbeatTimer();
        
        // When the serial port closes, we consider ourselves disconnected
        notifyConnectionStateChanged(false);
        notificationManager.showBluetoothStateNotification(false);
        notificationManager.showDebugNotification("Serial Closed", 
            "Serial port closed: " + serialPath);
    }
}