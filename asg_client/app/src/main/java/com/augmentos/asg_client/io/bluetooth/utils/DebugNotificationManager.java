package com.augmentos.asg_client.io.bluetooth.utils;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Utility class for showing bluetooth-related debug notifications.
 * Particularly useful for services that can't use Toast messages.
 */
public class DebugNotificationManager {
    private static final int NOTIFICATION_ID_BASE = 22345;
    private static final int NOTIFICATION_ID_BT_STATE = 22346;
    private static final int NOTIFICATION_ID_BT_DATA = 22347;
    private static final int NOTIFICATION_ID_DEVICE_TYPE = 22348;
    private static final int NOTIFICATION_ID_MTU = 22349;
    private static final int NOTIFICATION_ID_ADVERTISING = 22350;
    private static final String CHANNEL_ID = "asg_bluetooth_debug_channel";
    
    private final Context context;
    private final NotificationManager notificationManager;
    private int notificationCount = 0;
    
    /**
     * Create a new DebugNotificationManager
     * @param context The application context
     */
    public DebugNotificationManager(Context context) {
        this.context = context.getApplicationContext();
        this.notificationManager = 
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
    }
    // ... rest of the class remains unchanged ...
}