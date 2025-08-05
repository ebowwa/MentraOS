package com.augmentos.asg_client.service.media.handlers;

import android.content.Context;
import android.util.Log;

import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.media.core.MediaCaptureService;
import com.augmentos.asg_client.service.legacy.interfaces.ICommandHandler;
import com.augmentos.asg_client.service.legacy.managers.AsgClientServiceManager;

import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Handler for photo-related commands.
 * Follows Single Responsibility Principle by handling only photo commands.
 */
public class PhotoCommandHandler implements ICommandHandler {
    private static final String TAG = "PhotoCommandHandler";
    
    private final Context context;
    private final AsgClientServiceManager serviceManager;
    private final FileManager fileManager;

    public PhotoCommandHandler(Context context, AsgClientServiceManager serviceManager, FileManager fileManager) {
        this.context = context;
        this.fileManager = fileManager;
        this.serviceManager = serviceManager;
    }

    @Override
    public String getCommandType() {
        return "take_photo";
    }

    @Override
    public boolean handleCommand(JSONObject data) {
        try {

            String requestId = data.optString("requestId", "");
            String webhookUrl = data.optString("webhookUrl", "");
            String transferMethod = data.optString("transferMethod", "direct");
            String bleImgId = data.optString("bleImgId", "");
            boolean save = data.optBoolean("save", false);

            String packageName = data.optString("packageName", "");


            if(packageName.isEmpty()){
                packageName = context.getPackageName();
            }
            Log.d(TAG, "Handling photo command for package: " + packageName);


            if (requestId.isEmpty()) {
                Log.e(TAG, "Cannot take photo - missing requestId");
                return false;
            }

            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());


            fileManager.getFile(packageName,"" ).getPath();
            String photoFilePath = context.getExternalFilesDir(null) + "/IMG_" + timeStamp + ".jpg";

            MediaCaptureService captureService = serviceManager.getMediaCaptureService();
            if (captureService == null) {
                Log.e(TAG, "Media capture service not available");
                return false;
            }

            switch (transferMethod) {
                case "ble":
                    captureService.takePhotoForBleTransfer(photoFilePath, requestId, bleImgId, save);
                    break;
                case "auto":
                    if (bleImgId.isEmpty()) {
                        Log.e(TAG, "Auto mode requires bleImgId for fallback");
                        return false;
                    }
                    captureService.takePhotoAutoTransfer(photoFilePath, requestId, webhookUrl, bleImgId, save);
                    break;
                default:
                    captureService.takePhotoAndUpload(photoFilePath, requestId, webhookUrl, save);
                    break;
            }
            
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error handling photo command", e);
            return false;
        }
    }
} 