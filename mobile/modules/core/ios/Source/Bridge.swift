//
//  Bridge.swift
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

import Foundation
import UIKit

// Bridge for core communication between Expo modules and native iOS code
// Has commands for the core to use to send messages to JavaScript
class Bridge {
    // Event callback for sending events to JS
    static var eventCallback: ((String, [String: Any]) -> Void)?

    static func initialize(callback: @escaping (String, [String: Any]) -> Void) {
        eventCallback = callback
    }

    static func log(_ message: String) {
        let msg = "CORE:\(message)"
        let data: [String: Any] = ["body": msg]
        eventCallback?("CoreMessageEvent", data)
    }

    static func sendEvent(withName: String, body: String) {
        let data: [String: Any] = ["body": body]
        eventCallback?(withName, data)
    }

    static func showBanner(type: String, message: String) {
        let data = ["type": type, "message": message] as [String: Any]
        Bridge.sendTypedMessage("show_banner", body: data)
    }

    static func sendHeadUp(_ isUp: Bool) {
        let data = ["up": isUp]
        Bridge.sendTypedMessage("head_up", body: data)
    }

    static func sendPairFailureEvent(_ error: String) {
        let data = ["error": error]
        Bridge.sendTypedMessage("pair_failure", body: data)
    }

    static func sendMicData(_ data: Data) {
        let base64String = data.base64EncodedString()
        let body = ["base64": base64String]
        Bridge.sendTypedMessage("mic_data", body: body)
    }

    static func saveSetting(_ key: String, _ value: Any) {
        let body = ["key": key, "value": value]
        Bridge.sendTypedMessage("save_setting", body: body)
    }

