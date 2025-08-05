package com.augmentos.asg_client.settings;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Settings manager for ASG Client
 * Handles persistent storage of user preferences
 */
public class AsgSettings {
    private static final String TAG = "AugmentOS_AsgSettings";
    private static final String PREFS_NAME = "asg_settings";
    private static final String KEY_BUTTON_MODE = "button_press_mode";
    
    public enum ButtonPressMode {
        PHOTO("photo"),      // Take photo only
        APPS("apps"),        // Send to apps only
        BOTH("both");        // Both photo and apps
        
        private final String value;
        
        ButtonPressMode(String value) { 
            this.value = value; 
        }
        
        public String getValue() { 
            return value; 
        }
        
        public static ButtonPressMode fromString(String value) {
            for (ButtonPressMode mode : values()) {
                if (mode.value.equals(value)) {
                    return mode;
                }
            }
            Log.w(TAG, "Unknown button mode: " + value + ", defaulting to PHOTO");
            return PHOTO; // default
        }
    }
    
    private final SharedPreferences prefs;
    private final Context context;
    
    public AsgSettings(Context context) {
        this.context = context;
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Log.d(TAG, "AsgSettings initialized");
    }
    
    /**
     * Get the current button press mode
     * @return The current ButtonPressMode setting
     */
    public ButtonPressMode getButtonPressMode() {
        String value = prefs.getString(KEY_BUTTON_MODE, ButtonPressMode.PHOTO.getValue());
        ButtonPressMode mode = ButtonPressMode.fromString(value);
        Log.d(TAG, "Retrieved button press mode: " + mode.getValue());
        return mode;
    }
    
    /**
     * Set the button press mode
     * @param mode The ButtonPressMode to set
     */
    public void setButtonPressMode(ButtonPressMode mode) {
        Log.d(TAG, "Setting button press mode to: " + mode.getValue());
        prefs.edit().putString(KEY_BUTTON_MODE, mode.getValue()).apply();
    }
    
    /**
     * Set the button press mode from a string value
     * @param modeString The string value of the mode
     */
    public void setButtonPressMode(String modeString) {
        ButtonPressMode mode = ButtonPressMode.fromString(modeString);
        setButtonPressMode(mode);
    }
    
    /**
     * Reset all settings to defaults
     */
    public void resetToDefaults() {
        Log.d(TAG, "Resetting all settings to defaults");
        prefs.edit()
            .putString(KEY_BUTTON_MODE, ButtonPressMode.PHOTO.getValue())
            .apply();
    }
    
    /**
     * Check if this is the first run (no settings saved yet)
     * @return true if no settings have been saved
     */
    public boolean isFirstRun() {
        return !prefs.contains(KEY_BUTTON_MODE);
    }
}