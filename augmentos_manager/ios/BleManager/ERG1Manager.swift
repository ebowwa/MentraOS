//
//  ERG1Manager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/3/25.
//

import Combine
import CoreBluetooth
import Foundation
import UIKit
import React

extension Data {
  func chunked(into size: Int) -> [Data] {
    var chunks = [Data]()
    var index = 0
    while index < count {
      let chunkSize = Swift.min(size, count - index)
      let chunk = subdata(in: index..<(index + chunkSize))
      chunks.append(chunk)
      index += chunkSize
    }
    return chunks
  }
  
  func hexEncodedString() -> String {
    return map { String(format: "%02x", $0) }.joined()
  }
}

struct BufferedCommand {
  let data: [UInt8]
  let sendLeft: Bool
  let sendRight: Bool
  var waitTime: Int
  
  init(data: [UInt8], sendLeft: Bool = true, sendRight: Bool = true, waitTime: Int = -1) {
    self.data = data
    self.sendLeft = sendLeft
    self.sendRight = sendRight
    self.waitTime = waitTime
  }
}

// Simple struct to hold app info
struct AppInfo {
  let id: String
  let name: String
}

enum GlassesError: Error {
  case missingGlasses(String)
}

struct ViewState {
  var topText: String
  var bottomText: String
  var layoutType: String
  var text: String
}

@objc(ERG1Manager) class ERG1Manager: NSObject {
  
  // todo: we probably don't need this
  @objc static func requiresMainQueueSetup() -> Bool { return true }
  
  var onConnectionStateChanged: (() -> Void)?
  private var _g1Ready: Bool = false
  public var g1Ready: Bool {
    get { return _g1Ready }
    set {
      let oldValue = _g1Ready
      _g1Ready = newValue
      if oldValue != newValue {
        // Call the callback when state changes
        onConnectionStateChanged?()
      }
      if (!newValue) {
        // Reset battery levels when disconnected
        batteryLevel = -1
        leftBatteryLevel = -1
        rightBatteryLevel = -1
      }
    }
  }
  
  @Published public var compressedVoiceData: Data = Data()
  @Published public var aiListening: Bool = false
  @Published public var batteryLevel: Int = -1
  @Published public var caseBatteryLevel: Int = -1
  @Published public var leftBatteryLevel: Int = -1
  @Published public var rightBatteryLevel: Int = -1
  @Published public var caseCharging = false
  @Published public var caseOpen = false
  
  var viewStates: [ViewState] = [
    ViewState(topText: " ", bottomText: " ", layoutType: "text_wall", text: ""),
    ViewState(topText: " ", bottomText: " ", layoutType: "text_wall", text: "AUGMENTOS_SERVER_NOT_CONNECTED"),
  ]
  
  enum AiMode: String {
    case AI_REQUESTED
    case AI_MIC_ON
    case AI_IDLE
  }
  
  let UART_SERVICE_UUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
  let UART_TX_CHAR_UUID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
  let UART_RX_CHAR_UUID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
  
  private var commandQueue: [BufferedCommand] = []
  // Semaphores for synchronization
  private let queueLock = DispatchSemaphore(value: 1)
  private let leftSemaphore = DispatchSemaphore(value: 0)  // Start at 0 to block
  private let rightSemaphore = DispatchSemaphore(value: 0)  // Start at 0 to block
  private var leftAck = false
  private var rightAck = false
  
  // Constants
  var DEVICE_SEARCH_ID = "NOT_SET"
  let DELAY_BETWEEN_CHUNKS_SEND: UInt64 = 16_000_000 // 16ms
  let DELAY_BETWEEN_SENDS_MS: UInt64 = 8_000_000 // 8ms
  let INITIAL_CONNECTION_DELAY_MS: UInt64 = 350_000_000 // 350ms
  public var textHelper = G1Text()
  
  public let WHITELIST_CMD: UInt8 = 0x04 // Command ID for whitelist
  
  public static let _bluetoothQueue = DispatchQueue(label: "BluetoothG1", qos: .userInitiated)
  
  private var aiMode: AiMode = .AI_IDLE {
    didSet {
      if aiMode == .AI_MIC_ON {
        aiListening = true
      } else {
        aiListening = false
      }
    }
  }
  
  private var responseModel:AiResponseToG1Model?
  private var displayingResponseAiRightAck: Bool = false
  private var displayingResponseAiLeftAck: Bool = false
  
  private var evenaiSeq: UInt8 = 0
  private var centralManager: CBCentralManager!
  private var leftPeripheral: CBPeripheral?
  private var rightPeripheral: CBPeripheral?
  private var connectedDevices: [String: (CBPeripheral?, CBPeripheral?)] = [:]
  var lastConnectionTimestamp: Date = Date.distantPast
  private var leftInitialized: Bool = false
  private var rightInitialized: Bool = false
  private var isHeadUp = false
  public var dashboardEnabled = true
  
  private var aiTriggerTimeoutTimer: Timer?
  
  override init() {
    super.init()
    centralManager = CBCentralManager(delegate: self, queue: ERG1Manager._bluetoothQueue)
    setupCommandQueue()
  }
  
