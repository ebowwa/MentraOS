package com.augmentos.asg_client.io.network.managers;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import com.augmentos.asg_client.io.network.core.BaseNetworkManager;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.io.network.utils.DebugNotificationManager;
import com.augmentos.asg_client.SysControl;

import java.util.ArrayList;
import java.util.List;

/**
 * Implementation of INetworkManager for K900 devices.
 * Uses K900-specific broadcasts to control WiFi and hotspot functionality.
 */
public class K900NetworkManager extends BaseNetworkManager {
    private static final String TAG = "K900NetworkManager";
    
    // K900-specific constants
    private static final String K900_BROADCAST_ACTION = "com.xy.xsetting.action";
    private static final String K900_SYSTEM_UI_PACKAGE = "com.android.systemui";
    
    // Default hotspot configuration
    private static final String DEFAULT_HOTSPOT_SSID = "AugmentOS_";
    private static final String DEFAULT_HOTSPOT_PASSWORD = "augmentos1234";
    
    private final WifiManager wifiManager;
    private final DebugNotificationManager notificationManager;
    private BroadcastReceiver wifiStateReceiver;
    
    /**
     * Create a new K900NetworkManager
     * @param context The application context
     */
    public K900NetworkManager(Context context) {
        super(context);
        this.wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        this.notificationManager = new DebugNotificationManager(context);
        
        notificationManager.showDebugNotification(
                "K900 Network Manager", 
                "Using K900-specific network APIs");

        enableScan5GWifi(context, false);
    }
    
    @Override
    public void initialize() {
        Log.d(TAG, "🌐 =========================================");
        Log.d(TAG, "🌐 K900 NETWORK MANAGER INITIALIZE");
        Log.d(TAG, "🌐 =========================================");
        
        super.initialize();
        Log.d(TAG, "🌐 ✅ Base network manager initialized");
        
        registerWifiStateReceiver();
        Log.d(TAG, "🌐 ✅ WiFi state receiver registered");
        
        // Check if we're already connected to WiFi
        boolean wifiConnected = isConnectedToWifi();
        Log.d(TAG, "🌐 📡 Current WiFi connection status: " + wifiConnected);
        
        if (wifiConnected) {
            Log.d(TAG, "🌐 ✅ WiFi already connected, showing notification");
            notificationManager.showWifiStateNotification(true);
        } else {
            Log.d(TAG, "🌐 ❌ WiFi not connected, showing notification and enabling WiFi");
            notificationManager.showWifiStateNotification(false);
            // Auto-enable WiFi if not connected
            enableWifi();
        }
        
        Log.d(TAG, "🌐 ✅ K900 Network Manager initialization complete");
    }
    
    @Override
    public void enableWifi() {
        Log.d(TAG, "📶 =========================================");
        Log.d(TAG, "📶 ENABLE WIFI");
        Log.d(TAG, "📶 =========================================");
        
        // Use K900 API to enable WiFi
        try {
            Log.d(TAG, "📶 🔍 Checking current WiFi state...");
            boolean currentlyEnabled = wifiManager.isWifiEnabled();
            Log.d(TAG, "📶 📡 WiFi currently enabled: " + currentlyEnabled);
            
            if (!currentlyEnabled) {
                Log.d(TAG, "📶 🔧 Enabling WiFi via WifiManager...");
                boolean enabled = wifiManager.setWifiEnabled(true);
                Log.d(TAG, "📶 " + (enabled ? "✅ WiFi enable command sent successfully" : "❌ Failed to send WiFi enable command"));
                
                notificationManager.showDebugNotification(
                        "WiFi Enabling", 
                        "Attempting to enable WiFi");
            } else {
                Log.d(TAG, "📶 ✅ WiFi already enabled, no action needed");
            }
        } catch (Exception e) {
            Log.e(TAG, "📶 💥 Error enabling WiFi", e);
        }
    }
    
