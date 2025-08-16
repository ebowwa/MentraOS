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
    private static final String KEY_BUTTON_VIDEO_WIDTH = "button_video_width";
    private static final String KEY_BUTTON_VIDEO_HEIGHT = "button_video_height";
    private static final String KEY_BUTTON_VIDEO_FPS = "button_video_fps";
    
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
        // Using commit() for immediate persistence (fixed the issue)
        prefs.edit().putString(KEY_BUTTON_MODE, mode.getValue()).commit();
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
    
    /**
     * Get the video recording settings for button-initiated recording
     * @return VideoSettings with the saved resolution and fps
     */
    public VideoSettings getButtonVideoSettings() {
        int width = prefs.getInt(KEY_BUTTON_VIDEO_WIDTH, 1280);
        int height = prefs.getInt(KEY_BUTTON_VIDEO_HEIGHT, 720);
        int fps = prefs.getInt(KEY_BUTTON_VIDEO_FPS, 30);
        VideoSettings settings = new VideoSettings(width, height, fps);
        Log.d(TAG, "Retrieved button video settings: " + settings);
        return settings;
    }
    
    /**
     * Set the video recording settings for button-initiated recording
     * @param settings VideoSettings to save
     */
    public void setButtonVideoSettings(VideoSettings settings) {
        if (settings == null) {
            Log.w(TAG, "Attempted to set null video settings, ignoring");
            return;
        }
        if (!settings.isValid()) {
            Log.w(TAG, "Attempted to set invalid video settings: " + settings + ", ignoring");
            return;
        }
        Log.d(TAG, "Setting button video settings to: " + settings);
        // Using commit() for immediate persistence
        prefs.edit()
            .putInt(KEY_BUTTON_VIDEO_WIDTH, settings.width)
            .putInt(KEY_BUTTON_VIDEO_HEIGHT, settings.height)
            .putInt(KEY_BUTTON_VIDEO_FPS, settings.fps)
            .commit();
    }
    
    /**
     * Set button video settings from width, height, and fps values
     * @param width Video width
     * @param height Video height  
     * @param fps Video frame rate
     */
    public void setButtonVideoSettings(int width, int height, int fps) {
        VideoSettings settings = new VideoSettings(width, height, fps);
        setButtonVideoSettings(settings);
    }
}