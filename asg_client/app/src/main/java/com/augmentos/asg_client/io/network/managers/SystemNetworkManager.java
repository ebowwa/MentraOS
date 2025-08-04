package com.augmentos.asg_client.io.network.managers;

import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.WifiConfiguration;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSuggestion;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.augmentos.asg_client.io.network.core.BaseNetworkManager;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.io.network.utils.DebugNotificationManager;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;

/**
 * Implementation of INetworkManager for devices with system permissions.
 * Uses reflection to access system APIs for WiFi and hotspot control.
 */
public class SystemNetworkManager extends BaseNetworkManager {
    private static final String TAG = "SystemNetworkManager";
    
    // Constants for hotspot configuration
    private static final String HOTSPOT_SSID_PREFIX = "AugmentOS_";
    private static final String DEFAULT_HOTSPOT_PASSWORD = "augmentos1234";
    private static final int DEFAULT_WEBSERVER_PORT = 8080;
    
    // HTML content for the hotspot landing page
    private static final String HOTSPOT_LANDING_PAGE = "<html><head><title>AugmentOS WiFi Setup</title>" +
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" +
            "<style>body{font-family:sans-serif;margin:0;padding:20px;line-height:1.5;} " +
            "h1{color:#4285f4;} form{margin-top:20px;} " +
            "label{display:block;margin-bottom:5px;font-weight:bold;} " +
            "input[type=text],input[type=password]{width:100%;padding:8px;margin-bottom:15px;border:1px solid #ddd;border-radius:4px;} " +
            "button{background:#4285f4;color:white;border:none;padding:10px 15px;border-radius:4px;cursor:pointer;} " +
            "button:hover{background:#2a75f3;}</style></head>" +
            "<body><h1>AugmentOS WiFi Setup</h1>" +
            "<p>Please enter your WiFi network details to connect these glasses to the internet:</p>" +
            "<form id=\"wifiForm\" method=\"GET\" action=\"/\">" +
            "<label for=\"ssid\">WiFi Network Name:</label>" +
            "<input type=\"text\" id=\"ssid\" name=\"ssid\" required>" +
            "<label for=\"pass\">WiFi Password:</label>" +
            "<input type=\"password\" id=\"pass\" name=\"pass\" required>" +
            "<label for=\"token\">Auth Token (optional):</label>" +
            "<input type=\"text\" id=\"token\" name=\"token\">" +
            "<button type=\"submit\">Connect</button></form>" +
            "<script>document.getElementById('wifiForm').onsubmit = function() {" +
            "alert('Connecting to network... The glasses will reboot if successful.');" +
            "};</script></body></html>";
    
    private final WifiManager wifiManager;
    private final DebugNotificationManager notificationManager;
    private BroadcastReceiver wifiStateReceiver;
    private BroadcastReceiver wifiSuggestionReceiver;
    
    // Server state
    private boolean isServerRunning = false;
    private Thread serverThread;
    private int listenPort = DEFAULT_WEBSERVER_PORT;
    
    /**
     * Create a new SystemNetworkManager
     * @param context The application context
     * @param notificationManager The notification manager to use
     */
    public SystemNetworkManager(Context context, DebugNotificationManager notificationManager) {
        super(context);
        this.wifiManager = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        this.notificationManager = notificationManager;
        
        notificationManager.showDebugNotification(
                "System Network Manager", 
                "Using reflection-based network APIs with system permissions");
    }
    
    @Override
    public void initialize() {
        super.initialize();
        registerWifiStateReceiver();
        
        // Check if we're already connected to WiFi
        if (isConnectedToWifi()) {
            notificationManager.showWifiStateNotification(true);
        } else {
            notificationManager.showWifiStateNotification(false);
            // Auto-enable WiFi if not connected
            enableWifi();
        }
    }
    
