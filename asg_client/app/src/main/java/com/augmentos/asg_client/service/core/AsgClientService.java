package com.augmentos.asg_client.service.core;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.preference.PreferenceManager;

import com.augmentos.asg_client.SysControl;
import com.augmentos.asg_client.io.bluetooth.interfaces.BluetoothStateListener;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.io.media.interfaces.ServiceCallbackInterface;
import com.augmentos.asg_client.io.network.interfaces.NetworkStateListener;
import com.augmentos.asg_client.io.ota.utils.OtaConstants;
import com.augmentos.asg_client.io.streaming.events.StreamingEvent;
import com.augmentos.asg_client.io.streaming.interfaces.StreamingStatusCallback;
import com.augmentos.asg_client.service.core.ServiceContainer;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.core.processors.CommandProcessor;
import com.augmentos.asg_client.service.system.interfaces.IConfigurationManager;
import com.augmentos.asg_client.service.system.interfaces.IServiceLifecycle;
import com.augmentos.asg_client.service.system.interfaces.IStateManager;
import com.augmentos.asg_client.service.media.interfaces.IStreamingManager;
import com.augmentos.asg_client.service.system.managers.StateManager;
import com.augmentos.augmentos_core.AugmentosService;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Objects;

/**
 * Fully refactored AsgClientService that follows SOLID principles.
 * <p>
 * This service demonstrates:
 * - Single Responsibility Principle: Each manager handles one concern
 * - Open/Closed Principle: Easy to extend with new managers
 * - Liskov Substitution Principle: All managers implement interfaces
 * - Interface Segregation Principle: Focused interfaces for each concern
 * - Dependency Inversion Principle: Depends on abstractions, not concretions
 */
public class AsgClientService extends Service implements NetworkStateListener, BluetoothStateListener {

    // ---------------------------------------------
    // Constants //TODO: Extract all the Constants and Magic Number/Text to AsgConstants
    // ---------------------------------------------
    public static final String TAG = "AsgClientServiceV2";

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
    public static final String ACTION_OTA_HEARTBEAT = "com.augmentos.otaupdater.ACTION_HEARTBEAT";

    // Service health monitoring
    private static final String ACTION_HEARTBEAT = "com.augmentos.asg_client.ACTION_HEARTBEAT";
    private static final String ACTION_HEARTBEAT_ACK = "com.augmentos.asg_client.ACTION_HEARTBEAT_ACK";

    // ---------------------------------------------
    // Dependency Injection Container
    // ---------------------------------------------
    private ServiceContainer serviceContainer;

    // Interface references (Dependency Inversion Principle)
    private IServiceLifecycle lifecycleManager;
    private ICommunicationManager communicationManager;
    private IConfigurationManager configurationManager;
    private IStateManager stateManager;
    private IStreamingManager streamingManager;

    private CommandProcessor commandProcessor;

    // ---------------------------------------------
    // Service State
    // ---------------------------------------------
    private AugmentosService augmentosService = null;
    private boolean isAugmentosBound = false;

    // ---------------------------------------------
    // WiFi State Management
    // ---------------------------------------------
    private static final long WIFI_STATE_DEBOUNCE_MS = 1000;
    private Handler wifiDebounceHandler;
    private Runnable wifiDebounceRunnable;
    private boolean lastWifiState = false;
    private boolean pendingWifiState = false;

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

            // Update state manager
            if (stateManager instanceof StateManager) {
                ((StateManager) stateManager).setAugmentosServiceBound(true);
            }