    @Override
    public void disableWifi() {
        Log.d(TAG, "📶 =========================================");
        Log.d(TAG, "📶 DISABLE WIFI");
        Log.d(TAG, "📶 =========================================");
        
        // Use K900 API to disable WiFi
        try {
            Log.d(TAG, "📶 🔍 Checking current WiFi state...");
            boolean currentlyEnabled = wifiManager.isWifiEnabled();
            Log.d(TAG, "📶 📡 WiFi currently enabled: " + currentlyEnabled);
            
            if (currentlyEnabled) {
                Log.d(TAG, "📶 🔧 Disabling WiFi via WifiManager...");
                boolean disabled = wifiManager.setWifiEnabled(false);
                Log.d(TAG, "📶 " + (disabled ? "✅ WiFi disable command sent successfully" : "❌ Failed to send WiFi disable command"));
                
                notificationManager.showDebugNotification(
                        "WiFi Disabling", 
                        "Disabling WiFi");
            } else {
                Log.d(TAG, "📶 ✅ WiFi already disabled, no action needed");
            }
        } catch (Exception e) {
            Log.e(TAG, "📶 💥 Error disabling WiFi", e);
        }
    }

    public static void enableScan5GWifi(Context context, boolean bEnable)
    {
        Intent nn = new Intent("com.xy.xsetting.action");
        nn.putExtra("command", "enable_scan_5g_wifi");
        nn.putExtra("enable", bEnable);
        context.sendBroadcast(nn);
    }
    
    @Override
    public void startHotspot(String ssid, String password) {
        Log.d(TAG, "🔥 =========================================");
        Log.d(TAG, "🔥 START K900 HOTSPOT");
        Log.d(TAG, "🔥 =========================================");
        Log.d(TAG, "🔥 SSID: " + (ssid != null ? ssid : DEFAULT_HOTSPOT_SSID));
        Log.d(TAG, "🔥 Password: " + (password != null ? "***" : "***"));
        
        try {
            // Use K900-specific broadcast to start hotspot
            Log.d(TAG, "🔥 📡 Creating K900 hotspot start broadcast...");
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.putExtra("command", "start_hotspot");
            intent.putExtra("ssid", ssid != null ? ssid : DEFAULT_HOTSPOT_SSID);
            intent.putExtra("password", password != null ? password : DEFAULT_HOTSPOT_PASSWORD);
            
            Log.d(TAG, "🔥 📤 Sending K900 hotspot start broadcast...");
            context.sendBroadcast(intent);
            
            Log.d(TAG, "🔥 ✅ K900 hotspot start broadcast sent successfully");
            notificationManager.showHotspotStateNotification(true);
            notifyHotspotStateChanged(true);
            
            Log.i(TAG, "🔥 ✅ K900 hotspot start command sent");
        } catch (Exception e) {
            Log.e(TAG, "🔥 💥 Error starting K900 hotspot", e);
            notificationManager.showDebugNotification(
                    "Hotspot Error", 
                    "Failed to start K900 hotspot: " + e.getMessage());
        }
    }
    
    @Override
    public void stopHotspot() {
        Log.d(TAG, "🔥 =========================================");
        Log.d(TAG, "🔥 STOP K900 HOTSPOT");
        Log.d(TAG, "🔥 =========================================");
        
        try {
            // Use K900-specific broadcast to stop hotspot
            Log.d(TAG, "🔥 📡 Creating K900 hotspot stop broadcast...");
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.putExtra("command", "stop_hotspot");
            
            Log.d(TAG, "🔥 📤 Sending K900 hotspot stop broadcast...");
            context.sendBroadcast(intent);
            
            Log.d(TAG, "🔥 ✅ K900 hotspot stop broadcast sent successfully");
            notificationManager.showHotspotStateNotification(false);
            notifyHotspotStateChanged(false);
            
            Log.i(TAG, "🔥 ✅ K900 hotspot stop command sent");
        } catch (Exception e) {
            Log.e(TAG, "🔥 💥 Error stopping K900 hotspot", e);
            notificationManager.showDebugNotification(
                    "Hotspot Error", 
                    "Failed to stop K900 hotspot: " + e.getMessage());
        }
    }
    
