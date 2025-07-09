//
//  MentraLiveDevice.swift
//  AOS
//
//  Created by Matthew Fosse on 7/3/25.
//


//
// MentraLiveManager.swift
// AugmentOS_Manager
//
// Converted from MentraLiveSGC.java
//

import Combine
import CoreBluetooth
import Foundation
import UIKit
import React

// MARK: - Supporting Types

struct MentraLiveDevice {
  let name: String
  let address: String
}

// MARK: - CBCentralManagerDelegate

extension MentraLiveManager: CBCentralManagerDelegate {
  
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      CoreCommsService.log("Bluetooth powered on")
      // If we have a saved device, try to reconnect
      if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME), !savedDeviceName.isEmpty {
        startScan()
      }
      
    case .poweredOff:
      CoreCommsService.log("Bluetooth is powered off")
      connectionState = .disconnected
      
    case .unauthorized:
      CoreCommsService.log("Bluetooth is unauthorized")
      connectionState = .disconnected
      
    case .unsupported:
      CoreCommsService.log("Bluetooth is unsupported")
      connectionState = .disconnected
      
    default:
      CoreCommsService.log("Bluetooth state: \(central.state.rawValue)")
    }
  }
  
  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
    guard let name = peripheral.name else { return }
    
    // Check for compatible device names
    if name == "Xy_A" || name.hasPrefix("XyBLE_") || name.hasPrefix("MENTRA_LIVE_BLE") || name.hasPrefix("MENTRA_LIVE_BT") {
      let glassType = name == "Xy_A" ? "Standard" : "K900"
      CoreCommsService.log("Found compatible \(glassType) glasses device: \(name)")
      
      // Store the peripheral
      discoveredPeripherals[name] = peripheral
      
      emitDiscoveredDevice(name)
      
      // Check if this is the device we want to connect to
      if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME),
         savedDeviceName == name {
        CoreCommsService.log("Found our remembered device by name, connecting: \(name)")
        stopScan()
        connectToDevice(peripheral)
      }
    }
  }
  
  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    CoreCommsService.log("Connected to GATT server, discovering services...")
    
    stopConnectionTimeout()
    isConnecting = false
    connectedPeripheral = peripheral
    
    // Save device name for future reconnection
    if let name = peripheral.name {
      UserDefaults.standard.set(name, forKey: PREFS_DEVICE_NAME)
      CoreCommsService.log("Saved device name for future reconnection: \(name)")
    }
    
    // Discover services
    peripheral.discoverServices([SERVICE_UUID])
    
    // Reset reconnect attempts
    reconnectAttempts = 0
  }
  
  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    CoreCommsService.log("Disconnected from GATT server")
    
    isConnecting = false
    connectedPeripheral = nil
    glassesReady = false
    connectionState = .disconnected
    
    stopAllTimers()
    
    // Clean up characteristics
    txCharacteristic = nil
    rxCharacteristic = nil
    
    // Attempt reconnection if not killed
    if !isKilled {
      handleReconnection()
    }
  }
  
  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    CoreCommsService.log("Failed to connect to peripheral: \(error?.localizedDescription ?? "Unknown error")")
    
    stopConnectionTimeout()
    isConnecting = false
    connectionState = .disconnected
    
    if !isKilled {
      handleReconnection()
    }
  }
}

// MARK: - CBPeripheralDelegate

extension MentraLiveManager: CBPeripheralDelegate {
  
  func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
    if let error = error {
      CoreCommsService.log("Error reading RSSI: \(error.localizedDescription)")
    } else {
      CoreCommsService.log("RSSI: \(RSSI)")
    }
  }
  
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error = error {
      CoreCommsService.log("Error discovering services: \(error.localizedDescription)")
      centralManager?.cancelPeripheralConnection(peripheral)
      return
    }
    
    guard let services = peripheral.services else { return }
    
    for service in services where service.uuid == SERVICE_UUID {
      CoreCommsService.log("Found UART service, discovering characteristics...")
      peripheral.discoverCharacteristics([TX_CHAR_UUID, RX_CHAR_UUID], for: service)
    }
  }
  
  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    if let error = error {
      CoreCommsService.log("Error discovering characteristics: \(error.localizedDescription)")
      centralManager?.cancelPeripheralConnection(peripheral)
      return
    }
    
    guard let characteristics = service.characteristics else { return }
    
    for characteristic in characteristics {
      if characteristic.uuid == TX_CHAR_UUID {
        txCharacteristic = characteristic
        CoreCommsService.log("✅ Found TX characteristic")
      } else if characteristic.uuid == RX_CHAR_UUID {
        rxCharacteristic = characteristic
        CoreCommsService.log("✅ Found RX characteristic")
      }
    }
    
    // Check if we have both characteristics
    if let tx = txCharacteristic, let rx = rxCharacteristic {
      CoreCommsService.log("✅ Both TX and RX characteristics found - BLE connection ready")
      CoreCommsService.log("🔄 Waiting for glasses SOC to become ready...")
      
      // Keep state as connecting until glasses are ready
      connectionState = .connecting
      
      // Request MTU size
      peripheral.readRSSI()
      let mtuSize = peripheral.maximumWriteValueLength(for: .withResponse)
      CoreCommsService.log("Current MTU size: \(mtuSize + 3) bytes")
      
      // Enable notifications on RX characteristic
      peripheral.setNotifyValue(true, for: rx)
      
      // Start readiness check loop
      startReadinessCheckLoop()
    } else {
      CoreCommsService.log("Required BLE characteristics not found")
      if txCharacteristic == nil {
        CoreCommsService.log("TX characteristic not found")
      }
      if rxCharacteristic == nil {
        CoreCommsService.log("RX characteristic not found")
      }
      centralManager?.cancelPeripheralConnection(peripheral)
    }
  }
  
  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    
    CoreCommsService.log("GOT CHARACTERISTIC UPDATE @@@@@@@@@@@@@@@@@@@@@")
    if let error = error {
      CoreCommsService.log("Error updating value for characteristic: \(error.localizedDescription)")
      return
    }
    
    guard let data = characteristic.value else {
      CoreCommsService.log("Characteristic value is nil")
      return
    }
    
    let threadId = Thread.current.hash
    let uuid = characteristic.uuid
    
    CoreCommsService.log("Thread-\(threadId): 🎉 didUpdateValueFor CALLBACK TRIGGERED! Characteristic: \(uuid)")
    
    if uuid == RX_CHAR_UUID {
      CoreCommsService.log("Thread-\(threadId): 🎯 RECEIVED DATA ON RX CHARACTERISTIC (Peripheral's TX)")
    } else if uuid == TX_CHAR_UUID {
      CoreCommsService.log("Thread-\(threadId): 🎯 RECEIVED DATA ON TX CHARACTERISTIC (Peripheral's RX)")
    }
    
    CoreCommsService.log("Thread-\(threadId): 🔍 Processing received data - \(data.count) bytes")
    
    processReceivedData(data)
  }
  
  func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      CoreCommsService.log("Error writing characteristic: \(error.localizedDescription)")
    } else {
      CoreCommsService.log("Characteristic write successful")
    }
  }
  
  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      CoreCommsService.log("Error updating notification state: \(error.localizedDescription)")
    } else {
      CoreCommsService.log("Notification state updated for \(characteristic.uuid): \(characteristic.isNotifying ? "ON" : "OFF")")
      
      if characteristic.uuid == RX_CHAR_UUID && characteristic.isNotifying {
        CoreCommsService.log("🔔 Ready to receive data via notifications")
      }
    }
  }
  
  func peripheralDidUpdateRSSI(_ peripheral: CBPeripheral, error: Error?) {
    if let error = error {
      CoreCommsService.log("Error reading RSSI: \(error.localizedDescription)")
    } else {
      CoreCommsService.log("RSSI: \(peripheral.readRSSI())")
    }
  }
}

