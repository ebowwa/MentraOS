//
//  CommandBridge.swift
//
//  Created by Matthew Fosse on 8/20/25.
//

import Foundation

@objc(CommandBridge) class CommandBridge: NSObject {
    private static var instance: CommandBridge?

    @objc static func getInstance() -> CommandBridge {
        if instance == nil {
            instance = CommandBridge()
        }
        return instance!
    }

    @objc func handleCommand(_ command: String) {
        Core.log("BRIDGE: Received command: \(command)")

        let m = MentraManager.getInstance()

        // Define command types enum
        enum CommandType: String {
            case setAuthSecretKey = "set_auth_secret_key"
            case requestStatus = "request_status"
            case connectWearable = "connect_wearable"
            case disconnectWearable = "disconnect_wearable"
            case searchForCompatibleDeviceNames = "search_for_compatible_device_names"
            case enableContextualDashboard = "enable_contextual_dashboard"
            case setPreferredMic = "set_preferred_mic"
            case setButtonMode = "set_button_mode"
            case setButtonPhotoSize = "set_button_photo_size"
            case setButtonVideoSettings = "set_button_video_settings"
            case setButtonCameraLed = "set_button_camera_led"
            case ping
            case forgetSmartGlasses = "forget_smart_glasses"
            case startApp = "start_app"
            case stopApp = "stop_app"
            case updateGlassesHeadUpAngle = "update_glasses_head_up_angle"
            case updateGlassesBrightness = "update_glasses_brightness"
            case updateGlassesDepth = "update_glasses_depth"
            case updateGlassesHeight = "update_glasses_height"
            case enableSensing = "enable_sensing"
            case enablePowerSavingMode = "enable_power_saving_mode"
            case enableAlwaysOnStatusBar = "enable_always_on_status_bar"
            case bypassVad = "bypass_vad_for_debugging"
            case bypassAudioEncoding = "bypass_audio_encoding_for_debugging"
            case enforceLocalTranscription = "enforce_local_transcription"
            case setServerUrl = "set_server_url"
            case setMetricSystemEnabled = "set_metric_system_enabled"
            case toggleUpdatingScreen = "toggle_updating_screen"
            case showDashboard = "show_dashboard"
            case requestWifiScan = "request_wifi_scan"
            case sendWifiCredentials = "send_wifi_credentials"
            case simulateHeadPosition = "simulate_head_position"
            case simulateButtonPress = "simulate_button_press"
            case startBufferRecording = "start_buffer_recording"
            case stopBufferRecording = "stop_buffer_recording"
            case saveBufferVideo = "save_buffer_video"
            case startVideoRecording = "start_video_recording"
            case stopVideoRecording = "stop_video_recording"
            case set_stt_model_path
            case unknown
        }

        // Try to parse JSON
        guard let data = command.data(using: .utf8) else {
            Core.log("AOS: Could not convert command string to data")
            return
        }

        do {
            if let jsonDict = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                // Extract command type
                guard let commandString = jsonDict["command"] as? String else {
                    Core.log("AOS: Invalid command format: missing 'command' field")
                    return
                }

                let commandType = CommandType(rawValue: commandString) ?? .unknown
                let params = jsonDict["params"] as? [String: Any]

                // Process based on command type
                switch commandType {
                case .setServerUrl:
                    guard let params = params, let url = params["url"] as? String else {
                        Core.log("AOS: set_server_url invalid params")
                        break
                    }
                    m.setServerUrl(url: url)
                case .setAuthSecretKey:
                    guard let params = params,
                          let userId = params["userId"] as? String,
                          let authSecretKey = params["authSecretKey"] as? String
                    else {
                        Core.log("AOS: set_auth_secret_key invalid params")
                        break
                    }
                    m.setAuthSecretKey(secretKey: authSecretKey, userId: userId)
                case .requestStatus:
                    m.handleRequestStatus()
                case .connectWearable:
                    guard let params = params, let modelName = params["model_name"] as? String, let deviceName = params["device_name"] as? String else {
                        Core.log("AOS: connect_wearable invalid params")
                        m.handleConnectWearable("")
                        break
                    }
                    m.handleConnectWearable(deviceName, modelName: modelName)
                case .disconnectWearable:
                    m.disconnectWearable()
                case .forgetSmartGlasses:
                    m.forgetSmartGlasses()
                case .searchForCompatibleDeviceNames:
                    guard let params = params, let modelName = params["model_name"] as? String else {
                        Core.log("AOS: search_for_compatible_device_names invalid params")
                        break
                    }
                    m.handleSearchForCompatibleDeviceNames(modelName)
                case .enableContextualDashboard:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: enable_contextual_dashboard invalid params")
                        break
                    }
                    m.enableContextualDashboard(enabled)
                case .setPreferredMic:
                    guard let params = params, let mic = params["mic"] as? String else {
                        Core.log("AOS: set_preferred_mic invalid params")
                        break
                    }
                    m.setPreferredMic(mic)
                case .setButtonMode:
                    guard let params = params, let mode = params["mode"] as? String else {
                        Core.log("AOS: set_button_mode invalid params")
                        break
                    }
                    m.setButtonMode(mode)
                case .setButtonPhotoSize:
                    guard let params = params, let size = params["size"] as? String else {
                        Core.log("AOS: set_button_photo_size invalid params")
                        break
                    }
                    m.setButtonPhotoSize(size)
                case .setButtonVideoSettings:
                    guard let params = params,
                          let width = params["width"] as? Int,
                          let height = params["height"] as? Int,
                          let fps = params["fps"] as? Int
                    else {
                        Core.log("AOS: set_button_video_settings invalid params")
                        break
                    }
                    m.setButtonVideoSettings(width: width, height: height, fps: fps)
                case .setButtonCameraLed:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: set_button_camera_led invalid params")
                        break
                    }
                    m.setButtonCameraLed(enabled)
                case .startApp:
                    guard let params = params, let target = params["target"] as? String else {
                        Core.log("AOS: start_app invalid params")
                        break
                    }
                    m.startApp(target)
                case .stopApp:
                    guard let params = params, let target = params["target"] as? String else {
                        Core.log("AOS: stop_app invalid params")
                        break
                    }
                    m.stopApp(target)
                case .updateGlassesHeadUpAngle:
                    guard let params = params, let value = params["headUpAngle"] as? Int else {
                        Core.log("AOS: update_glasses_head_up_angle invalid params")
                        break
                    }
                    m.updateGlassesHeadUpAngle(value)
                case .updateGlassesBrightness:
                    guard let params = params, let value = params["brightness"] as? Int, let autoBrightness = params["autoBrightness"] as? Bool else {
                        Core.log("AOS: update_glasses_brightness invalid params")
                        break
                    }
                    m.updateGlassesBrightness(value, autoBrightness: autoBrightness)
                case .updateGlassesHeight:
                    guard let params = params, let value = params["height"] as? Int else {
                        Core.log("AOS: update_glasses_height invalid params")
                        break
                    }
                    m.updateGlassesHeight(value)
                case .showDashboard:
                    m.showDashboard()
                case .updateGlassesDepth:
                    guard let params = params, let value = params["depth"] as? Int else {
                        Core.log("AOS: update_glasses_depth invalid params")
                        break
                    }
                    m.updateGlassesDepth(value)
                case .enableSensing:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: enable_sensing invalid params")
                        break
                    }
                    m.enableSensing(enabled)
                case .enablePowerSavingMode:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: enable_power_saving_mode invalid params")
                        break
                    }
                    m.enablePowerSavingMode(enabled)
                case .enableAlwaysOnStatusBar:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: enable_always_on_status_bar invalid params")
                        break
                    }
                    m.enableAlwaysOnStatusBar(enabled)
                case .bypassVad:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: bypass_vad invalid params")
                        break
                    }
                    m.bypassVad(enabled)
                case .bypassAudioEncoding:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: bypass_audio_encoding invalid params")
                        break
                    }
                    m.setBypassAudioEncoding(enabled)
                case .setMetricSystemEnabled:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: set_metric_system_enabled invalid params")
                        break
                    }
                    m.setMetricSystemEnabled(enabled)
                case .toggleUpdatingScreen:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: toggle_updating_screen invalid params")
                        break
                    }
                    m.toggleUpdatingScreen(enabled)
                case .requestWifiScan:
                    m.requestWifiScan()
                case .sendWifiCredentials:
                    guard let params = params, let ssid = params["ssid"] as? String, let password = params["password"] as? String else {
                        Core.log("AOS: send_wifi_credentials invalid params")
                        break
                    }
                    m.sendWifiCredentials(ssid, password)
                case .simulateHeadPosition:
                    guard let params = params, let position = params["position"] as? String else {
                        Core.log("AOS: simulate_head_position invalid params")
                        break
                    }
                    // Send to server
                    ServerComms.getInstance().sendHeadPosition(isUp: position == "up")
                    // Trigger dashboard display locally
                    m.sendCurrentState(position == "up")
                case .simulateButtonPress:
                    guard let params = params,
                          let buttonId = params["buttonId"] as? String,
                          let pressType = params["pressType"] as? String
                    else {
                        Core.log("AOS: simulate_button_press invalid params")
                        break
                    }
                    // Use existing sendButtonPress method
                    ServerComms.getInstance().sendButtonPress(buttonId: buttonId, pressType: pressType)
                case .enforceLocalTranscription:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("AOS: enforce_local_transcription invalid params")
                        break
                    }
                    m.enforceLocalTranscription(enabled)
                case .startBufferRecording:
                    Core.log("AOS: Starting buffer recording")
                    m.startBufferRecording()
                case .stopBufferRecording:
                    Core.log("AOS: Stopping buffer recording")
                    m.stopBufferRecording()
                case .saveBufferVideo:
                    guard let params = params,
                          let requestId = params["request_id"] as? String,
                          let durationSeconds = params["duration_seconds"] as? Int
                    else {
                        Core.log("AOS: save_buffer_video invalid params")
                        break
                    }
                    Core.log("AOS: Saving buffer video: requestId=\(requestId), duration=\(durationSeconds)s")
                    m.saveBufferVideo(requestId: requestId, durationSeconds: durationSeconds)
                case .startVideoRecording:
                    guard let params = params,
                          let requestId = params["request_id"] as? String,
                          let save = params["save"] as? Bool
                    else {
                        Core.log("AOS: start_video_recording invalid params")
                        break
                    }
                    Core.log("AOS: Starting video recording: requestId=\(requestId), save=\(save)")
                    m.startVideoRecording(requestId: requestId, save: save)
                case .stopVideoRecording:
                    guard let params = params,
                          let requestId = params["request_id"] as? String
                    else {
                        Core.log("AOS: stop_video_recording invalid params")
                        break
                    }
                    Core.log("AOS: Stopping video recording: requestId=\(requestId)")
                    m.stopVideoRecording(requestId: requestId)
                case .unknown:
                    Core.log("AOS: Unknown command type: \(commandString)")
                    m.handleRequestStatus()
                case .ping:
                    break
                case .set_stt_model_path:
                    guard let params = params,
                          let path = params["path"] as? String
                    else {
                        Core.log("AOS: stop_video_recording invalid params")
                        break
                    }
                    m.setSttModelPath(path)
                }
            }
        } catch {
            Core.log("AOS: Error parsing JSON command: \(error.localizedDescription)")
        }
    }
}
