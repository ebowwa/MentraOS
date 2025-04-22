package com.augmentos.asg_client;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/**
 * A transparent activity that starts the AsgClientService as a foreground service
 * and then finishes itself. This is used to launch the service after boot.
 */
public class BootstrapActivity extends Activity {
    private static final String TAG = "BootstrapActivity";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.d(TAG, "BootstrapActivity onCreate - starting AsgClientService");
        
        // Start AsgClientService as a foreground service
        Intent serviceIntent = new Intent(this, AsgClientService.class);
        serviceIntent.setAction(AsgClientService.ACTION_START_FOREGROUND_SERVICE);
        startForegroundService(serviceIntent);
        
        // Wait a moment to ensure the service starts properly, then finish
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Log.d(TAG, "AsgClientService started, finishing BootstrapActivity");
            finish();
        }, 1000); // 1 second delay
    }
    
    @Override
    protected void onDestroy() {
        Log.d(TAG, "BootstrapActivity onDestroy");
        super.onDestroy();
    }
}