//
//  MetaRayBan.swift
//  MentraOS
//
//  Created by Elijah Arbee on 12/20/25
//  Meta Ray-Ban glasses integration using MetaWearablesDAT wrapper
//

import Foundation
import UIKit
import Combine
import MWDATCore

class MetaRayBan: SGCManager {
    // MARK: - Device Information
    
    var type: String = DeviceTypes.META_RAYBAN
    var ready: Bool = false
    var connectionState: String = ConnTypes.DISCONNECTED
    
    var glassesAppVersion: String = ""
    var glassesBuildNumber: String = ""
    var glassesDeviceModel: String = "Meta Ray-Ban"
    var glassesAndroidVersion: String = ""
    var glassesOtaVersionUrl: String = ""
    var glassesSerialNumber: String = ""
    var glassesStyle: String = ""
    var glassesColor: String = ""
    
    // MARK: - Hardware Status
    
    var hasMic: Bool = true
    var batteryLevel: Int = -1
    var isHeadUp: Bool = false
    var micEnabled: Bool = false
    
    // MARK: - Case Status
    
    var caseOpen: Bool = false
    var caseRemoved: Bool = false
    var caseCharging: Bool = false
    var caseBatteryLevel: Int = -1
    
    // MARK: - Network Status
    
    var wifiSsid: String = ""
    var wifiConnected: Bool = false
    var wifiLocalIp: String = ""
    var isHotspotEnabled: Bool = false
    var hotspotSsid: String = ""
    var hotspotPassword: String = ""
    var hotspotGatewayIp: String = ""
    
    // MARK: - Meta SDK Components
    
    private var glassesManager: MetaGlassesManager?
    private var streamSession: MetaStreamSession?
    private var cancellables = Set<AnyCancellable>()
    private var isStreaming: Bool = false
    private var frameCount: Int = 0
    
    // MARK: - Initialization
    
