package com.mentra.asg_client.camera;

import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
import android.util.Log;
import android.util.Range;

/**
 * Adaptive exposure controller that analyzes scene brightness and adjusts
 * exposure compensation to preserve highlights and recover shadows.
 *
 * Strategy:
 * - Monitors the camera's chosen ISO and exposure time
 * - When camera chooses very short exposure (bright scene) → decrease EC to preserve highlights
 * - When camera chooses very high ISO (dark scene) → increase EC to recover shadows
 * - Smoothly adjusts to avoid flicker during video
 *
 * Works in conjunction with tone mapping for maximum dynamic range recovery.
 */
public class AdaptiveExposureController {
    private static final String TAG = "AdaptiveExposure";

    // Singleton instance
    private static AdaptiveExposureController sInstance;

    // Enable/disable adaptive exposure
    private volatile boolean enabled = true;

    // Current adaptive adjustment (added to base exposure compensation)
    private volatile int adaptiveAdjustment = 0;

    // Base exposure compensation set by user
    private int baseExposureCompensation = -3;

    // Smoothing factor to prevent rapid changes (0-1, higher = more responsive)
    private float smoothingFactor = 0.3f;

    // Target exposure adjustment (before smoothing)
    private float targetAdjustment = 0f;

    // Thresholds for bright/dark scene detection
    // These are based on typical camera behavior

    // Exposure time thresholds (nanoseconds)
    // Very short exposure = very bright scene
    private static final long BRIGHT_EXPOSURE_THRESHOLD_NS = 2_000_000L;  // 2ms = 1/500s
    private static final long DARK_EXPOSURE_THRESHOLD_NS = 33_000_000L;   // 33ms = 1/30s

    // ISO thresholds
    // Very high ISO = dark scene, camera is struggling
    private static final int LOW_ISO_THRESHOLD = 200;
    private static final int HIGH_ISO_THRESHOLD = 1600;

    // Maximum adjustment range (in exposure compensation steps)
    private static final int MAX_BRIGHT_ADJUSTMENT = -4;  // Can go 4 steps darker
    private static final int MAX_DARK_ADJUSTMENT = 2;     // Can go 2 steps brighter

    // Callback for when adjustment changes
    public interface AdjustmentCallback {
        void onExposureAdjustmentChanged(int totalCompensation);
    }

    private AdjustmentCallback callback;

    private AdaptiveExposureController() {
        // Private constructor for singleton
    }

    public static synchronized AdaptiveExposureController getInstance() {
        if (sInstance == null) {
            sInstance = new AdaptiveExposureController();
        }
        return sInstance;
    }

