package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;


public class DisplayImageEvent {
    public final String localImageName;
    // Timestamp
    public final long timestamp;

    public DisplayImageEvent(String localImageName, long timestamp) {
        this.localImageName = localImageName;
        this.timestamp = timestamp;
    }

    public DisplayImageEvent(String localImageName) {
        this.localImageName = localImageName;
        this.timestamp = System.currentTimeMillis();
    }
}