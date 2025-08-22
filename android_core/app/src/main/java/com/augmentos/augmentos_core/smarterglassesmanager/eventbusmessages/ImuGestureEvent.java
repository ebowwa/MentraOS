package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event for IMU gesture detected by smart glasses
 */
public class ImuGestureEvent {
    public final String gesture;   // "head_up", "head_down", "nod_yes", "shake_no"
    public final long timestamp;   // Timestamp in milliseconds

    public ImuGestureEvent(String gesture, long timestamp) {
        this.gesture = gesture;
        this.timestamp = timestamp;
    }
}