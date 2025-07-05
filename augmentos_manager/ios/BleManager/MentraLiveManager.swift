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
            print("Bluetooth powered on")
            // If we have a saved device, try to reconnect
            if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME), !savedDeviceName.isEmpty {
                startScan()
            }
            
        case .poweredOff:
            print("Bluetooth is powered off")
            connectionState = .disconnected
            
        case .unauthorized:
            print("Bluetooth is unauthorized")
            connectionState = .disconnected
            
        case .unsupported:
            print("Bluetooth is unsupported")
            connectionState = .disconnected
            
        default:
            print("Bluetooth state: \(central.state.rawValue)")
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        guard let name = peripheral.name else { return }
        
        // Check for compatible device names
        if name == "Xy_A" || name.hasPrefix("XyBLE_") || name.hasPrefix("MENTRA_LIVE_BLE") || name.hasPrefix("MENTRA_LIVE_BT") {
            let glassType = name == "Xy_A" ? "Standard" : "K900"
            print("Found compatible \(glassType) glasses device: \(name)")
            
            emitDiscoveredDevice(name)
            
            // Check if this is the device we want to connect to
            if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME),
               savedDeviceName == name {
                print("Found our remembered device by name, connecting: \(name)")
                stopScan()
                connectToDevice(peripheral)
            }
        }
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("Connected to GATT server, discovering services...")
        
        stopConnectionTimeout()
        isConnecting = false
        connectedPeripheral = peripheral
        
        // Save device name for future reconnection
        if let name = peripheral.name {
            UserDefaults.standard.set(name, forKey: PREFS_DEVICE_NAME)
            print("Saved device name for future reconnection: \(name)")
        }
        
        // Discover services
        peripheral.discoverServices([SERVICE_UUID])
        
        // Reset reconnect attempts
        reconnectAttempts = 0
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        print("Disconnected from GATT server")
        
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
        print("Failed to connect to peripheral: \(error?.localizedDescription ?? "Unknown error")")
        
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
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            print("Error discovering services: \(error.localizedDescription)")
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        guard let services = peripheral.services else { return }
        
        for service in services where service.uuid == SERVICE_UUID {
            print("Found UART service, discovering characteristics...")
            peripheral.discoverCharacteristics([TX_CHAR_UUID, RX_CHAR_UUID], for: service)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            print("Error discovering characteristics: \(error.localizedDescription)")
            centralManager?.cancelPeripheralConnection(peripheral)
            return
        }
        
        guard let characteristics = service.characteristics else { return }
        
        for characteristic in characteristics {
            if characteristic.uuid == TX_CHAR_UUID {
                txCharacteristic = characteristic
                print("✅ Found TX characteristic")
            } else if characteristic.uuid == RX_CHAR_UUID {
                rxCharacteristic = characteristic
                print("✅ Found RX characteristic")
            }
        }
        
        // Check if we have both characteristics
        if let tx = txCharacteristic, let rx = rxCharacteristic {
            print("✅ Both TX and RX characteristics found - BLE connection ready")
            print("🔄 Waiting for glasses SOC to become ready...")
            
            // Keep state as connecting until glasses are ready
            connectionState = .connecting
            
            // Request MTU size
            peripheral.readRSSI()
            let mtuSize = peripheral.maximumWriteValueLength(for: .withResponse)
            print("Current MTU size: \(mtuSize + 3) bytes")
            
            // Enable notifications on RX characteristic
            peripheral.setNotifyValue(true, for: rx)
            
            // Start readiness check loop
            startReadinessCheckLoop()
        } else {
            print("Required BLE characteristics not found")
            if txCharacteristic == nil {
                print("TX characteristic not found")
            }
            if rxCharacteristic == nil {
                print("RX characteristic not found")
            }
            centralManager?.cancelPeripheralConnection(peripheral)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
      
        print("GOT CHARACTERISTIC UPDATE @@@@@@@@@@@@@@@@@@@@@")
        if let error = error {
            print("Error updating value for characteristic: \(error.localizedDescription)")
            return
        }
        
        guard let data = characteristic.value else {
            print("Characteristic value is nil")
            return
        }
        
        let threadId = Thread.current.hash
        let uuid = characteristic.uuid
        
        print("Thread-\(threadId): 🎉 didUpdateValueFor CALLBACK TRIGGERED! Characteristic: \(uuid)")
        
        if uuid == RX_CHAR_UUID {
            print("Thread-\(threadId): 🎯 RECEIVED DATA ON RX CHARACTERISTIC (Peripheral's TX)")
        } else if uuid == TX_CHAR_UUID {
            print("Thread-\(threadId): 🎯 RECEIVED DATA ON TX CHARACTERISTIC (Peripheral's RX)")
        }
        
        print("Thread-\(threadId): 🔍 Processing received data - \(data.count) bytes")
        
        processReceivedData(data)
    }
    
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("Error writing characteristic: \(error.localizedDescription)")
        } else {
            print("Characteristic write successful")
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("Error updating notification state: \(error.localizedDescription)")
        } else {
            print("Notification state updated for \(characteristic.uuid): \(characteristic.isNotifying ? "ON" : "OFF")")
            
            if characteristic.uuid == RX_CHAR_UUID && characteristic.isNotifying {
                print("🔔 Ready to receive data via notifications")
            }
        }
    }
    
    func peripheralDidUpdateRSSI(_ peripheral: CBPeripheral, error: Error?) {
        if let error = error {
            print("Error reading RSSI: \(error.localizedDescription)")
        } else {
            print("RSSI: \(peripheral.readRSSI())")
        }
    }
}

