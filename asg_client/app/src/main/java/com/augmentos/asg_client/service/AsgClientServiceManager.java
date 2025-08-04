package com.augmentos.asg_client.service;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.bluetooth.core.BluetoothManagerFactory;
import com.augmentos.asg_client.io.bluetooth.interfaces.IBluetoothManager;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.io.media.managers.MediaUploadQueueManager;
import com.augmentos.asg_client.io.network.core.NetworkManagerFactory;
import com.augmentos.asg_client.io.network.interfaces.INetworkManager;
import com.augmentos.asg_client.io.server.core.DefaultServerFactory;
import com.augmentos.asg_client.io.server.managers.AsgServerManager;
import com.augmentos.asg_client.io.server.services.AsgCameraServer;
import com.augmentos.asg_client.logging.Logger;
import com.augmentos.asg_client.settings.AsgSettings;

/**
 * Manages the initialization and lifecycle of AsgClientService components.
 * This class follows the Single Responsibility Principle by handling only
 * component initialization and management.
 */
public class AsgClientServiceManager {
    private static final String TAG = "AsgClientServiceManager";

    private final Context context;
    private final AsgClientServiceClean service;
    
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

    public AsgClientServiceManager(Context context, AsgClientServiceClean service) {
        this.context = context;
        this.service = service;
    }

    /**
     * Initialize all service components
     */
    public void initialize() {
        if (isInitialized) {
            Log.d(TAG, "Service manager already initialized");
            return;
        }

        Log.d(TAG, "Initializing AsgClientService components");

        try {
            // Initialize settings first
            initializeSettings();

            // Initialize core managers
            initializeNetworkManager();
            initializeBluetoothManager();
            initializeMediaQueueManager();
            initializeMediaCaptureService();
            initializeCameraWebServer();

            isInitialized = true;
            Log.d(TAG, "✅ All service components initialized successfully");

        } catch (Exception e) {
            Log.e(TAG, "❌ Error initializing service components", e);
            cleanup();
        }
    }

    /**
     * Clean up all service components
     */
    public void cleanup() {
        Log.d(TAG, "Cleaning up service components");

        // Stop camera web server
        if (cameraServer != null) {
            if (serverManager != null) {
                serverManager.stopServer("camera");
            } else {
                cameraServer.stopServer();
            }
            cameraServer = null;
        }

        // Clean up server manager
        if (serverManager != null) {
            serverManager.cleanup();
            serverManager = null;
        }

        // Shutdown network manager
        if (networkManager != null) {
            networkManager.shutdown();
            networkManager = null;
        }

        // Shutdown bluetooth manager
        if (bluetoothManager != null) {
            bluetoothManager.removeBluetoothListener(service);
            bluetoothManager.shutdown();
            bluetoothManager = null;
        }

        // Media components are stateless, no cleanup needed
        mediaQueueManager = null;
        mediaCaptureService = null;

        isInitialized = false;
        Log.d(TAG, "✅ Service components cleaned up");
    }

    private void initializeSettings() {
        asgSettings = new AsgSettings(context);
        Log.d(TAG, "Button press mode on startup: " + asgSettings.getButtonPressMode().getValue());
    }

    private void initializeNetworkManager() {
        networkManager = NetworkManagerFactory.getNetworkManager(context);
        networkManager.addWifiListener(service);
        networkManager.initialize();
        Log.d(TAG, "✅ Network manager initialized");
    }

    private void initializeBluetoothManager() {
        bluetoothManager = BluetoothManagerFactory.getBluetoothManager(context);
        isK900Device = bluetoothManager.getClass().getSimpleName().contains("K900");
        
        bluetoothManager.addBluetoothListener(service);
        bluetoothManager.initialize();
        
        Log.d(TAG, "✅ Bluetooth manager initialized - Device type: " + 
              (isK900Device ? "K900" : "Standard Android"));
    }