// MARK: - Display Method Stubs (Mentra Live has no display)

extension MentraLiveManager {
  
  @objc func RN_setFontSize(_ fontSize: String) {
    CoreCommsService.log("[STUB] Device has no display. Cannot set font size: \(fontSize)")
  }
  
  @objc func RN_displayTextWall(_ text: String) {
    CoreCommsService.log("[STUB] Device has no display. Text wall would show: \(text)")
  }
  
  @objc func RN_displayBitmap(_ bitmap: UIImage) {
    CoreCommsService.log("[STUB] Device has no display. Cannot display bitmap.")
  }
  
  @objc func RN_displayTextLine(_ text: String) {
    CoreCommsService.log("[STUB] Device has no display. Text line would show: \(text)")
  }
  
  @objc func RN_displayReferenceCardSimple(_ title: String, body: String) {
    CoreCommsService.log("[STUB] Device has no display. Reference card would show: \(title)")
  }
  
  @objc func RN_updateBrightness(_ brightness: Int) {
    CoreCommsService.log("[STUB] Device has no display. Cannot set brightness: \(brightness)")
  }
  
  @objc func RN_showHomeScreen() {
    CoreCommsService.log("[STUB] Device has no display. Cannot show home screen.")
  }
  
  @objc func RN_blankScreen() {
    CoreCommsService.log("[STUB] Device has no display. Cannot blank screen.")
  }
  
  @objc func RN_displayRowsCard(_ rowStrings: [String]) {
    CoreCommsService.log("[STUB] Device has no display. Cannot display rows card with \(rowStrings.count) rows")
  }
  
  @objc func RN_displayDoubleTextWall(_ textTop: String, textBottom: String) {
    CoreCommsService.log("[STUB] Device has no display. Double text wall would show: \(textTop) / \(textBottom)")
  }
  
  @objc func RN_displayBulletList(_ title: String, bullets: [String]) {
    CoreCommsService.log("[STUB] Device has no display. Bullet list would show: \(title) with \(bullets.count) items")
  }
  
  @objc func RN_displayCustomContent(_ json: String) {
    CoreCommsService.log("[STUB] Device has no display. Cannot display custom content")
  }
}

enum MentraLiveError: Error {
  case bluetoothNotAvailable
  case bluetoothNotPowered
  case connectionTimeout
  case missingCharacteristics
  case missingPermissions
}

enum MentraLiveConnectionState {
  case disconnected
  case connecting
  case connected
}

// Type aliases for compatibility
typealias JSONObject = [String: Any]

// MARK: - Main Manager Class

@objc(MentraLiveManager) class MentraLiveManager: NSObject {
  
  // MARK: - Constants
  
  // BLE UUIDs
  private let SERVICE_UUID = CBUUID(string: "00004860-0000-1000-8000-00805f9b34fb")
  private let RX_CHAR_UUID = CBUUID(string: "000070FF-0000-1000-8000-00805f9b34fb") // Central receives on peripheral's TX
  private let TX_CHAR_UUID = CBUUID(string: "000071FF-0000-1000-8000-00805f9b34fb") // Central transmits on peripheral's RX
  
  // Timing Constants
  private let BASE_RECONNECT_DELAY_MS: UInt64 = 1_000_000_000 // 1 second in nanoseconds
  private let MAX_RECONNECT_DELAY_MS: UInt64 = 30_000_000_000 // 30 seconds
  private let MAX_RECONNECT_ATTEMPTS = 10
  private let KEEP_ALIVE_INTERVAL_MS: UInt64 = 5_000_000_000 // 5 seconds
  private let CONNECTION_TIMEOUT_MS: UInt64 = 100_000_000_000 // 100 seconds
  private let HEARTBEAT_INTERVAL_MS: TimeInterval = 30.0 // 30 seconds
  private let BATTERY_REQUEST_EVERY_N_HEARTBEATS = 10
  private let MIN_SEND_DELAY_MS: UInt64 = 160_000_000 // 160ms in nanoseconds
  private let READINESS_CHECK_INTERVAL_MS: TimeInterval = 2.5 // 2.5 seconds
  
  // Device Settings Keys
  private let PREFS_DEVICE_NAME = "MentraLiveLastConnectedDeviceName"
  private let KEY_CORE_TOKEN = "core_token"
  
  // MARK: - Properties
  
  @objc static func requiresMainQueueSetup() -> Bool { return true }
  