  // @@@ REACT NATIVE FUNCTIONS @@@
  
  @objc func RN_setSearchId(_ searchId: String) {
    print("SETTING SEARCH_ID: \(searchId)")
    DEVICE_SEARCH_ID = searchId
  }
  
  // this scans for new (un-paired) glasses to connect to:
  @objc func RN_startScan() -> Bool {
    guard centralManager.state == .poweredOn else {
      print("Bluetooth is not powered on.")
      return false
    }
    
    print("startScan()")
    
    // send our already connected devices to RN:
    let devices = getConnectedDevices()
    for device in devices {
      if let name = device.name {
        print("Connected to device: \(name)")
        if name.contains("_L_") && name.contains(DEVICE_SEARCH_ID) {
          leftPeripheral = device
          device.delegate = self
          device.discoverServices([UART_SERVICE_UUID])
        } else if name.contains("_R_") && name.contains(DEVICE_SEARCH_ID) {
          rightPeripheral = device
          device.delegate = self
          device.discoverServices([UART_SERVICE_UUID])
        }
        emitDiscoveredDevice(name);
      }
    }
    
    centralManager.scanForPeripherals(withServices: nil, options: nil)
    return true
  }
  
  @objc public func RN_pairById(_ id: String) -> Bool {
    self.DEVICE_SEARCH_ID = "_" + id + "_"
    RN_startScan();
    return true
  }
  
  // connect to glasses we've discovered:
  @objc public func RN_connectGlasses() -> Bool {
    print("RN_connectGlasses()")
    
    if let side = leftPeripheral {
      centralManager.connect(side, options: nil)
    }
    
    if let side = rightPeripheral {
      centralManager.connect(side, options: nil)
    }
    
    // just return if we don't have both a left and right arm:
    guard leftPeripheral != nil && rightPeripheral != nil else {
      return false;
    }
    
    print("found both glasses \(leftPeripheral!.name ?? "(unknown)"), \(rightPeripheral!.name ?? "(unknown)") starting heartbeat timer and stopping scan");
    startHeartbeatTimer();
    RN_stopScan();
    return true
  }
  
  @objc public func RN_sendText(_ text: String) -> Void {
    // Use Task to handle async operations properly
    Task {
      
      let displayText = "\(text)"
      guard let textData = displayText.data(using: .utf8) else { return }
      
      var command: [UInt8] = [
        0x4E,           // SEND_RESULT command
        0x00,           // sequence number
        0x01,           // total packages
        0x00,           // current package
        0x71,           // screen status (0x70 Text Show | 0x01 New Content)
        0x00,           // char position 0
        0x00,           // char position 1
        0x01,           // page number
        0x01            // max pages
      ]
      command.append(contentsOf: Array(textData))
      
//      await sendCommand(command)
      self.queueCommand(command)
    }
  }
  
  @objc public func RN_sendTextWall(_ text: String) -> Void {
    let chunks = textHelper.createTextWallChunks(text)
    //      sendChunks(chunks)
    for chunk in chunks {
      print("Sending chunk: \(chunk)")
      queueCommand(chunk, sleepAfterMs: 50)
    }
  }
  
  
  @objc public func RN_sendDoubleTextWall(_ top: String, _ bottom: String) -> Void {
    let chunks = textHelper.createDoubleTextWallChunks(textTop: top, textBottom: bottom)
    Task {
      for chunk in chunks {
//        usleep(50000)// sleep for 50ms// TODO: ios not sure if necessary
//        await sendCommand(chunk)
        queueCommand(chunk, sleepAfterMs: 50)
      }
    }
  }
  
  public func handleDisplayEvent(_ event: [String: Any]) -> Void {
    
    guard let view = event["view"] as? String else {
      print("invalid view")
      return
    }
    let isDashboard = view == "dashboard"
    
    var stateIndex = 0;
    if (isDashboard) {
      stateIndex = 1
    } else {
      stateIndex = 0
    }
    
    let layout = event["layout"] as! [String: Any];
    self.viewStates[stateIndex].layoutType = layout["layoutType"] as! String
    
    switch self.viewStates[stateIndex].layoutType {
    case "text_wall":
      self.viewStates[stateIndex].text = layout["text"] as? String ?? " "
      break
    case "double_text_wall":
      self.viewStates[stateIndex].topText = layout["topText"] as? String ?? " "
      self.viewStates[stateIndex].bottomText = layout["bottomText"] as? String ?? " "
      break
    default:
      break
    }
    
    // send the state we just received if the user is currently in that state:
    if (stateIndex == 0 && !isHeadUp) {
      sendCurrentState(false)
    } else if (stateIndex == 1 && isHeadUp) {
      sendCurrentState(true)
    }
  }
  
  public func sendCurrentState(_ isDashboard: Bool) -> Void {
    Task {
      var currentViewState: ViewState!;
      if (isDashboard) {
        currentViewState = self.viewStates[1]
      } else {
        currentViewState = self.viewStates[0]
      }
      
      if (isDashboard && !dashboardEnabled) {
        return
      }
      
      let layoutType = currentViewState.layoutType
      switch layoutType {
      case "text_wall":
        let text = currentViewState.text
        //        let chunks = textHelper.createTextWallChunks(text)
        //        for chunk in chunks {
        //          print("Sending chunk: \(chunk)")
        //          await sendCommand(chunk)
        //        }
        RN_sendText(text);
        break
      case "double_text_wall":
        let topText = currentViewState.topText
        let bottomText = currentViewState.bottomText
        RN_sendDoubleTextWall(topText, bottomText);
        break
      default:
        break
      }
      
    }
  }
  
