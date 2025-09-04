package com.augmentos.asg_client.io.ota.utils;

/**
 * General constants for the OTA module
 */
public class OtaConstants {
    public static final String TAG = "ASGClientOTA";

    // URLs
    //test url: dev.mentraos-ota-site.pages.dev
    public static final String VERSION_JSON_URL = "https://dev.augmentos.org/version.json";
    //public static final String VERSION_JSON_URL = "https://dev.mentraos-ota-site.pages.dev/versiondev.json";

    // Update actions
    public static final String ACTION_UPDATE_COMPLETED = "com.augmentos.asg_client.ACTION_UPDATE_COMPLETED";

    // APK paths
    public static final String BASE_DIR = "/storage/emulated/0/asg";
    public static final String BACKUP_APK_FILENAME = "asg_client_backup.apk";
    public static final String BACKUP_APK_PATH = BASE_DIR + "/" + BACKUP_APK_FILENAME;

    // OTA update actions
    public static final String ACTION_INSTALL_OTA = "com.augmentos.asg_client.ACTION_INSTALL_OTA";
    public static final String APK_FILENAME = "update.apk";
    public static final String APK_FULL_PATH = BASE_DIR + "/" + APK_FILENAME;
    public static final String METADATA_JSON = "metadata.json";
    public static final long PERIODIC_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

    // WorkManager
    public static final String WORK_NAME_OTA_CHECK = "ota_check";
    public static final String WORK_NAME_OTA_HEARTBEAT = "ota_heartbeat";

    // Update handling
    public static final long UPDATE_TIMEOUT_MS = 5 * 60 * 1000;      // 5 minutes timeout for updates
} 