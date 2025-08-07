package com.augmentos.asg_client.service.core.handlers;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.communication.interfaces.IResponseBuilder;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;

import org.json.JSONObject;

/**
 * Handler for phone ready commands.
 * Follows Single Responsibility Principle by handling only phone ready commands.
 */
public class PhoneReadyCommandHandler implements ICommandHandler {
    private static final String TAG = "PhoneReadyCommandHandler";
    
    private final ICommunicationManager communicationManager;
    private final IStateManager stateManager;
    private final IResponseBuilder responseBuilder;

    public PhoneReadyCommandHandler(ICommunicationManager communicationManager, 
                                  IStateManager stateManager,
                                  IResponseBuilder responseBuilder) {
        this.communicationManager = communicationManager;
        this.stateManager = stateManager;
        this.responseBuilder = responseBuilder;
    }

    @Override
    public String getCommandType() {
        return "phone_ready";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        Log.d(TAG, "📱 =========================================");
        Log.d(TAG, "📱 HANDLE PHONE READY COMMAND");
        Log.d(TAG, "📱 =========================================");
        Log.d(TAG, "📱 Received phone_ready data: " + (data != null ? data.toString() : "null"));
        
        try {
            Log.d(TAG, "📱 📱 Received phone_ready message - sending glasses_ready response");
            
            Log.d(TAG, "📱 🔨 Building glasses_ready response...");
            JSONObject response = responseBuilder.buildGlassesReadyResponse();
            Log.d(TAG, "📱 📤 Sending glasses_ready response: " + response.toString());
            
            boolean sent = communicationManager.sendBluetoothResponse(response);
            Log.d(TAG, "📱 " + (sent ? "✅ Glasses ready response sent successfully" : "❌ Failed to send glasses ready response"));

            // Auto-send WiFi status after glasses_ready
            Log.d(TAG, "📱 🔄 Scheduling WiFi status check in 500ms...");
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                Log.d(TAG, "📱 📡 Checking WiFi connection status...");
                if (stateManager.isConnectedToWifi()) {
                    Log.d(TAG, "📱 ✅ WiFi connected, sending status...");
                    communicationManager.sendWifiStatusOverBle(true);
                } else {
                    Log.d(TAG, "📱 ❌ WiFi not connected, skipping status send");
                }
            }, 500);
            
            return sent;
        } catch (Exception e) {
            Log.e(TAG, "📱 💥 Error handling phone ready command", e);
            return false;
        }
    }
} 