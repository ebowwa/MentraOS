package com.augmentos.otaupdater.helper;

public class Constants {
    public static final String TAG = "OTAUpdater";

    // URLs
    public static final String VERSION_JSON_URL = "https://dev.augmentos.org/version.json"; // TODO: change with real server ip address

    // Service health monitoring actions
    public static final String ACTION_HEARTBEAT = "com.augmentos.asg_client.ACTION_HEARTBEAT";
    public static final String ACTION_HEARTBEAT_ACK = "com.augmentos.asg_client.ACTION_HEARTBEAT_ACK";
    public static final String ACTION_RESTART_ASG_CLIENT = "com.augmentos.asg_client.ACTION_START_FOREGROUND_SERVICE";

    // Service health monitoring intervals and timeouts
    public static final long HEARTBEAT_INTERVAL_MS = 30000;
    public static final long RECOVERY_HEARTBEAT_INTERVAL_MS = 5000;
    public static final long HEARTBEAT_TIMEOUT_MS = 75000;
    public static final int MAX_MISSED_HEARTBEATS = 3;
    public static final long RECOVERY_RESTART_DELAY_MS = 5000; // 2 seconds

    // APK paths
    public static final String BACKUP_DIR = "/storage/emulated/0/asg";
    public static final String BACKUP_APK_FILENAME = "asg_client_backup.apk";
    public static final String BACKUP_APK_PATH = BACKUP_DIR + "/" + BACKUP_APK_FILENAME;

    // OTA update actions
    public static final String ACTION_INSTALL_OTA = "com.augmentos.otaupdater.ACTION_INSTALL_OTA";
    public static final String APK_FILENAME = "update.apk";
    public static final String OTA_FOLDER = "/data/local/tmp";
    public static final String APK_FULL_PATH = OTA_FOLDER + "/" + APK_FILENAME;
    public static final String METADATA_JSON = "metadata.json";
    public static final long PERIODIC_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 15 minutes in milliseconds

    // WorkManager
    public static final String WORK_NAME_OTA_CHECK = "ota_check";
    public static final String WORK_NAME_OTA_HEARTBEAT = "ota_heartbeat";
}