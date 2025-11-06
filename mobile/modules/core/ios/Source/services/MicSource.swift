import Foundation

/**
 * Microphone source options for MentraOS
 * Defines which microphone input to use and fallback behavior
 */
enum MicSource: String, CaseIterable {
    /**
     * Automatic mode - selects best mic source based on glasses capabilities
     * - G1: Phone internal mic with fallback to G1's custom LC3 mic
     * - Z100: Phone internal mic only (pauses on conflict)
     * - Mentra Live: Phone internal mic with fallback to glasses custom LC3 mic
     */
    case automatic

    /**
     * Phone's internal microphone
     * Fallback chain: Phone internal mic → Glasses custom mic (if available)
     */
    case phoneInternal = "phone_internal"

    /**
     * Glasses' custom BLE/LC3 microphone
     * No fallbacks - always uses glasses custom mic
     * Not available for glasses without custom mics (Z100, Mach1, etc.)
     */
    case glassesCustom = "glasses_custom"

    /**
     * External Bluetooth Classic HFP microphone (for lapel mics)
     * Fallback chain: Bluetooth Classic mic → Phone internal mic → Glasses custom mic (if available)
     * Activates Bluetooth audio routing
     * Intended for Deaf/HoH users with external lapel mics
     */
    case bluetoothClassic = "bluetooth_classic"

    /**
     * Parse string value to MicSource enum
     */
    static func fromString(_ value: String) -> MicSource {
        let normalized = value.lowercased()

        switch normalized {
        case "automatic":
            return .automatic
        case "phone_internal":
            return .phoneInternal
        case "glasses_custom":
            return .glassesCustom
        case "bluetooth_classic":
            return .bluetoothClassic
        default:
            // Unknown mic source, default to automatic
            return .automatic
        }
    }

    /**
     * Convert MicSource enum to string value for storage/transmission
     */
    func toString() -> String {
        return rawValue
    }
}
