package com.augmentos.asg_client.service.core.handlers;

import android.util.Log;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;

import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/**
 * Handler for WiFi-related commands.
 * Follows Single Responsibility Principle by handling only WiFi commands.
 */
public class WifiCommandHandler implements ICommandHandler {
    private static final String TAG = "WifiCommandHandler";
    
    private final AsgClientServiceManager serviceManager;
    private final ICommunicationManager communicationManager;
    private final IStateManager stateManager;

    public WifiCommandHandler(AsgClientServiceManager serviceManager, 
                            ICommunicationManager communicationManager,
                            IStateManager stateManager) {
        this.serviceManager = serviceManager;
        this.communicationManager = communicationManager;
        this.stateManager = stateManager;
    }

    @Override
    public String getCommandType() {
        return "set_wifi_credentials";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        try {
            String ssid = data.optString("ssid", "");
            String password = data.optString("password", "");
            if (!ssid.isEmpty()) {
                INetworkManager networkManager = serviceManager.getNetworkManager();
                if (networkManager != null) {
                    networkManager.connectToWifi(ssid, password);
                    serviceManager.initializeCameraWebServer();
                    return true;
                } else {
                    Log.e(TAG, "Network manager not available");
                    return false;
                }
            } else {
                Log.e(TAG, "Cannot set WiFi credentials - missing SSID");
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling WiFi credentials command", e);
            return false;
        }
    }

    /**
     * Handle request WiFi status command
     */
    public boolean handleRequestWifiStatus() {
        try {
            if (stateManager.isConnectedToWifi()) {
                communicationManager.sendWifiStatusOverBle(true);
            } else {
                communicationManager.sendWifiStatusOverBle(false);
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling WiFi status request", e);
            return false;
        }
    }

    /**
     * Handle request WiFi scan command
     */
    public boolean handleRequestWifiScan() {
        try {
            INetworkManager networkManager = serviceManager.getNetworkManager();
            if (networkManager != null) {
                new Thread(() -> {
                    try {
                        List<String> networks = networkManager.scanWifiNetworks();
                        communicationManager.sendWifiScanResultsOverBle(networks);
                    } catch (Exception e) {
                        Log.e(TAG, "Error scanning for WiFi networks", e);
                        communicationManager.sendWifiScanResultsOverBle(new ArrayList<>());
                    }
                }).start();
                return true;
            } else {
                Log.e(TAG, "Network manager not available for WiFi scan");
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling WiFi scan request", e);
            return false;
        }
    }

    /**
     * Handle set hotspot state command
     */
    public boolean handleSetHotspotState(JSONObject data) {
        try {
            boolean hotspotEnabled = data.optBoolean("enabled", false);
            INetworkManager networkManager = serviceManager.getNetworkManager();
            
            if (hotspotEnabled) {
                String hotspotSsid = data.optString("ssid", "");
                String hotspotPassword = data.optString("password", "");
                networkManager.startHotspot(hotspotSsid, hotspotPassword);
            } else {
                networkManager.stopHotspot();
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling hotspot state command", e);
            return false;
        }
    }
} 