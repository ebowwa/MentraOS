package com.augmentos.asg_client.service;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;

import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.augmentos.asg_client.SysControl;
import com.augmentos.asg_client.bluetooth.BluetoothStateListener;
import com.augmentos.asg_client.camera.MediaCaptureService;
import com.augmentos.asg_client.camera.ServiceCallbackInterface;
import com.augmentos.asg_client.events.BatteryStatusEvent;
import com.augmentos.asg_client.network.NetworkStateListener;
import com.augmentos.asg_client.streaming.RtmpStreamingService;
import com.augmentos.augmentos_core.AugmentosService;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * Clean, refactored version of AsgClientService that follows SOLID principles.
 * This service manages the ASG client functionality with better separation of concerns.
 */
public class AsgClientServiceClean extends Service implements NetworkStateListener, BluetoothStateListener {

    // ---------------------------------------------
    // Constants
    // ---------------------------------------------
    public static final String TAG = "AsgClientServiceClean";

    // Service actions
    public static final String ACTION_START_CORE = "ACTION_START_CORE";
    public static final String ACTION_STOP_CORE = "ACTION_STOP_CORE";
    public static final String ACTION_START_FOREGROUND_SERVICE = "MY_ACTION_START_FOREGROUND_SERVICE";
    public static final String ACTION_STOP_FOREGROUND_SERVICE = "MY_ACTION_STOP_FOREGROUND_SERVICE";
    public static final String ACTION_RESTART_SERVICE = "com.augmentos.asg_client.ACTION_RESTART_SERVICE";
    public static final String ACTION_RESTART_COMPLETE = "com.augmentos.asg_client.ACTION_RESTART_COMPLETE";
    public static final String ACTION_RESTART_CAMERA = "com.augmentos.asg_client.ACTION_RESTART_CAMERA";
    public static final String ACTION_START_OTA_UPDATER = "ACTION_START_OTA_UPDATER";
    
    // OTA Update progress actions
    public static final String ACTION_DOWNLOAD_PROGRESS = "com.augmentos.otaupdater.ACTION_DOWNLOAD_PROGRESS";
    public static final String ACTION_INSTALLATION_PROGRESS = "com.augmentos.otaupdater.ACTION_INSTALLATION_PROGRESS";

    // Service health monitoring
    private static final String ACTION_HEARTBEAT = "com.augmentos.asg_client.ACTION_HEARTBEAT";
    private static final String ACTION_HEARTBEAT_ACK = "com.augmentos.asg_client.ACTION_HEARTBEAT_ACK";

    // ---------------------------------------------
    // Core Components
    // ---------------------------------------------
    private final IBinder binder = new LocalBinder();
    private AsgClientServiceManager serviceManager;
    private CommandProcessor commandProcessor;
    private AsgNotificationManager asgNotificationManager;

    // ---------------------------------------------
    // Service State
    // ---------------------------------------------
    private AugmentosService augmentosService = null;
    private boolean isAugmentosBound = false;
    private boolean isInitialized = false;

    // ---------------------------------------------
    // WiFi State Management
    // ---------------------------------------------
    private static final long WIFI_STATE_DEBOUNCE_MS = 1000;
    private Handler wifiDebounceHandler;
    private Runnable wifiDebounceRunnable;
    private boolean lastWifiState = false;
    private boolean pendingWifiState = false;

    // ---------------------------------------------
    // Battery Status Tracking
    // ---------------------------------------------
    private int glassesBatteryLevel = -1;
    private boolean glassesCharging = false;
    private int lastBroadcastedBatteryLevel = -1;
    private boolean lastBroadcastedCharging = false;
    

    


    // ---------------------------------------------
    // Broadcast Receivers
    // ---------------------------------------------
    private BroadcastReceiver heartbeatReceiver;
    private BroadcastReceiver restartReceiver;
    private BroadcastReceiver otaProgressReceiver;

    // ---------------------------------------------
    // ServiceConnection for AugmentosService
    // ---------------------------------------------
    private final ServiceConnection augmentosConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.d(TAG, "AugmentosService connected");
            AugmentosService.LocalBinder binder = (AugmentosService.LocalBinder) service;
            augmentosService = binder.getService();
            isAugmentosBound = true;