    static func sendVadStatus(_ isSpeaking: Bool) {
        let vadMsg: [String: Any] = [
            "type": "VAD",
            "status": isSpeaking,
        ]

        let jsonData = try! JSONSerialization.data(withJSONObject: vadMsg)
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            Bridge.sendWSText(jsonString)
        }
    }

    static func sendBatteryStatus(level: Int, charging: Bool) {
        let vadMsg: [String: Any] = [
            "type": "glasses_battery_update",
            "level": level,
            "charging": charging,
            "timestamp": Date().timeIntervalSince1970 * 1000,
            // TODO: time remaining
        ]

        let jsonData = try! JSONSerialization.data(withJSONObject: vadMsg)
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            Bridge.sendWSText(jsonString)
        }
    }

    static func sendDiscoveredDevice(_ modelName: String, _ deviceName: String) {
        let eventBody: [String: Any] = [
            "model_name": modelName,
            "device_name": deviceName,
        ]
        sendTypedMessage("compatible_glasses_search_result", body: eventBody)
    }

    static func updateAsrConfig(languages: [[String: Any]]) {
        do {
            let configMsg: [String: Any] = [
                "type": "config",
                "streams": languages,
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: configMsg)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building config message: \(error)")
        }
    }

    // MARK: - Hardware Events

    static func sendButtonPress(buttonId: String, pressType: String) {
        // Send as typed message so it gets handled locally by MantleBridge.tsx
        // This allows the React Native layer to process it before forwarding to server
        let body: [String: Any] = [
            "buttonId": buttonId,
            "pressType": pressType,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        ]
        Bridge.sendTypedMessage("button_press", body: body)
    }

    static func sendTouchEvent(deviceModel: String, gestureName: String, timestamp: Int64) {
        let body: [String: Any] = [
            "device_model": deviceModel,
            "gesture_name": gestureName,
            "timestamp": timestamp,
        ]
        Bridge.sendTypedMessage("touch_event", body: body)
    }

    static func sendSwipeVolumeStatus(enabled: Bool, timestamp: Int64) {
        let body: [String: Any] = [
            "enabled": enabled,
            "timestamp": timestamp,
        ]
        Bridge.sendTypedMessage("swipe_volume_status", body: body)
    }

    static func sendSwitchStatus(switchType: Int, value: Int, timestamp: Int64) {
        let body: [String: Any] = [
            "switch_type": switchType,
            "switch_value": value,
            "timestamp": timestamp,
        ]
        Bridge.sendTypedMessage("switch_status", body: body)
    }

    static func sendRgbLedControlResponse(requestId: String, success: Bool, error: String?) {
        guard !requestId.isEmpty else { return }
        var body: [String: Any] = [
            "requestId": requestId,
            "success": success,
        ]
        if let error {
            body["error"] = error
        }
        Bridge.sendTypedMessage("rgb_led_control_response", body: body)
    }

    static func sendPhotoResponse(requestId: String, photoUrl: String) {
        do {
            let event: [String: Any] = [
                "type": "photo_response",
                "requestId": requestId,
                "photoUrl": photoUrl,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building photo_response JSON: \(error)")
        }
    }

    static func sendVideoStreamResponse(appId: String, streamUrl: String) {
        do {
            let event: [String: Any] = [
                "type": "video_stream_response",
                "appId": appId,
                "streamUrl": streamUrl,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building video_stream_response JSON: \(error)")
        }
    }

    static func sendHeadPosition(isUp: Bool) {
        do {
            let event: [String: Any] = [
                "type": "head_position",
                "position": isUp ? "up" : "down",
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error sending head position: \(error)")
        }
    }

    /**
     * Send transcription result to server
     * Used by AOSManager to send pre-formatted transcription results
     * Matches the Java ServerComms structure exactly
     */
    static func sendLocalTranscription(transcription: [String: Any]) {
        guard let text = transcription["text"] as? String, !text.isEmpty else {
            Bridge.log("Skipping empty transcription result")
            return
        }

        Bridge.sendTypedMessage("local_transcription", body: transcription)
    }

    // core bridge funcs:

    static func sendStatus(_ statusObj: [String: Any]) {
        let body = ["core_status": statusObj]
        Bridge.sendTypedMessage("core_status_update", body: body)
    }

    static func sendGlassesSerialNumber(_ serialNumber: String, style: String, color: String) {
        let body = [
            "glasses_serial_number": [
                "serial_number": serialNumber,
                "style": style,
                "color": color,
            ],
        ]
        Bridge.sendTypedMessage("glasses_serial_number", body: body)
    }

    static func sendWifiStatusChange(connected: Bool, ssid: String?, localIp: String?) {
        let event: [String: Any] = [
            "connected": connected,
            "ssid": ssid,
            "local_ip": localIp,
        ]
        Bridge.sendTypedMessage("wifi_status_change", body: event)
    }

    static func sendWifiScanResults(_ networks: [[String: Any]]) {
        let eventBody: [String: Any] = [
            "networks": networks,
        ]
        Bridge.sendTypedMessage("wifi_scan_results", body: eventBody)
    }

    static func sendMtkUpdateComplete(message: String, timestamp: Int64) {
        let eventBody: [String: Any] = [
            "message": message,
            "timestamp": timestamp,
        ]
        Bridge.sendTypedMessage("mtk_update_complete", body: eventBody)
    }

    // MARK: - Video Frame Streaming
    
    private static var lastFrameTime: Date = .distantPast
    private static var frameInterval: TimeInterval = 0.1 // 10 fps default
    private static var cloudStreamingEnabled: Bool = true
    
    /// Configure video frame streaming settings
    static func configureVideoStreaming(enabled: Bool, fps: Int = 10) {
        cloudStreamingEnabled = enabled
        frameInterval = 1.0 / Double(max(1, min(fps, 30))) // Clamp 1-30 fps
        log("Bridge: Video streaming configured - enabled: \(enabled), fps: \(fps)")
    }
    
    /// Send a video frame to the cloud server via React Native bridge
    /// Automatically throttles based on configured frame rate
    static func sendVideoFrame(_ imageData: Data, quality: Double = 0.5) {
        guard cloudStreamingEnabled else { return }
        
        // Throttle frames
        let now = Date()
        guard now.timeIntervalSince(lastFrameTime) >= frameInterval else { return }
        lastFrameTime = now
        
        let base64String = imageData.base64EncodedString()
        let body: [String: Any] = [
            "base64": base64String,
            "quality": quality,
            "timestamp": Int(now.timeIntervalSince1970 * 1000),
        ]
        Bridge.sendTypedMessage("video_frame", body: body)
    }
    
    /// Send a video frame from UIImage (convenience method)
    static func sendVideoFrame(_ image: UIImage, quality: Double = 0.5) {
        guard let jpegData = image.jpegData(compressionQuality: CGFloat(quality)) else { return }
        sendVideoFrame(jpegData, quality: quality)
    }

    // Arbitrary WS Comms (dont use these, make a dedicated function for your use case):
    static func sendWSText(_ msg: String) {
        let data = ["text": msg]
        Bridge.sendTypedMessage("ws_text", body: data)
    }

    static func sendWSBinary(_ data: Data) {
        let base64String = data.base64EncodedString()
        let body = ["base64": base64String]
        Bridge.sendTypedMessage("ws_bin", body: body)
    }

    // don't call this function directly, instead
    // make a function above that calls this function:
    static func sendTypedMessage(_ type: String, body: [String: Any]) {
        var body = body
        body["type"] = type
        let jsonData = try! JSONSerialization.data(withJSONObject: body)
        let jsonString = String(data: jsonData, encoding: .utf8)
        let data: [String: Any] = ["body": jsonString!]
        eventCallback?("CoreMessageEvent", data)
    }
}
