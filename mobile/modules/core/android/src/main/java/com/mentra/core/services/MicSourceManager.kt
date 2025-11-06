package com.mentra.core.services

import android.content.Context
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import com.mentra.core.Bridge
import com.mentra.core.CoreManager
import com.mentra.core.utils.DeviceTypes

/**
 * Manages microphone source selection and configuration for MentraOS
 * Handles automatic resolution, fallback chains, and per-glasses defaults
 */
class MicSourceManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("mic_prefs", Context.MODE_PRIVATE)

    /**
     * Microphone configuration
     * Contains all necessary settings for audio recording
     */
    data class MicConfig(
        val source: MicSource,
        val useBLEMic: Boolean,              // Use glasses LC3 mic over GATT
        val usePhoneMic: Boolean,            // Use phone AudioRecord
        val activateSCO: Boolean,            // Activate Bluetooth SCO for HFP
        val audioMode: Int,                  // AudioManager mode
        val audioSource: Int,                // MediaRecorder audio source (-1 if using BLE mic)
        val focusGain: Int,                  // AudioFocus gain type
        val canFallbackToGlasses: Boolean,   // Can fallback to glasses mic
        val canFallbackToPhone: Boolean      // Can fallback to phone mic
    )

    /**
     * Get microphone configuration for the selected source
     * Handles automatic resolution and determines fallback capabilities
     */
    fun getMicConfig(selectedSource: MicSource): MicConfig {
        val glassesHasMic = CoreManager.getInstance().sgc?.hasMic ?: false

        return when (selectedSource) {
            MicSource.AUTOMATIC -> {
                // Resolve based on current glasses type
                val resolvedSource = resolveAutomaticSource()
                Bridge.log("MIC: AUTOMATIC resolved to $resolvedSource")
                getMicConfig(resolvedSource)
            }

            MicSource.PHONE_INTERNAL -> MicConfig(
                source = selectedSource,
                useBLEMic = false,
                usePhoneMic = true,
                activateSCO = false,
                audioMode = AudioManager.MODE_NORMAL,
                audioSource = if (isSamsungDevice()) {
                    MediaRecorder.AudioSource.VOICE_RECOGNITION
                } else {
                    MediaRecorder.AudioSource.MIC
                },
                focusGain = AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
                canFallbackToGlasses = glassesHasMic,  // Can fallback if glasses has mic
                canFallbackToPhone = false             // Already on phone
            )

            MicSource.GLASSES_CUSTOM -> {
                if (!glassesHasMic) {
                    // Z100 case - no glasses mic available
                    Bridge.log("MIC: Glasses custom mic not available for this model, falling back to phone")
                    // Should be prevented in UI, but handle gracefully
                    return getMicConfig(MicSource.PHONE_INTERNAL)
                }

                MicConfig(
                    source = selectedSource,
                    useBLEMic = true,
                    usePhoneMic = false,
                    activateSCO = false,
                    audioMode = AudioManager.MODE_NORMAL,
                    audioSource = -1, // N/A - using BLE custom mic
                    focusGain = AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
                    canFallbackToGlasses = false,  // Already on glasses
                    canFallbackToPhone = false     // Glasses-only mode
                )
            }

            MicSource.BLUETOOTH_CLASSIC -> MicConfig(
                source = selectedSource,
                useBLEMic = false,
                usePhoneMic = false,  // Start with BT, will fallback to phone if needed
                activateSCO = true,   // Try to activate SCO for HFP
                audioMode = AudioManager.MODE_IN_COMMUNICATION,
                audioSource = MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                focusGain = AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
                canFallbackToGlasses = glassesHasMic,  // Ultimate fallback if glasses has mic
                canFallbackToPhone = true              // Immediate fallback if no BT device
            )
        }
    }

    /**
     * Resolve "Automatic" to actual mic source based on current glasses
     * Uses device type to determine best default mic
     */
    private fun resolveAutomaticSource(): MicSource {
        val sgc = CoreManager.getInstance().sgc
        val deviceType = sgc?.type ?: return MicSource.PHONE_INTERNAL

        return when (deviceType) {
            DeviceTypes.LIVE -> {
                // Mentra Live: Has custom mic, but defaulting to phone for now
                // Once mic quality is improved, can change back to GLASSES_CUSTOM
                MicSource.PHONE_INTERNAL
            }
            DeviceTypes.G1 -> {
                // G1: Has custom mic but poor quality, prefer phone with fallback
                MicSource.PHONE_INTERNAL
            }
            DeviceTypes.Z100 -> {
                // Z100: No custom mic, phone only
                MicSource.PHONE_INTERNAL
            }
            else -> {
                // Unknown glasses type - default to safe option
                Bridge.log("MIC: Unknown glasses type: $deviceType, defaulting to PHONE_INTERNAL")
                MicSource.PHONE_INTERNAL
            }
        }
    }

    /**
     * Get currently selected mic source from preferences
     * Defaults to AUTOMATIC if not set
     */
    fun getCurrentMicSource(): MicSource {
        val stored = prefs.getString("mic_source_override", "automatic") ?: "automatic"
        return MicSource.fromString(stored)
    }

    /**
     * Set mic source override (user manual selection)
     * Stores the selection in preferences
     */
    fun setMicSourceOverride(source: MicSource) {
        val value = MicSource.toString(source)
        prefs.edit().putString("mic_source_override", value).apply()
        Bridge.log("MIC: Set mic source override to $value")
    }

    /**
     * Clear mic source override
     * Reverts to AUTOMATIC mode
     */
    fun clearMicSourceOverride() {
        prefs.edit().remove("mic_source_override").apply()
        Bridge.log("MIC: Cleared mic source override, reverting to AUTOMATIC")
    }

    /**
     * Check if current device is Samsung
     * Samsung devices work better with VOICE_RECOGNITION audio source
     */
    private fun isSamsungDevice(): Boolean {
        return Build.MANUFACTURER.equals("samsung", ignoreCase = true)
    }

    /**
     * Get human-readable description of current mic source
     */
    fun getMicSourceDescription(source: MicSource): String {
        val sgc = CoreManager.getInstance().sgc
        val deviceType = sgc?.type ?: "Unknown"

        return when (source) {
            MicSource.AUTOMATIC -> "Automatic ($deviceType default)"
            MicSource.PHONE_INTERNAL -> "Phone internal microphone"
            MicSource.GLASSES_CUSTOM -> "Glasses custom microphone"
            MicSource.BLUETOOTH_CLASSIC -> "Bluetooth Classic microphone"
        }
    }
}
