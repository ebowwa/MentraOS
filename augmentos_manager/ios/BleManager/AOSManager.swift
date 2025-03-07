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
  
  // Callback properties for React Native bridge
  @objc var onConnectionStatusChange: RCTDirectEventBlock?
  @objc var onAppStateChange: RCTDirectEventBlock?
  @objc var onDisplayEvent: RCTDirectEventBlock?
  
  override init() {
    self.g1Manager = ERG1Manager()
    super.init()
    
    // Set up the ServerComms callback
    serverComms.setServerCommsCallback(self)
    
    // Set up voice data handling
    setupVoiceDataHandling()
  }
  
  // MARK: - Public Methods (for React Native)
  
  @objc func connectToServer() {
    serverComms.connectWebSocket()
  }
  
  @objc func setCoreToken(_ coreToken: String) {
    serverComms.setAuthCredentials("", coreToken)
  }
  
  @objc func disconnectFromServer() {
    serverComms.disconnectWebSocket()
  }
  
  @objc func startApp(_ packageName: String) {
    serverComms.startApp(packageName: packageName)
  }
  
  @objc func stopApp(_ packageName: String) {
    serverComms.stopApp(packageName: packageName)
  }
  
  @objc func sendCommandToCore(_ command: String) {
    //
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
  
  func onConnectionAck() {
    // React Native callback
    onConnectionStatusChange?(["status": "connected"])
  }
  
  func onAppStateChange(_ apps: [ThirdPartyCloudApp]) {
    // Convert apps to dictionaries for React Native
    let appDicts = apps.map { app -> [String: Any] in
      return [
        "packageName": app.packageName,
        "name": app.name,
        "description": app.description,
        "webhookURL": app.webhookURL,
        "logoURL": app.logoURL,
        "isRunning": app.isRunning
      ]
    }
    
    // React Native callback
    onAppStateChange?(["apps": appDicts])
  }
  
  func onConnectionError(_ error: String) {
    onConnectionStatusChange?(["status": "error", "message": error])
  }
  
  func onAuthError() {
    onConnectionStatusChange?(["status": "authError"])
  }
  
  func onMicrophoneStateChange(_ isEnabled: Bool) {
    // Handle microphone state change if needed
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
  }
  
  func onConnectionStatusChange(_ status: WebSocketStatus) {
    var statusString = "unknown"
    
    switch status {
    case .connected:
      statusString = "connected"
    case .connecting:
      statusString = "connecting"
    case .disconnected:
      statusString = "disconnected"
    case .error:
      statusString = "error"
    }
    
    onConnectionStatusChange?(["status": statusString])
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
      case searchForCompatibleDeviceNames = "search_for_compatible_device_names"
      case enableContextualDashboard = "enable_contextual_dashboard"
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
          if let params = params, let target = params["target"] as? String {
            handleConnectWearable(deviceId: target)
          } else {
            print("Invalid params for connect_wearable")
          }
          
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
          if let params = params, let enabled = params["enabled"] as? Bool {
//            handleEnableContextualDashboard(enabled: enabled)
          } else {
            print("Invalid params for enable_contextual_dashboard")
          }

        case .startApp:
          if let params = params, let target = params["target"] as? String {
            print("Starting app: \(target)")
            serverComms.startApp(packageName: target)
          } else {
            print("Invalid params for start_app")
          }
          
        case .stopApp:
          if let params = params, let target = params["target"] as? String {
            print("Stopping app: \(target)")
            serverComms.stopApp(packageName: target)
          } else {
            print("Invalid params for stop_app")
          }
          
        case .unknown:
          print("Unknown command type: \(commandString)")
        case .connectDefaultWearable:
          break
        case .ping:
          break
        case .forgetSmartGlasses:
          break
        case .updateGlassesHeadUpAngle:
          break
        case .updateGlassesBrightness:
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
  }
  
  private func handleRequestStatus() {
    print("Requesting status")
    // TODO: Implement status request logic
    // Example: let status = g1Manager.getStatus(); serverComms.sendStatusUpdate(status)
  }
  
  private func handleConnectWearable(deviceId: String) {
    print("Connecting to wearable: \(deviceId)")
    // TODO: Implement connection logic
    // Example: g1Manager.connectToDevice(deviceId)
  }
  
  private func handleConnectDefaultWearable() {
    print("Connecting to default wearable")
    // TODO: Implement default connection logic
    // Example: g1Manager.connectToDefaultDevice()
  }
  
  
  // MARK: - Cleanup
  
  @objc func cleanup() {
    serverComms.cleanup()
    cancellables.removeAll()
  }
}
