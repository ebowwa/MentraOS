//
//  AOSManager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Foundation
import Combine
import CoreBluetooth
import UIKit
import React

// This class handles logic for managing devices and connections to AugmentOS servers
@objc(AOSManager) class AOSManager: NSObject, ServerCommsCallback {
  
  
  @objc public let g1Manager: ERG1Manager
  private let serverComms = ServerComms.getInstance()
  private var cancellables = Set<AnyCancellable>()
  private var cachedThirdPartyAppList: [ThirdPartyCloudApp]
  private var defaultWearable: String? = nil
  private var useOnboardMic = false;
  private var contextualDashboard = true;
  private var headUpAngle = 30;
  private var brightness = 50;
  private var autoLight: Bool = false;
  
  override init() {
    self.g1Manager = ERG1Manager()
    self.cachedThirdPartyAppList = []
    super.init()
    loadSettings()
    
    
    // Set up the ServerComms callback
    serverComms.setServerCommsCallback(self)
    
    // Set up voice data handling
    setupVoiceDataHandling()
    
    // calback to handle actions when the connectionState changes
    g1Manager.onConnectionStateChanged = { [weak self] in
      guard let self = self else { return }
      print("G1 glasses connection changed to: \(self.g1Manager.g1Ready ? "Connected" : "Disconnected")")
      self.onGlassesConnectionChange()
    }
  }
  
  // MARK: - Public Methods (for React Native)
  
  @objc func connectServer() {
    serverComms.connectWebSocket()
  }
  
  @objc func setCoreToken(_ coreToken: String) {
    serverComms.setAuthCredentials("", coreToken)
  }
  
  @objc func startApp(_ packageName: String) {
    serverComms.startApp(packageName: packageName)
  }
  
  @objc func stopApp(_ packageName: String) {
    serverComms.stopApp(packageName: packageName)
  }
  
  func onConnectionAck() {
    handleRequestStatus()
  }
  
  func onAppStateChange(_ apps: [ThirdPartyCloudApp]) {
    self.cachedThirdPartyAppList = apps
    handleRequestStatus()
  }
  
  func onConnectionError(_ error: String) {
    handleRequestStatus()
  }
  
  func onAuthError() {}
  
  func onGlassesConnectionChange() {
    self.handleRequestStatus()
  }
  
  // MARK: - Voice Data Handling
  
  private func setupVoiceDataHandling() {
    self.g1Manager.$voiceData.sink { [weak self] data in
      guard let self = self else { return }
      
      // Ensure we have enough data to process
      guard data.count > 2 else {
        print("Received invalid PCM data size: \(data.count)")
        return
      }
      
      // Skip the first 2 bytes which are command bytes
      let effectiveData = data.subdata(in: 2..<data.count)
      
      // Ensure we have valid PCM data
      guard effectiveData.count > 0 else {
        print("No PCM data after removing command bytes")
        return
      }
      
      // send LC3 data over the websocket:
      self.serverComms.sendAudioChunk(effectiveData)
      print("got audio data of size: \(effectiveData.count)")
      
//      TODO: ios PCM / VAD
//      let pcmConverter = PcmConverter()
//      let pcmData = pcmConverter.decode(effectiveData)
      
//      if pcmData.count > 0 {
//        print("Got PCM data of size: \(pcmData.count)")
//      } else {
//        print("PCM conversion resulted in empty data")
//      }
    }
    .store(in: &cancellables)
    
    //    // Set up speech recognition callback
    //    serverComms.setSpeechRecCallback { [weak self] speechJson in
    //      // Handle speech recognition results if needed
    //      print("Received speech recognition result: \(speechJson)")
    //
    //      // Forward to React Native if needed
    //      // self?.onSpeechResult?(["result": speechJson])
    //    }
  }
  
  // MARK: - ServerCommsCallback Implementation
  
//  func onAppStateChange(_ apps: [ThirdPartyCloudApp]) {
//    // Convert apps to dictionaries for React Native
//    let appDicts = apps.map { app -> [String: Any] in
//      return [
//        "packageName": app.packageName,
//        "name": app.name,
//        "description": app.description,
//        "webhookURL": app.webhookURL,
//        "logoURL": app.logoURL,
//        "isRunning": app.isRunning
//      ]
//    }
//    
//    // React Native callback
//    onAppStateChange?(["apps": appDicts])
//  }
  
  func onMicrophoneStateChange(_ isEnabled: Bool) {
    // Handle microphone state change if needed
    Task {
      await self.g1Manager.setMicEnabled(enabled: isEnabled)
    }
  }
  