  // Connection State
  private var _connectionState: MentraLiveConnectionState = .disconnected
  public var connectionState: MentraLiveConnectionState {
    get { return _connectionState }
    set {
      let oldValue = _connectionState
      _connectionState = newValue
      if oldValue != newValue {
        onConnectionStateChanged?()
      }
    }
  }
  
  var onConnectionStateChanged: (() -> Void)?
  
  // BLE Properties
  private var centralManager: CBCentralManager?
  private var connectedPeripheral: CBPeripheral?
  private var txCharacteristic: CBCharacteristic?
  private var rxCharacteristic: CBCharacteristic?
  private var currentMtu: Int = 23 // Default BLE MTU
  
  // State Tracking
  private var isScanning = false
  private var isConnecting = false
  private var isKilled = false
  public var glassesReady = false
  private var reconnectAttempts = 0
  
  public var ready: Bool {
    get { return glassesReady }
    set {
      let oldValue = glassesReady
      glassesReady = newValue
      if oldValue != newValue {
        // Call the callback when state changes
        //        onConnectionStateChanged?()
      }
      if (!newValue) {
        // Reset battery levels when disconnected
        //        batteryLevel = -1
        //        leftBatteryLevel = -1
        //        rightBatteryLevel = -1
      }
    }
  }
  
  // Data Properties
  @Published public var batteryLevel: Int = 50
  @Published public var isCharging: Bool = false
  @Published public var isWifiConnected: Bool = false
  @Published public var wifiSsid: String = ""
  
  // Queue Management
  private let commandQueue = CommandQueue()
  private let bluetoothQueue = DispatchQueue(label: "MentraLiveBluetooth", qos: .userInitiated)
  private var lastSendTimeMs: TimeInterval = 0
  
  // Timers
  private var heartbeatTimer: Timer?
  private var heartbeatCounter = 0
  private var readinessCheckTimer: Timer?
  private var readinessCheckCounter = 0
  private var connectionTimeoutTimer: Timer?
  
  // Callbacks
  public var dataObservable: ((Data) -> Void)?
  public var jsonObservable: ((JSONObject) -> Void)?
  
  // MARK: - Initialization
  
  override init() {
    super.init()
    setupCommandQueue()
  }
  
  deinit {
    destroy()
  }
  
  // MARK: - React Native Interface
  
  private var discoveredPeripherals = [String: CBPeripheral]() // name -> peripheral
  
