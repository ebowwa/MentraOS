//
//  MetaDeviceInfo.swift
//  MetaWearablesDAT
//
//  Device information models for Meta glasses.
//  Created by Elijah Arbee on 12/20/25
//

import Foundation
import MWDATCore

// MARK: - Connection State

/// Unified connection state for Meta glasses
public enum MetaConnectionState: Equatable, Sendable {
    case disconnected
    case registering
    case registered
    case connecting
    case connected
    case unregistering
    
    public var isConnected: Bool {
        self == .connected
    }
    
    public var displayName: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .registering: return "Registering..."
        case .registered: return "Registered"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .unregistering: return "Disconnecting..."
        }
    }
}

// MARK: - Streaming Status

/// Status of video streaming session
public enum StreamingStatus: Equatable, Sendable {
    case stopped
    case waiting
    case streaming
    
    public var isActive: Bool {
        self == .streaming
    }
}

// MARK: - Device Info

/// Information about a connected Meta glasses device
public struct MetaDeviceInfo: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public var isCompatible: Bool
    
    public init(id: String, name: String, isCompatible: Bool = true) {
        self.id = id
        self.name = name
        self.isCompatible = isCompatible
    }
}

// MARK: - Stream Time Limit

/// Time limit configuration for streaming sessions
public enum StreamTimeLimit: Equatable, Sendable {
    case noLimit
    case seconds(Int)
    case minutes(Int)
    
    public var durationInSeconds: TimeInterval? {
        switch self {
        case .noLimit: return nil
        case .seconds(let s): return TimeInterval(s)
        case .minutes(let m): return TimeInterval(m * 60)
        }
    }
    
    public var isTimeLimited: Bool {
        self != .noLimit
    }
}

// MARK: - Permission Status

/// Camera permission status for Meta glasses
public enum MetaPermissionStatus: Equatable, Sendable {
    case notDetermined
    case denied
    case granted
    
    public var isGranted: Bool {
        self == .granted
    }
}

// MARK: - Streaming Error

/// Errors that can occur during streaming
public enum MetaStreamingError: Error, LocalizedError, Sendable {
    case deviceNotFound
    case deviceNotConnected
    case permissionDenied
    case timeout
    case videoStreamingFailed
    case internalError(String)
    
    public var errorDescription: String? {
        switch self {
        case .deviceNotFound:
            return "Device not found. Please ensure your glasses are nearby."
        case .deviceNotConnected:
            return "Device not connected. Please check your connection."
        case .permissionDenied:
            return "Camera permission denied. Please grant permission in Settings."
        case .timeout:
            return "Connection timed out. Please try again."
        case .videoStreamingFailed:
            return "Video streaming failed. Please try again."
        case .internalError(let message):
            return "An internal error occurred: \(message)"
        }
    }
}
