import AVFoundation
import Combine
import Foundation
import LiveKit
@preconcurrency
import LiveKitWebRTC

class BufferInjector: AudioCustomProcessingDelegate {
    private var pendingBuffers: [AVAudioPCMBuffer] = []
    private var currentBuffer: AVAudioPCMBuffer?
    private var currentPosition = 0
    private let queue = DispatchQueue(label: "audio.buffer.injector")
    private var targetSampleRate: Double = 16000
    private var targetChannels: Int = 1

    func addBuffer(_ buffer: AVAudioPCMBuffer) {
        queue.async { [weak self] in
            self?.pendingBuffers.append(buffer)
        }
    }

    func audioProcessingInitialize(sampleRate: Int, channels: Int) {
        targetSampleRate = Double(sampleRate)
        targetChannels = channels
        Core.log("BufferInjector: Initialized with sampleRate: \(sampleRate), channels: \(channels)")
    }

    func audioProcessingProcess(audioBuffer: LKAudioBuffer) {
        Core.log("processing audio buffer with \(audioBuffer.frames) frames")

        // audioBuffer.
        // queue.sync { [weak self] in
        //   guard let self = self else { return }

        //   let framesToFill = audioBuffer.frames
        //   var framesWritten = 0

        //   // Fill the audio buffer with our data
        //   while framesWritten < framesToFill {
        //     // Get current buffer or fetch next one
        //     if currentBuffer == nil || currentPosition >= Int(currentBuffer!.frameLength) {
        //       currentPosition = 0
        //       currentBuffer = pendingBuffers.isEmpty ? nil : pendingBuffers.removeFirst()
        //     }

        //     guard let buffer = currentBuffer else {
        //       // No data available, fill with silence
        //       for channel in 0..<audioBuffer.channels {
        //         let channelData = audioBuffer.rawBuffer(forChannel: channel)
        //         for i in framesWritten..<framesToFill {
        //           channelData[i] = 0
        //         }
        //       }
        //       break
        //     }

        //     // Resample if needed
        //     let sourceBuffer: AVAudioPCMBuffer
        //     if buffer.format.sampleRate != targetSampleRate {
        //       sourceBuffer = buffer.resample(toSampleRate: targetSampleRate) ?? buffer
        //     } else {
        //       sourceBuffer = buffer
        //     }

        //     // Convert to float32 if needed
        //     let floatBuffer: AVAudioPCMBuffer
        //     if sourceBuffer.format.commonFormat != .pcmFormatFloat32 {
        //       floatBuffer = sourceBuffer.convert(toCommonFormat: .pcmFormatFloat32) ?? sourceBuffer
        //     } else {
        //       floatBuffer = sourceBuffer
        //     }

        //     // Calculate how many frames we can copy
        //     let availableFrames = Int(floatBuffer.frameLength) - currentPosition
        //     let framesToCopy = min(availableFrames, framesToFill - framesWritten)

        //     // Copy audio data to output buffer
        //     if let sourceChannelData = floatBuffer.floatChannelData {
        //       for channel in 0..<min(audioBuffer.channels, Int(floatBuffer.format.channelCount)) {
        //         let destData = audioBuffer.rawBuffer(forChannel: channel)
        //         let sourceData = sourceChannelData[channel]

        //         for i in 0..<framesToCopy {
        //           destData[framesWritten + i] = sourceData[currentPosition + i]
        //         }
        //       }

        //       // If source is mono and dest is stereo, copy to both channels
        //       if floatBuffer.format.channelCount == 1 && audioBuffer.channels > 1 {
        //         let sourceData = sourceChannelData[0]
        //         for channel in 1..<audioBuffer.channels {
        //           let destData = audioBuffer.rawBuffer(forChannel: channel)
        //           for i in 0..<framesToCopy {
        //             destData[framesWritten + i] = sourceData[currentPosition + i]
        //           }
        //         }
        //       }
        //     }

        //     currentPosition += framesToCopy
        //     framesWritten += framesToCopy
        //   }
        // }
    }

    func audioProcessingRelease() {
        queue.sync {
            pendingBuffers.removeAll()
            currentBuffer = nil
            currentPosition = 0
        }
    }
}

class SineWaveGenerator: AudioCustomProcessingDelegate {
    private var phase: Float = 0.0
    private var frequency: Float = 440.0 // A4 note
    private var sampleRate: Float = 16000
    private var amplitude: Float = 0.3 // 30% volume to avoid being too loud

    func audioProcessingInitialize(sampleRate: Int, channels: Int) {
        self.sampleRate = Float(sampleRate)
        Core.log("SineWaveGenerator: Initialized with sampleRate: \(sampleRate), channels: \(channels)")
    }

    func audioProcessingProcess(audioBuffer: LKAudioBuffer) {
        let phaseIncrement = (frequency * 2.0 * Float.pi) / sampleRate

        for frame in 0 ..< audioBuffer.frames {
            // Generate sine wave sample
            let sample = amplitude * sin(phase)

            // Write to all channels
            for channel in 0 ..< audioBuffer.channels {
                let channelData = audioBuffer.rawBuffer(forChannel: channel)
                channelData[frame] = sample
            }

            // Increment phase
            phase += phaseIncrement

            // Keep phase in reasonable range to avoid floating point issues
            if phase > 2.0 * Float.pi {
                phase -= 2.0 * Float.pi
            }
        }
    }

    func audioProcessingRelease() {
        phase = 0.0
        Core.log("SineWaveGenerator: Released")
    }
}

@objc
public class LiveKitManager: NSObject {
    // MARK: - Singleton

    @objc public static let shared = LiveKitManager()

    // MARK: - Properties

    private let room: Room
    private var cancellables = Set<AnyCancellable>()
    private var audioTrack: LocalAudioTrack?
    private var bufferInjector: BufferInjector?

    public var enabled = false

    // MARK: - Initialization

    override private init() {
        room = Room()
        super.init()
        LiveKit.AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = false
        do {
            try LiveKit.AudioManager.shared.setManualRenderingMode(true)
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
                try await setupCustomAudioTrack()

                Core.log("LiveKit: Successfully connected to LiveKit room")

            } catch {
                Core.log("LiveKit: Failed to connect: \(error.localizedDescription)")
            }
        }
    }

    /// Setup custom audio track for PCM input
    private func setupCustomAudioTrack() async throws {
        // Create the buffer injector
        bufferInjector = BufferInjector()

        // Set it as the audio processing delegate
        LiveKit.AudioManager.shared.capturePostProcessingDelegate = SineWaveGenerator()

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
        guard let injector = bufferInjector else {
            Core.log("LiveKit: Buffer injector not initialized")
            return
        }

        guard let buffer = dataToPCMBuffer(data: pcmData) else {
            Core.log("LiveKit: Failed to convert data to PCM buffer")
            return
        }

        Core.log("LiveKit: Adding PCM buffer with \(buffer.frameLength) frames")
        injector.addBuffer(buffer)
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

            // Clear audio processing delegate
            if bufferInjector != nil {
                LiveKit.AudioManager.shared.capturePostProcessingDelegate = nil
                bufferInjector = nil
            }

            // Clear references
            audioTrack = nil

            await room.disconnect()
            enabled = false
        }
    }
}
