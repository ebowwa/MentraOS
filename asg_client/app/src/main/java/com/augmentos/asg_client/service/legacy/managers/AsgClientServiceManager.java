package com.augmentos.asg_client.service.legacy.managers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.bluetooth.core.BluetoothManagerFactory;
import com.augmentos.asg_client.io.bluetooth.interfaces.IBluetoothManager;
import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.io.media.managers.MediaUploadQueueManager;
import com.augmentos.asg_client.io.network.core.NetworkManagerFactory;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.io.server.core.DefaultServerFactory;
import com.augmentos.asg_client.io.server.managers.AsgServerManager;
import com.augmentos.asg_client.io.server.services.AsgCameraServer;
import com.augmentos.asg_client.logging.Logger;
import com.augmentos.asg_client.service.communication.interfaces.ICommunicationManager;
import com.augmentos.asg_client.service.core.AsgClientService;
import com.augmentos.asg_client.settings.AsgSettings;

/**
 * Manages the initialization and lifecycle of AsgClientService components.
 * This class follows the Single Responsibility Principle by handling only
 * component initialization and management.
 */
public class AsgClientServiceManager {
    private static final String TAG = "AsgClientServiceManager";

    private final Context context;
    private final AsgClientService service;
    private final ICommunicationManager communicationManager;

    // Core components
    private AsgSettings asgSettings;
    private INetworkManager networkManager;
    private IBluetoothManager bluetoothManager;
    private MediaUploadQueueManager mediaQueueManager;
    private MediaCaptureService mediaCaptureService;
    private AsgServerManager serverManager;
    private AsgCameraServer cameraServer;

    // State tracking
    private boolean isInitialized = false;
    private boolean isWebServerEnabled = true;
    private boolean isK900Device = false;

    private final FileManager fileManager;

    public AsgClientServiceManager(Context context, AsgClientService service, ICommunicationManager communicationManager, FileManager fileManager) {
        Log.d(TAG, "🔧 AsgClientServiceManager constructor called");
        Log.d(TAG, "📋 Parameters - Context: " + (context != null ? "valid" : "null") +
                ", Service: " + (service != null ? "valid" : "null") +
                ", CommunicationManager: " + (communicationManager != null ? "valid" : "null") +
                ", FileManager: " + (fileManager != null ? "valid" : "null"));

        this.context = context;
        this.service = service;
        this.fileManager = fileManager;
        this.communicationManager = communicationManager;

        Log.d(TAG, "✅ AsgClientServiceManager instance created successfully");
    }

    /**
     * Initialize all service components
     */
    public void initialize() {
        Log.d(TAG, "🚀 initialize() called - Current state: " + (isInitialized ? "already initialized" : "not initialized"));

        if (isInitialized) {
            Log.d(TAG, "⏭️ Service manager already initialized - skipping");
            return;
        }

        Log.i(TAG, "🔧 Starting AsgClientService components initialization");

        try {
            // Initialize settings first
            Log.d(TAG, "📝 Step 1: Initializing settings");
            initializeSettings();

            // Initialize core managers
            Log.d(TAG, "🌐 Step 2: Initializing network manager");
            initializeNetworkManager();

            Log.d(TAG, "📶 Step 3: Initializing bluetooth manager");
            initializeBluetoothManager();

            Log.d(TAG, "📁 Step 4: Initializing media queue manager");
            initializeMediaQueueManager();

            Log.d(TAG, "📸 Step 5: Initializing media capture service");
            initializeMediaCaptureService();

            Log.d(TAG, "🌐 Step 6: Initializing camera web server");
            initializeCameraWebServer();

            isInitialized = true;
            Log.i(TAG, "✅ All service components initialized successfully");
            Log.d(TAG, "📊 Final state - Initialized: " + isInitialized +
                    ", WebServerEnabled: " + isWebServerEnabled +
                    ", K900Device: " + isK900Device);

        } catch (Exception e) {
            Log.e(TAG, "💥 Error initializing service components", e);
            Log.w(TAG, "🧹 Performing cleanup due to initialization failure");
            cleanup();
        }

        Log.d(TAG, "🏁 initialize() completed");
    }

