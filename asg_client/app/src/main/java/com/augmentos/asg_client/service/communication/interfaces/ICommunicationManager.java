package com.augmentos.asg_client.service.communication.interfaces;

import org.json.JSONObject;

/**
 * Interface for communication management (Bluetooth, WiFi status, etc.).
 * Follows Interface Segregation Principle by providing focused communication methods.
 */
public interface ICommunicationManager {
    
    /**
     * Send WiFi status over Bluetooth
     * @param isConnected WiFi connection status
     */
    void sendWifiStatusOverBle(boolean isConnected);
    
    /**
     * Send battery status over Bluetooth
     */
    void sendBatteryStatusOverBle();
    
    /**
     * Send WiFi scan results over Bluetooth
     * @param networks List of available networks
     */
    void sendWifiScanResultsOverBle(java.util.List<String> networks);
    
    /**
     * Send acknowledgment response
     * @param messageId Message ID to acknowledge
     */
    void sendAckResponse(long messageId);
    
    /**
     * Send token status response
     * @param success Success status
     */
    void sendTokenStatusResponse(boolean success);
    
    /**
     * Send media success response
     * @param requestId Request ID
     * @param mediaUrl Media URL
     * @param mediaType Media type
     */
    void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType);
    
    /**
     * Send media error response
     * @param requestId Request ID
     * @param errorMessage Error message
     * @param mediaType Media type
     */
    void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType);
    
    /**
     * Send keep-alive acknowledgment
     * @param streamId Stream ID
     * @param ackId Acknowledgment ID
     */
    void sendKeepAliveAck(String streamId, String ackId);
    
    /**
     * Send data over Bluetooth
     * @param data Data to send
     * @return true if sent successfully, false otherwise
     */
    boolean sendBluetoothData(byte[] data);
    
    /**
     * Send JSON response over Bluetooth
     * @param response JSON response to send
     * @return true if sent successfully, false otherwise
     */
    boolean sendBluetoothResponse(JSONObject response);
} 