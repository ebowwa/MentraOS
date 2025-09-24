package com.mentra.mentra;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;

import androidx.core.app.NotificationManagerCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.Set;

public class NotificationAccessModule extends ReactContextBaseJavaModule {

    public NotificationAccessModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "NotificationAccess";
    }

    @ReactMethod
    public void hasNotificationAccess(Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();

            // Method 1: Check using NotificationManagerCompat
            Set<String> enabledListenerPackages = NotificationManagerCompat.getEnabledListenerPackages(context);
            boolean hasAccess = enabledListenerPackages.contains(context.getPackageName());

            // Method 2: For Android 10+, also verify using Settings.Secure
            // This is more reliable on Android 10 where the first method sometimes fails
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasAccess) {
                String enabledNotificationListeners = Settings.Secure.getString(
                    context.getContentResolver(),
                    "enabled_notification_listeners"
                );

                if (!TextUtils.isEmpty(enabledNotificationListeners)) {
                    ComponentName componentName = new ComponentName(
                        context.getPackageName(),
                        NotificationService.class.getName()
                    );
                    String flattenedName = componentName.flattenToString();
                    hasAccess = enabledNotificationListeners.contains(flattenedName) ||
                               enabledNotificationListeners.contains(context.getPackageName());
                }
            }

            promise.resolve(hasAccess);
        } catch (Exception e) {
            promise.reject("ERROR_CHECKING_ACCESS", e);
        }
    }

    @ReactMethod
    public void requestNotificationAccess(Promise promise) {
        try {
            Activity currentActivity = getCurrentActivity();
            ReactApplicationContext context = getReactApplicationContext();

            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);

            // For Android 10 and above, we need to handle the intent differently
            // to ensure the settings page opens correctly
            if (currentActivity != null) {
                // Use current activity if available (preferred method)
                currentActivity.startActivity(intent);
            } else {
                // Fallback: use application context with NEW_TASK flag
                // This is necessary for Android 10+ when no activity is available
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }

            promise.resolve("OPENED_NOTIFICATION_ACCESS_SETTINGS");
        } catch (Exception e) {
            // Try alternative approach for Android 10 specifically
            try {
                ReactApplicationContext context = getReactApplicationContext();
                Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                context.startActivity(intent);
                promise.resolve("OPENED_NOTIFICATION_ACCESS_SETTINGS");
            } catch (Exception fallbackError) {
                promise.reject("ERROR_OPENING_SETTINGS", "Could not open notification settings. Error: " + e.getMessage());
            }
        }
    }
}