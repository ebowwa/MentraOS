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
import android.util.Log;

import com.augmentos.asg_client.NetworkUtils;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.io.network.interfaces.NetworkStateListener;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
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
        Log.d(TAG, "Scanning for WiFi networks...");
        List<String> networks = new ArrayList<>();

        if (isK900Device()) {
            // K900-specific scanning
            networks = scanWifiNetworksK900();
        } else {
            // Standard Android scanning
            networks = scanWifiNetworksStandard();
        }

        Log.d(TAG, "Found " + networks.size() + " networks");
        return networks;
    }

    private List<String> scanWifiNetworksK900() {
        List<String> networks = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean scanCompleted = new AtomicBoolean(false);

        BroadcastReceiver scanReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (scanCompleted.compareAndSet(false, true)) {
                    Log.d(TAG, "K900 WiFi scan completed");
                    latch.countDown();
                }
            }
        };

        BroadcastReceiver resultsReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                // Parse scan results from K900 broadcast
                String action = intent.getAction();
                if (action != null && action.contains("wifi_scan_results")) {
                    // Extract network names from K900 broadcast
                    // This is a simplified implementation
                    Log.d(TAG, "K900 WiFi scan results received");
                }
            }
        };

        try {
            // Register receivers
            IntentFilter scanFilter = new IntentFilter(K900_BROADCAST_ACTION);
            context.registerReceiver(scanReceiver, scanFilter);

            IntentFilter resultsFilter = new IntentFilter();
            resultsFilter.addAction("com.xy.xsetting.wifi_scan_results");
            context.registerReceiver(resultsReceiver, resultsFilter);

            // Send scan command to K900
            Intent scanIntent = new Intent(K900_BROADCAST_ACTION);
            scanIntent.putExtra("command", "wifi_scan");
            context.sendBroadcast(scanIntent);

            // Wait for scan to complete (with timeout)
            boolean completed = latch.await(10, java.util.concurrent.TimeUnit.SECONDS);
            if (!completed) {
                Log.w(TAG, "K900 WiFi scan timeout");
            }

        } catch (InterruptedException e) {
            Log.e(TAG, "K900 WiFi scan interrupted", e);
            Thread.currentThread().interrupt();
        } finally {
            try {
                context.unregisterReceiver(scanReceiver);
                context.unregisterReceiver(resultsReceiver);
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Receiver already unregistered", e);
            }
        }

        return networks;
    }

    private List<String> scanWifiNetworksStandard() {
        List<String> networks = new ArrayList<>();
        WifiManager wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);

        if (wifiManager == null) {
            Log.w(TAG, "WifiManager is null");
            return networks;
        }

        if (!wifiManager.isWifiEnabled()) {
            Log.d(TAG, "WiFi is disabled, cannot scan");
            return networks;
        }

        // For standard Android, we would typically use WifiManager.startScan()
        // and register a BroadcastReceiver for SCAN_RESULTS_AVAILABLE_ACTION
        // However, this requires location permissions and is more complex
        // For now, we'll return an empty list and let subclasses implement
        Log.d(TAG, "Standard WiFi scanning not implemented in base class");

        return networks;
    }

    protected boolean isK900Device() {
        try {
            // Check if K900-specific system UI package exists
            context.getPackageManager().getPackageInfo(K900_SYSTEM_UI_PACKAGE, 0);
            Log.d(TAG, "K900 device detected");
            return true;
        } catch (Exception e) {
            Log.d(TAG, "Not a K900 device");
            return false;
        }
    }

    private void sendEnableWifiBroadcast() {
        try {
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.putExtra("command", "enable_wifi");
            context.sendBroadcast(intent);
            Log.d(TAG, "Sent K900 enable WiFi broadcast");
        } catch (Exception e) {
            Log.e(TAG, "Error sending K900 enable WiFi broadcast", e);
        }
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