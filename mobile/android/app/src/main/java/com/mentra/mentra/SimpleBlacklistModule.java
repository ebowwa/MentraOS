package com.mentra.mentra;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

public class SimpleBlacklistModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "SimpleBlacklist";
    private static final String TAG = "SimpleBlacklist";
    private static final String PREFS_NAME = "NotificationBlacklist";
    
    private final ReactApplicationContext reactContext;

    public SimpleBlacklistModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Get all installed apps with their notification status
     */
    @ReactMethod
    public void getAllInstalledApps(Promise promise) {
        try {
            PackageManager pm = reactContext.getPackageManager();
            WritableArray apps = Arguments.createArray();

            // Get all installed packages
            List<ApplicationInfo> packages = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            for (ApplicationInfo packageInfo : packages) {
                // Skip system apps that don't typically send notifications
                if ((packageInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0) {
                    String packageName = packageInfo.packageName;
                    // Only include system apps that commonly send notifications
                    if (!packageName.startsWith("com.android.") &&
                        !packageName.startsWith("com.google.android.gms") &&
                        !packageName.startsWith("com.google.android.gsf")) {
                        continue;
                    }
                }

                WritableMap app = Arguments.createMap();
                app.putString("packageName", packageInfo.packageName);
                app.putString("appName", pm.getApplicationLabel(packageInfo).toString());
                app.putBoolean("isBlocked", prefs.getBoolean(packageInfo.packageName, false));

                // Get app icon as base64
                try {
                    Drawable icon = pm.getApplicationIcon(packageInfo.packageName);
                    String iconBase64 = drawableToBase64(icon);
                    app.putString("icon", iconBase64);
                } catch (Exception e) {
                    app.putString("icon", null);
                }

                apps.pushMap(app);
            }

            Log.d(TAG, "Retrieved " + apps.size() + " installed apps");
            promise.resolve(apps);

        } catch (Exception e) {
            Log.e(TAG, "Error getting installed apps", e);
            promise.reject("GET_APPS_ERROR", e);
        }
    }

    /**
     * Toggle notification status for an app
     */
    @ReactMethod
    public void toggleAppNotification(String packageName, boolean blocked, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();

            if (blocked) {
                editor.putBoolean(packageName, true);
            } else {
                editor.remove(packageName);
            }
            editor.apply();

            Log.d(TAG, "Set " + packageName + " blocked: " + blocked);
            promise.resolve(true);

        } catch (Exception e) {
            Log.e(TAG, "Error toggling app notification", e);
            promise.reject("TOGGLE_APP_ERROR", e);
        }
    }

    /**
     * Convert Drawable to Base64 string
     */
    private String drawableToBase64(Drawable drawable) {
        try {
            Bitmap bitmap;

            if (drawable instanceof BitmapDrawable) {
                bitmap = ((BitmapDrawable) drawable).getBitmap();
            } else {
                bitmap = Bitmap.createBitmap(
                    drawable.getIntrinsicWidth() > 0 ? drawable.getIntrinsicWidth() : 48,
                    drawable.getIntrinsicHeight() > 0 ? drawable.getIntrinsicHeight() : 48,
                    Bitmap.Config.ARGB_8888
                );
                Canvas canvas = new Canvas(bitmap);
                drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
                drawable.draw(canvas);
            }

            // Scale down if too large
            if (bitmap.getWidth() > 48 || bitmap.getHeight() > 48) {
                bitmap = Bitmap.createScaledBitmap(bitmap, 48, 48, true);
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, baos);
            byte[] imageBytes = baos.toByteArray();
            return Base64.encodeToString(imageBytes, Base64.NO_WRAP);
        } catch (Exception e) {
            Log.e(TAG, "Error converting drawable to base64", e);
            return null;
        }
    }

    /**
     * Add app to blacklist (deprecated - use toggleAppNotification)
     */
    @ReactMethod
    public void addToBlacklist(String appName, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putBoolean(appName, true); // true = blocked
            editor.apply();

            Log.d(TAG, "Added to blacklist: " + appName);
            promise.resolve(true);

        } catch (Exception e) {
            Log.e(TAG, "Error adding to blacklist", e);
            promise.reject("ADD_BLACKLIST_ERROR", e);
        }
    }

    /**
     * Remove app from blacklist
     */
    @ReactMethod
    public void removeFromBlacklist(String appName, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.remove(appName);
            editor.apply();
            
            Log.d(TAG, "Removed from blacklist: " + appName);
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Error removing from blacklist", e);
            promise.reject("REMOVE_BLACKLIST_ERROR", e);
        }
    }

    /**
     * Set app block status
     */
    @ReactMethod
    public void setAppBlocked(String appName, boolean blocked, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            
            if (blocked) {
                editor.putBoolean(appName, true);
            } else {
                editor.remove(appName); // Remove from blacklist = allowed
            }
            editor.apply();
            
            Log.d(TAG, "Set " + appName + " blocked: " + blocked);
            promise.resolve(true);
            
        } catch (Exception e) {
            Log.e(TAG, "Error setting app block status", e);
            promise.reject("SET_BLOCKED_ERROR", e);
        }
    }

    /**
     * Get all blacklisted apps
     */
    @ReactMethod
    public void getBlacklistedApps(Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            WritableArray appsArray = Arguments.createArray();
            
            for (String appName : prefs.getAll().keySet()) {
                boolean blocked = prefs.getBoolean(appName, false);
                if (blocked) {
                    WritableMap appMap = Arguments.createMap();
                    appMap.putString("name", appName);
                    appMap.putBoolean("blocked", blocked);
                    appsArray.pushMap(appMap);
                }
            }
            
            Log.d(TAG, "Retrieved " + appsArray.size() + " blacklisted apps");
            promise.resolve(appsArray);
            
        } catch (Exception e) {
            Log.e(TAG, "Error getting blacklisted apps", e);
            promise.reject("GET_BLACKLIST_ERROR", e);
        }
    }

    /**
     * Check if app is blacklisted by package name (used by NotificationService)
     */
    public static boolean isAppBlacklisted(Context context, String packageName) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean isBlocked = prefs.getBoolean(packageName, false);

            if (isBlocked) {
                Log.d(TAG, "Package blocked: " + packageName);
            }
            return isBlocked;

        } catch (Exception e) {
            Log.w(TAG, "Error checking blacklist for " + packageName, e);
            return false;
        }
    }
}
