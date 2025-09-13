//
//  Bridge.swift
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

import Foundation
import React

// Use BridgeModule to emit events
// has commands for the core to use to send messages to the mantle
// also has a handleCommand function for the core / bridge module to use to
// communicate with the rest of the core
@objc(Bridge)
class Bridge: RCTEventEmitter {
    override init() {
        super.init()
    }

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    static func log(_ message: String) {
        let msg = "SWIFT:\(message)"
        BridgeModule.emitEvent(withName: "CoreMessageEvent", body: msg)
    }

    static func sendEvent(withName: String, body: String) {
        BridgeModule.emitEvent(withName: withName, body: body)
    }

    static func showBanner(type: String, message: String) {
        let data = ["type": type, "message": message] as [String: Any]
        Bridge.sendTypedMessage("show_banner", body: data)
    }

    static func sendHeadPosition(_ isUp: Bool) {
        let data = ["position": isUp ? "up" : "down"]
        Bridge.sendTypedMessage("head_position", body: data)
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

    static func sendCalendarEvent(_ calendarItem: CalendarItem) {
        do {
            let event: [String: Any] = [
                "type": "calendar_event",
                "title": calendarItem.title,
                "eventId": calendarItem.eventId,
                "dtStart": calendarItem.dtStart,
                "dtEnd": calendarItem.dtEnd,
                "timeZone": calendarItem.timeZone,
                "timestamp": Int(Date().timeIntervalSince1970),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("Error building calendar_event JSON: \(error)")
        }
    }

    static func sendCalendarEvents() {
        Task {
            if let events = await CalendarManager.shared.fetchUpcomingEvents(days: 2) {
                guard events.count > 0 else { return }
                // Send up to 5 events
                let eventsToSend = events.prefix(5)
                for event in eventsToSend {
                    let calendarItem = convertEKEventToCalendarItem(event)
                    Bridge.log("CALENDAR EVENT \(calendarItem)")
                    Bridge.sendCalendarEvent(calendarItem)
                }
            }
        }
    }

    static func sendLocationUpdate(lat: Double, lng: Double, accuracy: Double?, correlationId: String?) {
        do {
            var event: [String: Any] = [
                "type": "location_update",
                "lat": lat,
                "lng": lng,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            if let acc = accuracy {
                event["accuracy"] = acc
            }

            if let corrId = correlationId {
                event["correlationId"] = corrId
            }

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building location_update JSON: \(error)")
        }
    }

    static func sendGlassesConnectionState(modelName: String, status: String) {
        do {
            let event: [String: Any] = [
                "type": "glasses_connection_state",
                "modelName": modelName,
                "status": status,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]
            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building location_update JSON: \(error)")
        }
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

    func sendCoreStatus(status: [String: Any]) {
        do {
            let event: [String: Any] = [
                "type": "core_status_update",
                "status": ["status": status],
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building core_status_update JSON: \(error)")
        }
    }

    func sendAudioPlayResponse(requestId: String, success: Bool, error: String? = nil, duration: Double? = nil) {
        Bridge.log("ServerComms: Sending audio play response - requestId: \(requestId), success: \(success), error: \(error ?? "none")")
        let message: [String: Any] = [
            "type": "audio_play_response",
            "requestId": requestId,
            "success": success,
            "error": error as Any,
            "duration": duration as Any,
        ].compactMapValues { $0 }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: message)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
                Bridge.log("ServerComms: Sent audio play response to server")
            }
        } catch {
            Bridge.log("ServerComms: Failed to serialize audio play response: \(error)")
        }
    }

    // MARK: - App Lifecycle

    func startApp(packageName: String) {
        do {
            let msg: [String: Any] = [
                "type": "start_app",
                "packageName": packageName,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: msg)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building start_app JSON: \(error)")
        }
    }

    func stopApp(packageName: String) {
        do {
            let msg: [String: Any] = [
                "type": "stop_app",
                "packageName": packageName,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: msg)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building stop_app JSON: \(error)")
        }
    }

    // MARK: - Hardware Events

    static func sendButtonPress(buttonId: String, pressType: String) {
        do {
            let event: [String: Any] = [
                "type": "button_press",
                "buttonId": buttonId,
                "pressType": pressType,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building button_press JSON: \(error)")
        }
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
    static func sendTranscriptionResult(transcription: [String: Any]) {
        guard let text = transcription["text"] as? String, !text.isEmpty else {
            Bridge.log("Skipping empty transcription result")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: transcription)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Bridge.sendWSText(jsonString)

                let isFinal = transcription["isFinal"] as? Bool ?? false
                Bridge.log("Sent \(isFinal ? "final" : "partial") transcription: '\(text)'")
            }
        } catch {
            Bridge.log("Error sending transcription result: \(error)")
        }
    }

    // core bridge funcs:

    override func supportedEvents() -> [String] {
        // don't add to this list, use a typed message instead
        return ["CoreMessageEvent", "WIFI_SCAN_RESULTS"]
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
        BridgeModule.emitEvent(withName: "CoreMessageEvent", body: jsonString!)
    }

    // handle commands from the mantle:
    @objc static func handleCommand(_ command: String) -> Any {
        // Bridge.log("CommandBridge: Received command: \(command)")
        let m = MentraManager.shared

        // Define command types enum
        enum CommandType: String {
            case request_status
            case connect_wearable
            case disconnect_wearable
            case search_for_compatible_device_names
            case ping
            case forget_smart_glasses
            case toggle_updating_screen
            case show_dashboard
            case request_wifi_scan
            case send_wifi_credentials
            case set_hotspot_state
            case query_gallery_status
            case start_buffer_recording
            case stop_buffer_recording
            case save_buffer_video
            case start_video_recording
            case stop_video_recording
            case set_auth_secret_key
            case set_stt_model_details
            case get_stt_model_path
            case check_stt_model_available
            case validate_stt_model
            case extract_tar_bz2
            case setup
            case display_event
            case update_settings
            case microphone_state_change
            case restart_transcriber
            case unknown
        }

        // Try to parse JSON
        guard let data = command.data(using: .utf8) else {
            Bridge.log("CommandBridge: Could not convert command string to data")
            return 0
        }

        do {
            if let jsonDict = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                // Extract command type
                guard let commandString = jsonDict["command"] as? String else {
                    Bridge.log("CommandBridge: Invalid command format: missing 'command' field")
                    return 0
                }

                let commandType = CommandType(rawValue: commandString) ?? .unknown
                let params = jsonDict["params"] as? [String: Any]

                // Process based on command type
                switch commandType {
                case .setup:
                    m.setup()
                case .set_auth_secret_key:
                    guard let params = params,
                          let userId = params["userId"] as? String,
                          let authSecretKey = params["authSecretKey"] as? String
                    else {
                        Bridge.log("CommandBridge: set_auth_secret_key invalid params")
                        break
                    }
                    m.setAuthCreds(authSecretKey, userId)
                case .display_event:
                    guard let params else {
                        Bridge.log("CommandBridge: display_event invalid params")
                        break
                    }
                    m.handle_display_event(params)
                case .request_status:
                    m.handleRequestStatus()
                case .connect_wearable:
                    guard let params = params, let modelName = params["model_name"] as? String,
                          let deviceName = params["device_name"] as? String
                    else {
                        Bridge.log("CommandBridge: connect_wearable invalid params")
                        m.handleConnectWearable("")
                        break
                    }
                    m.handleConnectWearable(deviceName, modelName: modelName)
                case .disconnect_wearable:
                    m.disconnectWearable()
                case .forget_smart_glasses:
                    m.forgetSmartGlasses()
                case .search_for_compatible_device_names:
                    guard let params = params, let modelName = params["model_name"] as? String else {
                        Bridge.log("CommandBridge: search_for_compatible_device_names invalid params")
                        break
                    }
                    m.handleSearchForCompatibleDeviceNames(modelName)
                case .show_dashboard:
                    m.showDashboard()
                case .toggle_updating_screen:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: toggle_updating_screen invalid params")
                        break
                    }
                    m.toggleUpdatingScreen(enabled)
                case .request_wifi_scan:
                    m.requestWifiScan()
                case .send_wifi_credentials:
                    guard let params = params, let ssid = params["ssid"] as? String,
                          let password = params["password"] as? String
                    else {
                        Bridge.log("CommandBridge: send_wifi_credentials invalid params")
                        break
                    }
                    m.sendWifiCredentials(ssid, password)
                case .set_hotspot_state:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: set_hotspot_state invalid params")
                        break
                    }
                    m.setGlassesHotspotState(enabled)
                case .query_gallery_status:
                    Bridge.log("CommandBridge: Querying gallery status")
                    m.queryGalleryStatus()
                case .start_buffer_recording:
                    Bridge.log("CommandBridge: Starting buffer recording")
                    m.startBufferRecording()
                case .stop_buffer_recording:
                    Bridge.log("CommandBridge: Stopping buffer recording")
                    m.stopBufferRecording()
                case .save_buffer_video:
                    guard let params = params,
                          let requestId = params["request_id"] as? String,
                          let durationSeconds = params["duration_seconds"] as? Int
                    else {
                        Bridge.log("CommandBridge: save_buffer_video invalid params")
                        break
                    }
                    Bridge.log("CommandBridge: Saving buffer video: requestId=\(requestId), duration=\(durationSeconds)s")
                    m.saveBufferVideo(requestId: requestId, durationSeconds: durationSeconds)
                case .start_video_recording:
                    guard let params = params,
                          let requestId = params["request_id"] as? String,
                          let save = params["save"] as? Bool
                    else {
                        Bridge.log("CommandBridge: start_video_recording invalid params")
                        break
                    }
                    Bridge.log("CommandBridge: Starting video recording: requestId=\(requestId), save=\(save)")
                    m.startVideoRecording(requestId: requestId, save: save)
                case .stop_video_recording:
                    guard let params = params,
                          let requestId = params["request_id"] as? String
                    else {
                        Bridge.log("CommandBridge: stop_video_recording invalid params")
                        break
                    }
                    Bridge.log("CommandBridge: Stopping video recording: requestId=\(requestId)")
                    m.stopVideoRecording(requestId: requestId)
                case .unknown:
                    Bridge.log("CommandBridge: Unknown command type: \(commandString)")
                    m.handleRequestStatus()
                case .ping:
                    break
                case .set_stt_model_details:
                    guard let params = params,
                          let path = params["path"] as? String,
                          let languageCode = params["languageCode"] as? String
                    else {
                        Bridge.log("CommandBridge: set_stt_model_details invalid params")
                        break
                    }
                    m.setSttModelDetails(path, languageCode)
                case .get_stt_model_path:
                    return m.getSttModelPath()
                case .check_stt_model_available:
                    return m.checkSTTModelAvailable()
                case .validate_stt_model:
                    guard let params = params,
                          let path = params["path"] as? String
                    else {
                        Bridge.log("CommandBridge: validate_stt_model invalid params")
                        break
                    }
                    return m.validateSTTModel(path)
                case .extract_tar_bz2:
                    guard let params = params,
                          let sourcePath = params["source_path"] as? String,
                          let destinationPath = params["destination_path"] as? String
                    else {
                        Bridge.log("CommandBridge: extract_tar_bz2 invalid params")
                        break
                    }
                    return m.extractTarBz2(sourcePath: sourcePath, destinationPath: destinationPath)
                case .microphone_state_change:
                    guard let msg = params else {
                        Bridge.log("CommandBridge: microphone_state_change invalid params")
                        break
                    }

                    let bypassVad = msg["bypassVad"] as? Bool ?? false
                    var requiredDataStrings: [String] = []
                    if let requiredDataArray = msg["requiredData"] as? [String] {
                        requiredDataStrings = requiredDataArray
                    } else if let requiredDataArray = msg["requiredData"] as? [Any] {
                        // Handle case where it might come as mixed array
                        requiredDataStrings = requiredDataArray.compactMap { $0 as? String }
                    }
                    // Convert string array to enum array
                    var requiredData = SpeechRequiredDataType.fromStringArray(requiredDataStrings)
                    Bridge.log("ServerComms: requiredData = \(requiredDataStrings), bypassVad = \(bypassVad)")
                    m.handle_microphone_state_change(requiredData, bypassVad)
                case .update_settings:
                    guard let params else {
                        Bridge.log("CommandBridge: update_settings invalid params")
                        break
                    }
                    m.handle_update_settings(params)
                case .restart_transcriber:
                    m.restartTranscriber()
                }
            }
        } catch {
            Bridge.log("CommandBridge: Error parsing JSON command: \(error.localizedDescription)")
        }
        return 0
    }
}
