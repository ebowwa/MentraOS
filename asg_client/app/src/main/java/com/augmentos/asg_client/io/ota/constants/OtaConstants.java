package com.augmentos.asg_client.io.ota.constants;

/**
 * Constants for OTA (Over-The-Air) update functionality
 */
public class OtaConstants {
    public static final String TAG = "OtaHelper";
    
    // File paths
    public static final String APK_FULL_PATH = "/data/local/tmp/update.apk";
    public static final String BACKUP_APK_PATH = "/data/local/tmp/backup.apk";
    public static final String BACKUP_APK_FILENAME = "backup.apk";
    
    // URLs
    public static final String VERSION_JSON_URL = "https://example.com/version.json";
    
    // Actions
    public static final String ACTION_UPDATE_COMPLETED = "com.augmentos.asg_client.ACTION_UPDATE_COMPLETED";
} 