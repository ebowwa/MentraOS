package com.augmentos.asg_client.ota;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.augmentos.asg_client.R;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;

import com.augmentos.asg_client.ota.events.DownloadProgressEvent;
import com.augmentos.asg_client.ota.events.InstallationProgressEvent;
import com.augmentos.asg_client.events.BatteryStatusEvent;

public class OtaService extends Service {
    private static final String TAG = Constants.TAG;
    private static final String CHANNEL_ID = "ota_service_channel";
    private static final int NOTIFICATION_ID = 2001;
    
    private OtaHelper otaHelper;
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "OtaService onCreate");
        
        // Create notification channel
        createNotificationChannel();
        
        // Start as foreground service
        startForeground(NOTIFICATION_ID, createNotification("OTA Service Running"));
        
        // Initialize OTA helper
        otaHelper = new OtaHelper(this);
        
        // Register EventBus
        if (!EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().register(this);
        }
        
        // Start checking for updates
        Log.i(TAG, "Starting OTA update check");
        otaHelper.startVersionCheck(this);
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "OtaService onStartCommand");
        return START_STICKY;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "OtaService onDestroy");
        
        // Unregister EventBus
        if (EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().unregister(this);
        }
        
        // Clean up OTA helper
        if (otaHelper != null) {
            otaHelper.cleanup();
        }
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "OTA Update Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("OTA update service notifications");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    private Notification createNotification(String contentText) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ASG Client OTA")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }
    
    private void updateNotification(String contentText) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, createNotification(contentText));
        }
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onDownloadProgress(DownloadProgressEvent event) {
        Log.d(TAG, "Download progress: " + event.toString());
        
        switch (event.getStatus()) {
            case STARTED:
                updateNotification("Downloading update...");
                break;
            case PROGRESS:
                updateNotification("Downloading: " + event.getProgress() + "%");
                break;
            case FINISHED:
                updateNotification("Download complete");
                break;
            case FAILED:
                updateNotification("Download failed: " + event.getErrorMessage());
                break;
        }
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onInstallationProgress(InstallationProgressEvent event) {
        Log.d(TAG, "Installation progress: " + event.toString());
        
        switch (event.getStatus()) {
            case STARTED:
                updateNotification("Installing update...");
                break;
            case FINISHED:
                updateNotification("Installation complete");
                break;
            case FAILED:
                updateNotification("Installation failed: " + event.getErrorMessage());
                break;
        }
    }
    
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onBatteryStatus(BatteryStatusEvent event) {
        // Forward battery status to OTA helper
        if (otaHelper != null) {
            EventBus.getDefault().post(event);
        }
    }
}