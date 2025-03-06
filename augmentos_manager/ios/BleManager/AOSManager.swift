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
  
  @objc func connectToServer(_ coreToken: String) {
    serverComms.connectWebSocket(coreToken: coreToken)
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
      
      let pcmConverter = PcmConverter()
      let pcmData = pcmConverter.decode(effectiveData)
      
      // send LC3 data over the websocket:
      self.serverComms.sendAudioChunk(effectiveData)
      
      if pcmData.count > 0 {
          print("Got PCM data of size: \(pcmData.count)")
      } else {
          print("PCM conversion resulted in empty data")
      }
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
  
  func onDashboardDisplayEvent(_ event: [String: Any]) {
    onDisplayEvent?(["event": event, "type": "dashboard"])
  }
  
  func onDisplayEvent(_ event: [String: Any]) {
    onDisplayEvent?(["event": event, "type": "normal"])
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
  
  // MARK: - Cleanup
  
  @objc func cleanup() {
    serverComms.cleanup()
    cancellables.removeAll()
  }
}
