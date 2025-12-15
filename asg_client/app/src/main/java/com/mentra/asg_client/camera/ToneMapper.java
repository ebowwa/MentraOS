package com.mentra.asg_client.camera;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.util.Log;

/**
 * CPU-based tone mapping for still images.
 *
 * Implements:
 * - Highlight rolloff: Compresses bright areas to prevent clipping
 * - Shadow lift: Boosts dark areas for better visibility
 *
 * Uses a pre-computed Look-Up Table (LUT) for performance.
 * The same algorithm as the GPU shader in ToneMappingShader.kt.
 */
public class ToneMapper {
    private static final String TAG = "ToneMapper";

    // Enable/disable tone mapping globally
    private static volatile boolean sEnabled = true;

    // Tone mapping parameters (aggressive settings for highlight protection + shadow recovery)
    private static volatile float sHighlightThreshold = 0.60f;  // Start compressing earlier
    private static volatile float sHighlightPower = 0.40f;      // Stronger compression
    private static volatile float sShadowThreshold = 0.35f;     // Lift more of the image
    private static volatile float sShadowLift = 0.15f;          // Stronger shadow lift

    // Pre-computed LUT for tone curve (256 entries for 8-bit luminance)
    private static float[] sLut = null;
    private static boolean sLutDirty = true;

    private ToneMapper() {
        // Static utility class
    }

    /**
     * Enable or disable tone mapping.
     */
    public static void setEnabled(boolean enabled) {
        sEnabled = enabled;
        Log.d(TAG, "Tone mapping enabled: " + enabled);
    }

    /**
     * Check if tone mapping is enabled.
     */
    public static boolean isEnabled() {
        return sEnabled;
    }

    /**
     * Set tone mapping parameters.
     *
     * @param highlightThreshold Luminance above this gets compressed (0-1, default 0.70)
     * @param highlightPower     Compression power for highlights (0-1, default 0.45)
     * @param shadowThreshold    Luminance below this gets boosted (0-1, default 0.25)
     * @param shadowLift         Amount to lift shadows (0-1, default 0.05)
     */
    public static void setParameters(float highlightThreshold, float highlightPower,
                                     float shadowThreshold, float shadowLift) {
        sHighlightThreshold = highlightThreshold;
        sHighlightPower = highlightPower;
        sShadowThreshold = shadowThreshold;
        sShadowLift = shadowLift;
        sLutDirty = true;
        Log.d(TAG, String.format("Tone mapping params: highlight=%.2f/%.2f, shadow=%.2f/%.2f",
                highlightThreshold, highlightPower, shadowThreshold, shadowLift));
    }

    /**
     * Get current highlight threshold.
     */
    public static float getHighlightThreshold() {
        return sHighlightThreshold;
    }

    /**
     * Get current highlight power.
     */
    public static float getHighlightPower() {
        return sHighlightPower;
    }

    /**
     * Get current shadow threshold.
     */
    public static float getShadowThreshold() {
        return sShadowThreshold;
    }

    /**
     * Get current shadow lift.
     */
    public static float getShadowLift() {
        return sShadowLift;
    }

    /**
     * Initialize/update the LUT if parameters changed.
     */
    private static synchronized void initializeLut() {
        if (sLut != null && !sLutDirty) {
            return;
        }

        sLut = new float[256];
        for (int i = 0; i < 256; i++) {
            float y = i / 255.0f;
            sLut[i] = applyToneCurve(y);
        }
        sLutDirty = false;
        Log.d(TAG, "Tone mapping LUT initialized");
    }

    /**
     * Apply the tone curve to a luminance value.
     * This is the same algorithm as the GPU shader.
     *
     * @param y Input luminance (0-1)
     * @return Output luminance (0-1)
     */
    private static float applyToneCurve(float y) {
        float newY = y;

        // 1. Highlight rolloff (compress above threshold)
        if (y > sHighlightThreshold) {
            float t = (y - sHighlightThreshold) / (1.0f - sHighlightThreshold);
            float compressed = (float) Math.pow(t, sHighlightPower);
            newY = sHighlightThreshold + (1.0f - sHighlightThreshold) * compressed;
        }

        // 2. Shadow lift (boost below threshold)
        if (y < sShadowThreshold) {
            float liftFactor = 1.0f - (y / sShadowThreshold);
            newY = newY + sShadowLift * liftFactor;
        }

        // Clamp to valid range
        return Math.max(0.0f, Math.min(1.0f, newY));
    }

