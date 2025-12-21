//
//  MetaGlassesProtocol.swift
//  MetaWearablesDAT
//
//  Created by Elijah Arbee on 12/20/25
//  Protocol abstraction for smart glasses providers.
//  Enables future multi-glasses support (Meta, HeyCyan, etc.)
//

import Foundation
import UIKit

/// Protocol for smart glasses device providers
/// Enables abstraction over different glasses SDKs (Meta, HeyCyan, etc.)
public protocol SmartGlassesProvider: AnyObject {
    /// Current connection state
    var connectionState: MetaConnectionState { get }
    
    /// Whether video streaming is active
    var isStreaming: Bool { get }
    
    /// List of discovered devices
    var discoveredDevices: [MetaDeviceInfo] { get }
    
    /// Connect to glasses via companion app registration
    func connect() async throws
    
    /// Disconnect from currently connected glasses
    func disconnect() async
    
    /// Start video streaming from glasses camera
    func startStreaming() async throws
    
    /// Stop video streaming
    func stopStreaming() async
    
    /// Capture a photo from glasses camera
    /// - Returns: Captured image, or nil if capture failed
    func capturePhoto() async throws -> UIImage?
    
    /// Request camera permission from glasses
    /// - Returns: Permission status after request
    func requestCameraPermission() async throws -> MetaPermissionStatus
}

/// Protocol for receiving video frames from glasses
public protocol VideoFrameReceiver: AnyObject {
    /// Called when a new video frame is received
    /// - Parameter frame: The video frame as UIImage
    func didReceiveVideoFrame(_ frame: UIImage)
    
    /// Called when streaming status changes
    /// - Parameter status: New streaming status
    func streamingStatusDidChange(_ status: StreamingStatus)
    
    /// Called when an error occurs during streaming
    /// - Parameter error: The streaming error
    func didEncounterStreamingError(_ error: MetaStreamingError)
}

/// Protocol for receiving device events
public protocol DeviceEventReceiver: AnyObject {
    /// Called when connection state changes
    /// - Parameter state: New connection state
    func connectionStateDidChange(_ state: MetaConnectionState)
    
    /// Called when devices are discovered
    /// - Parameter devices: List of discovered devices
    func didDiscoverDevices(_ devices: [MetaDeviceInfo])
    
    /// Called when a device compatibility issue is detected
    /// - Parameters:
    ///   - device: The device with compatibility issues
    ///   - message: Description of the compatibility issue
    func deviceCompatibilityIssue(_ device: MetaDeviceInfo, message: String)
}
