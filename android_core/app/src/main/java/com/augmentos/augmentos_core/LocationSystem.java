package com.augmentos.augmentos_core;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.augmentos.augmentos_core.augmentos_backend.ServerComms;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;


public class LocationSystem extends Service {
    private static final String TAG = "LocationSystem";
    private static final int NOTIFICATION_ID = 1004;
    private static final String CHANNEL_ID = "LocationServiceChannel";
    
    // Service binder
    private final IBinder binder = new LocationBinder();

    private FusedLocationProviderClient fusedLocationProviderClient;
    private LocationCallback singlePollCallback;
    private LocationCallback continuousLocationCallback;

    // Store last known location
    private Location lastKnownLocation = null;
    private String currentCorrelationId = null;

    /**
     * Class for clients to access this service
     */
    public class LocationBinder extends Binder {
        public LocationSystem getService() {
            return LocationSystem.this;
        }
    }
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "LocationService created");
        createNotificationChannel();
        
        // Initialize location components
        fusedLocationProviderClient = LocationServices.getFusedLocationProviderClient(this);
        setupLocationCallbacks();
        getLastKnownLocation();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Starting LocationService as foreground service");
        
        // Check if we have required permissions for foreground service
        if (!hasRequiredLocationPermissions()) {
            Log.w(TAG, "Missing location permissions - cannot start as foreground service");
            handleMissingLocationPermissions();
            return START_NOT_STICKY;
        }
        
        try {
            startForeground(NOTIFICATION_ID, createNotification());
            Log.d(TAG, "Successfully started LocationService as foreground service");
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException starting foreground service: " + e.getMessage());
            handleMissingLocationPermissions();
        }
        
        return START_NOT_STICKY; // Don't restart if killed
    }
    
    /**
     * Check if we have all required permissions for location foreground service
     */
    private boolean hasRequiredLocationPermissions() {
        // Check basic location permissions
        boolean hasCoarseLocation = ActivityCompat.checkSelfPermission(this, 
                Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean hasFineLocation = ActivityCompat.checkSelfPermission(this, 
                Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        
        // Check foreground service location permission (Android 14+)
        boolean hasForegroundServiceLocation = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            hasForegroundServiceLocation = ActivityCompat.checkSelfPermission(this, 
                    Manifest.permission.FOREGROUND_SERVICE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
        
        return (hasCoarseLocation || hasFineLocation) && hasForegroundServiceLocation;
    }
    
    /**
     * Handle the case where location permissions are missing
     */
    private void handleMissingLocationPermissions() {
        Log.w(TAG, "Location permissions missing - stopping service gracefully");
        
        // Don't try to access any location data - user removed permissions for a reason
        // Just stop the service and let the app continue without location functionality
        stopSelf();
    }
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }
    
    @Override
    public void onDestroy() {
        Log.d(TAG, "LocationService destroyed");
        cleanup();
        super.onDestroy();
    }
    
    /**
     * Create notification for the foreground service
     */
    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_IMMUTABLE
        );
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Location Service")
                .setContentText("Providing location for smart glasses")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }
    
    /**
     * Create the notification channel for Android O and above
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Location Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Used for location updates for smart glasses");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    // Required no-argument constructor for Android services
    public LocationSystem() {
        // No initialization here - it will be done in onCreate()
    }
    
    // For backward compatibility - this constructor is no longer the main entry point
    // since we're now a Service, but keeping it allows existing code to work
    public LocationSystem(Context context) {
        // We don't need to do anything here since onCreate() will handle initialization
        // This is just for API compatibility
    }

    private void getLastKnownLocation() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        fusedLocationProviderClient.getLastLocation()
                .addOnSuccessListener(location -> {
                    if (location != null) {
                        // Use the last known location immediately
                        lastKnownLocation = location;
                        ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: Using last known location: " + location.getLatitude() + ", " + location.getLongitude());
                    }
                });
    }

    public void stopLocationUpdates() {
        if (fusedLocationProviderClient != null) {
            ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: Stopping all location updates.");
            if (singlePollCallback != null) {
                fusedLocationProviderClient.removeLocationUpdates(singlePollCallback);
            }
            if (continuousLocationCallback != null) {
                fusedLocationProviderClient.removeLocationUpdates(continuousLocationCallback);
            }
        }
    }

    public void sendLocationToServer(Location location) {
        if (location == null) {
            Log.d(TAG, "Location not available, cannot send to server");
            return;
        }

        // Pass the location accuracy and current correlationId to ServerComms
        ServerComms.getInstance().sendLocationUpdate(
            location.getLatitude(),
            location.getLongitude(),
            location.getAccuracy(),
            this.currentCorrelationId
        );

        // A single poll is complete, so we clear the correlationId.
        if (this.currentCorrelationId != null) {
            this.currentCorrelationId = null;
        }
    }

    private void setupLocationCallbacks() {
        // This callback is for single, one-off location requests.
        singlePollCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null || locationResult.getLocations().isEmpty()) {
                    ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: singlePollCallback received null/empty result.");
                    return;
                }
                Location location = locationResult.getLastLocation();
                lastKnownLocation = location;
                String logMessage = "LocationSystem: Accurate location fix obtained (single poll): " + location.getLatitude() + ", " + location.getLongitude();
                ServerComms.getInstance().sendButtonPress("DEBUG_LOG", logMessage);
                sendLocationToServer(location);
                // After a single poll, we must stop updates to save battery.
                stopLocationUpdates();
            }
        };

        // This callback is for continuous streaming and does NOT stop updates.
        continuousLocationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null || locationResult.getLocations().isEmpty()) {
                    ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: continuousLocationCallback received null/empty result.");
                    return;
                }
                Location location = locationResult.getLastLocation();
                lastKnownLocation = location;
                String logMessage = "LocationSystem: Continuous location update: " + location.getLatitude() + ", " + location.getLongitude();
                ServerComms.getInstance().sendButtonPress("DEBUG_LOG", logMessage);
                sendLocationToServer(location);
            }
        };
    }

    // Get the current location - will return last known location if available
    public Location getCurrentLocation() {
        return lastKnownLocation;
    }
    
    /**
     * Call this method to cleanup all resources when the app is being destroyed
     */
    public void cleanup() {
        // Make sure location updates are stopped
        stopLocationUpdates();
    }

    // New methods for Intelligent Location Service
    public void setTier(String tier) {
        ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: setTier called with tier: " + tier);

        // Always stop previous updates before starting a new one.
        stopLocationUpdates();

        // If the tier is "reduced", we do nothing and wait for the next command.
        if (tier == null || tier.equals("reduced")) {
            ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: Tier is 'reduced', no continuous updates will be sent.");
            return;
        }

        LocationRequest streamRequest;
        switch (tier) {
            case "realtime":
                streamRequest = new LocationRequest.Builder(LocationRequest.PRIORITY_HIGH_ACCURACY, 1000).build();
                break;
            case "high":
                streamRequest = new LocationRequest.Builder(LocationRequest.PRIORITY_HIGH_ACCURACY, 10000).build();
                break;
            case "tenMeters":
                streamRequest = new LocationRequest.Builder(LocationRequest.PRIORITY_HIGH_ACCURACY, 30000).build();
                break;
            case "hundredMeters":
                streamRequest = new LocationRequest.Builder(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY, 60000).build();
                break;
            case "kilometer":
                streamRequest = new LocationRequest.Builder(LocationRequest.PRIORITY_LOW_POWER, 300000).build();
                break;
            case "threeKilometers":
                streamRequest = new LocationRequest.Builder(LocationRequest.PRIORITY_NO_POWER, 900000).build();
                break;
            default:
                 ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: Unknown tier '" + tier + "', defaulting to balanced.");
                streamRequest = new LocationRequest.Builder(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY, 60000).build();
                break;
        }

        boolean hasPermission = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: In setTier, hasFineLocationPermission: " + hasPermission);

        if (hasPermission) {
            ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: About to call requestLocationUpdates for continuous stream.");
            fusedLocationProviderClient.requestLocationUpdates(
                streamRequest,
                continuousLocationCallback, // Use the new continuous callback
                Looper.getMainLooper()
            );
            ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: Successfully called requestLocationUpdates for continuous stream.");
        }
    }

    public void requestSingleUpdate(String accuracy, String correlationId) {
        ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: Requesting single location update with accuracy: " + accuracy);
        this.currentCorrelationId = correlationId;

        // Stop any existing streams to prioritize this single, accurate poll.
        stopLocationUpdates();

        LocationRequest.Builder pollRequestBuilder = new LocationRequest.Builder(1000); // Interval is not critical for a single poll.
        pollRequestBuilder.setMaxUpdates(1);

        switch (accuracy) {
            case "realtime":
            case "high":
            case "tenMeters":
                pollRequestBuilder.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
                break;
            case "hundredMeters":
                pollRequestBuilder.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY);
                break;
            case "kilometer":
            case "threeKilometers":
            case "reduced":
                pollRequestBuilder.setPriority(LocationRequest.PRIORITY_LOW_POWER);
                break;
            default:
                ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: Unknown accuracy '" + accuracy + "', defaulting to balanced.");
                pollRequestBuilder.setPriority(LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY);
                break;
        }

        boolean hasPermission = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: In requestSingleUpdate, hasFineLocationPermission: " + hasPermission);

        if (hasPermission) {
            ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: requestSingleUpdate: About to call requestLocationUpdates");
            fusedLocationProviderClient.requestLocationUpdates(
                pollRequestBuilder.build(),
                singlePollCallback, // Use the single poll callback
                Looper.getMainLooper()
            );
            ServerComms.getInstance().sendButtonPress("DEBUG_LOG", "LocationSystem: requestSingleUpdate: Successfully called requestLocationUpdates");
        }
    }
}