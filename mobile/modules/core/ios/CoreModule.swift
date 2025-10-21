import ExpoModulesCore

public class CoreModule: Module {
    public func definition() -> ModuleDefinition {
        Name("Core")

        // Define events that can be sent to JavaScript
        Events("CoreMessageEvent", "onChange")

        OnCreate {
            // Initialize Bridge with event callback
            Bridge.initialize { [weak self] eventName, data in
                self?.sendEvent(eventName, data)
            }
        }

        // MARK: - Display Commands

        AsyncFunction("displayEvent") { (params: [String: Any]) in
            CoreManager.shared.handle_display_event(params)
        }

        AsyncFunction("displayText") { (params: [String: Any]) in
            CoreManager.shared.handle_display_text(params)
        }

        // MARK: - Connection Commands

        AsyncFunction("requestStatus") {
            CoreManager.shared.handle_request_status()
        }

        AsyncFunction("connectDefault") {
            Bridge.log("calling connectDefault!")
            CoreManager.shared.handle_connect_default()
        }

        AsyncFunction("connectByName") { (deviceName: String) in
            CoreManager.shared.handle_connect_by_name(deviceName)
        }

        AsyncFunction("connectSimulated") {
            Bridge.log("calling connectSimulated!")
            CoreManager.shared.handle_connect_simulated()
        }

        AsyncFunction("disconnect") {
            Bridge.log("calling disconnect!")
            CoreManager.shared.handle_disconnect()
        }

        AsyncFunction("forget") {
            Bridge.log("calling forget!")
            CoreManager.shared.handle_forget()
        }

        AsyncFunction("findCompatibleDevices") { (modelName: String) in
            CoreManager.shared.handle_find_compatible_devices(modelName)
        }

        AsyncFunction("showDashboard") {
            CoreManager.shared.handle_show_dashboard()
        }

        // MARK: - WiFi Commands

        AsyncFunction("requestWifiScan") {
            CoreManager.shared.handle_request_wifi_scan()
        }

        AsyncFunction("sendWifiCredentials") { (ssid: String, password: String) in
            CoreManager.shared.handle_send_wifi_credentials(ssid, password)
        }

        AsyncFunction("setHotspotState") { (enabled: Bool) in
            CoreManager.shared.handle_set_hotspot_state(enabled)
        }

        // MARK: - Gallery Commands

        AsyncFunction("queryGalleryStatus") {
            CoreManager.shared.handle_query_gallery_status()
        }

        AsyncFunction("photoRequest") { (requestId: String, appId: String, size: String, webhookUrl: String?, authToken: String?) in
            CoreManager.shared.handle_photo_request(requestId, appId, size, webhookUrl, authToken)
        }

        // MARK: - Video Recording Commands

        AsyncFunction("startBufferRecording") {
            CoreManager.shared.handle_start_buffer_recording()
        }

        AsyncFunction("stopBufferRecording") {
            CoreManager.shared.handle_stop_buffer_recording()
        }

        AsyncFunction("saveBufferVideo") { (requestId: String, durationSeconds: Int) in
            CoreManager.shared.handle_save_buffer_video(requestId, durationSeconds)
        }

        AsyncFunction("startVideoRecording") { (requestId: String, save: Bool) in
            CoreManager.shared.handle_start_video_recording(requestId, save)
        }

        AsyncFunction("stopVideoRecording") { (requestId: String) in
            CoreManager.shared.handle_stop_video_recording(requestId)
        }

        // MARK: - RTMP Stream Commands

        AsyncFunction("startRtmpStream") { (params: [String: Any]) in
            CoreManager.shared.handle_start_rtmp_stream(params)
        }

        AsyncFunction("stopRtmpStream") {
            CoreManager.shared.handle_stop_rtmp_stream()
        }

        AsyncFunction("keepRtmpStreamAlive") { (params: [String: Any]) in
            CoreManager.shared.handle_keep_rtmp_stream_alive(params)
        }

        // MARK: - Microphone Commands

        AsyncFunction("microphoneStateChange") { (requiredDataStrings: [String], bypassVad: Bool) in
            let requiredData = SpeechRequiredDataType.fromStringArray(requiredDataStrings)
            CoreManager.shared.handle_microphone_state_change(requiredData, bypassVad)
        }

        AsyncFunction("restartTranscriber") {
            CoreManager.shared.restartTranscriber()
        }

        // MARK: - RGB LED Control

        AsyncFunction("rgbLedControl") { (requestId: String, packageName: String?, action: String, color: String?, ontime: Int, offtime: Int, count: Int) in
            CoreManager.shared.handle_rgb_led_control(
                requestId: requestId,
                packageName: packageName,
                action: action,
                color: color,
                ontime: ontime,
                offtime: offtime,
                count: count
            )
        }

        // MARK: - Settings Commands

        AsyncFunction("updateSettings") { (params: [String: Any]) in
            CoreManager.shared.handle_update_settings(params)
        }

        // MARK: - STT Commands

        AsyncFunction("setSttModelDetails") { (path: String, languageCode: String) in
            STTTools.setSttModelDetails(path, languageCode)
        }

        AsyncFunction("getSttModelPath") { () -> String in
            return STTTools.getSttModelPath()
        }

        AsyncFunction("checkSttModelAvailable") { () -> Bool in
            return STTTools.checkSTTModelAvailable()
        }

        AsyncFunction("validateSttModel") { (path: String) -> Bool in
            return STTTools.validateSTTModel(path)
        }

        AsyncFunction("extractTarBz2") { (sourcePath: String, destinationPath: String) -> Bool in
            return STTTools.extractTarBz2(sourcePath: sourcePath, destinationPath: destinationPath)
        }

        // android stubs:
        AsyncFunction("getInstalledApps") { () -> Any in
            return false
        }

        AsyncFunction("hasNotificationListenerPermission") { () -> Any in
            return false
        }
    }
}