  @objc func RN_findCompatibleDevices() {
    CoreCommsService.log("Finding compatible Mentra Live glasses")
    
    if centralManager == nil {
      centralManager = CBCentralManager(delegate: self, queue: bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
    }
    
    guard centralManager!.state == .poweredOn else {
      CoreCommsService.log("Bluetooth is not powered on")
      return
    }
    
    // clear the saved device name:
    UserDefaults.standard.set("", forKey: PREFS_DEVICE_NAME)
    
    startScan()
  }
  
  @objc func RN_connectToGlasses(_ deviceName: String) -> Bool {
    CoreCommsService.log("RN_connectToGlasses: \(deviceName)")
    
    // Save the device name for future reconnection
    UserDefaults.standard.set(deviceName, forKey: PREFS_DEVICE_NAME)
    
    // Start scanning to find this specific device
    if centralManager == nil {
      centralManager = CBCentralManager(delegate: self, queue: bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
    }
    
    // Will connect when found during scan
    startScan()
    return true
  }
  
  @objc func RN_disconnect() {
    CoreCommsService.log("Disconnecting from Mentra Live glasses")
    // isKilled = true
    
    if let peripheral = connectedPeripheral {
      centralManager?.cancelPeripheralConnection(peripheral)
    }
    
    connectionState = .disconnected
    stopAllTimers()
  }
  
  @objc func RN_setMicrophoneEnabled(_ enabled: Bool) {
    CoreCommsService.log("Setting microphone state to: \(enabled)")
    
    let json: [String: Any] = [
      "type": "set_mic_state",
      "enabled": enabled
    ]
    
    sendJson(json)
  }
  
  @objc func RN_requestPhoto(_ requestId: String, appId: String, webhookUrl: String?) {
    CoreCommsService.log("Requesting photo: \(requestId) for app: \(appId)")
    
    var json: [String: Any] = [
      "type": "take_photo",
      "requestId": requestId,
      "appId": appId
    ]
    
    if let webhookUrl = webhookUrl, !webhookUrl.isEmpty {
      json["webhookUrl"] = webhookUrl
    }
    
    sendJson(json)
  }
  
  @objc func RN_startRtmpStream(_ message: [String: Any]) {
    CoreCommsService.log("Starting RTMP stream")
    var json = message
    json.removeValue(forKey: "timestamp")
    sendJson(json)
  }
  
  @objc func RN_stopRtmpStream() {
    CoreCommsService.log("Stopping RTMP stream")
    let json: [String: Any] = ["type": "stop_rtmp_stream"]
    sendJson(json)
  }
  
  @objc func RN_sendRtmpKeepAlive(_ message: [String: Any]) {
    CoreCommsService.log("Sending RTMP keep alive")
    sendJson(message)
  }
  
  @objc func RN_requestWifiScan() {
    CoreCommsService.log("Requesting WiFi scan")
    let json: [String: Any] = ["type": "request_wifi_scan"]
    sendJson(json)
  }
  
  @objc func RN_sendWifiCredentials(_ ssid: String, password: String) {
    CoreCommsService.log("Sending WiFi credentials for SSID: \(ssid)")
    
    guard !ssid.isEmpty else {
      CoreCommsService.log("Cannot set WiFi credentials - SSID is empty")
      return
    }
    
    let json: [String: Any] = [
      "type": "set_wifi_credentials",
      "ssid": ssid,
      "password": password
    ]
    
    sendJson(json)
  }
  
  @objc func RN_startRecordVideo() {
    let json: [String: Any] = ["type": "start_record_video"]
    sendJson(json)
  }
  
  @objc func RN_stopRecordVideo() {
    let json: [String: Any] = ["type": "stop_record_video"]
    sendJson(json)
  }
  
  @objc func RN_startVideoStream() {
    let json: [String: Any] = ["type": "start_video_stream"]
    sendJson(json)
  }
  
  @objc func RN_stopVideoStream() {
    let json: [String: Any] = ["type": "stop_video_stream"]
    sendJson(json)
  }
  
  // MARK: - Command Queue
  
  actor CommandQueue {
    private var commands: [Data] = []
    
    func enqueue(_ command: Data) {
      commands.append(command)
    }
    
    func dequeue() -> Data? {
      guard !commands.isEmpty else { return nil }
      return commands.removeFirst()
    }
  }
  
  private func setupCommandQueue() {
    Task.detached { [weak self] in
      guard let self = self else { return }
      while !self.isKilled {
        if let command = await self.commandQueue.dequeue() {
          await self.processSendQueue(command)
        }
        try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
      }
    }
  }
  
  private func processSendQueue(_ data: Data) async {
    // guard connectionState == .connected,
    //       let peripheral = connectedPeripheral,
    //       let txChar = txCharacteristic else {
    //   return
    // }
    
    guard let peripheral = connectedPeripheral,
          let txChar = txCharacteristic else {
      return
    }
    
    // Enforce rate limiting
    let currentTime = Date().timeIntervalSince1970 * 1000
    let timeSinceLastSend = currentTime - lastSendTimeMs
    
    // if timeSinceLastSend < Double(MIN_SEND_DELAY_MS / 1_000_000) {
    //   let remainingDelay = Double(MIN_SEND_DELAY_MS / 1_000_000) - timeSinceLastSend
    //   try? await Task.sleep(nanoseconds: UInt64(remainingDelay * 1_000_000))
    // }

    // 1 second delay
    try? await Task.sleep(nanoseconds: UInt64(1_000_000_000))
    
    lastSendTimeMs = Date().timeIntervalSince1970 * 1000
    
    CoreCommsService.log("Sending data: \(data)")
    
    // Send the data
    peripheral.writeValue(data, for: txChar, type: .withResponse)
  }
  
  private func queueData(_ data: Data) {
    Task {
      await commandQueue.enqueue(data)
    }
  }
  
  // MARK: - BLE Scanning
  
  private func startScan() {
    // guard !isScanning else { return }
    
    CoreCommsService.log("Starting BLE scan for Mentra Live glasses")
    isScanning = true
    
    let scanOptions: [String: Any] = [
      CBCentralManagerScanOptionAllowDuplicatesKey: false
    ]
    
    centralManager?.scanForPeripherals(withServices: nil, options: scanOptions)
    
    // emit already discovered peripherals:
    for (_, peripheral) in discoveredPeripherals {
      CoreCommsService.log("(Already discovered) peripheral: \(peripheral.name ?? "Unknown")")
      emitDiscoveredDevice(peripheral.name!)
    }
    
    //    // Set scan timeout
    //    DispatchQueue.main.asyncAfter(deadline: .now() + 60.0) { [weak self] in
    //      if self?.isScanning == true {
    //        CoreCommsService.log("Scan timeout reached - stopping BLE scan")
    //        self?.stopScan()
    //      }
    //    }
  }
  
  private func stopScan() {
    guard isScanning else { return }
    
    centralManager?.stopScan()
    isScanning = false
    CoreCommsService.log("BLE scan stopped")
    
    // Emit event
    emitStopScanEvent()
  }
  
  // MARK: - Connection Management
  
  private func connectToDevice(_ peripheral: CBPeripheral) {
    CoreCommsService.log("Connecting to device: \(peripheral.identifier.uuidString)")
    
    isConnecting = true
    connectionState = .connecting
    connectedPeripheral = peripheral
    peripheral.delegate = self
    
    // Set connection timeout
    startConnectionTimeout()
    
    centralManager?.connect(peripheral, options: nil)
  }
  
  private func handleReconnection() {
    guard reconnectAttempts < MAX_RECONNECT_ATTEMPTS else {
      CoreCommsService.log("Maximum reconnection attempts reached")
      reconnectAttempts = 0
      connectionState = .disconnected
      return
    }
    
    let delay = min(BASE_RECONNECT_DELAY_MS * UInt64(1 << reconnectAttempts), MAX_RECONNECT_DELAY_MS)
    reconnectAttempts += 1
    
    CoreCommsService.log("Scheduling reconnection attempt \(reconnectAttempts) in \(delay / 1_000_000_000)s")
    
    Task {
      try? await Task.sleep(nanoseconds: delay)
      
      guard !isKilled && connectionState == .disconnected else { return }
      
      if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME) {
        CoreCommsService.log("Reconnection attempt \(reconnectAttempts) - looking for device: \(savedDeviceName)")
        startScan()
      }
    }
  }
  
  // MARK: - Data Processing
  
  private func processReceivedData(_ data: Data) {
    guard data.count > 0 else { return }
    
    let bytes = [UInt8](data)
    
    // Log first few bytes for debugging
    let hexString = data.prefix(16).map { String(format: "%02X ", $0) }.joined()
    CoreCommsService.log("Processing data packet, first \(min(data.count, 16)) bytes: \(hexString)")
    
    // Check for K900 protocol format (starts with ##)
    if data.count >= 7 && bytes[0] == 0x23 && bytes[1] == 0x23 {
      processK900ProtocolData(data)
      return
    }
    
    // Check for LC3 audio data
    if bytes[0] == 0xA0 {
      processLC3AudioData(data)
      return
    }
    
    // Check for JSON data
    if bytes[0] == 0x7B { // '{'
      if let jsonString = String(data: data, encoding: .utf8),
         jsonString.hasPrefix("{") && jsonString.hasSuffix("}") {
        processJsonMessage(jsonString)
      }
    }
  }
  
  private func processK900ProtocolData(_ data: Data) {
    let bytes = [UInt8](data)
    
    let commandType = bytes[2]
    let payloadLength: Int
    
    // Determine endianness based on device name
    if let deviceName = connectedPeripheral?.name,
       (deviceName.hasPrefix("XyBLE_") || deviceName.hasPrefix("MENTRA_LIVE")) {
      // K900 device - big-endian
      payloadLength = (Int(bytes[3]) << 8) | Int(bytes[4])
    } else {
      // Standard device - little-endian
      payloadLength = (Int(bytes[4]) << 8) | Int(bytes[3])
    }
    
    CoreCommsService.log("K900 Protocol - Command: 0x\(String(format: "%02X", commandType)), Payload length: \(payloadLength)")
    
    // Extract payload if it's JSON data
    if commandType == 0x30 && data.count >= payloadLength + 7 {
      if bytes[5 + payloadLength] == 0x24 && bytes[6 + payloadLength] == 0x24 {
        let payloadData = data.subdata(in: 5..<(5 + payloadLength))
        if let payloadString = String(data: payloadData, encoding: .utf8) {
          processJsonMessage(payloadString)
        }
      }
    }
  }
  
  private func processLC3AudioData(_ data: Data) {
    CoreCommsService.log("✅ DETECTED LC3 AUDIO PACKET! Size: \(data.count) bytes")
    
    // Extract LC3 data (skip command byte)
    let lc3Data = data.subdata(in: 1..<data.count)
    
    // Forward to audio processing callback if available
    dataObservable?(lc3Data)
  }
  
  private func processJsonMessage(_ jsonString: String) {
    CoreCommsService.log("Got JSON from glasses: \(jsonString)")
    
    do {
      guard let data = jsonString.data(using: .utf8),
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return
      }
      
      processJsonObject(json)
      // Check for C-wrapped format
      //      if let cContent = json["C"] as? String {
      //        if let innerData = cContent.data(using: .utf8),
      //           let innerJson = try JSONSerialization.jsonObject(with: innerData) as? [String: Any] {
      //          processJsonObject(innerJson)
      //        } else {
      //          processJsonObject(json)
      //        }
      //      } else {
      //        processJsonObject(json)
      //      }
    } catch {
      CoreCommsService.log("Error parsing JSON: \(error)")
    }
  }
  
