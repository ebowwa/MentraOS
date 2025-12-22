//
//  MetaGlassesManager.swift
//  MetaWearablesDAT
//
//  Created by Elijah Arbee on 12/20/25
//  Primary manager for Meta glasses integration.
//  Handles device connection, registration, and coordination.
//

import Foundation
import SwiftUI
import Combine
import MWDATCore
import MWDATCamera

/// Manager for Meta Ray-Ban smart glasses integration.
///
/// This is the primary entry point for working with Meta glasses.
/// 
/// ## Usage
/// ```swift
/// let manager = MetaGlassesManager()
/// 
/// // Observe connection state
/// manager.$connectionState.sink { state in
///     print("Connection: \(state.displayName)")
/// }
/// 
/// // Connect to glasses
/// try await manager.connect()
/// ```
@MainActor
public final class MetaGlassesManager: ObservableObject {
    
    // MARK: - Published Properties
    
    /// Current connection/registration state
    @Published public private(set) var connectionState: MetaConnectionState = .disconnected
    
    /// List of discovered Meta glasses devices
    @Published public private(set) var discoveredDevices: [MetaDeviceInfo] = []
    
    /// Whether there is an active device available
    @Published public private(set) var hasActiveDevice: Bool = false
    
    /// Whether an error is being shown
    @Published public var showError: Bool = false
    
    /// Current error message
    @Published public var errorMessage: String = ""
    
    /// Whether the getting started sheet should be shown
    @Published public var showGettingStartedSheet: Bool = false
    
    // MARK: - Private Properties
    
    private var wearables: WearablesInterface?
    private var registrationTask: Task<Void, Never>?
    private var deviceStreamTask: Task<Void, Never>?
    private var activeDeviceTask: Task<Void, Never>?
    private var deviceSelector: AutoDeviceSelector?
    private var compatibilityListenerTokens: [DeviceIdentifier: AnyListenerToken] = [:]
    
    // MARK: - Streaming Configuration
    
    /// Configured streaming resolution (default: .medium)
    public private(set) var streamingResolution: StreamingResolution = .medium
    
    /// Configured frame rate (default: 24 fps)
    public private(set) var streamingFrameRate: UInt = 24
    
    // MARK: - Initialization
    
    /// Create a new MetaGlassesManager.
    /// - Note: Call `MetaWearablesDAT.configure()` before creating a manager.
    public init() {
        setupWithSDK()
    }
    
    deinit {
        registrationTask?.cancel()
        deviceStreamTask?.cancel()
        activeDeviceTask?.cancel()
    }
    
    // MARK: - SDK Setup
    
