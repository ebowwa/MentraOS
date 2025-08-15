package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;


public class DisplayImageEvent {
    public final String imageType;
    public final String imageSize;
    // Timestamp
    public final long timestamp;

    public DisplayImageEvent(String imageType, String imageSize, long timestamp) {
        this.imageType = imageType;
        this.imageSize = imageSize;
        this.timestamp = timestamp;
    }

    public DisplayImageEvent(String imageType, String imageSize) {
        this.imageType = imageType;
        this.imageSize = imageSize;
        this.timestamp = System.currentTimeMillis();
    }
}