  private func processJsonObject(_ json: [String: Any]) {
    
    
    // Check for K900 command format
    if let command = json["C"] as? String {
      processK900JsonMessage(json)
      return
    }
    
    guard let type = json["type"] as? String else {
      // Forward to observable if no type
      jsonObservable?(json)
      return
    }
    
    switch type {
    case "glasses_ready":
      handleGlassesReady()
      
    case "battery_status":
      let level = json["level"] as? Int ?? batteryLevel
      let charging = json["charging"] as? Bool ?? isCharging
      updateBatteryStatus(level: level, charging: charging)
      
    case "wifi_status":
      let connected = json["connected"] as? Bool ?? false
      let ssid = json["ssid"] as? String ?? ""
      updateWifiStatus(connected: connected, ssid: ssid)
      
    case "wifi_scan_result":
      handleWifiScanResult(json)
      
    case "rtmp_stream_status":
      emitRtmpStreamStatus(json)
      
    case "button_press":
      handleButtonPress(json)
      
    case "version_info":
      handleVersionInfo(json)
      
    case "pong":
      CoreCommsService.log("💓 Received pong response - connection healthy")
      
    case "keep_alive_ack":
      emitKeepAliveAck(json)
      
    default:
      // Forward unknown types to observable
      jsonObservable?(json)
    }
  }
  
  private func processK900JsonMessage(_ json: [String: Any]) {
    guard let command = json["C"] as? String else { return }
    
    CoreCommsService.log("Processing K900 command: \(command)")
    
    // convert command string (which is a json string) to a json object:
    let commandJson = try? JSONSerialization.jsonObject(with: command.data(using: .utf8)!) as? [String: Any]
    processJsonObject(commandJson ?? [:])
    
    // switch command {
    // case "sr_batv":
    //   if let body = json["B"] as? [String: Any],
    //      let voltage = body["vt"] as? Int,
    //      let percentage = body["pt"] as? Int {
    
    //     let voltageVolts = Double(voltage) / 1000.0
    //     let isCharging = voltage > 4000
    
    //     CoreCommsService.log("🔋 K900 Battery Status - Voltage: \(voltageVolts)V, Level: \(percentage)%")
    //     updateBatteryStatus(level: percentage, charging: isCharging)
    //   }
    
    // default:
    //   CoreCommsService.log("Unknown K900 command: \(command)")
    //   jsonObservable?(json)
    // }
  }
  
  // MARK: - Message Handlers
  
  private func handleGlassesReady() {
    CoreCommsService.log("🎉 Received glasses_ready message - SOC is booted and ready!")
    
    glassesReady = true
    stopReadinessCheckLoop()
    
    // Perform SOC-dependent initialization
    requestBatteryStatus()
    requestWifiStatus()
    requestVersionInfo()
    sendCoreTokenToAsgClient()
    
    // Start heartbeat
    startHeartbeat()
    
    // Update connection state
    connectionState = .connected
  }
  
  private func handleWifiScanResult(_ json: [String: Any]) {
    var networks: [String] = []
    
    if let networksArray = json["networks"] as? [String] {
      networks = networksArray
    } else if let networksString = json["networks"] as? String {
      networks = networksString.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    }
    
    CoreCommsService.log("Received WiFi scan results: \(networks.count) networks found")
    emitWifiScanResult(networks)
  }
  
  private func handleButtonPress(_ json: [String: Any]) {
    let buttonId = json["buttonId"] as? String ?? "unknown"
    let pressType = json["pressType"] as? String ?? "short"
    let timestamp = json["timestamp"] as? Int64 ?? Int64(Date().timeIntervalSince1970 * 1000)
    
    CoreCommsService.log("Received button press - buttonId: \(buttonId), pressType: \(pressType)")
    emitButtonPress(buttonId: buttonId, pressType: pressType, timestamp: timestamp)
  }
  
  private func handleVersionInfo(_ json: [String: Any]) {
    let appVersion = json["app_version"] as? String ?? ""
    let buildNumber = json["build_number"] as? String ?? ""
    let deviceModel = json["device_model"] as? String ?? ""
    let androidVersion = json["android_version"] as? String ?? ""
    
    CoreCommsService.log("Glasses Version - App: \(appVersion), Build: \(buildNumber), Device: \(deviceModel), Android: \(androidVersion)")
    emitVersionInfo(appVersion: appVersion, buildNumber: buildNumber, deviceModel: deviceModel, androidVersion: androidVersion)
  }
  