    /**
     * Enable or disable adaptive exposure.
     */
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        if (!enabled) {
            adaptiveAdjustment = 0;
            targetAdjustment = 0;
        }
        Log.d(TAG, "Adaptive exposure enabled: " + enabled);
    }

    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Set the base exposure compensation (user's preference).
     */
    public void setBaseExposureCompensation(int base) {
        this.baseExposureCompensation = base;
        Log.d(TAG, "Base exposure compensation set to: " + base);
    }

    /**
     * Set callback for exposure adjustment changes.
     */
    public void setCallback(AdjustmentCallback callback) {
        this.callback = callback;
    }

    /**
     * Get the total exposure compensation (base + adaptive adjustment).
     */
    public int getTotalExposureCompensation() {
        return baseExposureCompensation + adaptiveAdjustment;
    }

    /**
     * Get just the adaptive adjustment portion.
     */
    public int getAdaptiveAdjustment() {
        return adaptiveAdjustment;
    }

    /**
     * Analyze a capture result and update the adaptive exposure.
     * Call this from the capture callback for continuous adjustment.
     *
     * @param result The capture result from Camera2
     * @param compensationRange The valid range for exposure compensation
     * @return true if adjustment changed and camera settings should be updated
     */
    public boolean analyzeCaptureResult(TotalCaptureResult result, Range<Integer> compensationRange) {
        if (!enabled) {
            return false;
        }

        // Get current camera-chosen values
        Integer iso = result.get(CaptureResult.SENSOR_SENSITIVITY);
        Long exposureTimeNs = result.get(CaptureResult.SENSOR_EXPOSURE_TIME);

        if (iso == null || exposureTimeNs == null) {
            return false;
        }

        // Calculate desired adjustment based on scene analysis
        float desiredAdjustment = analyzeScene(iso, exposureTimeNs);

        // Apply smoothing to prevent rapid changes
        targetAdjustment = targetAdjustment + smoothingFactor * (desiredAdjustment - targetAdjustment);

        // Round to integer steps
        int newAdjustment = Math.round(targetAdjustment);

        // Clamp to valid range
        if (compensationRange != null) {
            int totalMin = compensationRange.getLower() - baseExposureCompensation;
            int totalMax = compensationRange.getUpper() - baseExposureCompensation;
            newAdjustment = Math.max(totalMin, Math.min(totalMax, newAdjustment));
        }

        // Also clamp to our own limits
        newAdjustment = Math.max(MAX_BRIGHT_ADJUSTMENT, Math.min(MAX_DARK_ADJUSTMENT, newAdjustment));

        // Check if adjustment changed
        if (newAdjustment != adaptiveAdjustment) {
            int oldAdjustment = adaptiveAdjustment;
            adaptiveAdjustment = newAdjustment;

            Log.d(TAG, String.format("Adaptive exposure: ISO=%d, exp=%.1fms → adjustment %d→%d (total EC: %d)",
                    iso, exposureTimeNs / 1_000_000.0, oldAdjustment, newAdjustment,
                    getTotalExposureCompensation()));

            if (callback != null) {
                callback.onExposureAdjustmentChanged(getTotalExposureCompensation());
            }
            return true;
        }

        return false;
    }

    /**
     * Analyze ISO and exposure time to determine desired adjustment.
     */
    private float analyzeScene(int iso, long exposureTimeNs) {
        float adjustment = 0;

        // Bright scene detection: short exposure time AND low ISO
        // Camera is already limiting exposure, we should help by lowering EC
        if (exposureTimeNs < BRIGHT_EXPOSURE_THRESHOLD_NS && iso <= LOW_ISO_THRESHOLD) {
            // Very bright - go darker
            float brightnessRatio = (float) BRIGHT_EXPOSURE_THRESHOLD_NS / exposureTimeNs;
            adjustment = -Math.min(brightnessRatio, -MAX_BRIGHT_ADJUSTMENT);
            Log.v(TAG, "Bright scene detected: exposure=" + exposureTimeNs/1000000.0 + "ms, ISO=" + iso);
        }
        // Dark scene detection: long exposure time AND high ISO
        // Camera is maxing out, we should help by raising EC (if possible)
        else if (exposureTimeNs > DARK_EXPOSURE_THRESHOLD_NS && iso >= HIGH_ISO_THRESHOLD) {
            // Very dark - go brighter (but limited to avoid noise)
            float darknessRatio = (float) iso / HIGH_ISO_THRESHOLD;
            adjustment = Math.min(darknessRatio - 1, MAX_DARK_ADJUSTMENT);
            Log.v(TAG, "Dark scene detected: exposure=" + exposureTimeNs/1000000.0 + "ms, ISO=" + iso);
        }
        // Bright-ish scene: short exposure but higher ISO (mixed lighting)
        else if (exposureTimeNs < BRIGHT_EXPOSURE_THRESHOLD_NS * 2) {
            // Moderately bright
            adjustment = -1;
        }

        return adjustment;
    }

    /**
     * Reset adaptive adjustment (call when switching modes or starting new recording).
     */
    public void reset() {
        adaptiveAdjustment = 0;
        targetAdjustment = 0;
        Log.d(TAG, "Adaptive exposure reset");
    }

    /**
     * Set smoothing factor (0-1).
     * Higher values = faster response, lower values = smoother transitions.
     */
    public void setSmoothingFactor(float factor) {
        this.smoothingFactor = Math.max(0.05f, Math.min(1.0f, factor));
    }
}
