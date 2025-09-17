package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event sent when glasses device type information is received.
 * This event carries information about the specific device type/model
 * of the connected glasses (e.g., K900, K900Plus, etc.).
 * This is specifically used for Mentra Live glasses integration.
 */
public class GlassesDeviceTypeEvent {
    // The device model name that reported the device type
    public final String deviceModel;

    // The specific device type reported by the glasses
    public final String deviceType;

    // Timestamp when the device type was received
    public final long timestamp;

    /**
     * Create a new GlassesDeviceTypeEvent
     *
     * @param deviceModel The glasses model name
     * @param deviceType The specific device type (K900, K900Plus, etc.)
     * @param timestamp When the device type was received
     */
    public GlassesDeviceTypeEvent(String deviceModel, String deviceType, long timestamp) {
        this.deviceModel = deviceModel;
        this.deviceType = deviceType;
        this.timestamp = timestamp;
    }

    /**
     * Create a new GlassesDeviceTypeEvent with current timestamp
     *
     * @param deviceModel The glasses model name
     * @param deviceType The specific device type (K900, K900Plus, etc.)
     */
    public GlassesDeviceTypeEvent(String deviceModel, String deviceType) {
        this.deviceModel = deviceModel;
        this.deviceType = deviceType;
        this.timestamp = System.currentTimeMillis();
    }
}
