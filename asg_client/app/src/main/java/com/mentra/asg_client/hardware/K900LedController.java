package com.mentra.asg_client.hardware;

import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import com.dev.api.DevApi;

/**
 * Singleton controller for managing the K900 recording LED.
 * Provides thread-safe LED control with support for different patterns.
 * This class wraps the low-level DevApi to provide a more convenient interface.
 * 
 * NOTE: This class controls the local MTK LED. For RGB LED control on the glasses
 * themselves (BES chipset), use the LedCommandHandler to send commands via Bluetooth.
 */
public class K900LedController {
    private static final String TAG = "K900LedController";
    
    private static K900LedController instance;
    private final Handler ledHandler;
    private final HandlerThread ledHandlerThread;
    
    // LED states (for local MTK LED)
    private boolean isLedOn = false;
    private boolean isBlinking = false;
    private boolean isBreathing = false;
    private boolean isInitialized = false;
    private int currentBrightness = 100; // Default to full brightness (0-100)
    
    // Blinking parameters
    private static final long BLINK_ON_DURATION_MS = 500;
    private static final long BLINK_OFF_DURATION_MS = 500;
    
    // Breathing parameters
    private static final long BREATHING_UPDATE_INTERVAL_MS = 50; // Update every 50ms for smooth animation
    private static final double BREATHING_PERIOD_MS = 2000.0; // Complete sine wave cycle every 2 seconds
    private static final int BREATHING_MIN_BRIGHTNESS = 50; // Minimum brightness (0% - off)
    private static final int BREATHING_MAX_BRIGHTNESS = 70; // Maximum brightness (100% - full)
    private long breathingStartTime = 0;
    
