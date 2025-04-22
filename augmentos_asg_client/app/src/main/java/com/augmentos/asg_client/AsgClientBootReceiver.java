package com.augmentos.asg_client;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Boot receiver for AsgClient application.
 * Listens for device boot and starts BootstrapActivity, which then starts AsgClientService.
 * This workaround is needed because Android restricts starting foreground services directly
 * from broadcast receivers in newer Android versions.
 */
public class AsgClientBootReceiver extends BroadcastReceiver {
    private static final String TAG = "AsgClientBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Boot receiver triggered with action: " + intent.getAction());
        
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || 
                "android.intent.action.QUICKBOOT_POWERON".equals(intent.getAction())) {
            
            Log.d(TAG, "Device boot completed - launching BootstrapActivity");
            
            // Start BootstrapActivity which will start the service properly
            Intent activityIntent = new Intent(context, BootstrapActivity.class);
            activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(activityIntent);
        }
    }
}