    private void initializeMediaQueueManager() {
        if (mediaQueueManager == null) {
            mediaQueueManager = new MediaUploadQueueManager(context);
            mediaQueueManager.setMediaQueueCallback(new MediaUploadQueueManager.MediaQueueCallback() {
                @Override
                public void onMediaQueued(String requestId, String filePath, int mediaType) {
                    Log.d(TAG, "Media queued: " + requestId + ", path: " + filePath + ", type: " +
                            (mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "photo" : "video"));
                }

                @Override
                public void onMediaUploaded(String requestId, String url, int mediaType) {
                    String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                    Log.d(TAG, mediaTypeName + " uploaded from queue: " + requestId + ", URL: " + url);
                    service.sendMediaSuccessResponse(requestId, url, mediaType);
                }

                @Override
                public void onMediaUploadFailed(String requestId, String error, int mediaType) {
                    String mediaTypeName = mediaType == MediaUploadQueueManager.MEDIA_TYPE_PHOTO ? "Photo" : "Video";
                    Log.d(TAG, mediaTypeName + " upload failed from queue: " + requestId + ", error: " + error);
                }
            });
            mediaQueueManager.processQueue();
        }
        Log.d(TAG, "✅ Media queue manager initialized");
    }

    private void initializeMediaCaptureService() {
        if (mediaCaptureService == null) {
            if (mediaQueueManager == null) {
                initializeMediaQueueManager();
            }

            mediaCaptureService = new MediaCaptureService(context, mediaQueueManager) {
                @Override
                protected void sendMediaSuccessResponse(String requestId, String mediaUrl, int mediaType) {
                    service.sendMediaSuccessResponse(requestId, mediaUrl, mediaType);
                }

                @Override
                protected void sendMediaErrorResponse(String requestId, String errorMessage, int mediaType) {
                    service.sendMediaErrorResponse(requestId, errorMessage, mediaType);
                }
            };

            mediaCaptureService.setMediaCaptureListener(service.getMediaCaptureListener());
            mediaCaptureService.setServiceCallback(service.getServiceCallback());
        }
        Log.d(TAG, "✅ Media capture service initialized");
    }

    public void initializeCameraWebServer() {
        if (serverManager == null) {
            serverManager = AsgServerManager.getInstance(context);
        }
        
        if (cameraServer == null && isWebServerEnabled) {
            try {
                Logger logger = DefaultServerFactory.createLogger();
                
                cameraServer = DefaultServerFactory.createCameraWebServer(
                    8089, 
                    "CameraWebServer", 
                    context, 
                    logger
                );
                
                cameraServer.setOnPictureRequestListener(() -> {
                    Log.d(TAG, "📸 Camera web server requested photo capture");
                    if (mediaCaptureService != null) {
                        String requestId = "web_" + System.currentTimeMillis();
                        mediaCaptureService.takePhotoLocally();
                    }
                });
                
                serverManager.registerServer("camera", cameraServer);
                cameraServer.startServer();
                
                Log.d(TAG, "✅ Camera web server initialized and started");
                Log.d(TAG, "🌐 Web server URL: " + cameraServer.getServerUrl());
                
            } catch (Exception e) {
                Log.e(TAG, "❌ Failed to initialize camera web server: " + e.getMessage(), e);
                cameraServer = null;
            }
        }
    }

    // Getters for components
    public AsgSettings getAsgSettings() { return asgSettings; }
    public INetworkManager getNetworkManager() { return networkManager; }
    public IBluetoothManager getBluetoothManager() { return bluetoothManager; }
    public MediaUploadQueueManager getMediaQueueManager() { return mediaQueueManager; }
    public MediaCaptureService getMediaCaptureService() { return mediaCaptureService; }
    public AsgCameraServer getCameraServer() { return cameraServer; }
    public AsgServerManager getServerManager() { return serverManager; }
    
    public boolean isInitialized() { return isInitialized; }
    public boolean isK900Device() { return isK900Device; }
    public boolean isWebServerEnabled() { return isWebServerEnabled; }

    public void setWebServerEnabled(boolean enabled) {
        if (isWebServerEnabled != enabled) {
            isWebServerEnabled = enabled;
            
            if (enabled && cameraServer == null) {
                initializeCameraWebServer();
            } else if (!enabled && cameraServer != null) {
                if (serverManager != null) {
                    serverManager.stopServer("camera");
                } else {
                    cameraServer.stopServer();
                }
                cameraServer = null;
            }
        }
    }
} 