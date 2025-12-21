//
//  MetaWearablesDAT.swift
//  MetaWearablesDAT
//
//  Created by Elijah Arbee on 12/20/25
//  Meta Ray-Ban Smart Glasses integration framework for CaringMind.
//  Wraps the Meta Wearables DAT SDK for device connection and video streaming.
//

import Foundation
import MWDATCore

/// Framework configuration and initialization.
/// 
/// This framework provides integration with Meta Ray-Ban smart glasses
/// using the Meta Wearables DAT SDK.
///
/// ## Usage
/// ```swift
/// import MetaWearablesDAT
/// 
/// // Initialize the SDK
/// try MetaWearablesDATSDK.configure()
///
/// // Create manager
/// let manager = MetaGlassesManager()
/// ```
public enum MetaWearablesDATSDK {
    /// Framework version
    public static let version = "0.3.0"
    
    /// Whether the SDK has been configured
    public private(set) static var isConfigured = false
    
    /// Configure the Meta Wearables SDK.
    /// Call this once at app startup before using any other framework APIs.
    /// - Throws: ConfigurationError if SDK initialization fails
    @MainActor
    public static func configure() throws {
        do {
            try Wearables.configure()
            isConfigured = true
        } catch {
            throw ConfigurationError.sdkInitializationFailed(error)
        }
    }
}

// MARK: - Errors

public enum ConfigurationError: Error, LocalizedError {
    case sdkInitializationFailed(Error)
    case sdkNotConfigured
    
    public var errorDescription: String? {
        switch self {
        case .sdkInitializationFailed(let error):
            return "Failed to initialize Meta Wearables SDK: \(error.localizedDescription)"
        case .sdkNotConfigured:
            return "MetaWearablesDATSDK.configure() must be called before using the framework"
        }
    }
}
