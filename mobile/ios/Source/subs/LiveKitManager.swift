import AVFoundation
import Combine
import Foundation
import LiveKit
@preconcurrency internal import LiveKitWebRTC

@objc
public class LiveKitManager: NSObject {
    // MARK: - Singleton

    @objc public static let shared = LiveKitManager()

    // MARK: - Properties

    private let room: Room
    private var cancellables = Set<AnyCancellable>()
    private var audioTrack: LocalAudioTrack?
    private var counter = 0

    public var enabled = false

    // MARK: - Initialization

    override private init() {
        room = Room()
        super.init()

        room.add(delegate: self)

        do {
            //      LiveKit.AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
            try LiveKit.AudioManager.shared.setManualRenderingMode(true)
            //            LiveKit.AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = true
            //            try LiveKit.AudioManager.shared.setManualRenderingMode(false)
        } catch {
            Bridge.log("Error setting manual rendering mode")
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
            Bridge.log("LiveKit: Already connected or connecting")
            return
        }

        Task {
            do {
                Bridge.log("LiveKit: Attempting to connect to: \(url)")

                // Create connect options
                let connectOptions = ConnectOptions(
                    enableMicrophone: true
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
                // try await setupCustomAudioTrack()
                //                Bridge.log("LiveKit: trackCount: \(room.localParticipant.localAudioTracks.count)")
                //              Core.log("LiveKit: a: \(room.)")
                //              room.localParticipant.publish(audioTrack: room.localParticipant.publish(data: ))

                Bridge.log("LiveKit: Successfully connected to LiveKit room")

            } catch {
                Bridge.log("LiveKit: Failed to connect: \(error.localizedDescription)")
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

        Bridge.log("LiveKit: Custom audio track setup complete")
    }

    /// Convert raw PCM data to AVAudioPCMBuffer
    private func dataToPCMBuffer(data: Data) -> AVAudioPCMBuffer? {
        let format = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        )!

        let channelCount = Int(format.channelCount)
        let bytesPerSample = 2 // Int16 is 2 bytes
        let totalSamples = data.count / bytesPerSample
        let frameCount = totalSamples / channelCount

        // Create buffer with the calculated frame capacity
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frameCount)) else {
            Bridge.log("Error: Could not create PCM buffer")
            return nil
        }

        // Set the actual frame length
        buffer.frameLength = AVAudioFrameCount(frameCount)

        // Get int16 channel data pointer
        guard let int16Data = buffer.int16ChannelData else {
            Bridge.log("Error: Buffer does not support int16 data")
            return nil
        }

        // Convert Data to array of Int16 values
        data.withUnsafeBytes { bytes in
            let int16Pointer = bytes.bindMemory(to: Int16.self)

            // Write samples to each channel
            for frame in 0 ..< frameCount {
                for channel in 0 ..< channelCount {
                    let sampleIndex = frame * channelCount + channel
                    int16Data[channel][frame] = int16Pointer[sampleIndex]
                }
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
            Bridge.log("LiveKit: Failed to convert data to PCM buffer")
            return
        }

        counter += 1
        if counter % 50 == 0 {
            Bridge.log("LiveKit: Adding PCM buffer with \(buffer.frameLength) frames")
        }

        LiveKit.AudioManager.shared.mixer.capture(appAudio: buffer)
        //
        //        injector.addBuffer(buffer)
    }

    public func addPcm2(_ avBuffer: AVAudioPCMBuffer) {
        counter += 1
        if counter % 50 == 0 {
            Bridge.log("LiveKit: Adding PCM2 buffer with \(avBuffer.frameLength) frames")
        }

        LiveKit.AudioManager.shared.mixer.capture(appAudio: avBuffer)
    }

    /// Disconnect from LiveKit room
    @objc public func disconnect() {
        guard
            room.connectionState == .connected || room.connectionState == .connecting
            || room.connectionState == .reconnecting
        else {
            Bridge.log("LiveKit: Not connected, nothing to disconnect")
            return
        }

        Task {
            Bridge.log("LiveKit: Disconnecting from LiveKit")

            // Clear references
            audioTrack = nil

            await room.disconnect()
            enabled = false
        }
    }
}

extension LiveKitManager: RoomDelegate {
    public func room(
        _: Room, didUpdateConnectionState connectionState: ConnectionState,
        from _: ConnectionState
    ) {
        switch connectionState {
        case .disconnected:
            Bridge.log("LiveKit: Disconnected from room")
        case .connecting:
            Bridge.log("LiveKit: Connecting to room...")
        case .connected:
            Bridge.log("LiveKit: Connected to room")
        case .reconnecting:
            Bridge.log("LiveKit: Reconnecting to room...")
        }
    }
}
