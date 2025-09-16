package com.mentra.mentra;

import android.content.Context;
import android.content.SharedPreferences;
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

import java.util.Iterator;
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
     * Add app to blacklist
     */
    @ReactMethod
    public void addToBlacklist(String appName, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putBoolean(appName, true); // true = blocked
            editor.apply();
            
            Log.d(TAG, "🚫 Added to blacklist: " + appName);
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
            
            Log.d(TAG, "✅ Removed from blacklist: " + appName);
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
            
            Log.d(TAG, "🔄 Set " + appName + " blocked: " + blocked);
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
            
            Log.d(TAG, "📋 Retrieved " + appsArray.size() + " blacklisted apps");
            promise.resolve(appsArray);
            
        } catch (Exception e) {
            Log.e(TAG, "Error getting blacklisted apps", e);
            promise.reject("GET_BLACKLIST_ERROR", e);
        }
    }

    /**
     * Check if app is blacklisted (used by NotificationService)
     * Uses substring matching - "Discord" blocks "Discord", "Discord Canary", "Discord - Text and Voice", etc.
     */
    public static boolean isAppBlacklisted(Context context, String appName) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            
            // Check if any blacklisted app name is contained in the notification app name
            for (String blacklistedApp : prefs.getAll().keySet()) {
                boolean isBlocked = prefs.getBoolean(blacklistedApp, false);
                if (isBlocked && appName.toLowerCase().contains(blacklistedApp.toLowerCase())) {
                    Log.d(TAG, "📋 Substring match found: '" + blacklistedApp + "' matches '" + appName + "' = BLOCKED");
                    return true;
                }
            }
            
            Log.d(TAG, "📋 No substring matches for: " + appName + " = ALLOWED");
            return false;
            
        } catch (Exception e) {
            Log.w(TAG, "Error checking blacklist for " + appName, e);
            return false;
        }
    }
}