    /**
     * Clean up all service components
     */
    public void cleanup() {
        Log.d(TAG, "🧹 cleanup() called - Current state: " + (isInitialized ? "initialized" : "not initialized"));
        Log.i(TAG, "🔄 Starting service components cleanup");

        // Stop camera web server
        if (cameraServer != null) {
            Log.d(TAG, "🛑 Stopping camera web server");
            if (serverManager != null) {
                Log.d(TAG, "📡 Using server manager to stop camera server");
                serverManager.stopServer("camera");
            } else {
                Log.d(TAG, "🛑 Directly stopping camera server");
                cameraServer.stopServer();
            }
            cameraServer = null;
            Log.d(TAG, "✅ Camera web server stopped and nullified");
        } else {
            Log.d(TAG, "⏭️ Camera web server already null - skipping");
        }

        // Clean up server manager
        if (serverManager != null) {
            Log.d(TAG, "🧹 Cleaning up server manager");
            serverManager.cleanup();
            serverManager = null;
            Log.d(TAG, "✅ Server manager cleaned up and nullified");
        } else {
            Log.d(TAG, "⏭️ Server manager already null - skipping");
        }

        // Shutdown network manager
        if (networkManager != null) {
            Log.d(TAG, "🌐 Shutting down network manager");
            networkManager.shutdown();
            networkManager = null;
            Log.d(TAG, "✅ Network manager shut down and nullified");
        } else {
            Log.d(TAG, "⏭️ Network manager already null - skipping");
        }

        // Shutdown bluetooth manager
        if (bluetoothManager != null) {
            Log.d(TAG, "📶 Shutting down bluetooth manager");
            bluetoothManager.removeBluetoothListener(service);
            bluetoothManager.shutdown();
            bluetoothManager = null;
            Log.d(TAG, "✅ Bluetooth manager shut down and nullified");
        } else {
            Log.d(TAG, "⏭️ Bluetooth manager already null - skipping");
        }

        // Media components are stateless, no cleanup needed
        Log.d(TAG, "📁 Media components are stateless - nullifying references");
        mediaQueueManager = null;
        mediaCaptureService = null;

        isInitialized = false;
        Log.i(TAG, "✅ Service components cleaned up successfully");
        Log.d(TAG, "📊 Final state - Initialized: " + isInitialized);
    }

    private void initializeSettings() {
        Log.d(TAG, "⚙️ initializeSettings() started");

        try {
            asgSettings = new AsgSettings(context);
            Log.d(TAG, "✅ Settings initialized successfully");
            Log.d(TAG, "📋 Button press mode on startup: " + asgSettings.getButtonPressMode().getValue());
        } catch (Exception e) {
            Log.e(TAG, "💥 Error initializing settings", e);
            throw e;
        }
    }

