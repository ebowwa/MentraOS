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
    private boolean isPulsing = false;
    private boolean isInitialized = false;
    private int currentBrightness = 100; // Default to full brightness (0-100)

    // Blinking parameters
    private static final long BLINK_ON_DURATION_MS = 500;
    private static final long BLINK_OFF_DURATION_MS = 500;

    // Pulsing parameters (for smooth recording indicator)
    private static final int PULSE_MIN_BRIGHTNESS = 30;
    private static final int PULSE_MAX_BRIGHTNESS = 60;
    private static final long FADE_IN_DURATION_MS = 500;
    private static final long FADE_OUT_DURATION_MS = 500;
    private static final long PULSE_CYCLE_MS = 1500; // Time for one complete oscillation
    private static final long PULSE_STEP_INTERVAL_MS = 50; // Update brightness every 50ms for smoothness

    // Pulsing state
    private enum PulsePhase { FADE_IN, PULSING, FADE_OUT, OFF }
    private PulsePhase currentPulsePhase = PulsePhase.OFF;
    private long pulsePhaseStartTime = 0;
    private boolean pulseDirectionUp = true; // true = increasing brightness, false = decreasing
    private Runnable onFadeOutComplete = null; // Callback when fade-out finishes
    
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

    private final Runnable pulseRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isPulsing && currentPulsePhase != PulsePhase.FADE_OUT) {
                return;
            }

            long elapsed = System.currentTimeMillis() - pulsePhaseStartTime;
            int targetBrightness;

            switch (currentPulsePhase) {
                case FADE_IN:
                    // Gradually increase from 0 to PULSE_MAX_BRIGHTNESS
                    float fadeInProgress = Math.min(1.0f, (float) elapsed / FADE_IN_DURATION_MS);
                    targetBrightness = (int) (fadeInProgress * PULSE_MAX_BRIGHTNESS);
                    setBrightnessInternal(targetBrightness);

                    if (fadeInProgress >= 1.0f) {
                        // Transition to pulsing phase
                        currentPulsePhase = PulsePhase.PULSING;
                        pulsePhaseStartTime = System.currentTimeMillis();
                        pulseDirectionUp = false; // Start by going down to min
                        Log.d(TAG, "LED pulse: fade-in complete, starting oscillation");
                    }
                    ledHandler.postDelayed(this, PULSE_STEP_INTERVAL_MS);
                    break;

                case PULSING:
                    // Oscillate between PULSE_MIN_BRIGHTNESS and PULSE_MAX_BRIGHTNESS
                    float halfCycle = PULSE_CYCLE_MS / 2.0f;

                    // Check if we need to flip direction FIRST (before calculating brightness)
                    // This prevents a brightness jump when elapsed hits exactly halfCycle
                    if (elapsed >= (long) halfCycle) {
                        pulseDirectionUp = !pulseDirectionUp;
                        pulsePhaseStartTime = System.currentTimeMillis();
                        elapsed = 0; // Reset for this calculation
                    }

                    float cycleProgress = Math.min(1.0f, elapsed / halfCycle);

                    if (pulseDirectionUp) {
                        // Going from min to max
                        targetBrightness = PULSE_MIN_BRIGHTNESS +
                            (int) (cycleProgress * (PULSE_MAX_BRIGHTNESS - PULSE_MIN_BRIGHTNESS));
                    } else {
                        // Going from max to min
                        targetBrightness = PULSE_MAX_BRIGHTNESS -
                            (int) (cycleProgress * (PULSE_MAX_BRIGHTNESS - PULSE_MIN_BRIGHTNESS));
                    }

                    setBrightnessInternal(targetBrightness);
                    ledHandler.postDelayed(this, PULSE_STEP_INTERVAL_MS);
                    break;

                case FADE_OUT:
                    // Gradually decrease from captured start brightness to 0
                    // IMPORTANT: Use fadeOutStartBrightness (captured once at fade-out start)
                    // NOT currentBrightness (which changes each iteration)
                    float fadeOutProgress = Math.min(1.0f, (float) elapsed / FADE_OUT_DURATION_MS);
                    targetBrightness = (int) (fadeOutStartBrightness * (1.0f - fadeOutProgress));
                    setBrightnessInternal(Math.max(0, targetBrightness));

                    if (fadeOutProgress >= 1.0f) {
                        // Fade-out complete
                        currentPulsePhase = PulsePhase.OFF;
                        isPulsing = false;
                        setBrightnessInternal(0);
                        setLedStateInternal(false);
                        Log.d(TAG, "LED pulse: fade-out complete");

                        // Execute callback if set
                        if (onFadeOutComplete != null) {
                            Runnable callback = onFadeOutComplete;
                            onFadeOutComplete = null;
                            callback.run();
                        }
                    } else {
                        ledHandler.postDelayed(this, PULSE_STEP_INTERVAL_MS);
                    }
                    break;

                case OFF:
                default:
                    // Should not reach here
                    break;
            }
        }
    };

    // Track the brightness at fade-out start for smooth transition
    private int fadeOutStartBrightness = PULSE_MAX_BRIGHTNESS;

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
            stopBlinkingInternal();
            stopPulsingInternal(false); // Stop pulsing immediately
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
            stopBlinkingInternal();
            stopPulsingInternal(false); // Stop pulsing immediately
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

            stopPulsingInternal(false); // Stop pulsing immediately
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
            stopBlinkingInternal();
            stopPulsingInternal(false); // Stop pulsing immediately

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
        ledHandler.post(() -> {
            stopBlinkingInternal();
            setLedStateInternal(false);
            Log.d(TAG, "LED blinking stopped");
        });
    }
    
    /**
     * Get current LED state
     * @return true if LED is on (or blinking/pulsing), false if off
     */
    public boolean isLedOn() {
        return isLedOn || isBlinking || isPulsing || currentPulsePhase != PulsePhase.OFF;
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
     * Internal method to set brightness without stopping other animations.
     * Used by the pulse animation to smoothly adjust brightness.
     */
    private void setBrightnessInternal(int percent) {
        int clampedPercent = Math.max(0, Math.min(100, percent));
        try {
            DevApi.setLedCustomBright(clampedPercent, 0);
            currentBrightness = clampedPercent;
            isLedOn = (clampedPercent > 0);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to set LED brightness - libxydev.so not loaded", e);
            isInitialized = false;
        } catch (Exception e) {
            Log.e(TAG, "Failed to set LED brightness", e);
        }
    }

    /**
     * Start pulsing the LED with a smooth fade-in, oscillation, and eventual fade-out.
     * This creates a gentle "breathing" effect suitable for recording indicators.
     *
     * Animation sequence:
     * 1. Fade in: 0% → 60% over 500ms
     * 2. Pulse: Oscillate between 30% and 60% continuously
     * 3. Fade out (on stop): Current brightness → 0% over 500ms
     */
    public void startPulsing() {
        if (!isInitialized) {
            Log.w(TAG, "LED controller not initialized, attempting to initialize...");
            initializeLed();
        }

        ledHandler.post(() -> {
            // Stop any existing animations
            stopBlinkingInternal();
            stopPulsingInternal(false); // Don't fade out, just stop

            isPulsing = true;
            currentPulsePhase = PulsePhase.FADE_IN;
            pulsePhaseStartTime = System.currentTimeMillis();
            pulseDirectionUp = true;

            Log.d(TAG, "LED pulsing started (fade-in → oscillate)");
            ledHandler.post(pulseRunnable);
        });
    }

    /**
     * Stop pulsing the LED with a smooth fade-out.
     * The LED will gracefully fade to off over ~500ms.
     */
    public void stopPulsing() {
        ledHandler.post(() -> {
            if (!isPulsing && currentPulsePhase == PulsePhase.OFF) {
                Log.d(TAG, "LED not pulsing, nothing to stop");
                return;
            }
            stopPulsingInternal(true); // Fade out gracefully
        });
    }

    /**
     * Stop pulsing the LED with a smooth fade-out and execute callback when complete.
     * @param onComplete Callback to execute after fade-out completes
     */
    public void stopPulsing(Runnable onComplete) {
        ledHandler.post(() -> {
            if (!isPulsing && currentPulsePhase == PulsePhase.OFF) {
                Log.d(TAG, "LED not pulsing, executing callback immediately");
                if (onComplete != null) {
                    onComplete.run();
                }
                return;
            }
            onFadeOutComplete = onComplete;
            stopPulsingInternal(true); // Fade out gracefully
        });
    }

    /**
     * Internal method to stop pulsing
     * @param fadeOut Whether to fade out gracefully or stop immediately
     */
    private void stopPulsingInternal(boolean fadeOut) {
        if (fadeOut && (isPulsing || currentPulsePhase != PulsePhase.OFF)) {
            // Transition to fade-out phase
            fadeOutStartBrightness = currentBrightness > 0 ? currentBrightness : PULSE_MAX_BRIGHTNESS;
            currentPulsePhase = PulsePhase.FADE_OUT;
            pulsePhaseStartTime = System.currentTimeMillis();
            Log.d(TAG, "LED pulse: starting fade-out from " + fadeOutStartBrightness + "%");
            // The pulseRunnable will handle the fade-out
            ledHandler.removeCallbacks(pulseRunnable);
            ledHandler.post(pulseRunnable);
        } else {
            // Stop immediately
            isPulsing = false;
            currentPulsePhase = PulsePhase.OFF;
            ledHandler.removeCallbacks(pulseRunnable);
            onFadeOutComplete = null; // Clear any pending callback
            setBrightnessInternal(0);
            setLedStateInternal(false);
            Log.d(TAG, "LED pulsing stopped immediately");
        }
    }

    /**
     * Internal method to stop blinking without removing all callbacks
     */
    private void stopBlinkingInternal() {
        isBlinking = false;
        ledHandler.removeCallbacks(blinkRunnable);
    }

    /**
     * Check if LED is currently pulsing
     * @return true if LED is in pulsing mode (any phase)
     */
    public boolean isPulsing() {
        return isPulsing || currentPulsePhase == PulsePhase.FADE_OUT;
    }

    /**
     * Clean up resources when no longer needed
     */
    public void shutdown() {
        Log.d(TAG, "Shutting down LED controller");
        ledHandler.post(() -> {
            stopBlinkingInternal();
            stopPulsingInternal(false);
            setLedStateInternal(false);
        });
        ledHandlerThread.quitSafely();
        instance = null;
    }
}