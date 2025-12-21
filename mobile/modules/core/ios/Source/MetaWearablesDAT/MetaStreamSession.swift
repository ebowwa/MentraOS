//
//  MetaStreamSession.swift
//  MetaWearablesDAT
//
//  Created by Elijah Arbee on 12/20/25
//  Video streaming session for Meta glasses.
//  Handles video frame reception and photo capture.
//

import Foundation
import SwiftUI
import Combine
import MWDATCore
import MWDATCamera

/// Manages video streaming from Meta glasses camera.
///
/// ## Usage
/// ```swift
/// let session = manager.createStreamSession()
///
/// // Start streaming
/// try await session.startStreaming()
///
/// // Observe frames
/// session.$currentFrame.sink { frame in
///     if let frame = frame {
///         imageView.image = frame
///     }
/// }
///
/// // Capture photo
/// session.capturePhoto()
/// ```
@MainActor
public final class MetaStreamSession: ObservableObject {
    
    // MARK: - Published Properties
    
    /// Current video frame from glasses camera
    @Published public private(set) var currentFrame: UIImage?
    
    /// Whether the first frame has been received
    @Published public private(set) var hasReceivedFirstFrame: Bool = false
    
    /// Current streaming status
    @Published public private(set) var streamingStatus: StreamingStatus = .stopped
    
    /// Whether an error is being shown
    @Published public var showError: Bool = false
    
    /// Current error message
    @Published public var errorMessage: String = ""
    
    /// Active time limit for streaming
    @Published public var activeTimeLimit: StreamTimeLimit = .noLimit
    
    /// Remaining time for time-limited streaming
    @Published public private(set) var remainingTime: TimeInterval = 0
    
    /// Captured photo (when photo capture is triggered)
    @Published public private(set) var capturedPhoto: UIImage?
    
    /// Whether to show photo preview
    @Published public var showPhotoPreview: Bool = false
    
    // MARK: - Computed Properties
    
    /// Whether streaming is currently active
    public var isStreaming: Bool {
        streamingStatus != .stopped
    }
    
    // MARK: - Private Properties
    
    private var streamSession: StreamSession?
    private var stateListenerToken: AnyListenerToken?
    private var videoFrameListenerToken: AnyListenerToken?
    private var errorListenerToken: AnyListenerToken?
    private var photoDataListenerToken: AnyListenerToken?
    private var deviceMonitorTask: Task<Void, Never>?
    
    private let wearables: WearablesInterface?
    private var deviceSelector: AutoDeviceSelector?
    
    private var timerTask: Task<Void, Never>?
    
    // MARK: - Initialization
    
    /// Create a new streaming session.
    /// - Parameter wearables: The wearables interface from the SDK
    public init(wearables: WearablesInterface) {
        self.wearables = wearables
        setupStreamSession(with: wearables)
    }
    
    /// Create a mock streaming session for testing
    public init() {
        self.wearables = nil
    }
    
    deinit {
        timerTask?.cancel()
        deviceMonitorTask?.cancel()
    }
    
    // MARK: - Stream Session Setup
    
    private func setupStreamSession(with wearables: WearablesInterface) {
        // Create device selector for auto-selection
        let deviceSelector = AutoDeviceSelector(wearables: wearables)
        self.deviceSelector = deviceSelector
        
        // Configure stream session
        let config = StreamSessionConfig(
            videoCodec: VideoCodec.raw,
            resolution: StreamingResolution.low,
            frameRate: 24
        )
        
        let streamSession = StreamSession(streamSessionConfig: config, deviceSelector: deviceSelector)
        self.streamSession = streamSession
        
        // Monitor device availability
        deviceMonitorTask = Task { @MainActor in
            for await device in deviceSelector.activeDeviceStream() {
                // Device available/unavailable
                _ = device != nil
            }
        }
        
        // Subscribe to state changes
        stateListenerToken = streamSession.statePublisher.listen { [weak self] state in
            Task { @MainActor [weak self] in
                self?.updateStatusFromState(state)
            }
        }
        
        // Subscribe to video frames
        videoFrameListenerToken = streamSession.videoFramePublisher.listen { [weak self] videoFrame in
            Bridge.log("META: Frame received from glasses")
            Task { @MainActor [weak self] in
                guard let self = self else {
                    Bridge.log("META: Self was deallocated before frame processing")
                    return
                }
                if let image = videoFrame.makeUIImage() {
                    Bridge.log("META: Frame converted to UIImage: \(image.size), hasReceivedFirstFrame: \(self.hasReceivedFirstFrame)")
                    self.currentFrame = image
                    if !self.hasReceivedFirstFrame {
                        Bridge.log("META: First frame received!")
                        self.hasReceivedFirstFrame = true
                    }
                } else {
                    Bridge.log("META: makeUIImage() returned nil")
                }
            }
        }
        
        // Subscribe to errors
        errorListenerToken = streamSession.errorPublisher.listen { [weak self] error in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                let newErrorMessage = self.formatStreamingError(error)
                if newErrorMessage != self.errorMessage {
                    self.showError(newErrorMessage)
                }
            }
        }
        
