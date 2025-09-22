package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event fired when a preference is changed that needs to be synced to React Native
 */
public class PreferenceChangedEvent {
    public final String key;
    public final String value;

    public PreferenceChangedEvent(String key, String value) {
        this.key = key;
        this.value = value;
    }
}