    private final Runnable blinkRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isBlinking) {
                return;
            }
            
            // Toggle LED state
            isLedOn = !isLedOn;
            setLedStateInternal(isLedOn);
            
            // Schedule next blink
            long delay = isLedOn ? BLINK_ON_DURATION_MS : BLINK_OFF_DURATION_MS;
            ledHandler.postDelayed(this, delay);
        }
    };
    
    private final Runnable breathingRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isBreathing) {
                return;
            }
            
            // Calculate elapsed time since breathing started
            long elapsedMs = System.currentTimeMillis() - breathingStartTime;
            
            // Calculate position in sine wave (0 to 2π)
            double angle = (2.0 * Math.PI * elapsedMs) / BREATHING_PERIOD_MS;
            
            // Calculate brightness using sine wave
            // sin(angle) ranges from -1 to 1, we map it to MIN to MAX brightness
            double sineValue = Math.sin(angle);
            double brightnessRange = BREATHING_MAX_BRIGHTNESS - BREATHING_MIN_BRIGHTNESS;
            int brightness = (int) (BREATHING_MIN_BRIGHTNESS + (brightnessRange * (sineValue + 1.0) / 2.0));
            
            // Clamp to ensure we stay within bounds
            brightness = Math.max(BREATHING_MIN_BRIGHTNESS, Math.min(BREATHING_MAX_BRIGHTNESS, brightness));
            
            // Set the brightness
            try {
                DevApi.setLedCustomBright(brightness, (int)BREATHING_UPDATE_INTERVAL_MS);
                currentBrightness = brightness;
                isLedOn = true;
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "Failed to set breathing LED brightness - libxydev.so not loaded", e);
                isBreathing = false;
                isInitialized = false;
                return;
            } catch (Exception e) {
                Log.e(TAG, "Failed to set breathing LED brightness", e);
                isBreathing = false;
                return;
            }
            
            // Schedule next update
            ledHandler.postDelayed(this, BREATHING_UPDATE_INTERVAL_MS);
        }
    };
    
    private K900LedController() {
        // Create a dedicated thread for LED control to avoid blocking main thread
        ledHandlerThread = new HandlerThread("K900LedControlThread");
        ledHandlerThread.start();
        ledHandler = new Handler(ledHandlerThread.getLooper());
        
        // Try to initialize the LED (turn it off to ensure known state)
        initializeLed();
    }
    
    /**
     * Get the singleton instance of K900LedController
     */
    public static synchronized K900LedController getInstance() {
        if (instance == null) {
            instance = new K900LedController();
        }
        return instance;
    }
    
    /**
     * Initialize the LED to a known state (off)
     */
    private void initializeLed() {
        ledHandler.post(() -> {
            try {
                DevApi.setLedOn(false);
                isInitialized = true;
                isLedOn = false;
                Log.d(TAG, "LED initialized successfully");
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "Failed to initialize LED - libxydev.so not loaded", e);
                isInitialized = false;
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize LED", e);
                isInitialized = false;
            }
        });
    }
    
    /**
     * Turn the LED on (solid)
     */
    public void turnOn() {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized, attempting to initialize...");
            initializeLed();
        }
        
        ledHandler.post(() -> {
            stopBlinking();
            setLedStateInternal(true);
            Log.d(TAG, "LED turned ON");
        });
    }
    
    /**
     * Turn the LED off
     */
    public void turnOff() {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized");
            return;
        }
        
        ledHandler.post(() -> {
            stopBlinking();
            setLedStateInternal(false);
            Log.d(TAG, "LED turned OFF");
        });
    }
    
    /**
     * Start blinking the LED
     */
    public void startBlinking() {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized, attempting to initialize...");
            initializeLed();
        }
        
        ledHandler.post(() -> {
            if (isBlinking) {
                Log.d(TAG, "LED already blinking");
                return;
            }
            
            isBlinking = true;
            Log.d(TAG, "LED blinking started");
            ledHandler.post(blinkRunnable);
        });
    }
    
    /**
     * Start blinking with custom intervals
     * @param onDurationMs Duration in milliseconds for LED on state
     * @param offDurationMs Duration in milliseconds for LED off state
     */
    public void startBlinking(long onDurationMs, long offDurationMs) {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized, attempting to initialize...");
            initializeLed();
        }
        
        ledHandler.post(() -> {
            if (isBlinking) {
                stopBlinking();
            }
            
            isBlinking = true;
            Log.d(TAG, String.format("LED custom blinking started (on=%dms, off=%dms)", 
                                     onDurationMs, offDurationMs));
            
            // Custom blink runnable with specified durations
            Runnable customBlinkRunnable = new Runnable() {
                @Override
                public void run() {
                    if (!isBlinking) {
                        return;
                    }
                    
                    isLedOn = !isLedOn;
                    setLedStateInternal(isLedOn);
                    
                    long delay = isLedOn ? onDurationMs : offDurationMs;
                    ledHandler.postDelayed(this, delay);
                }
            };
            
            ledHandler.post(customBlinkRunnable);
        });
    }
    
    /**
     * Stop blinking (turns LED off)
     */
    public void stopBlinking() {
        isBlinking = false;
        isBreathing = false;  // Also stop breathing if active
        ledHandler.removeCallbacksAndMessages(null);
        setLedStateInternal(false);
        Log.d(TAG, "LED blinking stopped");
    }
    
    /**
     * Start breathing pattern (sine wave pulse between 50-70% brightness)
     * Used for video recording indicator
     */
    public void startBreathing() {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized, attempting to initialize...");
            initializeLed();
        }
        
        ledHandler.post(() -> {
            if (isBreathing) {
                Log.d(TAG, "LED already breathing");
                return;
            }
            
            // Stop any blinking patterns
            isBlinking = false;
            ledHandler.removeCallbacksAndMessages(null);
            
            isBreathing = true;
            breathingStartTime = System.currentTimeMillis();
            Log.i(TAG, "🌊 LED breathing pattern started (0-100% sine wave)");
            ledHandler.post(breathingRunnable);
        });
    }
    
    /**
     * Stop breathing pattern (turns LED off)
     */
    public void stopBreathing() {
        ledHandler.post(() -> {
            if (!isBreathing) {
                return;
            }
            
            isBreathing = false;
            ledHandler.removeCallbacksAndMessages(null);
            setLedStateInternal(false);
            Log.i(TAG, "🌊 LED breathing pattern stopped");
        });
    }
    
    /**
     * Check if LED is currently in breathing mode
     * @return true if LED is breathing
     */
    public boolean isBreathing() {
        return isBreathing;
    }
    
    /**
     * Get current LED state
     * @return true if LED is on (or blinking/breathing), false if off
     */
    public boolean isLedOn() {
        return isLedOn || isBlinking || isBreathing;
    }
    
    /**
     * Check if LED is currently blinking
     * @return true if LED is in blinking mode
     */
    public boolean isBlinking() {
        return isBlinking;
    }
    
    /**
     * Internal method to set LED state through DevApi
     */
    private void setLedStateInternal(boolean on) {
        try {
            DevApi.setLedOn(on);
            isLedOn = on;
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to control LED - libxydev.so not loaded", e);
            isInitialized = false;
        } catch (Exception e) {
            Log.e(TAG, "Failed to set LED state: " + on, e);
        }
    }
    
    /**
     * Flash the LED once for a specified duration
     * @param durationMs Duration in milliseconds to keep LED on
     */
    public void flash(long durationMs) {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized");
            return;
        }
        
        ledHandler.post(() -> {
            stopBlinking();
            setLedStateInternal(true);
            Log.d(TAG, "LED flash for " + durationMs + "ms");
            
            ledHandler.postDelayed(() -> {
                setLedStateInternal(false);
                Log.d(TAG, "LED flash completed");
            }, durationMs);
        });
    }
    
    /**
     * Set LED brightness with custom duration
     * @param percent Brightness percentage (0-100, where 0=off, 100=full brightness)
     * @param showTimeMs Duration in milliseconds to show this brightness (0-65535)
     */
    public void setBrightness(int percent, int showTimeMs) {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized, attempting to initialize...");
            initializeLed();
        }
        
        // Clamp values to valid ranges
        int clampedPercent = Math.max(0, Math.min(100, percent));
        int clampedShowTime = Math.max(0, Math.min(65535, showTimeMs));
        
        ledHandler.post(() -> {
            try {
                stopBlinking();
                DevApi.setLedCustomBright(clampedPercent, clampedShowTime);
                currentBrightness = clampedPercent;
                isLedOn = (clampedPercent > 0);
                Log.d(TAG, String.format("LED brightness set to %d%% for %dms", 
                                         clampedPercent, clampedShowTime));
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "Failed to set LED brightness - libxydev.so not loaded", e);
                isInitialized = false;
            } catch (Exception e) {
                Log.e(TAG, "Failed to set LED brightness", e);
            }
        });
    }
    
    /**
     * Set LED brightness (stays at this brightness indefinitely)
     * @param percent Brightness percentage (0-100, where 0=off, 100=full brightness)
     */
    public void setBrightness(int percent) {
        // Use maximum duration (65535ms ~= 65 seconds) and caller can call again to maintain
        // Or set to 0 for indefinite (hardware dependent)
        setBrightness(percent, 0);
    }
    
    /**
     * Get current LED brightness
     * @return Current brightness percentage (0-100)
     */
    public int getBrightness() {
        return currentBrightness;
    }
    
    /**
     * Clean up resources when no longer needed
     */
    public void shutdown() {
        Log.d(TAG, "Shutting down LED controller");
        stopBlinking();
        turnOff();
        ledHandlerThread.quitSafely();
        instance = null;
    }
}