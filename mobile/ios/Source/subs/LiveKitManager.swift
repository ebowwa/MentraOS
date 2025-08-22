import Foundation
import LiveKit
import Combine
import AVFoundation

@objc
public class LiveKitManager: NSObject {
  // MARK: - Singleton
  @objc public static let shared = LiveKitManager()
  
  // MARK: - Properties
  private let room: Room
  private var cancellables = Set<AnyCancellable>()
  private var audioTrack: LocalAudioTrack?
  private var trackRecorder: LocalAudioTrackRecorder?
  private var audioPublicationOptions: AudioPublishOptions?
  
  public var enabled = false
  
  // MARK: - Initialization
  private override init() {
    self.room = Room()
    super.init()
  }
  
  // MARK: - Public Methods
  
  /// Connect to LiveKit room with provided URL and token
  /// - Parameters:
  ///   - url: WebSocket URL for LiveKit server
  ///   - token: Authentication token for the room
  ///   - enableMicrophone: Whether to enable microphone on connect (default: true)
  ///   - enableCamera: Whether to enable camera on connect (default: false)
  @objc public func connect(
    url: String,
    token: String,
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
          enableMicrophone: false,
          
        )
        
        let roomOptions = RoomOptions(defaultAudioCaptureOptions: AudioCaptureOptions(), suspendLocalVideoTracksInBackground: false)
        
        // Connect to the room
        try await room.connect(
          url: url,
          token: token,
          connectOptions: connectOptions,
          roomOptions: roomOptions,
        )
        enabled = true
        
        try LiveKit.AudioManager.shared.setRecordingAlwaysPreparedMode(false)
//        try LiveKit.AudioManager.shared.setManualRenderingMode(true)
        
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
    
    // Create track options with custom source
    let captureOptions = AudioCaptureOptions(
      echoCancellation: true,
      autoGainControl: true,
    )
    
    // Create the audio track
    self.audioTrack = LocalAudioTrack.createTrack(
      name: "pcm-audio",
      options: captureOptions
    )
    
    // Create custom audio source with 16kHz sample rate
    self.trackRecorder = LocalAudioTrackRecorder(
      track: self.audioTrack!, format: AVAudioCommonFormat.pcmFormatInt16, sampleRate: 16_000
    )
    
//    let stream = try await self.trackRecorder?.start()
    
    // Publish the track
    let publishOptions = AudioPublishOptions(
      dtx: false, // Disable DTX for continuous audio
    )
    
    try await room.localParticipant.publish(
      audioTrack: self.audioTrack!,
      options: publishOptions
    )
    
//    LiveKit.AudioManager.shared.add(localAudioRenderer: self.trackRecorder)
    
    Core.log("LiveKit: Custom audio track setup complete")
  }
  
  func dataToPCMBuffer(data: Data) -> AVAudioPCMBuffer? {
    
    let format = AVAudioFormat(commonFormat: .pcmFormatInt16,
                               sampleRate: 16000,
                               channels: 1,
                               interleaved: false)!
    
    let frameCapacity = UInt32(data.count) / format.streamDescription.pointee.mBytesPerFrame
    
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCapacity) else {
      return nil
    }
    
    buffer.frameLength = frameCapacity
    
    // For integer formats (Int16, etc.)
    if format.commonFormat == .pcmFormatInt16 {
      data.withUnsafeBytes { bytes in
        memcpy(buffer.int16ChannelData?[0], bytes.baseAddress, data.count)
      }
    }
    // For float formats
    else if format.commonFormat == .pcmFormatFloat32 {
      data.withUnsafeBytes { bytes in
        memcpy(buffer.floatChannelData?[0], bytes.baseAddress, data.count)
      }
    }
    
    return buffer
  }
  
  /// Add PCM audio data to be published
  /// - Parameter pcmData: Raw PCM audio data (16kHz, mono, 16-bit little endian)
  @objc public func addPcm(_ pcmData: Data) {
    guard let recorder = self.trackRecorder else {
      Core.log("LiveKit: Audio recorder not initialized")
      return
    }
    
    guard let buffer = dataToPCMBuffer(data: pcmData) else {
      Core.log("LiveKit: Failed to convert data to PCM buffer")
      return
    }
    
    Core.log("LiveKit: Adding PCM \(buffer.frameLength)")
    recorder.render(pcmBuffer: buffer)
  }
  
  /// Disconnect from LiveKit room
  @objc public func disconnect() {
    guard room.connectionState == .connected || room.connectionState == .connecting || room.connectionState == .reconnecting else {
      Core.log("LiveKit: Not connected, nothing to disconnect")
      return
    }
    
    Task {
      Core.log("LiveKit: Disconnecting from LiveKit")
      
      
      
      //            // Unpublish and cleanup audio track
//      if let audioTrack = audioTrack {
//          try? await room.localParticipant.unpublish(publication: audioTrack)
//      }
      
      // Clear references
      audioTrack = nil
      audioPublicationOptions = nil
      
      await room.disconnect()
    }
  }
}
