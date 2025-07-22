package com.mentra.mentra;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.LocationSettingsResponse;
import com.google.android.gms.tasks.Task;

public class SettingsNavigationModule extends ReactContextBaseJavaModule {
    private static final String TAG = "SettingsNavigationModule";
    private static final int REQUEST_CHECK_SETTINGS = 1001;
    private final ReactApplicationContext reactContext;

    public SettingsNavigationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    @NonNull
    public String getName() {
        return "SettingsNavigationModule";
    }

    /**
     * Opens Bluetooth settings page
     */
    @ReactMethod
    public void openBluetoothSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Error opening Bluetooth settings", e);
            promise.reject("ERROR", "Failed to open Bluetooth settings: " + e.getMessage());
        }
    }

    /**
     * Opens Location settings page
     */
    @ReactMethod
    public void openLocationSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Error opening Location settings", e);
            promise.reject("ERROR", "Failed to open Location settings: " + e.getMessage());
        }
    }

    /**
     * Shows location services dialog using Google Play Services
     * This provides a better UX than redirecting to settings
     */
    @ReactMethod
    public void showLocationServicesDialog(Promise promise) {
        try {
            // Create location request
            LocationRequest locationRequest = LocationRequest.create()
                .setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY)
                .setInterval(10000) // 10 seconds
                .setFastestInterval(5000); // 5 seconds

            // Build location settings request
            LocationSettingsRequest.Builder builder = new LocationSettingsRequest.Builder()
                .addLocationRequest(locationRequest)
                .setAlwaysShow(true); // Important: shows the dialog

            // Get settings client
            com.google.android.gms.location.SettingsClient client = LocationServices.getSettingsClient(reactContext);
            Task<LocationSettingsResponse> task = client.checkLocationSettings(builder.build());

            task.addOnSuccessListener(locationSettingsResponse -> {
                // Location settings are satisfied, but we still want to show the dialog
                // This will show the dialog even if location is already enabled
                Log.d(TAG, "Location settings are satisfied");
                promise.resolve(true);
            });

            task.addOnFailureListener(e -> {
                if (e instanceof ResolvableApiException) {
                    try {
                        // Show the dialog
                        ResolvableApiException resolvable = (ResolvableApiException) e;
                        Activity currentActivity = getCurrentActivity();
                        if (currentActivity != null) {
                            resolvable.startResolutionForResult(currentActivity, REQUEST_CHECK_SETTINGS);
                            promise.resolve(true);
                        } else {
                            promise.reject("ERROR", "No activity available to show location dialog");
                        }
                    } catch (IntentSender.SendIntentException sendEx) {
                        Log.e(TAG, "Error showing location settings dialog", sendEx);
                        promise.reject("ERROR", "Failed to show location settings dialog: " + sendEx.getMessage());
                    }
                } else {
                    Log.e(TAG, "Location settings check failed", e);
                    promise.reject("ERROR", "Location settings check failed: " + e.getMessage());
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Error setting up location services dialog", e);
            promise.reject("ERROR", "Failed to setup location services dialog: " + e.getMessage());
        }
    }

    /**
     * Opens app settings page
     */
    @ReactMethod
    public void openAppSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", reactContext.getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Error opening app settings", e);
            promise.reject("ERROR", "Failed to open app settings: " + e.getMessage());
        }
    }

    /**
     * Handle activity result for location settings dialog
     * This method should be called from the main activity's onActivityResult
     */
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_CHECK_SETTINGS) {
            if (resultCode == Activity.RESULT_OK) {
                // User enabled location services
                Log.d(TAG, "User enabled location services");
                sendEvent("locationServicesEnabled", null);
            } else {
                // User cancelled or location services are still disabled
                Log.d(TAG, "User cancelled location services dialog or services still disabled");
                sendEvent("locationServicesCancelled", null);
            }
        }
    }

    /**
     * Send event to React Native
     */
    private void sendEvent(String eventName, Object params) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }
} 