    private void initializeNetworkManager() {
        Log.d(TAG, "🌐 initializeNetworkManager() started");

        try {
            networkManager = NetworkManagerFactory.getNetworkManager(context);
            Log.d(TAG, "📦 Network manager created: " + networkManager.getClass().getSimpleName());

            networkManager.addWifiListener(service);
            Log.d(TAG, "📡 WiFi listener added to network manager");

            networkManager.initialize();
            Log.d(TAG, "✅ Network manager initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "💥 Error initializing network manager", e);
            throw e;
        }
    }

    private void initializeBluetoothManager() {
        Log.d(TAG, "📶 initializeBluetoothManager() started");

        try {
            bluetoothManager = BluetoothManagerFactory.getBluetoothManager(context);
            Log.d(TAG, "📦 Bluetooth manager created: " + bluetoothManager.getClass().getSimpleName());

            isK900Device = BluetoothManagerFactory.isK900Device(context);
            Log.d(TAG, "🔍 Device type detection - K900: " + isK900Device);
//
//            isK900Device = BluetoothManagerFactory.isK900Device(context);
//            Log.d(TAG, "🔍 Device type detection - K900: " + isK900Device);

            bluetoothManager.addBluetoothListener(service);
            Log.d(TAG, "📡 Bluetooth listener added to bluetooth manager");

            bluetoothManager.initialize();
            Log.d(TAG, "✅ Bluetooth manager initialized successfully");

            Log.i(TAG, "📊 Bluetooth initialization complete - Device type: " +
                    (isK900Device ? "K900" : "Standard Android"));
        } catch (Exception e) {
            Log.e(TAG, "💥 Error initializing bluetooth manager", e);
            throw e;
        }
    }

    private void initializeMediaQueueManager() {
        Log.d(TAG, "📁 initializeMediaQueueManager() started");

        if (mediaQueueManager == null) {
            Log.d(TAG, "📦 Creating new MediaUploadQueueManager");

            try {
                mediaQueueManager = new MediaUploadQueueManager(context);
                Log.d(TAG, "✅ MediaUploadQueueManager created successfully");

                mediaQueueManager.setMediaQueueCallback(new MediaUploadQueueManager.MediaQueueCallback() {
                    @Override
                    public void onMediaQueued(String requestId, String filePath, int mediaType) {
                        String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "photo" : "video";
                        Log.d(TAG, "📤 Media queued - ID: " + requestId +
                                ", Path: " + filePath +
                                ", Type: " + mediaTypeName);
                    }

                    @Override
                    public void onMediaUploaded(String requestId, String url, int mediaType) {
                        String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                        Log.i(TAG, "✅ " + mediaTypeName + " uploaded from queue - ID: " + requestId +
                                ", URL: " + url);
                        communicationManager.sendMediaSuccessResponse(requestId, url, mediaType);
                    }

                    @Override
                    public void onMediaUploadFailed(String requestId, String error, int mediaType) {
                        String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                        Log.w(TAG, "❌ " + mediaTypeName + " upload failed from queue - ID: " + requestId +
                                ", Error: " + error);
                    }
                });
                Log.d(TAG, "📡 Media queue callback set successfully");

                mediaQueueManager.processQueue();
                Log.d(TAG, "🔄 Media queue processing started");

            } catch (Exception e) {
                Log.e(TAG, "💥 Error creating MediaUploadQueueManager", e);
                throw e;
            }
        } else {
            Log.d(TAG, "⏭️ MediaUploadQueueManager already exists - skipping creation");
        }

        Log.d(TAG, "✅ Media queue manager initialization completed");
    }

    private void initializeMediaCaptureService() {
        Log.d(TAG, "📸 initializeMediaCaptureService() started");

        if (mediaCaptureService == null) {
            Log.d(TAG, "📦 Creating new MediaCaptureService");

            if (mediaQueueManager == null) {
                Log.d(TAG, "📁 MediaQueueManager is null - initializing it first");
                initializeMediaQueueManager();
            }

            try {
                mediaCaptureService = new MediaCaptureService(context, mediaQueueManager, fileManager) {
                    @Override
                    protected void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
                        Log.d(TAG, "📤 Sending media success response - ID: " + requestId +
                                ", URL: " + mediaUrl +
                                ", Type: " + mediaType);
                        communicationManager.sendMediaSuccessResponse(requestId, mediaUrl, mediaType);
                    }

                    @Override
                    protected void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
                        Log.d(TAG, "📤 Sending media error response - ID: " + requestId +
                                ", Error: " + errorMessage +
                                ", Type: " + mediaType);
                        communicationManager.sendMediaErrorResponse(requestId, errorMessage, mediaType);
                    }
                };
                Log.d(TAG, "✅ MediaCaptureService created successfully");

                mediaCaptureService.setMediaCaptureListener(service.getMediaCaptureListener());
                Log.d(TAG, "📡 Media capture listener set");

                mediaCaptureService.setServiceCallback(service.getServiceCallback());
                Log.d(TAG, "📡 Service callback set");

            } catch (Exception e) {
                Log.e(TAG, "💥 Error creating MediaCaptureService", e);
                throw e;
            }
        } else {
            Log.d(TAG, "⏭️ MediaCaptureService already exists - skipping creation");
        }

