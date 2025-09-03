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
    var eventStr: String
    var data: String?
    var animationData: [String: Any]?
}

// This class handles logic for managing devices and connections to AugmentOS servers
@objc(MentraManager) class MentraManager: NSObject {
    private static var instance: MentraManager?

    @objc static func getInstance() -> MentraManager {
        if instance == nil {
            instance = MentraManager()
        }
        return instance!
    }

    private var coreToken: String = ""
    private var coreTokenOwner: String = ""

    @objc var g1Manager: ERG1Manager?
    @objc var liveManager: MentraLiveManager?
    @objc var mach1Manager: Mach1Manager?
    @objc var frameManager: FrameManager?
    var serverComms = ServerComms.shared
    var micManager = OnboardMicrophoneManager.shared
    var livekit = LiveKitManager.shared

    private var lastStatusObj: [String: Any] = [:]

    private var cancellables = Set<AnyCancellable>()
    private var cachedThirdPartyAppList: [ThirdPartyCloudApp] = []
    //  private var cachedWhatToStream = [String]()
    private var defaultWearable: String = ""
    private var pendingWearable: String = ""
    private var deviceName: String = ""
    private var contextualDashboard = true
    private var headUpAngle = 30
    private var brightness = 50
    private var batteryLevel = -1
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

    var viewStates: [ViewState] = [
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "",
            eventStr: ""
        ),
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall",
            text: "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$", eventStr: ""
        ),
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "",
            eventStr: "", data: nil, animationData: nil
        ),
        ViewState(
            topText: " ", bottomText: " ", title: " ", layoutType: "text_wall",
            text: "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$", eventStr: "", data: nil,
            animationData: nil
        ),
    ]

    private var sendStateWorkItem: DispatchWorkItem?
    private let sendStateQueue = DispatchQueue(label: "sendStateQueue", qos: .userInitiated)

    // mic:
    private var useOnboardMic = false
    private var preferredMic = "glasses"
    private var micEnabled = false
    private var currentRequiredData: [SpeechRequiredDataType] = []

    // button settings:
    private var buttonPressMode = "photo"

    // VAD:
    private var vad: SileroVADStrategy?
    private var vadBuffer = [Data]()
    private var isSpeaking = false

    private var transcriber: SherpaOnnxTranscriber?

    private var shouldSendPcmData = false
    private var shouldSendTranscript = false

    override init() {
        Core.log("Mentra: init()")
        vad = SileroVADStrategy()
        super.init()

        // Initialize SherpaOnnx Transcriber
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first,
           let rootViewController = window.rootViewController
        {
            transcriber = SherpaOnnxTranscriber(context: rootViewController)
        } else {
            Core.log("Failed to create SherpaOnnxTranscriber - no root view controller found")
        }

        // Initialize the transcriber
        if let transcriber = transcriber {
            transcriber.initialize()
            Core.log("SherpaOnnxTranscriber fully initialized")
        }

        Task {
            await loadSettings()
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
        Core.log("Mentra: setup()")
        LocationManager.shared.setup()
        MediaManager.shared.setup()

        // Set up voice data handling
        setupVoiceDataHandling()

        // Subscribe to WebSocket status changes
        WebSocketManager.shared.status
            .sink { [weak self] _ in
                guard let self = self else { return }
                handleRequestStatus()
            }
            .store(in: &cancellables)
    }

    func initManager(_ wearable: String) {
        Core.log("Initializing manager for wearable: \(wearable)")
        if wearable.contains("G1") && g1Manager == nil {
            g1Manager = ERG1Manager.getInstance()
        } else if wearable.contains("Live") && liveManager == nil {
            liveManager = MentraLiveManager()
        } else if wearable.contains("Mach1") && mach1Manager == nil {
            mach1Manager = Mach1Manager()
        } else if wearable.contains("Frame") || wearable.contains("Brilliant Labs"),
                  frameManager == nil
        {
            frameManager = FrameManager.shared
        }
        initManagerCallbacks()
    }

    func initManagerCallbacks() {
        // calback to handle actions when the connectionState changes (when g1 is ready)

        if g1Manager != nil {
            g1Manager!.onConnectionStateChanged = { [weak self] in
                guard let self = self else { return }
                Core.log(
                    "G1 glasses connection changed to: \(self.g1Manager!.g1Ready ? "Connected" : "Disconnected")"
                )
                //      self.handleRequestStatus()
                if self.g1Manager!.g1Ready {
                    handleDeviceReady()
                } else {
                    handleDeviceDisconnected()
                    handleRequestStatus()
                }
            }

            // listen to changes in battery level:
            g1Manager!.$batteryLevel.sink { [weak self] (level: Int) in
                guard let self = self else { return }
                guard level >= 0 else { return }
                self.batteryLevel = level
                self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false)
                handleRequestStatus()
            }.store(in: &cancellables)

            // listen to headUp events:
            g1Manager!.$isHeadUp.sink { [weak self] (value: Bool) in
                guard let self = self else { return }
                updateHeadUp(value)
            }.store(in: &cancellables)

            // listen to case events:
            g1Manager!.$caseOpen.sink { [weak self] (_: Bool) in
                guard let self = self else { return }
                handleRequestStatus()
            }.store(in: &cancellables)

            g1Manager!.$caseRemoved.sink { [weak self] (_: Bool) in
                guard let self = self else { return }
                handleRequestStatus()
            }.store(in: &cancellables)

            g1Manager!.$caseCharging.sink { [weak self] (_: Bool) in
                guard let self = self else { return }
                handleRequestStatus()
            }.store(in: &cancellables)

            // Set up serial number discovery callback
            g1Manager!.onSerialNumberDiscovered = { [weak self] in
                self?.handleRequestStatus()
            }
            //    g1Manager!.$caseBatteryLevel.sink { [weak self] (value: Bool) in
            //        guard let self = self else { return }
            //      handleRequestStatus()
            //    }.store(in: &cancellables)

            // decode the g1 audio data to PCM and feed to the VAD:
            g1Manager!.$compressedVoiceData.sink { [weak self] rawLC3Data in
                guard let self = self else { return }

                // Ensure we have enough data to process
                guard rawLC3Data.count > 2 else {
                    Core.log("Received invalid PCM data size: \(rawLC3Data.count)")
                    return
                }

                // Skip the first 2 bytes which are command bytes
                let lc3Data = rawLC3Data.subdata(in: 2 ..< rawLC3Data.count)

                // Ensure we have valid PCM data
                guard lc3Data.count > 0 else {
                    Core.log("No LC3 data after removing command bytes")
                    return
                }

                if self.bypassVad || self.bypassVadForPCM {
                    Core.log(
                        "Mentra: Glasses mic VAD bypassed - bypassVad=\(self.bypassVad), bypassVadForPCM=\(self.bypassVadForPCM)"
                    )
                    checkSetVadStatus(speaking: true)
                    // first send out whatever's in the vadBuffer (if there is anything):
                    emptyVadBuffer()
                    let pcmConverter = PcmConverter()
                    let pcmData = pcmConverter.decode(lc3Data) as Data
                    //        self.serverComms.sendAudioChunk(lc3Data)
                    self.serverComms.sendAudioChunk(pcmData)
                    return
                }

                let pcmConverter = PcmConverter()
                let pcmData = pcmConverter.decode(lc3Data) as Data

                guard pcmData.count > 0 else {
                    Core.log("PCM conversion resulted in empty data")
                    return
                }

                // feed PCM to the VAD:
                guard let vad = self.vad else {
                    Core.log("VAD not initialized")
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
                    Core.log("VAD State: \(state)")
                }

                let vadState = vad.currentState()
                if vadState == .speeching {
                    checkSetVadStatus(speaking: true)
                    // first send out whatever's in the vadBuffer (if there is anything):
                    emptyVadBuffer()
                    //        self.serverComms.sendAudioChunk(lc3Data)
                    self.serverComms.sendAudioChunk(pcmData)
                } else {
                    checkSetVadStatus(speaking: false)
                    // add to the vadBuffer:
                    //        addToVadBuffer(lc3Data)
                    addToVadBuffer(pcmData)
                }
            }
            .store(in: &cancellables)
        }

        if frameManager != nil {
            frameManager!.onConnectionStateChanged = { [weak self] in
                guard let self = self else { return }
                let isConnected = self.frameManager?.connectionState == "CONNECTED"
                Core.log(
                    "Frame glasses connection changed to: \(isConnected ? "Connected" : "Disconnected")"
                )
                if isConnected {
                    handleDeviceReady()
                } else {
                    handleDeviceDisconnected()
                    handleRequestStatus()
                }
            }

            // Listen to battery level changes if Frame supports it
            frameManager!.$batteryLevel.sink { [weak self] (level: Int) in
                guard let self = self else { return }
                guard level >= 0 else { return }
                self.batteryLevel = level
                self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false)
                handleRequestStatus()
            }.store(in: &cancellables)
        }

        if liveManager != nil {
            liveManager!.onConnectionStateChanged = { [weak self] in
                guard let self = self else { return }
                Core.log(
                    "Live glasses connection changed to: \(self.liveManager!.ready ? "Connected" : "Disconnected")"
                )
                if self.liveManager!.ready {
                    handleDeviceReady()
                } else {
                    handleDeviceDisconnected()
                    handleRequestStatus()
                }
            }

            liveManager!.$batteryLevel.sink { [weak self] (level: Int) in
                guard let self = self else { return }
                guard level >= 0 else { return }
                self.batteryLevel = level
                self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false)
                handleRequestStatus()
            }.store(in: &cancellables)

            liveManager!.$isWifiConnected.sink { [weak self] (isConnected: Bool) in
                guard let self = self else { return }
                self.glassesWifiConnected = isConnected
                handleRequestStatus()
            }.store(in: &cancellables)

            liveManager!.onButtonPress = { [weak self] (buttonId: String, pressType: String) in
                guard let self = self else { return }
                self.serverComms.sendButtonPress(buttonId: buttonId, pressType: pressType)
            }
            liveManager!.onPhotoRequest = { [weak self] (requestId: String, photoUrl: String) in
                guard let self = self else { return }
                self.serverComms.sendPhotoResponse(requestId: requestId, photoUrl: photoUrl)
            }
            liveManager!.onVideoStreamResponse = { [weak self] (appId: String, streamUrl: String) in
                guard let self = self else { return }
                self.serverComms.sendVideoStreamResponse(appId: appId, streamUrl: streamUrl)
            }
        }

        if mach1Manager != nil {
            mach1Manager!.onConnectionStateChanged = { [weak self] in
                guard let self = self else { return }
                Core.log(
                    "Mach1 glasses connection changed to: \(self.mach1Manager!.ready ? "Connected" : "Disconnected")"
                )
                if self.mach1Manager!.ready {
                    handleDeviceReady()
                } else {
                    handleDeviceDisconnected()
                    handleRequestStatus()
                }
            }

            mach1Manager!.$batteryLevel.sink { [weak self] (level: Int) in
                guard let self = self else { return }
                guard level >= 0 else { return }
                self.batteryLevel = level
                self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false)
                handleRequestStatus()
            }.store(in: &cancellables)

            mach1Manager!.$isHeadUp.sink { [weak self] (value: Bool) in
                guard let self = self else { return }
                updateHeadUp(value)
            }.store(in: &cancellables)
        }
    }

    func updateHeadUp(_ isHeadUp: Bool) {
        self.isHeadUp = isHeadUp
        sendCurrentState(isHeadUp)
        ServerComms.shared.sendHeadPosition(isUp: isHeadUp)
    }

    // MARK: - Audio Bridge Methods

    @objc func playAudio(
        _ requestId: String,
        audioUrl: String,
        volume: Float,
        stopOtherAudio: Bool
    ) {
        Core.log("AOS: playAudio bridge called for requestId: \(requestId)")

        let audioManager = AudioManager.getInstance()
        audioManager.playAudio(
            requestId: requestId,
            audioUrl: audioUrl,
            volume: volume,
            stopOtherAudio: stopOtherAudio
        )
    }

    @objc func stopAudio(_ requestId: String) {
        Core.log("AOS: stopAudio bridge called for requestId: \(requestId)")

        let audioManager = AudioManager.getInstance()
        audioManager.stopAudio(requestId: requestId)
    }

    @objc func stopAllAudio() {
        Core.log("AOSManager: stopAllAudio bridge called")

        let audioManager = AudioManager.getInstance()
        audioManager.stopAllAudio()
    }

    func onConnectionAck() {
        handleRequestStatus()

        let isoDatetime = ServerComms.getCurrentIsoDatetime()
        serverComms.sendUserDatetimeToBackend(isoDatetime: isoDatetime)
    }

    func onAppStateChange(_ apps: [ThirdPartyCloudApp]) {
        cachedThirdPartyAppList = apps
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
            serverComms.sendVadStatus(isSpeaking)
        }
    }

    private func emptyVadBuffer() {
        // go through the buffer, popping from the first element in the array (FIFO):
        while !vadBuffer.isEmpty {
            let chunk = vadBuffer.removeFirst()
            serverComms.sendAudioChunk(chunk)
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

    private func setupVoiceDataHandling() {
        // handle incoming PCM data from the microphone manager and feed to the VAD:
        micManager.voiceData
            .sink { [weak self] pcmData in
                guard let self = self else { return }

                // feed PCM to the VAD:
                guard let vad = self.vad else {
                    Core.log("VAD not initialized")
                    return
                }

                if self.bypassVad || self.bypassVadForPCM {
                    //          let pcmConverter = PcmConverter()
                    //          let lc3Data = pcmConverter.encode(pcmData) as Data
                    //          checkSetVadStatus(speaking: true)
                    //          // first send out whatever's in the vadBuffer (if there is anything):
                    //          emptyVadBuffer()
                    //          self.serverComms.sendAudioChunk(lc3Data)
                    Core.log("Mentra: bypassing VAD, sending PCM data to server \(self.shouldSendPcmData)")
                    if self.shouldSendPcmData {
                        self.serverComms.sendAudioChunk(pcmData)
                    }

                    // Also send to local transcriber when bypassing VAD
                    if self.shouldSendTranscript {
                        self.transcriber?.acceptAudio(pcm16le: pcmData)
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
                    Core.log("VAD State: \(state)")
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
                    if self.shouldSendPcmData {
                        self.serverComms.sendAudioChunk(pcmData)
                    }

                    // Send to local transcriber when speech is detected
                    if self.shouldSendTranscript {
                        self.transcriber?.acceptAudio(pcm16le: pcmData)
                    }
                } else {
                    checkSetVadStatus(speaking: false)
                    // add to the vadBuffer:
                    //          addToVadBuffer(lc3Data)
                    addToVadBuffer(pcmData)
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - ServerCommsCallback Implementation

    func handle_microphone_state_change(_ requiredData: [SpeechRequiredDataType], _ bypassVad: Bool) {
        Core.log(
            "Mentra: MIC: @@@@@@@@ changing mic with requiredData: \(requiredData) bypassVad=\(bypassVad) enforceLocalTranscription=\(enforceLocalTranscription) @@@@@@@@@@@@@@@@"
        )

        bypassVadForPCM = bypassVad

        shouldSendPcmData = false
        shouldSendTranscript = false

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

        currentRequiredData = requiredData

        // Core.log("Mentra: MIC: shouldSendPcmData=\(shouldSendPcmData), shouldSendTranscript=\(shouldSendTranscript)")

        // in any case, clear the vadBuffer:
        vadBuffer.removeAll()
        micEnabled = shouldSendPcmData

        // Handle microphone state change if needed
        Task {
            // Only enable microphone if sensing is also enabled
            var actuallyEnabled = micEnabled && self.sensingEnabled

            let glassesHasMic = getGlassesHasMic()

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
                    Core.log(
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
            if g1Manager?.g1Ready ?? false {
                await self.g1Manager?.setMicEnabled(enabled: useGlassesMic)
            }

            setOnboardMicEnabled(useOnboardMic)
        }
    }

    // MARK: - App Started/Stopped Handling

    func onAppStarted(_ packageName: String) {
        // tell the server what pair of glasses we're using:
        serverComms.sendGlassesConnectionState(modelName: defaultWearable, status: "CONNECTED")
        Core.sendAppStartedEvent(packageName)

        Core.log("Mentra: App started: \(packageName)")

        if !defaultWearable.isEmpty, !isSomethingConnected() {
            handleConnectWearable(deviceName)
        }
    }

    func onAppStopped(_ packageName: String) {
        Core.log("Mentra: App stopped: \(packageName)")
        Core.sendAppStoppedEvent(packageName)
    }

    func onJsonMessage(_ message: [String: Any]) {
        Core.log("Mentra: onJsonMessage: \(message)")
        liveManager?.sendJson(message)
    }

    func onPhotoRequest(_ requestId: String, _ appId: String, _ webhookUrl: String, _ size: String) {
        Core.log("Mentra: onPhotoRequest: \(requestId), \(appId), \(webhookUrl), size=\(size)")
        liveManager?.requestPhoto(
            requestId, appId: appId, webhookUrl: webhookUrl.isEmpty ? nil : webhookUrl, size: size
        )
    }

    func onRtmpStreamStartRequest(_ message: [String: Any]) {
        Core.log("Mentra: onRtmpStreamStartRequest: \(message)")
        liveManager?.startRtmpStream(message)
    }

    func onRtmpStreamStop() {
        Core.log("Mentra: onRtmpStreamStop")
        liveManager?.stopRtmpStream()
    }

    func onRtmpStreamKeepAlive(_ message: [String: Any]) {
        Core.log("Mentra: onRtmpStreamKeepAlive: \(message)")
        liveManager?.sendRtmpKeepAlive(message)
    }

    func onStartBufferRecording() {
        Core.log("Mentra: onStartBufferRecording")
        liveManager?.startBufferRecording()
    }

    func onStopBufferRecording() {
        Core.log("Mentra: onStopBufferRecording")
        liveManager?.stopBufferRecording()
    }

    func onSaveBufferVideo(_ requestId: String, _ durationSeconds: Int) {
        Core.log("Mentra: onSaveBufferVideo: requestId=\(requestId), duration=\(durationSeconds)s")
        liveManager?.saveBufferVideo(requestId: requestId, durationSeconds: durationSeconds)
    }

    func onStartVideoRecording(_ requestId: String, _ save: Bool) {
        Core.log("Mentra: onStartVideoRecording: requestId=\(requestId), save=\(save)")
        liveManager?.startVideoRecording(requestId: requestId, save: save)
    }

    func onStopVideoRecording(_ requestId: String) {
        Core.log("Mentra: onStopVideoRecording: requestId=\(requestId)")
        liveManager?.stopVideoRecording(requestId: requestId)
    }

    func setOnboardMicEnabled(_ isEnabled: Bool) {
        Task {
            if isEnabled {
                // Just check permissions - we no longer request them directly from Swift
                // Permissions should already be granted via React Native UI flow
                if !(micManager.checkPermissions()) {
                    Core.log("Microphone permissions not granted. Cannot enable microphone.")
                    return
                }

                let success = micManager.startRecording()
                if !success {
                    // fallback to glasses mic if possible:
                    if getGlassesHasMic() {
                        await enableGlassesMic(true)
                    }
                }
            } else {
                micManager.stopRecording()
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
        sendCurrentState(g1Manager?.isHeadUp ?? false)
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

            // TODO: config: remove
            let eventStr = currentViewState.eventStr
            if eventStr != "" {
                Core.sendEvent(withName: "CoreMessageEvent", body: eventStr)
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
                self.g1Manager?.sendDoubleTextWall(topText, bottomText)
                self.mach1Manager?.sendDoubleTextWall(topText, bottomText)
            case "reference_card":
                sendText(currentViewState.title + "\n\n" + currentViewState.text)
            case "bitmap_view":
                Core.log("Mentra: Processing bitmap_view layout")
                guard let data = currentViewState.data else {
                    Core.log("Mentra: ERROR: bitmap_view missing data field")
                    return
                }
                Core.log("Mentra: Processing bitmap_view with base64 data, length: \(data.count)")
                await self.g1Manager?.displayBitmap(base64ImageData: data)
                await self.mach1Manager?.displayBitmap(base64ImageData: data)
            case "clear_view":
                Core.log("Mentra: Processing clear_view layout - clearing display")
                self.g1Manager?.clearDisplay()
                self.mach1Manager?.clearDisplay()
            default:
                Core.log("UNHANDLED LAYOUT_TYPE \(layoutType)")
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

        if batteryLevel == -1 {
            placeholders["$GBATT$"] = ""
        } else {
            placeholders["$GBATT$"] = "\(batteryLevel)%"
        }

        placeholders["$CONNECTION_STATUS$"] =
            serverComms.isWebSocketConnected() ? "Connected" : "Disconnected"

        var result = text
        for (key, value) in placeholders {
            result = result.replacingOccurrences(of: key, with: value)
        }

        return result
    }

    func handle_display_event(_ event: [String: Any]) {
        guard let view = event["view"] as? String else {
            Core.log("Mentra: invalid view")
            return
        }
        let isDashboard = view == "dashboard"

        var stateIndex = 0
        if isDashboard {
            stateIndex = 1
        } else {
            stateIndex = 0
        }

        // save the state string to forward to the mirror:
        // forward to the glasses mirror:
        // TODO: config: remove
        let wrapperObj: [String: Any] = ["glasses_display_event": event]
        var eventStr = ""
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
            eventStr = String(data: jsonData, encoding: .utf8) ?? ""
        } catch {
            Core.log("Mentra: Error converting to JSON: \(error)")
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
            text: text, eventStr: eventStr, data: data, animationData: nil
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
                Core.log(
                    "Mentra: Parsed bitmap_animation with \(frames.count) frames, interval: \(interval)ms"
                )
            } else {
                Core.log("Mentra: ERROR: bitmap_animation missing frames or interval")
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

        Core.log(
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
        Core.log("Mentra: onRouteChange: reason: \(reason)")
        Core.log("Mentra: onRouteChange: inputs: \(availableInputs)")

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
        Core.log("Mentra: Interruption: \(began)")

        onboardMicUnavailable = began
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
    }

    private func clearDisplay() {
        mach1Manager?.clearDisplay()
        frameManager?.blankScreen()

        if defaultWearable.contains("G1") {
            g1Manager?.sendTextWall(" ")

            // clear the screen after 3 seconds if the text is empty or a space:
            if powerSavingMode {
                sendStateWorkItem?.cancel()
                Core.log("Mentra: Clearing display after 3 seconds")
                // if we're clearing the display, after a delay, send a clear command if not cancelled with another
                let workItem = DispatchWorkItem { [weak self] in
                    guard let self = self else { return }
                    if self.isHeadUp {
                        return
                    }
                    self.g1Manager?.clearDisplay()
                }
                sendStateWorkItem = workItem
                sendStateQueue.asyncAfter(deadline: .now() + 3, execute: workItem)
            }
        }
    }

    private func sendText(_ text: String) {
        // Core.log("Mentra: Sending text: \(text)")
        if defaultWearable.contains("Simulated") || defaultWearable.isEmpty {
            return
        }

        if text == " " || text.isEmpty {
            clearDisplay()
            return
        }

        g1Manager?.sendTextWall(text)
        mach1Manager?.sendTextWall(text)
        frameManager?.displayTextWall(text)
    }

    // command functions:

    // TODO: config: remove
    func setAuthCreds(_ token: String, _ userId: String) {
        Core.log("Mentra: Setting core token to: \(token) for user: \(userId)")
        setup() // finish init():
        coreToken = token
        coreTokenOwner = userId
        serverComms.setAuthCreds(token, userId)
        serverComms.connectWebSocket()
        handleRequestStatus()
    }

    func disconnectWearable() {
        sendText(" ") // clear the screen
        Task {
            connectTask?.cancel()
            self.g1Manager?.disconnect()
            self.liveManager?.disconnect()
            self.mach1Manager?.disconnect()
            self.isSearching = false
            handleRequestStatus()
        }
    }

    func forgetSmartGlasses() {
        disconnectWearable()
        defaultWearable = ""
        deviceName = ""
        g1Manager?.forget()
        //    self.liveManager?.forget()
        mach1Manager?.forget()
        // self.g1Manager = nil
        // self.liveManager = nil
        handleRequestStatus()
        saveSettings()
    }

    func handleSearchForCompatibleDeviceNames(_ modelName: String) {
        Core.log("Mentra: Searching for compatible device names for: \(modelName)")
        if modelName.contains("Simulated") {
            defaultWearable = "Simulated Glasses" // there is no pairing process for simulated glasses
            handleRequestStatus()
            saveSettings()
        } else if modelName.contains("Audio") {
            defaultWearable = "Audio Wearable" // there is no pairing process for audio wearable
            handleRequestStatus()
            saveSettings()
        } else if modelName.contains("G1") {
            pendingWearable = "Even Realities G1"
            initManager(pendingWearable)
            g1Manager?.findCompatibleDevices()
        } else if modelName.contains("Live") {
            pendingWearable = "Mentra Live"
            initManager(pendingWearable)
            liveManager?.findCompatibleDevices()
        } else if modelName.contains("Mach1") || modelName.contains("Z100") {
            pendingWearable = "Mach1"
            initManager(pendingWearable)
            mach1Manager?.findCompatibleDevices()
        }
    }

    func enableContextualDashboard(_ enabled: Bool) {
        contextualDashboard = enabled
        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func setPreferredMic(_ mic: String) {
        preferredMic = mic
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func setButtonMode(_ mode: String) {
        buttonPressMode = mode
        UserDefaults.standard.set(mode, forKey: "button_press_mode")

        // Forward to glasses if Mentra Live
        if let mentraLiveManager = liveManager {
            mentraLiveManager.sendButtonModeSetting(mode)
        }

        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func setButtonPhotoSize(_ size: String) {
        UserDefaults.standard.set(size, forKey: "button_photo_size")

        // Forward to glasses if Mentra Live
        if let mentraLiveManager = liveManager {
            mentraLiveManager.sendButtonPhotoSettings()
        }

        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func setButtonVideoSettings(width: Int, height: Int, fps: Int) {
        UserDefaults.standard.set(width, forKey: "button_video_width")
        UserDefaults.standard.set(height, forKey: "button_video_height")
        UserDefaults.standard.set(fps, forKey: "button_video_fps")

        // Forward to glasses if Mentra Live
        if let mentraLiveManager = liveManager {
            mentraLiveManager.sendButtonVideoRecordingSettings()
        }

        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func setButtonCameraLed(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: "button_camera_led")

        // Forward to glasses if Mentra Live
        if let mentraLiveManager = liveManager {
            mentraLiveManager.sendButtonCameraLedSetting()
        }

        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func startApp(_ target: String) {
        Core.log("Mentra: Starting app: \(target)")
        serverComms.startApp(packageName: target)
        handleRequestStatus()
    }

    func stopApp(_ target: String) {
        Core.log("Mentra: Stopping app: \(target)")
        serverComms.stopApp(packageName: target)
        handleRequestStatus()
    }

    func updateGlassesHeadUpAngle(_ value: Int) {
        headUpAngle = value
        g1Manager?.RN_setHeadUpAngle(value)
        saveSettings()
        handleRequestStatus() // to update the UI
    }

    func updateGlassesBrightness(_ value: Int, autoBrightness: Bool) {
        let autoBrightnessChanged = self.autoBrightness != autoBrightness
        brightness = value
        self.autoBrightness = autoBrightness
        Task {
            self.mach1Manager?.setBrightness(value)
            self.g1Manager?.RN_setBrightness(value, autoMode: autoBrightness)
            if autoBrightnessChanged {
                sendText(autoBrightness ? "Enabled auto brightness" : "Disabled auto brightness")
            } else {
                sendText("Set brightness to \(value)%")
            }
            try? await Task.sleep(nanoseconds: 800_000_000) // 0.8 seconds
            sendText(" ") // clear screen
        }
        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func updateGlassesDepth(_ value: Int) {
        dashboardDepth = value
        Task {
            await self.g1Manager?.RN_setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
            Core.log("Mentra: Set dashboard position to \(value)")
        }
        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func updateGlassesHeight(_ value: Int) {
        dashboardHeight = value
        Task {
            await self.g1Manager?.RN_setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
            Core.log("Mentra: Set dashboard position to \(value)")
        }
        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func enableSensing(_ enabled: Bool) {
        sensingEnabled = enabled
        // Update microphone state when sensing is toggled
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func enablePowerSavingMode(_ enabled: Bool) {
        powerSavingMode = enabled
        handleRequestStatus() // to update the UI
        saveSettings()
    }

    func enableAlwaysOnStatusBar(_ enabled: Bool) {
        alwaysOnStatusBar = enabled
        saveSettings()
        handleRequestStatus() // to update the UI
    }

    func bypassVad(_ enabled: Bool) {
        bypassVad = enabled
        handleRequestStatus() // to update the UI
        saveSettings()
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
        saveSettings()
    }

    func startBufferRecording() {
        liveManager?.startBufferRecording()
    }

    func stopBufferRecording() {
        liveManager?.stopBufferRecording()
    }

    func setBypassAudioEncoding(_ enabled: Bool) {
        bypassAudioEncoding = enabled
    }

    func setMetricSystemEnabled(_ enabled: Bool) {
        metricSystemEnabled = enabled
        handleRequestStatus()
        saveSettings()
    }

    func toggleUpdatingScreen(_ enabled: Bool) {
        Core.log("Mentra: Toggling updating screen: \(enabled)")
        if enabled {
            g1Manager?.RN_exit()
            isUpdatingScreen = true
        } else {
            isUpdatingScreen = false
        }
    }

    func saveBufferVideo(requestId: String, durationSeconds: Int) {
        liveManager?.saveBufferVideo(requestId: requestId, durationSeconds: durationSeconds)
    }

    func startVideoRecording(requestId: String, save: Bool) {
        liveManager?.startVideoRecording(requestId: requestId, save: save)
    }

    @objc func stopVideoRecording(requestId: String) {
        liveManager?.stopVideoRecording(requestId: requestId)
    }

    func requestWifiScan() {
        Core.log("Mentra: Requesting wifi scan")
        liveManager?.requestWifiScan()
    }

    func sendWifiCredentials(_ ssid: String, _ password: String) {
        Core.log("Mentra: Sending wifi credentials: \(ssid) \(password)")
        liveManager?.sendWifiCredentials(ssid, password: password)
    }

    func setGlassesHotspotState(_ enabled: Bool) {
        Core.log("Mentra: 🔥 Setting glasses hotspot state: \(enabled)")
        liveManager?.sendHotspotState(enabled)
    }

    func queryGalleryStatus() {
        Core.log("Mentra: 📸 Querying gallery status from glasses")
        liveManager?.queryGalleryStatus()
    }

    func showDashboard() {
        Task {
            await self.g1Manager?.RN_showDashboard()
        }
    }

    @objc func handleCommand(_ command: String) {
        Core.log("Mentra: Received command: \(command)")

        if !settingsLoaded {
            // Wait for settings to load with a timeout
            let timeout = DispatchTime.now() + .seconds(5) // 5 second timeout
            let result = settingsLoadedSemaphore.wait(timeout: timeout)

            if result == .timedOut {
                Core.log("Warning: Settings load timed out, proceeding with default values")
            }
        }

        // Define command types enum
        enum CommandType: String {
            case requestStatus = "request_status"
            case connectWearable = "connect_wearable"
            case disconnectWearable = "disconnect_wearable"
            case searchForCompatibleDeviceNames = "search_for_compatible_device_names"
            case enableContextualDashboard = "enable_contextual_dashboard"
            case setPreferredMic = "set_preferred_mic"
            case restartTranscriber = "restart_transcriber"
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
            case setMetricSystemEnabled = "set_metric_system_enabled"
            case toggleUpdatingScreen = "toggle_updating_screen"
            case showDashboard = "show_dashboard"
            case requestWifiScan = "request_wifi_scan"
            case sendWifiCredentials = "send_wifi_credentials"
            case setHotspotState = "set_hotspot_state"
            case queryGalleryStatus = "query_gallery_status"
            case simulateHeadPosition = "simulate_head_position"
            case simulateButtonPress = "simulate_button_press"
            case startBufferRecording = "start_buffer_recording"
            case stopBufferRecording = "stop_buffer_recording"
            case saveBufferVideo = "save_buffer_video"
            case startVideoRecording = "start_video_recording"
            case stopVideoRecording = "stop_video_recording"
            case unknown
        }

        // Try to parse JSON
        guard let data = command.data(using: .utf8) else {
            Core.log("Mentra: Could not convert command string to data")
            return
        }

        do {
            if let jsonDict = try JSONSerialization.jsonObject(with: data, options: [])
                as? [String: Any]
            {
                // Extract command type
                guard let commandString = jsonDict["command"] as? String else {
                    Core.log("Mentra: Invalid command format: missing 'command' field")
                    return
                }

                let commandType = CommandType(rawValue: commandString) ?? .unknown
                let params = jsonDict["params"] as? [String: Any]

                // Process based on command type
                switch commandType {
                case .requestStatus:
                    handleRequestStatus()
                case .connectWearable:
                    guard let params = params, let modelName = params["model_name"] as? String,
                          let deviceName = params["device_name"] as? String
                    else {
                        Core.log("Mentra: connect_wearable invalid params")
                        handleConnectWearable("")
                        break
                    }
                    handleConnectWearable(deviceName, modelName: modelName)
                case .disconnectWearable:
                    disconnectWearable()
                case .forgetSmartGlasses:
                    forgetSmartGlasses()
                case .searchForCompatibleDeviceNames:
                    guard let params = params, let modelName = params["model_name"] as? String
                    else {
                        Core.log("Mentra: search_for_compatible_device_names invalid params")
                        break
                    }
                    handleSearchForCompatibleDeviceNames(modelName)
                case .enableContextualDashboard:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: enable_contextual_dashboard invalid params")
                        break
                    }
                    enableContextualDashboard(enabled)
                case .setPreferredMic:
                    guard let params = params, let mic = params["mic"] as? String else {
                        Core.log("Mentra: set_preferred_mic invalid params")
                        break
                    }
                    setPreferredMic(mic)
                case .restartTranscriber:
                    Core.log("Mentra: Restarting SherpaOnnxTranscriber via command")
                    transcriber?.restart()
                case .setButtonMode:
                    guard let params = params, let mode = params["mode"] as? String else {
                        Core.log("Mentra: set_button_mode invalid params")
                        break
                    }
                    setButtonMode(mode)
                case .setButtonPhotoSize:
                    guard let params = params, let size = params["size"] as? String else {
                        Core.log("Mentra: set_button_photo_size invalid params")
                        break
                    }
                    setButtonPhotoSize(size)
                case .setButtonVideoSettings:
                    guard let params = params,
                          let width = params["width"] as? Int,
                          let height = params["height"] as? Int,
                          let fps = params["fps"] as? Int
                    else {
                        Core.log("Mentra: set_button_video_settings invalid params")
                        break
                    }
                    setButtonVideoSettings(width: width, height: height, fps: fps)
                case .setButtonCameraLed:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: set_button_camera_led invalid params")
                        break
                    }
                    setButtonCameraLed(enabled)
                case .startApp:
                    guard let params = params, let target = params["target"] as? String else {
                        Core.log("Mentra: start_app invalid params")
                        break
                    }
                    startApp(target)
                case .stopApp:
                    guard let params = params, let target = params["target"] as? String else {
                        Core.log("Mentra: stop_app invalid params")
                        break
                    }
                    stopApp(target)
                case .updateGlassesHeadUpAngle:
                    guard let params = params, let value = params["headUpAngle"] as? Int else {
                        Core.log("Mentra: update_glasses_head_up_angle invalid params")
                        break
                    }
                    updateGlassesHeadUpAngle(value)
                case .updateGlassesBrightness:
                    guard let params = params, let value = params["brightness"] as? Int,
                          let autoBrightness = params["autoBrightness"] as? Bool
                    else {
                        Core.log("Mentra: update_glasses_brightness invalid params")
                        break
                    }
                    updateGlassesBrightness(value, autoBrightness: autoBrightness)
                case .updateGlassesHeight:
                    guard let params = params, let value = params["height"] as? Int else {
                        Core.log("Mentra: update_glasses_height invalid params")
                        break
                    }
                    updateGlassesHeight(value)
                case .showDashboard:
                    showDashboard()
                case .updateGlassesDepth:
                    guard let params = params, let value = params["depth"] as? Int else {
                        Core.log("Mentra: update_glasses_depth invalid params")
                        break
                    }
                    updateGlassesDepth(value)
                case .enableSensing:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: enable_sensing invalid params")
                        break
                    }
                    enableSensing(enabled)
                case .enablePowerSavingMode:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: enable_power_saving_mode invalid params")
                        break
                    }
                    enablePowerSavingMode(enabled)
                case .enableAlwaysOnStatusBar:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: enable_always_on_status_bar invalid params")
                        break
                    }
                    enableAlwaysOnStatusBar(enabled)
                case .bypassVad:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: bypass_vad invalid params")
                        break
                    }
                    bypassVad(enabled)
                case .bypassAudioEncoding:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: bypass_audio_encoding invalid params")
                        break
                    }
                    bypassAudioEncoding = enabled
                case .setMetricSystemEnabled:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: set_metric_system_enabled invalid params")
                        break
                    }
                    setMetricSystemEnabled(enabled)
                case .toggleUpdatingScreen:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: toggle_updating_screen invalid params")
                        break
                    }
                    toggleUpdatingScreen(enabled)
                case .requestWifiScan:
                    requestWifiScan()
                case .sendWifiCredentials:
                    guard let params = params, let ssid = params["ssid"] as? String,
                          let password = params["password"] as? String
                    else {
                        Core.log("Mentra: send_wifi_credentials invalid params")
                        break
                    }
                    sendWifiCredentials(ssid, password)
                case .setHotspotState:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: set_hotspot_state invalid params")
                        break
                    }
                    setGlassesHotspotState(enabled)
                case .queryGalleryStatus:
                    Core.log("Mentra: Querying gallery status")
                    queryGalleryStatus()
                // TODO: config: remove
                case .simulateHeadPosition:
                    guard let params = params, let position = params["position"] as? String else {
                        Core.log("Mentra: simulate_head_position invalid params")
                        break
                    }
                    // Send to server
                    ServerComms.shared.sendHeadPosition(isUp: position == "up")
                    // Trigger dashboard display locally
                    sendCurrentState(position == "up")
                // TODO: config: remove
                case .simulateButtonPress:
                    guard let params = params,
                          let buttonId = params["buttonId"] as? String,
                          let pressType = params["pressType"] as? String
                    else {
                        Core.log("Mentra: simulate_button_press invalid params")
                        break
                    }
                    // Use existing sendButtonPress method
                    ServerComms.shared.sendButtonPress(
                        buttonId: buttonId, pressType: pressType
                    )
                case .enforceLocalTranscription:
                    guard let params = params, let enabled = params["enabled"] as? Bool else {
                        Core.log("Mentra: enforce_local_transcription invalid params")
                        break
                    }
                    enforceLocalTranscription(enabled)
                case .startBufferRecording:
                    Core.log("Mentra: Starting buffer recording")
                    liveManager?.startBufferRecording()
                case .stopBufferRecording:
                    Core.log("Mentra: Stopping buffer recording")
                    liveManager?.stopBufferRecording()
                case .saveBufferVideo:
                    guard let params = params,
                          let requestId = params["request_id"] as? String,
                          let durationSeconds = params["duration_seconds"] as? Int
                    else {
                        Core.log("Mentra: save_buffer_video invalid params")
                        break
                    }
                    Core.log(
                        "Mentra: Saving buffer video: requestId=\(requestId), duration=\(durationSeconds)s"
                    )
                    liveManager?.saveBufferVideo(
                        requestId: requestId, durationSeconds: durationSeconds
                    )
                case .startVideoRecording:
                    guard let params = params,
                          let requestId = params["request_id"] as? String,
                          let save = params["save"] as? Bool
                    else {
                        Core.log("Mentra: start_video_recording invalid params")
                        break
                    }
                    Core.log(
                        "Mentra: Starting video recording: requestId=\(requestId), save=\(save)")
                    liveManager?.startVideoRecording(requestId: requestId, save: save)
                case .stopVideoRecording:
                    guard let params = params,
                          let requestId = params["request_id"] as? String
                    else {
                        Core.log("Mentra: stop_video_recording invalid params")
                        break
                    }
                    Core.log("Mentra: Stopping video recording: requestId=\(requestId)")
                    liveManager?.stopVideoRecording(requestId: requestId)
                case .unknown:
                    Core.log("Mentra: Unknown command type: \(commandString)")
                    handleRequestStatus()
                case .ping:
                    break
                }
            }
        } catch {
            Core.log("Mentra: Error parsing JSON command: \(error.localizedDescription)")
        }
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
        await g1Manager?.setMicEnabled(enabled: true)
    }

    func handleRequestStatus() {
        // construct the status object:

        let g1Connected = g1Manager?.g1Ready ?? false
        let liveConnected = liveManager?.connectionState == .connected
        let mach1Connected = mach1Manager?.ready ?? false
        let simulatedConnected = defaultWearable == "Simulated Glasses"
        let isGlassesConnected =
            g1Connected || liveConnected || mach1Connected || simulatedConnected
        if isGlassesConnected {
            isSearching = false
        }

        // also referenced as glasses_info:
        var glassesSettings: [String: Any] = [:]
        var connectedGlasses: [String: Any] = [:]

        if isGlassesConnected {
            connectedGlasses = [
                "model_name": defaultWearable,
                "battery_level": batteryLevel,
                "glasses_app_version": liveManager?.glassesAppVersion ?? "",
                "glasses_build_number": liveManager?.glassesBuildNumber ?? "",
                "glasses_device_model": liveManager?.glassesDeviceModel ?? "",
                "glasses_android_version": liveManager?.glassesAndroidVersion ?? "",
                "glasses_ota_version_url": liveManager?.glassesOtaVersionUrl ?? "",
            ]
        }

        if simulatedConnected {
            connectedGlasses["model_name"] = defaultWearable
        }

        if g1Connected {
            connectedGlasses["case_removed"] = g1Manager?.caseRemoved ?? true
            connectedGlasses["case_open"] = g1Manager?.caseOpen ?? true
            connectedGlasses["case_charging"] = g1Manager?.caseCharging ?? false
            connectedGlasses["case_battery_level"] = g1Manager?.caseBatteryLevel ?? -1

            if let serialNumber = g1Manager?.glassesSerialNumber, !serialNumber.isEmpty {
                connectedGlasses["glasses_serial_number"] = serialNumber
                connectedGlasses["glasses_style"] = g1Manager?.glassesStyle ?? ""
                connectedGlasses["glasses_color"] = g1Manager?.glassesColor ?? ""
            }
        }

        if liveConnected {
            if let wifiSsid = liveManager?.wifiSsid, !wifiSsid.isEmpty {
                connectedGlasses["glasses_wifi_ssid"] = wifiSsid
                connectedGlasses["glasses_wifi_connected"] = glassesWifiConnected
                connectedGlasses["glasses_wifi_local_ip"] = liveManager?.wifiLocalIp
            }

            // Add hotspot information - always include all fields for consistency
            connectedGlasses["glasses_hotspot_enabled"] = liveManager?.isHotspotEnabled ?? false
            connectedGlasses["glasses_hotspot_ssid"] = liveManager?.hotspotSsid ?? ""
            connectedGlasses["glasses_hotspot_password"] = liveManager?.hotspotPassword ?? ""
            connectedGlasses["glasses_hotspot_gateway_ip"] = liveManager?.hotspotGatewayIp ?? ""
        }

        // Add Bluetooth device name if available
        if let bluetoothName = getConnectedGlassesBluetoothName() {
            connectedGlasses["bluetooth_name"] = bluetoothName
        }

        glassesSettings = [
            "brightness": brightness,
            "auto_brightness": autoBrightness,
            "dashboard_height": dashboardHeight,
            "dashboard_depth": dashboardDepth,
            "head_up_angle": headUpAngle,
            "button_mode": buttonPressMode,
            "button_photo_size": UserDefaults.standard.string(forKey: "button_photo_size")
                ?? "medium",
            "button_video_settings": [
                "width": UserDefaults.standard.integer(forKey: "button_video_width") != 0
                    ? UserDefaults.standard.integer(forKey: "button_video_width") : 1280,
                "height": UserDefaults.standard.integer(forKey: "button_video_height") != 0
                    ? UserDefaults.standard.integer(forKey: "button_video_height") : 720,
                "fps": UserDefaults.standard.integer(forKey: "button_video_fps") != 0
                    ? UserDefaults.standard.integer(forKey: "button_video_fps") : 30,
            ],
            "button_camera_led": UserDefaults.standard.bool(forKey: "button_camera_led"),
        ]

        let cloudConnectionStatus =
            serverComms.isWebSocketConnected() ? "CONNECTED" : "DISCONNECTED"
        // let cloudConnectionStatus = self.serverComms.wsManager.status

        let coreInfo: [String: Any] = [
            "augmentos_core_version": "Unknown",
            "cloud_connection_status": cloudConnectionStatus,
            "default_wearable": defaultWearable as Any,
            "force_core_onboard_mic": useOnboardMic,
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

        let wrapperObj: [String: Any] = ["status": statusObj]

        // Core.log("wrapperStatusObj \(wrapperObj)")
        // must convert to string before sending:
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Core.sendEvent(withName: "CoreMessageEvent", body: jsonString)
            }
        } catch {
            Core.log("Mentra: Error converting to JSON: \(error)")
        }
        saveSettings()
    }

    func triggerStatusUpdate() {
        Core.log("🔄 Triggering immediate status update")
        handleRequestStatus()
    }

    private func playStartupSequence() {
        Core.log("Mentra: playStartupSequence()")
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
        if g1Manager?.g1Ready ?? false {
            return true
        }
        if liveManager?.connectionState == .connected {
            return true
        }
        if mach1Manager?.ready ?? false {
            return true
        }
        if defaultWearable.contains("Simulated") {
            return true
        }
        return false
    }

    private func handleDeviceReady() {
        // send to the server our battery status:
        serverComms.sendBatteryStatus(level: batteryLevel, charging: false)
        serverComms.sendGlassesConnectionState(modelName: defaultWearable, status: "CONNECTED")

        if pendingWearable.contains("Live") {
            handleLiveReady()
        } else if pendingWearable.contains("G1") {
            handleG1Ready()
        } else if defaultWearable.contains("Mach1") {
            handleMach1Ready()
        }
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
            await self.g1Manager?.setSilentMode(false) // turn off silent mode
            await self.g1Manager?.getBatteryStatus()

            if shouldSendBootingMessage {
                sendText("// BOOTING MENTRAOS")
            }

            // send loaded settings to glasses:
            self.g1Manager?.getBatteryStatus()
            try? await Task.sleep(nanoseconds: 400_000_000)
            self.g1Manager?.RN_setHeadUpAngle(headUpAngle)
            try? await Task.sleep(nanoseconds: 400_000_000)
            self.g1Manager?.RN_setHeadUpAngle(headUpAngle)
            try? await Task.sleep(nanoseconds: 400_000_000)
            self.g1Manager?.RN_setBrightness(brightness, autoMode: autoBrightness)
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
        Core.log("Mentra: Mentra Live device ready")
        isSearching = false
        defaultWearable = "Mentra Live"
        handleRequestStatus()
    }

    private func handleMach1Ready() {
        Core.log("Mentra: Mach1 device ready")
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
        Core.log("Mentra: Device disconnected")
        handle_microphone_state_change([], false)
        serverComms.sendGlassesConnectionState(modelName: defaultWearable, status: "DISCONNECTED")
        handleRequestStatus()
    }

    func handleConnectWearable(_ deviceName: String, modelName: String? = nil) {
        Core.log(
            "Mentra: Connecting to modelName: \(modelName ?? "nil") deviceName: \(deviceName) defaultWearable: \(defaultWearable) pendingWearable: \(pendingWearable) selfDeviceName: \(self.deviceName)"
        )

        if modelName != nil {
            pendingWearable = modelName!
        }

        if pendingWearable.contains("Simulated") {
            Core.log(
                "Mentra: Pending wearable is simulated, setting default wearable to Simulated Glasses"
            )
            defaultWearable = "Simulated Glasses"
            handleRequestStatus()
            return
        }

        if pendingWearable.isEmpty, defaultWearable.isEmpty {
            Core.log("Mentra: No pending or default wearable, returning")
            return
        }

        if pendingWearable.isEmpty, !defaultWearable.isEmpty {
            Core.log("Mentra: No pending wearable, using default wearable: \(defaultWearable)")
            pendingWearable = defaultWearable
        }

        Task {
            disconnectWearable()

            try? await Task.sleep(nanoseconds: 100 * 1_000_000) // 100ms
            self.isSearching = true
            handleRequestStatus() // update the UI

            if deviceName != "" {
                self.deviceName = deviceName
                saveSettings()
            }

            initManager(self.pendingWearable)
            if pendingWearable.contains("Live") {
                self.liveManager?.connectById(self.deviceName)
            } else if self.pendingWearable.contains("G1") {
                self.g1Manager?.connectById(self.deviceName)
            } else if self.pendingWearable.contains("Mach1") {
                self.mach1Manager?.connectById(self.deviceName)
            }
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

    // MARK: - Settings Management

    private enum SettingsKeys {
        static let defaultWearable = "defaultWearable"
        static let deviceName = "deviceName"
        static let useOnboardMic = "useBoardMic"
        static let contextualDashboard = "contextualDashboard"
        static let headUpAngle = "headUpAngle"
        static let brightness = "brightness"
        static let autoBrightness = "autoBrightness"
        static let sensingEnabled = "sensingEnabled"
        static let powerSavingMode = "powerSavingMode"
        static let dashboardHeight = "dashboardHeight"
        static let dashboardDepth = "dashboardDepth"
        static let alwaysOnStatusBar = "alwaysOnStatusBar"
        static let bypassVad = "bypassVad"
        static let bypassAudioEncoding = "bypassAudioEncoding"
        static let preferredMic = "preferredMic"
        static let metricSystemEnabled = "metricSystemEnabled"
        static let enforceLocalTranscription = "enforceLocalTranscription"
        static let buttonPressMode = "buttonPressMode"
    }

    func onStatusUpdate(_ status: [String: Any]) {
        // handle the settings from the server:
        // Core.log("onStatusUpdate: \(status)")

        // get the core_info and glasses_settings objects from the status:
        let coreInfo = status["core_info"] as? [String: Any]
        let glassesSettings = status["glasses_settings"] as? [String: Any]

        // {
        //   "status": {
        //     "core_info": {
        //       "augmentos_core_version": "1.1.3",
        //       "cloud_connection_status": "CONNECTED",
        //       "puck_battery_life": 100,
        //       "charging_status": true,
        //       "sensing_enabled": true,
        //       "bypass_vad_for_debugging": false,
        //       "bypass_audio_encoding_for_debugging": false,
        //       "contextual_dashboard_enabled": true,
        //       "always_on_status_bar_enabled": false,
        //       "force_core_onboard_mic": true,
        //       "preferred_mic": "phone",
        //       "default_wearable": "Even Realities G1",
        //       "is_mic_enabled_for_frontend": false,
        //       "metric_system_enabled": false,
        //       "is_searching": false
        //     },
        //     "connected_glasses": {
        //       "glasses_serial_number": "100LAAJ110003",
        //       "glasses_style": "Round",
        //       "glasses_color": "Grey",
        //       "model_name": "Even Realities G1",
        //       "battery_level": 56,
        //       "case_battery_level": 50,
        //       "case_charging": false,
        //       "case_open": false,
        //       "case_removed": true,
        //       "glasses_use_wifi": false
        //     },
        //     "glasses_settings": {
        //       "auto_brightness": false,
        //       "head_up_angle": 37,
        //       "dashboard_height": 4,
        //       "dashboard_depth": 5,
        //       "brightness": 96
        //     },
        //   }
        // }

        // get device
    }

    func handle_update_settings(_ settings: [String: Any]) {
        Core.log("Mentra: Received update settings: \(settings)")
        // saveSettings()

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

        // get default wearable from core_info:
        if let newDefaultWearable = settings["default_wearable"] as? String,
           newDefaultWearable != defaultWearable
        {
            defaultWearable = newDefaultWearable
            saveSettings()
        }
    }

    private func saveSettings() {
        // Core.log("about to save settings, waiting for loaded settings first: \(settingsLoaded)")
        if !settingsLoaded {
            // Wait for settings to load with a timeout
            let timeout = DispatchTime.now() + .seconds(5) // 5 second timeout
            let result = settingsLoadedSemaphore.wait(timeout: timeout)

            if result == .timedOut {
                Core.log("Mentra: Warning: Settings load timed out, proceeding with default values")
            }
        }

        let defaults = UserDefaults.standard

        // Save each setting with its corresponding key
        defaults.set(defaultWearable, forKey: SettingsKeys.defaultWearable)
        defaults.set(deviceName, forKey: SettingsKeys.deviceName)
        defaults.set(contextualDashboard, forKey: SettingsKeys.contextualDashboard)
        defaults.set(headUpAngle, forKey: SettingsKeys.headUpAngle)
        defaults.set(brightness, forKey: SettingsKeys.brightness)
        defaults.set(autoBrightness, forKey: SettingsKeys.autoBrightness)
        defaults.set(sensingEnabled, forKey: SettingsKeys.sensingEnabled)
        defaults.set(powerSavingMode, forKey: SettingsKeys.powerSavingMode)
        defaults.set(dashboardHeight, forKey: SettingsKeys.dashboardHeight)
        defaults.set(dashboardDepth, forKey: SettingsKeys.dashboardDepth)
        defaults.set(alwaysOnStatusBar, forKey: SettingsKeys.alwaysOnStatusBar)
        defaults.set(bypassVad, forKey: SettingsKeys.bypassVad)
        defaults.set(bypassAudioEncoding, forKey: SettingsKeys.bypassAudioEncoding)
        defaults.set(preferredMic, forKey: SettingsKeys.preferredMic)
        defaults.set(metricSystemEnabled, forKey: SettingsKeys.metricSystemEnabled)
        defaults.set(enforceLocalTranscription, forKey: SettingsKeys.enforceLocalTranscription)

        // Force immediate save (optional, as UserDefaults typically saves when appropriate)
        defaults.synchronize()

        // Core.log("Settings saved: Default Wearable: \(defaultWearable ?? "None"), Preferred Mic: \(preferredMic), " +
        //       "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)")

        // Core.log("Sending settings to server")
        serverComms.sendCoreStatus(status: lastStatusObj)
    }

    private func loadSettings() async {
        // set default settings here:
        UserDefaults.standard.register(defaults: [SettingsKeys.defaultWearable: ""])
        UserDefaults.standard.register(defaults: [SettingsKeys.deviceName: ""])
        UserDefaults.standard.register(defaults: [SettingsKeys.preferredMic: "phone"])
        UserDefaults.standard.register(defaults: [SettingsKeys.contextualDashboard: true])
        UserDefaults.standard.register(defaults: [SettingsKeys.autoBrightness: true])
        UserDefaults.standard.register(defaults: [SettingsKeys.sensingEnabled: true])
        UserDefaults.standard.register(defaults: [SettingsKeys.powerSavingMode: false])
        UserDefaults.standard.register(defaults: [SettingsKeys.dashboardHeight: 4])
        UserDefaults.standard.register(defaults: [SettingsKeys.dashboardDepth: 5])
        UserDefaults.standard.register(defaults: [SettingsKeys.alwaysOnStatusBar: false])
        UserDefaults.standard.register(defaults: [SettingsKeys.bypassVad: true])
        UserDefaults.standard.register(defaults: [SettingsKeys.bypassAudioEncoding: false])
        UserDefaults.standard.register(defaults: [SettingsKeys.headUpAngle: 30])
        UserDefaults.standard.register(defaults: [SettingsKeys.brightness: 50])
        UserDefaults.standard.register(defaults: [SettingsKeys.metricSystemEnabled: false])
        UserDefaults.standard.register(defaults: [SettingsKeys.enforceLocalTranscription: false])
        UserDefaults.standard.register(defaults: [SettingsKeys.buttonPressMode: "photo"])

        let defaults = UserDefaults.standard

        // Load each setting with appropriate type handling
        defaultWearable = defaults.string(forKey: SettingsKeys.defaultWearable)!
        deviceName = defaults.string(forKey: SettingsKeys.deviceName)!
        preferredMic = defaults.string(forKey: SettingsKeys.preferredMic)!
        contextualDashboard = defaults.bool(forKey: SettingsKeys.contextualDashboard)
        autoBrightness = defaults.bool(forKey: SettingsKeys.autoBrightness)
        sensingEnabled = defaults.bool(forKey: SettingsKeys.sensingEnabled)
        powerSavingMode = defaults.bool(forKey: SettingsKeys.powerSavingMode)
        dashboardHeight = defaults.integer(forKey: SettingsKeys.dashboardHeight)
        dashboardDepth = defaults.integer(forKey: SettingsKeys.dashboardDepth)
        alwaysOnStatusBar = defaults.bool(forKey: SettingsKeys.alwaysOnStatusBar)
        bypassVad = defaults.bool(forKey: SettingsKeys.bypassVad)
        bypassAudioEncoding = defaults.bool(forKey: SettingsKeys.bypassAudioEncoding)
        headUpAngle = defaults.integer(forKey: SettingsKeys.headUpAngle)
        brightness = defaults.integer(forKey: SettingsKeys.brightness)
        metricSystemEnabled = defaults.bool(forKey: SettingsKeys.metricSystemEnabled)
        enforceLocalTranscription = defaults.bool(forKey: SettingsKeys.enforceLocalTranscription)
        buttonPressMode = defaults.string(forKey: SettingsKeys.buttonPressMode)!

        // TODO: load settings from the server

        // Mark settings as loaded and signal completion
        settingsLoaded = true
        settingsLoadedSemaphore.signal()

        Core.log(
            "Mentra: Settings loaded: Default Wearable: \(defaultWearable ?? "None"), Preferred Mic: \(preferredMic), "
                + "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)"
        )
    }

    // MARK: - Helper Functions

    private func getConnectedGlassesBluetoothName() -> String? {
        // Check each connected glasses type and return the Bluetooth name
        if let liveManager = liveManager, liveManager.glassesReady {
            return liveManager.getConnectedBluetoothName()
        }

        if let g1Manager = g1Manager, g1Manager.g1Ready {
            return g1Manager.getConnectedBluetoothName()
        }

        if let mach1Manager = mach1Manager, mach1Manager.ready {
            return mach1Manager.getConnectedBluetoothName()
        }

        return nil
    }

    // MARK: - Cleanup

    @objc func cleanup() {
        // Clean up transcriber resources
        transcriber?.shutdown()
        transcriber = nil

        cancellables.removeAll()
        saveSettings()
    }

    // MARK: - SherpaOnnxTranscriber / STT Model Management

    func didReceivePartialTranscription(_ text: String) {
        // Send partial result to server with proper formatting
        let transcription: [String: Any] = [
            "type": "local_transcription",
            "text": text,
            "isFinal": false,
            "startTime": Int(Date().timeIntervalSince1970 * 1000) - 1000, // 1 second ago
            "endTime": Int(Date().timeIntervalSince1970 * 1000),
            "speakerId": 0,
            "transcribeLanguage": "en-US",
            "provider": "sherpa-onnx",
        ]

        serverComms.sendTranscriptionResult(transcription: transcription)
    }

    func didReceiveFinalTranscription(_ text: String) {
        // Send final result to server with proper formatting
        if !text.isEmpty {
            let transcription: [String: Any] = [
                "type": "local_transcription",
                "text": text,
                "isFinal": true,
                "startTime": Int(Date().timeIntervalSince1970 * 1000) - 2000, // 2 seconds ago
                "endTime": Int(Date().timeIntervalSince1970 * 1000),
                "speakerId": 0,
                "transcribeLanguage": "en-US",
                "provider": "sherpa-onnx",
            ]

            serverComms.sendTranscriptionResult(transcription: transcription)
        }
    }

    func setSttModelPath(_ path: String) {
        UserDefaults.standard.set(path, forKey: "STTModelPath")
        UserDefaults.standard.synchronize()
    }

    func checkSTTModelAvailable() -> Bool {
        guard let modelPath = UserDefaults.standard.string(forKey: "STTModelPath") else {
            return false
        }

        let fileManager = FileManager.default

        // Check for tokens.txt (required for all models)
        let tokensPath = (modelPath as NSString).appendingPathComponent("tokens.txt")
        if !fileManager.fileExists(atPath: tokensPath) {
            return false
        }

        // Check for CTC model
        let ctcModelPath = (modelPath as NSString).appendingPathComponent("model.int8.onnx")
        if fileManager.fileExists(atPath: ctcModelPath) {
            return true
        }

        // Check for transducer model
        let transducerFiles = ["encoder.onnx", "decoder.onnx", "joiner.onnx"]
        for file in transducerFiles {
            let filePath = (modelPath as NSString).appendingPathComponent(file)
            if !fileManager.fileExists(atPath: filePath) {
                return false
            }
        }

        return true
    }

    func validateSTTModel(_ path: String) -> Bool {
        do {
            let fileManager = FileManager.default

            // Check for tokens.txt (required for all models)
            let tokensPath = (path as NSString).appendingPathComponent("tokens.txt")
            if !fileManager.fileExists(atPath: tokensPath) {
                return false
            }

            // Check for CTC model
            let ctcModelPath = (path as NSString).appendingPathComponent("model.int8.onnx")
            if fileManager.fileExists(atPath: ctcModelPath) {
                return true
            }

            // Check for transducer model
            let transducerFiles = ["encoder.onnx", "decoder.onnx", "joiner.onnx"]
            var allTransducerFilesPresent = true

            for file in transducerFiles {
                let filePath = (path as NSString).appendingPathComponent(file)
                if !fileManager.fileExists(atPath: filePath) {
                    allTransducerFilesPresent = false
                    break
                }
            }

            return allTransducerFilesPresent
        } catch {
            Core.log("STT_ERROR: \(error.localizedDescription)")
            return false
        }
    }

    func extractTarBz2(sourcePath: String, destinationPath: String) -> Bool {
        do {
            let fileManager = FileManager.default

            // Create destination directory if it doesn't exist
            try fileManager.createDirectory(
                atPath: destinationPath,
                withIntermediateDirectories: true,
                attributes: nil
            )

            // Try to read compressed file
            guard let compressedData = try? Data(contentsOf: URL(fileURLWithPath: sourcePath))
            else {
                Core.log("EXTRACTION_ERROR: Failed to read compressed file")
                return false
            }

            // Create a temporary directory for extraction
            let tempExtractPath = NSTemporaryDirectory().appending("/\(UUID().uuidString)")
            try fileManager.createDirectory(
                atPath: tempExtractPath,
                withIntermediateDirectories: true,
                attributes: nil
            )

            // Use the Swift TarBz2Extractor with SWCompression
            var extractionError: NSError?
            let success = TarBz2Extractor.extractTarBz2From(
                sourcePath,
                to: destinationPath,
                error: &extractionError
            )

            if !success || extractionError != nil {
                print(
                    "EXTRACTION_ERROR: \(extractionError?.localizedDescription ?? "Failed to extract tar.bz2")"
                )
                return false
            }

            // Rename encoder
            let oldEncoderPath = (destinationPath as NSString).appendingPathComponent(
                "encoder-epoch-99-avg-1.onnx")
            let newEncoderPath = (destinationPath as NSString).appendingPathComponent(
                "encoder.onnx")
            if fileManager.fileExists(atPath: oldEncoderPath) {
                try? fileManager.moveItem(atPath: oldEncoderPath, toPath: newEncoderPath)
            }

            // Rename decoder
            let oldDecoderPath = (destinationPath as NSString).appendingPathComponent(
                "decoder-epoch-99-avg-1.onnx")
            let newDecoderPath = (destinationPath as NSString).appendingPathComponent(
                "decoder.onnx")
            if fileManager.fileExists(atPath: oldDecoderPath) {
                try? fileManager.moveItem(atPath: oldDecoderPath, toPath: newDecoderPath)
            }

            // Rename joiner
            let oldJoinerPath = (destinationPath as NSString).appendingPathComponent(
                "joiner-epoch-99-avg-1.int8.onnx")
            let newJoinerPath = (destinationPath as NSString).appendingPathComponent("joiner.onnx")
            if fileManager.fileExists(atPath: oldJoinerPath) {
                try? fileManager.moveItem(atPath: oldJoinerPath, toPath: newJoinerPath)
            }

            return true
        } catch {
            Core.log("EXTRACTION_ERROR: \(error.localizedDescription)")
            return false
        }
    }
}
