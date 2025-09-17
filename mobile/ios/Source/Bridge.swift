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

    static func sendAppStartedEvent(_ packageName: String) {
        let data = ["packageName": packageName]
        Bridge.sendTypedMessage("app_started", body: data)
    }

    static func sendAppStoppedEvent(_ packageName: String) {
        let data = ["packageName": packageName]
        Bridge.sendTypedMessage("app_stopped", body: data)
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
            case set_auth_secret_key
            case request_status
            case connect_wearable
            case disconnect_wearable
            case search_for_compatible_device_names
            case enable_contextual_dashboard
            case set_preferred_mic
            case set_button_mode
            case set_button_photo_size
            case set_button_video_settings
            case set_button_camera_led
            case ping
            case forget_smart_glasses
            case start_app
            case stop_app
            case update_glasses_head_up_angle
            case update_glasses_brightness
            case update_glasses_depth
            case update_glasses_height
            case enable_sensing
            case enable_power_saving_mode
            case enable_always_on_status_bar
            case bypass_vad_for_debugging
            case bypass_audio_encoding_for_debugging
            case enforce_local_transcription
            case set_server_url
            case set_metric_system_enabled
            case toggle_updating_screen
            case show_dashboard
            case request_wifi_scan
            case send_wifi_credentials
            case set_hotspot_state
            case query_gallery_status
            case simulate_head_position
            case simulate_button_press
            case start_buffer_recording
            case stop_buffer_recording
            case save_buffer_video
            case start_video_recording
            case stop_video_recording
            case set_stt_model_details
            case get_stt_model_path
            case check_stt_model_available
            case validate_stt_model
            case extract_tar_bz2
            case setup
            case display_event
            case display_text
            case update_settings
            case microphone_state_change
            case restart_transcriber
            case connect_livekit
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
                // TODO: config: remove
                case .set_server_url:
                    guard let params = params, let url = params["url"] as? String else {
                        Bridge.log("CommandBridge: set_server_url invalid params")
                        break
                    }
                    ServerComms.shared.setServerUrl(url)
                // TODO: config: remove
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
                case .display_text:
                    guard let params else {
                        Bridge.log("CommandBridge: display_text invalid params")
                        break
                    }
                    m.handle_display_text(params)
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
                case .enable_contextual_dashboard:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: enable_contextual_dashboard invalid params")
                        break
                    }
                    m.enableContextualDashboard(enabled)
                case .set_preferred_mic:
                    guard let params = params, let mic = params["mic"] as? String else {
                        Bridge.log("CommandBridge: set_preferred_mic invalid params")
                        break
                    }
                    m.setPreferredMic(mic)
                case .set_button_mode:
                    guard let params = params, let mode = params["mode"] as? String else {
                        Bridge.log("CommandBridge: set_button_mode invalid params")
                        break
                    }
                    m.setButtonMode(mode)
                case .set_button_photo_size:
                    guard let params = params, let size = params["size"] as? String else {
                        Bridge.log("CommandBridge: set_button_photo_size invalid params")
                        break
                    }
                    m.setButtonPhotoSize(size)
                case .set_button_video_settings:
                    guard let params = params,
                          let width = params["width"] as? Int,
                          let height = params["height"] as? Int,
                          let fps = params["fps"] as? Int
                    else {
                        Bridge.log("CommandBridge: set_button_video_settings invalid params")
                        break
                    }
                    m.setButtonVideoSettings(width: width, height: height, fps: fps)
                case .set_button_camera_led:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: set_button_camera_led invalid params")
                        break
                    }
                    m.setButtonCameraLed(enabled)
                case .start_app:
                    guard let params = params, let target = params["target"] as? String else {
                        Bridge.log("CommandBridge: start_app invalid params")
                        break
                    }
                    m.startApp(target)
                case .stop_app:
                    guard let params = params, let target = params["target"] as? String else {
                        Bridge.log("CommandBridge: stop_app invalid params")
                        break
                    }
                    m.stopApp(target)
                case .update_glasses_head_up_angle:
                    guard let params = params, let value = params["headUpAngle"] as? Int else {
                        Bridge.log("CommandBridge: update_glasses_head_up_angle invalid params")
                        break
                    }
                    m.updateGlassesHeadUpAngle(value)
                case .update_glasses_brightness:
                    guard let params = params, let value = params["brightness"] as? Int,
                          let autoBrightness = params["autoBrightness"] as? Bool
                    else {
                        Bridge.log("CommandBridge: update_glasses_brightness invalid params")
                        break
                    }
                    m.updateGlassesBrightness(value, autoBrightness: autoBrightness)
                case .update_glasses_height:
                    guard let params = params, let value = params["height"] as? Int else {
                        Bridge.log("CommandBridge: update_glasses_height invalid params")
                        break
                    }
                    m.updateGlassesHeight(value)
                case .show_dashboard:
                    m.showDashboard()
                case .update_glasses_depth:
                    guard let params = params, let value = params["depth"] as? Int else {
                        Bridge.log("CommandBridge: update_glasses_depth invalid params")
                        break
                    }
                    m.updateGlassesDepth(value)
                case .enable_sensing:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: enable_sensing invalid params")
                        break
                    }
                    m.enableSensing(enabled)
                case .enable_power_saving_mode:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: enable_power_saving_mode invalid params")
                        break
                    }
                    m.enablePowerSavingMode(enabled)
                case .enable_always_on_status_bar:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: enable_always_on_status_bar invalid params")
                        break
                    }
                    m.enableAlwaysOnStatusBar(enabled)
                case .bypass_vad_for_debugging:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: bypass_vad invalid params")
                        break
                    }
                    m.bypassVad(enabled)
                case .bypass_audio_encoding_for_debugging:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: bypass_audio_encoding invalid params")
                        break
                    }
                    m.setBypassAudioEncoding(enabled)
                case .set_metric_system_enabled:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: set_metric_system_enabled invalid params")
                        break
                    }
                    m.setMetricSystemEnabled(enabled)
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
                // TODO: config: remove
                case .simulate_head_position:
                    guard let params = params, let position = params["position"] as? String else {
                        Bridge.log("CommandBridge: simulate_head_position invalid params")
                        break
                    }
                    ServerComms.shared.sendHeadPosition(isUp: position == "up")
                    // Trigger dashboard display locally
                    m.sendCurrentState(position == "up")
                case .simulate_button_press:
                    guard let params = params,
                          let buttonId = params["buttonId"] as? String,
                          let pressType = params["pressType"] as? String
                    else {
                        Bridge.log("CommandBridge: simulate_button_press invalid params")
                        break
                    }
                    // Use existing sendButtonPress method
                    ServerComms.shared.sendButtonPress(buttonId: buttonId, pressType: pressType)
                case .enforce_local_transcription:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Bridge.log("CommandBridge: enforce_local_transcription invalid params")
                        break
                    }
                    m.enforceLocalTranscription(enabled)
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
                case .connect_livekit:
                    guard let params = params, let url = params["url"] as? String, let token = params["token"] as? String else {
                        Bridge.log("CommandBridge: connect_livekit invalid params")
                        break
                    }
                    Bridge.log("CommandBridge: Connecting to LiveKit: \(url)")
                    LiveKitManager.shared.connect(url: url, token: token)
                }
            }
        } catch {
            Bridge.log("CommandBridge: Error parsing JSON command: \(error.localizedDescription)")
        }
        return 0
    }
}