// MARK: - Display Method Stubs (Mentra Live has no display)

extension MentraLiveManager {
    
    @objc func RN_setFontSize(_ fontSize: String) {
        print("[STUB] Device has no display. Cannot set font size: \(fontSize)")
    }
    
    @objc func RN_displayTextWall(_ text: String) {
        print("[STUB] Device has no display. Text wall would show: \(text)")
    }
    
    @objc func RN_displayBitmap(_ bitmap: UIImage) {
        print("[STUB] Device has no display. Cannot display bitmap.")
    }
    
    @objc func RN_displayTextLine(_ text: String) {
        print("[STUB] Device has no display. Text line would show: \(text)")
    }
    
    @objc func RN_displayReferenceCardSimple(_ title: String, body: String) {
        print("[STUB] Device has no display. Reference card would show: \(title)")
    }
    
    @objc func RN_updateBrightness(_ brightness: Int) {
        print("[STUB] Device has no display. Cannot set brightness: \(brightness)")
    }
    
    @objc func RN_showHomeScreen() {
        print("[STUB] Device has no display. Cannot show home screen.")
    }
    
    @objc func RN_blankScreen() {
        print("[STUB] Device has no display. Cannot blank screen.")
    }
    
    @objc func RN_displayRowsCard(_ rowStrings: [String]) {
        print("[STUB] Device has no display. Cannot display rows card with \(rowStrings.count) rows")
    }
    
    @objc func RN_displayDoubleTextWall(_ textTop: String, textBottom: String) {
        print("[STUB] Device has no display. Double text wall would show: \(textTop) / \(textBottom)")
    }
    
    @objc func RN_displayBulletList(_ title: String, bullets: [String]) {
        print("[STUB] Device has no display. Bullet list would show: \(title) with \(bullets.count) items")
    }
    
