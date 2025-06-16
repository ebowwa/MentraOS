package com.augmentos.otaupdater;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.appcompat.app.AppCompatActivity;
import com.augmentos.otaupdater.helper.Constants;
import com.augmentos.otaupdater.helper.OtaHelper;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.WorkRequest;
import androidx.work.WorkInfo;
import androidx.work.Data;

import com.augmentos.otaupdater.worker.RecoveryWorker;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MainActivity";
    private OtaHelper otaHelper;
    private Handler heartbeatHandler;
    private Runnable heartbeatRunnable;
    private boolean isInRecoveryMode = false;
    private long lastHeartbeatTime = 0;
    private int missedHeartbeats = 0;
    private BroadcastReceiver heartbeatReceiver;
    private static final String RECOVERY_WORK_TAG = "recovery_work";
    private boolean recoveryInProgress = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        otaHelper = new OtaHelper(this);
        
        // Initialize heartbeat handler
        heartbeatHandler = new Handler(Looper.getMainLooper());
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                sendHeartbeat();
                // Remove any pending callbacks of this runnable before scheduling next
                heartbeatHandler.removeCallbacks(this);
                // Schedule next heartbeat
                heartbeatHandler.postDelayed(this, isInRecoveryMode ? 
                    Constants.RECOVERY_HEARTBEAT_INTERVAL_MS : 
                    Constants.HEARTBEAT_INTERVAL_MS);
            }
        };

        // Register heartbeat receiver
        heartbeatReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (Constants.ACTION_HEARTBEAT_ACK.equals(action)) {
                    handleHeartbeatAck();
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(Constants.ACTION_HEARTBEAT_ACK);
        registerReceiver(heartbeatReceiver, filter, Context.RECEIVER_NOT_EXPORTED);

        // Start heartbeat
        startHeartbeat();
    }

    private void startHeartbeat() {
        Log.d(TAG, "Starting heartbeat system");
        // Initialize lastHeartbeatTime when starting the system
        lastHeartbeatTime = System.currentTimeMillis();
        Log.d(TAG, "Initialized last acknowledgment time to: " + lastHeartbeatTime);

        // Send initial heartbeat only if not in recovery mode (to avoid duplicates during mode transitions)
        if (!isInRecoveryMode) {
            sendHeartbeat();
        }

        // Schedule next heartbeat
        heartbeatHandler.postDelayed(heartbeatRunnable, 
            isInRecoveryMode ? Constants.RECOVERY_HEARTBEAT_INTERVAL_MS : 
                              Constants.HEARTBEAT_INTERVAL_MS);
    }

    private void stopHeartbeat() {
        Log.d(TAG, "Stopping heartbeat system");
        heartbeatHandler.removeCallbacks(heartbeatRunnable);
        heartbeatHandler.removeCallbacksAndMessages(null); // Remove any other pending callbacks
    }

    private void sendHeartbeat() {
        Log.d(TAG, "⚡ Sending heartbeat at " + System.currentTimeMillis());
        Intent heartbeatIntent = new Intent(Constants.ACTION_HEARTBEAT);
        heartbeatIntent.setPackage("com.augmentos.asg_client");
        sendBroadcast(heartbeatIntent);

        // Check if we've missed too many heartbeats (but don't trigger recovery if already in progress)
        if (!recoveryInProgress) {
            long currentTime = System.currentTimeMillis();
            Log.d(TAG, "Current time: " + currentTime);
            Log.d(TAG, "Last acknowledgment time: " + lastHeartbeatTime);
            long timeSinceLastAck = currentTime - lastHeartbeatTime;
            Log.d(TAG, "Time since last acknowledgment: " + timeSinceLastAck + "ms");

            if (timeSinceLastAck > Constants.HEARTBEAT_TIMEOUT_MS) {
                missedHeartbeats++;
                Log.w(TAG, "Missed acknowledgment #" + missedHeartbeats +
                        " after " + timeSinceLastAck + "ms");

                if (missedHeartbeats >= Constants.MAX_MISSED_HEARTBEATS) {
                    Log.e(TAG, "Too many missed acknowledgments, entering recovery mode");
                    enterRecoveryMode();
                }
            }
        }
    }

    private void handleHeartbeatAck() {
        Log.d(TAG, "Received heartbeat acknowledgment");
        lastHeartbeatTime = System.currentTimeMillis();
        Log.d(TAG, "Updated last acknowledgment time to: " + lastHeartbeatTime);
        missedHeartbeats = 0;
        recoveryInProgress = false;
        if (isInRecoveryMode) {
            exitRecoveryMode();
        }
    }

    private void enterRecoveryMode() {
        if (!isInRecoveryMode) {
            Log.w(TAG, "Entering recovery mode");
            isInRecoveryMode = true;
            recoveryInProgress = true;
            missedHeartbeats = 0;
            // Restart heartbeat with recovery interval
            stopHeartbeat();
            startHeartbeat();
            initiateRecovery();
        } else {
            Log.w(TAG, "Already in recovery mode, skipping re-entry");
        }
    }

    private void exitRecoveryMode() {
        if (isInRecoveryMode) {
            Log.i(TAG, "Exiting recovery mode");
            isInRecoveryMode = false;
            // Restart heartbeat with normal interval
            // Defer to avoid overlapping with any pending heartbeat callbacks
            heartbeatHandler.post(() -> {
                stopHeartbeat();
                startHeartbeat();
            });
        }
    }

    private void initiateRecovery() {
        Log.w(TAG, "Initiating recovery procedure");

        // Create input data for the worker
        Data inputData = new Data.Builder()
            .putBoolean("is_recovery_mode", true)
            .build();

        // Create the recovery work request
        WorkRequest recoveryWork = new OneTimeWorkRequest.Builder(RecoveryWorker.class)
            .setInputData(inputData)
            .addTag(RECOVERY_WORK_TAG)
            .build();

        // Observe the work status
        WorkManager.getInstance(this)
            .getWorkInfoByIdLiveData(recoveryWork.getId())
            .observe(this, workInfo -> {
                if (workInfo != null) {
                    switch (workInfo.getState()) {
                        case SUCCEEDED:
                            Log.i(TAG, "Recovery work completed successfully");
                            boolean success = workInfo.getOutputData().getBoolean("success", false);
                            recoveryInProgress = false;
                            if (success) {
                                // Restart ASG Client service after a delay
                                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                                    Intent restartIntent = new Intent(Constants.ACTION_RESTART_ASG_CLIENT);
                                    restartIntent.setPackage("com.augmentos.asg_client");
                                    sendBroadcast(restartIntent);
                                    Log.i(TAG, "Sent restart broadcast to ASG Client service");
                                }, Constants.RECOVERY_RESTART_DELAY_MS);
                            } else {
                                Log.e(TAG, "APK reinstallation failed - no valid backup found");
                                if (isInRecoveryMode) {
                                    isInRecoveryMode = false;
                                    Log.i(TAG, "Exiting recovery mode due to recovery failure");
                                    // Defer heartbeat restart to avoid overlapping schedulers
                                    heartbeatHandler.post(() -> {
                                        stopHeartbeat();
                                        startHeartbeat();
                                    });
                                }
                            }
                            break;
                        case FAILED:
                            Log.e(TAG, "Recovery work failed: " + workInfo.getOutputData().getString("error"));
                            recoveryInProgress = false;
                            // Exit recovery mode and restart normal heartbeat when recovery fails
                            if (isInRecoveryMode) {
                                isInRecoveryMode = false;
                                Log.i(TAG, "Exiting recovery mode due to recovery failure");
                                // Defer heartbeat restart to avoid overlapping schedulers
                                heartbeatHandler.post(() -> {
                                    stopHeartbeat();
                                    startHeartbeat();
                                });
                            }
                            break;
                        case CANCELLED:
                            Log.w(TAG, "Recovery work was cancelled");
                            recoveryInProgress = false;
                            // Exit recovery mode and restart normal heartbeat when recovery is cancelled
                            if (isInRecoveryMode) {
                                isInRecoveryMode = false;
                                Log.i(TAG, "Exiting recovery mode due to recovery cancellation");
                                // Defer heartbeat restart to avoid overlapping schedulers
                                heartbeatHandler.post(() -> {
                                    stopHeartbeat();
                                    startHeartbeat();
                                });
                            }
                            break;
                    }
                }
            });

        // Enqueue the work
        WorkManager.getInstance(this).enqueue(recoveryWork);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopHeartbeat();
        if (heartbeatReceiver != null) {
            unregisterReceiver(heartbeatReceiver);
        }
        // Cancel any pending recovery work if activity is destroyed
        WorkManager.getInstance(this).cancelAllWorkByTag(RECOVERY_WORK_TAG);
    }
}
