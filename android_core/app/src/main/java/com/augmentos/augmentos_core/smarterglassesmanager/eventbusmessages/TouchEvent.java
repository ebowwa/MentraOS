package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event sent when a touch gesture is detected on the glasses.
 * This includes swipes, taps, and long press gestures.
 * 
 * Supported gestures:
 * - single_tap
 * - double_tap
 * - triple_tap
 * - long_press
 * - forward_swipe
 * - backward_swipe
 * - up_swipe
 * - down_swipe
 */
public class TouchEvent {
    // The device model name that detected the gesture
    public final String deviceModel;

    // The human-readable gesture name
    public final String gestureName;

    // Timestamp when the gesture occurred
    public final long timestamp;

    /**
     * Create a new TouchEvent
     *
     * @param deviceModel The glasses model name
     * @param gestureName The human-readable gesture name
     * @param timestamp When the gesture occurred
     */
    public TouchEvent(String deviceModel, String gestureName, long timestamp) {
        this.deviceModel = deviceModel;
        this.gestureName = gestureName;
        this.timestamp = timestamp;
    }

    public TouchEvent(String deviceModel, String gestureName) {
        this.deviceModel = deviceModel;
        this.gestureName = gestureName;
        this.timestamp = System.currentTimeMillis();
    }
}

