//
//  ServerComms.swift
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Combine
import Foundation

// TODO: config: remove
class ServerComms {
    static let shared = ServerComms()

    private var coreToken: String = ""
    var userid: String = ""
    private var serverUrl: String = ""

    // Audio queue system
    private let audioQueue = DispatchQueue(label: "com.mentra.audioQueue")
    private var audioBuffer = ArrayBlockingQueue<Data>(capacity: 100) // 10 seconds of audio assuming similar frame rates
    private var audioSenderThread: Thread?
    private var audioSenderRunning = false
    private var cancellables = Set<AnyCancellable>()

    private var reconnecting: Bool = false
    private var reconnectionAttempts: Int = 0

    private let wsManager = WebSocketManager.shared

    private init() {
        // Subscribe to WebSocket messages
        wsManager.messages
            .sink { [weak self] message in
                self?.handleIncomingMessage(message)
            }
            .store(in: &cancellables)

        // Subscribe to WebSocket status changes
        wsManager.status
            .sink { [weak self] status in
                self?.handleStatusChange(status)
            }
            .store(in: &cancellables)

        startAudioSenderThread()

        // every hour send calendar events again:
        let oneHour: TimeInterval = 1 * 60 * 60 // 1hr
        Timer.scheduledTimer(withTimeInterval: oneHour, repeats: true) { [weak self] _ in
            Bridge.log("Periodic calendar sync")
            self?.sendCalendarEvents()
        }

        // Deploy datetime coordinates to command center every 60 seconds
        let sixtySeconds: TimeInterval = 60
        Timer.scheduledTimer(withTimeInterval: sixtySeconds, repeats: true) { [weak self] _ in
            Bridge.log("Periodic datetime transmission")
            guard let self = self else { return }
            let isoDatetime = ServerComms.getCurrentIsoDatetime()
            self.sendUserDatetimeToBackend(isoDatetime: isoDatetime)
        }

        // send location updates every 15 minutes:
        // TODO: ios (left out for now for battery savings)
        //    let fifteenMinutes: TimeInterval = 15 * 60
        //    Timer.scheduledTimer(withTimeInterval: fifteenMinutes, repeats: true) { [weak self] _ in
        //      CoreCommsService.log("Periodic location update")
        //      self?.sendLocationUpdates()
        //    }
    }

    func setAuthCreds(_ coreToken: String, _ userid: String) {
        self.coreToken = coreToken
        self.userid = userid
        // set core token user pref:
        UserDefaults.standard.set(coreToken, forKey: "core_token")
    }

    // TODO: config: remove
    func setServerUrl(_ url: String) {
        serverUrl = url
        Bridge.log("ServerComms: setServerUrl: \(url)")
        if wsManager.isConnected() {
            wsManager.disconnect()
            connectWebSocket()
        }
    }

    // MARK: - Connection Management

    func connectWebSocket() {
        guard let url = URL(string: getServerUrl()) else {
            Bridge.log("Invalid server URL")
            return
        }
        wsManager.connect(url: url, coreToken: coreToken)
    }

    // MARK: - Audio / VAD

    func sendAudioChunk(_ audioData: Data) {
        // If the queue is full, remove the oldest entry before adding a new one
        // CoreCommsService.log("ServerComms: Sending audio chunk: \(audioData.count)")
        audioBuffer.offer(audioData)
    }

