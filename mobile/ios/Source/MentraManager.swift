//
//  MentraManager.swift
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import AVFoundation
import Combine
import CoreBluetooth
import Foundation
import React
import UIKit

struct ViewState {
    var topText: String
    var bottomText: String
    var title: String
    var layoutType: String
    var text: String
    var data: String?
    var animationData: [String: Any]?
}

// This class handles logic for managing devices and connections to AugmentOS servers
@objc(MentraManager) class MentraManager: NSObject {
    static let shared = MentraManager()

    @objc static func getInstance() -> MentraManager {
        return MentraManager.shared
    }

    var coreToken: String = ""
    private var coreTokenOwner: String = ""
    var sgc: SGCManager?

    private var lastStatusObj: [String: Any] = [:]

    private var cancellables = Set<AnyCancellable>()
    private var defaultWearable: String = ""
    private var pendingWearable: String = ""
    private var deviceName: String = ""
    private var contextualDashboard = true
    private var headUpAngle = 30
    private var brightness = 50
    private var autoBrightness: Bool = true
    private var dashboardHeight: Int = 4
    private var dashboardDepth: Int = 5
    private var sensingEnabled: Bool = true
    private var powerSavingMode: Bool = false
    private var isSearching: Bool = false
    private var isUpdatingScreen: Bool = false
    private var alwaysOnStatusBar: Bool = false
    private var bypassVad: Bool = true
    private var bypassVadForPCM: Bool = false // NEW: PCM subscription bypass
    private var enforceLocalTranscription: Bool = false
    private var bypassAudioEncoding: Bool = false
    private var onboardMicUnavailable: Bool = false
    private var metricSystemEnabled: Bool = false
    private var settingsLoaded = false
    private let settingsLoadedSemaphore = DispatchSemaphore(value: 0)
    private var connectTask: Task<Void, Never>?
    private var glassesWifiConnected: Bool = false
    private var glassesWifiSsid: String = ""
    private var isHeadUp: Bool = false
    private var sendStateWorkItem: DispatchWorkItem?
    private let sendStateQueue = DispatchQueue(label: "sendStateQueue", qos: .userInitiated)

    // mic:
    private var useOnboardMic = false
    private var preferredMic = "glasses"
    private var offlineStt = false
    private var micEnabled = false
    private var currentRequiredData: [SpeechRequiredDataType] = []

    // button settings:
    var buttonPressMode = "photo"
    var buttonPhotoSize = "medium"
    var buttonVideoWidth = 1280
    var buttonVideoHeight = 720
    var buttonVideoFps = 30
    var buttonCameraLed = true

    // VAD:
    private var vad: SileroVADStrategy?
    private var vadBuffer = [Data]()
    private var isSpeaking = false

    // STT:
    private var transcriber: SherpaOnnxTranscriber?
    private var shouldSendPcmData = false
    private var shouldSendTranscript = false

