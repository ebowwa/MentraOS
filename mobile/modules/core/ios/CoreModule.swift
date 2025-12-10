import ExpoModulesCore
import Photos

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

        AsyncFunction("photoRequest") {
            (requestId: String, appId: String, size: String, webhookUrl: String?, authToken: String?, compress: String?) in
            CoreManager.shared.handle_photo_request(requestId, appId, size, webhookUrl, authToken, compress)
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

        // MARK: - Android Stubs

        AsyncFunction("getInstalledApps") { () -> Any in
            return false
        }

        AsyncFunction("hasNotificationListenerPermission") { () -> Any in
            return false
        }

        // Notification management stubs (iOS doesn't support these features)
        Function("setNotificationsEnabled") { (_: Bool) in
            // No-op on iOS
        }

        Function("getNotificationsEnabled") { () -> Bool in
            return false
        }

        Function("setNotificationsBlocklist") { (_: [String]) in
            // No-op on iOS
        }

        Function("getNotificationsBlocklist") { () -> [String] in
            return []
        }

        AsyncFunction("getInstalledAppsForNotifications") { () -> [[String: Any]] in
            return []
        }

        // MARK: - Media Library Commands

        AsyncFunction("saveToGalleryWithDate") { (filePath: String, captureTimeMillis: Int64?) -> [String: Any] in
            do {
                let fileURL = URL(fileURLWithPath: filePath)
                
                guard FileManager.default.fileExists(atPath: filePath) else {
                    return ["success": false, "error": "File does not exist"]
                }

                var assetIdentifier: String?
                let semaphore = DispatchSemaphore(value: 0)
                var resultError: Error?

                PHPhotoLibrary.shared().performChanges({
                    let creationRequest: PHAssetChangeRequest
                    let pathExtension = fileURL.pathExtension.lowercased()
                    
                    if ["mp4", "mov", "avi", "m4v"].contains(pathExtension) {
                        // Video
                        creationRequest = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: fileURL)!
                    } else {
                        // Photo
                        creationRequest = PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: fileURL)!
                    }

                    // Set the creation date if provided
                    if let captureMillis = captureTimeMillis {
                        let captureDate = Date(timeIntervalSince1970: TimeInterval(captureMillis) / 1000.0)
                        creationRequest.creationDate = captureDate
                        Bridge.log("CoreModule: Setting creation date to: \(captureDate)")
                    }

                    assetIdentifier = creationRequest.placeholderForCreatedAsset?.localIdentifier
                }, completionHandler: { success, error in
                    resultError = error
                    semaphore.signal()
                })

                semaphore.wait()

                if let error = resultError {
                    Bridge.log("CoreModule: Error saving to gallery: \(error.localizedDescription)")
                    return ["success": false, "error": error.localizedDescription]
                }

                Bridge.log("CoreModule: Successfully saved to gallery with proper creation date")
                return ["success": true, "identifier": assetIdentifier ?? ""]
            } catch {
                Bridge.log("CoreModule: Exception saving to gallery: \(error.localizedDescription)")
                return ["success": false, "error": error.localizedDescription]
            }
        }
    }
}
