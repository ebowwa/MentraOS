import AVFoundation
import Combine
import Foundation
import LiveKit
@preconcurrency
internal import LiveKitWebRTC

@objc
public class LiveKitManager: NSObject {
    // MARK: - Singleton

    @objc public static let shared = LiveKitManager()

    // MARK: - Properties

    private let room: Room
    private var cancellables = Set<AnyCancellable>()
    private var audioTrack: LocalAudioTrack?

    public var enabled = false

    // MARK: - Initialization

    override private init() {
        room = Room()
        super.init()

        do {
            LiveKit.AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
//                        try LiveKit.AudioManager.shared.setManualRenderingMode(true)
//            LiveKit.AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = true
//            try LiveKit.AudioManager.shared.setManualRenderingMode(false)
        } catch {
            Core.log("Error setting manual rendering mode")
        }
    }

    // MARK: - Public Methods

    /// Connect to LiveKit room with provided URL and token
    /// - Parameters:
    ///   - url: WebSocket URL for LiveKit server
    ///   - token: Authentication token for the room
    @objc public func connect(
        url: String,
        token: String
    ) {
        // Prevent multiple simultaneous connection attempts
        guard room.connectionState == .disconnected else {
            Core.log("LiveKit: Already connected or connecting")
            return
        }

        Task {
            do {
                Core.log("LiveKit: Attempting to connect to: \(url)")

                // Create connect options
                let connectOptions = ConnectOptions(
                    enableMicrophone: false
                )

                let roomOptions = RoomOptions(
                    defaultAudioCaptureOptions: AudioCaptureOptions(),
                    suspendLocalVideoTracksInBackground: false
                )

                // Connect to the room
                try await room.connect(
                    url: url,
                    token: token,
                    connectOptions: connectOptions,
                    roomOptions: roomOptions
                )
                enabled = true

                // Setup custom audio source for PCM input
                try await setupCustomAudioTrack()
                Core.log("LiveKit: trackCount: \(room.localParticipant.localAudioTracks.count)")
                //              Core.log("LiveKit: a: \(room.)")
                //              room.localParticipant.publish(audioTrack: room.localParticipant.publish(data: ))

                Core.log("LiveKit: Successfully connected to LiveKit room")

            } catch {
                Core.log("LiveKit: Failed to connect: \(error.localizedDescription)")
            }
        }
    }

    /// Setup custom audio track for PCM input
    private func setupCustomAudioTrack() async throws {
//        // Create the buffer injector
//        bufferInjector = BufferInjector()
//
//        // Set it as the audio processing delegate
        ////      LiveKit.AudioManager.shared.capturePostProcessingDelegate = SineWaveGenerator()
//        LiveKit.AudioManager.shared.capturePostProcessingDelegate = bufferInjector
//
        // Create track options
        let captureOptions = AudioCaptureOptions(
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false,
            typingNoiseDetection: false
        )

        // Create the audio track
        audioTrack = LocalAudioTrack.createTrack(
            name: "pcm-audio",
            options: captureOptions
        )

        // Publish the track
        let publishOptions = AudioPublishOptions(
            dtx: false // Disable DTX for continuous audio
        )

        try await room.localParticipant.publish(
            audioTrack: audioTrack!,
            options: publishOptions
        )

        Core.log("LiveKit: Custom audio track setup complete")
    }

    /// Convert raw PCM data to AVAudioPCMBuffer
    private func dataToPCMBuffer(data: Data) -> AVAudioPCMBuffer? {
        // Create format for 16kHz, mono, 16-bit PCM
        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        ) else {
            Core.log("LiveKit: Failed to create audio format")
            return nil
        }

        let frameCapacity = UInt32(data.count) / format.streamDescription.pointee.mBytesPerFrame

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCapacity) else {
            Core.log("LiveKit: Failed to create PCM buffer")
            return nil
        }

        buffer.frameLength = frameCapacity

        // Copy data to buffer
        if let channelData = buffer.int16ChannelData {
            data.withUnsafeBytes { bytes in
                memcpy(channelData[0], bytes.baseAddress, data.count)
            }
        }

        return buffer
    }

    /// Add PCM audio data to be published
    /// - Parameter pcmData: Raw PCM audio data (16kHz, mono, 16-bit little endian)
    @objc public func addPcm(_ pcmData: Data) {
//      Task {
//          try await room.localParticipant.publish(data: pcmData)
//      }
//        guard let injector = bufferInjector else {
//            Core.log("LiveKit: Buffer injector not initialized")
//            return
//        }
//
        guard let buffer = dataToPCMBuffer(data: pcmData) else {
            Core.log("LiveKit: Failed to convert data to PCM buffer")
            return
        }

        Core.log("LiveKit: Adding PCM buffer with \(buffer.frameLength) frames")

        LiveKit.AudioManager.shared.mixer.capture(appAudio: buffer)
//
//        injector.addBuffer(buffer)
    }

    /// Disconnect from LiveKit room
    @objc public func disconnect() {
        guard room.connectionState == .connected ||
            room.connectionState == .connecting ||
            room.connectionState == .reconnecting
        else {
            Core.log("LiveKit: Not connected, nothing to disconnect")
            return
        }

        Task {
            Core.log("LiveKit: Disconnecting from LiveKit")

            // Clear references
            audioTrack = nil

            await room.disconnect()
            enabled = false
        }
    }
}