            // Check WiFi connectivity
            if (serviceManager != null && serviceManager.getNetworkManager() != null && 
                serviceManager.getNetworkManager().isConnectedToWifi()) {
                onWifiConnected();
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "AugmentosService disconnected");
            isAugmentosBound = false;
            augmentosService = null;
        }
    };

    // ---------------------------------------------
    // Lifecycle Methods
    // ---------------------------------------------
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "AsgClientServiceClean onCreate");

        // Initialize managers
        initializeManagers();

        // Initialize WiFi debouncing
        initializeWifiDebouncing();

        // Register receivers
        registerReceivers();

        // Start OTA service after delay
        scheduleOtaServiceStart();

        // Send version info
        sendVersionInfo();

        // Clean up system packages
        cleanupSystemPackages();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);

        // Ensure foreground service on API 26+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            asgNotificationManager.createNotificationChannel();
            startForeground(asgNotificationManager.getDefaultNotificationId(),
                          asgNotificationManager.createForegroundNotification());
        }

        if (intent == null || intent.getAction() == null) {
            Log.e(TAG, "Received null intent or null action");
            return START_STICKY;
        }

        handleServiceAction(intent.getAction(), intent.getExtras());
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "AsgClientServiceClean onDestroy");

        // Clean up managers
        if (serviceManager != null) {
            serviceManager.cleanup();
        }

        // Unregister receivers
        unregisterReceivers();

        // Unbind from AugmentosService
        if (isAugmentosBound) {
            unbindService(augmentosConnection);
            isAugmentosBound = false;
        }

        // Clean up WiFi debouncing
        if (wifiDebounceHandler != null && wifiDebounceRunnable != null) {
            wifiDebounceHandler.removeCallbacks(wifiDebounceRunnable);
        }

        // Stop RTMP streaming
        stopRtmpStreaming();

        // Unregister from EventBus
        if (EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().unregister(this);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    // ---------------------------------------------
    // Initialization Methods
    // ---------------------------------------------
    private void initializeManagers() {
        serviceManager = new AsgClientServiceManager(this, this);
        commandProcessor = new CommandProcessor(this, this, serviceManager);
        asgNotificationManager = new AsgNotificationManager(this);
        
        serviceManager.initialize();
        isInitialized = true;
    }

    /**
     * Initialize WiFi debouncing
     */
    private void initializeWifiDebouncing() {
        wifiDebounceHandler = new Handler(Looper.getMainLooper());
        wifiDebounceRunnable = () -> {
            if (pendingWifiState != lastWifiState) {
                Log.d(TAG, "🔄 WiFi debounce timeout - sending final state: " + 
                      (pendingWifiState ? "CONNECTED" : "DISCONNECTED"));
                lastWifiState = pendingWifiState;
                sendWifiStatusOverBle(pendingWifiState);
            }
        };
    }

    /**
     * Register all receivers
     */
    private void registerReceivers() {
        // Register all receivers
        registerHeartbeatReceiver();
        registerRestartReceiver();
        registerOtaProgressReceiver();
    }

    /**
     * Unregister all receivers
     */
    private void unregisterReceivers() {
        try {
            if (heartbeatReceiver != null) {
                unregisterReceiver(heartbeatReceiver);
            }
            if (restartReceiver != null) {
                unregisterReceiver(restartReceiver);
            }
            if (otaProgressReceiver != null) {
                unregisterReceiver(otaProgressReceiver);
            }
        } catch (IllegalArgumentException e) {
            Log.w(TAG, "Receiver was not registered");
        }
    }

    private void scheduleOtaServiceStart() {
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Log.d(TAG, "Starting internal OTA service after delay");
            Intent otaIntent = new Intent(this, com.augmentos.asg_client.ota.OtaService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(otaIntent);
            } else {
                startService(otaIntent);
            }
        }, 5000);
    }

    private void cleanupSystemPackages() {
        SysControl.uninstallPackage(getApplicationContext(), "com.lhs.btserver");
        SysControl.uninstallPackageViaAdb(getApplicationContext(), "com.lhs.btserver");
    }

    // ---------------------------------------------
    // Service Action Handling
    // ---------------------------------------------
    private void handleServiceAction(String action, Bundle extras) {
        switch (action) {
            case ACTION_START_CORE:
            case ACTION_START_FOREGROUND_SERVICE:
                handleStartService();
                break;
            case ACTION_RESTART_SERVICE:
                handleRestartService();
                break;
            case ACTION_STOP_CORE:
            case ACTION_STOP_FOREGROUND_SERVICE:
                handleStopService();
                break;
            case ACTION_RESTART_CAMERA:
                handleRestartCamera();
                break;
            default:
                Log.d(TAG, "Unknown action: " + action);
                break;
        }
    }

    private void handleStartService() {
        Log.d(TAG, "Starting foreground service");
        asgNotificationManager.createNotificationChannel();
        startForeground(asgNotificationManager.getDefaultNotificationId(),
                       asgNotificationManager.createForegroundNotification());

        // Start AugmentosService
        Intent augmentosIntent = new Intent(this, AugmentosService.class);
        augmentosIntent.setAction(AugmentosService.ACTION_START_CORE);
        startService(augmentosIntent);
    }

    private void handleRestartService() {
        Log.d(TAG, "Restart request received");
        asgNotificationManager.createNotificationChannel();
        startForeground(asgNotificationManager.getDefaultNotificationId(),
                       asgNotificationManager.createForegroundNotification());

        if (!isInitialized) {
            initializeManagers();
        }

        // Send restart complete broadcast
        Intent completeIntent = new Intent(ACTION_RESTART_COMPLETE);
        completeIntent.setPackage("com.augmentos.otaupdater");
        sendBroadcast(completeIntent);

        // Send heartbeat acknowledgment
        Intent ackIntent = new Intent(ACTION_HEARTBEAT_ACK);
        ackIntent.setPackage("com.augmentos.otaupdater");
        sendBroadcast(ackIntent);
    }

    private void handleStopService() {
        Log.d(TAG, "Stopping foreground service");
        stopForeground(true);
        stopSelf();

        if (isAugmentosBound) {
            unbindService(augmentosConnection);
            isAugmentosBound = false;
        }

        stopService(new Intent(this, AugmentosService.class));
    }

    private void handleRestartCamera() {
        Log.d(TAG, "Camera restart request received");
        try {
            SysControl.injectAdbCommand(getApplicationContext(), 
                "pm grant " + getPackageName() + " android.permission.CAMERA");
            SysControl.injectAdbCommand(getApplicationContext(), 
                "kill $(pidof cameraserver)");
            SysControl.injectAdbCommand(getApplicationContext(), 
                "kill $(pidof mediaserver)");
        } catch (Exception e) {
            Log.e(TAG, "Error resetting camera service", e);
        }
    }

    // ---------------------------------------------
    // NetworkStateListener Implementation
    // ---------------------------------------------
    @Override
    public void onWifiStateChanged(boolean isConnected) {
        Log.d(TAG, "🔄 WiFi state changed: " + (isConnected ? "CONNECTED" : "DISCONNECTED"));

        pendingWifiState = isConnected;

        if (wifiDebounceHandler != null && wifiDebounceRunnable != null) {
            wifiDebounceHandler.removeCallbacks(wifiDebounceRunnable);
            wifiDebounceHandler.postDelayed(wifiDebounceRunnable, WIFI_STATE_DEBOUNCE_MS);
        }

        if (isConnected) {
            onWifiConnected();
            processMediaQueue();
        }
    }

    @Override
    public void onHotspotStateChanged(boolean isEnabled) {
        Log.d(TAG, "Hotspot state changed: " + (isEnabled ? "ENABLED" : "DISABLED"));
    }

    @Override
    public void onWifiCredentialsReceived(String ssid, String password, String authToken) {
        Log.d(TAG, "WiFi credentials received for network: " + ssid);
    }

    // ---------------------------------------------
    // BluetoothStateListener Implementation
    // ---------------------------------------------
    @Override
    public void onConnectionStateChanged(boolean connected) {
        Log.d(TAG, "Bluetooth connection state changed: " + (connected ? "CONNECTED" : "DISCONNECTED"));

        if (connected) {
            // Send WiFi status after delay
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (serviceManager != null && serviceManager.getNetworkManager() != null) {
                    boolean wifiConnected = serviceManager.getNetworkManager().isConnectedToWifi();
                    sendWifiStatusOverBle(wifiConnected);
                }
            }, 3000);

            sendVersionInfo();
        }
    }

    @Override
    public void onDataReceived(byte[] data) {
        if (data == null || data.length == 0) {
            Log.w(TAG, "Received empty data packet from Bluetooth");
            return;
        }

        Log.d(TAG, "Received " + data.length + " bytes from Bluetooth");

        // Check for ##...## protocol format
        if (isK900ProtocolMessage(data)) {
            handleK900ProtocolMessage(data);
            return;
        }

        // Check for JSON message
        if (data.length > 0 && data[0] == '{') {
            try {
                String jsonStr = new String(data, StandardCharsets.UTF_8);
                JSONObject jsonObject = new JSONObject(jsonStr);
                commandProcessor.processJsonCommand(jsonObject);
            } catch (Exception e) {
                Log.e(TAG, "Error parsing JSON data", e);
            }
        }
    }

    // ---------------------------------------------
    // Helper Methods
    // ---------------------------------------------
    private boolean isK900ProtocolMessage(byte[] data) {
        return data.length > 4 && data[0] == 0x23 && data[1] == 0x23;
    }

    private void handleK900ProtocolMessage(byte[] data) {
        // Look for end marker ($$)
        int endMarkerPos = -1;
        for (int i = 4; i < data.length - 1; i++) {
            if (data[i] == 0x24 && data[i+1] == 0x24) {
                endMarkerPos = i;
                break;
            }
        }

        if (endMarkerPos > 0) {
            int payloadStart = 5;
            int payloadLength = endMarkerPos - payloadStart;

            if (payloadLength > 0 && data[payloadStart] == '{') {
                try {
                    String jsonStr = new String(data, payloadStart, payloadLength, "UTF-8");
                    JSONObject jsonObject = new JSONObject(jsonStr);
                    commandProcessor.processJsonCommand(jsonObject);
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing JSON from K900 protocol", e);
                }
            }
        }
    }

    private void onWifiConnected() {
        Log.d(TAG, "Connected to WiFi network");
        if (isAugmentosBound && augmentosService != null) {
            Log.d(TAG, "AugmentOS service is available, connecting to backend...");
        }
    }

    private void processMediaQueue() {
        if (serviceManager != null && serviceManager.getMediaQueueManager() != null && 
            !serviceManager.getMediaQueueManager().isQueueEmpty()) {
            Log.d(TAG, "WiFi connected - processing media upload queue");
            serviceManager.getMediaQueueManager().processQueue();
        }
    }

    private void stopRtmpStreaming() {
        try {
            EventBus.getDefault().post(new com.augmentos.asg_client.streaming.StreamingCommand.Stop());
            RtmpStreamingService.stopStreaming(this);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping RTMP streaming", e);
        }
    }

    // ---------------------------------------------
    // Public API Methods
    // ---------------------------------------------
    public void sendWifiStatusOverBle(boolean isConnected) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            try {
                JSONObject wifiStatus = new JSONObject();
                wifiStatus.put("type", "wifi_status");
                wifiStatus.put("connected", isConnected);

                if (isConnected && serviceManager.getNetworkManager() != null) {
                    String ssid = serviceManager.getNetworkManager().getCurrentWifiSsid();
                    String localIp = serviceManager.getNetworkManager().getLocalIpAddress();
                    
                    wifiStatus.put("ssid", ssid != null ? ssid : "unknown");
                    wifiStatus.put("local_ip", localIp != null ? localIp : "");
                } else {
                    wifiStatus.put("ssid", "");
                    wifiStatus.put("local_ip", "");
                }

                String jsonString = wifiStatus.toString();
                serviceManager.getBluetoothManager().sendData(jsonString.getBytes());
                Log.d(TAG, "Sent WiFi status via BLE");
            } catch (JSONException e) {
                Log.e(TAG, "Error creating WiFi status JSON", e);
            }
        }
    }

    public void updateBatteryStatus(int level, boolean charging, long timestamp) {
        glassesBatteryLevel = level;
        glassesCharging = charging;
        
        Log.d(TAG, "🔋 Received battery status: " + level + "% " + 
              (charging ? "(charging)" : "(not charging)") + " at " + timestamp);
        
        broadcastBatteryStatusToOtaUpdater(level, charging, timestamp);
    }

    public void broadcastBatteryStatusToOtaUpdater(int level, boolean charging, long timestamp) {
        if (level == lastBroadcastedBatteryLevel && charging == lastBroadcastedCharging) {
            return;
        }
        
        try {
            BatteryStatusEvent batteryEvent = new BatteryStatusEvent(level, charging, timestamp);
            EventBus.getDefault().post(batteryEvent);
            
            lastBroadcastedBatteryLevel = level;
            lastBroadcastedCharging = charging;
        } catch (Exception e) {
            Log.e(TAG, "Error broadcasting battery status", e);
        }
    }

    public void sendVersionInfo() {
        // Implementation for sending version info
        Log.d(TAG, "Sending version info");
    }

    public void saveCoreToken(String coreToken) {
        // Implementation for saving core token
        Log.d(TAG, "Saving core token");
    }

    public void sendKeepAliveAck(String streamId, String ackId) {
        // Implementation for sending keep-alive ACK
        Log.d(TAG, "Sending keep-alive ACK for stream: " + streamId);
    }

    public void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
        // Implementation for sending media success response
        Log.d(TAG, "Sending media success response for: " + requestId);
    }

    public void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
        // Implementation for sending media error response
        Log.d(TAG, "Sending media error response for: " + requestId);
    }

    public void parseK900Command(JSONObject json) {
        if (commandProcessor != null) {
            commandProcessor.parseK900Command(json);
        } else {
            Log.e(TAG, "CommandProcessor is null, cannot process K900 command");
        }
    }

    public MediaCaptureService.MediaCaptureListener getMediaCaptureListener() {
        return new MediaCaptureService.MediaCaptureListener() {
            @Override
            public void onPhotoCapturing(String requestId) {
                Log.d(TAG, "Photo capturing: " + requestId);
            }

            @Override
            public void onPhotoCaptured(String requestId, String filePath) {
                Log.d(TAG, "Photo captured: " + requestId + " at " + filePath);
            }

            @Override
            public void onPhotoUploading(String requestId) {
                Log.d(TAG, "Photo uploading: " + requestId);
            }

            @Override
            public void onPhotoUploaded(String requestId, String url) {
                Log.d(TAG, "Photo uploaded: " + requestId + " to " + url);
            }

            @Override
            public void onVideoRecordingStarted(String requestId, String filePath) {
                Log.d(TAG, "Video recording started: " + requestId);
            }

            @Override
            public void onVideoRecordingStopped(String requestId, String filePath) {
                Log.d(TAG, "Video recording stopped: " + requestId);
            }

            @Override
            public void onVideoUploading(String requestId) {
                Log.d(TAG, "Video uploading: " + requestId);
            }

            @Override
            public void onVideoUploaded(String requestId, String url) {
                Log.d(TAG, "Video uploaded: " + requestId + " to " + url);
            }

            @Override
            public void onMediaError(String requestId, String error, int mediaType) {
                Log.e(TAG, "Media error: " + requestId + " - " + error);
            }
        };
    }

    public ServiceCallbackInterface getServiceCallback() {
        return new ServiceCallbackInterface() {
            @Override
            public void sendThroughBluetooth(byte[] data) {
                if (serviceManager != null && serviceManager.getBluetoothManager() != null) {
                    serviceManager.getBluetoothManager().sendData(data);
                }
            }
            
            @Override
            public boolean sendFileViaBluetooth(String filePath) {
                if (serviceManager != null && serviceManager.getBluetoothManager() != null) {
                    boolean started = serviceManager.getBluetoothManager().sendImageFile(filePath);
                    if (started) {
                        Log.d(TAG, "BLE file transfer started for: " + filePath);
                    } else {
                        Log.e(TAG, "Failed to start BLE file transfer for: " + filePath);
                    }
                    return started;
                }
                return false;
            }
        };
    }

    // ---------------------------------------------
    // Broadcast Receiver Registration Methods
    // ---------------------------------------------

     /**
     * Register the heartbeat receiver for service health monitoring
     */
    private void registerHeartbeatReceiver() {
        heartbeatReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (ACTION_HEARTBEAT.equals(action) || 
                    "com.augmentos.otaupdater.ACTION_HEARTBEAT".equals(action)) {
                    
                    Log.d(TAG, "💓 Heartbeat received - sending acknowledgment");
                    
                    Intent ackIntent = new Intent(ACTION_HEARTBEAT_ACK);
                    ackIntent.setPackage("com.augmentos.otaupdater");
                    sendBroadcast(ackIntent);
                    
                    Log.d(TAG, "✅ Heartbeat acknowledgment sent");
                }
            }
        };

        IntentFilter heartbeatFilter = new IntentFilter();
        heartbeatFilter.addAction(ACTION_HEARTBEAT);
        heartbeatFilter.addAction("com.augmentos.otaupdater.ACTION_HEARTBEAT");
        registerReceiver(heartbeatReceiver, heartbeatFilter);
        
        Log.d(TAG, "📡 Heartbeat receiver registered with actions: " + ACTION_HEARTBEAT + 
              ", com.augmentos.otaupdater.ACTION_HEARTBEAT");
    }

    /**
     * Register the restart receiver for service restart handling
     */
    private void registerRestartReceiver() {
        restartReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (ACTION_RESTART_SERVICE.equals(action)) {
                    Log.d(TAG, "Received restart request from OTA updater");
                    // Handle restart logic
                }
            }
        };

        IntentFilter restartFilter = new IntentFilter(ACTION_RESTART_SERVICE);
        registerReceiver(restartReceiver, restartFilter);
    }

    /**
     * Register the OTA progress receiver for handling OTA updates
     */
    private void registerOtaProgressReceiver() {
        otaProgressReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if ("com.augmentos.otaupdater.ACTION_DOWNLOAD_PROGRESS".equals(action)) {
                    handleDownloadProgress(intent);
                } else if ("com.augmentos.otaupdater.ACTION_INSTALLATION_PROGRESS".equals(action)) {
                    handleInstallationProgress(intent);
                }
            }
        };

        IntentFilter otaFilter = new IntentFilter();
        otaFilter.addAction("com.augmentos.otaupdater.ACTION_DOWNLOAD_PROGRESS");
        otaFilter.addAction("com.augmentos.otaupdater.ACTION_INSTALLATION_PROGRESS");
        registerReceiver(otaProgressReceiver, otaFilter);
    }

    /**
     * Handle download progress updates from OTA updater
     */
    private void handleDownloadProgress(Intent intent) {
        String status = intent.getStringExtra("status");
        int progress = intent.getIntExtra("progress", 0);
        long bytesDownloaded = intent.getLongExtra("bytes_downloaded", 0);
        long totalBytes = intent.getLongExtra("total_bytes", 0);
        String errorMessage = intent.getStringExtra("error_message");
        long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());
        
        Log.d(TAG, "📥 Handling download progress: " + status + " - " + progress + "%");
        
        if (commandProcessor != null) {
            commandProcessor.sendDownloadProgressOverBle(status, progress, bytesDownloaded, totalBytes, errorMessage, timestamp);
        }
    }

    /**
     * Handle installation progress updates from OTA updater
     */
    private void handleInstallationProgress(Intent intent) {
        String status = intent.getStringExtra("status");
        String apkPath = intent.getStringExtra("apk_path");
        String errorMessage = intent.getStringExtra("error_message");
        long timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis());
        
        Log.d(TAG, "🔧 Handling installation progress: " + status + " - " + apkPath);
        
        if (commandProcessor != null) {
            commandProcessor.sendInstallationProgressOverBle(status, apkPath, errorMessage, timestamp);
        }
    }

    // ---------------------------------------------
    // EventBus Subscriptions
    // ---------------------------------------------
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onStreamingEvent(com.augmentos.asg_client.streaming.StreamingEvent event) {
        if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.Started) {
            Log.d(TAG, "RTMP streaming started successfully");
        } else if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.Stopped) {
            Log.d(TAG, "RTMP streaming stopped");
        } else if (event instanceof com.augmentos.asg_client.streaming.StreamingEvent.Error) {
            Log.e(TAG, "RTMP streaming error: " + 
                  ((com.augmentos.asg_client.streaming.StreamingEvent.Error) event).getMessage());
        }
    }

    // ---------------------------------------------
    // Binder Class
    // ---------------------------------------------
    public class LocalBinder extends Binder {
        public AsgClientServiceClean getService() {
            return AsgClientServiceClean.this;
        }
    }

    // ---------------------------------------------
    // Public Getters
    // ---------------------------------------------
    public AsgClientServiceManager getServiceManager() {
        return serviceManager;
    }

    public boolean isConnectedToWifi() {
        return serviceManager != null && serviceManager.getNetworkManager() != null && 
               serviceManager.getNetworkManager().isConnectedToWifi();
    }

    public boolean isBluetoothConnected() {
        return serviceManager != null && serviceManager.getBluetoothManager() != null && 
               serviceManager.getBluetoothManager().isConnected();
    }

    public int getGlassesBatteryLevel() {
        return glassesBatteryLevel;
    }

    public boolean isGlassesCharging() {
        return glassesCharging;
    }

    public String getGlassesBatteryStatusString() {
        if (glassesBatteryLevel == -1) {
            return "Unknown";
        }
        return glassesBatteryLevel + "% " + (glassesCharging ? "(charging)" : "(not charging)");
    }

    // ---------------------------------------------
    // Additional Public API Methods
    // ---------------------------------------------

    /**
     * Method for activities to start Bluetooth advertising
     */
    public void startBluetoothAdvertising() {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null) {
            serviceManager.getBluetoothManager().startAdvertising();
        }
    }

    /**
     * Method for activities to stop Bluetooth advertising
     */
    public void stopBluetoothAdvertising() {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null) {
            serviceManager.getBluetoothManager().stopAdvertising();
        }
    }

    /**
     * Method for activities to manually disconnect from a Bluetooth device
     */
    public void disconnectBluetooth() {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null) {
            serviceManager.getBluetoothManager().disconnect();
        }
    }

    /**
     * Method for activities to send data over Bluetooth
     * @return true if data was sent successfully, false otherwise
     */
    public boolean sendBluetoothData(byte[] data) {
        if (serviceManager != null && serviceManager.getBluetoothManager() != null && 
            serviceManager.getBluetoothManager().isConnected()) {
            return serviceManager.getBluetoothManager().sendData(data);
        }
        return false;
    }

    /**
     * Get the AugmentosService instance
     */
    public AugmentosService getAugmentosService() {
        return augmentosService;
    }

    /**
     * Check if AugmentosService is bound
     */
    public boolean isAugmentosServiceBound() {
        return isAugmentosBound;
    }

    /**
     * Example method to use AugmentosService
     */
    public void doSomethingWithAugmentos() {
        if (isAugmentosBound && augmentosService != null) {
            Log.d(TAG, "Called a method on the bound AugmentosService!");
        } else {
            Log.w(TAG, "AugmentosService is not bound yet.");
        }
    }

    /**
     * Testing method that manually starts the WiFi setup process
     */
    public void testWifiSetup() {
        if (serviceManager != null && serviceManager.getNetworkManager() != null) {
            serviceManager.getNetworkManager().startHotspot(null, null);
        }
    }

    /**
     * Try to connect to a specific WiFi network
     */
    public void testConnectToWifi(String ssid, String password) {
        if (serviceManager != null && serviceManager.getNetworkManager() != null) {
            serviceManager.getNetworkManager().connectToWifi(ssid, password);
        }
    }

    // ---------------------------------------------
    // Private Helper Methods
    // ---------------------------------------------



    /**
     * Open WiFi settings
     */
    public static void openWifi(Context context, boolean bEnable) {
        try {
            if (bEnable) {
                SysControl.injectAdbCommand(context, "svc wifi enable");
            } else {
                SysControl.injectAdbCommand(context, "svc wifi disable");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error opening WiFi settings", e);
        }
    }
} 