            // Check WiFi connectivity
            if (stateManager.isConnectedToWifi()) {
                onWifiConnected();
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.d(TAG, "AugmentosService disconnected");
            isAugmentosBound = false;
            augmentosService = null;

            // Update state manager
            if (stateManager instanceof StateManager) {
                ((StateManager) stateManager).setAugmentosServiceBound(false);
            }
        }
    };

    // ---------------------------------------------
    // Lifecycle Methods
    // ---------------------------------------------
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "AsgClientServiceV2 onCreate");

        // Register for EventBus events
        EventBus.getDefault().register(this);

        // Initialize dependency injection container
        initializeServiceContainer();

        // Initialize WiFi debouncing
        initializeWifiDebouncing();

        // Register receivers
        registerReceivers();

        // Send version info
        sendVersionInfo();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);

        // Ensure foreground service on API 26+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            serviceContainer.getNotificationManager().createNotificationChannel();
            startForeground(serviceContainer.getNotificationManager().getDefaultNotificationId(),
                    serviceContainer.getNotificationManager().createForegroundNotification());
        }

        if (intent == null || intent.getAction() == null) {
            Log.e(TAG, "Received null intent or null action");
            return START_STICKY;
        }

        // Delegate action handling to lifecycle manager
        lifecycleManager.handleAction(intent.getAction(), intent.getExtras());
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "AsgClientServiceV2 onDestroy");

        // Unregister from EventBus
        if (EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().unregister(this);
        }

        // Clean up service container
        if (serviceContainer != null) {
            serviceContainer.cleanup();
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
        streamingManager.stopRtmpStreaming();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return new LocalBinder();
    }

    // ---------------------------------------------
    // Initialization Methods
    // ---------------------------------------------
    private void initializeServiceContainer() {
        serviceContainer = new ServiceContainer(this, this);

        // Get interface references
        lifecycleManager = serviceContainer.getLifecycleManager();
        communicationManager = serviceContainer.getCommunicationManager();
        configurationManager = serviceContainer.getConfigurationManager();
        stateManager = serviceContainer.getStateManager();
        streamingManager = serviceContainer.getStreamingManager();

        // Initialize container
        serviceContainer.initialize();

        commandProcessor = serviceContainer.getCommandProcessor();
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
                communicationManager.sendWifiStatusOverBle(pendingWifiState);
            }
        };
    }

    /**
     * Register all receivers
     */
    private void registerReceivers() {
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
                if (stateManager.isConnectedToWifi()) {
                    communicationManager.sendWifiStatusOverBle(true);
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

        // Delegate JSON parsing and processing to CommandProcessor
        commandProcessor.processCommand(data);
    }


    // ---------------------------------------------
    // Helper Methods
    // ---------------------------------------------

    private void onWifiConnected() {
        Log.d(TAG, "Connected to WiFi network");
        if (isAugmentosBound && augmentosService != null) {
            Log.d(TAG, "AugmentOS service is available, connecting to backend...");
        }
    }

    private void processMediaQueue() {
        if (serviceContainer.getServiceManager().getMediaQueueManager() != null &&
                !serviceContainer.getServiceManager().getMediaQueueManager().isQueueEmpty()) {
            Log.d(TAG, "WiFi connected - processing media upload queue");
            serviceContainer.getServiceManager().getMediaQueueManager().processQueue();
        }
    }

    public void sendVersionInfo() {
        Log.d(TAG, "📊 Sending version information");

        try {
            JSONObject versionInfo = new JSONObject();
            versionInfo.put("type", "version_info");
            versionInfo.put("timestamp", System.currentTimeMillis());
            String appVersion = "1.0.0";
            String buildNumber = "1";
            Log.d(TAG, "App version: " + appVersion + ", Build number: " + buildNumber);

            try {
                appVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                buildNumber = String.valueOf(getPackageManager().getPackageInfo(getPackageName(), 0).versionCode);
            } catch (Exception e) {
                Log.e(TAG, "Error getting app version", e);
            }
            versionInfo.put("app_version", appVersion);
            versionInfo.put("build_number", buildNumber);
            versionInfo.put("device_model", android.os.Build.MODEL);
            versionInfo.put("android_version", android.os.Build.VERSION.RELEASE);
            versionInfo.put("ota_version_url", OtaConstants.VERSION_JSON_URL);

            if (serviceContainer.getServiceManager().getBluetoothManager() != null &&
                    serviceContainer.getServiceManager().getBluetoothManager().isConnected()) {
                serviceContainer.getServiceManager().getBluetoothManager().sendData(versionInfo.toString().getBytes(StandardCharsets.UTF_8));
                Log.d(TAG, "✅ Sent version info to phone");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error creating version info", e);
        }
    }

    // REMOVED: saveCoreToken method - now handled directly by ConfigurationManager
    // AuthTokenCommandHandler calls configurationManager.saveCoreToken() directly

    // ---------------------------------------------
    // Public API Methods (Delegating to managers)
    // ---------------------------------------------
    // REMOVED: All delegation methods are now handled directly by managers
    // Components should access managers through the service container

    // ---------------------------------------------
    // Getters (Delegating to state manager)
    // ---------------------------------------------
    // REMOVED: All getter methods are now handled directly by managers
    // Components should access managers through the service container

    // ---------------------------------------------
    // Media Capture Listeners
    // ---------------------------------------------
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
                if (serviceContainer.getServiceManager().getBluetoothManager() != null) {
                    serviceContainer.getServiceManager().getBluetoothManager().sendData(data);
                }
            }

            @Override
            public boolean sendFileViaBluetooth(String filePath) {
                if (serviceContainer.getServiceManager().getBluetoothManager() != null) {
                    boolean started = serviceContainer.getServiceManager().getBluetoothManager().sendImageFile(filePath);
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
        heartbeatFilter.addAction(ACTION_OTA_HEARTBEAT);

        registerReceiver(heartbeatReceiver, heartbeatFilter);

        Log.d(TAG, "📡 Heartbeat receiver registered");
    }

    private void registerRestartReceiver() {
        restartReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (ACTION_RESTART_SERVICE.equals(action)) {
                    Log.d(TAG, "Received restart request from OTA updater");
                }
            }
        };

        IntentFilter restartFilter = new IntentFilter(ACTION_RESTART_SERVICE);
        registerReceiver(restartReceiver, restartFilter);
    }

    private void registerOtaProgressReceiver() {
        otaProgressReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();

                switch (Objects.requireNonNull(action)) {
                    case ACTION_DOWNLOAD_PROGRESS:
                        handleDownloadProgress(intent);
                        break;
                    case ACTION_INSTALLATION_PROGRESS:
                        handleInstallationProgress(intent);
                        break;
                }
            }
        };

        IntentFilter otaFilter = new IntentFilter();
        otaFilter.addAction(ACTION_DOWNLOAD_PROGRESS);
        otaFilter.addAction(ACTION_INSTALLATION_PROGRESS);
        registerReceiver(otaProgressReceiver, otaFilter);
    }

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
    public void onStreamingEvent(StreamingEvent event) {
        if (event instanceof StreamingEvent.Started) {
            Log.d(TAG, "RTMP streaming started successfully");
        } else if (event instanceof StreamingEvent.Stopped) {
            Log.d(TAG, "RTMP streaming stopped");
        } else if (event instanceof StreamingEvent.Error) {
            Log.e(TAG, "RTMP streaming error: " +
                    ((StreamingEvent.Error) event).getMessage());
        }
    }

    // ---------------------------------------------
    // Binder Class
    // ---------------------------------------------
    public class LocalBinder extends Binder {
        public AsgClientService getService() {
            return AsgClientService.this;
        }
    }

    // ---------------------------------------------
    // Utility Methods
    // ---------------------------------------------
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