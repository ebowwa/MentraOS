package com.mentra.asg_client.camera;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.util.Log;

/**
 * Tone mapping utility for improving dynamic range perception in photos.
 *
 * Since the MTK8766 ISP doesn't support DOL-HDR or effective Local Tone Mapping (LTM),
 * this class provides post-capture tone mapping to:
 * - Compress highlights (reduce blown-out skies, screens, windows)
 * - Lift shadows (recover detail in dark areas)
 * - Apply a mild global tone curve for better contrast
 *
 * This creates a "fake HDR" effect that significantly improves perceived dynamic range
 * without requiring hardware HDR support.
 */
public class ToneMapper {
    private static final String TAG = "ToneMapper";

    // Tone mapping parameters - these can be tuned for best results
    // Highlight rolloff: compress luminance above this threshold
    private static final float HIGHLIGHT_THRESHOLD = 0.70f;
    // Highlight rolloff power: lower = more aggressive compression
    private static final float HIGHLIGHT_POWER = 0.45f;

    // Shadow lift: boost luminance below this threshold
    private static final float SHADOW_THRESHOLD = 0.25f;
    // Shadow lift amount: how much to boost shadows (0.0 - 0.1 typical)
    private static final float SHADOW_LIFT_AMOUNT = 0.05f;

    // Pre-computed LUT for faster processing (256 entries for 8-bit luma)
    private static final int[] TONE_LUT = new int[256];
    private static boolean lutInitialized = false;

    /**
     * Initialize the tone mapping LUT for faster processing.
     * Called lazily on first use.
     */
    private static synchronized void initializeLut() {
        if (lutInitialized) return;

        long startTime = System.currentTimeMillis();

        for (int i = 0; i < 256; i++) {
            float y = i / 255.0f;
            float newY = applyToneCurve(y);
            TONE_LUT[i] = Math.round(newY * 255.0f);
            // Clamp to valid range
            if (TONE_LUT[i] < 0) TONE_LUT[i] = 0;
            if (TONE_LUT[i] > 255) TONE_LUT[i] = 255;
        }

        lutInitialized = true;
        Log.d(TAG, "Tone mapping LUT initialized in " + (System.currentTimeMillis() - startTime) + "ms");
    }

    /**
     * Apply the tone curve to a single luminance value.
     *
     * @param y Input luminance (0.0 - 1.0)
     * @return Output luminance (0.0 - 1.0)
     */
    private static float applyToneCurve(float y) {
        float newY = y;

        // 1. Highlight rolloff (compress above threshold)
        // This prevents skies, screens, and bright areas from blowing out
        if (y > HIGHLIGHT_THRESHOLD) {
            float t = (y - HIGHLIGHT_THRESHOLD) / (1.0f - HIGHLIGHT_THRESHOLD);
            float compressed = (float) Math.pow(t, HIGHLIGHT_POWER);
            newY = HIGHLIGHT_THRESHOLD + (1.0f - HIGHLIGHT_THRESHOLD) * compressed;
        }

        // 2. Shadow lift (boost below threshold)
        // This recovers detail in dark areas without affecting midtones
        if (y < SHADOW_THRESHOLD) {
            // Gradual lift that tapers off toward the threshold
            float liftFactor = 1.0f - (y / SHADOW_THRESHOLD);
            newY = y + SHADOW_LIFT_AMOUNT * liftFactor;
        }

        // Clamp result to valid range
        if (newY < 0.0f) newY = 0.0f;
        if (newY > 1.0f) newY = 1.0f;

        return newY;
    }

    /**
     * Apply tone mapping to a Bitmap.
     * This modifies the bitmap in-place for efficiency if it's mutable,
     * otherwise creates a new bitmap.
     *
     * The algorithm:
     * 1. For each pixel, compute luminance (Y = 0.299R + 0.587G + 0.114B)
     * 2. Apply tone curve to luminance (highlight rolloff + shadow lift)
     * 3. Scale RGB by the luminance ratio to preserve color
     *
     * @param input The input bitmap
     * @return The tone-mapped bitmap (may be the same object if mutable)
     */
    public static Bitmap apply(Bitmap input) {
        if (input == null) {
            Log.e(TAG, "Input bitmap is null");
            return null;
        }

        // Initialize LUT if needed
        initializeLut();

        long startTime = System.currentTimeMillis();

        int width = input.getWidth();
        int height = input.getHeight();
        int pixelCount = width * height;

        Log.d(TAG, "Applying tone mapping to " + width + "x" + height + " image (" + pixelCount + " pixels)");

        // Get all pixels at once for efficiency
        int[] pixels = new int[pixelCount];
        input.getPixels(pixels, 0, width, 0, 0, width, height);

        // Process each pixel
        for (int i = 0; i < pixelCount; i++) {
            int pixel = pixels[i];

            // Extract RGB components
            int r = Color.red(pixel);
            int g = Color.green(pixel);
            int b = Color.blue(pixel);
            int a = Color.alpha(pixel);

            // Compute luminance (standard BT.601 coefficients)
            // Y = 0.299R + 0.587G + 0.114B
            float y = (0.299f * r + 0.587f * g + 0.114f * b);

            // Get the tone-mapped luminance from LUT
            int yInt = (int) y;
            if (yInt < 0) yInt = 0;
            if (yInt > 255) yInt = 255;
            float newY = TONE_LUT[yInt];

            // Compute the ratio to scale RGB (preserve color)
            // Add small epsilon to avoid division by zero
            float ratio = (y > 0.001f) ? (newY / y) : 1.0f;

            // Scale RGB by ratio
            int newR = Math.round(r * ratio);
            int newG = Math.round(g * ratio);
            int newB = Math.round(b * ratio);

            // Clamp to valid range
            if (newR < 0) newR = 0; if (newR > 255) newR = 255;
            if (newG < 0) newG = 0; if (newG > 255) newG = 255;
            if (newB < 0) newB = 0; if (newB > 255) newB = 255;

            // Reconstruct pixel
            pixels[i] = Color.argb(a, newR, newG, newB);
        }

        // Create output bitmap
        Bitmap output;
        if (input.isMutable()) {
            output = input;
        } else {
            output = input.copy(Bitmap.Config.ARGB_8888, true);
            if (output == null) {
                Log.e(TAG, "Failed to create mutable copy of bitmap");
                return input;
            }
            // Recycle the original immutable bitmap to avoid memory leak
            input.recycle();
        }

        // Write processed pixels back
        output.setPixels(pixels, 0, width, 0, 0, width, height);

        long duration = System.currentTimeMillis() - startTime;
        Log.d(TAG, "Tone mapping completed in " + duration + "ms");

        return output;
    }

    /**
     * Check if tone mapping is enabled.
     * This can be controlled via AsgSettings.
     *
     * @return true if tone mapping should be applied
     */
    public static boolean isEnabled() {
        // For now, always enabled. Can be connected to AsgSettings later.
        return true;
    }
}
