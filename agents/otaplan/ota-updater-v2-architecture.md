# OTA Updater v2 Architecture - Foreground Service

## Moving from Activity to Foreground Service

Since v2 is our chance to fix the architecture, here's what needs to change:

### Current Problems (v1 - Activity-based)
- Can be killed by system at any time
- Downloads interrupted when activity dies  
- Heartbeat monitoring stops if activity destroyed
- No protection from Android resource management

### New Architecture (v2 - Foreground Service)

```java
// OtaUpdaterService.java - NEW main component
public class OtaUpdaterService extends Service {
    private static final String TAG = "OtaUpdaterService";
    private static final int NOTIFICATION_ID = 1001;
    
    private OtaHelper otaHelper;
    private HeartbeatManager heartbeatManager;
    
    @Override
    public void onCreate() {
        super.onCreate();
        
        // Start as foreground service immediately
        startForeground(NOTIFICATION_ID, createNotification("OTA Updater Running"));
        
        // Initialize components
        otaHelper = new OtaHelper(this);
        heartbeatManager = new HeartbeatManager(this);
        
        // Start monitoring
        heartbeatManager.startMonitoring();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Handle any commands if needed
        return START_STICKY; // Restart if killed
    }
    
    private Notification createNotification(String text) {
        // Create notification channel for Android O+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "ota_updater",
                "OTA Updater", 
                NotificationManager.IMPORTANCE_LOW
            );
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        
        return new NotificationCompat.Builder(this, "ota_updater")
            .setContentTitle("MentraOS Updater")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_update)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
    
    // Update notification during downloads
    public void updateProgress(String status, int progress) {
        Notification notification = new NotificationCompat.Builder(this, "ota_updater")
            .setContentTitle("MentraOS Updater")
            .setContentText(status)
            .setProgress(100, progress, false)
            .setSmallIcon(R.drawable.ic_update)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
            
        NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification);
    }
}
```

### MainActivity becomes thin UI layer

```java
// MainActivity.java - Now just UI
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        // Start the service if not running
        Intent serviceIntent = new Intent(this, OtaUpdaterService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
        
        // Bind to service for status updates if needed
        // Or just show a simple UI
    }
}
```

### AndroidManifest.xml changes

```xml
<!-- Add foreground service permission -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- Declare the service -->
<service 
    android:name=".OtaUpdaterService"
    android:exported="false"
    android:foregroundServiceType="dataSync" />
```

### How ASG Client launches it

```java
// In OtaUpdaterManager.java
private void launchOtaUpdater() {
    try {
        // Try service first (v2+)
        Intent serviceIntent = new Intent();
        serviceIntent.setClassName(OTA_UPDATER_PACKAGE, 
                                  OTA_UPDATER_PACKAGE + ".OtaUpdaterService");
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
        
        Log.d(TAG, "Started OTA updater service");
        
        // Also launch activity for UI
        Intent activityIntent = new Intent();
        activityIntent.setClassName(OTA_UPDATER_PACKAGE, 
                                   OTA_UPDATER_PACKAGE + ".MainActivity");
        activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(activityIntent);
        
    } catch (Exception e) {
        Log.e(TAG, "Failed to launch OTA updater", e);
    }
}
```

## Key Benefits

1. **Survives System Pressure**: Foreground services have high priority
2. **Continuous Operation**: Downloads and monitoring continue even if UI killed
3. **User Visibility**: Notification shows update status
4. **Proper Architecture**: Services are meant for long-running operations
5. **Crash Recovery**: START_STICKY ensures service restarts

## Implementation Notes

- Move all business logic from MainActivity to OtaUpdaterService
- HeartbeatManager, OtaHelper, RecoveryWorker all work with Service context
- MainActivity becomes optional - just for showing status
- Service handles everything critical
- Use notification to show download progress

This is the proper way to build a system-critical updater that needs to run reliably in the background!