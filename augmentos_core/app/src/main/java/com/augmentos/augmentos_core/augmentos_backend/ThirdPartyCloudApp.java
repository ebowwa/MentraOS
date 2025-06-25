package com.augmentos.augmentos_core.augmentos_backend;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * ThirdPartyCloudApp represents an app fetched from the server.
 */
public class ThirdPartyCloudApp {
    String packageName;
    String appName;
    String description;
    String webhookURL;
    String iconUrl;
    String appDescription;
    String appInstructions;
    public String version;
    String appType;
    boolean isRunning;

    public ThirdPartyCloudApp(String packageName, String appName, String description, String webhookURL, String iconUrl, boolean isRunning) {
        this.packageName = packageName;
        this.appName = appName;
        this.description = description;
        this.webhookURL = webhookURL;
        this.iconUrl = iconUrl;
        this.isRunning = isRunning;
        this.version = "1.0.0";
        this.appInstructions = "";
    }

    @Override
    public String toString() {
        return "{\"packageName\":\"" + packageName + "\", \"name\":\"" + appName + "\", \"description\":\"" + description + "\", \"webhookURL\":\"" + webhookURL + "\", \"iconUrl\":\"" + iconUrl + "\"}";
    }

    public JSONObject toJson(boolean includeSettings) {
        JSONObject appObj = new JSONObject();
        try {
            appObj.put("name", appName);
            appObj.put("description", appDescription);
            appObj.put("instructions", appInstructions);
            appObj.put("version", version);
            appObj.put("packageName", packageName);
            appObj.put("type", appType);
            appObj.put("is_running", isRunning);
            appObj.put("iconUrl", iconUrl);

            if(includeSettings) {
                //appObj.put("settings", settings);
            }
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
        return appObj;
    }
}