    init() {
        Bridge.log("META: MetaRayBan SGC initialized")
        
        // Observe Meta AI app callbacks from AppDelegate
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMetaAICallback(_:)),
            name: Notification.Name("MetaAICallback"),
            object: nil
        )
        
        Task { @MainActor in
            await setupMetaSDK()
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        cleanup()
    }
    
    @objc private func handleMetaAICallback(_ notification: Notification) {
        guard let url = notification.object as? URL else { return }
        Bridge.log("META: Received callback from Meta AI app: \(url)")
        
        // Forward to the SDK to complete registration on MainActor
        Task { @MainActor in
            do {
                let handled = try await Wearables.shared.handleUrl(url)
                Bridge.log("META: SDK handled URL: \(handled)")
            } catch {
                Bridge.log("META: Failed to handle URL: \(error.localizedDescription)")
            }
        }
    }
    
    @MainActor
    private func setupMetaSDK() async {
        Bridge.log("META: Setting up Meta DAT SDK via MetaWearablesDAT wrapper")
        
        do {
            // Configure the SDK
            try MetaWearablesDATSDK.configure()
            Bridge.log("META: SDK configured successfully")
            
            // Create the glasses manager
            glassesManager = MetaGlassesManager()
            
            // Observe connection state changes
            glassesManager?.$connectionState
                .receive(on: DispatchQueue.main)
                .sink { [weak self] state in
                    self?.handleConnectionStateChange(state)
                }
                .store(in: &cancellables)
            
            // Observe active device availability - this is when glasses are truly ready to use
            // hasActiveDevice is more reliable than discoveredDevices.isEmpty because it uses
            // AutoDeviceSelector which tracks actual connectivity state
            glassesManager?.$hasActiveDevice
                .receive(on: DispatchQueue.main)
                .sink { [weak self] hasActive in
                    guard let self = self else { return }
                    let wasReady = self.ready
                    
                    if hasActive {
                        Bridge.log("META: Active device available - glasses are ready!")
                        self.connectionState = ConnTypes.CONNECTED
                        self.ready = true
                        
                        // Notify CoreManager only if state changed
                        if !wasReady {
                            Bridge.log("META: Glasses now ready, notifying CoreManager")
                            CoreManager.shared.handleConnectionStateChanged()
                        }
                    } else if wasReady {
                        // Active device lost = disconnected
                        Bridge.log("META: Active device lost, marking as disconnected")
                        self.connectionState = ConnTypes.DISCONNECTED
                        self.ready = false
                        CoreManager.shared.handleConnectionStateChanged()
                    }
                }
                .store(in: &cancellables)
                
        } catch {
            Bridge.log("META: Failed to configure SDK: \(error.localizedDescription)")
        }
    }
    
    private func handleConnectionStateChange(_ state: MetaConnectionState) {
        Bridge.log("META: Connection state changed to: \(state.displayName)")
        
        switch state {
        case .disconnected:
            connectionState = ConnTypes.DISCONNECTED
            // The $discoveredDevices observer will manage the ready state when devices appear/disappear
            // Don't force ready = false here as it may override the observer
        case .registering:
            connectionState = ConnTypes.CONNECTING
            ready = false
        case .registered:
            // Registered = permission granted, but NOT yet connected to glasses
            // Don't set ready = true here - wait for devices to be discovered
            connectionState = ConnTypes.CONNECTED
            Bridge.log("META: Registered! Waiting for device discovery...")
            // Don't call handleConnectionStateChanged() yet - wait for devices
        case .connecting:
            connectionState = ConnTypes.CONNECTING
            ready = false
        case .connected:
            // Actually connected to a device
            connectionState = ConnTypes.CONNECTED
            ready = true
            CoreManager.shared.handleConnectionStateChanged()
        case .unregistering:
            connectionState = ConnTypes.DISCONNECTED
            ready = false
        }
    }
    
    // MARK: - Audio Control
    
    func setMicEnabled(_ enabled: Bool) {
        micEnabled = enabled
        Bridge.log("META: setMicEnabled \(enabled)")
    }
    
    func sortMicRanking(list: [String]) -> [String] {
        // Prefer Meta glasses mic when connected
        if ready {
            var sorted = list
            if let index = sorted.firstIndex(of: "meta_rayban_mic") {
                sorted.remove(at: index)
                sorted.insert("meta_rayban_mic", at: 0)
            }
            return sorted
        }
        return list
    }
    
    // MARK: - Messaging
    
    func sendJson(_ jsonOriginal: [String: Any], wakeUp: Bool, requireAck: Bool) {
        Bridge.log("META: sendJson - not supported on Meta glasses")
    }
    
    // MARK: - Camera & Media
    
    func requestPhoto(_ requestId: String, appId: String, size: String?, webhookUrl: String?, authToken: String?, compress: String?) {
        Bridge.log("META: requestPhoto - capturing from stream")
        
        Task { @MainActor in
            if let session = streamSession {
                // Trigger photo capture
                session.capturePhoto()
                
                // Wait a moment for capture, then check capturedPhoto
                try? await Task.sleep(nanoseconds: 500_000_000)
                
                if let image = session.capturedPhoto {
                    if let data = image.jpegData(compressionQuality: 0.8) {
                        let base64 = data.base64EncodedString()
                        Bridge.sendPhotoResponse(requestId: requestId, photoUrl: "data:image/jpeg;base64,\(base64)")
                        return
                    }
                }
            }
            Bridge.sendPhotoResponse(requestId: requestId, photoUrl: "")
        }
    }
    
    func startRtmpStream(_ message: [String: Any]) {
        Bridge.log("META: startRtmpStream - starting video stream")
        startVideoStream()
    }
    
    func stopRtmpStream() {
        Bridge.log("META: stopRtmpStream")
        stopVideoStream()
    }
    
    func sendRtmpKeepAlive(_ message: [String: Any]) {
        // Keep-alive handled by SDK
    }
    
    func startBufferRecording() {
        Bridge.log("META: startBufferRecording - not supported")
    }
    
    func stopBufferRecording() {
        Bridge.log("META: stopBufferRecording - not supported")
    }
    
    func saveBufferVideo(requestId: String, durationSeconds: Int) {
        Bridge.log("META: saveBufferVideo - not supported")
    }
    
    func startVideoRecording(requestId: String, save: Bool) {
        Bridge.log("META: startVideoRecording")
        startVideoStream()
    }
    
    func stopVideoRecording(requestId: String) {
        Bridge.log("META: stopVideoRecording")
        stopVideoStream()
    }
    
    // MARK: - Video Streaming
    
    private func startVideoStream() {
        guard streamSession == nil else {
            Bridge.log("META: Stream already active")
            return
        }
        
        guard ready, let manager = glassesManager else {
            Bridge.log("META: Cannot start stream - not connected")
            return
        }
        
        Bridge.log("META: Starting video stream via MetaStreamSession...")
        
        // Create stream session on MainActor and start streaming
        Task { @MainActor in
            let session = manager.createStreamSession()
            self.streamSession = session
            
            // Observe current frame using Combine
            session.$currentFrame
                .compactMap { $0 }
                .receive(on: DispatchQueue.main)
                .sink { [weak self] frame in
                    self?.handleVideoFrame(frame)
                }
                .store(in: &self.cancellables)
            
            do {
                try await session.startStreaming()
                self.isStreaming = true
                Bridge.log("META: Stream started successfully")
            } catch {
                Bridge.log("META: Failed to start stream: \(error.localizedDescription)")
            }
        }
    }
    
    private func stopVideoStream() {
        Bridge.log("META: Stopping video stream...")
        isStreaming = false
        
        Task {
            await streamSession?.stopStreaming()
            streamSession = nil
        }
    }
    
    private func handleVideoFrame(_ frame: UIImage) {
        frameCount += 1
        
        // Throttle frame sending (every 3rd frame ~10fps from 30fps)
        guard frameCount % 3 == 0 else { return }
        
        // Send via Bridge
        Bridge.sendVideoFrame(frame, quality: 0.5)
    }
    
    private func handleAudioData(_ data: Data) {
        // Send audio via Bridge
        Bridge.sendMicData(data)
    }
    
    // MARK: - Button Settings
    
    func sendButtonPhotoSettings() {
        Bridge.log("META: sendButtonPhotoSettings - not applicable")
    }
    
    func sendButtonModeSetting() {
        Bridge.log("META: sendButtonModeSetting - not applicable")
    }
    
    func sendButtonVideoRecordingSettings() {
        Bridge.log("META: sendButtonVideoRecordingSettings - not applicable")
    }
    
    func sendButtonCameraLedSetting() {
        Bridge.log("META: sendButtonCameraLedSetting - not applicable")
    }
    
    func sendButtonMaxRecordingTime() {
        Bridge.log("META: sendButtonMaxRecordingTime - not applicable")
    }
    
    // MARK: - Display Control (Not supported on Meta glasses)
    
    func setBrightness(_ level: Int, autoMode: Bool) {
        Bridge.log("META: setBrightness - not supported (no display)")
    }
    
    func clearDisplay() {
        Bridge.log("META: clearDisplay - not supported (no display)")
    }
    
    func sendTextWall(_ text: String) {
        Bridge.log("META: sendTextWall - not supported (no display)")
    }
    
    func sendDoubleTextWall(_ top: String, _ bottom: String) {
        Bridge.log("META: sendDoubleTextWall - not supported (no display)")
    }
    
    func displayBitmap(base64ImageData: String) async -> Bool {
        Bridge.log("META: displayBitmap - not supported (no display)")
        return false
    }
    
    func showDashboard() {
        Bridge.log("META: showDashboard - not supported (no display)")
    }
    
    func setDashboardPosition(_ height: Int, _ depth: Int) {
        Bridge.log("META: setDashboardPosition - not supported (no display)")
    }
    
    // MARK: - Device Control
    
    func setHeadUpAngle(_ angle: Int) {
        Bridge.log("META: setHeadUpAngle - not supported")
    }
    
    func getBatteryStatus() {
        Bridge.log("META: getBatteryStatus")
        Bridge.sendBatteryStatus(level: batteryLevel, charging: caseCharging)
    }
    
    func setSilentMode(_ enabled: Bool) {
        Bridge.log("META: setSilentMode - not supported")
    }
    
    func exit() {
        Bridge.log("META: exit")
        disconnect()
    }
    
    func sendRgbLedControl(requestId: String, packageName: String?, action: String, color: String?, ontime: Int, offtime: Int, count: Int) {
        Bridge.log("META: sendRgbLedControl - not supported")
        Bridge.sendRgbLedControlResponse(requestId: requestId, success: false, error: "device_not_supported")
    }
    
    // MARK: - Connection Management
    
    func disconnect() {
        Bridge.log("META: disconnect")
        stopVideoStream()
        
        Task {
            await glassesManager?.disconnect()
        }
        
        connectionState = ConnTypes.DISCONNECTED
        ready = false
        CoreManager.shared.handleConnectionStateChanged()
    }
    
    func forget() {
        Bridge.log("META: forget")
        disconnect()
    }
    
    func findCompatibleDevices() {
        Bridge.log("META: findCompatibleDevices - starting registration...")
        
        Task { @MainActor in
            // Ensure SDK is configured first
            if !MetaWearablesDATSDK.isConfigured {
                Bridge.log("META: SDK not configured yet, configuring now...")
                do {
                    try MetaWearablesDATSDK.configure()
                } catch {
                    Bridge.log("META: Failed to configure SDK: \(error.localizedDescription)")
                    return
                }
            }
            
            // If glassesManager doesn't exist yet, create it
            if glassesManager == nil {
                Bridge.log("META: Creating MetaGlassesManager...")
                glassesManager = MetaGlassesManager()
                
                // Wait a moment for the manager to initialize
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
            
            guard let manager = glassesManager else {
                Bridge.log("META: ERROR - glassesManager is still nil after creation!")
                return
            }
            
            Bridge.log("META: Calling connect() on glassesManager...")
            do {
                try await manager.connect()
                Bridge.log("META: connect() completed - Meta AI app should have opened")
            } catch {
                Bridge.log("META: Failed to start registration: \(error.localizedDescription)")
            }
        }
    }
    
    func connectById(_ id: String) {
        Bridge.log("META: connectById \(id)")
        findCompatibleDevices()
    }
    
    func getConnectedBluetoothName() -> String? {
        return ready ? "Meta Ray-Ban" : nil
    }
    
    func cleanup() {
        Bridge.log("META: cleanup")
        stopVideoStream()
        cancellables.removeAll()
    }
    
    // MARK: - Network Management (Not applicable for Meta glasses)
    
    func requestWifiScan() {
        Bridge.log("META: requestWifiScan - not supported")
    }
    
    func sendWifiCredentials(_ ssid: String, _ password: String) {
        Bridge.log("META: sendWifiCredentials - not supported")
    }
    
    func sendHotspotState(_ enabled: Bool) {
        Bridge.log("META: sendHotspotState - not supported")
    }
    
    // MARK: - Gallery (Not applicable for Meta glasses)
    
    func queryGalleryStatus() {
        Bridge.log("META: queryGalleryStatus - not supported")
    }
    
    func sendGalleryMode() {
        Bridge.log("META: sendGalleryMode - not supported")
    }
    
    // MARK: - URL Handling
    
    /// Handle URL callback from Meta AI app
    /// - Parameter url: The callback URL from Meta AI app
    /// - Returns: Whether the URL was handled
    @MainActor
    static func handleUrl(_ url: URL) async -> Bool {
        Bridge.log("META: Handling URL callback: \(url)")
        do {
            return try await Wearables.shared.handleUrl(url)
        } catch {
            Bridge.log("META: Failed to handle URL: \(error.localizedDescription)")
            return false
        }
    }
}