  // MARK: - Sending Data
  
  private func sendJson(_ json: [String: Any]) {
    do {
      let data = try JSONSerialization.data(withJSONObject: json)
      if let jsonString = String(data: data, encoding: .utf8) {
        sendDataToGlasses(jsonString)
      }
    } catch {
      CoreCommsService.log("Error creating JSON: \(error)")
    }
  }
  
  private func sendDataToGlasses(_ data: String) {
    guard !data.isEmpty else {
      CoreCommsService.log("Cannot send empty data to glasses")
      return
    }
    
    do {
      
      CoreCommsService.log("Sending data to glasses: \(data)")
      
      // Pack the command
      let packedData = packCommand(data)
      CoreCommsService.log("Packed data: \(packedData)")
      // print the hex string of the packed data:
      let hexString = packedData.map { String(format: "%02X ", $0) }.joined()
      CoreCommsService.log("Hex string of packed data: \(hexString)")
      queueData(packedData)
      
    } catch {
      CoreCommsService.log("Error creating data JSON: \(error)")
    }
  }
  
  private func packCommand(_ jsonString: String) -> Data {
    return packJsonToK900(jsonString) ?? Data()
  }
  
  // MARK: - Status Requests
  
  private func requestBatteryStatus() {
    requestBatteryK900()
  }
  
  private func requestBatteryK900() {
    let json: [String: Any] = [
      "C": "cs_batv",
      "V": 1,
      "B": ""
    ]
    
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: json)
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        let packedData = packCommand(jsonString)
        queueData(packedData)
      }
    } catch {
      CoreCommsService.log("Error creating K900 battery request: \(error)")
    }
  }
  
  private func requestWifiStatus() {
    let json: [String: Any] = ["type": "request_wifi_status"]
    sendJson(json)
  }
  
  private func requestVersionInfo() {
    let json: [String: Any] = ["type": "request_version"]
    sendJson(json)
  }
  
  private func sendCoreTokenToAsgClient() {
    CoreCommsService.log("Preparing to send coreToken to ASG client")
    
    guard let coreToken = UserDefaults.standard.string(forKey: KEY_CORE_TOKEN), !coreToken.isEmpty else {
      CoreCommsService.log("No coreToken available to send to ASG client")
      return
    }
    
    let json: [String: Any] = [
      "type": "auth_token",
      "coreToken": coreToken,
      "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
    ]
    
    sendJson(json)
  }
  
  // MARK: - Update Methods
  
  private func updateBatteryStatus(level: Int, charging: Bool) {
    batteryLevel = level
    isCharging = charging
    emitBatteryLevelEvent(level: level, charging: charging)
  }
  
  private func updateWifiStatus(connected: Bool, ssid: String) {
    isWifiConnected = connected
    wifiSsid = ssid
    emitWifiStatusChange(connected: connected, ssid: ssid)
  }
  
  // MARK: - Timers
  
  private func startHeartbeat() {
    CoreCommsService.log("💓 Starting heartbeat mechanism")
    heartbeatCounter = 0
    
    heartbeatTimer?.invalidate()
    heartbeatTimer = Timer.scheduledTimer(withTimeInterval: HEARTBEAT_INTERVAL_MS, repeats: true) { [weak self] _ in
      self?.sendHeartbeat()
    }
  }
  
  private func stopHeartbeat() {
    CoreCommsService.log("💓 Stopping heartbeat mechanism")
    heartbeatTimer?.invalidate()
    heartbeatTimer = nil
    heartbeatCounter = 0
  }
  
  private func sendHeartbeat() {
    guard glassesReady && connectionState == .connected else {
      CoreCommsService.log("Skipping heartbeat - glasses not ready or not connected")
      return
    }
    
    let json: [String: Any] = ["type": "ping"]
    sendJson(json)
    
    heartbeatCounter += 1
    CoreCommsService.log("💓 Heartbeat #\(heartbeatCounter) sent")
    
    // Request battery status periodically
    if heartbeatCounter % BATTERY_REQUEST_EVERY_N_HEARTBEATS == 0 {
      CoreCommsService.log("🔋 Requesting battery status (heartbeat #\(heartbeatCounter))")
      requestBatteryStatus()
    }
  }
  
  private var readinessCheckDispatchTimer: DispatchSourceTimer?
  
  private func startReadinessCheckLoop() {
    stopReadinessCheckLoop()
    
    readinessCheckCounter = 0
    glassesReady = false
    
    CoreCommsService.log("🔄 Starting glasses SOC readiness check loop")
    
    readinessCheckDispatchTimer = DispatchSource.makeTimerSource(queue: bluetoothQueue)
    readinessCheckDispatchTimer!.schedule(deadline: .now(), repeating: READINESS_CHECK_INTERVAL_MS)
    
    readinessCheckDispatchTimer!.setEventHandler { [weak self] in
      guard let self = self else { return }
      
      self.readinessCheckCounter += 1
      CoreCommsService.log("🔄 Readiness check #\(self.readinessCheckCounter): waiting for glasses SOC to boot")
      
      let json: [String: Any] = [
        "type": "phone_ready",
        "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
      ]
      
      self.sendJson(json)
      
      // // request battery status:
      // requestBatteryStatus()
      // // request wifi status:
      // requestWifiStatus()
      // // request version info:
      // requestVersionInfo()
      // // send core token to ASG client:
    }
    
    readinessCheckDispatchTimer!.resume()
  }
  
  private func stopReadinessCheckLoop() {
    readinessCheckDispatchTimer?.cancel()
    readinessCheckDispatchTimer = nil
    CoreCommsService.log("🔄 Stopped glasses SOC readiness check loop")
  }
  
  private func startConnectionTimeout() {
    connectionTimeoutTimer?.invalidate()
    connectionTimeoutTimer = Timer.scheduledTimer(withTimeInterval: Double(CONNECTION_TIMEOUT_MS) / 1_000_000_000, repeats: false) { [weak self] _ in
      guard let self = self else { return }
      
      if self.isConnecting && self.connectionState != .connected {
        CoreCommsService.log("Connection timeout - closing GATT connection")
        self.isConnecting = false
        
        if let peripheral = self.connectedPeripheral {
          self.centralManager?.cancelPeripheralConnection(peripheral)
        }
        
        self.handleReconnection()
      }
    }
  }
  
  private func stopConnectionTimeout() {
    connectionTimeoutTimer?.invalidate()
    connectionTimeoutTimer = nil
  }
  
  private func stopAllTimers() {
    stopHeartbeat()
    stopReadinessCheckLoop()
    stopConnectionTimeout()
  }
  
  // MARK: - Event Emission
  
  private func emitDiscoveredDevice(_ name: String) {
    let eventBody: [String: Any] = [
      "compatible_glasses_search_result": [
        "model_name": "Mentra Live",
        "device_name": name
      ]
    ]
    
    emitEvent("CoreMessageEvent", body: eventBody)
  }
  
  private func emitStopScanEvent() {
    let eventBody: [String: Any] = [
      "type": "glasses_bluetooth_search_stop",
      "device_model": "Mentra Live"
    ]
    
    // emitEvent("GlassesBluetoothSearchStopEvent", body: eventBody)
  }
  
  private func emitBatteryLevelEvent(level: Int, charging: Bool) {
    let eventBody: [String: Any] = [
      "battery_level": level,
      "is_charging": charging
    ]
    
    emitEvent("BatteryLevelEvent", body: eventBody)
  }
  
  private func emitWifiStatusChange(connected: Bool, ssid: String) {
    let eventBody: [String: Any] = [
      "device_model": "Mentra Live",
      "connected": connected,
      "ssid": ssid
    ]
    
    emitEvent("GlassesWifiStatusChange", body: eventBody)
  }
  
  private func emitWifiScanResult(_ networks: [String]) {
    let eventBody: [String: Any] = [
      "device_model": "Mentra Live",
      "networks": networks
    ]
    
    emitEvent("GlassesWifiScanResultEvent", body: eventBody)
  }
  
  private func emitRtmpStreamStatus(_ json: [String: Any]) {
    emitEvent("RtmpStreamStatusEvent", body: json)
  }
  
  private func emitButtonPress(buttonId: String, pressType: String, timestamp: Int64) {
    let eventBody: [String: Any] = [
      "device_model": "Mentra Live",
      "button_id": buttonId,
      "press_type": pressType,
      "timestamp": timestamp
    ]
    
    emitEvent("ButtonPressEvent", body: eventBody)
  }
  
  private func emitVersionInfo(appVersion: String, buildNumber: String, deviceModel: String, androidVersion: String) {
    let eventBody: [String: Any] = [
      "app_version": appVersion,
      "build_number": buildNumber,
      "device_model": deviceModel,
      "android_version": androidVersion
    ]
    
    emitEvent("GlassesVersionInfoEvent", body: eventBody)
  }
  
  private func emitKeepAliveAck(_ json: [String: Any]) {
    emitEvent("KeepAliveAckEvent", body: json)
  }
  
  private func emitEvent(_ eventName: String, body: [String: Any]) {
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: body, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        if eventName == "CoreMessageEvent" {
          CoreCommsService.emitter.sendEvent(withName: eventName, body: jsonString)
          return
        }
        CoreCommsService.log("Would emit event: \(eventName) with body: \(jsonString)")
      }
    } catch {
      CoreCommsService.log("Error converting event to JSON: \(error)")
    }
  }
  
  // MARK: - Cleanup
  
  private func destroy() {
    CoreCommsService.log("Destroying MentraLiveManager")
    
    isKilled = true
    
    // Stop scanning
    if isScanning {
      stopScan()
    }
    
    // Stop all timers
    stopAllTimers()
    
    // Disconnect BLE
    if let peripheral = connectedPeripheral {
      centralManager?.cancelPeripheralConnection(peripheral)
    }
    
    connectedPeripheral = nil
    centralManager?.delegate = nil
    centralManager = nil
    
    connectionState = .disconnected
  }
  
}