  //  func onDashboardDisplayEvent(_ event: [String: Any]) {
  //    print("got dashboard display event")
  ////    onDisplayEvent?(["event": event, "type": "dashboard"])
  //    print(event)
  ////    Task {
  ////      await self.g1Manager.sendText(text: "\(event)")
  ////    }
  //  }
  
  func onDisplayEvent(_ event: [String: Any]) {
    //    print("displayEvent \(event)", event)
    
    self.g1Manager.handleDisplayEvent(event)
  }
  
  func onRequestSingle(_ dataType: String) {
    // Handle single data request
    if dataType == "battery" {
      // Send battery status if needed
    }
    // TODO:
    handleRequestStatus()
  }

  func handleSearchForCompatibleDeviceNames(_ modelName: String) {
    print("Searching for compatible device names for: \(modelName)")
    // TODO: Implement search for compatible device names
    // for now, just trigger a scan for devices on the g1Manager:
    self.g1Manager.RN_startScan()
  }
  
  @objc func handleCommand(_ command: String) {
    print("Received command: \(command)")
    
    // Define command types enum
    enum CommandType: String {
      case setAuthSecretKey = "set_auth_secret_key"
      case requestStatus = "request_status"
      case connectWearable = "connect_wearable"
      case connectDefaultWearable = "connect_default_wearable"
      case disconnectWearable = "disconnect_wearable"
      case searchForCompatibleDeviceNames = "search_for_compatible_device_names"
      case enableContextualDashboard = "enable_contextual_dashboard"
      case forceCoreOnboardMic = "force_core_onboard_mic"
      case ping = "ping"
      case forgetSmartGlasses = "forget_smart_glasses"
      case startApp = "start_app"
      case stopApp = "stop_app"
      case updateGlassesHeadUpAngle = "update_glasses_headUp_angle"
      case updateGlassesBrightness = "update_glasses_brightness"
      case unknown
    }
    
    // Try to parse JSON
    guard let data = command.data(using: .utf8) else {
      print("Could not convert command string to data")
      return
    }
    
    do {
      if let jsonDict = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
        // Extract command type
        guard let commandString = jsonDict["command"] as? String else {
          print("Invalid command format: missing 'command' field")
          return
        }
        
        let commandType = CommandType(rawValue: commandString) ?? .unknown
        let params = jsonDict["params"] as? [String: Any]
        
        // Process based on command type
        switch commandType {
        case .setAuthSecretKey:
          if let params = params,
             let userId = params["userId"] as? String,
             let authSecretKey = params["authSecretKey"] as? String {
            handleSetAuthSecretKey(userId: userId, authSecretKey: authSecretKey)
          } else {
            print("Invalid params for set_auth_secret_key")
          }
          
        case .requestStatus:
          handleRequestStatus()
          
        case .connectWearable:
          guard let params = params else {
            print("connect_wearable invalid params")
            break
          }
          
          if let modelName = params["model_name"] as? String, let deviceName = params["device_name"] as? String {
            handleConnectWearable(modelName: modelName, deviceName: deviceName)
          } else {
            print("Invalid params for connect_wearable")
          }
        
        case .disconnectWearable:
          handleDisconnectWearable()
          break
          
        case .forgetSmartGlasses:
          handleDisconnectWearable()
          self.defaultWearable = nil
          self.g1Manager.DEVICE_SEARCH_ID = ""
          handleRequestStatus()
          break
          
//        case .connectDefaultWearable:
//          handleConnectDefaultWearable()

       case .searchForCompatibleDeviceNames:
         if let params = params, let modelName = params["model_name"] as? String {
           print("Searching for compatible device names for: \(modelName)")
           handleSearchForCompatibleDeviceNames(modelName)
         } else {
           print("Invalid params for search_for_compatible_device_names")
         }

        case .enableContextualDashboard:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("invalid_dashboard_enabled_params")
            break
          }
          self.contextualDashboard = enabled
          saveSettings()
          break
        case .forceCoreOnboardMic:
          guard let params = params, let enabled = params["enabled"] as? Bool else {
            print("invalid_onboard_mic_params")
            break
          }
          self.useOnboardMic = enabled
          saveSettings()
          break
        case .startApp:
          if let params = params, let target = params["target"] as? String {
            print("Starting app: \(target)")
            serverComms.startApp(packageName: target)
          } else {
            print("Invalid params for start_app")
          }
          
          handleRequestStatus()
        case .stopApp:
          if let params = params, let target = params["target"] as? String {
            print("Stopping app: \(target)")
            serverComms.stopApp(packageName: target)
          } else {
            print("Invalid params for stop_app")
          }
          
        case .unknown:
          print("Unknown command type: \(commandString)")
//        case .connectDefaultWearable:
//          break
        case .ping:
          break
        case .updateGlassesHeadUpAngle:
          guard let params = params, let value = params["headUpAngle"] as? Int else {
            print("invalid_headup_angle_params")
            break
          }
          self.headUpAngle = value
          self.g1Manager.RN_setHeadUpAngle(value)
          saveSettings()
          break
        case .updateGlassesBrightness:
          guard let params = params, let value = params["brightness"] as? Int, let autoLight = params["autoLight"] as? Bool else {
            print("invalid_dashboard_enabled_params")
            break
          }
          self.brightness = value
          self.autoLight = autoLight
          self.g1Manager.RN_setBrightness(value, autoMode: autoLight)
          saveSettings()
          break
        case .connectDefaultWearable:
          // TODO: ios
          break
        }
      }
    } catch {
      print("Error parsing JSON command: \(error.localizedDescription)")
    }
  }
  
  // Handler methods for each command type
  private func handleSetAuthSecretKey(userId: String, authSecretKey: String) {
    print("Setting auth secret key for user: \(userId)")
    serverComms.setAuthCredentials(userId, authSecretKey)
    print("Connecting to AugmentOS...")
    serverComms.connectWebSocket()
  }
  
  private func handleDisconnectWearable() {
    self.g1Manager.disconnect()
    handleRequestStatus()
  }
  
  private func handleRequestStatus() {
    // construct the status object:
    
    let isGlassesConnected = self.g1Manager.g1Ready
    var connectedGlasses: [String: Any] = [:];
    
    if isGlassesConnected {
      connectedGlasses = [
        "model_name": "Even Realities G1",
        "battery_life": self.g1Manager.batteryLevel,
        "headUp_angle": self.headUpAngle,
        "brightness": self.brightness
      ]
      self.defaultWearable = "Even Realities G1"
    }
    
    let cloudConnectionStatus = self.serverComms.isWebSocketConnected() ? "CONNECTED" : "DISCONNECTED"
    
    let coreInfo: [String: Any] = [
      "augmentos_core_version": "Unknown",
      "cloud_connection_status": cloudConnectionStatus,
      "default_wearable": self.defaultWearable as Any
    ]
    
    // hardcoded list of apps:
    var apps: [[String: Any]] = [
//        [
//            "host": "mira",
//            "packageName": "com.augmentos.miraai",
//            "name": "Mira AI",
//            "description": "The AugmentOS AI Assistant. Say 'Hey Mira...' followed by a question or command."
//        ],
//        [
//            "host": "merge",
//            "packageName": "com.mentra.merge",
//            "name": "Merge",
//            "description": "Proactive AI that helps you during conversations. Turn it on, have a conversation, and let Merge agents enhance your convo."
//        ],
//        [
//            "host": "live-translation",
//            "packageName": "com.augmentos.live-translation",
//            "name": "Live Translation",
//            "description": "Live language translation."
//        ],
//        [
//            "host": "live-captions",
//            "packageName": "com.augmentos.livecaptions",
//            "name": "Live Captions",
//            "description": "Live closed captions."
//        ]
    ]
    
    for tpa in self.cachedThirdPartyAppList {
        let tpaDict = [
            "packageName": tpa.packageName,
            "name": tpa.name,
            "description": tpa.description,
            "webhookURL": tpa.webhookURL,
            "logoURL": tpa.logoURL,
            "is_running": tpa.isRunning,
            "is_foreground": false
        ] as [String: Any]
        
        apps.append(tpaDict)
    }

    
    let statusObj: [String: Any] = [
      "connected_glasses": connectedGlasses,
      "apps": apps,
      "core_info": coreInfo,
    ]
    let wrapperObj: [String: Any] = ["status": statusObj]
//    print("wrapperStatusObj \(wrapperObj)")
    // must convert to string before sending:
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: wrapperObj, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        RNEventEmitter.emitter.sendEvent(withName: "CoreMessageIntentEvent", body: jsonString)
      }
    } catch {
      print("Error converting to JSON: \(error)")
    }
    saveSettings()
  }
  
  var readinessCheckTimer: Timer?
  
  private func handleConnectWearable(modelName: String, deviceName: String) {
    print("Connecting to wearable: \(modelName)")
    
////    // every few seconds, if the g1Ready property is true, cancel the timer and send a status update:
//    let readiness = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { timer in
//      print("checking if g1 is ready...")
//      if self.g1Manager.g1Ready {
//        print("g1 is ready! Sending status update...")
//        self.handleRequestStatus()
//        timer.invalidate()
//      }
//    }
//    
//    // Create timer and store reference
////    self.readinessCheckTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] timer in
////        print("checking if g1 is ready...")
////        guard let self = self else {
////            print("self no longer exists, invalidating timer")
////            timer.invalidate()
////            return
////        }
////        
////        if self.g1Manager.g1Ready {
////            print("g1 is ready! Sending status update...")
////            self.handleRequestStatus()
////            timer.invalidate()
////            self.readinessCheckTimer = nil
////        }
////    }
//    
//    let timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { timer in
//        // Your code to execute every 5 seconds
//        print("This will run every 5 seconds")
//    }
    
    // just g1's for now:
    Task {
      print("start connecting...")
      if (deviceName != "") {
        self.g1Manager.RN_pairById(deviceName)
      } else {
        // TODO: ios this logic needs some cleaning + the searchID needs to be saved as our "remembered" device somewhere (sharedPreferences / ios equiv.)
        // only connect to glasses we've paired with before:
//        self.g1Manager.RN_setSearchId("_")
        self.g1Manager.RN_startScan()
      }
    }
    
    Task {
        while !Task.isCancelled {
            print("checking if g1 is ready...")
            if self.g1Manager.g1Ready {
              self.defaultWearable = "Even Realities G1"
              self.handleRequestStatus()
              break
            } else {
              // todo: not the cleanest solution here
              self.g1Manager.RN_startScan()
            }
            
            try? await Task.sleep(nanoseconds: 5_000_000_000) // 5 seconds
        }
    }
  }
  
  private func handleConnectDefaultWearable() {
    print("Connecting to default wearable")
    // TODO: Implement default connection logic
    // Example: g1Manager.connectToDefaultDevice()
  }
  
  
  // MARK: - Settings Management

  private enum SettingsKeys {
    static let defaultWearable = "defaultWearable"
    static let useOnboardMic = "useBoardMic"
    static let contextualDashboard = "contextualDashboard"
    static let headUpAngle = "headUpAngle"
    static let brightness = "brightness"
  }

  private func saveSettings() {
    let defaults = UserDefaults.standard
    
    // Save each setting with its corresponding key
    defaults.set(defaultWearable, forKey: SettingsKeys.defaultWearable)
    defaults.set(useOnboardMic, forKey: SettingsKeys.useOnboardMic)
    defaults.set(contextualDashboard, forKey: SettingsKeys.contextualDashboard)
    defaults.set(headUpAngle, forKey: SettingsKeys.headUpAngle)
    defaults.set(brightness, forKey: SettingsKeys.brightness)
    
    // Force immediate save (optional, as UserDefaults typically saves when appropriate)
    defaults.synchronize()
    
    print("Settings saved: Default Wearable: \(defaultWearable ?? "None"), Use Onboard Mic: \(useOnboardMic), " +
          "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)")
  }

  private func loadSettings() {
    let defaults = UserDefaults.standard
    
    // Load each setting with appropriate type handling
    defaultWearable = defaults.string(forKey: SettingsKeys.defaultWearable)
    useOnboardMic = defaults.bool(forKey: SettingsKeys.useOnboardMic)
    contextualDashboard = defaults.bool(forKey: SettingsKeys.contextualDashboard)
    
    // For numeric values, provide the default if the key doesn't exist
    if defaults.object(forKey: SettingsKeys.headUpAngle) != nil {
      headUpAngle = defaults.integer(forKey: SettingsKeys.headUpAngle)
    }
    
    if defaults.object(forKey: SettingsKeys.brightness) != nil {
      brightness = defaults.integer(forKey: SettingsKeys.brightness)
    }
    
    print("Settings loaded: Default Wearable: \(defaultWearable ?? "None"), Use Device Mic: \(useOnboardMic), " +
          "Contextual Dashboard: \(contextualDashboard), Head Up Angle: \(headUpAngle), Brightness: \(brightness)")
  }
  
  // MARK: - Cleanup
  
  @objc func cleanup() {
    cancellables.removeAll()
    saveSettings()
  }
}