  @objc func RN_stopScan() {
    centralManager.stopScan()
    print("Stopped scanning for devices")
  }
  
  @objc func disconnect() {
    if let leftPeripheral = leftPeripheral {
      centralManager.cancelPeripheralConnection(leftPeripheral)
    }
    
    if let rightPeripheral = rightPeripheral {
      centralManager.cancelPeripheralConnection(rightPeripheral)
    }
    
    // TODO: ios doesn't actually disconnect but it does forget all references to the peripherals
    
    leftPeripheral = nil
    rightPeripheral = nil
    self.g1Ready = false
    
    print("Disconnected from glasses")
  }
  
  // @@@ END REACT NATIVE FUNCTIONS
  
  
  private func setupCommandQueue() {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      
      while true {
        var commandToProcess: BufferedCommand?
        
        // Try to get a number from the queue
        self.queueLock.wait()
        if !self.commandQueue.isEmpty {
          commandToProcess = self.commandQueue.removeFirst()  // FIFO - remove from the front
        }
        self.queueLock.signal()
        
        // If no command, just poll again after a short delay
        if commandToProcess == nil {
          Thread.sleep(forTimeInterval: 0.1)  // Simple polling
          continue
        }
        
        let command = commandToProcess!
        
        let semaphore = DispatchSemaphore(value: 0)
        Task {
          await self.processCommand(command)
          semaphore.signal()
        }
        semaphore.wait()// waits until the command is done processing
      }
    }
    
  }
  
  // Process a single number with timeouts
  private func processCommand(_ command: BufferedCommand) async {
    
    var attempts = 0
    var maxAttempts = 3
    var result: Bool = false
    
    // first send to the left:
    if command.sendLeft {
      await sendCommandToSide(command.data, side: "left")
      // wait for the left to acknowledge:
      while attempts < maxAttempts && !result {
        if (attempts > 0) {
          print("trying again to send to left: \(attempts)")
        }
        await sendCommandToSide(command.data, side: "left")
        attempts += 1
        // wait for the left to acknowledge:
        result = waitForLeft(timeout: 0.1)
      }
    }
    
    attempts = 0
    
    if command.sendRight {
      await sendCommandToSide(command.data, side: "right")
      while attempts < maxAttempts && !result {
        if (attempts > 0) {
          print("trying again to send to right: \(attempts)")
        }
        await sendCommandToSide(command.data, side: "right")
        attempts += 1
        // wait for the left to acknowledge:
        result = waitForLeft(timeout: 0.1)
      }
    }
    
    if command.waitTime > 0 {
      // wait waitTime milliseconds before returning:
      try? await Task.sleep(nanoseconds: UInt64(command.waitTime) * 1_000_000)
    } else {
      // sleep for a min of 25ms:
      try? await Task.sleep(nanoseconds: UInt64(25) * 1_000_000)
    }
  }
  
  // Wait for A to be true with timeout
  private func waitForLeft(timeout: TimeInterval) -> Bool {
    let result = leftSemaphore.wait(timeout: .now() + timeout)
    return result == .success
  }
  
  // Wait for B to be true with timeout
  private func waitForRight(timeout: TimeInterval) -> Bool {
    let result = rightSemaphore.wait(timeout: .now() + timeout)
    return result == .success
  }
  
  private func startAITriggerTimeoutTimer() {
    let backgroundQueue = DispatchQueue(label: "com.sample.aiTriggerTimerQueue", qos: .default)
    
    backgroundQueue.async { [weak self] in
      self?.aiTriggerTimeoutTimer = Timer(timeInterval: 6.0, repeats: false) { [weak self] _ in
        guard let self = self else { return }
        guard let rightPeripheral = self.rightPeripheral else { return }
        guard let leftPeripheral = self.leftPeripheral else { return }
        sendMicOn(to: rightPeripheral, isOn: false)
        
        if let leftChar = getWriteCharacteristic(for: leftPeripheral),
           let rightChar = getWriteCharacteristic(for: rightPeripheral) {
          exitAllFunctions(to: leftPeripheral, characteristic: leftChar)
          exitAllFunctions(to: rightPeripheral, characteristic: rightChar)
        }
      }
      
      RunLoop.current.add((self?.aiTriggerTimeoutTimer)!, forMode: .default)
      RunLoop.current.run()
    }
  }
  
  func startHeartbeatTimer() {
    let backgroundQueue = DispatchQueue(label: "com.sample.heartbeatTimerQueue", qos: .background)
    
    backgroundQueue.async { [weak self] in
      let timer = Timer(timeInterval: 15.0, repeats: true) { [weak self] _ in
        guard let self = self else { return }
        guard let leftPeripheral = self.leftPeripheral else { return }
        self.sendHeartbeat(to: leftPeripheral)
        guard let rightPeripheral = self.rightPeripheral else { return }
        self.sendHeartbeat(to: rightPeripheral)
      }
      
      RunLoop.current.add(timer, forMode: .default)
      RunLoop.current.run()
    }
  }
  
  private func findCharacteristic(uuid: CBUUID, peripheral: CBPeripheral) -> CBCharacteristic? {
    for service in peripheral.services ?? [] {
      for characteristic in service.characteristics ?? [] {
        if characteristic.uuid == uuid {
          return characteristic
        }
      }
    }
    return nil
  }
  
  private func getConnectedDevices() -> [CBPeripheral] {
    let connectedPeripherals = centralManager.retrieveConnectedPeripherals(withServices: [UART_SERVICE_UUID])
    //    for peripheral in connectedPeripherals {
    //      print("Connected device: \(peripheral.name ?? "Unknown") - UUID: \(peripheral.identifier.uuidString)")
    //    }
    return connectedPeripherals
  }
  
  private func handleNotification(from peripheral: CBPeripheral, data: Data) {
    guard let command = data.first else { return }// ensure the data isn't empty
    
    //      print("received from G1: \(data.hexEncodedString())")
    
    
//    if data.count > 1 {
//      let response = data.count > 1 ? data[1] : 0
//      // Check for ACK response in various commands
//      if command == Commands.BLE_REQ_EVENAI.rawValue && response == CommandResponse.ACK.rawValue {
//        if peripheral == rightPeripheral {
//          print("Right glass acknowledged")
//          rightSemaphore.signal()
//        } else if peripheral == leftPeripheral {
//          print("Left glass acknowledged")
//          leftSemaphore.signal()
//        }
//      }
//    }
    
    switch Commands(rawValue: command) {
    case .BLE_REQ_INIT:
      handleInitResponse(from: peripheral, success: data[1] == CommandResponse.ACK.rawValue)
      break
    case .BLE_REQ_MIC_ON:
      let acknowledge = CommandResponse(rawValue: data[1])
      if acknowledge == .ACK {
        if aiMode == .AI_REQUESTED {
          aiMode = .AI_MIC_ON
          print("Microphone turned on successfully")
        } else {
          print("Microphone turned on in continuous listening mode")
        }
      } else {
        print("Microphone activation failed")
        aiMode = .AI_IDLE
      }
    case .BLE_REQ_TRANSFER_MIC_DATA:
      self.compressedVoiceData = data
      //                print("Got voice data: " + String(data.count))
      break
    case .BLE_REQ_HEARTBEAT:
      // battery info
      guard data.count >= 6 && data[1] == 0x66 else {
        break
      }
      
      // Response format: 2C 66 [battery%] [flags] [voltage_low] [voltage_high] ...
      let batteryPercent = Int(data[2])
      let flags = data[3]
      let voltageLow = Int(data[4])
      let voltageHigh = Int(data[5])
      let rawVoltage = (voltageHigh << 8) | voltageLow
      let voltage = rawVoltage / 10  // Scale down by 10 to get actual millivolts
      
      //      print("Raw battery data - Battery: \(batteryPercent)%, Voltage: \(voltage)mV, Flags: 0x\(String(format: "%02X", flags))")
      
      // if left, update left battery level, if right, update right battery level
      if peripheral == leftPeripheral {
        if leftBatteryLevel != batteryPercent {
          print("Left glass battery: \(batteryPercent)%")
          leftBatteryLevel = batteryPercent
        }
      } else if peripheral == rightPeripheral {
        if rightBatteryLevel != batteryPercent {
          print("Right glass battery: \(batteryPercent)%")
          rightBatteryLevel = batteryPercent
        }
      }
      
      // update the main battery level as the lower of the two
      let newBatteryLevel = min(leftBatteryLevel, rightBatteryLevel)
      if (self.batteryLevel != newBatteryLevel) {
        self.batteryLevel = min(leftBatteryLevel, rightBatteryLevel)
      }
      break
    case .BLE_REQ_EVENAI:
      guard data.count > 1 else { break }
      let acknowledge = CommandResponse(rawValue: data[1])
      if acknowledge == .ACK {
        if peripheral == self.leftPeripheral {
          leftSemaphore.signal()
        }
        if peripheral == self.rightPeripheral {
          rightSemaphore.signal()
        }
      }
      //      print("Received EvenAI response: \(data.hexEncodedString())")
    case .BLE_REQ_DEVICE_ORDER:
      let order = data[1]
      switch DeviceOrders(rawValue: order) {
      case .HEAD_UP:
        isHeadUp = true
        sendCurrentState(true)
        break
      case .HEAD_UP2:
        isHeadUp = true
        sendCurrentState(true)
        break
      case .HEAD_DOWN:
        isHeadUp = false
        sendCurrentState(false)
        break
      case .HEAD_DOWN2:
        isHeadUp = false
        sendCurrentState(false)
        break
      case .ACTIVATED:
        print("ACTIVATED")
        break
      case .SILENCED:
        print("SILENCED")
        break
      case .DISPLAY_READY:
        self.responseModel = nil
      case .TRIGGER_FOR_AI:
        if let rightPeripheral {
          aiTriggerTimeoutTimer?.invalidate()
          aiTriggerTimeoutTimer = nil
          startAITriggerTimeoutTimer()
          aiMode = .AI_REQUESTED
          sendMicOn(to: rightPeripheral, isOn: true)
        }
        print("Trigger AI")
      case .TRIGGER_FOR_STOP_RECORDING:
        aiTriggerTimeoutTimer?.invalidate()
        aiTriggerTimeoutTimer = nil
        aiMode = .AI_IDLE
      case .TRIGGER_CHANGE_PAGE:
        guard var responseModel else { return }
      case .CASE_OPEN:
        self.caseOpen = true
        print("CASE OPEN");
      case .CASE_CLOSED:
        self.caseOpen = false
        print("CASE CLOSED");
      case .CASE_CHARGING_STATUS:
        guard data.count >= 3 else { break }
        let status = data[2]
        if status == 0x01 {
          self.caseCharging = true
          print("CASE CHARGING")
        } else {
          self.caseCharging = false
          print("CASE NOT CHARGING")
        }
      case .CASE_CHARGE_INFO:
        print("CASE CHARGE INFO")
        guard data.count >= 3 else { break }
        caseBatteryLevel = Int(data[2])
        print("Case battery level: \(caseBatteryLevel)%")
      case .DOUBLE_TAP:
        print("DOUBLE TAP")
      default:
        print("Received device order: \(data.subdata(in: 1..<data.count).hexEncodedString())")
        break
      }
    default:
      //          print("received from G1(not handled): \(data.hexEncodedString())")
      break
    }
  }
}
// MARK: Commands
extension ERG1Manager {
  