    @objc func RN_displayCustomContent(_ json: String) {
        print("[STUB] Device has no display. Cannot display custom content")
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
    private let CONNECTION_TIMEOUT_MS: UInt64 = 10_000_000_000 // 10 seconds
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
    
    @objc func RN_findCompatibleDevices() {
        print("Finding compatible Mentra Live glasses")
        
        if centralManager == nil {
            centralManager = CBCentralManager(delegate: self, queue: bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
        }
        
        guard centralManager!.state == .poweredOn else {
            print("Bluetooth is not powered on")
            return
        }

        // clear the saved device name:
        UserDefaults.standard.set("", forKey: PREFS_DEVICE_NAME)
        
        startScan()
    }
    
    @objc func RN_connectToGlasses(_ deviceName: String) -> Bool {
        print("RN_connectToGlasses: \(deviceName)")
        
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
        print("Disconnecting from Mentra Live glasses")
        isKilled = true
        
        if let peripheral = connectedPeripheral {
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        
        connectionState = .disconnected
        stopAllTimers()
    }
    
    @objc func RN_setMicrophoneEnabled(_ enabled: Bool) {
        print("Setting microphone state to: \(enabled)")
        
        let json: [String: Any] = [
            "type": "set_mic_state",
            "enabled": enabled
        ]
        
        sendJson(json)
    }
    
    @objc func RN_requestPhoto(_ requestId: String, appId: String, webhookUrl: String?) {
        print("Requesting photo: \(requestId) for app: \(appId)")
        
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
        print("Starting RTMP stream")
        var json = message
        json.removeValue(forKey: "timestamp")
        sendJson(json)
    }
    
    @objc func RN_stopRtmpStream() {
        print("Stopping RTMP stream")
        let json: [String: Any] = ["type": "stop_rtmp_stream"]
        sendJson(json)
    }
    
    @objc func RN_sendRtmpKeepAlive(_ message: [String: Any]) {
        print("Sending RTMP keep alive")
        sendJson(message)
    }
    
    @objc func RN_requestWifiScan() {
        print("Requesting WiFi scan")
        let json: [String: Any] = ["type": "request_wifi_scan"]
        sendJson(json)
    }
    
    @objc func RN_sendWifiCredentials(_ ssid: String, password: String) {
        print("Sending WiFi credentials for SSID: \(ssid)")
        
        guard !ssid.isEmpty else {
            print("Cannot set WiFi credentials - SSID is empty")
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
        guard connectionState == .connected,
              let peripheral = connectedPeripheral,
              let txChar = txCharacteristic else {
            return
        }
        
        // Enforce rate limiting
        let currentTime = Date().timeIntervalSince1970 * 1000
        let timeSinceLastSend = currentTime - lastSendTimeMs
        
        if timeSinceLastSend < Double(MIN_SEND_DELAY_MS / 1_000_000) {
            let remainingDelay = Double(MIN_SEND_DELAY_MS / 1_000_000) - timeSinceLastSend
            try? await Task.sleep(nanoseconds: UInt64(remainingDelay * 1_000_000))
        }
        
        lastSendTimeMs = Date().timeIntervalSince1970 * 1000
        
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
        guard !isScanning else { return }
        
        print("Starting BLE scan for Mentra Live glasses")
        isScanning = true
        
        let scanOptions: [String: Any] = [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ]
        
        centralManager?.scanForPeripherals(withServices: nil, options: scanOptions)
        
        // Set scan timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 60.0) { [weak self] in
            if self?.isScanning == true {
                print("Scan timeout reached - stopping BLE scan")
                self?.stopScan()
            }
        }
    }
    
    private func stopScan() {
        guard isScanning else { return }
        
        centralManager?.stopScan()
        isScanning = false
        print("BLE scan stopped")
        
        // Emit event
        emitStopScanEvent()
    }
    
    // MARK: - Connection Management
    
    private func connectToDevice(_ peripheral: CBPeripheral) {
        print("Connecting to device: \(peripheral.identifier.uuidString)")
        
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
            print("Maximum reconnection attempts reached")
            reconnectAttempts = 0
            connectionState = .disconnected
            return
        }
        
        let delay = min(BASE_RECONNECT_DELAY_MS * UInt64(1 << reconnectAttempts), MAX_RECONNECT_DELAY_MS)
        reconnectAttempts += 1
        
        print("Scheduling reconnection attempt \(reconnectAttempts) in \(delay / 1_000_000_000)s")
        
        Task {
            try? await Task.sleep(nanoseconds: delay)
            
            guard !isKilled && connectionState == .disconnected else { return }
            
            if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME) {
                print("Reconnection attempt \(reconnectAttempts) - looking for device: \(savedDeviceName)")
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
        print("Processing data packet, first \(min(data.count, 16)) bytes: \(hexString)")
        
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
        
        print("K900 Protocol - Command: 0x\(String(format: "%02X", commandType)), Payload length: \(payloadLength)")
        
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
        print("✅ DETECTED LC3 AUDIO PACKET! Size: \(data.count) bytes")
        
        // Extract LC3 data (skip command byte)
        let lc3Data = data.subdata(in: 1..<data.count)
        
        // Forward to audio processing callback if available
        dataObservable?(lc3Data)
    }
    
    private func processJsonMessage(_ jsonString: String) {
        print("Got JSON from glasses: \(jsonString)")
        
        do {
            guard let data = jsonString.data(using: .utf8),
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }
            
            // Check for C-wrapped format
            if let cContent = json["C"] as? String {
                if let innerData = cContent.data(using: .utf8),
                   let innerJson = try JSONSerialization.jsonObject(with: innerData) as? [String: Any] {
                    processJsonObject(innerJson)
                } else {
                    processJsonObject(json)
                }
            } else {
                processJsonObject(json)
            }
        } catch {
            print("Error parsing JSON: \(error)")
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
            print("💓 Received pong response - connection healthy")
            
        case "keep_alive_ack":
            emitKeepAliveAck(json)
            
        default:
            // Forward unknown types to observable
            jsonObservable?(json)
        }
    }
    
    private func processK900JsonMessage(_ json: [String: Any]) {
        guard let command = json["C"] as? String else { return }
        
        print("Processing K900 command: \(command)")
        
        switch command {
        case "sr_batv":
            if let body = json["B"] as? [String: Any],
               let voltage = body["vt"] as? Int,
               let percentage = body["pt"] as? Int {
                
                let voltageVolts = Double(voltage) / 1000.0
                let isCharging = voltage > 4000
                
                print("🔋 K900 Battery Status - Voltage: \(voltageVolts)V, Level: \(percentage)%")
                updateBatteryStatus(level: percentage, charging: isCharging)
            }
            
        default:
            print("Unknown K900 command: \(command)")
            jsonObservable?(json)
        }
    }
    
    // MARK: - Message Handlers
    
    private func handleGlassesReady() {
        print("🎉 Received glasses_ready message - SOC is booted and ready!")
        
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
        
        print("Received WiFi scan results: \(networks.count) networks found")
        emitWifiScanResult(networks)
    }
    
    private func handleButtonPress(_ json: [String: Any]) {
        let buttonId = json["buttonId"] as? String ?? "unknown"
        let pressType = json["pressType"] as? String ?? "short"
        let timestamp = json["timestamp"] as? Int64 ?? Int64(Date().timeIntervalSince1970 * 1000)
        
        print("Received button press - buttonId: \(buttonId), pressType: \(pressType)")
        emitButtonPress(buttonId: buttonId, pressType: pressType, timestamp: timestamp)
    }
    
    private func handleVersionInfo(_ json: [String: Any]) {
        let appVersion = json["app_version"] as? String ?? ""
        let buildNumber = json["build_number"] as? String ?? ""
        let deviceModel = json["device_model"] as? String ?? ""
        let androidVersion = json["android_version"] as? String ?? ""
        
        print("Glasses Version - App: \(appVersion), Build: \(buildNumber), Device: \(deviceModel), Android: \(androidVersion)")
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
            print("Error creating JSON: \(error)")
        }
    }
    
    private func sendDataToGlasses(_ data: String) {
        guard !data.isEmpty else {
            print("Cannot send empty data to glasses")
            return
        }
        
        do {
            // Create wrapper JSON
            let wrapper: [String: Any] = [
                "C": data,
                "W": 1
            ]
            
            let jsonData = try JSONSerialization.data(withJSONObject: wrapper)
            guard let jsonString = String(data: jsonData, encoding: .utf8) else { return }
            
            print("Sending data to glasses: \(jsonString)")
            
            // Pack the command
            let packedData = packCommand(jsonString)
            queueData(packedData)
            
        } catch {
            print("Error creating data JSON: \(error)")
        }
    }
    
    private func packCommand(_ jsonData: String) -> Data {
        guard let jsonBytes = jsonData.data(using: .utf8) else { return Data() }
        let jsonLength = jsonBytes.count
        
        var result = Data()
        
        // Start code ##
        result.append(0x23) // #
        result.append(0x23) // #
        
        // Command type
        result.append(0x30)
        
        // Length (little-endian)
        result.append(UInt8(jsonLength & 0xFF))
        result.append(UInt8((jsonLength >> 8) & 0xFF))
        
        // JSON data
        result.append(jsonBytes)
        
        // End code $$
        result.append(0x24) // $
        result.append(0x24) // $
        
        return result
    }
    
    // MARK: - Status Requests
    
    private func requestBatteryStatus() {
        let json: [String: Any] = ["type": "request_battery_state"]
        sendJson(json)
        
        // Also request K900 battery
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
            print("Error creating K900 battery request: \(error)")
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
        print("Preparing to send coreToken to ASG client")
        
        guard let coreToken = UserDefaults.standard.string(forKey: KEY_CORE_TOKEN), !coreToken.isEmpty else {
            print("No coreToken available to send to ASG client")
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
        print("💓 Starting heartbeat mechanism")
        heartbeatCounter = 0
        
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: HEARTBEAT_INTERVAL_MS, repeats: true) { [weak self] _ in
            self?.sendHeartbeat()
        }
    }
    
    private func stopHeartbeat() {
        print("💓 Stopping heartbeat mechanism")
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        heartbeatCounter = 0
    }
    
    private func sendHeartbeat() {
        guard glassesReady && connectionState == .connected else {
            print("Skipping heartbeat - glasses not ready or not connected")
            return
        }
        
        let json: [String: Any] = ["type": "ping"]
        sendJson(json)
        
        heartbeatCounter += 1
        print("💓 Heartbeat #\(heartbeatCounter) sent")
        
        // Request battery status periodically
        if heartbeatCounter % BATTERY_REQUEST_EVERY_N_HEARTBEATS == 0 {
            print("🔋 Requesting battery status (heartbeat #\(heartbeatCounter))")
            requestBatteryStatus()
        }
    }
    
    private func startReadinessCheckLoop() {
        stopReadinessCheckLoop()
        
        readinessCheckCounter = 0
        glassesReady = false
        
        print("🔄 Starting glasses SOC readiness check loop")
        
        readinessCheckTimer = Timer.scheduledTimer(withTimeInterval: READINESS_CHECK_INTERVAL_MS, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            
            guard self.connectionState == .connected && !self.isKilled && !self.glassesReady else {
                self.stopReadinessCheckLoop()
                return
            }
            
            self.readinessCheckCounter += 1
            print("🔄 Readiness check #\(self.readinessCheckCounter): waiting for glasses SOC to boot")
            
            let json: [String: Any] = [
                "type": "phone_ready",
                "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
            ]
            
            self.sendJson(json)
        }
    }
    
    private func stopReadinessCheckLoop() {
        readinessCheckTimer?.invalidate()
        readinessCheckTimer = nil
        print("🔄 Stopped glasses SOC readiness check loop")
    }
    
    private func startConnectionTimeout() {
        connectionTimeoutTimer?.invalidate()
//        connectionTimeoutTimer = Timer.scheduledTimer(withTimeInterval: CONNECTION_TIMEOUT_MS / 1_000_000_000, repeats: false) { [weak self] _ in
//            guard let self = self else { return }
//            
//            if self.isConnecting && self.connectionState != .connected {
//                print("Connection timeout - closing GATT connection")
//                self.isConnecting = false
//                
//                if let peripheral = self.connectedPeripheral {
//                    self.centralManager?.cancelPeripheralConnection(peripheral)
//                }
//                
//                self.handleReconnection()
//            }
//        }
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
        
        // emitEvent("BatteryLevelEvent", body: eventBody)
    }
    
    private func emitWifiStatusChange(connected: Bool, ssid: String) {
        let eventBody: [String: Any] = [
            "device_model": "Mentra Live",
            "connected": connected,
            "ssid": ssid
        ]
        
        // emitEvent("GlassesWifiStatusChange", body: eventBody)
    }
    
    private func emitWifiScanResult(_ networks: [String]) {
        let eventBody: [String: Any] = [
            "device_model": "Mentra Live",
            "networks": networks
        ]
        
        // emitEvent("GlassesWifiScanResultEvent", body: eventBody)
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
                CoreCommsService.emitter.sendEvent(withName: eventName, body: jsonString)
                print("Would emit event: \(eventName) with body: \(jsonString)")
            }
        } catch {
            print("Error converting event to JSON: \(error)")
        }
    }
    
    // MARK: - Cleanup
    
    private func destroy() {
        print("Destroying MentraLiveManager")
        
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
