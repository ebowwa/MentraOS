package com.augmentos.otaupdater.worker;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.util.Log;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.Data;
import com.augmentos.otaupdater.helper.OtaHelper;
import com.augmentos.otaupdater.helper.Constants;

public class RecoveryWorker extends Worker {
    private static final String TAG = "RecoveryWorker";
    private final OtaHelper otaHelper;

    public RecoveryWorker(Context context, WorkerParameters params) {
        super(context, params);
        otaHelper = new OtaHelper(context);
    }

    private void sendRestartBroadcast() {
        Log.i(TAG, "Scheduling ASG Client restart after delay");
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Log.d(TAG, "Starting ASG Client via MainActivity");
            // First launch MainActivity which can safely start the service
            Intent mainActivityIntent = new Intent();
            mainActivityIntent.setClassName("com.augmentos.asg_client", "com.augmentos.asg_client.MainActivity");
            mainActivityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            mainActivityIntent.putExtra("restart_service", true);
            try {
                getApplicationContext().startActivity(mainActivityIntent);
                Log.i(TAG, "Started ASG Client MainActivity");
            } catch (Exception e) {
                Log.e(TAG, "Failed to start ASG Client MainActivity", e);
            }
        }, Constants.RECOVERY_RESTART_WAIT_MS);
    }

    private boolean waitForHeartbeats() {
        Log.d(TAG, "Waiting for heartbeats after restart...");
        final boolean[] heartbeatReceived = {false};
        final Object lock = new Object();

        // Register a temporary broadcast receiver for heartbeat acknowledgments
        BroadcastReceiver tempReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (Constants.ACTION_ASG_HEARTBEAT_ACK.equals(intent.getAction())) {
                    synchronized (lock) {
                        heartbeatReceived[0] = true;
                        lock.notify();
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(Constants.ACTION_ASG_HEARTBEAT_ACK);
        getApplicationContext().registerReceiver(tempReceiver, filter, Context.RECEIVER_NOT_EXPORTED);

        try {
            synchronized (lock) {
                lock.wait(Constants.RECOVERY_HEARTBEAT_WAIT_MS);
            }
        } catch (InterruptedException e) {
            Log.w(TAG, "Wait for heartbeats interrupted", e);
        } finally {
            getApplicationContext().unregisterReceiver(tempReceiver);
        }

        return heartbeatReceived[0];
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            Log.d(TAG, "Starting recovery work");
            
            // Step 1: Try restarting the app multiple times
            boolean restartSuccessful = false;
            for (int attempt = 1; attempt <= Constants.MAX_RECOVERY_RESTART_ATTEMPTS; attempt++) {
                Log.i(TAG, "Restart attempt " + attempt + " of " + Constants.MAX_RECOVERY_RESTART_ATTEMPTS);
                sendRestartBroadcast();
                
                // Wait a bit before checking for heartbeats
                Thread.sleep(Constants.RECOVERY_RESTART_WAIT_MS);
                
                if (waitForHeartbeats()) {
                    Log.i(TAG, "App successfully recovered after restart");
                    restartSuccessful = true;
                    break;
                }
                
                Log.w(TAG, "No heartbeat received after restart attempt " + attempt);
            }

            // Step 2: If restart didn't work, try APK reinstallation
            if (!restartSuccessful) {
                Log.w(TAG, "Restart attempts failed, attempting APK reinstallation");
                boolean reinstallSuccess = otaHelper.reinstallApkFromBackup();
                
                Data outputData = new Data.Builder()
                        .putBoolean("success", reinstallSuccess)
                        .putString("recovery_method", "reinstall")
                        .build();

                return reinstallSuccess ? Result.success(outputData) : Result.failure(outputData);
            }

            // If we got here, restart was successful
            Data outputData = new Data.Builder()
                    .putBoolean("success", true)
                    .putString("recovery_method", "restart")
                    .build();

            return Result.success(outputData);

        } catch (Exception e) {
            Log.e(TAG, "Error during recovery work", e);
            Data errorData = new Data.Builder()
                    .putString("error", e.getMessage())
                    .build();
            return Result.failure(errorData);
        }
    }
}