  // Handle whitelist functionality
  func getWhitelistChunks() -> [[UInt8]] {
    // Define the hardcoded whitelist JSON
    let apps = [
      AppInfo(id: "com.augment.os", name: "AugmentOS"),
      AppInfo(id: "io.heckel.ntfy", name: "ntfy")
    ]
    let whitelistJson = createWhitelistJson(apps: apps)
    
    print("Creating chunks for hardcoded whitelist: \(whitelistJson)")
    
    // Convert JSON to bytes and split into chunks
    return createWhitelistChunks(json: whitelistJson)
  }
  
  private func createWhitelistJson(apps: [AppInfo]) -> String {
    do {
      // Create app list array
      var appList: [[String: Any]] = []
      for app in apps {
        let appDict: [String: Any] = [
          "id": app.id,
          "name": app.name
        ]
        appList.append(appDict)
      }
      
      // Create the whitelist dictionary
      let whitelistDict: [String: Any] = [
        "calendar_enable": true,
        "call_enable": true,
        "msg_enable": true,
        "ios_mail_enable": true,
        "app": [
          "list": appList,
          "enable": true
        ]
      ]
      
      // Convert to JSON string
      let jsonData = try JSONSerialization.data(withJSONObject: whitelistDict, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        return jsonString
      } else {
        return "{}"
      }
    } catch {
      print("Error creating whitelist JSON: \(error.localizedDescription)")
      return "{}"
    }
  }
  
