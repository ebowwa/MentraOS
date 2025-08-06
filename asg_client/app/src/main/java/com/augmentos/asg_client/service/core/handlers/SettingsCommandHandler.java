package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;

import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.communication.interfaces.IResponseBuilder;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.settings.AsgSettings;
import org.json.JSONObject;

/**
 * Handler for settings-related commands.
 * Follows Single Responsibility Principle by handling only settings commands.
 */
public class SettingsCommandHandler implements ICommandHandler {
    private static final String TAG = "SettingsCommandHandler";
    
    private final AsgClientServiceManager serviceManager;
    private final ICommunicationManager communicationManager;
    private final IResponseBuilder responseBuilder;

    public SettingsCommandHandler(AsgClientServiceManager serviceManager,
                                ICommunicationManager communicationManager,
                                IResponseBuilder responseBuilder) {
        this.serviceManager = serviceManager;
        this.communicationManager = communicationManager;
        this.responseBuilder = responseBuilder;
    }

    @Override
    public String getCommandType() {
        return "set_photo_mode";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        try {
            String mode = data.optString("mode", "save_locally");
            JSONObject ack = responseBuilder.buildPhotoModeAckResponse(mode);
            communicationManager.sendBluetoothResponse(ack);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling photo mode command", e);
            return false;
        }
    }

    /**
     * Handle button mode setting command
     */
    public boolean handleButtonModeSetting(JSONObject data) {
        try {
            String mode = data.optString("mode", "photo");
            Log.d(TAG, "📱 Received button mode setting: " + mode);
            AsgSettings settings = serviceManager.getAsgSettings();
            if (settings != null) {
                settings.setButtonPressMode(mode);
                return true;
            } else {
                Log.e(TAG, "Settings not available");
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling button mode setting", e);
            return false;
        }
    }
} 