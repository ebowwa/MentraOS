package com.mentra.mentra;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

import androidx.annotation.NonNull;

/**
 * React Native bridge module for AudioManager
 */
public class AudioManagerModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "AudioManagerModule";
    private AudioManager audioManager;

    public AudioManagerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.audioManager = AudioManager.getInstance(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void playAudio(
            String requestId,
            String audioUrl,
            String audioData,
            String mimeType,
            double volume,
            boolean stopOtherAudio,
            String streamAction,
            Promise promise
    ) {
        android.util.Log.d(MODULE_NAME, "🔊 [AudioManagerModule] playAudio ReactMethod called:");
        android.util.Log.d(MODULE_NAME, "  requestId: " + requestId);
        android.util.Log.d(MODULE_NAME, "  audioUrl: " + (audioUrl != null && !audioUrl.isEmpty() ? audioUrl.substring(0, Math.min(50, audioUrl.length())) + "..." : "null/empty"));
        android.util.Log.d(MODULE_NAME, "  audioData length: " + (audioData != null ? audioData.length() : 0));
        android.util.Log.d(MODULE_NAME, "  mimeType: " + mimeType);
        android.util.Log.d(MODULE_NAME, "  volume: " + volume);
        android.util.Log.d(MODULE_NAME, "  stopOtherAudio: " + stopOtherAudio);
        android.util.Log.d(MODULE_NAME, "  streamAction: " + streamAction);

        try {
            android.util.Log.d(MODULE_NAME, "🔊 [AudioManagerModule] Calling AudioManager.playAudio...");
            audioManager.playAudio(
                    requestId,
                    audioUrl,
                    audioData,
                    mimeType,
                    (float) volume,
                    stopOtherAudio,
                    streamAction
            );
            android.util.Log.d(MODULE_NAME, "🔊 [AudioManagerModule] AudioManager.playAudio completed, resolving promise");
            promise.resolve("Audio playback started");
        } catch (Exception e) {
            android.util.Log.e(MODULE_NAME, "🔊 [AudioManagerModule] AudioManager.playAudio failed:", e);
            promise.reject("AUDIO_PLAY_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopAudio(String requestId, Promise promise) {
        try {
            audioManager.stopAudio(requestId);
            promise.resolve("Audio stopped");
        } catch (Exception e) {
            promise.reject("AUDIO_STOP_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopAllAudio(Promise promise) {
        try {
            audioManager.stopAllAudio();
            promise.resolve("All audio stopped");
        } catch (Exception e) {
            promise.reject("AUDIO_STOP_ALL_ERROR", e.getMessage(), e);
        }
    }
}