    func sendVadStatus(_ isSpeaking: Bool) {
        let vadMsg: [String: Any] = [
            "type": "VAD",
            "status": isSpeaking,
        ]

        let jsonData = try! JSONSerialization.data(withJSONObject: vadMsg)
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            wsManager.sendText(jsonString)
        }
    }

    func sendBatteryStatus(level: Int, charging: Bool) {
        let vadMsg: [String: Any] = [
            "type": "glasses_battery_update",
            "level": level,
            "charging": charging,
            "timestamp": Date().timeIntervalSince1970 * 1000,
            // TODO: time remaining
        ]

        let jsonData = try! JSONSerialization.data(withJSONObject: vadMsg)
        if let jsonString = String(data: jsonData, encoding: .utf8) {
            wsManager.sendText(jsonString)
        }
    }

    func sendCalendarEvent(_ calendarItem: CalendarItem) {
        guard wsManager.isConnected() else {
            Bridge.log("Cannot send calendar event: not connected.")
            return
        }

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
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("Error building calendar_event JSON: \(error)")
        }
    }

    func sendCalendarEvents() {
        guard wsManager.isConnected() else { return }
        Task {
            if let events = await CalendarManager.shared.fetchUpcomingEvents(days: 2) {
                guard events.count > 0 else { return }
                // Send up to 5 events
                let eventsToSend = events.prefix(5)
                for event in eventsToSend {
                    let calendarItem = convertEKEventToCalendarItem(event)
                    Bridge.log("CALENDAR EVENT \(calendarItem)")
                    self.sendCalendarEvent(calendarItem)
                }
            }
        }
    }

    func sendLocationUpdate(lat: Double, lng: Double, accuracy: Double?, correlationId: String?) {
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
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building location_update JSON: \(error)")
        }
    }

    func sendLocationUpdates() {
        guard wsManager.isConnected() else {
            Bridge.log("Cannot send location updates: WebSocket not connected")
            return
        }

//        if let locationData = LocationManager.shared.getCurrentLocation() {
//            Core.log("ServerComms: Sending location update: lat=\(locationData.latitude), lng=\(locationData.longitude)")
//            sendLocationUpdate(lat: locationData.latitude, lng: locationData.longitude, accuracy: nil, correlationId: nil)
//        } else {
//            Core.log("ServerComms: Cannot send location update: No location data available")
//        }
    }

    func sendGlassesConnectionState(modelName: String, status: String) {
        do {
            let event: [String: Any] = [
                "type": "glasses_connection_state",
                "modelName": modelName,
                "status": status,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]
            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building location_update JSON: \(error)")
        }
    }

    func updateAsrConfig(languages: [[String: Any]]) {
        guard wsManager.isConnected() else {
            Bridge.log("ServerComms: Cannot send ASR config: not connected.")
            return
        }

        do {
            let configMsg: [String: Any] = [
                "type": "config",
                "streams": languages,
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: configMsg)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
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
                wsManager.sendText(jsonString)
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
                wsManager.sendText(jsonString)
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
                wsManager.sendText(jsonString)
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
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building stop_app JSON: \(error)")
        }
    }

    // MARK: - Hardware Events

    func sendButtonPress(buttonId: String, pressType: String) {
        do {
            let event: [String: Any] = [
                "type": "button_press",
                "buttonId": buttonId,
                "pressType": pressType,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building button_press JSON: \(error)")
        }
    }

    func sendPhotoResponse(requestId: String, photoUrl: String) {
        do {
            let event: [String: Any] = [
                "type": "photo_response",
                "requestId": requestId,
                "photoUrl": photoUrl,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building photo_response JSON: \(error)")
        }
    }

    func sendVideoStreamResponse(appId: String, streamUrl: String) {
        do {
            let event: [String: Any] = [
                "type": "video_stream_response",
                "appId": appId,
                "streamUrl": streamUrl,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error building video_stream_response JSON: \(error)")
        }
    }

    func sendHeadPosition(isUp: Bool) {
        do {
            let event: [String: Any] = [
                "type": "head_position",
                "position": isUp ? "up" : "down",
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: event)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
            }
        } catch {
            Bridge.log("ServerComms: Error sending head position: \(error)")
        }
    }

    // Add other event methods as needed (sendGlassesBatteryUpdate, etc.)

    // MARK: - Message Handling

    private func handleIncomingMessage(_ msg: [String: Any]) {
        guard let type = msg["type"] as? String else { return }
        let m = MentraManager.shared

        // CoreCommsService.log("Received message of type: \(type)")

        switch type {
        case "connection_ack":
            MentraManager.shared.onAppStateChange(parseAppList(msg))
            MentraManager.shared.onConnectionAck()
            let livekitData = msg["livekit"] as? [String: Any] ?? [:]
            let url = livekitData["url"] as? String ?? ""
            let token = livekitData["token"] as? String ?? ""
            if !url.isEmpty, !token.isEmpty {
                Bridge.log("ServerComms: Connecting to LiveKit: \(url)")
                Bridge.log("ServerComms: LiveKit token: \(token)")
                LiveKitManager.shared.connect(url: url, token: token)
            }

        case "app_state_change":
            m.onAppStateChange(parseAppList(msg))

        case "connection_error":
            let errorMsg = msg["message"] as? String ?? "Unknown error"

            m.onConnectionError(errorMsg)

        case "auth_error":
            m.onAuthError()

        case "microphone_state_change":
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

            // Core.log("ServerComms: requiredData = \(requiredDataStrings), bypassVad = \(bypassVad)")

            m.handle_microphone_state_change(requiredData, bypassVad)

        case "display_event":
            if let view = msg["view"] as? String {
                m.handle_display_event(msg)
            }

        case "audio_play_request":
            handleAudioPlayRequest(msg)

        case "audio_stop_request":
            handleAudioStopRequest()

        case "reconnect":
            Bridge.log("ServerComms: TODO: Server is requesting a reconnect.")

        case "set_location_tier":
            if let tier = msg["tier"] as? String {
//                LocationManager.shared.setTier(tier: tier)
            }

        case "request_single_location":
            if let accuracy = msg["accuracy"] as? String,
               let correlationId = msg["correlationId"] as? String
            {
//                LocationManager.shared.requestSingleUpdate(accuracy: accuracy, correlationId: correlationId)
            }

        case "app_started":
            if let packageName = msg["packageName"] as? String {
                Bridge.log("ServerComms: Received app_started message for package: \(packageName)")
                m.onAppStarted(packageName)
            }

        case "app_stopped":
            if let packageName = msg["packageName"] as? String {
                Bridge.log("ServerComms: Received app_stopped message for package: \(packageName)")
                m.onAppStopped(packageName)
            }

        case "photo_request":
            let requestId = msg["requestId"] as? String ?? ""
            let appId = msg["appId"] as? String ?? ""
            let webhookUrl = msg["webhookUrl"] as? String ?? ""
            let size = (msg["size"] as? String) ?? "medium"
            Bridge.log("Received photo_request, requestId: \(requestId), appId: \(appId), webhookUrl: \(webhookUrl), size: \(size)")
            if !requestId.isEmpty, !appId.isEmpty {
                m.onPhotoRequest(requestId, appId, webhookUrl, size)
            } else {
                Bridge.log("Invalid photo request: missing requestId or appId")
            }

        case "start_rtmp_stream":
            let rtmpUrl = msg["rtmpUrl"] as? String ?? ""
            if !rtmpUrl.isEmpty {
                m.onRtmpStreamStartRequest(msg)
            } else {
                Bridge.log("Invalid RTMP stream request: missing rtmpUrl or callback")
            }

        case "stop_rtmp_stream":
            Bridge.log("Received STOP_RTMP_STREAM")
            m.onRtmpStreamStop()

        case "keep_rtmp_stream_alive":
            Bridge.log("ServerComms: Received KEEP_RTMP_STREAM_ALIVE: \(msg)")
            m.onRtmpStreamKeepAlive(msg)

        case "start_buffer_recording":
            Bridge.log("ServerComms: Received START_BUFFER_RECORDING")
            m.onStartBufferRecording()

        case "stop_buffer_recording":
            Bridge.log("ServerComms: Received STOP_BUFFER_RECORDING")
            m.onStopBufferRecording()

        case "save_buffer_video":
            Bridge.log("ServerComms: Received SAVE_BUFFER_VIDEO: \(msg)")
            let requestId = msg["requestId"] as? String ?? "buffer_\(Int(Date().timeIntervalSince1970 * 1000))"
            let durationSeconds = msg["durationSeconds"] as? Int ?? 30
            m.onSaveBufferVideo(requestId, durationSeconds)

        case "start_video_recording":
            Bridge.log("ServerComms: Received START_VIDEO_RECORDING: \(msg)")
            let requestId = msg["requestId"] as? String ?? "video_\(Int(Date().timeIntervalSince1970 * 1000))"
            let save = msg["save"] as? Bool ?? true
            m.onStartVideoRecording(requestId, save)

        case "stop_video_recording":
            Bridge.log("ServerComms: Received STOP_VIDEO_RECORDING: \(msg)")
            let requestId = msg["requestId"] as? String ?? ""
            m.onStopVideoRecording(requestId)

        default:
            Bridge.log("ServerComms: Unknown message type: \(type) / full: \(msg)")
        }
    }

    private func handleAudioPlayRequest(_ msg: [String: Any]) {
        Bridge.log("ServerComms: Handling audio play request: \(msg)")
        guard let requestId = msg["requestId"] as? String else {
            return
        }

        Bridge.log("ServerComms: Handling audio play request for requestId: \(requestId)")

        let audioUrl = msg["audioUrl"] as? String ?? ""
        let volume = msg["volume"] as? Float ?? 1.0
        let stopOtherAudio = msg["stopOtherAudio"] as? Bool ?? true

        let audioManager = AudioManager.getInstance()

        audioManager.playAudio(
            requestId: requestId,
            audioUrl: audioUrl,
            volume: volume,
            stopOtherAudio: stopOtherAudio
        )
    }

    private func handleAudioStopRequest() {
        Bridge.log("ServerComms: Handling audio stop request")
        let audioManager = AudioManager.getInstance()
        audioManager.stopAllAudio()
    }

    private func attemptReconnect(_ override: Bool = false) {
        if reconnecting, !override { return }
        reconnecting = true

        connectWebSocket()

        // if after some time we're still not connected, run this function again:
        DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) {
            // if self.wsManager.isConnected() {
            if self.wsManager.isConnected() {
                self.reconnectionAttempts = 0
                self.reconnecting = false
                return
            }
            self.reconnectionAttempts += 1
            self.attemptReconnect(true)
        }
    }

    private func handleStatusChange(_ status: WebSocketStatus) {
        Bridge.log("handleStatusChange: \(status)")

        if status == .disconnected || status == .error {
            stopAudioSenderThread()
            attemptReconnect()
        }
    }

    // MARK: - Audio Queue Sender Thread

    private func startAudioSenderThread() {
        if audioSenderThread != nil { return }

        audioSenderRunning = true
        audioSenderThread = Thread {
            while self.audioSenderRunning {
                if let chunk = self.audioBuffer.poll() {
                    // Core.log("ServerComms: polling audio chunk")
                    // check if we're connected to livekit:
                    if LiveKitManager.shared.enabled {
                        LiveKitManager.shared.addPcm(chunk)
                    } else if self.wsManager.isConnected() {
                        // Core.log("ServerComms: LIVEKIT NOT ENABLED, SENDING TO WS")
                        self.wsManager.sendBinary(chunk)
                    } else {
                        // Re-enqueue the chunk if not connected, then wait a bit
                        // self.audioBuffer.offer(chunk)
                        // Thread.sleep(forTimeInterval: 0.1)
                        Bridge.sendWSBinary(chunk)
                    }
                } else {
                    // No data in queue, wait a bit
                    Thread.sleep(forTimeInterval: 0.01)
                }
            }
        }

        audioSenderThread?.name = "AudioSenderThread"
        audioSenderThread?.start()
    }

    private func stopAudioSenderThread() {
        Bridge.log("stopping audio sender thread")
        audioSenderRunning = false
        audioSenderThread = nil
    }

    // MARK: - Helper methods

    func sendUserDatetimeToBackend(isoDatetime: String) {
        guard let url = URL(string: getServerUrlForRest() + "/api/user-data/set-datetime") else {
            Bridge.log("ServerComms: Invalid URL for datetime transmission")
            return
        }

        let body: [String: Any] = [
            "coreToken": coreToken,
            "datetime": isoDatetime,
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: body)

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = jsonData

            // Core.log("ServerComms: Sending datetime to: \(url)")

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    return
                }

                if let httpResponse = response as? HTTPURLResponse {
                    if httpResponse.statusCode != 200 {
                        Bridge.log("ServerComms: Datetime transmission failed. Response code: \(httpResponse.statusCode)")
                        if let responseData = data, let responseString = String(data: responseData, encoding: .utf8) {
                            Bridge.log("ServerComms: Error response: \(responseString)")
                        }
                    }
                }
            }.resume()

        } catch {
            Bridge.log("ServerComms: Exception during datetime transmission preparation: \(error.localizedDescription)")
        }
    }

    /**
     * Retrieves the command center's REST API coordinates
     */
    private func getServerUrlForRest() -> String {
        if !serverUrl.isEmpty {
            // Extract base URL from WebSocket URL
            let url = URL(string: serverUrl)!
            let host = url.host!
            let port = url.port!
            let secure = url.scheme == "https"
            return "\(secure ? "https" : "http")://\(host):\(port)"
        }

        // Fallback to environment configuration
        let host = RNCConfig.env(for: "MENTRAOS_HOST")!
        let port = RNCConfig.env(for: "MENTRAOS_PORT")!
        let secure = RNCConfig.env(for: "MENTRAOS_SECURE")!
        let secureServer = secure.contains("true")
        return "\(secureServer ? "https" : "http")://\(host):\(port)"
    }

    private func getServerUrl() -> String {
        if !serverUrl.isEmpty {
            // parse the url from the string:
            let url = URL(string: serverUrl)!
            let host = url.host!
            let port = url.port!
            let secure = url.scheme == "https"
            let wsUrl = "\(secure ? "wss" : "ws")://\(host):\(port)/glasses-ws"
            return wsUrl
        }
        let host = RNCConfig.env(for: "MENTRAOS_HOST")!
        let port = RNCConfig.env(for: "MENTRAOS_PORT")!
        let secure = RNCConfig.env(for: "MENTRAOS_SECURE")!
        let secureServer = secure.contains("true")
        let url = "\(secureServer ? "wss" : "ws")://\(host):\(port)/glasses-ws"
        Bridge.log("ServerComms: getServerUrl(): \(url)")
        return url
    }

    func parseWhatToStream(_ msg: [String: Any]) -> [String] {
        if let userSession = msg["userSession"] as? [String: Any],
           let whatToStream = userSession["whatToStream"] as? [String]
        {
            return whatToStream
        }
        Bridge.log("ServerComms: whatToStream was not found in server message!")
        return []
    }

    func parseAppList(_ msg: [String: Any]) -> [ThirdPartyCloudApp] {
        var installedApps: [[String: Any]]?
        var activeAppPackageNames: [String]?

        // Try to grab installedApps at the top level
        installedApps = msg["installedApps"] as? [[String: Any]]

        // If not found, look for "userSession.installedApps"
        if installedApps == nil {
            if let userSession = msg["userSession"] as? [String: Any] {
                installedApps = userSession["installedApps"] as? [[String: Any]]
            }
        }

        // Similarly, try to find activeAppPackageNames at top level or under userSession
        activeAppPackageNames = msg["activeAppPackageNames"] as? [String]
        if activeAppPackageNames == nil {
            if let userSession = msg["userSession"] as? [String: Any] {
                activeAppPackageNames = userSession["activeAppPackageNames"] as? [String]
            }
        }

        // Convert activeAppPackageNames into a Set for easy lookup
        var runningPackageNames = Set<String>()
        if let activeApps = activeAppPackageNames {
            for packageName in activeApps {
                if !packageName.isEmpty {
                    runningPackageNames.insert(packageName)
                }
            }
        }

        // Build a list of ThirdPartyCloudApp objects from installedApps
        var appList: [ThirdPartyCloudApp] = []
        if let apps = installedApps {
            for appJson in apps {
                // Extract packageName first so we can check isRunning
                let packageName = appJson["packageName"] as? String ?? "unknown.package"

                // Check if package is in runningPackageNames
                let isRunning = runningPackageNames.contains(packageName)

                // Create the ThirdPartyCloudApp
                let app = ThirdPartyCloudApp(
                    packageName: packageName,
                    name: appJson["name"] as? String ?? "Unknown App",
                    description: appJson["description"] as? String ?? "No description available.",
                    webhookURL: appJson["webhookURL"] as? String ?? "",
                    logoURL: appJson["logoURL"] as? String ?? "",
                    isRunning: isRunning
                )
                appList.append(app)
            }
        }

        return appList
    }

    /// Returns the current datetime in ISO 8601 format with timezone offset (e.g., 2024-06-13T15:42:10-07:00)
    static func getCurrentIsoDatetime() -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXX"
        dateFormatter.locale = Locale(identifier: "en_US")
        return dateFormatter.string(from: Date())
    }

    /**
     * Send transcription result to server
     * Used by AOSManager to send pre-formatted transcription results
     * Matches the Java ServerComms structure exactly
     */
    func sendTranscriptionResult(transcription: [String: Any]) {
        guard wsManager.isConnected() else {
            Bridge.log("Cannot send transcription result: WebSocket not connected")
            return
        }

        guard let text = transcription["text"] as? String, !text.isEmpty else {
            Bridge.log("Skipping empty transcription result")
            return
        }

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: transcription)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)

                let isFinal = transcription["isFinal"] as? Bool ?? false
                Bridge.log("Sent \(isFinal ? "final" : "partial") transcription: '\(text)'")
            }
        } catch {
            Bridge.log("Error sending transcription result: \(error)")
        }
    }
}

// A simple implementation of ArrayBlockingQueue for Swift
class ArrayBlockingQueue<T> {
    private let queue = DispatchQueue(label: "ArrayBlockingQueue", attributes: .concurrent)
    private var array: [T] = []
    private let capacity: Int

    init(capacity: Int) {
        self.capacity = capacity
    }

    func offer(_ element: T) -> Bool {
        var result = false

        queue.sync(flags: .barrier) {
            if self.array.count < self.capacity {
                self.array.append(element)
                result = true
            } else if self.array.count > 0 {
                // If queue is full, remove the oldest item
                self.array.removeFirst()
                self.array.append(element)
                result = true
            }
        }

        return result
    }

    func poll() -> T? {
        var result: T?

        queue.sync(flags: .barrier) {
            if !self.array.isEmpty {
                result = self.array.removeFirst()
            }
        }

        return result
    }

    func take() -> T? {
        // Simple implementation - in a real blocking queue, this would actually block
        // until an element is available
        return poll()
    }
}