    @Override
    public void connectToWifi(String ssid, String password) {
        Log.d(TAG, "📶 =========================================");
        Log.d(TAG, "📶 CONNECT TO WIFI");
        Log.d(TAG, "📶 =========================================");
        Log.d(TAG, "📶 SSID: " + ssid);
        Log.d(TAG, "📶 Password: " + (password != null ? "***" : "null"));
        
        try {
            // Use SysControl for K900 WiFi connection
            Log.d(TAG, "📶 📡 Connecting to WiFi via SysControl...");
            SysControl.connectToWifi(context, ssid, password);
            
            Log.d(TAG, "📶 ✅ WiFi connect command sent successfully");
            notificationManager.showDebugNotification(
                    "WiFi Connection", 
                    "Attempting to connect to: " + ssid);
            
            Log.i(TAG, "📶 ✅ WiFi connect command sent for SSID: " + ssid);
        } catch (Exception e) {
            Log.e(TAG, "📶 💥 Error connecting to WiFi", e);
            notificationManager.showDebugNotification(
                    "WiFi Error", 
                    "Failed to connect to WiFi: " + e.getMessage());
        }
    }
    
    private void promptConnectToWifi(String ssid, String password) {
        // K900-specific method to prompt user for WiFi connection
        try {
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.putExtra("command", "prompt_wifi_connection");
            intent.putExtra("ssid", ssid);
            intent.putExtra("password", password);
            context.sendBroadcast(intent);
            
            Log.i(TAG, "K900 WiFi connection prompt sent");
        } catch (Exception e) {
            Log.e(TAG, "Error prompting WiFi connection", e);
        }
    }
    
