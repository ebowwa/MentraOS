package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event sent when glasses hotspot status changes.
 * This follows the same pattern as GlassesWifiStatusChange for consistency.
 */
public class GlassesHotspotStatusChange {
    // The device model name 
    public final String deviceModel;
    
    // Hotspot status information
    public final boolean isHotspotEnabled;
    public final String hotspotSsid;
    public final String hotspotPassword;
    public final String hotspotGatewayIp;
    
    /**
     * Create a new GlassesHotspotStatusChange
     * 
     * @param deviceModel The glasses model name
     * @param isHotspotEnabled Current hotspot state
     * @param hotspotSsid Current hotspot SSID if enabled
     * @param hotspotPassword Current hotspot password if enabled
     * @param hotspotGatewayIp Local IP address of the glasses hotspot
     */
    public GlassesHotspotStatusChange(String deviceModel,
                                     boolean isHotspotEnabled, 
                                     String hotspotSsid, 
                                     String hotspotPassword,
                                     String hotspotGatewayIp) {
        this.deviceModel = deviceModel;
        this.isHotspotEnabled = isHotspotEnabled;
        this.hotspotSsid = hotspotSsid != null ? hotspotSsid : "";
        this.hotspotPassword = hotspotPassword != null ? hotspotPassword : "";
        this.hotspotGatewayIp = hotspotGatewayIp != null ? hotspotGatewayIp : "";
    }
}