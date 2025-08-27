//
//  MentraNexSGC.swift
//  MentraOS_Manager
//
//  Created by Gemini on 2024-07-29.
//

import CoreBluetooth
import Foundation
import SwiftProtobuf

// MARK: - Connection State Management

enum MentraNexConnectionState {
    case disconnected
    case connecting
    case connected
}

// Helper extension for debugging
extension Data {
    func toHexString() -> String {
        return map { String(format: "%02x", $0) }.joined(separator: " ")
    }
}

@objc(MentraNexSGC)
class MentraNexSGC: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    @objc static func requiresMainQueueSetup() -> Bool { return true }

    // MARK: - Properties

    private var centralManager: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var notifyCharacteristic: CBCharacteristic?
    private var _isScanning = false
    private var isConnecting = false
    private var nexReady = false
    private var isDisconnecting = false
    private var reconnectionTimer: Timer?
    private var reconnectionAttempts = 0
    // TODO: change this
    private let maxReconnectionAttempts = -1 // -1 for unlimited
    private let reconnectionInterval: TimeInterval = 5.0 // 5 seconds
    private var peripheralToConnectName: String?

    // Device discovery cache (like MentraLive)
    private var discoveredPeripherals = [String: CBPeripheral]() // name -> peripheral

    // Enhanced device persistence (from Java implementation)
    private let PREFS_DEVICE_NAME = "MentraNexLastConnectedDeviceName"
    private let PREFS_DEVICE_ADDRESS = "MentraNexLastConnectedDeviceAddress"
    private let PREFS_DEVICE_ID = "SavedNexIdKey"
    private let SHARED_PREFS_NAME = "NexGlassesPrefs"

    // Device state tracking (ported from Java)
    private var savedDeviceName: String?
    private var savedDeviceAddress: String?
    private var preferredDeviceId: String?
    private var isKilled = false

    private let bluetoothQueue = DispatchQueue(label: "MentraNexBluetooth", qos: .userInitiated)

    // Connection State Management (like MentraLive)
    private var _connectionState: MentraNexConnectionState = .disconnected
    var connectionState: MentraNexConnectionState {
        get { return _connectionState }
        set {
            let oldValue = _connectionState
            _connectionState = newValue
            if oldValue != newValue {
                onConnectionStateChanged?()
                print("NEX: 🔄 Connection state changed: \(oldValue) -> \(newValue)")
            }
        }
    }

    var onConnectionStateChanged: (() -> Void)?

    private var peripheralUUID: UUID? {
        get {
            if let uuidString = UserDefaults.standard.string(forKey: "nexPeripheralUUID") {
                return UUID(uuidString: uuidString)
            }
            return nil
        }
        set {
            if let newValue = newValue {
                UserDefaults.standard.set(newValue.uuidString, forKey: "nexPeripheralUUID")
            } else {
                UserDefaults.standard.removeObject(forKey: "nexPeripheralUUID")
            }
        }
    }

    // Custom Bluetooth queue for better performance (like G1)
    private static let _bluetoothQueue = DispatchQueue(label: "com.mentra.nex.bluetooth", qos: .background)

    static let shared = MentraNexSGC()

    // UUIDs from MentraNexSGC.java
    private let MAIN_SERVICE_UUID = CBUUID(string: "00004860-0000-1000-8000-00805f9b34fb")
    private let WRITE_CHAR_UUID = CBUUID(string: "000071FF-0000-1000-8000-00805f9b34fb")
    private let NOTIFY_CHAR_UUID = CBUUID(string: "000070FF-0000-1000-8000-00805f9b34fb")

    // MTU Configuration (iOS-optimized)
    private let MTU_MAX_IOS = 185 // iOS maximum (platform limitation)
    private let MTU_DEFAULT = 23 // Default BLE MTU
    private var currentMTU = 23 // Currently negotiated MTU
    private var deviceMaxMTU = 23 // Device's maximum capability
    private var maxChunkSize = 176 // Calculated optimal chunk size
    private var bmpChunkSize = 176 // Image chunk size (iOS-optimized)

    // MARK: - Command Queue (modeled after ERG1Manager)

    private struct BufferedCommand {
        let chunks: [[UInt8]]
        let waitTimeMs: Int
        let chunkDelayMs: Int

        init(chunks: [[UInt8]], waitTimeMs: Int = 0, chunkDelayMs: Int = 8) {
            self.chunks = chunks
            self.waitTimeMs = waitTimeMs
            self.chunkDelayMs = chunkDelayMs
        }
    }

    private actor CommandQueue {
        private var commands: [BufferedCommand] = []
        private var continuations: [CheckedContinuation<BufferedCommand, Never>] = []

        func enqueue(_ command: BufferedCommand) {
            if let continuation = continuations.first {
                continuations.removeFirst()
                continuation.resume(returning: command)
            } else {
                commands.append(command)
            }
        }

        func dequeue() async -> BufferedCommand {
            if let command = commands.first {
                commands.removeFirst()
                return command
            }

            return await withCheckedContinuation { continuation in
                continuations.append(continuation)
            }
        }
    }

    private let commandQueue = CommandQueue()
    private var isQueueWorkerRunning = false

    // MARK: - Initialization

    override private init() {
        super.init()
        print("NEX: 🚀 MentraNexSGC initialization started")

        // Load saved device information (from Java implementation)
        loadSavedDeviceInfo()

        // Using custom Bluetooth queue for better performance (like G1)
        print("NEX: 📱 Creating CBCentralManager with custom Bluetooth queue")
        centralManager = CBCentralManager(delegate: self, queue: MentraNexSGC._bluetoothQueue)

        print("NEX: ✅ MentraNexSGC initialization completed")
        print("NEX: 📱 Central Manager created: \(centralManager != nil ? "YES" : "NO")")
        if let centralManager = centralManager {
            print("NEX: 📱 Initial Bluetooth State: \(centralManager.state.rawValue)")
        }

        print("NEX: 💾 Loaded saved device - Name: \(savedDeviceName ?? "None"), Address: \(savedDeviceAddress ?? "None")")
    }

    private func setupCommandQueue() {
        if isQueueWorkerRunning { return }
        isQueueWorkerRunning = true

        Task.detached { [weak self] in
            guard let self = self else { return }
            while true {
                let command = await self.commandQueue.dequeue()
                await self.processCommand(command)
            }
        }
    }

    private func queueChunks(_ chunks: [[UInt8]], waitTimeMs: Int = 0, chunkDelayMs: Int = 8) {
        let cmd = BufferedCommand(chunks: chunks, waitTimeMs: waitTimeMs, chunkDelayMs: chunkDelayMs)
        Task { [weak self] in
            await self?.commandQueue.enqueue(cmd)
        }
    }

    // Enhanced method that uses MTU-optimized chunking
    private func queueDataWithOptimalChunking(_ data: Data, packetType: UInt8 = 0x02, waitTimeMs: Int = 0) {
        var chunks: [[UInt8]] = []
        let effectiveChunkSize = maxChunkSize - 1 // Reserve 1 byte for packet type

        // Add packet type as first byte
        var packetData = Data([packetType])
        packetData.append(data)

        // Split into MTU-optimized chunks
        var offset = 0
        while offset < packetData.count {
            let chunkSize = min(effectiveChunkSize, packetData.count - offset)
            let chunkData = packetData.subdata(in: offset ..< (offset + chunkSize))
            chunks.append(Array(chunkData))
            offset += chunkSize
        }

        print("NEX: 📦 Created \(chunks.count) MTU-optimized chunks (max size: \(effectiveChunkSize) bytes)")
        queueChunks(chunks, waitTimeMs: waitTimeMs)
    }

    private func processCommand(_ command: BufferedCommand) async {
        guard let peripheral = peripheral, let writeCharacteristic = writeCharacteristic else {
            print("NEX: ⚠️ processCommand: peripheral/characteristic not ready")
            return
        }

        // Send each chunk sequentially
        for (index, chunk) in command.chunks.enumerated() {
            let data = Data(chunk)
            peripheral.writeValue(data, for: writeCharacteristic, type: .withResponse)

            // Delay between chunks except maybe after the last chunk if waitTime will handle it
            if index < command.chunks.count - 1 {
                try? await Task.sleep(nanoseconds: UInt64(command.chunkDelayMs) * 1_000_000)
            }
        }

        // Optional wait after the command
        if command.waitTimeMs > 0 {
            try? await Task.sleep(nanoseconds: UInt64(command.waitTimeMs) * 1_000_000)
        }
    }

    // MARK: - Device Persistence (ported from Java)

    private func loadSavedDeviceInfo() {
        savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME)
        savedDeviceAddress = UserDefaults.standard.string(forKey: PREFS_DEVICE_ADDRESS)
        preferredDeviceId = UserDefaults.standard.string(forKey: PREFS_DEVICE_ID)

        print("NEX: 💾 Loaded device info - Name: \(savedDeviceName ?? "None"), Address: \(savedDeviceAddress ?? "None"), ID: \(preferredDeviceId ?? "None")")
    }

    private func savePairedDeviceInfo(name: String?, address: String?) {
        if let name = name {
            UserDefaults.standard.set(name, forKey: PREFS_DEVICE_NAME)
            savedDeviceName = name
            print("NEX: 💾 Saved device name: \(name)")
        }

        if let address = address {
            UserDefaults.standard.set(address, forKey: PREFS_DEVICE_ADDRESS)
            savedDeviceAddress = address
            print("NEX: 💾 Saved device address: \(address)")
        }
    }

    @objc func savePreferredDeviceId(_ deviceId: String) {
        UserDefaults.standard.set(deviceId, forKey: PREFS_DEVICE_ID)
        preferredDeviceId = deviceId
        print("NEX: 💾 Saved preferred device ID: \(deviceId)")
    }

    @objc func clearSavedDeviceInfo() {
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_NAME)
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_ADDRESS)
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_ID)

        savedDeviceName = nil
        savedDeviceAddress = nil
        preferredDeviceId = nil
        peripheralUUID = nil

        print("NEX: 🗑️ Cleared all saved device information")
    }

    // MARK: - Enhanced Device Filtering (ported from Java)

    private func isCompatibleNexDevice(_ deviceName: String) -> Bool {
        // Enhanced filtering logic from Java implementation
        let compatiblePrefixes = [
            "Mentra",
            "MENTRA",
            "NEX",
            "Nex",
            "MentraNex",
            "MENTRA_NEX",
            "Xy_A", // Legacy support
            "XyBLE_", // Legacy support
            "MENTRA_LIVE", // Cross-compatibility
        ]

        for prefix in compatiblePrefixes {
            if deviceName.hasPrefix(prefix) || deviceName.contains(prefix) {
                print("NEX: ✅ Device '\(deviceName)' matches compatible prefix: \(prefix)")
                return true
            }
        }

        print("NEX: ❌ Device '\(deviceName)' not compatible with known prefixes")
        return false
    }

    private func extractDeviceId(from deviceName: String) -> String? {
        // Extract device ID pattern similar to Java implementation
        let patterns = [
            "Mentra_([0-9A-Fa-f]+)",
            "NEX_([0-9A-Fa-f]+)",
            "MENTRA_NEX_([0-9A-Fa-f]+)",
        ]

        for pattern in patterns {
            let regex = try? NSRegularExpression(pattern: pattern)
            let range = NSRange(deviceName.startIndex ..< deviceName.endIndex, in: deviceName)
            if let match = regex?.firstMatch(in: deviceName, options: [], range: range),
               let matchRange = Range(match.range(at: 1), in: deviceName)
            {
                let deviceId = String(deviceName[matchRange])
                print("NEX: 🏷️ Extracted device ID: \(deviceId) from \(deviceName)")
                return deviceId
            }
        }

        print("NEX: ⚠️ Could not extract device ID from: \(deviceName)")
        return nil
    }

    // MARK: - Connection Logic (enhanced from G1)

    @objc(connectByName:)
    func connect(name: String) {
        print("NEX: 🔗 connect(name:) called with \(name)")
        if _isScanning {
            stopScan()
        }
        peripheralToConnectName = name
        startScan()
    }

    private func connectByUUID() -> Bool {
        guard let uuid = peripheralUUID else {
            print("NEX: 🔵 No stored UUID to connect by.")
            return false
        }

        guard let centralManager = centralManager else { return false }

        print("NEX: 🔵 Attempting to connect by stored UUID: \(uuid.uuidString)")
        let peripherals = centralManager.retrievePeripherals(withIdentifiers: [uuid])

        if let peripheralToConnect = peripherals.first {
            print("NEX: 🔵 Found peripheral by UUID: \(peripheralToConnect.name ?? "Unknown")")
            peripheral = peripheralToConnect
            centralManager.connect(peripheralToConnect, options: nil)
            return true
        } else {
            print("NEX: 🔵 Could not find peripheral for stored UUID.")
            return false
        }
    }

    private func startReconnectionTimer() {
        print("NEX: 🔄 Starting reconnection timer...")
        stopReconnectionTimer() // Ensure no existing timer is running
        reconnectionAttempts = 0

        DispatchQueue.main.async {
            self.reconnectionTimer = Timer.scheduledTimer(
                timeInterval: self.reconnectionInterval,
                target: self,
                selector: #selector(self.attemptReconnection),
                userInfo: nil,
                repeats: true
            )
        }
    }

    private func stopReconnectionTimer() {
        if reconnectionTimer != nil {
            print("NEX: 🛑 Stopping reconnection timer.")
            reconnectionTimer?.invalidate()
            reconnectionTimer = nil
        }
    }

    @objc private func attemptReconnection() {
        if nexReady {
            print("NEX: ✅ Already connected, stopping reconnection timer.")
            stopReconnectionTimer()
            return
        }

        if maxReconnectionAttempts != -1, reconnectionAttempts >= maxReconnectionAttempts {
            print("NEX: ❌ Max reconnection attempts reached.")
            stopReconnectionTimer()
            return
        }

        reconnectionAttempts += 1
        print("NEX: 🔄 Attempting reconnection (\(reconnectionAttempts))...")
        startScan()
    }

    // MARK: - Public Methods

    @objc func startScan() {
        print("NEX: 🔍 startScan() called")

        isDisconnecting = false // Reset intentional disconnect flag

        guard let centralManager = centralManager else {
            print("NEX: ❌ Central Manager is nil!")
            return
        }

        guard centralManager.state == .poweredOn else {
            print("NEX: ❌ Cannot scan, Bluetooth is not powered on. Current state: \(centralManager.state.rawValue)")
            return
        }

        // If that fails, check for already-connected system devices
        let connectedPeripherals = centralManager.retrieveConnectedPeripherals(withServices: [MAIN_SERVICE_UUID])
        if let targetName = peripheralToConnectName, let existingPeripheral = connectedPeripherals.first(where: { $0.name?.contains(targetName) == true }) {
            print("NEX: 📱 Found already connected peripheral that matches target: \(existingPeripheral.name ?? "Unknown")")
            if peripheral == nil {
                peripheral = existingPeripheral
                centralManager.connect(existingPeripheral, options: nil)
                return
            }
        }

        // Check if we have a saved device name to reconnect to (like MentraLive)
        if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME), !savedDeviceName.isEmpty {
            print("NEX: 🔄 Looking for saved device: \(savedDeviceName)")
            // This will be handled in didDiscover when the device is found
        }

        print("NEX: ✅ Bluetooth is powered on, starting scan...")
        print("NEX: 🎯 Scanning for ALL devices (will filter by name containing 'Mentra')...")
        _isScanning = true

        // Scan for ALL devices, not just those with specific services
        // Use same options as G1 scanner for consistency
        let scanOptions: [String: Any] = [
            CBCentralManagerScanOptionAllowDuplicatesKey: false, // Don't allow duplicate advertisements
        ]
        centralManager.scanForPeripherals(withServices: nil, options: scanOptions)

        print("NEX: 🚀 Scan started successfully")

        // Re-emit already discovered peripherals (like MentraLive)
        for (_, peripheral) in discoveredPeripherals {
            print("NEX: 📡 (Already discovered) peripheral: \(peripheral.name ?? "Unknown")")
            if let name = peripheral.name {
                emitDiscoveredDevice(name)
            }
        }

        // No auto-stop timer (like G1) - manual control
        print("NEX: 💡 To stop scanning manually, call: MentraNexSGC.shared.stopScan()")
    }

    @objc func stopScan() {
        centralManager?.stopScan()
        _isScanning = false
        print("NEX: 🛑 Stopped scanning.")
    }

    @objc func isScanning() -> Bool {
        return _isScanning
    }

    @objc func isConnected() -> Bool {
        return nexReady && connectionState == .connected
    }

    @objc func getConnectionState() -> String {
        switch connectionState {
        case .disconnected:
            return "disconnected"
        case .connecting:
            return "connecting"
        case .connected:
            return "connected"
        }
    }

    // MARK: - MTU Information Access

    @objc func getCurrentMTU() -> Int {
        return currentMTU
    }

    @objc func getMaxChunkSize() -> Int {
        return maxChunkSize
    }

    @objc func getDeviceMaxMTU() -> Int {
        return deviceMaxMTU
    }

    @objc func getMTUInfo() -> [String: Any] {
        return [
            "current_mtu": currentMTU,
            "device_max_mtu": deviceMaxMTU,
            "max_chunk_size": maxChunkSize,
            "bmp_chunk_size": bmpChunkSize,
            "mtu_negotiated": nexReady,
        ]
    }

    @objc func findCompatibleDevices() {
        CoreCommsService.log("Finding compatible Mentra Nex glasses")

        Task {
            if centralManager == nil {
                centralManager = CBCentralManager(delegate: self, queue: bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
                // wait for the central manager to be fully initialized before we start scanning:
                try? await Task.sleep(nanoseconds: 100 * 1_000_000) // 100ms
            }

            // clear the saved device name:
            UserDefaults.standard.set("", forKey: PREFS_DEVICE_NAME)

            startScan()
        }
    }

    @objc func sendText(_ text: String) {
        guard let peripheral = peripheral, let writeCharacteristic = writeCharacteristic else {
            print("NEX: Not ready to send text. Peripheral or characteristic is nil.")
            return
        }

        print("NEX: Sending text: '\(text)'")

        // 1. Create the DisplayText message
        var displayText = Mentraos_Ble_DisplayText()
        displayText.text = text
        displayText.size = 20
        displayText.x = 20
        displayText.y = 260
        displayText.fontCode = 20
        displayText.color = 10000

        // 2. Create the top-level PhoneToGlasses message
        var phoneToGlasses = Mentraos_Ble_PhoneToGlasses()
        phoneToGlasses.displayText = displayText

        do {
            // 3. Serialize the message to binary data
            let protobufData = try phoneToGlasses.serializedData()

            // 4. Prepend the packet type (0x02 for protobuf)
            var packet = Data([0x02])
            packet.append(protobufData)

            print("NEX: Sending protobuf packet (\(packet.count) bytes): \(packet.toHexString())")
            peripheral.writeValue(packet, for: writeCharacteristic, type: .withResponse)
        } catch {
            print("NEX: Error serializing protobuf message: \(error)")
        }
    }

    @objc func disconnect() {
        print("NEX: 🔌 User-initiated disconnect")
        if let peripheral = peripheral {
            isDisconnecting = true
            connectionState = .disconnected
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        stopReconnectionTimer()
    }

    // MARK: - Lifecycle Management (ported from Java)

    @objc func destroy() {
        print("NEX: 💥 Destroying MentraNexSGC instance")

        isKilled = true
        isDisconnecting = true

        // Stop all timers
        stopReconnectionTimer()

        // Disconnect from peripheral
        if let peripheral = peripheral {
            centralManager?.cancelPeripheralConnection(peripheral)
        }

        // Stop scanning
        if _isScanning {
            stopScan()
        }

        // Clear all references
        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        centralManager?.delegate = nil
        centralManager = nil

        // Clear discovery cache
        discoveredPeripherals.removeAll()

        print("NEX: ✅ MentraNexSGC destroyed successfully")
    }

    @objc func reset() {
        print("NEX: 🔄 Resetting MentraNexSGC to fresh state")

        // Disconnect current connection
        disconnect()

        // Clear all saved device information
        clearSavedDeviceInfo()

        // Clear discovery cache
        discoveredPeripherals.removeAll()

        // Reset internal state
        isKilled = false
        isDisconnecting = false
        nexReady = false
        reconnectionAttempts = 0
        peripheralToConnectName = nil

        print("NEX: ✅ Reset complete - ready for fresh pairing")
    }

    // MARK: - Helper Methods (like G1)

    private func getConnectedDevices() -> [CBPeripheral] {
        guard let centralManager = centralManager else { return [] }
        // Retrieve peripherals already connected that expose our main service
        return centralManager.retrieveConnectedPeripherals(withServices: [])
    }

    private func emitDiscoveredDevice(_ name: String) {
        // Emit device discovery event (using MentraLive's format)
        print("NEX: 📡 Emitting discovered device: \(name)")

        let eventBody: [String: Any] = [
            "compatible_glasses_search_result": [
                "model_name": "Mentra Nex",
                "device_name": name,
            ],
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
            }
        } catch {
            CoreCommsService.log("Error converting to JSON: \(error)")
        }
    }

    @objc func checkBluetoothState() {
        print("NEX: 🔍 Checking Bluetooth State...")
        if let centralManager = centralManager {
            print("NEX: 📱 Central Manager exists: YES")
            print("NEX: 📱 Current Bluetooth State: \(centralManager.state.rawValue)")

            switch centralManager.state {
            case .poweredOn:
                print("NEX: ✅ Bluetooth is ready for scanning")
            case .poweredOff:
                print("NEX: ❌ Bluetooth is turned off")
            case .resetting:
                print("NEX: 🔄 Bluetooth is resetting")
            case .unauthorized:
                print("NEX: ❌ Bluetooth permission denied")
            case .unsupported:
                print("NEX: ❌ Bluetooth not supported")
            case .unknown:
                print("NEX: ❓ Bluetooth state unknown")
            @unknown default:
                print("NEX: ❓ Unknown Bluetooth state: \(centralManager.state.rawValue)")
            }
        } else {
            print("NEX: ❌ Central Manager is nil!")
        }
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        print("NEX: 🔄 Bluetooth state changed to: \(central.state.rawValue)")

        switch central.state {
        case .poweredOn:
            print("NEX: ✅ Bluetooth is On and ready for scanning")

            // Enhanced auto-reconnection logic (from Java implementation)
            if !isKilled, !isDisconnecting {
                // Try UUID-based connection first (fastest)
                if connectByUUID() {
                    print("NEX: 🔵 Attempting UUID-based reconnection")
                    return
                }

                // Fall back to scanning for saved device
                if let savedName = savedDeviceName, !savedName.isEmpty {
                    print("NEX: 🔄 Bluetooth powered on, scanning for saved device: \(savedName)")
                    startScan()
                } else {
                    print("NEX: 💡 Bluetooth ready, waiting for user action (no saved device)")
                }
            } else {
                print("NEX: ⏸️ Auto-reconnection disabled (killed: \(isKilled), disconnecting: \(isDisconnecting))")
            }
        case .poweredOff:
            print("NEX: ❌ Bluetooth is Off - user needs to enable Bluetooth")
            connectionState = .disconnected
        case .resetting:
            print("NEX: 🔄 Bluetooth is resetting - wait for completion")
            connectionState = .disconnected
        case .unauthorized:
            print("NEX: ❌ Bluetooth is unauthorized - check app permissions")
            connectionState = .disconnected
        case .unsupported:
            print("NEX: ❌ Bluetooth is unsupported on this device")
            connectionState = .disconnected
        case .unknown:
            print("NEX: ❓ Bluetooth state is unknown - may be initializing")
        @unknown default:
            print("NEX: ❓ A new Bluetooth state was introduced: \(central.state.rawValue)")
        }
    }

    func centralManager(_: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        // Only process devices that have names
        guard let deviceName = peripheral.name else {
            return
        }

        let deviceAddress = peripheral.identifier.uuidString

        // Enhanced compatibility check using the new filtering method
        guard isCompatibleNexDevice(deviceName) else {
            return
        }

        print("NEX: 🔍 === Compatible Nex Device Found ===")
        print("NEX: 📱 Device Name: \(deviceName)")
        print("NEX: 📱 Device Address: \(deviceAddress)")
        print("NEX: 📱 RSSI: \(RSSI) dBm")

        // Log manufacturer data if available (like Java implementation)
        if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
            let hexString = manufacturerData.map { String(format: "%02x", $0) }.joined(separator: " ")
            print("NEX: 📡 Manufacturer Data: \(hexString)")

            // TODO: Decode serial number from manufacturer data (future enhancement)
            // This would be similar to ERG1Manager's serial number extraction
        }

        // Log service UUIDs if available
        if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
            let uuidStrings = serviceUUIDs.map { $0.uuidString }
            print("NEX: 🔧 Service UUIDs: \(uuidStrings.joined(separator: ", "))")
        }

        // Extract device ID for better tracking
        if let deviceId = extractDeviceId(from: deviceName) {
            print("NEX: 🆔 Device ID extracted: \(deviceId)")
        }

        // Store the peripheral in cache (like MentraLive)
        discoveredPeripherals[deviceName] = peripheral

        // Always emit the discovered device for the UI list
        emitDiscoveredDevice(deviceName)

        // Priority 1: Check if this matches our target device by name
        if let targetName = peripheralToConnectName, deviceName.contains(targetName) {
            print("NEX: 🎯 Found target device '\(deviceName)' matching search: '\(targetName)'")
            return connectToFoundDevice(peripheral, reason: "target_match")
        }

        // Priority 2: Check if this matches our saved device by name
        if let savedName = savedDeviceName, savedName == deviceName, self.peripheral == nil {
            print("NEX: 🔄 Found saved device by name: \(deviceName)")
            return connectToFoundDevice(peripheral, reason: "saved_name_match")
        }

        // Priority 3: Check if this matches our saved device by address
        if let savedAddress = savedDeviceAddress, savedAddress == deviceAddress, self.peripheral == nil {
            print("NEX: 🔄 Found saved device by address: \(deviceAddress)")
            return connectToFoundDevice(peripheral, reason: "saved_address_match")
        }

        // Priority 4: Check if this matches our preferred device ID
        if let preferredId = preferredDeviceId,
           let extractedId = extractDeviceId(from: deviceName),
           preferredId == extractedId, self.peripheral == nil
        {
            print("NEX: 🔄 Found device matching preferred ID: \(preferredId)")
            return connectToFoundDevice(peripheral, reason: "preferred_id_match")
        }

        print("NEX: 📋 Device '\(deviceName)' discovered but not selected for connection")
    }

    // MARK: - Enhanced Connection Helper

    private func connectToFoundDevice(_ peripheral: CBPeripheral, reason: String) {
        guard self.peripheral == nil else {
            print("NEX: ⚠️ Already connected/connecting to a device, ignoring new device")
            return
        }

        print("NEX: 🔗 Connecting to device '\(peripheral.name ?? "Unknown")' - Reason: \(reason)")

        // Stop scanning since we found our target
        if _isScanning {
            stopScan()
        }

        // Store the peripheral and initiate connection
        self.peripheral = peripheral
        isConnecting = true
        connectionState = .connecting

        // Use connection options for better reliability (from Java implementation)
        let connectionOptions: [String: Any] = [
            CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true,
            CBConnectPeripheralOptionNotifyOnNotificationKey: true,
        ]

        centralManager?.connect(peripheral, options: connectionOptions)

        print("NEX: 🚀 Connection initiated with enhanced options")
    }

    func centralManager(_: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("NEX: ✅ Successfully connected to \(peripheral.name ?? "unknown device").")
        isConnecting = false
        peripheralUUID = peripheral.identifier // Persist UUID
        stopReconnectionTimer() // Successfully connected, stop trying to reconnect.

        // Enhanced device info saving (from Java implementation)
        let deviceName = peripheral.name
        let deviceAddress = peripheral.identifier.uuidString

        // Save all device information for future reconnection
        savePairedDeviceInfo(name: deviceName, address: deviceAddress)

        // Extract and save device ID if possible
        if let deviceName = deviceName, let deviceId = extractDeviceId(from: deviceName) {
            savePreferredDeviceId(deviceId)
        }

        print("NEX: 💾 Device information saved for reliable reconnection")
        print("NEX: 📱 Name: \(deviceName ?? "Unknown"), Address: \(deviceAddress)")

        peripheral.delegate = self
        print("NEX: 🔍 Discovering services...")
        peripheral.discoverServices([MAIN_SERVICE_UUID])

        // Reset any failed connection attempt counters
        reconnectionAttempts = 0
        print("NEX: 🔄 Reset reconnection attempts counter")
    }

    func centralManager(_: CBCentralManager, didFailToConnect _: CBPeripheral, error: Error?) {
        print("NEX: Failed to connect to peripheral. Error: \(error?.localizedDescription ?? "unknown")")
        isConnecting = false
        connectionState = .disconnected
        // Optionally, start reconnection attempts here
    }

    func centralManager(_: CBCentralManager, didDisconnectPeripheral disconnectedPeripheral: CBPeripheral, error: Error?) {
        print("NEX: 🔌 Disconnected from peripheral: \(disconnectedPeripheral.name ?? "Unknown")")

        if let error = error {
            print("NEX: ⚠️ Disconnect error: \(error.localizedDescription)")
        }

        // Reset connection state
        nexReady = false
        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        connectionState = .disconnected

        // Clear command queue if needed
        if isQueueWorkerRunning {
            print("NEX: 🧹 Clearing command queue due to disconnection")
        }

        if !isDisconnecting, !isKilled {
            print("NEX: 🔄 Unintentional disconnect detected. Attempting reconnection...")

            // Enhanced reconnection strategy from Java implementation
            if let savedName = savedDeviceName {
                print("NEX: 🎯 Will attempt to reconnect to saved device: \(savedName)")
            }

            startReconnectionTimer()
        } else {
            print("NEX: ✅ Intentional disconnect (isDisconnecting: \(isDisconnecting), isKilled: \(isKilled))")

            if isDisconnecting {
                // Don't clear device info on intentional disconnect - user might reconnect later
                print("NEX: 💾 Keeping device info for potential future reconnection")
            }
        }
    }

    // MARK: - MTU Negotiation (iOS-specific implementation)

    private func requestOptimalMTU(for peripheral: CBPeripheral) {
        print("NEX: 🔍 iOS MTU Discovery (Platform Limitation: max \(MTU_MAX_IOS) bytes)")
        print("NEX: 🎯 iOS maximum: \(MTU_MAX_IOS) bytes, default: \(MTU_DEFAULT) bytes")

        // iOS MTU is automatically negotiated - we can only discover the current value
        // No manual MTU request available on iOS (platform limitation)

        // Get current MTU capability (iOS-specific approach)
        let maxWriteLength = peripheral.maximumWriteValueLength(for: .withResponse)
        let actualMTU = maxWriteLength + 3 // Add L2CAP header size

        print("NEX: 📊 iOS MTU Discovery Results:")
        print("NEX:    📏 Max write length: \(maxWriteLength) bytes")
        print("NEX:    📡 Effective MTU: \(actualMTU) bytes")
        print("NEX:    ⚠️ iOS Platform Note: MTU is auto-negotiated, cannot manually request like Android")

        // Validate against iOS limitations
        let validatedMTU = min(actualMTU, MTU_MAX_IOS)
        if actualMTU > MTU_MAX_IOS {
            print("NEX: 🔧 Clamping MTU from \(actualMTU) to iOS maximum: \(MTU_MAX_IOS)")
        }

        // Process MTU result immediately (iOS doesn't have callback like Android)
        onMTUNegotiated(mtu: validatedMTU, success: true)
    }

    private func onMTUNegotiated(mtu: Int, success: Bool) {
        print("NEX: 🔄 MTU Negotiation Result: Success=\(success), Device MTU=\(mtu)")

        if success, mtu > MTU_DEFAULT {
            // Store device capability and calculate actual negotiated MTU
            deviceMaxMTU = mtu
            // iOS limitation: Use actual MTU but cap at iOS maximum
            currentMTU = min(MTU_MAX_IOS, mtu)

            print("NEX: 🎯 iOS MTU Configuration Complete:")
            print("NEX:    🍎 iOS Platform Max: \(MTU_MAX_IOS) bytes")
            print("NEX:    📡 Device Supports: \(deviceMaxMTU) bytes")
            print("NEX:    🤝 Final MTU: \(currentMTU) bytes")

            // Calculate optimal chunk sizes based on iOS MTU constraints
            maxChunkSize = currentMTU - 10 // Reserve 10 bytes for headers
            bmpChunkSize = currentMTU - 6 // Reserve 6 bytes for image headers

            print("NEX: 📦 Optimized Chunk Sizes:")
            print("NEX:    📄 Data Chunk Size: \(maxChunkSize) bytes")
            print("NEX:    🖼️ Image Chunk Size: \(bmpChunkSize) bytes")

        } else {
            print("NEX: ⚠️ MTU negotiation failed or using minimum, applying iOS defaults")
            currentMTU = MTU_DEFAULT
            deviceMaxMTU = MTU_DEFAULT
            maxChunkSize = 20 // Very conservative for 23-byte MTU
            bmpChunkSize = 20 // Very conservative for 23-byte MTU

            print("NEX: 📋 iOS Fallback Configuration:")
            print("NEX:    📊 Default MTU: \(MTU_DEFAULT) bytes")
            print("NEX:    📦 Data Chunk Size: \(maxChunkSize) bytes")
            print("NEX:    🖼️ Image Chunk Size: \(bmpChunkSize) bytes")
            print("NEX:    ⚠️ Using minimal chunks due to MTU limitation")
        }

        // Device is now ready for communication
        print("NEX: ✅ Device initialization complete - ready for communication")
        nexReady = true
        connectionState = .connected

        // Emit device ready event to React Native
        emitDeviceReady()
    }

    private func emitDeviceReady() {
        let eventBody: [String: Any] = [
            "device_ready": [
                "model_name": "Mentra Nex",
                "mtu_negotiated": currentMTU,
                "max_chunk_size": maxChunkSize,
                "connection_state": "ready",
            ],
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
                print("NEX: 📡 Emitted device ready event with MTU: \(currentMTU)")
            }
        } catch {
            print("NEX: ❌ Error emitting device ready event: \(error)")
        }
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            print("NEX: Error discovering services: \(error.localizedDescription)")
            return
        }

        guard let services = peripheral.services else { return }
        for service in services {
            if service.uuid == MAIN_SERVICE_UUID {
                print("NEX: Found main service. Discovering characteristics...")
                peripheral.discoverCharacteristics([WRITE_CHAR_UUID, NOTIFY_CHAR_UUID], for: service)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            print("NEX: Error discovering characteristics: \(error.localizedDescription)")
            return
        }

        guard let characteristics = service.characteristics else { return }
        for characteristic in characteristics {
            if characteristic.uuid == WRITE_CHAR_UUID {
                print("NEX: Found write characteristic.")
                writeCharacteristic = characteristic
            } else if characteristic.uuid == NOTIFY_CHAR_UUID {
                print("NEX: Found notify characteristic. Subscribing for notifications.")
                notifyCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }

        if writeCharacteristic != nil, notifyCharacteristic != nil {
            print("NEX: ✅ All characteristics discovered - requesting MTU negotiation")

            // Start MTU negotiation like Java implementation
            requestOptimalMTU(for: peripheral)
        }
    }

    func peripheral(_: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("NEX: Error on updating value: \(error.localizedDescription)")
            return
        }

        guard let data = characteristic.value else { return }
        print("NEX: Received data (\(data.count) bytes): \(data.toHexString())")
        // Here you would decode the incoming protobuf data.
    }

    func peripheral(_: CBPeripheral, didWriteValueFor _: CBCharacteristic, error: Error?) {
        if let error = error {
            print("NEX: Error writing value: \(error.localizedDescription)")
            return
        }
        print("NEX: Successfully wrote value.")
    }

    func peripheral(_: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("NEX: Error changing notification state: \(error.localizedDescription)")
            return
        }

        if characteristic.isNotifying {
            print("NEX: Successfully subscribed to notifications for characteristic \(characteristic.uuid.uuidString).")
        } else {
            print("NEX: Unsubscribed from notifications for characteristic \(characteristic.uuid.uuidString).")
        }
    }
}