    private func setupWithSDK() {
        // If SDK not configured yet, schedule a retry
        guard MetaWearablesDATSDK.isConfigured else {
            Bridge.log("Meta SDK not configured yet, will retry in 0.5s...")
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 500_000_000)
                self.setupWithSDK()
            }
            return
        }
        
        Bridge.log("META: Setting up MetaGlassesManager with SDK")
        let wearables = Wearables.shared
        self.wearables = wearables
        
        // Update initial state
        updateConnectionState(from: wearables.registrationState)
        discoveredDevices = wearables.devices.map { createDeviceInfo(from: $0) }
        Bridge.log("META: Initial registration state: \(wearables.registrationState)")
        
        // Monitor registration state changes
        registrationTask = Task { [weak self] in
            guard let wearables = self?.wearables else { return }
            for await registrationState in wearables.registrationStateStream() {
                Bridge.log("META: Registration state changed: \(registrationState)")
                await self?.handleRegistrationStateChange(registrationState)
            }
        }
    }
    
    /// Call this from view's onAppear to ensure SDK setup
    public func ensureSetup() {
        if wearables == nil {
            setupWithSDK()
        }
    }
    
    private func handleRegistrationStateChange(_ state: RegistrationState) async {
        Bridge.log("META: handleRegistrationStateChange called with state: \(state)")
        let previousState = connectionState
        updateConnectionState(from: state)
        Bridge.log("META: connectionState updated to: \(connectionState)")
        
        // Show getting started on first registration
        if !showGettingStartedSheet && connectionState == .registered && previousState == .registering {
            showGettingStartedSheet = true
        }
        
        // Start device discovery when registered
        if connectionState == .registered {
            Bridge.log("META: State is registered, calling setupDeviceStream...")
            await setupDeviceStream()
            // Camera permission will be requested when devices are discovered
        }
    }
    
    private func setupDeviceStream() async {
        deviceStreamTask?.cancel()
        activeDeviceTask?.cancel()
        
        guard let wearables = wearables else {
            Bridge.log("META: setupDeviceStream - wearables is nil!")
            return
        }
        
        // Setup AutoDeviceSelector for active device monitoring
        // AutoDeviceSelector tracks device connectivity state, not just discovery
        let selector = AutoDeviceSelector(wearables: wearables)
        self.deviceSelector = selector
        
        // Check immediate devices first
        let currentDevices = wearables.devices
        Bridge.log("META: setupDeviceStream - Initial devices count: \(currentDevices.count)")
        if !currentDevices.isEmpty {
            Bridge.log("META: setupDeviceStream - Found \(currentDevices.count) device(s) immediately")
            await MainActor.run {
                self.discoveredDevices = currentDevices.map { self.createDeviceInfo(from: $0) }
            }
            // Request camera permission now that we have devices
            await requestCameraPermissionIfNeeded()
        }
        
        Bridge.log("META: setupDeviceStream - Starting device stream listener...")
        deviceStreamTask = Task { [weak self] in
            for await devices in wearables.devicesStream() {
                Bridge.log("META: devicesStream emitted \(devices.count) device(s)")
                await MainActor.run {
                    let hadDevices = !(self?.discoveredDevices.isEmpty ?? true)
                    self?.discoveredDevices = devices.map { self?.createDeviceInfo(from: $0) ?? MetaDeviceInfo(id: $0.description, name: "Unknown") }
                    self?.monitorDeviceCompatibility(devices: devices)
                    Bridge.log("META: Updated discoveredDevices count: \(self?.discoveredDevices.count ?? 0)")
                    
                    // Request camera permission when devices first appear
                    if !hadDevices && !devices.isEmpty {
                        Task {
                            await self?.requestCameraPermissionIfNeeded()
                        }
                    }
                }
            }
            Bridge.log("META: devicesStream ended")
        }
        
        // Monitor active device availability using AutoDeviceSelector
        // This properly detects when a device is actually connected and ready (not just discovered)
        Bridge.log("META: setupDeviceStream - Starting active device stream listener...")
        activeDeviceTask = Task { [weak self] in
            for await device in selector.activeDeviceStream() {
                await MainActor.run {
                    let hadActiveDevice = self?.hasActiveDevice ?? false
                    let nowHasActiveDevice = device != nil
                    self?.hasActiveDevice = nowHasActiveDevice
                    
                    if nowHasActiveDevice && !hadActiveDevice {
                        Bridge.log("META: Active device NOW AVAILABLE! Device is connected and ready.")
                    } else if !nowHasActiveDevice && hadActiveDevice {
                        Bridge.log("META: Active device DISCONNECTED.")
                    }
                    Bridge.log("META: Active device changed - hasActiveDevice: \(nowHasActiveDevice)")
                }
            }
            Bridge.log("META: activeDeviceStream ended")
        }
    }
    
    private var hasCameraPermission = false
    
    private func requestCameraPermissionIfNeeded() async {
        guard !hasCameraPermission else {
            Bridge.log("META: Camera permission already granted, skipping request")
            return
        }
        
        Bridge.log("META: Requesting camera permission (devices available)...")
        do {
            let permissionStatus = try await requestCameraPermission()
            Bridge.log("META: Camera permission status: \(permissionStatus)")
            if permissionStatus == .granted {
                hasCameraPermission = true
            }
        } catch {
            Bridge.log("META: Failed to request camera permission: \(error.localizedDescription)")
        }
    }
    
    private func monitorDeviceCompatibility(devices: [DeviceIdentifier]) {
        guard let wearables = wearables else { return }
        
        // Remove listeners for devices no longer present
        let deviceSet = Set(devices)
        compatibilityListenerTokens = compatibilityListenerTokens.filter { deviceSet.contains($0.key) }
        
        // Add listeners for new devices
        for deviceId in devices {
            guard compatibilityListenerTokens[deviceId] == nil else { continue }
            guard let device = wearables.deviceForIdentifier(deviceId) else { continue }
            
            let deviceName = device.nameOrId()
            let token = device.addCompatibilityListener { [weak self] compatibility in
                guard let self = self else { return }
                if compatibility == .deviceUpdateRequired {
                    Task { @MainActor in
                        self.showError("Device '\(deviceName)' requires an update to work with this app")
                    }
                }
            }
            compatibilityListenerTokens[deviceId] = token
        }
    }
    
    private func createDeviceInfo(from deviceId: DeviceIdentifier) -> MetaDeviceInfo {
        guard let wearables = wearables,
              let device = wearables.deviceForIdentifier(deviceId) else {
            return MetaDeviceInfo(id: deviceId.description, name: "Unknown Device")
        }
        return MetaDeviceInfo(
            id: deviceId.description,
            name: device.nameOrId(),
            isCompatible: true
        )
    }
    
    private func updateConnectionState(from state: RegistrationState) {
        switch state {
        case .registering:
            connectionState = .registering
        case .registered:
            connectionState = .registered
        default:
            // Handles .unregistered, .unregistering, or any future states
            connectionState = .disconnected
        }
    }
    
    // MARK: - Public API
    
    /// Start the registration/connection process.
    /// This will open the Meta AI companion app for pairing.
    public func connect() async throws {
        guard connectionState != .registering else { return }
        guard let wearables = wearables else {
            throw ConfigurationError.sdkNotConfigured
        }
        
        // If already registered, unregister first to force re-registration
        // This ensures the Meta AI app opens for fresh permission flow
        if wearables.registrationState == .registered {
            Bridge.log("META: Already registered, unregistering first to force Meta AI app to open...")
            do {
                try wearables.startUnregistration()
                // Wait for unregistration to complete
                try await Task.sleep(nanoseconds: 1_000_000_000)
            } catch {
                Bridge.log("META: Unregistration failed: \(error.localizedDescription)")
            }
        }
        
        do {
            Bridge.log("META: Calling startRegistration()...")
            try wearables.startRegistration()
            Bridge.log("META: startRegistration() called successfully - Meta AI app should open")
        } catch {
            showError("Failed to start registration: \(error.localizedDescription)")
            throw error
        }
    }
    
    /// Disconnect from the currently connected glasses.
    public func disconnect() async {
        guard let wearables = wearables else { return }
        
        do {
            try wearables.startUnregistration()
        } catch {
            showError("Failed to disconnect: \(error.localizedDescription)")
        }
    }
    
    /// Dismiss the current error.
    public func dismissError() {
        showError = false
        errorMessage = ""
    }
    
    /// Create a new streaming session.
    /// - Returns: A configured MetaStreamSession for video streaming
    public func createStreamSession() -> MetaStreamSession {
        guard let wearables = wearables else {
            Bridge.log("META: createStreamSession - wearables is nil, returning mock session")
            return MetaStreamSession()
        }
        Bridge.log("META: createStreamSession - creating real session with resolution: \(streamingResolution), frameRate: \(streamingFrameRate)")
        return MetaStreamSession(wearables: wearables, resolution: streamingResolution, frameRate: streamingFrameRate)
    }
    
    /// Configure streaming resolution and frame rate.
    /// - Parameters:
    ///   - resolution: Streaming resolution (low, medium, high)
    ///   - frameRate: Frame rate in fps (15-30)
    public func configureStreaming(resolution: StreamingResolution, frameRate: UInt) {
        streamingResolution = resolution
        streamingFrameRate = max(15, min(30, frameRate))
        Bridge.log("META: Configured streaming - resolution: \(streamingResolution), frameRate: \(streamingFrameRate)")
    }
    
    /// Configure streaming from string resolution name.
    /// - Parameters:
    ///   - resolutionName: Resolution name ("low", "medium", "high")
    ///   - frameRate: Frame rate in fps (15-30)
    public func configureStreaming(resolutionName: String, frameRate: Int) {
        let resolution: StreamingResolution
        switch resolutionName.lowercased() {
        case "low":
            resolution = .low
        case "high":
            resolution = .high
        default:
            resolution = .medium
        }
        configureStreaming(resolution: resolution, frameRate: UInt(max(15, min(30, frameRate))))
    }
    
    // MARK: - Private Helpers
    
    private func showError(_ message: String) {
        errorMessage = message
        showError = true
    }
}

// MARK: - SmartGlassesProvider Conformance

extension MetaGlassesManager: @preconcurrency SmartGlassesProvider {
    
    public var isStreaming: Bool {
        false // Streaming is managed by MetaStreamSession
    }
    
    public func startStreaming() async throws {
        // Delegate to stream session
        throw MetaStreamingError.internalError("Use createStreamSession() for streaming")
    }
    
    public func stopStreaming() async {
        // Delegate to stream session
    }
    
    public func capturePhoto() async throws -> UIImage? {
        // Delegate to stream session
        throw MetaStreamingError.internalError("Use MetaStreamSession for photo capture")
    }
    
    public func requestCameraPermission() async throws -> MetaPermissionStatus {
        guard let wearables = wearables else {
            throw ConfigurationError.sdkNotConfigured
        }
        
        let permission = Permission.camera
        // Check current status and request if needed
        let status = try await wearables.checkPermissionStatus(permission)
        
        if status == .granted {
            return .granted
        } else if status == .denied {
            return .denied
        } else {
            // Request permission for .notDetermined or any other state
            let requestStatus = try await wearables.requestPermission(permission)
            return requestStatus == .granted ? .granted : .denied
        }
    }
}