// MARK: - K900 Protocol Utilities

// Protocol constants
private let CMD_START_CODE: [UInt8] = [0x23, 0x23] // ##
private let CMD_END_CODE: [UInt8] = [0x24, 0x24]   // $$
private let CMD_TYPE_STRING: UInt8 = 0x30          // String/JSON type

// JSON Field constants
private let FIELD_C = "C"  // Command/Content field
private let FIELD_V = "V"  // Version field
private let FIELD_B = "B"  // Body field

extension MentraLiveManager {
  
  /**
   * Pack a JSON string into the proper K900 format:
   * 1. Wrap with C-field: {"C": jsonData}
   * 2. Then pack with BES2700 protocol: ## + type + length + {"C": jsonData} + $$
   */
  private func packJsonCommand(_ jsonData: String?) -> Data? {
    guard let jsonData = jsonData else { return nil }
    
    do {
      // First wrap with C-field
      let wrapper: [String: Any] = [FIELD_C: jsonData]
      
      // Convert to string
      let jsonData = try JSONSerialization.data(withJSONObject: wrapper)
      guard let wrappedJson = String(data: jsonData, encoding: .utf8) else { return nil }
      
      // Then pack with BES2700 protocol format
      let jsonBytes = wrappedJson.data(using: .utf8)!
      return packDataCommand(jsonBytes, cmdType: CMD_TYPE_STRING)
      
    } catch {
      CoreCommsService.log("Error creating JSON wrapper: \(error)")
      return nil
    }
  }
  
  /**
   * Pack raw byte data with K900 BES2700 protocol format
   * Format: ## + command_type + length(2bytes) + data + $$
   */
  private func packDataCommand(_ data: Data?, cmdType: UInt8) -> Data? {
    guard let data = data else { return nil }
    
    let dataLength = data.count
    
    // Command structure: ## + type + length(2 bytes) + data + $$
    var result = Data(capacity: dataLength + 7) // 2(start) + 1(type) + 2(length) + data + 2(end)
    
    // Start code ##
    result.append(contentsOf: CMD_START_CODE)
    
    // Command type
    result.append(cmdType)
    
    // Length (2 bytes, big-endian)
    result.append(UInt8((dataLength >> 8) & 0xFF)) // MSB first
    result.append(UInt8(dataLength & 0xFF))        // LSB second
    
    // Copy the data
    result.append(data)
    
    // End code $$
    result.append(contentsOf: CMD_END_CODE)
    
    return result
  }
  
