package com.mentra.core.services

/**
 * Microphone source options for MentraOS
 * Defines which microphone input to use and fallback behavior
 */
enum class MicSource {
    /**
     * Automatic mode - selects best mic source based on glasses capabilities
     * - G1: Phone internal mic with fallback to G1's custom LC3 mic
     * - Z100: Phone internal mic only (pauses on conflict)
     * - Mentra Live: Phone internal mic with fallback to glasses custom LC3 mic
     */
    AUTOMATIC,

    /**
     * Phone's internal microphone
     * Fallback chain: Phone internal mic → Glasses custom mic (if available)
     */
    PHONE_INTERNAL,

    /**
     * Glasses' custom BLE/LC3 microphone
     * No fallbacks - always uses glasses custom mic
     * Not available for glasses without custom mics (Z100, Mach1, etc.)
     */
    GLASSES_CUSTOM,

    /**
     * External Bluetooth Classic HFP microphone (for lapel mics)
     * Fallback chain: Bluetooth Classic mic → Phone internal mic → Glasses custom mic (if available)
     * Activates SCO - degrades audio output to mono 16kHz
     * Intended for Deaf/HoH users with external lapel mics
     */
    BLUETOOTH_CLASSIC;

    companion object {
        /**
         * Parse string value to MicSource enum
         */
        fun fromString(value: String): MicSource {
            return when (value.lowercase()) {
                "automatic" -> AUTOMATIC
                "phone_internal" -> PHONE_INTERNAL
                "glasses_custom" -> GLASSES_CUSTOM
                "bluetooth_classic" -> BLUETOOTH_CLASSIC
                else -> {
                    com.mentra.core.Bridge.log("MIC: Unknown mic source '$value', defaulting to AUTOMATIC")
                    AUTOMATIC
                }
            }
        }

        /**
         * Convert MicSource enum to string value for storage/transmission
         */
        fun toString(source: MicSource): String {
            return when (source) {
                AUTOMATIC -> "automatic"
                PHONE_INTERNAL -> "phone_internal"
                GLASSES_CUSTOM -> "glasses_custom"
                BLUETOOTH_CLASSIC -> "bluetooth_classic"
            }
        }
    }
}