  // Helper function to split JSON into chunks
  private func createWhitelistChunks(json: String) -> [[UInt8]] {
    let MAX_CHUNK_SIZE = 180 - 4 // Reserve space for the header
    guard let jsonData = json.data(using: .utf8) else { return [] }
    
    let totalChunks = Int(ceil(Double(jsonData.count) / Double(MAX_CHUNK_SIZE)))
    var chunks: [Data] = []
    
    print("jsonData.count = \(jsonData.count), totalChunks = \(totalChunks)")
    
    for i in 0..<totalChunks {
      let start = i * MAX_CHUNK_SIZE
      let end = min(start + MAX_CHUNK_SIZE, jsonData.count)
      let range = start..<end
      let payloadChunk = jsonData.subdata(in: range)
      
      // Create the header: [WHITELIST_CMD, total_chunks, chunk_index]
      var headerData = Data()
      headerData.append(WHITELIST_CMD)
      headerData.append(UInt8(totalChunks))
      headerData.append(UInt8(i))
      
      // Combine header and payload
      var chunkData = Data()
      chunkData.append(headerData)
      chunkData.append(payloadChunk)
      
      chunks.append(chunkData)
    }
    
    var uintChunks: [[UInt8]] = []
    for chunk in chunks {
      uintChunks.append(Array(chunk))
    }
    return uintChunks
    //    return chunks.flatMap { Array($0) }
  }
  
  func exitAllFunctions(to peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    var data = Data()
    data.append(Commands.BLE_EXIT_ALL_FUNCTIONS.rawValue)
    peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
  }
  