    @Override
    public void enableWifi() {
        try {
            if (!wifiManager.isWifiEnabled()) {
                wifiManager.setWifiEnabled(true);
                notificationManager.showDebugNotification(
                        "WiFi Enabling", 
                        "Attempting to enable WiFi");
                
                // Wait for WiFi to be enabled
                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (wifiManager.isWifiEnabled()) {
                            notificationManager.showDebugNotification(
                                    "WiFi Enabled", 
                                    "WiFi has been successfully enabled");
                            
                            // Try to connect to known networks
                            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    List<String> configuredNetworks = getConfiguredWifiNetworks();
                                    if (!configuredNetworks.isEmpty()) {
                                        notificationManager.showDebugNotification(
                                                "Auto-Connect", 
                                                "Attempting to connect to " + configuredNetworks.size() + " known networks");
                                    }
                                }
                            }, 2000);
                        } else {
                            notificationManager.showDebugNotification(
                                    "WiFi Error", 
                                    "Failed to enable WiFi");
                        }
                    }
                }, 3000);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error enabling WiFi", e);
            notificationManager.showDebugNotification(
                    "WiFi Error", 
                    "Error enabling WiFi: " + e.getMessage());
        }
    }
    
    @Override
    public void disableWifi() {
        try {
            if (wifiManager.isWifiEnabled()) {
                wifiManager.setWifiEnabled(false);
                notificationManager.showDebugNotification(
                        "WiFi Disabling", 
                        "Disabling WiFi");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error disabling WiFi", e);
            notificationManager.showDebugNotification(
                    "WiFi Error", 
                    "Error disabling WiFi: " + e.getMessage());
        }
    }
    
    @Override
    public void startHotspot(String ssid, String password) {
        Log.d(TAG, "Starting system hotspot with SSID: " + ssid);
        
        try {
            boolean success = enableHotspotInternal(ssid, password);
            if (success) {
                notificationManager.showHotspotStateNotification(true);
                notifyHotspotStateChanged(true);
                startServer();
                Log.i(TAG, "System hotspot started successfully");
            } else {
                notificationManager.showDebugNotification(
                        "Hotspot Error", 
                        "Failed to start system hotspot");
                Log.e(TAG, "Failed to start system hotspot");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error starting system hotspot", e);
            notificationManager.showDebugNotification(
                    "Hotspot Error", 
                    "Error starting hotspot: " + e.getMessage());
        }
    }
    
    @Override
    public void stopHotspot() {
        Log.d(TAG, "Stopping system hotspot");
        
        try {
            boolean success = disableHotspotInternal();
            if (success) {
                notificationManager.showHotspotStateNotification(false);
                notifyHotspotStateChanged(false);
                stopServer();
                Log.i(TAG, "System hotspot stopped successfully");
            } else {
                notificationManager.showDebugNotification(
                        "Hotspot Error", 
                        "Failed to stop system hotspot");
                Log.e(TAG, "Failed to stop system hotspot");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error stopping system hotspot", e);
            notificationManager.showDebugNotification(
                    "Hotspot Error", 
                    "Error stopping hotspot: " + e.getMessage());
        }
    }
    
    @Override
    public void connectToWifi(String ssid, String password) {
        Log.d(TAG, "Connecting to WiFi network: " + ssid);
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                connectWifiModern(ssid, password);
            } else {
                connectWifiLegacy(ssid, password);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error connecting to WiFi", e);
            notificationManager.showDebugNotification(
                    "WiFi Error", 
                    "Error connecting to WiFi: " + e.getMessage());
        }
    }
    
    @SuppressLint("MissingPermission")
    private void connectWifiLegacy(String ssid, String password) {
        try {
            WifiConfiguration config = new WifiConfiguration();
            config.SSID = "\"" + ssid + "\"";
            config.preSharedKey = "\"" + password + "\"";
            config.allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK);
            
            int networkId = wifiManager.addNetwork(config);
            if (networkId != -1) {
                boolean success = wifiManager.enableNetwork(networkId, true);
                if (success) {
                    notificationManager.showDebugNotification(
                            "WiFi Connection", 
                            "Attempting to connect to: " + ssid);
                    
                    // Monitor connection status
                    new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (isConnectedToWifi()) {
                                notificationManager.showDebugNotification(
                                        "WiFi Connected", 
                                        "Successfully connected to: " + ssid);
                            } else {
                                notificationManager.showDebugNotification(
                                        "WiFi Failed", 
                                        "Failed to connect to: " + ssid);
                            }
                        }
                    }, 5000);
                } else {
                    notificationManager.showDebugNotification(
                            "WiFi Error", 
                            "Failed to enable network: " + ssid);
                }
            } else {
                notificationManager.showDebugNotification(
                        "WiFi Error", 
                        "Failed to add network: " + ssid);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in legacy WiFi connection", e);
            notificationManager.showDebugNotification(
                    "WiFi Error", 
                    "Legacy connection failed: " + e.getMessage());
        }
    }
    
    private void connectWifiModern(String ssid, String password) {
        try {
            WifiNetworkSuggestion suggestion = new WifiNetworkSuggestion.Builder()
                    .setSsid(ssid)
                    .setWpa2Passphrase(password)
                    .build();
            
            List<WifiNetworkSuggestion> suggestions = new ArrayList<>();
            suggestions.add(suggestion);
            
            int result = wifiManager.addNetworkSuggestions(suggestions);
            if (result == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) {
                notificationManager.showDebugNotification(
                        "WiFi Connection", 
                        "Network suggestion added for: " + ssid);
                
                // Monitor connection status
                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (isConnectedToWifi()) {
                            notificationManager.showDebugNotification(
                                    "WiFi Connected", 
                                    "Successfully connected to: " + ssid);
                        } else {
                            notificationManager.showDebugNotification(
                                    "WiFi Failed", 
                                    "Failed to connect to: " + ssid);
                        }
                    }
                }, 5000);
            } else {
                notificationManager.showDebugNotification(
                        "WiFi Error", 
                        "Failed to add network suggestion: " + ssid);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in modern WiFi connection", e);
            notificationManager.showDebugNotification(
                    "WiFi Error", 
                    "Modern connection failed: " + e.getMessage());
        }
    }
    
    private void registerSuggestionReceiver() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            wifiSuggestionReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (WifiManager.ACTION_WIFI_NETWORK_SUGGESTION_POST_CONNECTION.equals(intent.getAction())) {
                        Log.d(TAG, "WiFi network suggestion post-connection");
                    }
                }
            };
            
            IntentFilter filter = new IntentFilter(WifiManager.ACTION_WIFI_NETWORK_SUGGESTION_POST_CONNECTION);
            context.registerReceiver(wifiSuggestionReceiver, filter);
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
                            boolean isConnected = isConnectedToWifi();
                            notificationManager.showWifiStateNotification(isConnected);
                            notifyWifiStateChanged(isConnected);
                            break;
                        case WifiManager.WIFI_STATE_CHANGED_ACTION:
                            int wifiState = intent.getIntExtra(WifiManager.EXTRA_WIFI_STATE, WifiManager.WIFI_STATE_UNKNOWN);
                            Log.d(TAG, "WiFi state changed: " + wifiState);
                            break;
                    }
                }
            }
        };
        
        IntentFilter filter = new IntentFilter();
        filter.addAction(WifiManager.NETWORK_STATE_CHANGED_ACTION);
        filter.addAction(WifiManager.WIFI_STATE_CHANGED_ACTION);
        context.registerReceiver(wifiStateReceiver, filter);
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
        
        if (wifiSuggestionReceiver != null) {
            try {
                context.unregisterReceiver(wifiSuggestionReceiver);
                wifiSuggestionReceiver = null;
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Suggestion receiver already unregistered", e);
            }
        }
    }
    
    @SuppressWarnings({"JavaReflectionMemberAccess", "unchecked"})
    private boolean enableHotspotInternal(String ssid, String password) {
        try {
            // Use reflection to access system hotspot APIs
            Class<?> wifiManagerClass = wifiManager.getClass();
            Method[] methods = wifiManagerClass.getDeclaredMethods();
            
            for (Method method : methods) {
                if (method.getName().contains("setWifiApEnabled") || 
                    method.getName().contains("startTethering")) {
                    method.setAccessible(true);
                    
                    if (method.getName().contains("setWifiApEnabled")) {
                        // Legacy method
                        Object result = method.invoke(wifiManager, null, true);
                        return result != null && (Boolean) result;
                    } else if (method.getName().contains("startTethering")) {
                        // Modern method
                        method.invoke(wifiManager, true);
                        return true;
                    }
                }
            }
            
            Log.w(TAG, "No suitable hotspot method found");
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error enabling hotspot via reflection", e);
            return false;
        }
    }
    
    @SuppressWarnings({"JavaReflectionMemberAccess", "unchecked"})
    private boolean disableHotspotInternal() {
        try {
            // Use reflection to access system hotspot APIs
            Class<?> wifiManagerClass = wifiManager.getClass();
            Method[] methods = wifiManagerClass.getDeclaredMethods();
            
            for (Method method : methods) {
                if (method.getName().contains("setWifiApEnabled") || 
                    method.getName().contains("stopTethering")) {
                    method.setAccessible(true);
                    
                    if (method.getName().contains("setWifiApEnabled")) {
                        // Legacy method
                        Object result = method.invoke(wifiManager, null, false);
                        return result != null && (Boolean) result;
                    } else if (method.getName().contains("stopTethering")) {
                        // Modern method
                        method.invoke(wifiManager, false);
                        return true;
                    }
                }
            }
            
            Log.w(TAG, "No suitable hotspot method found");
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error disabling hotspot via reflection", e);
            return false;
        }
    }
    
    private void startServer() {
        if (!isServerRunning) {
            isServerRunning = true;
            serverThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    startServer(listenPort);
                }
            });
            serverThread.start();
        }
    }
    
    private void startServer(int port) {
        try (ServerSocket serverSocket = new ServerSocket()) {
            serverSocket.setReuseAddress(true);
            serverSocket.bind(new InetSocketAddress(port));
            
            Log.i(TAG, "Hotspot server started on port " + port);
            
            while (isServerRunning) {
                try {
                    Socket client = serverSocket.accept();
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            handleClient(client);
                        }
                    }).start();
                } catch (IOException e) {
                    if (isServerRunning) {
                        Log.e(TAG, "Error accepting client", e);
                    }
                }
            }
        } catch (IOException e) {
            Log.e(TAG, "Error starting server", e);
        }
    }
    
    private void stopServer() {
        isServerRunning = false;
        if (serverThread != null) {
            serverThread.interrupt();
            serverThread = null;
        }
    }
    
    private void runServer(int port) {
        try (ServerSocket serverSocket = new ServerSocket(port)) {
            Log.i(TAG, "Server listening on port " + port);
            
            while (isServerRunning) {
                try {
                    Socket client = serverSocket.accept();
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            handleClient(client);
                        }
                    }).start();
                } catch (IOException e) {
                    if (isServerRunning) {
                        Log.e(TAG, "Error accepting client", e);
                    }
                }
            }
        } catch (IOException e) {
            Log.e(TAG, "Error in server", e);
        }
    }
    
    private void handleClient(Socket client) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream()));
             OutputStream output = client.getOutputStream()) {
            
            String requestLine = reader.readLine();
            if (requestLine != null && requestLine.startsWith("GET")) {
                // Parse query parameters
                String[] parts = requestLine.split(" ");
                if (parts.length > 1) {
                    String path = parts[1];
                    if (path.contains("?")) {
                        String query = path.substring(path.indexOf("?") + 1);
                        String[] params = query.split("&");
                        
                        String ssid = null;
                        String password = null;
                        String token = null;
                        
                        for (String param : params) {
                            String[] keyValue = param.split("=");
                            if (keyValue.length == 2) {
                                switch (keyValue[0]) {
                                    case "ssid":
                                        ssid = keyValue[1];
                                        break;
                                    case "pass":
                                        password = keyValue[1];
                                        break;
                                    case "token":
                                        token = keyValue[1];
                                        break;
                                }
                            }
                        }
                        
                        if (ssid != null && password != null) {
                            // Connect to the specified network
                            final String finalSsid = ssid;
                            final String finalPassword = password;
                            final String finalToken = token;
                            new Handler(Looper.getMainLooper()).post(new Runnable() {
                                @Override
                                public void run() {
                                    connectToWifi(finalSsid, finalPassword);
                                    notifyWifiCredentialsReceived(finalSsid, finalPassword, finalToken);
                                }
                            });
                        }
                    }
                }
                
                // Send response
                String response = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: text/html\r\n" +
                        "Content-Length: " + HOTSPOT_LANDING_PAGE.length() + "\r\n" +
                        "\r\n" +
                        HOTSPOT_LANDING_PAGE;
                
                output.write(response.getBytes());
                output.flush();
            }
        } catch (IOException e) {
            Log.e(TAG, "Error handling client", e);
        } finally {
            try {
                client.close();
            } catch (IOException e) {
                Log.e(TAG, "Error closing client", e);
            }
        }
    }
    
    @SuppressLint("MissingPermission")
    @Override
    public List<String> getConfiguredWifiNetworks() {
        List<String> networks = new ArrayList<>();
        
        try {
            List<WifiConfiguration> configurations = wifiManager.getConfiguredNetworks();
            if (configurations != null) {
                for (WifiConfiguration config : configurations) {
                    if (config.SSID != null) {
                        String ssid = config.SSID;
                        if (ssid.startsWith("\"") && ssid.endsWith("\"")) {
                            ssid = ssid.substring(1, ssid.length() - 1);
                        }
                        networks.add(ssid);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting configured networks", e);
        }
        
        return networks;
    }
    
    @Override
    public void shutdown() {
        Log.d(TAG, "Shutting down SystemNetworkManager");
        stopServer();
        unregisterWifiStateReceiver();
        super.shutdown();
    }
} 