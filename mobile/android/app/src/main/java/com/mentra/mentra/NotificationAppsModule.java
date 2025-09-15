package com.mentra.mentra;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class NotificationAppsModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "NotificationApps";
    private static final String TAG = "NotificationApps";
    
    // Cache of apps that have sent notifications with metadata
    private static final Map<String, AppNotificationInfo> notificationSendingApps = new HashMap<>();
    
    private final ReactApplicationContext reactContext;

    // Helper class to store app notification metadata
    private static class AppNotificationInfo {
        String packageName;
        String appName;
        long firstSeen;
        long lastSeen;
        int notificationCount;
        
        AppNotificationInfo(String packageName, String appName) {
            this.packageName = packageName;
            this.appName = appName;
            this.firstSeen = System.currentTimeMillis();
            this.lastSeen = System.currentTimeMillis();
            this.notificationCount = 1;
        }
        
        void updateActivity() {
            this.lastSeen = System.currentTimeMillis();
            this.notificationCount++;
        }
    }

    public NotificationAppsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Track an app that has sent a notification
     * Called from NotificationService when a notification is received
     */
    public static void trackNotificationApp(String packageName, String appName) {
        if (packageName != null && !packageName.isEmpty()) {
            if (notificationSendingApps.containsKey(packageName)) {
                notificationSendingApps.get(packageName).updateActivity();
            } else {
                notificationSendingApps.put(packageName, new AppNotificationInfo(packageName, appName));
            }
            Log.d(TAG, "Tracked notification app: " + packageName + " (" + appName + ")");
        }
    }

    /**
     * Get list of apps that have sent notifications with metadata
     * This is the primary method for the settings UI
     */
    @ReactMethod
    public void getNotificationApps(Promise promise) {
        try {
            WritableArray appsArray = Arguments.createArray();
            PackageManager packageManager = reactContext.getPackageManager();
            
            for (AppNotificationInfo appInfo : notificationSendingApps.values()) {
                try {
                    ApplicationInfo androidAppInfo = packageManager.getApplicationInfo(appInfo.packageName, 0);
                    
                    WritableMap appMap = Arguments.createMap();
                    appMap.putString("packageName", appInfo.packageName);
                    appMap.putString("appName", appInfo.appName);
                    appMap.putString("icon", getAppIconAsBase64(packageManager, androidAppInfo));
                    appMap.putString("category", categorizeApp(appInfo.packageName));
                    appMap.putDouble("firstSeen", appInfo.firstSeen);
                    appMap.putDouble("lastSeen", appInfo.lastSeen);
                    appMap.putInt("notificationCount", appInfo.notificationCount);
                    
                    appsArray.pushMap(appMap);
                    
                } catch (PackageManager.NameNotFoundException e) {
                    Log.w(TAG, "App not found: " + appInfo.packageName);
                }
            }
            
            Log.d(TAG, "Retrieved " + appsArray.size() + " notification apps");
            promise.resolve(appsArray);
            
        } catch (Exception e) {
            Log.e(TAG, "Error getting notification apps", e);
            promise.reject("GET_APPS_ERROR", e);
        }
    }

    /**
     * Get ALL installed apps (for advanced users who want to pre-configure)
     */
    @ReactMethod
    public void getAllInstalledApps(Promise promise) {
        try {
            WritableArray appsArray = Arguments.createArray();
            PackageManager packageManager = reactContext.getPackageManager();
            
            List<ApplicationInfo> apps = packageManager.getInstalledApplications(PackageManager.GET_META_DATA);
            Log.d(TAG, "🔍 Found " + apps.size() + " total installed applications");
            
            int systemAppsSkipped = 0;
            int userAppsAdded = 0;
            
            for (ApplicationInfo appInfo : apps) {
                String appName = packageManager.getApplicationLabel(appInfo).toString();
                
                // Skip apps with Google, Samsung, or .sec. in package name
                String pkg = appInfo.packageName.toLowerCase();
                if (pkg.contains("google") || pkg.contains("samsung") || pkg.contains(".sec.")) {
                    systemAppsSkipped++;
                    Log.d(TAG, "🚫 Filtering out system app: " + appInfo.packageName + " (" + appName + ")");
                    continue;
                }
                
                // Always include user-installed apps (non-system apps)
                if ((appInfo.flags & ApplicationInfo.FLAG_SYSTEM) == 0) {
                    Log.d(TAG, "👤 User app found: " + appName + " (" + appInfo.packageName + ")");
                }
                
                // Get app icon (no filtering based on icons)
                String iconBase64 = getAppIconAsBase64(packageManager, appInfo);
                
                Log.d(TAG, "✅ Adding app: " + appName + " (" + appInfo.packageName + ")");
                
                WritableMap appMap = Arguments.createMap();
                appMap.putString("packageName", appInfo.packageName);
                appMap.putString("appName", appName);
                appMap.putString("icon", iconBase64);
                appMap.putString("category", categorizeApp(appInfo.packageName));
                appMap.putBoolean("hasNotified", notificationSendingApps.containsKey(appInfo.packageName));
                
                if (notificationSendingApps.containsKey(appInfo.packageName)) {
                    AppNotificationInfo notifInfo = notificationSendingApps.get(appInfo.packageName);
                    appMap.putInt("notificationCount", notifInfo.notificationCount);
                    appMap.putDouble("lastSeen", notifInfo.lastSeen);
                    Log.d(TAG, "📊 " + appName + " has sent " + notifInfo.notificationCount + " notifications");
                } else {
                    appMap.putInt("notificationCount", 0);
                    appMap.putDouble("lastSeen", 0);
                }
                
                appsArray.pushMap(appMap);
                userAppsAdded++;
            }
            
            Log.d(TAG, "📱 Retrieved " + appsArray.size() + " user apps (skipped " + systemAppsSkipped + " system apps)");
            promise.resolve(appsArray);
            
        } catch (Exception e) {
            Log.e(TAG, "Error getting all apps", e);
            promise.reject("GET_ALL_APPS_ERROR", e);
        }
    }

    /**
     * Categorize apps for better UX
     */
    private String categorizeApp(String packageName) {
        String pkg = packageName.toLowerCase();
        
        // Social Media
        if (pkg.contains("whatsapp") || pkg.contains("instagram") || pkg.contains("facebook") || 
            pkg.contains("twitter") || pkg.contains("snapchat") || pkg.contains("tiktok") ||
            pkg.contains("telegram") || pkg.contains("discord") || pkg.contains("linkedin")) {
            return "social";
        }
        
        // Communication
        if (pkg.contains("gmail") || pkg.contains("outlook") || pkg.contains("mail") ||
            pkg.contains("messages") || pkg.contains("sms") || pkg.contains("phone")) {
            return "communication";
        }
        
        // Entertainment
        if (pkg.contains("youtube") || pkg.contains("netflix") || pkg.contains("spotify") ||
            pkg.contains("music") || pkg.contains("video") || pkg.contains("game")) {
            return "entertainment";
        }
        
        // Productivity
        if (pkg.contains("calendar") || pkg.contains("notes") || pkg.contains("office") ||
            pkg.contains("drive") || pkg.contains("docs") || pkg.contains("slack")) {
            return "productivity";
        }
        
        // News
        if (pkg.contains("news") || pkg.contains("reddit") || pkg.contains("medium")) {
            return "news";
        }
        
        // Shopping
        if (pkg.contains("amazon") || pkg.contains("shop") || pkg.contains("store") ||
            pkg.contains("pay") || pkg.contains("bank")) {
            return "shopping";
        }
        
        return "other";
    }

    /**
     * Check if app is launchable (has a main activity that users can launch)
     */
    private boolean isLaunchableApp(PackageManager packageManager, String packageName) {
        Intent launchIntent = packageManager.getLaunchIntentForPackage(packageName);
        return launchIntent != null;
    }

    /**
     * Check if this is obvious system junk that users don't care about
     */
    private boolean isObviousSystemJunk(String packageName, String appName) {
        String pkg = packageName.toLowerCase();
        String name = appName.toLowerCase();
        
        // Skip only the most obvious system internals
        return pkg.contains("com.android.systemui") ||
               pkg.contains("com.android.launcher") ||
               pkg.contains("com.android.inputmethod") ||
               pkg.contains("com.android.providers") ||
               pkg.contains("com.android.server") ||
               pkg.contains(".test") ||
               pkg.startsWith("android.") ||
               // Skip apps with obviously technical display names
               (name.startsWith("com.") && name.contains(".") && name.length() > 20);
    }


    /**
     * Convert app icon to base64 string for React Native
     */
    private String getAppIconAsBase64(PackageManager packageManager, ApplicationInfo appInfo) {
        try {
            Drawable drawable = packageManager.getApplicationIcon(appInfo);
            Bitmap bitmap = drawableToBitmap(drawable);
            
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 85, outputStream);
            byte[] byteArray = outputStream.toByteArray();
            
            return "data:image/png;base64," + Base64.encodeToString(byteArray, Base64.NO_WRAP);
            
        } catch (Exception e) {
            Log.w(TAG, "Could not get icon for " + appInfo.packageName, e);
            return null;
        }
    }

    /**
     * Convert drawable to bitmap
     */
    private Bitmap drawableToBitmap(Drawable drawable) {
        if (drawable instanceof BitmapDrawable) {
            return ((BitmapDrawable) drawable).getBitmap();
        }

        int width = drawable.getIntrinsicWidth();
        int height = drawable.getIntrinsicHeight();
        
        // Fallback size if drawable doesn't have intrinsic dimensions
        if (width <= 0) width = 96;
        if (height <= 0) height = 96;

        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);

        return bitmap;
    }

    /**
     * Get notification statistics for analytics
     */
    @ReactMethod
    public void getNotificationStats(Promise promise) {
        try {
            WritableMap stats = Arguments.createMap();
            
            int totalApps = notificationSendingApps.size();
            int totalNotifications = 0;
            
            for (AppNotificationInfo appInfo : notificationSendingApps.values()) {
                totalNotifications += appInfo.notificationCount;
            }
            
            stats.putInt("totalApps", totalApps);
            stats.putInt("totalNotifications", totalNotifications);
            stats.putDouble("averagePerApp", totalApps > 0 ? (double) totalNotifications / totalApps : 0);
            
            promise.resolve(stats);
            
        } catch (Exception e) {
            Log.e(TAG, "Error getting notification stats", e);
            promise.reject("GET_STATS_ERROR", e);
        }
    }

    /**
     * Clear the tracked notification apps (for testing/reset)
     */
    @ReactMethod
    public void clearTrackedApps(Promise promise) {
        notificationSendingApps.clear();
        Log.d(TAG, "Cleared tracked notification apps");
        promise.resolve(true);
    }

    /**
     * Get count of tracked notification apps
     */
    @ReactMethod
    public void getTrackedAppsCount(Promise promise) {
        promise.resolve(notificationSendingApps.size());
    }

    /**
     * Send individual app to React Native for dynamic loading
     */
    private void sendAppToReactNative(WritableMap appMap) {
        try {
            if (reactContext != null) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onAppDiscovered", appMap);
                
                Log.d(TAG, "📡 Sent app to React Native: " + appMap.getString("appName"));
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to send app to React Native: " + e.getMessage());
        }
    }

    /**
     * Debug method: Get ALL apps without any filtering to check if Discord exists
     */
    @ReactMethod
    public void getAllAppsUnfiltered(Promise promise) {
        try {
            WritableArray appsArray = Arguments.createArray();
            PackageManager packageManager = reactContext.getPackageManager();
            
            List<ApplicationInfo> apps = packageManager.getInstalledApplications(PackageManager.GET_META_DATA);
            Log.d(TAG, "🔍 UNFILTERED: Found " + apps.size() + " total installed applications");
            
            for (ApplicationInfo appInfo : apps) {
                String appName = packageManager.getApplicationLabel(appInfo).toString();
                Log.d(TAG, "🔍 UNFILTERED: Processing app: " + appName + " (" + appInfo.packageName + ")");
                WritableMap appMap = Arguments.createMap();
                appMap.putString("packageName", appInfo.packageName);
                appMap.putString("appName", appName);
                appMap.putBoolean("isSystemApp", (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
                
                appsArray.pushMap(appMap);
                
                // Log Discord if found
                if (appInfo.packageName.toLowerCase().contains("discord") || 
                    appName.toLowerCase().contains("discord")) {
                    Log.d(TAG, "🎮 DISCORD FOUND IN UNFILTERED LIST!");
                    Log.d(TAG, "   Name: " + appName);
                    Log.d(TAG, "   Package: " + appInfo.packageName);
                    Log.d(TAG, "   Is System App: " + ((appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0));
                }
            }
            
            Log.d(TAG, "📱 UNFILTERED: Total apps returned: " + appsArray.size());
            promise.resolve(appsArray);
            
        } catch (Exception e) {
            Log.e(TAG, "Error getting unfiltered apps", e);
            promise.reject("GET_UNFILTERED_APPS_ERROR", e);
        }
    }
}
