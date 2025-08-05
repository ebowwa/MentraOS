package com.augmentos.asg_client.service.communication.managers;

import android.util.Log;


import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Manages all communication operations (Bluetooth, WiFi status, etc.).
 * Follows Single Responsibility Principle by handling only communication concerns.
 */
public class CommunicationManager implements ICommunicationManager {
    
    private static final String TAG = "CommunicationManager";
    
    private AsgClientServiceManager serviceManager;
    
    public CommunicationManager(AsgClientServiceManager serviceManager) {
        this.serviceManager = serviceManager;
    }
    
    public void setServiceManager(AsgClientServiceManager serviceManager) {
        this.serviceManager = serviceManager;
    }
    
    @Override
    public void sendWifiStatusOverBle(boolean isConnected) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject wifiStatus = new JSONObject();
                wifiStatus.put("type", "wifi_status");
                wifiStatus.put("connected", isConnected);

                if (isConnected && serviceManager.getNetworkManager() != null) {
                    String ssid = serviceManager.getNetworkManager().getCurrentWifiSsid();
                    String localIp = serviceManager.getNetworkManager().getLocalIpAddress();
                    
                    wifiStatus.put("ssid", ssid != null ? ssid : "unknown");
                    wifiStatus.put("local_ip", localIp != null ? localIp : "");
                } else {
                    wifiStatus.put("ssid", "");
                    wifiStatus.put("local_ip", "");
                }

                String jsonString = wifiStatus.toString();
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
                Log.d(TAG, "Sent WiFi status via BLE");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi status JSON", e);
            }
        }
    }
    
    @Override
    public void sendBatteryStatusOverBle() {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "battery_status");
                response.put("timestamp", System.currentTimeMillis());
                // Note: Battery level and charging status would be injected via constructor or setter
                response.put("level", -1); // Placeholder
                response.put("charging", false); // Placeholder

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending battery status: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));

            } catch (JSONException e) {
                Log.e(TAG, "Error creating battery status response", e);
            }
        } else {
            Log.w(TAG, "Cannot send battery status - not connected to BLE device");
        }
    }
    
    @Override
    public void sendWifiScanResultsOverBle(List<String> networks) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "wifi_scan_results");
                response.put("timestamp", System.currentTimeMillis());
                
                org.json.JSONArray networksArray = new org.json.JSONArray();
                for (String network : networks) {
                    networksArray.put(network);
                }
                response.put("networks", networksArray);

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending WiFi scan results: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));

            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi scan results response", e);
            }
        } else {
            Log.w(TAG, "Cannot send WiFi scan results - not connected to BLE device");
        }
    }
    
    @Override
    public void sendAckResponse(long messageId) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject ackResponse = new JSONObject();
                ackResponse.put("type", "msg_ack");
                ackResponse.put("mId", messageId);
                ackResponse.put("timestamp", System.currentTimeMillis());

                String jsonString = ackResponse.toString();
                Log.d(TAG, "📤 Sending ACK response: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));

            } catch (JSONException e) {
                Log.e(TAG, "Error creating ACK response JSON", e);
            }
        } else {
            Log.w(TAG, "Cannot send ACK response - not connected to BLE device");
        }
    }
    
    @Override
    public void sendTokenStatusResponse(boolean success) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "token_status");
                response.put("success", success);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "Formatted token status response: " + jsonString);

                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());

                Log.d(TAG, "Sent token status response: " + (success ? "SUCCESS" : "FAILED"));
            } catch (JSONException e) {
                Log.e(TAG, "Error creating token status response", e);
            }
        }
    }
    
    @Override
    public void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "media_success");
                response.put("requestId", requestId);
                response.put("mediaUrl", mediaUrl);
                response.put("mediaType", mediaType);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending media success response: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));

            } catch (JSONException e) {
                Log.e(TAG, "Error creating media success response", e);
            }
        } else {
            Log.w(TAG, "Cannot send media success response - not connected to BLE device");
        }
    }
    
    @Override
    public void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject response = new JSONObject();
                response.put("type", "media_error");
                response.put("requestId", requestId);
                response.put("errorMessage", errorMessage);
                response.put("mediaType", mediaType);
                response.put("timestamp", System.currentTimeMillis());

                String jsonString = response.toString();
                Log.d(TAG, "📤 Sending media error response: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));

            } catch (JSONException e) {
                Log.e(TAG, "Error creating media error response", e);
            }
        } else {
            Log.w(TAG, "Cannot send media error response - not connected to BLE device");
        }
    }
    
    @Override
    public void sendKeepAliveAck(String streamId, String ackId) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject keepAliveResponse = new JSONObject();
                keepAliveResponse.put("type", "keep_alive_ack");
                keepAliveResponse.put("streamId", streamId);
                keepAliveResponse.put("ackId", ackId);
                keepAliveResponse.put("timestamp", System.currentTimeMillis());

                String jsonString = keepAliveResponse.toString();
                Log.d(TAG, "📤 Sending keep-alive ACK: " + jsonString);
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));

            } catch (JSONException e) {
                Log.e(TAG, "Error creating keep-alive ACK response", e);
            }
        } else {
            Log.w(TAG, "Cannot send keep-alive ACK - not connected to BLE device");
        }
    }
    
    @Override
    public boolean sendBluetoothData(byte[] data) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            return serviceManager.getBluetoothManager().sendData(data);
        }
        return false;
    }
    
    @Override
    public boolean sendBluetoothResponse(JSONObject response) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                String jsonString = response.toString();
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes(StandardCharsets.UTF_8));
                return true;
            } catch (Exception e) {
                Log.e(TAG, "Error sending Bluetooth response", e);
                return false;
            }
        }
        return false;
    }
} 