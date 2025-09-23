package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event sent when a button press is detected on the glasses.
 * This event carries information about which button was pressed
 * and the type of press (short or long).
 */
public class ButtonPressEvent {
    // The device model name that detected the button press
    public final String deviceModel;

    // The ID of the button that was pressed (e.g., "camera", "power", "volume")
    public final String buttonId;

    // The type of press detected ("short" or "long")
    public final String pressType;

    // Timestamp when the button press occurred
    public final long timestamp;

    /**
     * Create a new ButtonPressEvent
     *
     * @param deviceModel The glasses model name
     * @param buttonId The identifier for the button pressed
     * @param pressType The type of press ("short" or "long")
     * @param timestamp When the button press occurred
     */
    public ButtonPressEvent(String deviceModel, String buttonId, String pressType, long timestamp) {
        this.deviceModel = deviceModel;
        this.buttonId = buttonId;
        this.pressType = pressType;
        this.timestamp = timestamp;
    }

    public ButtonPressEvent(String deviceModel, String buttonId, String pressType) {
        this.deviceModel = deviceModel;
        this.buttonId = buttonId;
        this.pressType = pressType;
        this.timestamp = System.currentTimeMillis();
    }
}