    private void registerWifiStateReceiver() {
        wifiStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (action != null) {
                    switch (action) {
                        case WifiManager.NETWORK_STATE_CHANGED_ACTION:
                            // For K900, delay the WiFi state check to let connection stabilize
                            // This prevents rapid CONNECTED/DISCONNECTED flapping
                            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                                boolean isConnected = isConnectedToWifi();
                                notificationManager.showWifiStateNotification(isConnected);
                                notifyWifiStateChanged(isConnected);
                            }, 500); // Wait 500ms for connection to stabilize
                            break;
                        case K900_BROADCAST_ACTION:
                            handleK900Broadcast(intent);
                            break;
                    }
                }
            }
        };
        
        IntentFilter filter = new IntentFilter();
        filter.addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION);
        filter.addAction(K900_BROADCAST_ACTION);
        context.registerReceiver(wifiStateReceiver, filter);
    }
    
    private void handleK900Broadcast(Intent intent) {
        String command = intent.getStringExtra("command");
        if (command != null) {
            switch (command) {
                case "wifi_connected":
                    boolean isConnected = intent.getBooleanExtra("connected", false);
                    notificationManager.showWifiStateNotification(isConnected);
                    notifyWifiStateChanged(isConnected);
                    break;
                case "hotspot_state":
                    boolean isEnabled = intent.getBooleanExtra("enabled", false);
                    notificationManager.showHotspotStateNotification(isEnabled);
                    notifyHotspotStateChanged(isEnabled);
                    break;
            }
        }
    }
    
    private void unregisterWifiStateReceiver() {
        if (wifiStateReceiver != null) {
            try {
                context.unregisterReceiver(wifiStateReceiver);
                wifiStateReceiver = null;
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Receiver already unregistered", e);
            }
        }
    }
    
    @Override
    public List<String> getConfiguredWifiNetworks() {
        Log.d(TAG, "Getting configured WiFi networks from K900");
        List<String> networks = new ArrayList<>();
        
        // Use K900-specific broadcast to get configured networks
        try {
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.putExtra("command", "get_configured_networks");
            context.sendBroadcast(intent);
            
            // For now, return empty list as K900 response handling is complex
            // In a real implementation, you would register a receiver for the response
            Log.d(TAG, "K900 configured networks request sent");
        } catch (Exception e) {
            Log.e(TAG, "Error getting configured networks from K900", e);
        }
        
        return networks;
    }
    
    @Override
    public List<String> scanWifiNetworks() {
        final List<String> networks = new ArrayList<>();
        
        try {
            // Use the base class method to ensure WiFi is enabled
            sendEnableWifiBroadcast();
            if (!ensureWifiEnabled()) {
                Log.e(TAG, "Cannot scan for WiFi networks - WiFi could not be enabled");
                return networks;
            }
            
            // Check if we have WiFi Manager available
            if (wifiManager == null) {
                Log.e(TAG, "WiFi manager is null");
                return networks;
            }
            
            // First, try the K900-specific approach
            Log.d(TAG, "K900 device, trying K900-specific scan");
            
            try {
                final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
                final List<String> k900Networks = new ArrayList<>();
                
                // Register a receiver to get the scan results
                BroadcastReceiver receiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (intent != null && intent.hasExtra("scan_list")) {
                            String[] wifiList = intent.getStringArrayExtra("scan_list");
                            if (wifiList != null) {
                                for (String ssid : wifiList) {
                                    if (ssid != null && !ssid.isEmpty() && !k900Networks.contains(ssid)) {
                                        k900Networks.add(ssid);
                                        Log.d(TAG, "Found K900 scan network: " + ssid);
                                    }
                                }
                            }
                        }
                        latch.countDown();
                    }
                };
                
                // Register the receiver
                IntentFilter filter = new IntentFilter("com.xy.xsetting.scan_list");
                context.registerReceiver(receiver, filter);
                
                // Send the request to start scan
                Intent intent = new Intent(K900_BROADCAST_ACTION);
                intent.setPackage(K900_SYSTEM_UI_PACKAGE);
                intent.putExtra("cmd", "scan_wifi");
                context.sendBroadcast(intent);
                
                // Wait for the scan results with a timeout
                try {
                    if (latch.await(10, java.util.concurrent.TimeUnit.SECONDS)) {
                        // Successfully got the networks
                        networks.addAll(k900Networks);
                    } else {
                        Log.w(TAG, "Timeout waiting for K900 scan results");
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    Log.e(TAG, "Interrupted waiting for K900 scan results", e);
                }
                
                // Unregister the receiver
                try {
                    context.unregisterReceiver(receiver);
                } catch (Exception e) {
                    Log.e(TAG, "Error unregistering receiver", e);
                }
                
                // If K900 scan worked, return the results
                if (!networks.isEmpty()) {
                    Log.d(TAG, "K900-specific scan successful, found " + networks.size() + " networks");
                    return networks;
                }
                
                // If K900 scan didn't work, fall through to standard scanning
                Log.d(TAG, "K900-specific scan returned no results, falling back to standard scan");
            } catch (Exception e) {
                Log.e(TAG, "Error in K900-specific scan, falling back to standard scan", e);
            }
            
            // Standard approach for WiFi scanning (fallback)
            try {
                // Try to start a scan with regular Android APIs
                final java.util.concurrent.atomic.AtomicBoolean scanComplete = new java.util.concurrent.atomic.AtomicBoolean(false);
                final java.util.concurrent.CountDownLatch scanLatch = new java.util.concurrent.CountDownLatch(1);
                
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

    private void sendEnableWifiBroadcast() {
        try {
            Intent intent = new Intent(K900_BROADCAST_ACTION);
            intent.setPackage(K900_SYSTEM_UI_PACKAGE);
            intent.putExtra("cmd", "setwifi");
            intent.putExtra("enable", true);
            context.sendBroadcast(intent);
            Log.d(TAG, "Sent K900 WiFi enable broadcast");
        } catch (Exception e) {
            Log.e(TAG, "Error sending K900 enable WiFi broadcast", e);
        }
    }
    
    @Override
    public void shutdown() {
        Log.d(TAG, "Shutting down K900NetworkManager");
        unregisterWifiStateReceiver();
        super.shutdown();
    }
} 