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
  //  private var audioSource: /*AudioCustomSource*/?
  private var audioPublicationOptions: AudioPublishOptions?
  
  // Audio configuration
  private let sampleRate: Int = 16000
  private let channels: Int = 1
  
  // Connection state
  @objc public private(set) var isConnected: Bool = false
  @objc public private(set) var isConnecting: Bool = false
  
  // MARK: - Initialization
  private override init() {
    self.room = Room()
    super.init()
    setupRoomObservers()
  }
  
  // MARK: - Setup
  private func setupRoomObservers() {
    //        // Observe connection state changes
    //        room.$connectionState
    //            .receive(on: DispatchQueue.main)
    //            .sink { [weak self] state in
    //                self?.handleConnectionStateChange(state)
    //            }
    //            .store(in: &cancellables)
  }
  
  private func handleConnectionStateChange(_ state: ConnectionState) {
    switch state {
    case .disconnected:
      isConnected = false
      isConnecting = false
      Core.log("[LiveKitManager] Disconnected from LiveKit")
      
    case .connecting, .reconnecting:
      isConnected = false
      isConnecting = true
      Core.log("[LiveKitManager] Connecting to LiveKit...")
      
    case .connected:
      isConnected = true
      isConnecting = false
      Core.log("[LiveKitManager] Connected to LiveKit")
    }
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
    guard !isConnecting && !isConnected else {
      Core.log("[LiveKitManager] Already connected or connecting")
      return
    }
    
    Task {
      do {
        Core.log("[LiveKitManager] Attempting to connect to: \(url)")
        
        // Create connect options
        let connectOptions = ConnectOptions(
          enableMicrophone: false,
        )
        
        // Connect to the room
        try await room.connect(
          url: url,
          token: token,
          connectOptions: connectOptions
        )
        
        // Setup custom audio source for PCM input
        try await setupCustomAudioTrack()
        
        Core.log("[LiveKitManager] Successfully connected to LiveKit room")
        
      } catch {
        Core.log("[LiveKitManager] Failed to connect: \(error.localizedDescription)")
        isConnected = false
        isConnecting = false
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
    
    try await self.trackRecorder?.start()
    
    // Publish the track
    let publishOptions = AudioPublishOptions(
      dtx: false, // Disable DTX for continuous audio
    )
    
    try await room.localParticipant.publish(
      audioTrack: self.audioTrack!,
      options: publishOptions
    )
    
    Core.log("[LiveKitManager] Custom audio track setup complete")
  }
  
  func dataToPCMBuffer(data: Data) -> AVAudioPCMBuffer? {
    
    let format = AVAudioFormat(commonFormat: .pcmFormatInt16,
                               sampleRate: 44100,
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
      Core.log("[LiveKitManager] Audio recorder not initialized")
      return
    }
    
    guard isConnected else {
      Core.log("[LiveKitManager] Cannot add PCM - not connected")
      return
    }
    
    guard let buffer = dataToPCMBuffer(data: pcmData) else {
      Core.log("[LiveKitManager] Failed to convert data to PCM buffer")
      return
    }
    
    recorder.render(pcmBuffer: buffer)
  }
  
  /// Disconnect from LiveKit room
  @objc public func disconnect() {
    guard isConnected || isConnecting else {
      Core.log("[LiveKitManager] Not connected, nothing to disconnect")
      return
    }
    
    Task {
      Core.log("[LiveKitManager] Disconnecting from LiveKit")
      
      //            // Unpublish and cleanup audio track
      //            if let audioTrack = audioTrack {
      //                try? await room.localParticipant.unpublish(publication: audioTrack)
      //            }
      
      // Clear references
      audioTrack = nil
      //      audioSource = nil
      audioPublicationOptions = nil
      
      await room.disconnect()
    }
  }
  
  /// Get the current room instance (for advanced usage)
  public func getRoom() -> Room {
    return room
  }
  
  // MARK: - Convenience Methods for Testing
  
  /// Connect with default test credentials (for development only)
  @objc public func connectWithTestCredentials() {
    let testURL = "wss://mentra-os-kb2c1m3h.livekit.cloud"
    let testToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NTU4MDMxMjgsImlkZW50aXR5IjoicXVpY2tzdGFydCB1c2VyIDdwaWJmcyIsImlzcyI6IkFQSVFCUDVmQ3ZuZlA0ZyIsIm5iZiI6MTc1NTc5NTkyOCwic3ViIjoicXVpY2tzdGFydCB1c2VyIDdwaWJmcyIsInZpZGVvIjp7ImNhblB1Ymxpc2giOnRydWUsImNhblB1Ymxpc2hEYXRhIjp0cnVlLCJjYW5TdWJzY3JpYmUiOnRydWUsInJvb20iOiJxdWlja3N0YXJ0IHJvb20iLCJyb29tSm9pbiI6dHJ1ZX19.x6VprtJejDQOgYV1A_E1n5lML9IwcYowPjP53DrOeA4"
    
    connect(
      url: testURL,
      token: testToken,
    )
  }
}
