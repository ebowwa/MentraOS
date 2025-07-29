//
//  AOSManager.swift
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Foundation
import Combine
import CoreBluetooth
import UIKit
import React
import AVFoundation

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
@objc(AOSManager) class AOSManager: NSObject, ServerCommsCallback, MicCallback {
  
  private static var instance: AOSManager?
  
  static func getInstance() -> AOSManager {
    if instance == nil {
      instance = AOSManager()
    }
    return instance!
  }
  
  private var coreToken: String = ""
  private var coreTokenOwner: String = ""
  
  @objc var g1Manager: ERG1Manager?
  @objc var liveManager: MentraLiveManager?
  @objc var mach1Manager: Mach1Manager?
  var micManager: OnboardMicrophoneManager!
  var serverComms: ServerComms!
  
  private var lastStatusObj: [String: Any] = [:]
  
  private var cancellables = Set<AnyCancellable>()
  private var cachedThirdPartyAppList: [ThirdPartyCloudApp] = []
  //  private var cachedWhatToStream = [String]()
  private var defaultWearable: String = ""
  private var deviceName: String = ""
  private var somethingConnected: Bool = false;
  private var shouldEnableMic: Bool = false;
  private var contextualDashboard = true;
  private var headUpAngle = 30;
  private var brightness = 50;
  private var batteryLevel = -1;
  private var autoBrightness: Bool = true;
  private var dashboardHeight: Int = 4;
  private var dashboardDepth: Int = 5;
  private var sensingEnabled: Bool = true;
  private var powerSavingMode: Bool = false;
  private var isSearching: Bool = true;
  private var isUpdatingScreen: Bool = false;
  private var alwaysOnStatusBar: Bool = false;
  private var bypassVad: Bool = false;
  private var bypassAudioEncoding: Bool = false;
  private var onboardMicUnavailable: Bool = false;
  private var metricSystemEnabled: Bool = false;
  private var settingsLoaded = false
  private let settingsLoadedSemaphore = DispatchSemaphore(value: 0)
  private var connectTask: Task<Void, Never>?
  private var glassesWifiConnected: Bool = false;
  private var glassesWifiSsid: String = "";
  private var isHeadUp: Bool = false;
  
