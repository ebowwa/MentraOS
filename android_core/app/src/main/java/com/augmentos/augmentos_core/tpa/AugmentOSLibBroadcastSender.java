package com.augmentos.augmentos_core.app;

import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.EVENT_BUNDLE;
import static com.augmentos.augmentoslib.AugmentOSGlobalConstants.EVENT_ID;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.augmentos.augmentoslib.AugmentOSCommand;
import com.augmentos.augmentoslib.AugmentOSGlobalConstants;
import com.augmentos.augmentoslib.SmartGlassesAndroidService;
import com.augmentos.augmentoslib.ThirdPartyEdgeApp;
import com.augmentos.augmentoslib.ThirdPartyAppType;
import com.augmentos.augmentoslib.events.CommandTriggeredEvent;
import com.augmentos.augmentoslib.events.KillAppEvent;

import org.greenrobot.eventbus.EventBus;

import java.io.IOException;
import java.io.Serializable;

public class AugmentOSLibBroadcastSender {
    private String TAG = "WearableAi_AugmentOSLibBroadcastSEnder";
    private String intentPkg;
    Context context;

    public AugmentOSLibBroadcastSender(Context context) {
        this.context = context;
        this.intentPkg = AugmentOSGlobalConstants.TO_APP_FILTER;
    }

    public void sendEventToAllApps(String eventId, Serializable eventBundle) {
        sendEventToApps(eventId, eventBundle, null);
    }

    public void sendEventToApps(String eventId, Serializable eventBundle, String appPackageName) {
        //If we're triggering a command, make sure the command's respective service is running
        if(eventId == CommandTriggeredEvent.eventId){
            AugmentOSCommand cmd = ((CommandTriggeredEvent)eventBundle).command;
            startSgmCommandService(cmd);
            //delay a short time so the service can start before we send it the data
            try {
                Thread.sleep(450);
            } catch (InterruptedException e){
                e.printStackTrace();
                Log.d(TAG, "Interrupted while waiting for App service to start.");
            }
        }

        //setup intent to send
        Intent intent = new Intent();
        intent.setAction(intentPkg);
        if (appPackageName != null) {
            intent.setPackage(appPackageName);
        }
        intent.setFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES);

        //load in and send data
        intent.putExtra(EVENT_ID, eventId);
        intent.putExtra(EVENT_BUNDLE, eventBundle);
        context.sendBroadcast(intent);
    }

    public boolean startThirdPartyApp(ThirdPartyEdgeApp app){
        if(app.packageName == "" || app.serviceName == ""){
            return false;
        }

        Intent i = new Intent();
        i.setAction(SmartGlassesAndroidService.INTENT_ACTION);
        i.putExtra(SmartGlassesAndroidService.APP_ACTION, SmartGlassesAndroidService.ACTION_START_FOREGROUND_SERVICE);
        i.setComponent(new ComponentName(app.packageName, app.serviceName));
        ComponentName c = context.startForegroundService(i);

        return true;
    }

    public void killThirdPartyApp(ThirdPartyEdgeApp app){
        Log.d(TAG, "Attempting to kill third-party app: " + app.packageName);
        if (app.appType == ThirdPartyAppType.CORE_SYSTEM) {
            Log.d(TAG, "Cannot kill a core system app: " + app.packageName);
            return; // Initially forgetting to add this return statement has cost me hours of my fleeting life
        };

        // KINDLY ask the App to kill itself
        EventBus.getDefault().post(new KillAppEvent(app));

        // Just in case it did not, KILL IT WITH FIRE
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(app.packageName, app.serviceName));
        context.stopService(intent);

        // DEPLOY THE LOW ORBITAL ION CANNON IN EVENT OF NON-COMPLIANCE
        try {
            String command = "am force-stop " + app.packageName;
            Process process = Runtime.getRuntime().exec(command);
            process.waitFor();
        } catch (IOException | InterruptedException e) {
            // Log the error, if needed, but let it fail silently otherwise
            e.printStackTrace();
        }

        //blank the screen
//        EventBus.getDefault().post(new ReferenceCardSimpleViewRequestEvent("AugmentOS stopped app:", app.appName, 6));
        //EventBus.getDefault().post(new HomeScreenEvent());
    }

    public boolean isThirdPartyAppRunning(ThirdPartyEdgeApp app) {
// TODO: Cannot be implemented this way w/o being a system level app
        //        if (app.packageName.isEmpty() || app.serviceName.isEmpty()) {
//            return false; // Invalid App details
//        }
//
//        ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
//        if (activityManager == null) {
//            return false; // If ActivityManager is not available
//        }
//
//        // Iterate through the list of running services
//        for (ActivityManager.RunningServiceInfo service : activityManager.getRunningServices(Integer.MAX_VALUE)) {
//            if (service.service.getPackageName().equals(app.packageName) &&
//                    service.service.getClassName().equals(app.serviceName)) {
//                return true; // Found the running service
//            }
//        }
//
//        return false; // Service not running
        return false;
    }

    //Starts a AugmentOSCommand's service (if not already running)
    public void startSgmCommandService(AugmentOSCommand augmentosCommand){
        //appPackageName = "com.google.mlkit.samples.nl.translate";
        //appServiceName = ".java.TranslationService";


//        Log.d(TAG, "Starting command package: " + augmentosCommand.packageName);
//        Log.d(TAG, "Starting command service: " + augmentosCommand.serviceName);
//
//        if(augmentosCommand.getPackageName() == "" || augmentosCommand.getServiceName() == ""){
//            return;
//        }
//
//        Intent i = new Intent();
//        i.setAction(SmartGlassesAndroidService.INTENT_ACTION);
//        i.putExtra(SmartGlassesAndroidService.APP_ACTION, SmartGlassesAndroidService.ACTION_START_FOREGROUND_SERVICE);
//        i.setComponent(new ComponentName(augmentosCommand.packageName, augmentosCommand.serviceName));
//        ComponentName c = context.startForegroundService(i);
    }
}
