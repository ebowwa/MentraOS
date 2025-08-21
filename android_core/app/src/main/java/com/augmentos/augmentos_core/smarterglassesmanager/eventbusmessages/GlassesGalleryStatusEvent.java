package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event to notify about gallery status from smart glasses.
 * Contains information about photos and videos available on the glasses.
 */
public class GlassesGalleryStatusEvent {
    public String deviceName;
    public int photoCount;
    public int videoCount;
    public int totalCount;
    public long totalSize;
    public boolean hasContent;

    public GlassesGalleryStatusEvent(String deviceName, int photoCount, int videoCount, 
                                    int totalCount, long totalSize, boolean hasContent) {
        this.deviceName = deviceName;
        this.photoCount = photoCount;
        this.videoCount = videoCount;
        this.totalCount = totalCount;
        this.totalSize = totalSize;
        this.hasContent = hasContent;
    }
}