        Log.d(TAG, "✅ Media capture service initialization completed");
    }

    public void initializeCameraWebServer() {
        Log.d(TAG, "🌐 initializeCameraWebServer() started");
        Log.d(TAG, "📊 Web server enabled: " + isWebServerEnabled);

        if (!isWebServerEnabled) {
            Log.d(TAG, "⏭️ Web server is disabled - skipping initialization");
            return;
        }

        if (serverManager == null) {
            Log.d(TAG, "📦 Creating new AsgServerManager instance");
            serverManager = AsgServerManager.getInstance(context);
            Log.d(TAG, "✅ AsgServerManager created: " + serverManager.getClass().getSimpleName());
        } else {
            Log.d(TAG, "⏭️ AsgServerManager already exists - reusing");
        }

        if (cameraServer == null) {
            Log.d(TAG, "📦 Creating new camera web server");

            try {
                Logger logger = DefaultServerFactory.createLogger();
                Log.d(TAG, "📝 Logger created: " + logger.getClass().getSimpleName());

                cameraServer = DefaultServerFactory.createCameraWebServer(
                        8089,
                        "CameraWebServer",
                        context,
                        logger,
                        fileManager
                );
                Log.d(TAG, "✅ Camera web server created: " + cameraServer.getClass().getSimpleName());

                cameraServer.setOnPictureRequestListener(() -> {
                    Log.i(TAG, "📸 Camera web server requested photo capture");
                    if (mediaCaptureService != null) {
                        String requestId = "web_" + System.currentTimeMillis();
                        Log.d(TAG, "📸 Taking photo locally with request ID: " + requestId);
                        mediaCaptureService.takePhotoLocally();
                    } else {
                        Log.w(TAG, "⚠️ Media capture service is null - cannot take photo");
                    }
                });
                Log.d(TAG, "📡 Picture request listener set");

                serverManager.registerServer("camera", cameraServer);
                Log.d(TAG, "📝 Camera server registered with server manager");

                cameraServer.startServer();
                Log.d(TAG, "🚀 Camera web server started");

                Log.i(TAG, "✅ Camera web server initialized and started successfully");
                Log.d(TAG, "🌐 Web server URL: " + cameraServer.getServerUrl());

            } catch (Exception e) {
                Log.e(TAG, "💥 Failed to initialize camera web server: " + e.getMessage(), e);
                cameraServer = null;
            }
        } else {
            Log.d(TAG, "⏭️ Camera web server already exists - skipping creation");
        }

        Log.d(TAG, "🏁 Camera web server initialization completed");
    }

    // Getters for components
    public AsgSettings getAsgSettings() {
        Log.d(TAG, "📋 getAsgSettings() called - returning: " + (asgSettings != null ? "valid" : "null"));
        return asgSettings;
    }

    public INetworkManager getNetworkManager() {
        Log.d(TAG, "🌐 getNetworkManager() called - returning: " + (networkManager != null ? "valid" : "null"));
        return networkManager;
    }

    public IBluetoothManager getBluetoothManager() {
        Log.d(TAG, "📶 getBluetoothManager() called - returning: " + (bluetoothManager != null ? "valid" : "null"));
        return bluetoothManager;
    }

    public MediaUploadQueueManager getMediaQueueManager() {
        Log.d(TAG, "📁 getMediaQueueManager() called - returning: " + (mediaQueueManager != null ? "valid" : "null"));
        return mediaQueueManager;
    }

    public MediaCaptureService getMediaCaptureService() {
        Log.d(TAG, "📸 getMediaCaptureService() called - returning: " + (mediaCaptureService != null ? "valid" : "null"));
        return mediaCaptureService;
    }

    public AsgCameraServer getCameraServer() {
        Log.d(TAG, "🌐 getCameraServer() called - returning: " + (cameraServer != null ? "valid" : "null"));
        return cameraServer;
    }

    public AsgServerManager getServerManager() {
        Log.d(TAG, "📡 getServerManager() called - returning: " + (serverManager != null ? "valid" : "null"));
        return serverManager;
    }

    public boolean isInitialized() {
        Log.d(TAG, "🔍 isInitialized() called - returning: " + isInitialized);
        return isInitialized;
    }

    public boolean isK900Device() {
        Log.d(TAG, "🔍 isK900Device() called - returning: " + isK900Device);
        return isK900Device;
    }

    public boolean isWebServerEnabled() {
        Log.d(TAG, "🔍 isWebServerEnabled() called - returning: " + isWebServerEnabled);
        return isWebServerEnabled;
    }

    public void setWebServerEnabled(boolean enabled) {
        Log.d(TAG, "⚙️ setWebServerEnabled() called - Current: " + isWebServerEnabled + ", New: " + enabled);

        if (isWebServerEnabled != enabled) {
            Log.i(TAG, "🔄 Web server enabled state changing from " + isWebServerEnabled + " to " + enabled);
            isWebServerEnabled = enabled;

            if (enabled && cameraServer == null) {
                Log.d(TAG, "🚀 Enabling web server - initializing camera server");
                initializeCameraWebServer();
            } else if (!enabled && cameraServer != null) {
                Log.d(TAG, "🛑 Disabling web server - stopping camera server");
                if (serverManager != null) {
                    Log.d(TAG, "📡 Using server manager to stop camera server");
                    serverManager.stopServer("camera");
                } else {
                    Log.d(TAG, "🛑 Directly stopping camera server");
                    cameraServer.stopServer();
                }
                cameraServer = null;
                Log.d(TAG, "✅ Camera server stopped and nullified");
            } else {
                Log.d(TAG, "⏭️ No action needed - web server state already matches desired state");
            }
        } else {
            Log.d(TAG, "⏭️ Web server enabled state unchanged - no action needed");
        }
    }
} 