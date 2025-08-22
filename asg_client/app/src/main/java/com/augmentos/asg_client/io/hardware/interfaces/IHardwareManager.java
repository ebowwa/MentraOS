package com.augmentos.asg_client.io.hardware.interfaces;

/**
 * Interface for hardware management operations across different device types.
 * This interface abstracts hardware control operations to support different
 * implementations for different device types (K900, future models, etc).
 * 
 * Currently supports LED control, but designed to be extensible for other
 * hardware features like haptics, sensors, etc.
 */
public interface IHardwareManager {
    
    /**
     * Initialize the hardware manager and check device capabilities
     */
    void initialize();
    
    /**
     * Check if the device supports recording LED control
     * @return true if LED control is supported, false otherwise
     */
    boolean supportsRecordingLed();
    
    /**
     * Turn the recording LED on (solid)
     */
    void setRecordingLedOn();
    
    /**
     * Turn the recording LED off
     */
    void setRecordingLedOff();
    
    /**
     * Start the recording LED blinking with default pattern
     */
    void setRecordingLedBlinking();
    
    /**
     * Start the recording LED blinking with custom pattern
     * @param onDurationMs Duration in milliseconds for LED on state
     * @param offDurationMs Duration in milliseconds for LED off state
     */
    void setRecordingLedBlinking(long onDurationMs, long offDurationMs);
    
    /**
     * Stop the recording LED blinking (turns LED off)
     */
    void stopRecordingLedBlinking();
    
    /**
     * Flash the recording LED once for a specified duration
     * @param durationMs Duration in milliseconds to keep LED on
     */
    void flashRecordingLed(long durationMs);
    
    /**
     * Check if the recording LED is currently on (solid or blinking)
     * @return true if LED is on or blinking, false if off
     */
    boolean isRecordingLedOn();
    
    /**
     * Check if the recording LED is currently blinking
     * @return true if LED is blinking, false otherwise
     */
    boolean isRecordingLedBlinking();
    
    /**
     * Get the device model identifier
     * @return String identifying the device model (e.g., "K900", "GENERIC")
     */
    String getDeviceModel();
    
    /**
     * Check if this is a K900 device
     * @return true if running on K900 hardware, false otherwise
     */
    boolean isK900Device();
    
    /**
     * Release any resources held by the hardware manager
     */
    void shutdown();
}