  private func sendMicOn(to peripheral: CBPeripheral, isOn: Bool) {
    var micOnData = Data()
    micOnData.append(Commands.BLE_REQ_MIC_ON.rawValue)
    if isOn {
      micOnData.append(0x01)
    } else {
      micOnData.append(0x00)
    }
    
    if let txChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: peripheral) {
      peripheral.writeValue(micOnData, for: txChar, type: .withResponse)
    }
  }
  
  private func sendInitCommand(to peripheral: CBPeripheral, characteristic: CBCharacteristic) {
    let initData = Data([Commands.BLE_REQ_INIT.rawValue, 0x01])
    peripheral.writeValue(initData, for: characteristic, type: .withResponse)
  }
  
  private func handleInitResponse(from peripheral: CBPeripheral, success: Bool) {
    if peripheral == leftPeripheral {
      leftInitialized = success
      print("Left arm initialized: \(success)")
    } else if peripheral == rightPeripheral {
      rightInitialized = success
      print("Right arm initialized: \(success)")
    }
    
    // Only proceed if both glasses are initialized
    if leftInitialized && rightInitialized {
      print("Both arms initialized")
      g1Ready = true
      Task {
        await getBatteryStatus()
      }
    }
  }
  
  private func sendHeartbeat(to peripheral: CBPeripheral) {
    var heartbeatData = Data()
    heartbeatData.append(Commands.BLE_REQ_HEARTBEAT.rawValue)
    heartbeatData.append(UInt8(0x02 & 0xFF))
    
    if let txChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: peripheral) {
      let hexString = heartbeatData.map { String(format: "%02X", $0) }.joined()
      peripheral.writeValue(heartbeatData, for: txChar, type: .withoutResponse)
    }
  }
  
  public func sendCommandToSide(_ command: [UInt8], side: String) async {
    // Ensure command is exactly 20 bytes
    var paddedCommand = command
    while paddedCommand.count < 20 {
      paddedCommand.append(0x00)
    }
    
    // Convert to Data
    let commandData = Data(paddedCommand)
    //    print("Sending command to glasses: \(paddedCommand.map { String(format: "%02X", $0) }.joined(separator: " "))")
    
    if (side == "left") {
      // send to left
      if let leftPeripheral = leftPeripheral,
         let characteristic = leftPeripheral.services?
        .first(where: { $0.uuid == UART_SERVICE_UUID })?
        .characteristics?
        .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
        leftPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      }
    } else {
      // send to right
      if let rightPeripheral = rightPeripheral,
         let characteristic = rightPeripheral.services?
        .first(where: { $0.uuid == UART_SERVICE_UUID })?
        .characteristics?
        .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
        rightPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      }
    }
  }
  
  
  public func sendCommand(_ command: [UInt8]) async {
    // Ensure command is exactly 20 bytes
    var paddedCommand = command
    while paddedCommand.count < 20 {
      paddedCommand.append(0x00)
    }
    
    // Convert to Data
    let commandData = Data(paddedCommand)
    //    print("Sending command to glasses: \(paddedCommand.map { String(format: "%02X", $0) }.joined(separator: " "))")
    
    
    // send to left
    if let leftPeripheral = leftPeripheral,
       let characteristic = leftPeripheral.services?
      .first(where: { $0.uuid == UART_SERVICE_UUID })?
      .characteristics?
      .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
      leftPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay after sending
    }
    
    // send to right
    if let rightPeripheral = rightPeripheral,
       let characteristic = rightPeripheral.services?
      .first(where: { $0.uuid == UART_SERVICE_UUID })?
      .characteristics?
      .first(where: { $0.uuid == UART_TX_CHAR_UUID }) {
      rightPeripheral.writeValue(commandData, for: characteristic, type: .withResponse)
      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay after sending
    }
  }
  
  public func queueCommand(_ command: [UInt8], sendLeft: Bool = true, sendRight: Bool = true, sleepAfterMs: Int = 50) {
    
    let bufferedCommand = BufferedCommand(data: command, sendLeft: sendLeft, sendRight: sendRight, waitTime: sleepAfterMs);
    
    queueLock.wait()
    commandQueue.append(bufferedCommand)
    queueLock.signal()
  }
  
  
  @objc func RN_sendWhitelist() {
    print("sending whitelist")
      let whitelistChunks = getWhitelistChunks()
      for chunk in whitelistChunks {
        queueCommand(chunk, sendLeft: true, sendRight: true, sleepAfterMs: 100)
      }
  }
  
  @objc public func RN_setBrightness(_ level: Int, autoMode: Bool = false) {
    // Convert from percentage (0-100) to the correct range (0-41)
    let mappedLevel = min(41, max(0, Int((Double(level) / 100.0) * 41.0)))
    
    // Create and capture the UInt8 value
    let brightnessLevel = UInt8(mappedLevel)
    
    // Call the async function from a non-async context
    Task {
      let success = await setBrightness(brightnessLevel, autoMode: autoMode)
      if !success {
        NSLog("Failed to set brightness to level \(level)% (mapped to \(mappedLevel))")
      }
    }
  }
  
  public func setBrightness(_ level: UInt8, autoMode: Bool = false) async -> Bool {
    // Ensure level is between 0x00 and 0x29 (0-41)
    var lvl: UInt8 = level
    if (level > 0x29) {
      lvl = 0x29
    }
    
    let command: [UInt8] = [Commands.BRIGHTNESS.rawValue, lvl, autoMode ? 0x01 : 0x00]
    
    queueCommand(command)
    
//    // Send to both glasses with proper timing
//    if let rightGlass = rightPeripheral,
//       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
//      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
//      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
//    }
//    
//    if let leftGlass = leftPeripheral,
//       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
//      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
//    }
    
    return true
  }
  
  @objc public func RN_setHeadUpAngle(_ angle: Int) {
    var agl: Int = angle
    if (angle < 0) {
      agl = 0;
    } else if (angle > 60) {
      agl = 60;
    }
    
    // Call the async function from a non-async context
    Task {
      let success = await setHeadUpAngle(UInt8(agl))
      if !success {
        NSLog("Failed to set angle to \(angle)")
      }
    }
  }
  
  public func setHeadUpAngle(_ angle: UInt8) async -> Bool {
    
    let command: [UInt8] = [Commands.HEAD_UP_ANGLE.rawValue, angle, 0x01]
    
    queueCommand(command)
    
//    // Send to both glasses with proper timing
//    if let rightGlass = rightPeripheral,
//       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
//      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
//      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
//    }
//    
//    if let leftGlass = leftPeripheral,
//       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
//      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
//    }
    return true
  }
  
  @objc public func RN_getBatteryStatus() {
    Task {
      await getBatteryStatus()
    }
  }
  
  public func getBatteryStatus() async {
    print("getBatteryStatus()")
    
    // Build battery status command
    let command: [UInt8] = [0x2C, 0x01]
    
    queueCommand(command)
    
//    // Send to both glasses
//    if let rightGlass = rightPeripheral,
//       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
//      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
//      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
//    }
//    
//    if let leftGlass = leftPeripheral,
//       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
//      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
//    }
  }
  
  public func setSilentMode(_ enabled: Bool) async -> Bool {
    let command: [UInt8] = [Commands.SILENT_MODE.rawValue, enabled ? 0x0C : 0x0A, 0x00]
    queueCommand(command)
    
//    // Send to both glasses with proper timing
//    if let rightGlass = rightPeripheral,
//       let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) {
//      rightGlass.writeValue(Data(command), for: rightTxChar, type: .withResponse)
//      try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
//    }
//    
//    if let leftGlass = leftPeripheral,
//       let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) {
//      leftGlass.writeValue(Data(command), for: leftTxChar, type: .withResponse)
//    }
    return true
  }
  
  @objc public func RN_setDashboardPosition(_ position: Int) {
    Task {
      await setDashboardPosition(DashboardPosition(rawValue: UInt8(position)) ?? DashboardPosition.position0)
    }
  }
  
  public func setDashboardPosition(_ position: DashboardPosition) async -> Bool {
    guard let rightGlass = rightPeripheral,
          let leftGlass = leftPeripheral,
          let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass),
          let leftTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: leftGlass) else {
      return false
    }
    
    // Build dashboard position command
    var command = Data()
    command.append(Commands.DASHBOARD_POSITION_COMMAND.rawValue)
    command.append(0x07) // Length
    command.append(0x00) // Sequence
    command.append(0x01) // Fixed value
    command.append(0x02) // Fixed value
    command.append(0x01) // State ON
    command.append(position.rawValue) // Position value
    
    // convert command to array of UInt8
    let commandArray = command.map { $0 }
    queueCommand(commandArray)
    