    /**
     * Apply tone mapping to a bitmap.
     *
     * @param input The input bitmap (will be recycled if immutable)
     * @return Tone-mapped bitmap (may be same instance if mutable)
     */
    public static Bitmap apply(Bitmap input) {
        if (input == null) {
            return null;
        }

        if (!sEnabled) {
            return input;
        }

        long startTime = System.currentTimeMillis();

        // Initialize LUT if needed
        initializeLut();

        int width = input.getWidth();
        int height = input.getHeight();

        // Create mutable bitmap if needed
        Bitmap output;
        boolean needsRecycle = false;
        if (input.isMutable()) {
            output = input;
        } else {
            output = input.copy(Bitmap.Config.ARGB_8888, true);
            needsRecycle = true;
        }

        // Get all pixels
        int[] pixels = new int[width * height];
        output.getPixels(pixels, 0, width, 0, 0, width, height);

        // Apply tone mapping to each pixel
        for (int i = 0; i < pixels.length; i++) {
            int pixel = pixels[i];

            int a = Color.alpha(pixel);
            int r = Color.red(pixel);
            int g = Color.green(pixel);
            int b = Color.blue(pixel);

            // Calculate luminance (BT.601 coefficients, same as shader)
            float y = 0.299f * r + 0.587f * g + 0.114f * b;
            int yIndex = Math.min(255, Math.max(0, Math.round(y)));

            // Get new luminance from LUT
            float newY = sLut[yIndex] * 255.0f;

            // Apply ratio to RGB to preserve color
            float ratio = (y > 0.001f) ? (newY / y) : 1.0f;

            int newR = Math.min(255, Math.max(0, Math.round(r * ratio)));
            int newG = Math.min(255, Math.max(0, Math.round(g * ratio)));
            int newB = Math.min(255, Math.max(0, Math.round(b * ratio)));

            pixels[i] = Color.argb(a, newR, newG, newB);
        }

        // Write pixels back
        output.setPixels(pixels, 0, width, 0, 0, width, height);

        // Recycle input if we created a copy
        if (needsRecycle) {
            input.recycle();
        }

        long elapsed = System.currentTimeMillis() - startTime;
        Log.d(TAG, String.format("Tone mapping applied to %dx%d in %dms", width, height, elapsed));

        return output;
    }

    /**
     * Analyze an image and return statistics about its brightness distribution.
     * Useful for debugging and tuning.
     *
     * @param bitmap The bitmap to analyze
     * @return String with brightness statistics
     */
    public static String analyzeImage(Bitmap bitmap) {
        if (bitmap == null) {
            return "null bitmap";
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int totalPixels = width * height;

        // Sample pixels (don't process every pixel for performance)
        int sampleStep = Math.max(1, (int) Math.sqrt(totalPixels / 10000.0));

        int darkPixels = 0;      // < 25% luminance
        int midPixels = 0;       // 25-70% luminance
        int brightPixels = 0;    // > 70% luminance
        int clippedPixels = 0;   // > 95% luminance (likely clipped)
        float totalLuminance = 0;

        for (int y = 0; y < height; y += sampleStep) {
            for (int x = 0; x < width; x += sampleStep) {
                int pixel = bitmap.getPixel(x, y);
                int r = Color.red(pixel);
                int g = Color.green(pixel);
                int b = Color.blue(pixel);

                float lum = (0.299f * r + 0.587f * g + 0.114f * b) / 255.0f;
                totalLuminance += lum;

                if (lum < 0.25f) darkPixels++;
                else if (lum > 0.70f) brightPixels++;
                else midPixels++;

                if (lum > 0.95f) clippedPixels++;
            }
        }

        int sampledPixels = darkPixels + midPixels + brightPixels;
        float avgLuminance = totalLuminance / sampledPixels;

        return String.format("Image %dx%d: avg=%.2f, dark=%.1f%%, mid=%.1f%%, bright=%.1f%%, clipped=%.1f%%",
                width, height, avgLuminance,
                100.0f * darkPixels / sampledPixels,
                100.0f * midPixels / sampledPixels,
                100.0f * brightPixels / sampledPixels,
                100.0f * clippedPixels / sampledPixels);
    }
}