    var viewStates: [ViewState] = [
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "",
        ),
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall",
            text: "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$",
        ),
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "",
            data: nil, animationData: nil
        ),
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall",
            text: "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$", data: nil,
            animationData: nil
        ),
    ]

    override init() {
        Bridge.log("Mentra: init()")
        vad = SileroVADStrategy()
        super.init()

        // Initialize SherpaOnnx Transcriber
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first,
           let rootViewController = window.rootViewController
        {
            transcriber = SherpaOnnxTranscriber(context: rootViewController)
        } else {
            Bridge.log("Failed to create SherpaOnnxTranscriber - no root view controller found")
        }

        // Initialize the transcriber
        if let transcriber = transcriber {
            transcriber.initialize()
            Bridge.log("SherpaOnnxTranscriber fully initialized")
        }

        Task {
            self.vad?.setup(
                sampleRate: .rate_16k,
                frameSize: .size_1024,
                quality: .normal,
                silenceTriggerDurationMs: 4000,
                speechTriggerDurationMs: 50
            )
        }
    }

    // MARK: - Public Methods (for React Native)

    func setup() {
        Bridge.log("Mentra: setup()")
    }

    func initSGC(_ wearable: String) {
        Bridge.log("Initializing manager for wearable: \(wearable)")
        if wearable.contains("G1") && sgc == nil {
            sgc = G1()
        } else if wearable.contains("Live") && sgc == nil {
            sgc = MentraLive()
        } else if wearable.contains("Mach1") && sgc == nil {
            sgc = Mach1()
        } else if wearable.contains("Frame") || wearable.contains("Brilliant Labs"),
                  sgc == nil
        {
            sgc = FrameManager()
        }
    }

    func initSGCCallbacks() {
        // TODO: make sure this functionality is baked into the SGCs!

        //    if sgc is MentraLive {
        //      let live = sgc as? MentraLive
        //      live!.onConnectionStateChanged = { [weak self] in
        //        guard let self = self else { return }
        //        Bridge.log(
        //          "Live glasses connection changed to: \(live!.ready ? "Connected" : "Disconnected")"
        //        )
        //        if live!.ready {
        //          handleDeviceReady()
        //        } else {
        //          handleDeviceDisconnected()
        //          handleRequestStatus()
        //        }
        //      }
        //
        //      live!.$batteryLevel.sink { [weak self] (level: Int) in
        //        guard let self = self else { return }
        //        guard level >= 0 else { return }
        //        self.batteryLevel = level
        //        Bridge.sendBatteryStatus(level: self.batteryLevel, charging: false)
        //        handleRequestStatus()
        //      }.store(in: &cancellables)
        //
        //      live!.$wifiConnected.sink { [weak self] (isConnected: Bool) in
        //        guard let self = self else { return }
        //        self.glassesWifiConnected = isConnected
        //        handleRequestStatus()
        //      }.store(in: &cancellables)
        //
        //      live!.onButtonPress = { [weak self] (buttonId: String, pressType: String) in
        //        guard let self = self else { return }
        //        Bridge.sendButtonPress(buttonId: buttonId, pressType: pressType)
        //      }
        //      live!.onPhotoRequest = { [weak self] (requestId: String, photoUrl: String) in
        //        guard let self = self else { return }
        //        Bridge.sendPhotoResponse(requestId: requestId, photoUrl: photoUrl)
        //      }
        //      live!.onVideoStreamResponse = { [weak self] (appId: String, streamUrl: String) in
        //        guard let self = self else { return }
        //        Bridge.sendVideoStreamResponse(appId: appId, streamUrl: streamUrl)
        //      }
        //    }
        //
        //    if sgc is Mach1 {
        //      let mach1 = sgc as? Mach1
        //      mach1!.onConnectionStateChanged = { [weak self] in
        //        guard let self = self else { return }
        //        Bridge.log(
        //          "Mach1 glasses connection changed to: \(mach1!.ready ? "Connected" : "Disconnected")"
        //        )
        //        if mach1!.ready {
        //          handleDeviceReady()
        //        } else {
        //          handleDeviceDisconnected()
        //          handleRequestStatus()
        //        }
        //      }
        //
        //      mach1!.$batteryLevel.sink { [weak self] (level: Int) in
        //        guard let self = self else { return }
        //        guard level >= 0 else { return }
        //        self.batteryLevel = level
        //        Bridge.sendBatteryStatus(level: self.batteryLevel, charging: false)
        //        handleRequestStatus()
        //      }.store(in: &cancellables)
        //
        //      mach1!.$isHeadUp.sink { [weak self] (value: Bool) in
        //        guard let self = self else { return }
        //        updateHeadUp(value)
        //      }.store(in: &cancellables)
        //    }
    }

    func updateHeadUp(_ isHeadUp: Bool) {
        self.isHeadUp = isHeadUp
        sendCurrentState(isHeadUp)
        Bridge.sendHeadUp(isHeadUp)
    }

    func onAppStateChange(_: [ThirdPartyCloudApp]) {
        handleRequestStatus()
    }

    func onConnectionError(_: String) {
        handleRequestStatus()
    }

    func onAuthError() {}

    // MARK: - Voice Data Handling

    private func checkSetVadStatus(speaking: Bool) {
        if speaking != isSpeaking {
            isSpeaking = speaking
            Bridge.sendVadStatus(isSpeaking)
        }
    }

    private func emptyVadBuffer() {
        // go through the buffer, popping from the first element in the array (FIFO):
        while !vadBuffer.isEmpty {
            let chunk = vadBuffer.removeFirst()
            Bridge.sendMicData(chunk)
        }
    }

    private func addToVadBuffer(_ chunk: Data) {
        let MAX_BUFFER_SIZE = 20
        vadBuffer.append(chunk)
        while vadBuffer.count > MAX_BUFFER_SIZE {
            // pop from the front of the array:
            vadBuffer.removeFirst()
        }
    }

    func handleGlassesMicData(_ rawLC3Data: Data) {
        // decode the g1 audio data to PCM and feed to the VAD:

        // Ensure we have enough data to process
        guard rawLC3Data.count > 2 else {
            Bridge.log("Received invalid PCM data size: \(rawLC3Data.count)")
            return
        }

        // Skip the first 2 bytes which are command bytes
        let lc3Data = rawLC3Data.subdata(in: 2 ..< rawLC3Data.count)

        // Ensure we have valid PCM data
        guard lc3Data.count > 0 else {
            Bridge.log("No LC3 data after removing command bytes")
            return
        }

        if bypassVad || bypassVadForPCM {
            Bridge.log(
                "Mentra: Glasses mic VAD bypassed - bypassVad=\(bypassVad), bypassVadForPCM=\(bypassVadForPCM)"
            )
            checkSetVadStatus(speaking: true)
            // first send out whatever's in the vadBuffer (if there is anything):
            emptyVadBuffer()
            let pcmConverter = PcmConverter()
            let pcmData = pcmConverter.decode(lc3Data) as Data
            //        self.serverComms.sendAudioChunk(lc3Data)
            Bridge.sendMicData(pcmData)
            return
        }

        let pcmConverter = PcmConverter()
        let pcmData = pcmConverter.decode(lc3Data) as Data

        guard pcmData.count > 0 else {
            Bridge.log("PCM conversion resulted in empty data")
            return
        }

        // feed PCM to the VAD:
        guard let vad = vad else {
            Bridge.log("VAD not initialized")
            return
        }

        // convert audioData to Int16 array:
        let pcmDataArray = pcmData.withUnsafeBytes { pointer -> [Int16] in
            Array(
                UnsafeBufferPointer(
                    start: pointer.bindMemory(to: Int16.self).baseAddress,
                    count: pointer.count / MemoryLayout<Int16>.stride
                ))
        }

        vad.checkVAD(pcm: pcmDataArray) { [weak self] state in
            guard let self = self else { return }
            Bridge.log("VAD State: \(state)")
        }

        let vadState = vad.currentState()
        if vadState == .speeching {
            checkSetVadStatus(speaking: true)
            // first send out whatever's in the vadBuffer (if there is anything):
            emptyVadBuffer()
            //        self.serverComms.sendAudioChunk(lc3Data)
            Bridge.sendMicData(pcmData)
        } else {
            checkSetVadStatus(speaking: false)
            // add to the vadBuffer:
            //        addToVadBuffer(lc3Data)
            addToVadBuffer(pcmData)
        }
    }

    func handlePcm(_ pcmData: Data) {
        // handle incoming PCM data from the microphone manager and feed to the VAD:

        // feed PCM to the VAD:
        guard let vad = vad else {
            Bridge.log("VAD not initialized")
            return
        }

        if bypassVad || bypassVadForPCM {
            //          let pcmConverter = PcmConverter()
            //          let lc3Data = pcmConverter.encode(pcmData) as Data
            //          checkSetVadStatus(speaking: true)
            //          // first send out whatever's in the vadBuffer (if there is anything):
            //          emptyVadBuffer()
            //          self.serverComms.sendAudioChunk(lc3Data)
            if shouldSendPcmData {
                // Bridge.log("Mentra: Sending PCM data to server")
                Bridge.sendMicData(pcmData)
            }

            // Also send to local transcriber when bypassing VAD
            if shouldSendTranscript {
                transcriber?.acceptAudio(pcm16le: pcmData)
            }
            return
        }

        // convert audioData to Int16 array:
        let pcmDataArray = pcmData.withUnsafeBytes { pointer -> [Int16] in
            Array(
                UnsafeBufferPointer(
                    start: pointer.bindMemory(to: Int16.self).baseAddress,
                    count: pointer.count / MemoryLayout<Int16>.stride
                ))
        }

        vad.checkVAD(pcm: pcmDataArray) { [weak self] state in
            guard let self = self else { return }
            //            self.handler?(state)
            Bridge.log("VAD State: \(state)")
        }

        // encode the pcmData as LC3:
        //        let pcmConverter = PcmConverter()
        //        let lc3Data = pcmConverter.encode(pcmData) as Data

        let vadState = vad.currentState()
        if vadState == .speeching {
            checkSetVadStatus(speaking: true)
            // first send out whatever's in the vadBuffer (if there is anything):
            emptyVadBuffer()
            //          self.serverComms.sendAudioChunk(lc3Data)
            if shouldSendPcmData {
                Bridge.sendMicData(pcmData)
            }

            // Send to local transcriber when speech is detected
            if shouldSendTranscript {
                transcriber?.acceptAudio(pcm16le: pcmData)
            }
        } else {
            checkSetVadStatus(speaking: false)
            // add to the vadBuffer:
            //          addToVadBuffer(lc3Data)
            addToVadBuffer(pcmData)
        }
    }

    func handleConnectionStateChange() {
        Bridge.log("Mentra: Glasses: connection state changed!")
        if sgc == nil { return }
        if sgc!.ready {
            handleDeviceReady()
        } else {
            handleDeviceDisconnected()
            handleRequestStatus()
        }
    }

    // MARK: - ServerCommsCallback Implementation

    func handle_microphone_state_change(_ requiredData: [SpeechRequiredDataType], _ bypassVad: Bool) {
        var requiredData = requiredData // make mutable
        Bridge.log(
            "Mentra: MIC: @@@@@@@@ changing mic with requiredData: \(requiredData) bypassVad=\(bypassVad) enforceLocalTranscription=\(enforceLocalTranscription) @@@@@@@@@@@@@@@@"
        )

        bypassVadForPCM = bypassVad

        shouldSendPcmData = false
        shouldSendTranscript = false

        // this must be done before the requiredData is modified by offlineStt:
        currentRequiredData = requiredData

        if offlineStt, !requiredData.contains(.PCM_OR_TRANSCRIPTION), !requiredData.contains(.TRANSCRIPTION) {
            requiredData.append(.TRANSCRIPTION)
        }

        if requiredData.contains(.PCM), requiredData.contains(.TRANSCRIPTION) {
            shouldSendPcmData = true
            shouldSendTranscript = true
        } else if requiredData.contains(.PCM) {
            shouldSendPcmData = true
            shouldSendTranscript = false
        } else if requiredData.contains(.TRANSCRIPTION) {
            shouldSendTranscript = true
            shouldSendPcmData = false
        } else if requiredData.contains(.PCM_OR_TRANSCRIPTION) {
            // TODO: Later add bandwidth based logic
            if enforceLocalTranscription {
                shouldSendTranscript = true
                shouldSendPcmData = false
            } else {
                shouldSendPcmData = true
                shouldSendTranscript = false
            }
        }

        // Core.log("Mentra: MIC: shouldSendPcmData=\(shouldSendPcmData), shouldSendTranscript=\(shouldSendTranscript)")

        // in any case, clear the vadBuffer:
        vadBuffer.removeAll()
        micEnabled = !requiredData.isEmpty

        // Handle microphone state change if needed
        Task {
            // Only enable microphone if sensing is also enabled
            var actuallyEnabled = micEnabled && self.sensingEnabled

            let glassesHasMic = sgc?.hasMic ?? false

            var useGlassesMic = false
            var useOnboardMic = false

            useOnboardMic = self.preferredMic == "phone"
            useGlassesMic = self.preferredMic == "glasses"

            if self.onboardMicUnavailable {
                useOnboardMic = false
            }

            if !glassesHasMic {
                useGlassesMic = false
            }

            if !useGlassesMic, !useOnboardMic {
                // if we have a non-preferred mic, use it:
                if glassesHasMic {
                    useGlassesMic = true
                } else if !self.onboardMicUnavailable {
                    useOnboardMic = true
                }

                if !useGlassesMic, !useOnboardMic {
                    Bridge.log(
                        "Mentra: no mic to use! falling back to glasses mic!!!!! (this should not happen)"
                    )
                    useGlassesMic = true
                }
            }

            useGlassesMic = actuallyEnabled && useGlassesMic
            useOnboardMic = actuallyEnabled && useOnboardMic

            // Core.log(
            //     "Mentra: MIC: isEnabled: \(isEnabled) sensingEnabled: \(self.sensingEnabled) useOnboardMic: \(useOnboardMic) " +
            //         "useGlassesMic: \(useGlassesMic) glassesHasMic: \(glassesHasMic) preferredMic: \(self.preferredMic) " +
            //         "somethingConnected: \(isSomethingConnected()) onboardMicUnavailable: \(self.onboardMicUnavailable)" +
            //         "actuallyEnabled: \(actuallyEnabled)"
            // )

            // if a g1 is connected, set the mic enabled:
            if sgc?.type == "g1", sgc!.ready {
                await sgc!.setMicEnabled(useGlassesMic)
            }

            setOnboardMicEnabled(useOnboardMic)
        }
    }

    func onJsonMessage(_ message: [String: Any]) {
        Bridge.log("Mentra: onJsonMessage: \(message)")
        sgc?.sendJson(message, wakeUp: false)
    }

    func handle_photo_request(_ requestId: String, _ appId: String, _ webhookUrl: String?, _ size: String) {
        Bridge.log("Mentra: onPhotoRequest: \(requestId), \(appId), \(webhookUrl), size=\(size)")
        sgc?.requestPhoto(
            requestId, appId: appId, webhookUrl: webhookUrl.isEmpty ? nil : webhookUrl, size: size
        )
    }

    func onRtmpStreamStartRequest(_ message: [String: Any]) {
        Bridge.log("Mentra: onRtmpStreamStartRequest: \(message)")
        sgc?.startRtmpStream(message)
    }

    func onRtmpStreamStop() {
        Bridge.log("Mentra: onRtmpStreamStop")
        sgc?.stopRtmpStream()
    }

    func onRtmpStreamKeepAlive(_ message: [String: Any]) {
        Bridge.log("Mentra: onRtmpStreamKeepAlive: \(message)")
        sgc?.sendRtmpKeepAlive(message)
    }

    func onStartBufferRecording() {
        Bridge.log("Mentra: onStartBufferRecording")
        sgc?.startBufferRecording()
    }

    func onStopBufferRecording() {
        Bridge.log("Mentra: onStopBufferRecording")
        sgc?.stopBufferRecording()
    }

    func onSaveBufferVideo(_ requestId: String, _ durationSeconds: Int) {
        Bridge.log(
            "Mentra: onSaveBufferVideo: requestId=\(requestId), duration=\(durationSeconds)s")
        sgc?.saveBufferVideo(requestId: requestId, durationSeconds: durationSeconds)
    }

    func onStartVideoRecording(_ requestId: String, _ save: Bool) {
        Bridge.log("Mentra: onStartVideoRecording: requestId=\(requestId), save=\(save)")
        sgc?.startVideoRecording(requestId: requestId, save: save)
    }

    func onStopVideoRecording(_ requestId: String) {
        Bridge.log("Mentra: onStopVideoRecording: requestId=\(requestId)")
        sgc?.stopVideoRecording(requestId: requestId)
    }

    func setOnboardMicEnabled(_ isEnabled: Bool) {
        Task {
            if isEnabled {
                // Just check permissions - we no longer request them directly from Swift
                // Permissions should already be granted via React Native UI flow
                if !(PhoneMic.shared.checkPermissions()) {
                    Bridge.log("Microphone permissions not granted. Cannot enable microphone.")
                    return
                }

                let success = PhoneMic.shared.startRecording()
                if !success {
                    // fallback to glasses mic if possible:
                    if getGlassesHasMic() {
                        await enableGlassesMic(true)
                    }
                }
            } else {
                PhoneMic.shared.stopRecording()
            }
        }
    }

    //  func onDashboardDisplayEvent(_ event: [String: Any]) {
    //    Core.log("got dashboard display event")
    ////    onDisplayEvent?(["event": event, "type": "dashboard"])
    //    Core.log(event)
    ////    Task {
    ////      await self.g1Manager.sendText(text: "\(event)")
    ////    }
    //  }

    // send whatever was there before sending something else:
    func clearState() {
        sendCurrentState(sgc?.isHeadUp ?? false)
    }

    func sendCurrentState(_ isDashboard: Bool) {
        // Cancel any pending delayed execution
        // sendStateWorkItem?.cancel()

        // don't send the screen state if we're updating the screen:
        if isUpdatingScreen {
            return
        }

        // Execute immediately
        executeSendCurrentState(isDashboard)

        // // Schedule a delayed execution that will fire in 1 second if not cancelled
        // let workItem = DispatchWorkItem { [weak self] in
        //     self?.executeSendCurrentState(isDashboard)
        // }

        // sendStateWorkItem = workItem
        // sendStateQueue.asyncAfter(deadline: .now() + 0.5, execute: workItem)
    }

    func executeSendCurrentState(_ isDashboard: Bool) {
        Task {
            var currentViewState: ViewState!
            if isDashboard {
                currentViewState = self.viewStates[1]
            } else {
                currentViewState = self.viewStates[0]
            }
            self.isHeadUp = isDashboard

            if isDashboard && !self.contextualDashboard {
                return
            }

            if self.defaultWearable.contains("Simulated") || self.defaultWearable.isEmpty {
                // dont send the event to glasses that aren't there:
                return
            }

            if !self.isSomethingConnected() {
                return
            }

            // cancel any pending clear display work item:
            sendStateWorkItem?.cancel()

            let layoutType = currentViewState.layoutType
            switch layoutType {
            case "text_wall":
                let text = currentViewState.text
                sendText(text)
            case "double_text_wall":
                let topText = currentViewState.topText
                let bottomText = currentViewState.bottomText
                sgc?.sendDoubleTextWall(topText, bottomText)
                sgc?.sendDoubleTextWall(topText, bottomText)
            case "reference_card":
                sendText(currentViewState.title + "\n\n" + currentViewState.text)
            case "bitmap_view":
                Bridge.log("Mentra: Processing bitmap_view layout")
                guard let data = currentViewState.data else {
                    Bridge.log("Mentra: ERROR: bitmap_view missing data field")
                    return
                }
                Bridge.log("Mentra: Processing bitmap_view with base64 data, length: \(data.count)")
                await sgc?.displayBitmap(base64ImageData: data)
            case "clear_view":
                Bridge.log("Mentra: Processing clear_view layout - clearing display")
                clearDisplay()
            default:
                Bridge.log("UNHANDLED LAYOUT_TYPE \(layoutType)")
            }
        }
    }

    func parsePlaceholders(_ text: String) -> String {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "M/dd, h:mm"
        let formattedDate = dateFormatter.string(from: Date())

        // 12-hour time format (with leading zeros for hours)
        let time12Format = DateFormatter()
        time12Format.dateFormat = "hh:mm"
        let time12 = time12Format.string(from: Date())

        // 24-hour time format
        let time24Format = DateFormatter()
        time24Format.dateFormat = "HH:mm"
        let time24 = time24Format.string(from: Date())

        // Current date with format MM/dd
        let dateFormat = DateFormatter()
        dateFormat.dateFormat = "MM/dd"
        let currentDate = dateFormat.string(from: Date())

        var placeholders: [String: String] = [:]
        placeholders["$no_datetime$"] = formattedDate
        placeholders["$DATE$"] = currentDate
        placeholders["$TIME12$"] = time12
        placeholders["$TIME24$"] = time24

        if sgc?.batteryLevel == -1 {
            placeholders["$GBATT$"] = ""
        } else {
            placeholders["$GBATT$"] = "\(sgc?.batteryLevel)%"
        }

        //        placeholders["$CONNECTION_STATUS$"] =
        //            WebSocketManager.shared.isConnected() ? "Connected" : "Disconnected"
        // TODO: config:
        placeholders["$CONNECTION_STATUS$"] = "Connected"

        var result = text
        for (key, value) in placeholders {
            result = result.replacingOccurrences(of: key, with: value)
        }

        return result
    }

    func handle_display_text(_ params: [String: Any]) {
        guard let text = params["text"] as? String else {
            Bridge.log("Mentra: display_text missing text parameter")
            return
        }

        Bridge.log("Mentra: Displaying text: \(text)")
        sendText(text)
    }

    func handle_display_event(_ event: [String: Any]) {
        guard let view = event["view"] as? String else {
            Bridge.log("Mentra: invalid view")
            return
        }
        let isDashboard = view == "dashboard"

        var stateIndex = 0
        if isDashboard {
            stateIndex = 1
        } else {
            stateIndex = 0
        }

        let layout = event["layout"] as! [String: Any]
        let layoutType = layout["layoutType"] as! String
        var text = layout["text"] as? String ?? " "
        var topText = layout["topText"] as? String ?? " "
        var bottomText = layout["bottomText"] as? String ?? " "
        var title = layout["title"] as? String ?? " "
        var data = layout["data"] as? String ?? ""

        text = parsePlaceholders(text)
        topText = parsePlaceholders(topText)
        bottomText = parsePlaceholders(bottomText)
        title = parsePlaceholders(title)

        var newViewState = ViewState(
            topText: topText, bottomText: bottomText, title: title, layoutType: layoutType,
            text: text, data: data, animationData: nil
        )

        if layoutType == "bitmap_animation" {
            if let frames = layout["frames"] as? [String],
               let interval = layout["interval"] as? Double
            {
                let animationData: [String: Any] = [
                    "frames": frames,
                    "interval": interval,
                    "repeat": layout["repeat"] as? Bool ?? true,
                ]
                newViewState.animationData = animationData
                Bridge.log(
                    "Mentra: Parsed bitmap_animation with \(frames.count) frames, interval: \(interval)ms"
                )
            } else {
                Bridge.log("Mentra: ERROR: bitmap_animation missing frames or interval")
            }
        }

        let cS = viewStates[stateIndex]
        let nS = newViewState
        let currentState =
            cS.layoutType + cS.text + cS.topText + cS.bottomText + cS.title + (cS.data ?? "")
        let newState =
            nS.layoutType + nS.text + nS.topText + nS.bottomText + nS.title + (nS.data ?? "")

        if currentState == newState {
            // Core.log("Mentra: View state is the same, skipping update")
            return
        }

        Bridge.log(
            "Updating view state \(stateIndex) with \(layoutType) \(text) \(topText) \(bottomText)")

        viewStates[stateIndex] = newViewState

        let headUp = isHeadUp
        // send the state we just received if the user is currently in that state:
        if stateIndex == 0, !headUp {
            sendCurrentState(false)
        } else if stateIndex == 1, headUp {
            sendCurrentState(true)
        }
    }

    func onRequestSingle(_ dataType: String) {
        // Handle single data request
        if dataType == "battery" {
            // Send battery status if needed
        }
        // TODO:
        handleRequestStatus()
    }

    func onRouteChange(
        reason: AVAudioSession.RouteChangeReason, availableInputs: [AVAudioSessionPortDescription]
    ) {
        Bridge.log("Mentra: onRouteChange: reason: \(reason)")
        Bridge.log("Mentra: onRouteChange: inputs: \(availableInputs)")

        // Core.log the available inputs and see if any are an onboard mic:
        // for input in availableInputs {
        //   Core.log("input: \(input.portType)")
        // }

        // if availableInputs.isEmpty {
        //   self.onboardMicUnavailable = true
        //   self.setOnboardMicEnabled(false)
        //   handle_microphone_state_change([], false)
        //   return
        // } else {
        //   self.onboardMicUnavailable = false
        // }

        //        switch reason {
        //        case .newDeviceAvailable:
        //            micManager?.stopRecording()
        //            micManager?.startRecording()
        //        case .oldDeviceUnavailable:
        //            micManager?.stopRecording()
        //            micManager?.startRecording()
        //        default:
        //            break
        //        }
        // TODO: re-enable this:
        // handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
    }

    func onInterruption(began: Bool) {
        Bridge.log("Mentra: Interruption: \(began)")

        onboardMicUnavailable = began
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
    }

    private func clearDisplay() {
        sgc!.clearDisplay()

        if sgc is G1 {
            let g1 = sgc as? G1
            g1?.sendTextWall(" ")

            // clear the screen after 3 seconds if the text is empty or a space:
            if powerSavingMode {
                sendStateWorkItem?.cancel()
                Bridge.log("Mentra: Clearing display after 3 seconds")
                // if we're clearing the display, after a delay, send a clear command if not cancelled with another
                let workItem = DispatchWorkItem { [weak self] in
                    guard let self = self else { return }
                    if self.isHeadUp {
                        return
                    }
                    g1?.clearDisplay()
                }
                sendStateWorkItem = workItem
                sendStateQueue.asyncAfter(deadline: .now() + 3, execute: workItem)
            }
        }
    }

    private func sendText(_ text: String) {
        // Core.log("Mentra: Sending text: \(text)")
        if sgc == nil {
            return
        }

        if text == " " || text.isEmpty {
            clearDisplay()
            return
        }

        sgc?.sendTextWall(text)
    }

    // command functions:
    func setAuthCreds(_ token: String, _ userId: String) {
        Bridge.log("Mentra: Setting core token to: \(token) for user: \(userId)")
        setup() // finish init():
        coreToken = token
        coreTokenOwner = userId
        handleRequestStatus()
    }

    func disconnectWearable() {
        sendText(" ") // clear the screen
        Task {
            connectTask?.cancel()
            sgc?.disconnect()
            self.isSearching = false
            handleRequestStatus()
        }
    }

    func forgetSmartGlasses() {
        disconnectWearable()
        defaultWearable = ""
        deviceName = ""
        sgc?.forget()
        sgc = nil
        Bridge.saveSetting("default_wearable", "")
        Bridge.saveSetting("device_name", "")
        handleRequestStatus()
    }

    func handleSearchForCompatibleDeviceNames(_ modelName: String) {
        Bridge.log("Mentra: Searching for compatible device names for: \(modelName)")
        if modelName.contains("Simulated") {
            defaultWearable = "Simulated Glasses" // there is no pairing process for simulated glasses
            handleRequestStatus()
            return
        }
        if modelName.contains("G1") {
            pendingWearable = "Even Realities G1"
        } else if modelName.contains("Live") {
            pendingWearable = "Mentra Live"
        } else if modelName.contains("Mach1") || modelName.contains("Z100") {
            pendingWearable = "Mach1"
        }
        initSGC(pendingWearable)
        sgc?.findCompatibleDevices()
    }

    func enableContextualDashboard(_ enabled: Bool) {
        contextualDashboard = enabled
        handleRequestStatus() // to update the UI
    }

    func setPreferredMic(_ mic: String) {
        preferredMic = mic
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
        handleRequestStatus() // to update the UI
    }

    func setButtonMode(_ mode: String) {
        buttonPressMode = mode
        sgc?.sendButtonModeSetting()
        handleRequestStatus() // to update the UI
    }

    func setButtonPhotoSize(_ size: String) {
        buttonPhotoSize = size
        sgc?.sendButtonPhotoSettings()
        handleRequestStatus() // to update the UI
    }

    func setButtonVideoSettings(width: Int, height: Int, fps: Int) {
        buttonVideoWidth = width
        buttonVideoHeight = height
        buttonVideoFps = fps
        sgc?.sendButtonVideoRecordingSettings()
        handleRequestStatus() // to update the UI
    }

    func setButtonCameraLed(_: Bool) {
        sgc?.sendButtonCameraLedSetting()

        handleRequestStatus() // to update the UI
    }

    func setOfflineStt(_ enabled: Bool) {
        offlineStt = enabled
        // trigger a microphone state change if needed:
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
    }

    func updateGlassesHeadUpAngle(_ value: Int) {
        headUpAngle = value
        sgc?.setHeadUpAngle(value)
        handleRequestStatus() // to update the UI
    }

    func updateGlassesBrightness(_ value: Int, autoBrightness: Bool) {
        let autoBrightnessChanged = self.autoBrightness != autoBrightness
        brightness = value
        self.autoBrightness = autoBrightness
        Task {
            sgc?.setBrightness(value, autoMode: autoBrightness)
            if autoBrightnessChanged {
                sendText(autoBrightness ? "Enabled auto brightness" : "Disabled auto brightness")
            } else {
                sendText("Set brightness to \(value)%")
            }
            try? await Task.sleep(nanoseconds: 800_000_000) // 0.8 seconds
            sendText(" ") // clear screen
        }
        handleRequestStatus() // to update the UI
    }

    func updateGlassesDepth(_ value: Int) {
        dashboardDepth = value
        Task {
            await sgc?.setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
            Bridge.log("Mentra: Set dashboard depth to \(value)")
        }
        handleRequestStatus() // to update the UI
    }

    func updateGlassesHeight(_ value: Int) {
        dashboardHeight = value
        Task {
            await sgc?.setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
            Bridge.log("Mentra: Set dashboard height to \(value)")
        }
        handleRequestStatus() // to update the UI
    }

    func enableSensing(_ enabled: Bool) {
        sensingEnabled = enabled
        // Update microphone state when sensing is toggled
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
        handleRequestStatus() // to update the UI
    }

    func enablePowerSavingMode(_ enabled: Bool) {
        powerSavingMode = enabled
        handleRequestStatus() // to update the UI
    }

    func enableAlwaysOnStatusBar(_ enabled: Bool) {
        alwaysOnStatusBar = enabled
        handleRequestStatus() // to update the UI
    }

    func bypassVad(_ enabled: Bool) {
        bypassVad = enabled
        handleRequestStatus() // to update the UI
    }

    func enforceLocalTranscription(_ enabled: Bool) {
        enforceLocalTranscription = enabled

        if currentRequiredData.contains(.PCM_OR_TRANSCRIPTION) {
            // TODO: Later add bandwidth based logic
            if enforceLocalTranscription {
                shouldSendTranscript = true
                shouldSendPcmData = false
            } else {
                shouldSendPcmData = true
                shouldSendTranscript = false
            }
        }

        handleRequestStatus() // to update the UI
    }

    func startBufferRecording() {
        sgc?.startBufferRecording()
    }

    func stopBufferRecording() {
        sgc?.stopBufferRecording()
    }

    func setBypassAudioEncoding(_ enabled: Bool) {
        bypassAudioEncoding = enabled
    }

    func setMetricSystemEnabled(_ enabled: Bool) {
        metricSystemEnabled = enabled
        handleRequestStatus()
    }

    func toggleUpdatingScreen(_ enabled: Bool) {
        Bridge.log("Mentra: Toggling updating screen: \(enabled)")
        if enabled {
            sgc?.exit()
            isUpdatingScreen = true
        } else {
            isUpdatingScreen = false
        }
    }

    func showDashboard() {
        sgc?.showDashboard()
    }

    func saveBufferVideo(requestId: String, durationSeconds: Int) {
        sgc?.saveBufferVideo(requestId: requestId, durationSeconds: durationSeconds)
    }

    func startVideoRecording(requestId: String, save: Bool) {
        sgc?.startVideoRecording(requestId: requestId, save: save)
    }

    @objc func stopVideoRecording(requestId: String) {
        sgc?.stopVideoRecording(requestId: requestId)
    }

    func requestWifiScan() {
        Bridge.log("Mentra: Requesting wifi scan")
        sgc?.requestWifiScan()
    }

    func sendWifiCredentials(_ ssid: String, _ password: String) {
        Bridge.log("Mentra: Sending wifi credentials: \(ssid) \(password)")
        sgc?.sendWifiCredentials(ssid, password)
    }

    func setGlassesHotspotState(_ enabled: Bool) {
        Bridge.log("Mentra: 🔥 Setting glasses hotspot state: \(enabled)")
        sgc?.sendHotspotState(enabled)
    }

    func queryGalleryStatus() {
        Bridge.log("Mentra: 📸 Querying gallery status from glasses")
        sgc?.queryGalleryStatus()
    }

    func restartTranscriber() {
        Bridge.log("Mentra: Restarting SherpaOnnxTranscriber via command")
        transcriber?.restart()
    }

    private func getGlassesHasMic() -> Bool {
        if defaultWearable.contains("G1") {
            return true
        }
        if defaultWearable.contains("Live") {
            return false
        }
        if defaultWearable.contains("Mach1") {
            return false
        }
        return false
    }

    func enableGlassesMic(_: Bool) async {
        await sgc?.setMicEnabled(true)
    }

    func handleRequestStatus() {
        // construct the status object:
        let simulatedConnected = defaultWearable == "Simulated Glasses"
        let isGlassesConnected = sgc?.ready ?? false
        if isGlassesConnected {
            isSearching = false
        }

        // also referenced as glasses_info:
        var glassesSettings: [String: Any] = [:]
        var connectedGlasses: [String: Any] = [:]

        if isGlassesConnected {
            connectedGlasses = [
                "model_name": defaultWearable,
                "battery_level": sgc?.batteryLevel ?? -1,
                "glasses_app_version": sgc?.glassesAppVersion ?? "",
                "glasses_build_number": sgc?.glassesBuildNumber ?? "",
                "glasses_device_model": sgc?.glassesDeviceModel ?? "",
                "glasses_android_version": sgc?.glassesAndroidVersion ?? "",
                "glasses_ota_version_url": sgc?.glassesOtaVersionUrl ?? "",
            ]
        }

        if simulatedConnected {
            connectedGlasses["model_name"] = defaultWearable
        }

        if sgc is G1 {
            connectedGlasses["case_removed"] = sgc?.caseRemoved ?? true
            connectedGlasses["case_open"] = sgc?.caseOpen ?? true
            connectedGlasses["case_charging"] = sgc?.caseCharging ?? false
            connectedGlasses["case_battery_level"] = sgc?.caseBatteryLevel ?? -1

            if let serialNumber = sgc?.glassesSerialNumber, !serialNumber.isEmpty {
                connectedGlasses["glasses_serial_number"] = serialNumber
                connectedGlasses["glasses_style"] = sgc?.glassesStyle ?? ""
                connectedGlasses["glasses_color"] = sgc?.glassesColor ?? ""
            }
        }

        if sgc is MentraLive {
            if let wifiSsid = sgc?.wifiSsid, !wifiSsid.isEmpty {
                connectedGlasses["glasses_wifi_ssid"] = wifiSsid
                connectedGlasses["glasses_wifi_connected"] = sgc?.wifiConnected
                connectedGlasses["glasses_wifi_local_ip"] = sgc?.wifiLocalIp
            }

            // Add hotspot information - always include all fields for consistency
            connectedGlasses["glasses_hotspot_enabled"] = sgc?.isHotspotEnabled ?? false
            connectedGlasses["glasses_hotspot_ssid"] = sgc?.hotspotSsid ?? ""
            connectedGlasses["glasses_hotspot_password"] = sgc?.hotspotPassword ?? ""
            connectedGlasses["glasses_hotspot_gateway_ip"] = sgc?.hotspotGatewayIp ?? ""
        }

        // Add Bluetooth device name if available
        if let bluetoothName = sgc?.getConnectedBluetoothName() {
            connectedGlasses["bluetooth_name"] = bluetoothName
        }

        glassesSettings = [
            "brightness": brightness,
            "auto_brightness": autoBrightness,
            "dashboard_height": dashboardHeight,
            "dashboard_depth": dashboardDepth,
            "head_up_angle": headUpAngle,
            "button_mode": buttonPressMode,
            "button_photo_size": buttonPhotoSize,
            "button_video_settings": [
                "width": buttonVideoWidth,
                "height": buttonVideoHeight,
                "fps": buttonVideoFps,
            ],
            "button_camera_led": buttonCameraLed,
        ]

        //        let cloudConnectionStatus =
        //            WebSocketManager.shared.isConnected() ? "CONNECTED" : "DISCONNECTED"

        // TODO: config: remove
        let coreInfo: [String: Any] = [
            "augmentos_core_version": "Unknown",
            "default_wearable": defaultWearable as Any,
            "preferred_mic": preferredMic,
            // "is_searching": self.isSearching && !self.defaultWearable.isEmpty,
            "is_searching": isSearching,
            // only on if recording from glasses:
            // TODO: this isn't robust:
            "is_mic_enabled_for_frontend": micEnabled && (preferredMic == "glasses")
                && isSomethingConnected(),
            "sensing_enabled": sensingEnabled,
            "power_saving_mode": powerSavingMode,
            "always_on_status_bar": alwaysOnStatusBar,
            "bypass_vad_for_debugging": bypassVad,
            "enforce_local_transcription": enforceLocalTranscription,
            "bypass_audio_encoding_for_debugging": bypassAudioEncoding,
            "core_token": coreToken,
            "puck_connected": true,
            "metric_system_enabled": metricSystemEnabled,
            "contextual_dashboard_enabled": contextualDashboard,
        ]

        // hardcoded list of apps:
        var apps: [[String: Any]] = []

        let authObj: [String: Any] = [
            "core_token_owner": coreTokenOwner,
            //      "core_token_status":
        ]

        let statusObj: [String: Any] = [
            "connected_glasses": connectedGlasses,
            "glasses_settings": glassesSettings,
            "apps": apps,
            "core_info": coreInfo,
            "auth": authObj,
        ]

        lastStatusObj = statusObj

        Bridge.sendStatus(statusObj)
    }

    func triggerStatusUpdate() {
        Bridge.log("🔄 Triggering immediate status update")
        handleRequestStatus()
    }

    private func playStartupSequence() {
        Bridge.log("Mentra: playStartupSequence()")
        // Arrow frames for the animation
        let arrowFrames = ["↑", "↗", "↑", "↖"]

        let delay = 0.25 // Frame delay in seconds
        let totalCycles = 2 // Number of animation cycles

        // Variables to track animation state
        var frameIndex = 0
        var cycles = 0

        // Create a dispatch queue for the animation
        let animationQueue = DispatchQueue.global(qos: .userInteractive)

        // Function to display the current animation frame
        func displayFrame() {
            // Check if we've completed all cycles
            if cycles >= totalCycles {
                // End animation with final message
                sendText("                  /// MentraOS Connected \\\\\\")
                animationQueue.asyncAfter(deadline: .now() + 1.0) {
                    self.sendText(" ")
                }
                return
            }

            // Display current animation frame
            let frameText =
                "                    \(arrowFrames[frameIndex]) MentraOS Booting \(arrowFrames[frameIndex])"
            sendText(frameText)

            // Move to next frame
            frameIndex = (frameIndex + 1) % arrowFrames.count

            // Count completed cycles
            if frameIndex == 0 {
                cycles += 1
            }

            // Schedule next frame
            animationQueue.asyncAfter(deadline: .now() + delay) {
                displayFrame()
            }
        }

        // Start the animation after a short initial delay
        animationQueue.asyncAfter(deadline: .now() + 0.35) {
            displayFrame()
        }
    }

    private func isSomethingConnected() -> Bool {
        if sgc?.ready == true {
            return true
        }
        if defaultWearable.contains("Simulated") {
            return true
        }
        return false
    }

    private func handleDeviceReady() {
        // send to the server our battery status:
        Bridge.sendBatteryStatus(level: sgc?.batteryLevel ?? -1, charging: false)
        Bridge.sendGlassesConnectionState(modelName: defaultWearable, status: "CONNECTED")

        if pendingWearable.contains("Live") {
            handleLiveReady()
        } else if pendingWearable.contains("G1") {
            handleG1Ready()
        } else if defaultWearable.contains("Mach1") {
            handleMach1Ready()
        }
        // save the default_wearable now that we're connected:
        Bridge.saveSetting("default_wearable", defaultWearable)
        Bridge.saveSetting("device_name", deviceName)
    }

    private func handleG1Ready() {
        isSearching = false
        defaultWearable = "Even Realities G1"
        handleRequestStatus()

        let shouldSendBootingMessage = true

        // load settings and send the animation:
        Task {
            // give the glasses some extra time to finish booting:
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 3 seconds
            await sgc?.setSilentMode(false) // turn off silent mode
            await sgc?.getBatteryStatus()

            if shouldSendBootingMessage {
                sendText("// BOOTING MENTRAOS")
            }

            // send loaded settings to glasses:
            try? await Task.sleep(nanoseconds: 400_000_000)
            sgc?.setHeadUpAngle(headUpAngle)
            try? await Task.sleep(nanoseconds: 400_000_000)
            sgc?.setBrightness(brightness, autoMode: autoBrightness)
            try? await Task.sleep(nanoseconds: 400_000_000)
            // self.g1Manager?.RN_setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
            // try? await Task.sleep(nanoseconds: 400_000_000)
            //      playStartupSequence()
            if shouldSendBootingMessage {
                sendText("// MENTRAOS CONNECTED")
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
                sendText(" ") // clear screen
            }

            self.handleRequestStatus()
        }
    }

    private func handleLiveReady() {
        Bridge.log("Mentra: Mentra Live device ready")
        isSearching = false
        defaultWearable = "Mentra Live"
        handleRequestStatus()
    }

    private func handleMach1Ready() {
        Bridge.log("Mentra: Mach1 device ready")
        isSearching = false
        defaultWearable = "Mentra Mach1"
        handleRequestStatus()

        Task {
            // Send startup message
            sendText("MENTRAOS CONNECTED")
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            clearDisplay()

            self.handleRequestStatus()
        }
    }

    private func handleDeviceDisconnected() {
        Bridge.log("Mentra: Device disconnected")
        handle_microphone_state_change([], false)
        Bridge.sendGlassesConnectionState(modelName: defaultWearable, status: "DISCONNECTED")
        handleRequestStatus()
    }

    func handleConnectWearable(_ deviceName: String, modelName: String? = nil) {
        Bridge.log(
            "Mentra: Connecting to modelName: \(modelName ?? "nil") deviceName: \(deviceName) defaultWearable: \(defaultWearable) pendingWearable: \(pendingWearable) selfDeviceName: \(self.deviceName)"
        )

        if modelName != nil {
            pendingWearable = modelName!
        }

        if pendingWearable.contains("Simulated") {
            Bridge.log(
                "Mentra: Pending wearable is simulated, setting default wearable to Simulated Glasses"
            )
            defaultWearable = "Simulated Glasses"
            handleRequestStatus()
            return
        }

        if pendingWearable.isEmpty, defaultWearable.isEmpty {
            Bridge.log("Mentra: No pending or default wearable, returning")
            return
        }

        if pendingWearable.isEmpty, !defaultWearable.isEmpty {
            Bridge.log("Mentra: No pending wearable, using default wearable: \(defaultWearable)")
            pendingWearable = defaultWearable
        }

        Task {
            disconnectWearable()

            try? await Task.sleep(nanoseconds: 100 * 1_000_000) // 100ms
            self.isSearching = true
            handleRequestStatus() // update the UI

            if deviceName != "" {
                self.deviceName = deviceName
            }

            initSGC(self.pendingWearable)
            sgc?.connectById(self.deviceName)
        }

        // wait for the g1's to be fully ready:
        //    connectTask?.cancel()
        //    connectTask = Task {
        //      while !(connectTask?.isCancelled ?? true) {
        //        Core.log("checking if g1 is ready... \(self.g1Manager?.g1Ready ?? false)")
        //        Core.log("leftReady \(self.g1Manager?.leftReady ?? false) rightReady \(self.g1Manager?.rightReady ?? false)")
        //        if self.g1Manager?.g1Ready ?? false {
        //          // we actualy don't need this line:
        //          //          handleDeviceReady()
        //          handleRequestStatus()
        //          break
        //        } else {
        //          // todo: ios not the cleanest solution here
        //          self.g1Manager?.RN_startScan()
        //        }
        //
        //        try? await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds
        //      }
        //    }
    }

    func handle_update_settings(_ settings: [String: Any]) {
        Bridge.log("Mentra: Received update settings: \(settings)")

        // update our settings with the new values:
        if let newPreferredMic = settings["preferred_mic"] as? String,
           newPreferredMic != preferredMic
        {
            setPreferredMic(newPreferredMic)
        }

        if let newHeadUpAngle = settings["head_up_angle"] as? Int, newHeadUpAngle != headUpAngle {
            updateGlassesHeadUpAngle(newHeadUpAngle)
        }

        if let newBrightness = settings["brightness"] as? Int, newBrightness != brightness {
            updateGlassesBrightness(newBrightness, autoBrightness: false)
        }

        if let newDashboardHeight = settings["dashboard_height"] as? Int,
           newDashboardHeight != dashboardHeight
        {
            updateGlassesHeight(newDashboardHeight)
        }

        if let newDashboardDepth = settings["dashboard_depth"] as? Int,
           newDashboardDepth != dashboardDepth
        {
            updateGlassesDepth(newDashboardDepth)
        }

        if let newAutoBrightness = settings["auto_brightness"] as? Bool,
           newAutoBrightness != autoBrightness
        {
            updateGlassesBrightness(brightness, autoBrightness: newAutoBrightness)
        }

        if let sensingEnabled = settings["sensing_enabled"] as? Bool,
           sensingEnabled != self.sensingEnabled
        {
            enableSensing(sensingEnabled)
        }

        if let powerSavingMode = settings["power_saving_mode"] as? Bool,
           powerSavingMode != self.powerSavingMode
        {
            enablePowerSavingMode(powerSavingMode)
        }

        if let newAlwaysOnStatusBar = settings["always_on_status_bar_enabled"] as? Bool,
           newAlwaysOnStatusBar != alwaysOnStatusBar
        {
            enableAlwaysOnStatusBar(newAlwaysOnStatusBar)
        }

        if let newBypassVad = settings["bypass_vad_for_debugging"] as? Bool,
           newBypassVad != bypassVad
        {
            bypassVad(newBypassVad)
        }

        if let newEnforceLocalTranscription = settings["enforce_local_transcription"] as? Bool,
           newEnforceLocalTranscription != enforceLocalTranscription
        {
            enforceLocalTranscription(newEnforceLocalTranscription)
        }

        if let newMetricSystemEnabled = settings["metric_system_enabled"] as? Bool,
           newMetricSystemEnabled != metricSystemEnabled
        {
            setMetricSystemEnabled(newMetricSystemEnabled)
        }

        if let newContextualDashboard = settings["contextual_dashboard_enabled"] as? Bool,
           newContextualDashboard != contextualDashboard
        {
            enableContextualDashboard(newContextualDashboard)
        }

        if let newButtonMode = settings["button_mode"] as? String, newButtonMode != buttonPressMode {
            setButtonMode(newButtonMode)
        }

        if let newFps = settings["button_video_fps"] as? Int, newFps != buttonVideoFps {
            setButtonVideoSettings(width: buttonVideoWidth, height: buttonVideoHeight, fps: newFps)
        }

        if let newWidth = settings["button_video_width"] as? Int, newWidth != buttonVideoWidth {
            setButtonVideoSettings(width: newWidth, height: buttonVideoHeight, fps: buttonVideoFps)
        }

        if let newHeight = settings["button_video_height"] as? Int, newHeight != buttonVideoHeight {
            setButtonVideoSettings(width: buttonVideoWidth, height: newHeight, fps: buttonVideoFps)
        }

        if let newPhotoSize = settings["button_photo_size"] as? String,
           newPhotoSize != buttonPhotoSize
        {
            setButtonPhotoSize(newPhotoSize)
        }

        if let newOfflineStt = settings["offline_stt"] as? Bool, newOfflineStt != offlineStt {
            setOfflineStt(newOfflineStt)
        }

        // get default wearable from core_info:
        if let newDefaultWearable = settings["default_wearable"] as? String,
           newDefaultWearable != defaultWearable
        {
            defaultWearable = newDefaultWearable
            Bridge.saveSetting("default_wearable", newDefaultWearable)
        }
    }

    // MARK: - Cleanup

    @objc func cleanup() {
        // Clean up transcriber resources
        transcriber?.shutdown()
        transcriber = nil

        cancellables.removeAll()
    }
}