//    // Send command to both glasses with proper timing
//    rightGlass.writeValue(command, for: rightTxChar, type: .withResponse)
//    try? await Task.sleep(nanoseconds: 50 * 1_000_000) // 50ms delay
//    leftGlass.writeValue(command, for: leftTxChar, type: .withResponse)
    return true
  }
  
  @objc public func RN_setMicEnabled(_ enabled: Bool) {
    Task {
      await setMicEnabled(enabled: enabled)
    }
  }
  
  public func setMicEnabled(enabled: Bool) async -> Bool {
    guard let rightGlass = rightPeripheral,
          let rightTxChar = findCharacteristic(uuid: UART_TX_CHAR_UUID, peripheral: rightGlass) else {
      return false
    }
    
    sendMicOn(to: rightGlass, isOn: enabled)
    return true
  }
  
  
}

// MARK: BLE Stubs
extension ERG1Manager: CBCentralManagerDelegate, CBPeripheralDelegate {
  
  func getWriteCharacteristic(for peripheral: CBPeripheral?) -> CBCharacteristic? {
    guard let peripheral = peripheral else { return nil }
    for service in peripheral.services ?? [] {
      if service.uuid == UART_SERVICE_UUID {
        for characteristic in service.characteristics ?? [] where characteristic.uuid == UART_TX_CHAR_UUID {
          return characteristic
        }
      }
    }
    return nil
  }
  
  func extractIdNumber(_ string: String) -> Int? {
    // Pattern to match "G1_" followed by digits, followed by "_"
    let pattern = "G1_(\\d+)_"
    
    // Create a regular expression
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
      return nil
    }
    
    // Look for matches in the input string
    let range = NSRange(string.startIndex..<string.endIndex, in: string)
    guard let match = regex.firstMatch(in: string, options: [], range: range) else {
      return nil
    }
    
    // Extract the captured group (the digits)
    if let matchRange = Range(match.range(at: 1), in: string) {
      let idString = String(string[matchRange])
      return Int(idString)
    }
    
