//
//  ServerComms.swift
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Combine
import Foundation

protocol ServerCommsCallback {
    func onConnectionAck()
    func onAppStateChange(_ apps: [ThirdPartyCloudApp] /* , _ whatToStream: [String] */ )
    func onConnectionError(_ error: String)
    func onAuthError()
    func onMicrophoneStateChange(_ isEnabled: Bool)
    func onDisplayEvent(_ event: [String: Any])
    func onRequestSingle(_ dataType: String)
    func onStatusUpdate(_ status: [String: Any])
    func onAppStarted(_ packageName: String)
    func onAppStopped(_ packageName: String)
    func onJsonMessage(_ message: [String: Any])
    func onPhotoRequest(_ requestId: String, _ appId: String, _ webhookUrl: String)
    func onRtmpStreamStartRequest(_ message: [String: Any])
    func onRtmpStreamStop()
    func onRtmpStreamKeepAlive(_ message: [String: Any])
}

class ServerComms {
    private static var instance: ServerComms?

    let wsManager = WebSocketManager()
    private var speechRecCallback: (([String: Any]) -> Void)?
    private var serverCommsCallback: ServerCommsCallback?
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
    let calendarManager = CalendarManager()
    let locationManager = LocationManager()
    let mediaManager = MediaManager()

    static func getInstance() -> ServerComms {
        if instance == nil {
            instance = ServerComms()
        }
        return instance!
    }

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
            CoreCommsService.log("Periodic calendar sync")
            self?.sendCalendarEvents()
        }

        // Deploy datetime coordinates to command center every 60 seconds
        let sixtySeconds: TimeInterval = 60
        Timer.scheduledTimer(withTimeInterval: sixtySeconds, repeats: true) { [weak self] _ in
            CoreCommsService.log("Periodic datetime transmission")
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

        // Setup calendar change notifications
        calendarManager.setCalendarChangedCallback { [weak self] in
            self?.sendCalendarEvents()
        }

        // setup location change notification:
        locationManager.setLocationChangedCallback { [weak self] in
            self?.sendLocationUpdates()
        }
    }

    func setAuthCredentials(_ userid: String, _ coreToken: String) {
        self.coreToken = coreToken
        self.userid = userid
        // set core token user pref:
        UserDefaults.standard.set(coreToken, forKey: "core_token")
    }

    func setServerUrl(_ url: String) {
        serverUrl = url
        CoreCommsService.log("ServerComms: setServerUrl: \(url)")
        if wsManager.isConnected() {
            wsManager.disconnect()
            connectWebSocket()
        }
    }

    func setServerCommsCallback(_ callback: ServerCommsCallback) {
        serverCommsCallback = callback
    }

    func setSpeechRecCallback(_ callback: @escaping ([String: Any]) -> Void) {
        speechRecCallback = callback
    }

    // MARK: - Connection Management

    func connectWebSocket() {
        guard let url = URL(string: getServerUrl()) else {
            CoreCommsService.log("Invalid server URL")
            return
        }
        wsManager.connect(url: url, coreToken: coreToken)
    }

    func isWebSocketConnected() -> Bool {
        return wsManager.isActuallyConnected()
    }

    // MARK: - Audio / VAD

    func sendAudioChunk(_ audioData: Data) {
        // If the queue is full, remove the oldest entry before adding a new one
        // CoreCommsService.log("ServerComms: Sending audio chunk: \(audioData.count)")
        audioBuffer.offer(audioData)
    }

    private func sendConnectionInit(coreToken: String) {
        do {
            let initMsg: [String: Any] = [
                "type": "connection_init",
                "coreToken": coreToken,
            ]

            let jsonData = try JSONSerialization.data(withJSONObject: initMsg)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
                CoreCommsService.log("ServerComms: Sent connection_init message")
            }
        } catch {
            CoreCommsService.log("ServerComms: Error building connection_init JSON: \(error)")
        }
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
            CoreCommsService.log("Cannot send calendar event: not connected.")
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
            CoreCommsService.log("Error building calendar_event JSON: \(error)")
        }
    }

    func sendCalendarEvents() {
        guard wsManager.isConnected() else { return }
        let calendarManager = CalendarManager()
        Task {
            if let events = await calendarManager.fetchUpcomingEvents(days: 2) {
                guard events.count > 0 else { return }
                // Send up to 5 events
                let eventsToSend = events.prefix(5)
                for event in eventsToSend {
                    let calendarItem = convertEKEventToCalendarItem(event)
                    CoreCommsService.log("CALENDAR EVENT \(calendarItem)")
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
            CoreCommsService.log("ServerComms: Error building location_update JSON: \(error)")
        }
    }

    func sendLocationUpdates() {
        guard wsManager.isConnected() else {
            CoreCommsService.log("Cannot send location updates: WebSocket not connected")
            return
        }

        if let locationData = locationManager.getCurrentLocation() {
            CoreCommsService.log("Sending location update: lat=\(locationData.latitude), lng=\(locationData.longitude)")
            sendLocationUpdate(lat: locationData.latitude, lng: locationData.longitude, accuracy: nil, correlationId: nil)
        } else {
            CoreCommsService.log("Cannot send location update: No location data available")
        }
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
            CoreCommsService.log("ServerComms: Error building location_update JSON: \(error)")
        }
    }

    func updateAsrConfig(languages: [[String: Any]]) {
        guard wsManager.isConnected() else {
            CoreCommsService.log("Cannot send ASR config: not connected.")
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
            CoreCommsService.log("Error building config message: \(error)")
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
            CoreCommsService.log("Error building core_status_update JSON: \(error)")
        }
    }

    func sendAudioPlayResponse(requestId: String, success: Bool, error: String? = nil, duration: Double? = nil) {
        CoreCommsService.log("ServerComms: Sending audio play response - requestId: \(requestId), success: \(success), error: \(error ?? "none")")
        let message: [String: Any] = [
            "command": "audio_play_response",
            "params": [
                "requestId": requestId,
                "success": success,
                "error": error as Any,
                "duration": duration as Any,
            ].compactMapValues { $0 },
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: message)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                wsManager.sendText(jsonString)
                CoreCommsService.log("ServerComms: Sent audio play response to server")
            }
        } catch {
            CoreCommsService.log("ServerComms: Failed to serialize audio play response: \(error)")
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
            CoreCommsService.log("Error building start_app JSON: \(error)")
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
            CoreCommsService.log("Error building stop_app JSON: \(error)")
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
            CoreCommsService.log("ServerComms: Error building button_press JSON: \(error)")
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
            CoreCommsService.log("Error building photo_response JSON: \(error)")
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
            CoreCommsService.log("Error building video_stream_response JSON: \(error)")
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
            CoreCommsService.log("Error sending head position: \(error)")
        }
    }

    // Add other event methods as needed (sendGlassesBatteryUpdate, etc.)

    // MARK: - Message Handling

    private func handleIncomingMessage(_ msg: [String: Any]) {
        guard let type = msg["type"] as? String else { return }

        // CoreCommsService.log("Received message of type: \(type)")

        switch type {
        case "connection_ack":
            startAudioSenderThread()
            if let callback = serverCommsCallback {
                callback.onAppStateChange(parseAppList(msg) /* , parseWhatToStream(msg) */ )
                callback.onConnectionAck()
            }

        case "app_state_change":
            if let callback = serverCommsCallback {
                callback.onAppStateChange(parseAppList(msg) /* , parseWhatToStream(msg) */ )
            }

        case "connection_error":
            let errorMsg = msg["message"] as? String ?? "Unknown error"
            if let callback = serverCommsCallback {
                callback.onConnectionError(errorMsg)
            }

        case "auth_error":
            if let callback = serverCommsCallback {
                callback.onAuthError()
            }

        case "microphone_state_change":
            CoreCommsService.log("ServerComms: microphone_state_change: \(msg)")
            let isMicrophoneEnabled = msg["isMicrophoneEnabled"] as? Bool ?? true
            if let callback = serverCommsCallback {
                callback.onMicrophoneStateChange(isMicrophoneEnabled)
            }

        case "display_event":
            if let view = msg["view"] as? String {
                if let callback = serverCommsCallback {
                    callback.onDisplayEvent(msg)
                }
            }

        case "audio_play_request":
            handleAudioPlayRequest(msg)

        case "audio_stop_request":
            handleAudioStopRequest()

        case "request_single":
            if let dataType = msg["data_type"] as? String, let callback = serverCommsCallback {
                callback.onRequestSingle(dataType)
            }

        case "interim", "final":
            // Pass speech messages to speech recognition callback
            if let callback = speechRecCallback {
                callback(msg)
            } else {
                CoreCommsService.log("ServerComms: Received speech message but speechRecCallback is null!")
            }

        case "reconnect":
            CoreCommsService.log("ServerComms: Server is requesting a reconnect.")

        case "settings_update":
            CoreCommsService.log("ServerComms: Received settings update from WebSocket")
            if let status = msg["status"] as? [String: Any], let callback = serverCommsCallback {
                callback.onStatusUpdate(status)
            }
            // Log.d(TAG, "Received settings update from WebSocket");
            // try {
            //     JSONObject settings = msg.optJSONObject("settings");
            //     if (settings != null && serverCommsCallback != null) {
            //         serverCommsCallback.onSettingsUpdate(settings);
            //     }
            // } catch (Exception e) {
            //     Log.e(TAG, "Error handling settings update", e);
            // }

        case "set_location_tier":
            print("DEBUG set_location_tier: \(msg)")
            if let tier = msg["tier"] as? String {
                locationManager.setTier(tier: tier)
            }

        case "request_single_location":
            print("DEBUG request_single_location: \(msg)")
            if let accuracy = msg["accuracy"] as? String,
               let correlationId = msg["correlationId"] as? String
            {
                locationManager.requestSingleUpdate(accuracy: accuracy, correlationId: correlationId)
            }

        case "app_started":
            if let packageName = msg["packageName"] as? String, let callback = serverCommsCallback {
                CoreCommsService.log("ServerComms: Received app_started message for package: \(packageName)")
                callback.onAppStarted(packageName)
            }

        case "app_stopped":
            if let packageName = msg["packageName"] as? String, let callback = serverCommsCallback {
                CoreCommsService.log("ServerComms: Received app_stopped message for package: \(packageName)")
                callback.onAppStopped(packageName)
            }

        case "photo_request":
            let requestId = msg["requestId"] as? String ?? ""
            let appId = msg["appId"] as? String ?? ""
            let webhookUrl = msg["webhookUrl"] as? String ?? ""
            CoreCommsService.log("Received photo_request, requestId: \(requestId), appId: \(appId), webhookUrl: \(webhookUrl)")
            if !requestId.isEmpty, !appId.isEmpty {
                serverCommsCallback?.onPhotoRequest(requestId, appId, webhookUrl)
            } else {
                CoreCommsService.log("Invalid photo request: missing requestId or appId")
            }

        case "start_rtmp_stream":
            let rtmpUrl = msg["rtmpUrl"] as? String ?? ""
            if !rtmpUrl.isEmpty {
                serverCommsCallback?.onRtmpStreamStartRequest(msg)
            } else {
                CoreCommsService.log("Invalid RTMP stream request: missing rtmpUrl or callback")
            }

        case "stop_rtmp_stream":
            CoreCommsService.log("Received STOP_RTMP_STREAM")
            serverCommsCallback?.onRtmpStreamStop()

        case "keep_rtmp_stream_alive":
            CoreCommsService.log("ServerComms: Received KEEP_RTMP_STREAM_ALIVE: \(msg)")
            serverCommsCallback?.onRtmpStreamKeepAlive(msg)

        default:
            CoreCommsService.log("ServerComms: Unknown message type: \(type) / full: \(msg)")
        }
    }

    private func handleAudioPlayRequest(_ msg: [String: Any]) {
        CoreCommsService.log("ServerComms: Handling audio play request: \(msg)")
        guard let requestId = msg["requestId"] as? String else {
            return
        }

        CoreCommsService.log("ServerComms: Handling audio play request for requestId: \(requestId)")

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
        CoreCommsService.log("ServerComms: Handling audio stop request")
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
            if self.wsManager.isActuallyConnected() {
                self.reconnectionAttempts = 0
                self.reconnecting = false
                return
            }
            self.reconnectionAttempts += 1
            self.attemptReconnect(true)
        }
    }

    private func handleStatusChange(_ status: WebSocketStatus) {
        CoreCommsService.log("handleStatusChange: \(status)")

        if status == .disconnected || status == .error {
            stopAudioSenderThread()
            attemptReconnect()
        }

        if status == .connected {
            // Wait a second before sending connection_init (similar to the Java code)
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                self.sendConnectionInit(coreToken: self.coreToken)

                self.sendCalendarEvents()
                self.sendLocationUpdates()
            }
        }
    }

    // MARK: - Audio Queue Sender Thread

    private func startAudioSenderThread() {
        if audioSenderThread != nil { return }

        audioSenderRunning = true
        audioSenderThread = Thread {
            while self.audioSenderRunning {
                if let chunk = self.audioBuffer.poll() {
                    if self.wsManager.isConnected() {
                        self.wsManager.sendBinary(chunk)
                    } else {
                        // Re-enqueue the chunk if not connected, then wait a bit
                        self.audioBuffer.offer(chunk)
                        Thread.sleep(forTimeInterval: 0.1)
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
        CoreCommsService.log("stopping audio sender thread")
        audioSenderRunning = false
        audioSenderThread = nil
    }

    // MARK: - Helper methods

    func sendUserDatetimeToBackend(isoDatetime: String) {
        guard let url = URL(string: getServerUrlForRest() + "/api/user-data/set-datetime") else {
            CoreCommsService.log("ServerComms: Invalid URL for datetime transmission")
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

            CoreCommsService.log("ServerComms: Sending datetime to: \(url)")

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    return
                }

                if let httpResponse = response as? HTTPURLResponse {
                    if httpResponse.statusCode == 200 {
                        if let responseData = data, let responseString = String(data: responseData, encoding: .utf8) {
                            CoreCommsService.log("ServerComms: Datetime transmission successful: \(responseString)")
                        }
                    } else {
                        CoreCommsService.log("ServerComms: Datetime transmission failed. Response code: \(httpResponse.statusCode)")
                        if let responseData = data, let responseString = String(data: responseData, encoding: .utf8) {
                            CoreCommsService.log("ServerComms: Error response: \(responseString)")
                        }
                    }
                }
            }.resume()

        } catch {
            CoreCommsService.log("ServerComms: Exception during datetime transmission preparation: \(error.localizedDescription)")
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
        CoreCommsService.log("ServerComms: getServerUrl(): \(url)")
        return url
    }

    func parseWhatToStream(_ msg: [String: Any]) -> [String] {
        if let userSession = msg["userSession"] as? [String: Any],
           let whatToStream = userSession["whatToStream"] as? [String]
        {
            return whatToStream
        }
        CoreCommsService.log("ServerComms: whatToStream was not found in server message!")
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
