import AVFoundation
import Foundation

/**
 * Configuration for microphone source
 * Defines which hardware to use and fallback behavior
 */
struct MicConfig {
    let source: MicSource
    let useBLEMic: Bool
    let usePhoneMic: Bool
    let activateBluetooth: Bool
    let audioSessionCategory: AVAudioSession.Category
    let audioSessionMode: AVAudioSession.Mode
    let audioSessionOptions: AVAudioSession.CategoryOptions
    let canFallbackToGlasses: Bool
    let canFallbackToPhone: Bool
}

/**
 * Manager for microphone source configuration
 * Handles mic source resolution, configuration, and fallback logic
 */
class MicSourceManager {
    /**
     * Get configuration for a specific mic source
     * Returns MicConfig with all settings for that source
     */
    func getMicConfig(_ selectedSource: MicSource) -> MicConfig {
        let glassesHasMic = CoreManager.shared.sgc?.hasMic ?? false

        switch selectedSource {
        case .automatic:
            let resolvedSource = resolveAutomaticSource()
            Bridge.log("MIC: AUTOMATIC resolved to \(resolvedSource)")
            return getMicConfig(resolvedSource)

        case .phoneInternal:
            return MicConfig(
                source: selectedSource,
                useBLEMic: false,
                usePhoneMic: true,
                activateBluetooth: false,
                audioSessionCategory: .record,
                audioSessionMode: .default,
                audioSessionOptions: [.allowBluetooth],
                canFallbackToGlasses: glassesHasMic, // Can fallback if glasses has mic
                canFallbackToPhone: false // Already on phone
            )

        case .glassesCustom:
            if !glassesHasMic {
                // Z100 case - no glasses mic available
                Bridge.log("MIC: Glasses custom mic not available for this model, falling back to phone")
                // Should be prevented in UI, but handle gracefully
                return getMicConfig(.phoneInternal)
            }

            return MicConfig(
                source: selectedSource,
                useBLEMic: true,
                usePhoneMic: false,
                activateBluetooth: false,
                audioSessionCategory: .playAndRecord,
                audioSessionMode: .default,
                audioSessionOptions: [.allowBluetooth, .defaultToSpeaker],
                canFallbackToGlasses: false, // Already on glasses
                canFallbackToPhone: false // Glasses-only mode
            )

        case .bluetoothClassic:
            return MicConfig(
                source: selectedSource,
                useBLEMic: false,
                usePhoneMic: false, // Start with BT, will fallback to phone if needed
                activateBluetooth: true,
                audioSessionCategory: .playAndRecord,
                audioSessionMode: .voiceChat,
                audioSessionOptions: [.allowBluetooth, .allowBluetoothA2DP],
                canFallbackToGlasses: glassesHasMic, // Ultimate fallback if glasses has mic
                canFallbackToPhone: true // Fallback to phone if BT fails
            )
        }
    }

    /**
     * Resolve "Automatic" to actual mic source based on current glasses
     * Uses device type to determine best default mic
     */
    private func resolveAutomaticSource() -> MicSource {
        guard let sgc = CoreManager.shared.sgc else {
            return .phoneInternal
        }

        let deviceType = sgc.type

        switch deviceType {
        case DeviceTypes.LIVE:
            // Mentra Live: Has custom mic, but defaulting to phone for now
            // Once mic quality is improved, can change back to glassesCustom
            return .phoneInternal

        case DeviceTypes.G1:
            // G1: Has custom mic but poor quality, prefer phone with fallback
            return .phoneInternal

        case DeviceTypes.Z100:
            // Z100: No custom mic, phone only
            return .phoneInternal

        default:
            // Unknown glasses type - default to safe option
            Bridge.log("MIC: Unknown glasses type: \(deviceType), defaulting to phoneInternal")
            return .phoneInternal
        }
    }

    /**
     * Get currently selected mic source from preferences
     * Defaults to automatic if not set
     */
    func getCurrentMicSource() -> MicSource {
        let preferredMic = CoreManager.shared.preferredMic
        return MicSource.fromString(preferredMic)
    }

    /**
     * Get human-readable description of a mic source
     * Useful for debugging and logging
     */
    func getMicSourceDescription(_ source: MicSource) -> String {
        let deviceType = CoreManager.shared.sgc?.type ?? "Unknown"

        switch source {
        case .automatic:
            return "Automatic (\(deviceType) default)"
        case .phoneInternal:
            return "Phone internal microphone"
        case .glassesCustom:
            return "Glasses custom microphone"
        case .bluetoothClassic:
            return "Bluetooth Classic microphone"
        }
    }
}
