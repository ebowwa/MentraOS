package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;

import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Handler for missing packet retransmission requests.
 * Follows Single Responsibility Principle by handling only missing packet commands.
 */
public class MissingPacketCommandHandler implements ICommandHandler {
    private static final String TAG = "MissingPacketCommandHandler";
    
    private final AsgClientServiceManager serviceManager;

    public MissingPacketCommandHandler(AsgClientServiceManager serviceManager) {
        this.serviceManager = serviceManager;
    }

    @Override
    public Set<String> getSupportedCommandTypes() {
        return Set.of("request_missing_packets", "transfer_complete");
    }

    @Override
    public boolean handleCommand(String commandType, JSONObject data) {
        Log.d(TAG, "🔍 MissingPacketCommandHandler.handleCommand() called - Type: " + commandType);
        Log.d(TAG, "🔍 Data: " + (data != null ? data.toString() : "null"));
        
        try {
            switch (commandType) {
                case "request_missing_packets":
                    Log.d(TAG, "🔍 Processing request_missing_packets command");
                    return handleMissingPacketsRequest(data);
                case "transfer_complete":
                    Log.d(TAG, "🔍 Processing transfer_complete command");
                    return handleTransferComplete(data);
                default:
                    Log.e(TAG, "Unsupported missing packet command: " + commandType);
                    return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling missing packet command: " + commandType, e);
            return false;
        }
    }

    /**
     * Handle missing packets retransmission request
     */
    private boolean handleMissingPacketsRequest(JSONObject data) {
        try {
            String fileName = data.optString("fileName", "");
            JSONArray missingArray = data.optJSONArray("missingPackets");
            
            if (fileName.isEmpty() || missingArray == null) {
                Log.e(TAG, "🔍 Invalid missing packets request - missing fileName or missingPackets");
                return false;
            }
            
            // Convert JSONArray to List<Integer>
            List<Integer> missingPackets = new ArrayList<>();
            for (int i = 0; i < missingArray.length(); i++) {
                missingPackets.add(missingArray.getInt(i));
            }
            
            Log.d(TAG, "🔍 Received missing packets request for " + fileName + ": " + missingPackets);
            
            // Get the Bluetooth manager and request retransmission
            if (serviceManager != null && serviceManager.getBluetoothManager() != null) {
                if (serviceManager.getBluetoothManager() instanceof com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager) {
                    com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager k900Manager = 
                        (com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager) serviceManager.getBluetoothManager();
                    
                    // Request retransmission of specific packets
                    k900Manager.retransmitSpecificPackets(fileName, missingPackets);
                    Log.d(TAG, "🔍 Missing packets retransmission request forwarded to K900BluetoothManager");
                    return true;
                } else {
                    Log.w(TAG, "🔍 Bluetooth manager is not K900BluetoothManager, cannot handle missing packets request");
                }
            } else {
                Log.w(TAG, "🔍 Service manager or Bluetooth manager not available");
            }
            
            return false;
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing missing packets request", e);
            return false;
        }
    }

    /**
     * Handle transfer completion confirmation
     */
    private boolean handleTransferComplete(JSONObject data) {
        try {
            String fileName = data.optString("fileName", "");
            boolean success = data.optBoolean("success", false);
            
            Log.d(TAG, (success ? "✅" : "❌") + " Transfer completion confirmation for: " + fileName + " (success: " + success + ")");
            
            // Get the Bluetooth manager and notify of completion
            if (serviceManager != null && serviceManager.getBluetoothManager() != null) {
                if (serviceManager.getBluetoothManager() instanceof com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager) {
                    com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager k900Manager = 
                        (com.augmentos.asg_client.io.bluetooth.managers.K900BluetoothManager) serviceManager.getBluetoothManager();
                    
                    // Notify completion and cleanup
                    k900Manager.handleTransferCompletion(fileName, success);
                    Log.d(TAG, "✅ Transfer completion forwarded to K900BluetoothManager");
                    return true;
                } else {
                    Log.w(TAG, "Bluetooth manager is not K900BluetoothManager, cannot handle transfer completion");
                }
            } else {
                Log.w(TAG, "Service manager or Bluetooth manager not available");
            }
            
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error handling transfer completion", e);
            return false;
        }
    }
}