  var viewStates: [ViewState] = [
    ViewState(topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "", eventStr: ""),
    ViewState(topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$", eventStr: ""),
    ViewState(topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "", eventStr: "", data: nil, animationData: nil),
    ViewState(topText: " ", bottomText: " ", title: " ", layoutType: "text_wall", text: "$TIME12$ $DATE$ $GBATT$ $CONNECTION_STATUS$", eventStr: "", data: nil, animationData: nil),
  ]
  
  private var sendStateWorkItem: DispatchWorkItem?
  private let sendStateQueue = DispatchQueue(label: "sendStateQueue", qos: .userInitiated)
  
  
  // mic:
  private var useOnboardMic = false;
  private var preferredMic = "glasses";
  private var micEnabled = false;
  
  // VAD:
  private var vad: SileroVADStrategy?
  private var vadBuffer = [Data]();
  private var isSpeaking = false;
  
  override init() {
    self.vad = SileroVADStrategy()
    self.serverComms = ServerComms.getInstance()
    super.init()
    Task {
      await loadSettings()
      self.vad?.setup(sampleRate: .rate_16k,
                      frameSize: .size_1024,
                      quality: .normal,
                      silenceTriggerDurationMs: 4000,
                      speechTriggerDurationMs: 50)
    }
  }
  
  // MARK: - Public Methods (for React Native)
  
  public func setup() {
    
    self.micManager = OnboardMicrophoneManager()
    self.serverComms.locationManager.setup()
    self.serverComms.mediaManager.setup()
    
    // Set up the ServerComms callback
    self.serverComms.setServerCommsCallback(self)
    self.micManager.setMicCallback(self)
    
    // Set up voice data handling
    setupVoiceDataHandling()
    
    // configure on board mic:
    //    setupOnboardMicrophoneIfNeeded()
    
    // initManagerCallbacks()
    
    // Subscribe to WebSocket status changes
    serverComms.wsManager.status
      .sink { [weak self] status in
        guard let self = self else { return }
        handleRequestStatus()
      }
      .store(in: &cancellables)
  }
  
  func initManager(_ wearable: String) {
    CoreCommsService.log("Initializing manager for wearable: \(wearable)")
    if (wearable.contains("G1") && self.g1Manager == nil) {
      self.g1Manager = ERG1Manager.shared
    } else if (wearable.contains("Live") && self.liveManager == nil) {
      self.liveManager = MentraLiveManager()
    } else if (wearable.contains("Mach1") && self.mach1Manager == nil) {
//      self.mach1Manager = Mach1Manager.shared
      self.mach1Manager = Mach1Manager()
    }
    initManagerCallbacks()
  }
  
  func initManagerCallbacks() {
    // calback to handle actions when the connectionState changes (when g1 is ready)
    
    if g1Manager != nil {
      g1Manager!.onConnectionStateChanged = { [weak self] in
        guard let self = self else { return }
        CoreCommsService.log("G1 glasses connection changed to: \(self.g1Manager!.g1Ready ? "Connected" : "Disconnected")")
        //      self.handleRequestStatus()
        if (self.g1Manager!.g1Ready) {
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
        self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false);
        handleRequestStatus()
      }.store(in: &cancellables)
      
      // listen to headUp events:
      g1Manager!.$isHeadUp.sink { [weak self] (value: Bool) in
        guard let self = self else { return }
        updateHeadUp(value)
      }.store(in: &cancellables)
      
      // listen to case events:
      g1Manager!.$caseOpen.sink { [weak self] (value: Bool) in
        guard let self = self else { return }
        handleRequestStatus()
      }.store(in: &cancellables)
      
      g1Manager!.$caseRemoved.sink { [weak self] (value: Bool) in
        guard let self = self else { return }
        handleRequestStatus()
      }.store(in: &cancellables)
      
      g1Manager!.$caseCharging.sink { [weak self] (value: Bool) in
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
      self.g1Manager!.$compressedVoiceData.sink { [weak self] rawLC3Data in
        guard let self = self else { return }
        
        // Ensure we have enough data to process
        guard rawLC3Data.count > 2 else {
          CoreCommsService.log("Received invalid PCM data size: \(rawLC3Data.count)")
          return
        }
        
        // Skip the first 2 bytes which are command bytes
        let lc3Data = rawLC3Data.subdata(in: 2..<rawLC3Data.count)
        
        // Ensure we have valid PCM data
        guard lc3Data.count > 0 else {
          CoreCommsService.log("No LC3 data after removing command bytes")
          return
        }
        
        
        if self.bypassVad {
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
          CoreCommsService.log("PCM conversion resulted in empty data")
          return
        }
        
        // feed PCM to the VAD:
        guard let vad = self.vad else {
          CoreCommsService.log("VAD not initialized")
          return
        }
        
        // convert audioData to Int16 array:
        let pcmDataArray = pcmData.withUnsafeBytes { pointer -> [Int16] in
          Array(UnsafeBufferPointer(
            start: pointer.bindMemory(to: Int16.self).baseAddress,
            count: pointer.count / MemoryLayout<Int16>.stride
          ))
        }
        
        vad.checkVAD(pcm: pcmDataArray) { [weak self] state in
          guard let self = self else { return }
          CoreCommsService.log("VAD State: \(state)")
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
    
    if liveManager != nil {
      liveManager!.onConnectionStateChanged = { [weak self] in
        guard let self = self else { return }
        CoreCommsService.log("Live glasses connection changed to: \(self.liveManager!.ready ? "Connected" : "Disconnected")")
        if (self.liveManager!.ready) {
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
        self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false);
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
        CoreCommsService.log("Mach1 glasses connection changed to: \(self.mach1Manager!.ready ? "Connected" : "Disconnected")")
        if (self.mach1Manager!.ready) {
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
        self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false);
        handleRequestStatus()
      }.store(in: &cancellables)
      
      mach1Manager!.$isHeadUp.sink { [weak self] (value: Bool) in
        CoreCommsService.log("MACH1 glasses head up changed to: \(value)")
        guard let self = self else { return }
        updateHeadUp(value)
      }.store(in: &cancellables)
    }
  }
  
  func updateHeadUp(_ isHeadUp: Bool) {
    self.isHeadUp = isHeadUp
    self.sendCurrentState(isHeadUp)
    ServerComms.getInstance().sendHeadPosition(isUp: isHeadUp)
  }
  
  @objc func connectServer() {
    serverComms.connectWebSocket()
  }
  
  @objc func setCoreToken(_ coreToken: String) {
    serverComms.setAuthCredentials("", coreToken)
  }
  
  // MARK: - Audio Bridge Methods
  
  @objc func playAudio(
    _ requestId: String,
    audioUrl: String,
    volume: Float,
    stopOtherAudio: Bool
  ) {
    CoreCommsService.log("AOSManager: playAudio bridge called for requestId: \(requestId)")
    
    let audioManager = AudioManager.getInstance()
    audioManager.playAudio(
      requestId: requestId,
      audioUrl: audioUrl,
      volume: volume,
      stopOtherAudio: stopOtherAudio
    )
  }
  
  @objc func stopAudio(_ requestId: String) {
    CoreCommsService.log("AOSManager: stopAudio bridge called for requestId: \(requestId)")
    
    let audioManager = AudioManager.getInstance()
    audioManager.stopAudio(requestId: requestId)
  }
  
  @objc func stopAllAudio() {
    CoreCommsService.log("AOSManager: stopAllAudio bridge called")
    
    let audioManager = AudioManager.getInstance()
    audioManager.stopAllAudio()
  }
  
  func onConnectionAck() {
    handleRequestStatus()
    
    let isoDatetime = ServerComms.getCurrentIsoDatetime()
    serverComms.sendUserDatetimeToBackend(isoDatetime: isoDatetime)
  }
  
  func onAppStateChange(_ apps: [ThirdPartyCloudApp]/*, _ whatToStream: [String]*/) {
    self.cachedThirdPartyAppList = apps
    handleRequestStatus()
  }
  
  func onConnectionError(_ error: String) {
    handleRequestStatus()
  }
  
  func onAuthError() {}
  
  // MARK: - Voice Data Handling
  
  private func checkSetVadStatus(speaking: Bool) {
    if (speaking != self.isSpeaking) {
      self.isSpeaking = speaking
      serverComms.sendVadStatus(self.isSpeaking)
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
    let MAX_BUFFER_SIZE = 20;
    vadBuffer.append(chunk)
    while(vadBuffer.count > MAX_BUFFER_SIZE) {
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
          CoreCommsService.log("VAD not initialized")
          return
        }
        
        
        if self.bypassVad {
          //          let pcmConverter = PcmConverter()
          //          let lc3Data = pcmConverter.encode(pcmData) as Data
          //          checkSetVadStatus(speaking: true)
          //          // first send out whatever's in the vadBuffer (if there is anything):
          //          emptyVadBuffer()
          //          self.serverComms.sendAudioChunk(lc3Data)
          self.serverComms.sendAudioChunk(pcmData)
          return
        }
        
        // convert audioData to Int16 array:
        let pcmDataArray = pcmData.withUnsafeBytes { pointer -> [Int16] in
          Array(UnsafeBufferPointer(
            start: pointer.bindMemory(to: Int16.self).baseAddress,
            count: pointer.count / MemoryLayout<Int16>.stride
          ))
        }
        
        vad.checkVAD(pcm: pcmDataArray) { [weak self] state in
          guard let self = self else { return }
          //            self.handler?(state)
          CoreCommsService.log("VAD State: \(state)")
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
          self.serverComms.sendAudioChunk(pcmData)
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
  
  func onMicrophoneStateChange(_ isEnabled: Bool) {
    
    CoreCommsService.log("AOS: @@@@@@@@ changing microphone state to: \(isEnabled) @@@@@@@@@@@@@@@@")
    // in any case, clear the vadBuffer:
    self.vadBuffer.removeAll()
    self.micEnabled = isEnabled
    
    // Handle microphone state change if needed
    Task {
      // Only enable microphone if sensing is also enabled
      var actuallyEnabled = isEnabled && self.sensingEnabled
      if (!self.somethingConnected) {
        actuallyEnabled = false
      }
      
      let glassesHasMic = getGlassesHasMic()
      
      var useGlassesMic = false
      var useOnboardMic = false
      
      useOnboardMic = self.preferredMic == "phone"
      useGlassesMic = self.preferredMic == "glasses"
      
      if (self.onboardMicUnavailable) {
        useOnboardMic = false
      }
      
      if (!glassesHasMic) {
        useGlassesMic = false
      }
      
      if (!useGlassesMic && !useOnboardMic) {
        // if we have a non-preferred mic, use it:
        if (glassesHasMic) {
          useGlassesMic = true
        } else if (!self.onboardMicUnavailable) {
          useOnboardMic = true
        }
        
        if (!useGlassesMic && !useOnboardMic) {
          CoreCommsService.log("no mic to use!!!!!!")
        }
      }
      
      useGlassesMic = actuallyEnabled && useGlassesMic
      useOnboardMic = actuallyEnabled && useOnboardMic
      
      CoreCommsService.log("AOS: user enabled microphone: \(isEnabled) sensingEnabled: \(self.sensingEnabled) useOnboardMic: \(useOnboardMic) useGlassesMic: \(useGlassesMic) glassesHasMic: \(glassesHasMic) preferredMic: \(self.preferredMic) somethingConnected: \(self.somethingConnected) onboardMicUnavailable: \(self.onboardMicUnavailable)")
      
      if (self.somethingConnected) {
        await self.g1Manager?.setMicEnabled(enabled: useGlassesMic)
      }
      
      setOnboardMicEnabled(useOnboardMic)
    }
  }
  
  // MARK: - App Started/Stopped Handling
  
  func onAppStarted(_ packageName: String) {
    
    // tell the server what pair of glasses we're using:
    self.serverComms.sendGlassesConnectionState(modelName: self.defaultWearable, status: "CONNECTED")
    
    CoreCommsService.log("App started: \(packageName) - checking for auto-reconnection")
    
    // Check if glasses are disconnected but there is a saved pair, initiate connection
    if !self.somethingConnected && !self.defaultWearable.isEmpty {
      CoreCommsService.log("Found preferred wearable: \(self.defaultWearable)")
      
      if !self.defaultWearable.isEmpty {
        CoreCommsService.log("Auto-connecting to glasses due to app start: \(self.defaultWearable)")
        
        // Always run on main thread to avoid threading issues
        DispatchQueue.main.async { [weak self] in
          guard let self = self else { return }
          
          // Attempt to connect using saved device name
          if !self.deviceName.isEmpty {
            self.handleConnectWearable(modelName: self.defaultWearable, deviceName: self.deviceName)

          } else {
            CoreCommsService.log("No saved device name found for auto-connection")
          }
        }
      } else {
        CoreCommsService.log("No preferred wearable found for auto-connection")
      }
    } else if self.defaultWearable.isEmpty {
      CoreCommsService.log("No preferred wearable set, cannot auto-connect")
    } else {
      CoreCommsService.log("Glasses already connected or connecting, skipping auto-reconnection. Connected: \(self.somethingConnected)")
    }
  }
  
  func onAppStopped(_ packageName: String) {
    CoreCommsService.log("AOS: App stopped: \(packageName)")
    // Handle app stopped if needed
  }
  
  func onJsonMessage(_ message: [String: Any]) {
    CoreCommsService.log("AOS: onJsonMessage: \(message)")
    self.liveManager?.sendJson(message)
  }
  
  func onPhotoRequest(_ requestId: String, _ appId: String, _ webhookUrl: String) {
    CoreCommsService.log("AOS: onPhotoRequest: \(requestId), \(appId), \(webhookUrl)")
    self.liveManager?.requestPhoto(requestId, appId: appId, webhookUrl: webhookUrl.isEmpty ? nil : webhookUrl)
  }
  
  func onRtmpStreamStartRequest(_ message: [String: Any]) {
    CoreCommsService.log("AOS: onRtmpStreamStartRequest: \(message)")
    self.liveManager?.startRtmpStream(message)
  }
  
  func onRtmpStreamStop() {
    CoreCommsService.log("AOS: onRtmpStreamStop")
    self.liveManager?.stopRtmpStream()
  }
  
  func onRtmpStreamKeepAlive(_ message: [String: Any]) {
    CoreCommsService.log("AOS: onRtmpStreamKeepAlive: \(message)")
    self.liveManager?.sendRtmpKeepAlive(message)
  }
  
  // TODO: ios this name is a bit misleading:
  func setOnboardMicEnabled(_ isEnabled: Bool) {
    Task {
      if isEnabled {
        // Just check permissions - we no longer request them directly from Swift
        // Permissions should already be granted via React Native UI flow
        if !(micManager?.checkPermissions() ?? false) {
          CoreCommsService.log("Microphone permissions not granted. Cannot enable microphone.")
          return
        }
        
        micManager?.startRecording()
      } else {
        micManager?.stopRecording()
      }
    }
  }
  
  //  func onDashboardDisplayEvent(_ event: [String: Any]) {
  //    CoreCommsService.log("got dashboard display event")
  ////    onDisplayEvent?(["event": event, "type": "dashboard"])
  //    CoreCommsService.log(event)
  ////    Task {
  ////      await self.g1Manager.sendText(text: "\(event)")
  ////    }
  //  }
  
  // send whatever was there before sending something else:
  public func clearState() -> Void {
    sendCurrentState(self.g1Manager?.isHeadUp ?? false)
  }
  
  public func sendCurrentState(_ isDashboard: Bool) -> Void {
    // Cancel any pending delayed execution
    // sendStateWorkItem?.cancel()
    
    // don't send the screen state if we're updating the screen:
    if (self.isUpdatingScreen) {
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
  
  
  public func executeSendCurrentState(_ isDashboard: Bool) -> Void {
    Task {
      var currentViewState: ViewState!;
      if (isDashboard) {
        currentViewState = self.viewStates[1]
      } else {
        currentViewState = self.viewStates[0]
      }
      self.isHeadUp = isDashboard
      
      if (isDashboard && !self.contextualDashboard) {
        return
      }
      
      let eventStr = currentViewState.eventStr
      if eventStr != "" {
        CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: eventStr)
      }
      
      if self.defaultWearable.contains("Simulated") || self.defaultWearable.isEmpty {
        // dont send the event to glasses that aren't there:
        return
      }
      
      if (!self.somethingConnected) {
        return
      }
      
      let layoutType = currentViewState.layoutType
      switch layoutType {
      case "text_wall":
        let text = currentViewState.text
        sendText(text);
        break
      case "double_text_wall":
        let topText = currentViewState.topText
        let bottomText = currentViewState.bottomText
        self.g1Manager?.sendDoubleTextWall(topText, bottomText);
        self.mach1Manager?.sendDoubleTextWall(topText, bottomText);
        break
      case "reference_card":
        sendText(currentViewState.topText + "\n\n" + currentViewState.title);
        break
      case "bitmap_view":
        CoreCommsService.log("AOS: Processing bitmap_view layout")
        guard let data = currentViewState.data else {
          CoreCommsService.log("AOS: ERROR: bitmap_view missing data field")
          return
        }
        CoreCommsService.log("AOS: Processing bitmap_view with base64 data, length: \(data.count)")
        await self.g1Manager?.displayBitmap(base64ImageData: data)
        await self.mach1Manager?.displayBitmap(base64ImageData: data)
        break
      case "bitmap_animation":
        CoreCommsService.log("AOS: Processing bitmap_animation layout")
        if let animationData = currentViewState.animationData,
           let frames = animationData["frames"] as? [String],
           let interval = animationData["interval"] as? Double {
          let shouldRepeat = animationData["repeat"] as? Bool ?? true
          
          CoreCommsService.log("AOS: 🎬 Starting iOS-controlled animation: \(frames.count) frames, \(interval)ms intervals, repeat: \(shouldRepeat)")
          
          // Convert frames array to JSON string
          if let framesJsonData = try? JSONSerialization.data(withJSONObject: frames) {
            if let framesJson = String(data: framesJsonData, encoding: .utf8) {
              self.g1Manager?.RN_displayBitmapAnimation(framesJson, interval: interval, shouldRepeat: shouldRepeat)
            } else {
              CoreCommsService.log("AOS: ERROR: Failed to convert animation frames JSON data to String")
            }
          } else {
            CoreCommsService.log("AOS: ERROR: Failed to serialize animation frames to JSON")
          }
        } else {
          CoreCommsService.log("AOS: ERROR: bitmap_animation missing animation data")
        }
        break
      case "clear_view":
        CoreCommsService.log("AOS: Processing clear_view layout - clearing display")
        self.g1Manager?.clearDisplay()
        self.mach1Manager?.clearDisplay()
        break
      default:
        CoreCommsService.log("UNHANDLED LAYOUT_TYPE \(layoutType)")
        break
      }
      
    }
  }
  
  public func parsePlaceholders(_ text: String) -> String {
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
    
    placeholders["$CONNECTION_STATUS$"] = serverComms.isWebSocketConnected() ? "Connected" : "Disconnected"
    
    var result = text
    for (key, value) in placeholders {
      result = result.replacingOccurrences(of: key, with: value)
    }
    
    return result
  }
  
  public func handleDisplayEvent(_ event: [String: Any]) -> Void {
    
    guard let view = event["view"] as? String else {
      CoreCommsService.log("AOS: invalid view")
      return
    }
    let isDashboard = view == "dashboard"
    
    var stateIndex = 0;
    if (isDashboard) {
      stateIndex = 1
    } else {
      stateIndex = 0
    }
    
    // save the state string to forward to the mirror:
    // forward to the glasses mirror:
    let wrapperObj: [String: Any] = ["glasses_display_event": event]
    var eventStr = ""
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
      eventStr = String(data: jsonData, encoding: .utf8) ?? ""
    } catch {
      CoreCommsService.log("AOS: Error converting to JSON: \(error)")
    }


    let layout = event["layout"] as! [String: Any];
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
    
    var newViewState = ViewState(topText: topText, bottomText: bottomText, title: title, layoutType: layoutType, text: text, eventStr: eventStr, data: data, animationData: nil)
    
    if (layoutType == "bitmap_animation") {
      if let frames = layout["frames"] as? [String],
         let interval = layout["interval"] as? Double {
        let animationData: [String: Any] = [
          "frames": frames,
          "interval": interval,
          "repeat": layout["repeat"] as? Bool ?? true
        ]
        newViewState.animationData = animationData
        CoreCommsService.log("AOS: Parsed bitmap_animation with \(frames.count) frames, interval: \(interval)ms")
      } else {
        CoreCommsService.log("AOS: ERROR: bitmap_animation missing frames or interval")
      }
    }
    
    let cS = self.viewStates[stateIndex]
    let nS = newViewState
    let currentState = cS.layoutType + cS.text + cS.topText + cS.bottomText + cS.title + (cS.data ?? "")
    let newState = nS.layoutType + nS.text + nS.topText + nS.bottomText + nS.title + (nS.data ?? "")

    if currentState == newState { 
      // CoreCommsService.log("AOS: View state is the same, skipping update")
      return
    }
    
    CoreCommsService.log("Updating view state \(stateIndex) with \(layoutType) \(text) \(topText) \(bottomText)")
    
    self.viewStates[stateIndex] = newViewState
    
    let headUp = self.isHeadUp
    // send the state we just received if the user is currently in that state:
    if (stateIndex == 0 && !headUp) {
      sendCurrentState(false)
    } else if (stateIndex == 1 && headUp) {
      sendCurrentState(true)
    }
  }
  
  func onDisplayEvent(_ event: [String: Any]) {
    handleDisplayEvent(event)
  }
  
  func onRequestSingle(_ dataType: String) {
    // Handle single data request
    if dataType == "battery" {
      // Send battery status if needed
    }
    // TODO:
    handleRequestStatus()
  }
  
  func onRouteChange(reason: AVAudioSession.RouteChangeReason, availableInputs: [AVAudioSessionPortDescription]) {
    CoreCommsService.log("AOS: onRouteChange: \(reason)")
    
    // CoreCommsService.log the available inputs and see if any are an onboard mic:
    // for input in availableInputs {
    //   CoreCommsService.log("input: \(input.portType)")
    // }
    
    // if availableInputs.isEmpty {
    //   self.onboardMicUnavailable = true
    //   self.setOnboardMicEnabled(false)
    //   onMicrophoneStateChange(self.micEnabled)
    //   return
    // } else {
    //   self.onboardMicUnavailable = false
    // }
    
    switch reason {
    case .newDeviceAvailable:
      self.micManager?.stopRecording()
      self.micManager?.startRecording()
    case .oldDeviceUnavailable:
      self.micManager?.stopRecording()
      self.micManager?.startRecording()
    default:
      break
    }
  }
  
  func onInterruption(began: Bool) {
    CoreCommsService.log("AOS: Interruption: \(began)")
    if began {
      self.onboardMicUnavailable = true
      onMicrophoneStateChange(self.micEnabled)
    } else {
      self.onboardMicUnavailable = false
      onMicrophoneStateChange(self.micEnabled)
    }
  }

  private func clearDisplay() {

    self.mach1Manager?.clearDisplay()

    if (self.defaultWearable.contains("G1")) {
      self.g1Manager?.sendTextWall(" ")

      // clear the screen after 3 seconds if the text is empty or a space:
      if (self.powerSavingMode) {
        sendStateWorkItem?.cancel()
        CoreCommsService.log("AOS: Clearing display after 3 seconds")
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
    // CoreCommsService.log("AOS: Sending text: \(text)")
    if self.defaultWearable.contains("Simulated") || self.defaultWearable.isEmpty {
      return
    }


    if text == " " || text.isEmpty {
      clearDisplay()
      return
    }
    
    self.g1Manager?.sendTextWall(text)
    self.mach1Manager?.sendTextWall(text)
  }
  
  
  // command functions:
  
  private func setServerUrl(url: String) {
    CoreCommsService.log("AOS: Setting server URL to: \(url)")
    self.serverComms.setServerUrl(url)
  }
  
  func setAuthSecretKey(secretKey: String, userId: String) {
    CoreCommsService.log("AOS: Setting auth secret key to: \(secretKey)")
    self.setup()// finish init():
    self.coreToken = secretKey
    self.coreTokenOwner = userId
    CoreCommsService.log("AOS: Setting auth secret key for user: \(userId)")
    serverComms.setAuthCredentials(userId, secretKey)
    CoreCommsService.log("AOS: Connecting to AugmentOS...")
    serverComms.connectWebSocket()
    handleRequestStatus()
  }
  
  private func disconnectWearable() {
    self.sendText(" ")// clear the screen
    Task {
      connectTask?.cancel()
      self.somethingConnected = false
      self.g1Manager?.disconnect()
      self.liveManager?.disconnect()
      self.mach1Manager?.disconnect()
      self.isSearching = false
      handleRequestStatus()
    }
  }
  
  private func forgetSmartGlasses() {
    disconnectWearable()
    self.defaultWearable = ""
    self.deviceName = ""
    self.g1Manager?.forgetGlasses()
    // self.liveManager?.forgetGlasses()
    // self.g1Manager = nil
    // self.liveManager = nil
    handleRequestStatus()
    saveSettings()
  }
  
  func handleSearchForCompatibleDeviceNames(_ modelName: String) {
    CoreCommsService.log("AOS: Searching for compatible device names for: \(modelName)")
    if (modelName.contains("Simulated")) {
      self.defaultWearable = "Simulated Glasses"
      self.preferredMic = "phone"
      handleRequestStatus()
      saveSettings()
    } else if (modelName.contains("Audio")) {
      self.defaultWearable = "Audio Wearable"
      self.preferredMic = "phone"
      handleRequestStatus()
      saveSettings()
    } else if (modelName.contains("G1")) {
      self.defaultWearable = "Even Realities G1"
      initManager(self.defaultWearable)
      self.g1Manager?.findCompatibleDevices()
    } else if (modelName.contains("Live")) {
      self.defaultWearable = "Mentra Live"
      initManager(self.defaultWearable)
      self.liveManager?.findCompatibleDevices()
    } else if (modelName.contains("Mach1")) {
      self.defaultWearable = "Mach1"
      initManager(self.defaultWearable)
      self.mach1Manager?.findCompatibleDevices()
    }
  }
  
  private func enableContextualDashboard(_ enabled: Bool) {
    self.contextualDashboard = enabled
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func setPreferredMic(_ mic: String) {
    self.preferredMic = mic
    onMicrophoneStateChange(self.micEnabled)
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func startApp(_ target: String) {
    CoreCommsService.log("AOS: Starting app: \(target)")
    serverComms.startApp(packageName: target)
    handleRequestStatus()
  }
  
  private func stopApp(_ target: String) {
    CoreCommsService.log("AOS: Stopping app: \(target)")
    serverComms.stopApp(packageName: target)
    handleRequestStatus()
  }
  
  private func updateGlassesHeadUpAngle(_ value: Int) {
    self.headUpAngle = value
    self.g1Manager?.RN_setHeadUpAngle(value)
    saveSettings()
    handleRequestStatus()// to update the UI
  }
  
  private func updateGlassesBrightness(_ value: Int, autoBrightness: Bool) {
    let autoBrightnessChanged = self.autoBrightness != autoBrightness
    self.brightness = value
    self.autoBrightness = autoBrightness
    Task {
      self.g1Manager?.RN_setBrightness(value, autoMode: autoBrightness)
      if autoBrightnessChanged {
        sendText(autoBrightness ? "Enabled auto brightness" : "Disabled auto brightness")
      } else {
        sendText("Set brightness to \(value)%")
      }
      try? await Task.sleep(nanoseconds: 800_000_000) // 0.8 seconds
      sendText(" ")// clear screen
    }
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func updateGlassesDepth(_ value: Int) {
    self.dashboardDepth = value
    Task {
      await self.g1Manager?.RN_setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
      CoreCommsService.log("AOS: Set dashboard position to \(value)")
    }
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func updateGlassesHeight(_ value: Int) {
    self.dashboardHeight = value
    Task {
      await self.g1Manager?.RN_setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
      CoreCommsService.log("AOS: Set dashboard position to \(value)")
    }
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func enableSensing(_ enabled: Bool) {
    self.sensingEnabled = enabled
    // Update microphone state when sensing is toggled
    onMicrophoneStateChange(self.micEnabled)
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func enablePowerSavingMode(_ enabled: Bool) {
    self.powerSavingMode = enabled
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func enableAlwaysOnStatusBar(_ enabled: Bool) {
    self.alwaysOnStatusBar = enabled
    saveSettings()
    handleRequestStatus()// to update the UI
  }
  
  private func bypassVad(_ enabled: Bool) {
    self.bypassVad = enabled
    handleRequestStatus()// to update the UI
    saveSettings()
  }
  
  private func setMetricSystemEnabled(_ enabled: Bool) {
    self.metricSystemEnabled = enabled
    handleRequestStatus()
    saveSettings()
  }
  
  private func toggleUpdatingScreen(_ enabled: Bool) {
    CoreCommsService.log("AOS: Toggling updating screen: \(enabled)")
    if enabled {
      self.g1Manager?.RN_exit()
      self.isUpdatingScreen = true
    } else {
      self.isUpdatingScreen = false
    }
  }
  
  private func requestWifiScan() {
    CoreCommsService.log("AOS: Requesting wifi scan")
    self.liveManager?.requestWifiScan()
  }
  
  private func sendWifiCredentials(_ ssid: String, _ password: String) {
    CoreCommsService.log("AOS: Sending wifi credentials: \(ssid) \(password)")
    self.liveManager?.sendWifiCredentials(ssid, password: password)
  }
  
  private func showDashboard() {
    Task {
      await self.g1Manager?.RN_showDashboard()
    }
  }
  
  @objc func handleCommand(_ command: String) {
    CoreCommsService.log("AOS: Received command: \(command)")
    
    if !settingsLoaded {
      // Wait for settings to load with a timeout
      let timeout = DispatchTime.now() + .seconds(5) // 5 second timeout
      let result = settingsLoadedSemaphore.wait(timeout: timeout)
      
      if result == .timedOut {
        CoreCommsService.log("Warning: Settings load timed out, proceeding with default values")
      }
    }
    
    // Define command types enum
    enum CommandType: String {
      case setAuthSecretKey = "set_auth_secret_key"
      case requestStatus = "request_status"
      case connectWearable = "connect_wearable"
      case disconnectWearable = "disconnect_wearable"
      case searchForCompatibleDeviceNames = "search_for_compatible_device_names"
      case enableContextualDashboard = "enable_contextual_dashboard"
      case setPreferredMic = "set_preferred_mic"
      case ping = "ping"
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
      case setServerUrl = "set_server_url"
      case setMetricSystemEnabled = "set_metric_system_enabled"
      case toggleUpdatingScreen = "toggle_updating_screen"
      case showDashboard = "show_dashboard"
      case requestWifiScan = "request_wifi_scan"
      case sendWifiCredentials = "send_wifi_credentials"
      case simulateHeadPosition = "simulate_head_position"
      case simulateButtonPress = "simulate_button_press"
      case unknown
    }
    
    // Try to parse JSON
    guard let data = command.data(using: .utf8) else {
      CoreCommsService.log("AOS: Could not convert command string to data")
      return
    }
    
    do {
      if let jsonDict = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
        // Extract command type
        guard let commandString = jsonDict["command"] as? String else {
          CoreCommsService.log("AOS: Invalid command format: missing 'command' field")
          return
        }
        
        let commandType = CommandType(rawValue: commandString) ?? .unknown
        let params = jsonDict["params"] as? [String: Any]
        
        // Process based on command type
        switch commandType {
        case .setServerUrl:
          guard let params = params, let url = params["url"] as? String else {
            CoreCommsService.log("AOS: set_server_url invalid params")
            break
          }
          setServerUrl(url: url)
          break
        case .setAuthSecretKey:
          guard let params = params,
                let userId = params["userId"] as? String,
                let authSecretKey = params["authSecretKey"] as? String else {
            CoreCommsService.log("AOS: set_auth_secret_key invalid params")
            break
          }
          setAuthSecretKey(secretKey: authSecretKey, userId: userId)
        case .requestStatus:
          handleRequestStatus()
        case .connectWearable:
          guard let params = params, let modelName = params["model_name"] as? String, let deviceName = params["device_name"] as? String else {
            CoreCommsService.log("AOS: connect_wearable invalid params")
            handleConnectWearable(modelName: self.defaultWearable, deviceName: "")
            break
          }
          handleConnectWearable(modelName: modelName, deviceName: deviceName)
          break
        case .disconnectWearable:
          disconnectWearable()
          break
        case .forgetSmartGlasses:
          forgetSmartGlasses()
          break
          
        case .searchForCompatibleDeviceNames:
          guard let params = params, let modelName = params["model_name"] as? String else {
            CoreCommsService.log("AOS: search_for_compatible_device_names invalid params")
            break
          }
          handleSearchForCompatibleDeviceNames(modelName)
          break
          
        case .enableContextualDashboard:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: enable_contextual_dashboard invalid params")
            break
          }
          enableContextualDashboard(enabled)
          break
        case .setPreferredMic:
          guard let params = params, let mic = params["mic"] as? String else {
            CoreCommsService.log("AOS: set_preferred_mic invalid params")
            break
          }
          setPreferredMic(mic)
          break
        case .startApp:
          guard let params = params, let target = params["target"] as? String else {
            CoreCommsService.log("AOS: start_app invalid params")
            break
          }
          startApp(target)
          break
        case .stopApp:
          guard let params = params, let target = params["target"] as? String else {
            CoreCommsService.log("AOS: stop_app invalid params")
            break
          }
          stopApp(target)
          break
        case .updateGlassesHeadUpAngle:
          guard let params = params, let value = params["headUpAngle"] as? Int else {
            CoreCommsService.log("AOS: update_glasses_head_up_angle invalid params")
            break
          }
          updateGlassesHeadUpAngle(value)
          break
        case .updateGlassesBrightness:
          guard let params = params, let value = params["brightness"] as? Int, let autoBrightness = params["autoBrightness"] as? Bool else {
            CoreCommsService.log("AOS: update_glasses_brightness invalid params")
            break
          }
          updateGlassesBrightness(value, autoBrightness: autoBrightness)
          break
        case .updateGlassesHeight:
          guard let params = params, let value = params["height"] as? Int else {
            CoreCommsService.log("AOS: update_glasses_height invalid params")
            break
          }
          updateGlassesHeight(value)
          break
        case .showDashboard:
          showDashboard()
        case .updateGlassesDepth:
          guard let params = params, let value = params["depth"] as? Int else {
            CoreCommsService.log("AOS: update_glasses_depth invalid params")
            break
          }
          updateGlassesDepth(value)
        case .enableSensing:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: enable_sensing invalid params")
            break
          }
          enableSensing(enabled)
          break
        case .enablePowerSavingMode:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: enable_power_saving_mode invalid params")
            break
          }
          enablePowerSavingMode(enabled)
          break
        case .enableAlwaysOnStatusBar:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: enable_always_on_status_bar invalid params")
            break
          }
          enableAlwaysOnStatusBar(enabled)
          break
        case .bypassVad:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: bypass_vad invalid params")
            break
          }
          bypassVad(enabled)
          break
        case .bypassAudioEncoding:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: bypass_audio_encoding invalid params")
            break
          }
          self.bypassAudioEncoding = enabled
          break
        case .setMetricSystemEnabled:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: set_metric_system_enabled invalid params")
            break
          }
          setMetricSystemEnabled(enabled)
          break
        case .toggleUpdatingScreen:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            CoreCommsService.log("AOS: toggle_updating_screen invalid params")
            break
          }
          toggleUpdatingScreen(enabled)
          break
        case .requestWifiScan:
          requestWifiScan()
          break
        case .sendWifiCredentials:
          guard let params = params, let ssid = params["ssid"] as? String, let password = params["password"] as? String else {
            CoreCommsService.log("AOS: send_wifi_credentials invalid params")
            break
          }
          sendWifiCredentials(ssid, password)
          break
        case .simulateHeadPosition:
          guard let params = params, let position = params["position"] as? String else {
            CoreCommsService.log("AOS: simulate_head_position invalid params")
            break
          }
          // Send to server
          ServerComms.getInstance().sendHeadPosition(isUp: position == "up")
          // Trigger dashboard display locally
          sendCurrentState(position == "up")
          break
        case .simulateButtonPress:
          guard let params = params,
                let buttonId = params["buttonId"] as? String,
                let pressType = params["pressType"] as? String else {
            CoreCommsService.log("AOS: simulate_button_press invalid params")
            break
          }
          // Use existing sendButtonPress method
          ServerComms.getInstance().sendButtonPress(buttonId: buttonId, pressType: pressType)
          break
        case .unknown:
          CoreCommsService.log("AOS: Unknown command type: \(commandString)")
          handleRequestStatus()
        case .ping:
          break
        }
      }
    } catch {
      CoreCommsService.log("AOS: Error parsing JSON command: \(error.localizedDescription)")
    }
  }
  
  private func getGlassesHasMic() -> Bool {
    if self.defaultWearable.contains("G1") {
      return true
    }
    if self.defaultWearable.contains("Live") {
      return false
    }
    if self.defaultWearable.contains("Mach1") {
      return false
    }
    return false
  }
  
  private func handleRequestStatus() {
    
    // construct the status object:
    
    let g1Connected = self.g1Manager?.g1Ready ?? false
    let liveConnected = self.liveManager?.connectionState == .connected
    let mach1Connected = self.mach1Manager?.ready ?? false
    let simulatedConnected = self.defaultWearable == "Simulated Glasses"
    let isGlassesConnected = g1Connected || liveConnected || mach1Connected || simulatedConnected
    self.somethingConnected = isGlassesConnected
    
    // also referenced as glasses_info:
    var glassesSettings: [String: Any] = [:];
    var connectedGlasses: [String: Any] = [:];
    
    if isGlassesConnected {
      connectedGlasses = [
        "model_name": self.defaultWearable,
        "battery_level": self.batteryLevel,
        "glasses_app_version": self.liveManager?.glassesAppVersion ?? "",
        "glasses_build_number": self.liveManager?.glassesBuildNumber ?? "",
        "glasses_device_model": self.liveManager?.glassesDeviceModel ?? "",
        "glasses_android_version": self.liveManager?.glassesAndroidVersion ?? "",
        "glasses_ota_version_url": self.liveManager?.glassesOtaVersionUrl ?? "",
      ]
    }
    
    if (simulatedConnected) {
      connectedGlasses["model_name"] = self.defaultWearable
    }
    
    if g1Connected {
      connectedGlasses["case_removed"] = self.g1Manager?.caseRemoved ?? true
      connectedGlasses["case_open"] = self.g1Manager?.caseOpen ?? true
      connectedGlasses["case_charging"] = self.g1Manager?.caseCharging ?? false
      connectedGlasses["case_battery_level"] = self.g1Manager?.caseBatteryLevel ?? -1
      
      if let serialNumber = self.g1Manager?.glassesSerialNumber, !serialNumber.isEmpty {
        connectedGlasses["glasses_serial_number"] = serialNumber
        connectedGlasses["glasses_style"] = self.g1Manager?.glassesStyle ?? ""
        connectedGlasses["glasses_color"] = self.g1Manager?.glassesColor ?? ""
      }
    }
    
    if liveConnected {
      if let wifiSsid = self.liveManager?.wifiSsid, !wifiSsid.isEmpty {
        connectedGlasses["glasses_wifi_ssid"] = wifiSsid
        connectedGlasses["glasses_wifi_connected"] = self.glassesWifiConnected
      }
    }
    
    glassesSettings = [
      "brightness": self.brightness,
      "auto_brightness": self.autoBrightness,
      "dashboard_height": self.dashboardHeight,
      "dashboard_depth": self.dashboardDepth,
      "head_up_angle": self.headUpAngle,
    ]
    
    let cloudConnectionStatus = self.serverComms.isWebSocketConnected() ? "CONNECTED" : "DISCONNECTED"
    // let cloudConnectionStatus = self.serverComms.wsManager.status
    
    let coreInfo: [String: Any] = [
      "augmentos_core_version": "Unknown",
      "cloud_connection_status": cloudConnectionStatus,
      "default_wearable": self.defaultWearable as Any,
      "force_core_onboard_mic": self.useOnboardMic,
      "preferred_mic": self.preferredMic,
      // "is_searching": self.isSearching && !self.defaultWearable.isEmpty,
      "is_searching": self.isSearching,
      // only on if recording from glasses:
      // todo: this isn't robust:
      "is_mic_enabled_for_frontend": self.micEnabled && (self.preferredMic == "glasses") && self.somethingConnected,
      "sensing_enabled": self.sensingEnabled,
      "power_saving_mode": self.powerSavingMode,
      "always_on_status_bar": self.alwaysOnStatusBar,
      "bypass_vad_for_debugging": self.bypassVad,
      "bypass_audio_encoding_for_debugging": self.bypassAudioEncoding,
      "core_token": self.coreToken,
      "puck_connected": true,
      "metric_system_enabled": self.metricSystemEnabled,
    ]
    
    // hardcoded list of apps:
    var apps: [[String: Any]] = []
    
    // for app in self.cachedThirdPartyAppList {
    //   if app.name == "Notify" { continue }// TODO: ios notifications don't work so don't display the App
    //   let appDict = [
    //     "packageName": app.packageName,
    //     "name": app.name,
    //     "description": app.description,
    //     "webhookURL": app.webhookURL,
    //     "logoURL": app.logoURL,
    //     "is_running": app.isRunning,
    //     "is_foreground": false
    //   ] as [String: Any]
    //   // apps.append(appDict)
    // }
    
    let authObj: [String: Any] = [
      "core_token_owner": self.coreTokenOwner,
      //      "core_token_status":
    ]
    
    let statusObj: [String: Any] = [
      "connected_glasses": connectedGlasses,
      "glasses_settings": glassesSettings,
      "apps": apps,
      "core_info": coreInfo,
      "auth": authObj
    ]
    
    self.lastStatusObj = statusObj
    
    let wrapperObj: [String: Any] = ["status": statusObj]
    
    // CoreCommsService.log("wrapperStatusObj \(wrapperObj)")
    // must convert to string before sending:
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
      }
    } catch {
      CoreCommsService.log("AOS: Error converting to JSON: \(error)")
    }
    saveSettings()
  }
  
  private func playStartupSequence() {
    CoreCommsService.log("AOS: playStartupSequence()")
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
        self.sendText("                  /// MentraOS Connected \\\\\\")
        animationQueue.asyncAfter(deadline: .now() + 1.0) {
          self.sendText(" ")
        }
        return
      }
      
      // Display current animation frame
      let frameText = "                    \(arrowFrames[frameIndex]) MentraOS Booting \(arrowFrames[frameIndex])"
      self.sendText(frameText)
      
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
  
  private func handleDeviceReady() {
    // send to the server our battery status:
    self.serverComms.sendBatteryStatus(level: self.batteryLevel, charging: false)
    self.serverComms.sendGlassesConnectionState(modelName: self.defaultWearable, status: "CONNECTED")
    
    if self.defaultWearable.contains("Live") {
      handleLiveReady()
    } else if self.defaultWearable.contains("G1") {
      handleG1Ready()
    } else if self.defaultWearable.contains("Mach1") {
      handleMach1Ready()
    }
  }
  
  private func handleG1Ready() {
    self.isSearching = false
    self.defaultWearable = "Even Realities G1"
    self.handleRequestStatus()
    // load settings and send the animation:
    Task {
      
      // give the glasses some extra time to finish booting:
      try? await Task.sleep(nanoseconds: 1_000_000_000) // 3 seconds
      await self.g1Manager?.setSilentMode(false)// turn off silent mode
      await self.g1Manager?.getBatteryStatus()
      sendText("// BOOTING MENTRAOS")
      
      // send loaded settings to glasses:
      self.g1Manager?.RN_getBatteryStatus()
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
      sendText("// MENTRAOS CONNECTED")
      try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
      sendText(" ")// clear screen
      
      // enable the mic if it was last on:
      // CoreCommsService.log("ENABLING MIC STATE: \(self.micEnabled)")
      // onMicrophoneStateChange(self.micEnabled)
      self.handleRequestStatus()
    }
  }
  
  private func handleLiveReady() {
    CoreCommsService.log("AOS: Mentra Live device ready")
    self.isSearching = false
    self.defaultWearable = "Mentra Live"
    self.handleRequestStatus()
  }
  
  private func handleMach1Ready() {
    CoreCommsService.log("AOS: Mach1 device ready")
    self.isSearching = false
    self.defaultWearable = "Mentra Mach1"
    self.handleRequestStatus()
    
    Task {
      // Send startup message
      sendText("// MACH1 CONNECTED")
      try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
      sendText(" ")// clear screen
      
      self.handleRequestStatus()
    }
  }
  
  private func handleDeviceDisconnected() {
    CoreCommsService.log("AOS: Device disconnected")
    onMicrophoneStateChange(false)// technically shouldn't be necessary
    self.serverComms.sendGlassesConnectionState(modelName: self.defaultWearable, status: "DISCONNECTED")
    self.handleRequestStatus()
  }
  
  private func handleConnectWearable(modelName: String, deviceName: String) {
    CoreCommsService.log("AOS: Connecting to wearable: \(modelName)")
    
    if (modelName.contains("Virtual") || self.defaultWearable.contains("Virtual")) {
      // we don't need to search for a virtual device
      return
    }
    
    if (self.defaultWearable.isEmpty) {
      return
    }
    
    CoreCommsService.log("AOS: deviceName: \(deviceName) selfDeviceName: \(self.deviceName) defaultWearable: \(self.defaultWearable)")
    
    Task {
      disconnectWearable()
      
      try? await Task.sleep(nanoseconds: 100 * 1_000_000)// 100ms
      self.isSearching = true
      handleRequestStatus()// update the UI
      
      if (deviceName != "") {
        self.deviceName = deviceName
        saveSettings()
      }
      
      if (self.defaultWearable.contains("Live")) {
        initManager(self.defaultWearable)
        if (self.deviceName != "") {
          self.liveManager?.connectById(self.deviceName)
        } else {
          CoreCommsService.log("AOS: this shouldn't happen (we don't have a deviceName saved, connecting will fail if we aren't already paired)")
          self.defaultWearable = ""
          handleRequestStatus()
        }
      } else if (self.defaultWearable.contains("G1")) {
        initManager(self.defaultWearable)
        if self.deviceName != "" {
          CoreCommsService.log("AOS: pairing by id: \(self.deviceName)")
          self.g1Manager?.connectById(self.deviceName)
        } else {
          CoreCommsService.log("AOS: this shouldn't happen (we don't have a deviceName saved, connecting will fail if we aren't already paired)")
          self.defaultWearable = ""
          handleRequestStatus()
        }
      } else if (self.defaultWearable.contains("Mach1")) {
        initManager(self.defaultWearable)
        if self.deviceName != "" {
          CoreCommsService.log("AOS: pairing Mach1 by id: \(self.deviceName)")
          self.mach1Manager?.connectById(self.deviceName)
        } else {
          CoreCommsService.log("AOS: this shouldn't happen (we don't have a deviceName saved, connecting will fail if we aren't already paired)")
          self.defaultWearable = ""
          handleRequestStatus()
        }
      }
    }
    
    // wait for the g1's to be fully ready:
    //    connectTask?.cancel()
    //    connectTask = Task {
    //      while !(connectTask?.isCancelled ?? true) {
    //        CoreCommsService.log("checking if g1 is ready... \(self.g1Manager?.g1Ready ?? false)")
    //        CoreCommsService.log("leftReady \(self.g1Manager?.leftReady ?? false) rightReady \(self.g1Manager?.rightReady ?? false)")
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
  }
  
  internal func onStatusUpdate(_ status: [String: Any]) {
    // handle the settings from the server:
    // CoreCommsService.log("onStatusUpdate: \(status)")
    
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
    
    // update our settings with the new values:
    if let newPreferredMic = coreInfo?["preferred_mic"] as? String, newPreferredMic != self.preferredMic {
      setPreferredMic(newPreferredMic)
    }
    
    if let newHeadUpAngle = coreInfo?["head_up_angle"] as? Int, newHeadUpAngle != self.headUpAngle {
      updateGlassesHeadUpAngle(newHeadUpAngle)
    }
    
    if let newBrightness = glassesSettings?["brightness"] as? Int, newBrightness != self.brightness {
      updateGlassesBrightness(newBrightness, autoBrightness: false)
    }
    
    if let newDashboardHeight = glassesSettings?["dashboard_height"] as? Int, newDashboardHeight != self.dashboardHeight {
      updateGlassesHeight(newDashboardHeight)
    }
    
    if let newDashboardDepth = glassesSettings?["dashboard_depth"] as? Int, newDashboardDepth != self.dashboardDepth {
      updateGlassesDepth(newDashboardDepth)
    }
    
    if let newAutoBrightness = glassesSettings?["auto_brightness"] as? Bool, newAutoBrightness != self.autoBrightness {
      updateGlassesBrightness(self.brightness, autoBrightness: newAutoBrightness)
    }
    
    if let sensingEnabled = coreInfo?["sensing_enabled"] as? Bool, sensingEnabled != self.sensingEnabled {
      enableSensing(sensingEnabled)
    }
    
    if let powerSavingMode = coreInfo?["power_saving_mode"] as? Bool, powerSavingMode != self.powerSavingMode {
      enablePowerSavingMode(powerSavingMode)
    }
    
    if let newAlwaysOnStatusBar = coreInfo?["always_on_status_bar_enabled"] as? Bool, newAlwaysOnStatusBar != self.alwaysOnStatusBar {
      enableAlwaysOnStatusBar(newAlwaysOnStatusBar)
    }
    
    if let newBypassVad = coreInfo?["bypass_vad_for_debugging"] as? Bool, newBypassVad != self.bypassVad {
      bypassVad(newBypassVad)
    }
    
    if let newMetricSystemEnabled = coreInfo?["metric_system_enabled"] as? Bool, newMetricSystemEnabled != self.metricSystemEnabled {
      setMetricSystemEnabled(newMetricSystemEnabled)
    }
    
    if let newContextualDashboard = coreInfo?["contextual_dashboard_enabled"] as? Bool, newContextualDashboard != self.contextualDashboard {
      enableContextualDashboard(newContextualDashboard)
    }
    
    // get default wearable from core_info:
    if let newDefaultWearable = coreInfo?["default_wearable"] as? String, newDefaultWearable != self.defaultWearable {
      self.defaultWearable = newDefaultWearable
      saveSettings()
    }
    
    // get device
  }
  
  private func saveSettings() {
    
    // CoreCommsService.log("about to save settings, waiting for loaded settings first: \(settingsLoaded)")
    if !settingsLoaded {
      // Wait for settings to load with a timeout
      let timeout = DispatchTime.now() + .seconds(5) // 5 second timeout
      let result = settingsLoadedSemaphore.wait(timeout: timeout)
      
      if result == .timedOut {
        CoreCommsService.log("AOS: Warning: Settings load timed out, proceeding with default values")
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
    
    // Force immediate save (optional, as UserDefaults typically saves when appropriate)
    defaults.synchronize()
    
    // CoreCommsService.log("Settings saved: Default Wearable: \(defaultWearable ?? "None"), Preferred Mic: \(preferredMic), " +
    //       "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)")
    
    // CoreCommsService.log("Sending settings to server")
    self.serverComms.sendCoreStatus(status: self.lastStatusObj)
  }
  
  private func loadSettings() async {
    
    // set default settings here:
    sensingEnabled = true
    powerSavingMode = false
    contextualDashboard = true
    bypassVad = false
    preferredMic = "glasses"
    brightness = 50
    headUpAngle = 30
    metricSystemEnabled = false
    autoBrightness = true
    powerSavingMode = false
    dashboardHeight = 4
    dashboardDepth = 5
    alwaysOnStatusBar = false
    bypassAudioEncoding = false
    
    UserDefaults.standard.register(defaults: [SettingsKeys.sensingEnabled: true])
    UserDefaults.standard.register(defaults: [SettingsKeys.powerSavingMode: false])
    UserDefaults.standard.register(defaults: [SettingsKeys.contextualDashboard: true])
    UserDefaults.standard.register(defaults: [SettingsKeys.bypassVad: false])
    UserDefaults.standard.register(defaults: [SettingsKeys.preferredMic: "glasses"])
    UserDefaults.standard.register(defaults: [SettingsKeys.brightness: 50])
    UserDefaults.standard.register(defaults: [SettingsKeys.headUpAngle: 30])
    UserDefaults.standard.register(defaults: [SettingsKeys.metricSystemEnabled: false])
    UserDefaults.standard.register(defaults: [SettingsKeys.autoBrightness: true])
    
    let defaults = UserDefaults.standard
    
    // Load each setting with appropriate type handling
    defaultWearable = defaults.string(forKey: SettingsKeys.defaultWearable) ?? ""
    deviceName = defaults.string(forKey: SettingsKeys.deviceName) ?? ""
    preferredMic = defaults.string(forKey: SettingsKeys.preferredMic) ?? "glasses"
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
    
    // TODO: load settings from the server
    
    // Mark settings as loaded and signal completion
    self.settingsLoaded = true
    self.settingsLoadedSemaphore.signal()
    
    CoreCommsService.log("AOS: Settings loaded: Default Wearable: \(defaultWearable ?? "None"), Preferred Mic: \(preferredMic), " +
                         "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)")
  }
  
  // MARK: - Cleanup
  
  @objc func cleanup() {
    cancellables.removeAll()
    saveSettings()
  }
}