    return nil
  }
  
  public func emitDiscoveredDevice(_ name: String) {
    if name.contains("_L_") || name.contains("_R_") {
      // exampleName = "Even G1_74_L_57863C", "Even G1_3_L_57863C", "Even G1_100_L_57863C"
      guard let extractedNum = extractIdNumber(name) else { return }
      let res: [String: Any] = [
        "model_name": "Even Realities G1",
        "device_name": "\(extractedNum)",
      ]
      let eventBody: [String: Any] = [
        "compatible_glasses_search_result": res,
      ]
      // TODO: ios fix this (crashes sometimes!!)
      
      // must convert to string before sending:
      do {
        let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
        if let jsonString = String(data: jsonData, encoding: .utf8) {
          RNEventEmitter.emitter.sendEvent(withName: "CoreMessageIntentEvent", body: jsonString)
        }
      } catch {
        print("Error converting to JSON: \(error)")
      }
    }
  }
  
  // On BT discovery, automatically connect to both arms if we have them:
  public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
    
    guard let name = peripheral.name else { return }
    guard name.contains("Even G1") else { return }
    
    print("found peripheral: \(name) - SEARCH_ID: \(DEVICE_SEARCH_ID)")
    
    if name.contains("_L_") && name.contains(DEVICE_SEARCH_ID) {
      print("Found left arm: \(name)")
      leftPeripheral = peripheral
    } else if name.contains("_R_") && name.contains(DEVICE_SEARCH_ID) {
      print("Found right arm: \(name)")
      rightPeripheral = peripheral
    }
    
    emitDiscoveredDevice(name);
    
    if leftPeripheral != nil && rightPeripheral != nil {
      //      central.stopScan()
      RN_connectGlasses()
    }
    
  }
  
  // Update didConnect to set timestamp
  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.delegate = self
    peripheral.discoverServices([UART_SERVICE_UUID])
    
    // Update the last connection timestamp
    lastConnectionTimestamp = Date()
    print("Connected to peripheral: \(peripheral.name ?? "Unknown")")
    
    // Emit connection event
    let isLeft = peripheral == leftPeripheral
    let eventBody: [String: Any] = [
      "side": isLeft ? "left" : "right",
      "name": peripheral.name ?? "Unknown",
      "id": peripheral.identifier.uuidString
    ]
    
    // TODO: ios not actually used for anything yet, but we should trigger a re-connect if it was disconnected:
    //    RNEventEmitter.emitter.sendEvent(withName: "onConnectionStateChanged", body: eventBody)
  }
  
  public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: (any Error)?) {
    if peripheral == leftPeripheral || peripheral == rightPeripheral {
      g1Ready = false
      RN_startScan()// attempt reconnect
    }
  }
  
  public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let services = peripheral.services {
      for service in services where service.uuid == UART_SERVICE_UUID {
        peripheral.discoverCharacteristics([UART_TX_CHAR_UUID, UART_RX_CHAR_UUID], for: service)
      }
    }
  }
  
  // Update peripheral(_:didDiscoverCharacteristicsFor:error:) to set services waiters
  public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard let characteristics = service.characteristics else { return }
    
    if service.uuid.isEqual(UART_SERVICE_UUID) {
      for characteristic in characteristics {
        if characteristic.uuid == UART_TX_CHAR_UUID {
          sendInitCommand(to: peripheral, characteristic: characteristic)
        } else if characteristic.uuid == UART_RX_CHAR_UUID {
          peripheral.setNotifyValue(true, for: characteristic)
          
          // enable notification (needed for pairing from scracth!)
          Thread.sleep(forTimeInterval: 0.5) // 500ms delay
          let CLIENT_CHARACTERISTIC_CONFIG_UUID = CBUUID(string: "00002902-0000-1000-8000-00805f9b34fb");
          if let descriptor = characteristic.descriptors?.first(where: { $0.uuid == CLIENT_CHARACTERISTIC_CONFIG_UUID }) {
            let value = Data([0x01, 0x00]) // ENABLE_NOTIFICATION_VALUE in iOS
            peripheral.writeValue(value, for: descriptor)
          } else {
            print("PROC_QUEUE - descriptor not found")
          }
        }
      }
      
      // Mark the services as ready
      if peripheral == leftPeripheral {
        print("Left glass services discovered and ready")
      } else if peripheral == rightPeripheral {
        print("Right glass services discovered and ready")
      }
    }
  }
  
  // called whenever bluetooth is initialized / turned on or off:
  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      print("Bluetooth powered on")
      g1Ready = false
      // only automatically start scanning if we have a SEARCH_ID, otherwise wait for RN to call startScan() itself
      if (DEVICE_SEARCH_ID != "NOT_SET" && !DEVICE_SEARCH_ID.isEmpty) {
        RN_startScan()
      }
    } else {
      print("Bluetooth is not available.")
    }
  }
  
  // Update didUpdateValueFor to set waiters
  public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      print("Error updating value for characteristic: \(error.localizedDescription)")
      return
    }
    
    guard let data = characteristic.value else {
      print("Characteristic value is nil.")
      return
    }
    
    // Process the notification data
    handleNotification(from: peripheral, data: data)
  }
}
