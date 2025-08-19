package com.augmentos.asg_client.io.network.core;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.LinkProperties;
import android.net.wifi.WifiManager;
import android.net.wifi.ScanResult;
import android.util.Log;

import com.augmentos.asg_client.NetworkUtils;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.io.network.interfaces.IWifiScanCallback;
import com.augmentos.asg_client.io.network.interfaces.NetworkStateListener;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Base implementation of the INetworkManager interface.
 * Provides common functionality for all network manager implementations.
 */
public abstract class BaseNetworkManager implements INetworkManager {
    private static final String TAG = "BaseNetworkManager";

    protected final Context context;
    protected final List<NetworkStateListener> listeners = new ArrayList<>();
    protected boolean isHotspotEnabled = false;

    /**
     * Create a new BaseNetworkManager
     *
     * @param context The application context
     */
    public BaseNetworkManager(Context context) {
        this.context = context.getApplicationContext();
    }

    @Override
    public void addWifiListener(NetworkStateListener listener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener);
        }
    }

    @Override
    public void removeWifiListener(NetworkStateListener listener) {
        listeners.remove(listener);
    }

    /**
     * Notify all listeners that the WiFi state has changed
     *
     * @param isConnected true if connected to WiFi, false otherwise
     */
    public void notifyWifiStateChanged(boolean isConnected) {
        // Important! Check the actual WiFi state - this prevents reversed state reporting
        boolean actuallyConnected = isConnectedToWifi();

        // If the reported state doesn't match the actual state, log a warning
        if (isConnected != actuallyConnected) {
            Log.w(TAG, "WiFi state mismatch - reported: " + (isConnected ? "connected" : "disconnected") +
                    ", actual: " + (actuallyConnected ? "connected" : "disconnected"));
            // Use the actual state instead of the reported state
            isConnected = actuallyConnected;
        }

        Log.d(TAG, "WiFi state changed: " + (isConnected ? "CONNECTED" : "DISCONNECTED"));
        for (NetworkStateListener listener : listeners) {
            try {
                // Log.d(TAG, "Notifying listener: " + listener.getClass().getSimpleName());
                listener.onWifiStateChanged(isConnected);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying listener", e);
            }
        }
    }

    /**
     * Notify all listeners that the hotspot state has changed
     *
     * @param isEnabled true if the hotspot is enabled, false otherwise
     */
    protected void notifyHotspotStateChanged(boolean isEnabled) {
        Log.d(TAG, "Hotspot state changed: " + (isEnabled ? "enabled" : "disabled"));
        this.isHotspotEnabled = isEnabled;
        for (NetworkStateListener listener : listeners) {
            try {
                listener.onHotspotStateChanged(isEnabled);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying listener", e);
            }
        }
    }

    /**
     * Notify all listeners that WiFi credentials have been received
     *
     * @param ssid      The SSID of the network
     * @param password  The password for the network
     * @param authToken Optional authentication token
     */
    protected void notifyWifiCredentialsReceived(String ssid, String password, String authToken) {
        Log.d(TAG, "WiFi credentials received for SSID: " + ssid);
        for (NetworkStateListener listener : listeners) {
            try {
                listener.onWifiCredentialsReceived(ssid, password, authToken);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying listener", e);
            }
        }
    }

    @Override
    public boolean isConnectedToWifi() {
        ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) {
            Log.w(TAG, "ConnectivityManager is null");
            return false;
        }

        Network activeNetwork = connectivityManager.getActiveNetwork();
        if (activeNetwork == null) {
            Log.d(TAG, "No active network");
            return false;
        }

        NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
        if (capabilities == null) {
            Log.d(TAG, "No network capabilities");
            return false;
        }

        boolean hasWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        Log.d(TAG, "WiFi transport available: " + hasWifi);
        return hasWifi;
    }

    @Override
    public String getCurrentWifiSsid() {
        WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) {
            Log.w(TAG, "WifiManager is null");
            return "";
        }

        if (!wifiManager.isWifiEnabled()) {
            Log.d(TAG, "WiFi is disabled");
            return "";
        }

        android.net.wifi.WifiInfo wifiInfo = wifiManager.getConnectionInfo();
        if (wifiInfo == null) {
            Log.d(TAG, "WifiInfo is null");
            return "";
        }

        String ssid = wifiInfo.getSSID();
        if (ssid == null) {
            Log.d(TAG, "SSID is null");
            return "";
        }

        // Remove quotes if present
        if (ssid.startsWith("\"") && ssid.endsWith("\"")) {
            ssid = ssid.substring(1, ssid.length() - 1);
        }

        Log.d(TAG, "Current WiFi SSID: " + ssid);
        return ssid;
    }

    @Override
    public void initialize() {
        Log.d(TAG, "Initializing BaseNetworkManager");
        // Base implementation - subclasses should override if needed
    }

    @Override
    public List<String> getConfiguredWifiNetworks() {
        WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) {
            Log.w(TAG, "WifiManager is null");
            return new ArrayList<>();
        }

        List<android.net.wifi.WifiConfiguration> configurations = wifiManager.getConfiguredNetworks();
        List<String> networkNames = new ArrayList<>();

        if (configurations != null) {
            for (android.net.wifi.WifiConfiguration config : configurations) {
                if (config.SSID != null) {
                    String ssid = config.SSID;
                    if (ssid.startsWith("\"") && ssid.endsWith("\"")) {
                        ssid = ssid.substring(1, ssid.length() - 1);
                    }
                    networkNames.add(ssid);
                }
            }
        }

        Log.d(TAG, "Configured networks: " + networkNames.size());
        return networkNames;
    }

    // K900-specific constants
    private static final String K900_BROADCAST_ACTION = "com.xy.xsetting.action";
    private static final String K900_SYSTEM_UI_PACKAGE = "com.android.systemui";

    @Override
    public List<String> scanWifiNetworks() {
        final List<String> networks = new ArrayList<>();
        
        try {
            // Ensure WiFi is enabled before scanning
            if (!ensureWifiEnabled()) {
                Log.e(TAG, "Cannot scan for WiFi networks - WiFi could not be enabled");
                return networks;
            }
            
            // Get WiFi manager for scanning
            WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wifiManager == null) {
                Log.e(TAG, "WiFi manager is null");
                return networks;
            }
            
            // Standard approach for WiFi scanning
            try {
                // Try to start a scan with regular Android APIs
                final AtomicBoolean scanComplete = new AtomicBoolean(false);
                final CountDownLatch scanLatch = new CountDownLatch(1);
                
                // Create a receiver for scan results
                BroadcastReceiver wifiScanReceiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(intent.getAction())) {
                            boolean success = intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false);
                            Log.d(TAG, "Scan completed, success=" + success);
                            scanComplete.set(true);
                            scanLatch.countDown();
                        }
                    }
                };
                
                // Register the receiver
                IntentFilter intentFilter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
                context.registerReceiver(wifiScanReceiver, intentFilter);
                
                // Start the scan
                boolean scanStarted = wifiManager.startScan();
                Log.d(TAG, "WiFi scan started, success=" + scanStarted);
                
                if (!scanStarted) {
                    Log.e(TAG, "Failed to start WiFi scan");
                    
                    // Try to get the results anyway, maybe there's a recent scan
                    try {
                        List<android.net.wifi.ScanResult> scanResults = wifiManager.getScanResults();
                        if (scanResults != null && !scanResults.isEmpty()) {
                            for (android.net.wifi.ScanResult result : scanResults) {
                                String ssid = result.SSID;
                                if (ssid != null && !ssid.isEmpty() && !networks.contains(ssid)) {
                                    networks.add(ssid);
                                    Log.d(TAG, "Found network from previous scan: " + ssid);
                                }
                            }
                        }
                    } catch (SecurityException se) {
                        Log.e(TAG, "No permission to access previous scan results", se);
                    } catch (Exception e) {
                        Log.e(TAG, "Error getting previous scan results", e);
                    }
                    
                    // Unregister the receiver
                    try {
                        context.unregisterReceiver(wifiScanReceiver);
                    } catch (Exception e) {
                        Log.e(TAG, "Error unregistering scan receiver", e);
                    }
                    
                    return networks;
                }
                
                // Wait for the scan to complete, but with a timeout
                try {
                    boolean completed = scanLatch.await(15, java.util.concurrent.TimeUnit.SECONDS);
                    Log.d(TAG, "Scan await completed=" + completed + ", scanComplete=" + scanComplete.get());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    Log.e(TAG, "Interrupted waiting for scan results", e);
                }
                
                // Get the scan results
                try {
                    List<android.net.wifi.ScanResult> scanResults = wifiManager.getScanResults();
                    if (scanResults != null) {
                        for (android.net.wifi.ScanResult result : scanResults) {
                            String ssid = result.SSID;
                            if (ssid != null && !ssid.isEmpty() && !networks.contains(ssid)) {
                                networks.add(ssid);
                                Log.d(TAG, "Found network: " + ssid);
                            }
                        }
                    }
                } catch (SecurityException se) {
                    Log.e(TAG, "No permission to access scan results", se);
                } catch (Exception e) {
                    Log.e(TAG, "Error getting scan results", e);
                }
                
                // Unregister the receiver
                try {
                    context.unregisterReceiver(wifiScanReceiver);
                } catch (Exception e) {
                    Log.e(TAG, "Error unregistering scan receiver", e);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error scanning for WiFi networks", e);
            }
            
            // Add the current network if not already in the list
            String currentSsid = getCurrentWifiSsid();
            if (!currentSsid.isEmpty() && !networks.contains(currentSsid)) {
                networks.add(currentSsid);
                Log.d(TAG, "Added current network to scan results: " + currentSsid);
            }
            
            Log.d(TAG, "Found " + networks.size() + " networks with scan");
            return networks;
        } catch (Exception e) {
            Log.e(TAG, "Error scanning for WiFi networks", e);
            return networks;
        }
    }

    @Override
    public void scanWifiNetworks(IWifiScanCallback callback) {
        Log.d(TAG, "📡 ========================================");
        Log.d(TAG, "📡 BASE STREAMING WIFI SCAN STARTED");
        Log.d(TAG, "📡 ========================================");
        
        final List<String> allFoundNetworks = new ArrayList<>();
        
        try {
            // Ensure WiFi is enabled before scanning
            if (!ensureWifiEnabled()) {
                Log.e(TAG, "Cannot scan for WiFi networks - WiFi could not be enabled");
                callback.onScanError("WiFi could not be enabled");
                return;
            }
            
            // Get WiFi manager for scanning
            WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
            if (wifiManager == null) {
                Log.e(TAG, "WiFi manager is null");
                callback.onScanError("WiFi manager unavailable");
                return;
            }
            
            // Standard Android WiFi scanning with streaming
            try {
                final AtomicBoolean scanCompleted = new AtomicBoolean(false);
                final CountDownLatch scanLatch = new CountDownLatch(1);
                
                // Create a receiver for scan results
                BroadcastReceiver wifiScanReceiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(intent.getAction())) {
                            if (scanCompleted.compareAndSet(false, true)) {
                                boolean success = intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false);
                                Log.d(TAG, "Base streaming scan completed, success=" + success);
                                
                                try {
                                    List<ScanResult> scanResults = wifiManager.getScanResults();
                                    if (scanResults != null) {
                                        List<String> newNetworks = new ArrayList<>();
                                        for (ScanResult result : scanResults) {
                                            String ssid = result.SSID;
                                            if (ssid != null && !ssid.isEmpty() && !allFoundNetworks.contains(ssid)) {
                                                allFoundNetworks.add(ssid);
                                                newNetworks.add(ssid);
                                                Log.d(TAG, "Found network: " + ssid);
                                            }
                                        }
                                        
                                        // Stream all networks found in this scan
                                        if (!newNetworks.isEmpty()) {
                                            Log.d(TAG, "📡 Streaming " + newNetworks.size() + " new networks to callback");
                                            callback.onNetworksFound(newNetworks);
                                        }
                                    }
                                } catch (SecurityException se) {
                                    Log.e(TAG, "No permission to access scan results", se);
                                } catch (Exception e) {
                                    Log.e(TAG, "Error processing scan results", e);
                                }
                                
                                scanLatch.countDown();
                            }
                        }
                    }
                };
                
                // Register the receiver
                IntentFilter intentFilter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
                context.registerReceiver(wifiScanReceiver, intentFilter);
                
                // Start the scan
                boolean scanStarted = wifiManager.startScan();
                Log.d(TAG, "Base WiFi scan started, success=" + scanStarted);
                
                if (!scanStarted) {
                    Log.e(TAG, "Failed to start WiFi scan");
                    
                    // Try to get previous scan results
                    try {
                        List<ScanResult> scanResults = wifiManager.getScanResults();
                        if (scanResults != null && !scanResults.isEmpty()) {
                            List<String> networks = new ArrayList<>();
                            for (ScanResult result : scanResults) {
                                String ssid = result.SSID;
                                if (ssid != null && !ssid.isEmpty()) {
                                    networks.add(ssid);
                                    Log.d(TAG, "Found network from previous scan: " + ssid);
                                }
                            }
                            
                            // Stream results from previous scan
                            if (!networks.isEmpty()) {
                                callback.onNetworksFound(networks);
                                allFoundNetworks.addAll(networks);
                            }
                        }
                    } catch (SecurityException se) {
                        Log.e(TAG, "No permission to access previous scan results", se);
                    } catch (Exception e) {
                        Log.e(TAG, "Error getting previous scan results", e);
                    }
                    
                    // Unregister the receiver
                    try {
                        context.unregisterReceiver(wifiScanReceiver);
                    } catch (Exception e) {
                        Log.e(TAG, "Error unregistering scan receiver", e);
                    }
                    
                    callback.onScanComplete(allFoundNetworks.size());
                    return;
                }
                
                // Wait for the scan to complete
                try {
                    boolean completed = scanLatch.await(15, TimeUnit.SECONDS);
                    Log.d(TAG, "Base scan await completed=" + completed + ", scanComplete=" + scanCompleted.get());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    Log.e(TAG, "Interrupted waiting for scan results", e);
                }
                
                // Unregister the receiver
                try {
                    context.unregisterReceiver(wifiScanReceiver);
                } catch (Exception e) {
                    Log.e(TAG, "Error unregistering scan receiver", e);
                }
                
                // Add the current network if not already in the list
                String currentSsid = getCurrentWifiSsid();
                if (!currentSsid.isEmpty() && !allFoundNetworks.contains(currentSsid)) {
                    allFoundNetworks.add(currentSsid);
                    List<String> currentNetwork = new ArrayList<>();
                    currentNetwork.add(currentSsid);
                    callback.onNetworksFound(currentNetwork);
                    Log.d(TAG, "Added current network to scan results: " + currentSsid);
                }
                
                callback.onScanComplete(allFoundNetworks.size());
                
            } catch (Exception e) {
                Log.e(TAG, "Error in base streaming WiFi scan", e);
                callback.onScanError("Scan failed: " + e.getMessage());
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error in base streaming WiFi scan", e);
            callback.onScanError("Scan failed: " + e.getMessage());
        }
        
        Log.d(TAG, "📡 Base streaming scan completed with " + allFoundNetworks.size() + " total networks");
    }

    /**
     * Ensures WiFi is enabled, trying multiple methods if necessary.
     * This method is reusable by subclasses to avoid code duplication.
     * 
     * @return true if WiFi is enabled or was successfully enabled, false otherwise
     */
    protected boolean ensureWifiEnabled() {
        WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) {
            Log.e(TAG, "WiFi manager is null");
            return false;
        }

        // Check if WiFi is already enabled
        if (wifiManager.isWifiEnabled()) {
            Log.d(TAG, "WiFi is already enabled");
            return true;
        }

        Log.d(TAG, "WiFi is disabled, attempting to enable it");
        
        try {
            // Try to enable WiFi using standard method
            wifiManager.setWifiEnabled(true);

            // Wait briefly for WiFi to initialize
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            // Check if WiFi is now enabled
            if (wifiManager.isWifiEnabled()) {
                Log.d(TAG, "WiFi enabled successfully using standard method");
                return true;
            }

            // If still not enabled, try broadcast method
            //Log.d(TAG, "Standard WiFi enable failed, trying broadcast method");
            //sendEnableWifiBroadcast();

            // Wait for broadcast to take effect
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            // Final check
            boolean isEnabled = wifiManager.isWifiEnabled();
            if (isEnabled) {
                Log.d(TAG, "WiFi enabled successfully using broadcast method");
            } else {
                Log.e(TAG, "Failed to enable WiFi using all available methods");
            }
            return isEnabled;

        } catch (SecurityException se) {
            // Handle permission issues
            //Log.e(TAG, "No permission to enable WiFi, trying broadcast method", se);
            //sendEnableWifiBroadcast();

            // Wait for broadcast to take effect
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            // Check if broadcast method worked
            boolean isEnabled = wifiManager.isWifiEnabled();
            if (isEnabled) {
                Log.d(TAG, "WiFi enabled via broadcast after permission error");
            } else {
                Log.e(TAG, "Failed to enable WiFi via broadcast after permission error");
            }
            return isEnabled;
            
        } catch (Exception e) {
            Log.e(TAG, "Error enabling WiFi", e);
            return false;
        }
    }

    protected boolean isK900Device() {
        return true;
//        try {
//            // Check if K900-specific system UI package exists
//            context.getPackageManager().getPackageInfo(K900_SYSTEM_UI_PACKAGE, 0);
//            Log.d(TAG, "K900 device detected");
//            return true;
//        } catch (Exception e) {
//            Log.d(TAG, "Not a K900 device");
//            return false;
//        }
    }

    @Override
    public String getLocalIpAddress() {
        return NetworkUtils.getBestIpAddress(context);
    }

    @Override
    public void shutdown() {
        Log.d(TAG, "Shutting down BaseNetworkManager");
        listeners.clear();
    }
} 