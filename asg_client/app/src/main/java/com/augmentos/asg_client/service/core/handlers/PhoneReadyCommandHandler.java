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
        try {
            Log.d(TAG, "📱 Received phone_ready message - sending glasses_ready response");
            
            JSONObject response = responseBuilder.buildGlassesReadyResponse();
            communicationManager.sendBluetoothResponse(response);

            // Auto-send WiFi status after glasses_ready
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (stateManager.isConnectedToWifi()) {
                    communicationManager.sendWifiStatusOverBle(true);
                }
            }, 500);
            
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling phone ready command", e);
            return false;
        }
    }
} 