package com.augmentos.asg_client.io.network.interfaces;

import java.util.List;

/**
 * Callback interface for streaming WiFi scan results.
 * Allows networks to be sent to the phone immediately as they're discovered.
 */
public interface IWifiScanCallback {
    
    /**
     * Called when new WiFi networks are discovered during scanning.
     * This method will be called multiple times during a scan as networks are found.
     * 
     * @param networks List of newly discovered network SSIDs
     */
    void onNetworksFound(List<String> networks);
    
    /**
     * Called when the WiFi scan has completed.
     * No more networks will be reported after this callback.
     * 
     * @param totalNetworksFound Total number of unique networks discovered
     */
    void onScanComplete(int totalNetworksFound);
    
    /**
     * Called when the WiFi scan encounters an error.
     * 
     * @param error Error message describing what went wrong
     */
    void onScanError(String error);
}