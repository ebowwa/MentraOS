import AVFoundation
import Combine
import Foundation

// import LiveKit
// @preconcurrency internal import LiveKitWebRTC

@objc
public class LiveKitManager: NSObject {
    // MARK: - Singleton

    @objc public static let shared = LiveKitManager()

    public var enabled = false

    // MARK: - Initialization

    override private init() {}

    // MARK: - Public Methods

    /// Connect to LiveKit room with provided URL and token
    /// - Parameters:
    ///   - url: WebSocket URL for LiveKit server
    ///   - token: Authentication token for the room
    @objc public func connect(
        url: String,
        token: String
    ) {
        Task {
            do {
                Bridge.log("LiveKit: Attempting to connect to: \(url)")

                livekit_connect(url, token)

                enabled = true

                Bridge.log("LiveKit: Successfully connected to LiveKit room")

            } catch {
                Bridge.log("LiveKit: Failed to connect: \(error.localizedDescription)")
            }
        }
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
    @objc public func addPcm(_: Data) {
        //      Task {
        //          try await room.localParticipant.publish(data: pcmData)
        //      }
        //        guard let injector = bufferInjector else {
        //            Core.log("LiveKit: Buffer injector not initialized")
        //            return
        //        }
        //
//    guard let buffer = dataToPCMBuffer(data: pcmData) else {
//      Bridge.log("LiveKit: Failed to convert data to PCM buffer")
//      return
//    }
//
//    counter += 1
//    if counter % 50 == 0 {
//      Bridge.log("LiveKit: Adding PCM buffer with \(buffer.frameLength) frames")
//    }
//
//    LiveKit.AudioManager.shared.mixer.capture(appAudio: buffer)
//    //
//    //        injector.addBuffer(buffer)
    }

    /// Disconnect from LiveKit room
    @objc public func disconnect() {
//    guard
//      room.connectionState == .connected || room.connectionState == .connecting
//        || room.connectionState == .reconnecting
//    else {
//      Bridge.log("LiveKit: Not connected, nothing to disconnect")
//      return
//    }
//
//    Task {
//      Bridge.log("LiveKit: Disconnecting from LiveKit")
//
//      // Clear references
//      audioTrack = nil
//
//      await room.disconnect()
//      enabled = false
//    }
    }
}

// extension LiveKitManager: RoomDelegate {
//  public func room(
//    _: Room, didUpdateConnectionState connectionState: ConnectionState,
//    from _: ConnectionState
//  ) {
//    switch connectionState {
//    case .disconnected:
//      Bridge.log("LiveKit: Disconnected from room")
//    case .connecting:
//      Bridge.log("LiveKit: Connecting to room...")
//    case .connected:
//      Bridge.log("LiveKit: Connected to room")
//    case .reconnecting:
//      Bridge.log("LiveKit: Reconnecting to room...")
//    }
//  }
// }