  /**
   * Pack raw byte data with K900 BES2700 protocol format for phone-to-device communication
   * Format: ## + command_type + length(2bytes) + data + $$
   * Uses little-endian byte order for length field
   */
  private func packDataToK900(_ data: Data?, cmdType: UInt8) -> Data? {
    guard let data = data else { return nil }
    
    let dataLength = data.count
    
    // Command structure: ## + type + length(2 bytes) + data + $$
    var result = Data(capacity: dataLength + 7) // 2(start) + 1(type) + 2(length) + data + 2(end)
    
    // Start code ##
    result.append(contentsOf: CMD_START_CODE)
    
    // Command type
    result.append(cmdType)
    
    // Length (2 bytes, little-endian for phone-to-device)
    result.append(UInt8(dataLength & 0xFF))         // LSB first
    result.append(UInt8((dataLength >> 8) & 0xFF))  // MSB second
    
    // Copy the data
    result.append(data)
    
    // End code $$
    result.append(contentsOf: CMD_END_CODE)
    
    return result
  }
  
  /**
   * Pack a JSON string for phone-to-K900 device communication
   * 1. Wrap with C-field: {"C": jsonData}
   * 2. Then pack with BES2700 protocol using little-endian: ## + type + length + {"C": jsonData} + $$
   */
  private func packJsonToK900(_ jsonData: String?) -> Data? {
    guard let jsonData = jsonData else { return nil }
    
    do {
      // First wrap with C-field
      var wrapper: [String: Any] = [FIELD_C: jsonData]
      // wrapper["W"] = 1 // Add W field as seen in MentraLiveSGC (optional)
      
      // Convert to string
      let jsonData = try JSONSerialization.data(withJSONObject: wrapper)
      guard let wrappedJson = String(data: jsonData, encoding: .utf8) else { return nil }
      
      // Then pack with BES2700 protocol format using little-endian
      let jsonBytes = wrappedJson.data(using: .utf8)!
      return packDataToK900(jsonBytes, cmdType: CMD_TYPE_STRING)
      
    } catch {
      CoreCommsService.log("Error creating JSON wrapper for K900: \(error)")
      return nil
    }
  }
  
  /**
   * Create a C-wrapped JSON object ready for protocol formatting
   * Format: {"C": content}
   */
  private func createCWrappedJson(_ content: String) -> String? {
    do {
      let wrapper: [String: Any] = [FIELD_C: content]
      let jsonData = try JSONSerialization.data(withJSONObject: wrapper)
      return String(data: jsonData, encoding: .utf8)
    } catch {
      CoreCommsService.log("Error creating C-wrapped JSON: \(error)")
      return nil
    }
  }
  
  /**
   * Check if data follows the K900 BES2700 protocol format
   * Verifies if data starts with ## markers
   */
  private func isK900ProtocolFormat(_ data: Data?) -> Bool {
    guard let data = data, data.count >= 7 else { return false }
    
    let bytes = [UInt8](data)
    return bytes[0] == CMD_START_CODE[0] && bytes[1] == CMD_START_CODE[1]
  }
  
  /**
   * Check if a JSON string is already properly formatted for K900 protocol
   */
  private func isCWrappedJson(_ jsonStr: String) -> Bool {
    do {
      guard let data = jsonStr.data(using: .utf8) else { return false }
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      
      // Check for simple C-wrapping {"C": "content"} - only one field
      if let json = json, json.keys.contains(FIELD_C) && json.count == 1 {
        return true
      }
      
      // Check for full K900 format {"C": "command", "V": val, "B": body}
      if let json = json,
         json.keys.contains(FIELD_C) &&
          json.keys.contains(FIELD_V) &&
          json.keys.contains(FIELD_B) {
        return true
      }
      
      return false
    } catch {
      return false
    }
  }
  
  /**
   * Extract payload from K900 protocol formatted data received from device
   * Uses little-endian byte order for length field
   */
  private func extractPayloadFromK900(_ protocolData: Data?) -> Data? {
    guard let protocolData = protocolData,
          isK900ProtocolFormat(protocolData),
          protocolData.count >= 7 else {
      return nil
    }
    
    let bytes = [UInt8](protocolData)
    
    // Extract length (little-endian for device-to-phone)
    let length = Int(bytes[3]) | (Int(bytes[4]) << 8)
    
    if length + 7 > protocolData.count {
      return nil // Invalid length
    }
    
    // Extract payload
    let payload = protocolData.subdata(in: 5..<(5 + length))
    return payload
  }
  
  /**
   * Unified method to prepare data for transmission according to K900 protocol
   */
  private func prepareDataForTransmission(_ data: Data?) -> Data? {
    guard let data = data, !data.isEmpty else { return nil }
    
    // If already in protocol format, don't modify
    if isK900ProtocolFormat(data) {
      return data
    }
    
    // Try to interpret as a JSON string that needs C-wrapping and protocol formatting
    if let originalData = String(data: data, encoding: .utf8),
       originalData.hasPrefix("{") && !isCWrappedJson(originalData) {
      CoreCommsService.log("📦 JSON DATA BEFORE C-WRAPPING: \(originalData)")
      
      // Use packJsonToK900 for K900 devices
      if let formattedData = packJsonToK900(originalData) {
        // Debug log
        let hexDump = formattedData.prefix(50).map { String(format: "%02X ", $0) }.joined()
        CoreCommsService.log("📦 AFTER C-WRAPPING & PROTOCOL FORMATTING (first 50 bytes): \(hexDump)")
        CoreCommsService.log("📦 Total formatted length: \(formattedData.count) bytes")
        
        return formattedData
      }
    } else {
      // Otherwise just apply protocol formatting
      CoreCommsService.log("📦 Data already C-wrapped or not JSON")
      return packDataToK900(data, cmdType: CMD_TYPE_STRING)
    }
    
    return nil
  }
}