        // Subscribe to photo captures
        photoDataListenerToken = streamSession.photoDataPublisher.listen { [weak self] photoData in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                if let uiImage = UIImage(data: photoData.data) {
                    self.capturedPhoto = uiImage
                    self.showPhotoPreview = true
                }
            }
        }
        
        updateStatusFromState(streamSession.state)
    }
    
    // MARK: - Public API
    
    /// Start video streaming from glasses camera.
    /// - Note: Requires camera permission to be granted first
    public func startStreaming() async throws {
        guard let wearables = wearables else {
            throw MetaStreamingError.internalError("Session not properly initialized")
        }
        
        // Check/request camera permission
        let permission = Permission.camera
        let status = try await wearables.checkPermissionStatus(permission)
        
        if status == .granted {
            await startSession()
            return
        }
        
        let requestStatus = try await wearables.requestPermission(permission)
        if requestStatus == .granted {
            await startSession()
            return
        }
        
        throw MetaStreamingError.permissionDenied
    }
    
    /// Stop video streaming.
    public func stopStreaming() async {
        stopTimer()
        await streamSession?.stop()
    }
    
    /// Capture a photo from the glasses camera.
    public func capturePhoto() {
        streamSession?.capturePhoto(format: .jpeg)
    }
    
    /// Dismiss the photo preview.
    public func dismissPhotoPreview() {
        showPhotoPreview = false
        capturedPhoto = nil
    }
    
    /// Set a time limit for streaming.
    /// - Parameter limit: The time limit to apply
    public func setTimeLimit(_ limit: StreamTimeLimit) {
        activeTimeLimit = limit
        remainingTime = limit.durationInSeconds ?? 0
        
        if limit.isTimeLimited {
            startTimer()
        } else {
            stopTimer()
        }
    }
    
    /// Dismiss the current error.
    public func dismissError() {
        showError = false
        errorMessage = ""
    }
    
    // MARK: - Private Helpers
    
    private func startSession() async {
        // Reset time limit
        activeTimeLimit = .noLimit
        remainingTime = 0
        stopTimer()
        
        Bridge.log("META: Starting stream session...")
        Bridge.log("META: streamSession: \(streamSession != nil ? "exists" : "nil")")
        Bridge.log("META: videoFrameListenerToken: \(videoFrameListenerToken != nil ? "exists" : "nil")")
        await streamSession?.start()
        Bridge.log("META: Stream session start() completed")
    }
    
    private func startTimer() {
        stopTimer()
        timerTask = Task { @MainActor [weak self] in
            while let self = self, self.remainingTime > 0 {
                try? await Task.sleep(nanoseconds: NSEC_PER_SEC)
                guard !Task.isCancelled else { break }
                self.remainingTime -= 1
            }
            if let self = self, !Task.isCancelled {
                await self.stopStreaming()
            }
        }
    }
    
    private func stopTimer() {
        timerTask?.cancel()
        timerTask = nil
    }
    
    private func updateStatusFromState(_ state: StreamSessionState) {
        switch state {
        case .stopped:
            currentFrame = nil
            streamingStatus = .stopped
        case .waitingForDevice, .starting, .stopping, .paused:
            streamingStatus = .waiting
        case .streaming:
            streamingStatus = .streaming
        @unknown default:
            streamingStatus = .stopped
        }
    }
    
    private func formatStreamingError(_ error: StreamSessionError) -> String {
        switch error {
        case .internalError:
            return "An internal error occurred. Please try again."
        case .deviceNotFound:
            return "Device not found. Please ensure your device is connected."
        case .deviceNotConnected:
            return "Device not connected. Please check your connection and try again."
        case .timeout:
            return "The operation timed out. Please try again."
        case .videoStreamingError:
            return "Video streaming failed. Please try again."
        case .audioStreamingError:
            return "Audio streaming failed. Please try again."
        case .permissionDenied:
            return "Camera permission denied. Please grant permission in Settings."
        @unknown default:
            return "An unknown streaming error occurred."
        }
    }
    
    private func showError(_ message: String) {
        errorMessage = message
        showError = true
    }
}
