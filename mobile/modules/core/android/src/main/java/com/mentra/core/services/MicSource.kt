package com.mentra.core.services

/**
 * Microphone source options for MentraOS
 * Defines which microphone input to use and fallback behavior
 */
enum class MicSource {
    /**
     * Automatic mode - selects best mic source based on glasses capabilities
     * - G1: Phone mic with fallback to G1's custom LC3 mic
     * - Z100: Phone mic only (pauses on conflict)
     * - Mentra Live: Glasses LC3 mic only
     */
    AUTOMATIC,

    /**
     * Phone microphone with auto-switch to glasses mic on conflict
     * Fallback chain: Phone mic → Glasses mic (if available)
     */
    PHONE_AUTO_SWITCH,

    /**
     * Glasses' custom LC3 microphone only
     * No fallbacks - always uses glasses mic
     * Not available for Z100 (no onboard mic)
     */
    GLASSES_ONLY,

    /**
     * External Bluetooth HFP microphone (for lapel mics)
     * Fallback chain: Bluetooth mic → Phone mic → Glasses mic (if available)
     * Activates SCO - degrades audio output to mono 16kHz
     * Intended for Deaf/HoH users with external lapel mics
     */
    BLUETOOTH_MIC;

    companion object {
        /**
         * Parse string value to MicSource enum
         * Handles legacy values ("phone", "glasses") and new values
         */
        fun fromString(value: String): MicSource {
            return when (value.lowercase()) {
                "automatic" -> AUTOMATIC
                "phone_auto_switch", "phone" -> PHONE_AUTO_SWITCH
                "glasses_only", "glasses" -> GLASSES_ONLY
                "bluetooth_mic", "bluetooth" -> BLUETOOTH_MIC
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
                PHONE_AUTO_SWITCH -> "phone_auto_switch"
                GLASSES_ONLY -> "glasses_only"
                BLUETOOTH_MIC -> "bluetooth_mic"
            }
        }
    }
}
