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
    private var scanOnPowerOn = false

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
                Core.log("NEX: 🔄 Connection state changed: \(oldValue) -> \(newValue)")
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

    // Packet types from MentraNexSGC.java
    private let PACKET_TYPE_JSON: UInt8 = 0x01
    private let PACKET_TYPE_PROTOBUF: UInt8 = 0x02
    private let PACKET_TYPE_AUDIO: UInt8 = 0xA0
    private let PACKET_TYPE_IMAGE: UInt8 = 0xB0

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
        Core.log("NEX: 🚀 MentraNexSGC initialization started")

        // Load saved device information (from Java implementation)
        loadSavedDeviceInfo()

        // Using custom Bluetooth queue for better performance (like G1)
        Core.log("NEX: 📱 Creating CBCentralManager with custom Bluetooth queue")
        centralManager = CBCentralManager(delegate: self, queue: MentraNexSGC._bluetoothQueue)

        Core.log("NEX: ✅ MentraNexSGC initialization completed")
        Core.log("NEX: 📱 Central Manager created: \(centralManager != nil ? "YES" : "NO")")
        if let centralManager = centralManager {
            Core.log("NEX: 📱 Initial Bluetooth State: \(centralManager.state.rawValue)")
        }

        Core.log("NEX: 💾 Loaded saved device - Name: \(savedDeviceName ?? "None"), Address: \(savedDeviceAddress ?? "None")")
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

        Core.log("NEX: 📦 Created \(chunks.count) MTU-optimized chunks (max size: \(effectiveChunkSize) bytes)")
        queueChunks(chunks, waitTimeMs: waitTimeMs)
    }

    private func processCommand(_ command: BufferedCommand) async {
        guard let peripheral = peripheral, let writeCharacteristic = writeCharacteristic else {
            Core.log("NEX: ⚠️ processCommand: peripheral/characteristic not ready")
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

        Core.log("NEX: 💾 Loaded device info - Name: \(savedDeviceName ?? "None"), Address: \(savedDeviceAddress ?? "None"), ID: \(preferredDeviceId ?? "None")")
    }

    private func savePairedDeviceInfo(name: String?, address: String?) {
        if let name = name {
            UserDefaults.standard.set(name, forKey: PREFS_DEVICE_NAME)
            savedDeviceName = name
            Core.log("NEX: 💾 Saved device name: \(name)")
        }

        if let address = address {
            UserDefaults.standard.set(address, forKey: PREFS_DEVICE_ADDRESS)
            savedDeviceAddress = address
            Core.log("NEX: 💾 Saved device address: \(address)")
        }
    }

    @objc func savePreferredDeviceId(_ deviceId: String) {
        UserDefaults.standard.set(deviceId, forKey: PREFS_DEVICE_ID)
        preferredDeviceId = deviceId
        Core.log("NEX: 💾 Saved preferred device ID: \(deviceId)")
    }

    @objc func clearSavedDeviceInfo() {
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_NAME)
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_ADDRESS)
        UserDefaults.standard.removeObject(forKey: PREFS_DEVICE_ID)

        savedDeviceName = nil
        savedDeviceAddress = nil
        preferredDeviceId = nil
        peripheralUUID = nil

        Core.log("NEX: 🗑️ Cleared all saved device information")
    }

    // MARK: - Enhanced Device Filtering (ported from Java)

    private func isCompatibleNexDevice(_ deviceName: String) -> Bool {
        // Enhanced filtering logic from Java implementation
        let compatiblePrefixes = [
            "NexSim",
            // "MENTRA",
            // "NEX",
            // "Nex",
            // "MentraNex",
            // "MENTRA_NEX",
            // "Xy_A", // Legacy support
            // "XyBLE_", // Legacy support
            // "MENTRA_LIVE", // Cross-compatibility
        ]

        for prefix in compatiblePrefixes {
            if deviceName.hasPrefix(prefix) || deviceName.contains(prefix) {
                Core.log("NEX: ✅ Device '\(deviceName)' matches compatible prefix: \(prefix)")
                return true
            }
        }

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
                Core.log("NEX: 🏷️ Extracted device ID: \(deviceId) from \(deviceName)")
                return deviceId
            }
        }

        Core.log("NEX: ⚠️ Could not extract device ID from: \(deviceName)")
        return nil
    }

    // MARK: - Connection Logic (enhanced from G1)

    @objc(connectByName:)
    func connect(name: String) {
        Core.log("NEX-CONN: 🔗 connect(name:) called with \(name)")
        if _isScanning {
            stopScan()
        }
        peripheralToConnectName = name
        startScan()
    }

    private func connectByUUID() -> Bool {
        guard let uuid = peripheralUUID else {
            Core.log("NEX-CONN: 🔵 No stored UUID to connect by.")
            return false
        }

        guard let centralManager = centralManager else {
            Core.log("NEX-CONN: ❌ Central Manager is nil, cannot connect by UUID.")
            return false
        }

        Core.log("NEX-CONN: 🔵 Attempting to retrieve peripheral with stored UUID: \(uuid.uuidString)")
        let peripherals = centralManager.retrievePeripherals(withIdentifiers: [uuid])

        if let peripheralToConnect = peripherals.first {
            Core.log("NEX-CONN: 🔵 Found peripheral by UUID: \(peripheralToConnect.name ?? "Unknown"). Initiating connection.")
            peripheral = peripheralToConnect
            centralManager.connect(peripheralToConnect, options: nil)
            return true
        } else {
            Core.log("NEX-CONN: 🔵 Could not find peripheral for stored UUID. Will proceed to scan.")
            return false
        }
    }

    private func startReconnectionTimer() {
        Core.log("NEX-CONN: 🔄 Starting reconnection timer...")
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
            Core.log("NEX-CONN: 🛑 Stopping reconnection timer.")
            reconnectionTimer?.invalidate()
            reconnectionTimer = nil
        }
    }

    @objc private func attemptReconnection() {
        if nexReady {
            Core.log("NEX-CONN: ✅ Already connected, stopping reconnection attempts.")
            stopReconnectionTimer()
            return
        }

        if maxReconnectionAttempts != -1, reconnectionAttempts >= maxReconnectionAttempts {
            Core.log("NEX-CONN: ❌ Max reconnection attempts reached.")
            stopReconnectionTimer()
            return
        }

        reconnectionAttempts += 1
        Core.log("NEX-CONN: 🔄 Attempting reconnection (\(reconnectionAttempts))...")
        startScan()
    }

    // MARK: - Public Methods

    private func startScan() {
        Core.log("NEX-CONN: 🔍 startScan called")

        isDisconnecting = false // Reset intentional disconnect flag

        guard let centralManager = centralManager else {
            Core.log("NEX-CONN: ❌ Central Manager is nil!")
            return
        }

        guard centralManager.state == .poweredOn else {
            Core.log("NEX-CONN: ❌ Bluetooth not powered on. State: \(centralManager.state.rawValue)")
            return
        }

        // First, try to reconnect using stored UUID (faster and works in background)
        if connectByUUID() {
            Core.log("NEX-CONN: 🔄 Attempting connection with stored UUID. Halting scan.")
            return
        }

        // If that fails, check for already-connected system devices
        let connectedPeripherals = centralManager.retrieveConnectedPeripherals(withServices: [MAIN_SERVICE_UUID])
        if let targetName = peripheralToConnectName, let existingPeripheral = connectedPeripherals.first(where: { $0.name?.contains(targetName) == true }) {
            Core.log("NEX-CONN: 📱 Found already connected peripheral that matches target: \(existingPeripheral.name ?? "Unknown")")
            if peripheral == nil {
                peripheral = existingPeripheral
                centralManager.connect(existingPeripheral, options: nil)
                return
            }
        }

        // Check if we have a saved device name to reconnect to (like MentraLive)
        if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME), !savedDeviceName.isEmpty {
            Core.log("NEX-CONN: 🔄 Looking for saved device: \(savedDeviceName)")
            // This will be handled in didDiscover when the device is found
        }

        Core.log("NEX-CONN: ✅ Bluetooth is powered on, starting scan...")
        _isScanning = true

        // Scan for ALL devices, not just those with specific services
        // Use same options as G1 scanner for consistency
        let scanOptions: [String: Any] = [
            CBCentralManagerScanOptionAllowDuplicatesKey: false, // Don't allow duplicate advertisements
        ]
        centralManager.scanForPeripherals(withServices: nil, options: scanOptions)

        Core.log("NEX-CONN: 🚀 Scan started successfully")

        // Re-emit already discovered peripherals (like MentraLive)
        for (_, peripheral) in discoveredPeripherals {
            Core.log("NEX-CONN: 📡 (Re-emitting from cache) peripheral: \(peripheral.name ?? "Unknown")")
            if let name = peripheral.name {
                emitDiscoveredDevice(name)
            }
        }

        // No auto-stop timer (like G1) - manual control
        Core.log("NEX-CONN: 💡 To stop scanning manually, call: MentraNexSGC.shared.stopScan()")
    }

    @objc func stopScan() {
        centralManager?.stopScan()
        _isScanning = false
        Core.log("NEX-CONN: 🛑 Stopped scanning.")
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
        Core.log("NEX-DISCOVERY: Finding compatible devices. Clearing connection targets.")

        // Clear any specific device targets to ensure we are only discovering
        peripheralToConnectName = nil
        clearSavedDeviceInfo() // This clears UserDefaults and our in-memory cache of saved/preferred devices.

        Task {
            if centralManager == nil {
                centralManager = CBCentralManager(delegate: self, queue: bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
                // wait for the central manager to be fully initialized before we start scanning:
                try? await Task.sleep(nanoseconds: 100 * 1_000_000) // 100ms
            }

            if centralManager?.state == .poweredOn {
                startScan()
            } else {
                Core.log("NEX-DISCOVERY: Bluetooth not ready, will scan on power on.")
                scanOnPowerOn = true
            }
        }
    }

    @objc func sendText(_ text: String) {
        guard let peripheral = peripheral, let writeCharacteristic = writeCharacteristic else {
            Core.log("NEX: Not ready to send text. Peripheral or characteristic is nil.")
            return
        }

        Core.log("NEX: Sending text: '\(text)' (simple implementation)")

        // Simple text transmission for testing - will implement proper protocol later
        guard let textData = text.data(using: .utf8) else {
            Core.log("NEX: Failed to convert text to data")
            return
        }

        // Send as simple packet with JSON packet type
        var packet = Data([PACKET_TYPE_JSON])
        packet.append(textData)

        Core.log("NEX: Sending simple packet (\(packet.count) bytes): \(packet.toHexString())")
        peripheral.writeValue(packet, for: writeCharacteristic, type: .withResponse)
    }

    @objc func disconnect() {
        Core.log("NEX: 🔌 User-initiated disconnect")
        if let peripheral = peripheral {
            isDisconnecting = true
            connectionState = .disconnected
            centralManager?.cancelPeripheralConnection(peripheral)
        }
        stopReconnectionTimer()
    }

    // MARK: - Lifecycle Management (ported from Java)

    @objc func destroy() {
        Core.log("NEX: 💥 Destroying MentraNexSGC instance")

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

        Core.log("NEX: ✅ MentraNexSGC destroyed successfully")
    }

    @objc func reset() {
        Core.log("NEX: 🔄 Resetting MentraNexSGC to fresh state")

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

        Core.log("NEX: ✅ Reset complete - ready for fresh pairing")
    }

    // MARK: - Helper Methods (like G1)

    private func getConnectedDevices() -> [CBPeripheral] {
        guard let centralManager = centralManager else { return [] }
        // Retrieve peripherals already connected that expose our main service
        return centralManager.retrieveConnectedPeripherals(withServices: [])
    }

    private func emitDiscoveredDevice(_ name: String) {
        // Emit device discovery event (using MentraLive's format)
        Core.log("NEX: 📡 Emitting discovered device: \(name)")

        let eventBody: [String: Any] = [
            "compatible_glasses_search_result": [
                "model_name": "Mentra Nex",
                "device_name": name,
            ],
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                Core.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
            }
        } catch {
            Core.log("Error converting to JSON: \(error)")
        }
    }

    @objc func checkBluetoothState() {
        Core.log("NEX: 🔍 Checking Bluetooth State...")
        if let centralManager = centralManager {
            Core.log("NEX: 📱 Central Manager exists: YES")
            Core.log("NEX: 📱 Current Bluetooth State: \(centralManager.state.rawValue)")

            switch centralManager.state {
            case .poweredOn:
                Core.log("NEX: ✅ Bluetooth is ready for scanning")

                if let savedDeviceName = UserDefaults.standard.string(forKey: PREFS_DEVICE_NAME), !savedDeviceName.isEmpty {
                    Core.log("NEX: 🔄 Looking for saved device: \(savedDeviceName)")
                    // This will be handled in didDiscover when the device is found
                    startScan()
                }
            case .poweredOff:
                Core.log("NEX: ❌ Bluetooth is turned off")
            case .resetting:
                Core.log("NEX: 🔄 Bluetooth is resetting")
            case .unauthorized:
                Core.log("NEX: ❌ Bluetooth permission denied")
            case .unsupported:
                Core.log("NEX: ❌ Bluetooth not supported")
            case .unknown:
                Core.log("NEX: ❓ Bluetooth state unknown")
            @unknown default:
                Core.log("NEX: ❓ Unknown Bluetooth state: \(centralManager.state.rawValue)")
            }
        } else {
            Core.log("NEX: ❌ Central Manager is nil!")
        }
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Core.log("NEX: 🔄 Bluetooth state changed to: \(central.state.rawValue)")

        switch central.state {
        case .poweredOn:
            Core.log("NEX: ✅ Bluetooth is On and ready for scanning")
            if scanOnPowerOn {
                Core.log("NEX: 🚀 Triggering scan after power on.")
                scanOnPowerOn = false
                startScan()
            }
        case .poweredOff:
            Core.log("NEX: ❌ Bluetooth is Off - user needs to enable Bluetooth")
            connectionState = .disconnected
        case .resetting:
            Core.log("NEX: 🔄 Bluetooth is resetting - wait for completion")
            connectionState = .disconnected
        case .unauthorized:
            Core.log("NEX: ❌ Bluetooth is unauthorized - check app permissions")
            connectionState = .disconnected
        case .unsupported:
            Core.log("NEX: ❌ Bluetooth is unsupported on this device")
            connectionState = .disconnected
        case .unknown:
            Core.log("NEX: ❓ Bluetooth state is unknown - may be initializing")
        @unknown default:
            Core.log("NEX: ❓ A new Bluetooth state was introduced: \(central.state.rawValue)")
        }
    }

    func centralManager(_: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData _: [String: Any], rssi RSSI: NSNumber) {
        guard let deviceName = peripheral.name else {
            // Core.log("NEX-CONN: 🚫 Ignoring device with no name")
            return
        }

        guard isCompatibleNexDevice(deviceName) else {
            // Core.log("NEX-CONN: 🚫 Ignoring incompatible device: \(deviceName)")
            return
        }

        Core.log("NEX-CONN: 🎯 === Compatible Nex Device Found ===")
        Core.log("NEX-CONN: 📱 Device Name: \(deviceName)")
        Core.log("NEX-CONN: 📶 RSSI: \(RSSI) dBm")

        // Store the peripheral in cache (like MentraLive)
        discoveredPeripherals[deviceName] = peripheral

        // Always emit the discovered device for the UI list
        emitDiscoveredDevice(deviceName)

        // Auto-connect logic based on target or saved device (from Java MentraNexSGC)
        var shouldConnect = false
        var connectionReason = ""

        // Check if this matches our target device name for connection
        if let targetName = peripheralToConnectName, deviceName.contains(targetName) {
            shouldConnect = true
            connectionReason = "Target device name match: \(targetName)"
        }
        // Check if this matches our saved device for reconnection
        else if let savedName = savedDeviceName, deviceName == savedName {
            shouldConnect = true
            connectionReason = "Saved device reconnection: \(savedName)"
        }
        // Check if this matches preferred device ID
        else if let preferredId = preferredDeviceId {
            if let extractedId = extractDeviceId(from: deviceName), extractedId == preferredId {
                shouldConnect = true
                connectionReason = "Preferred device ID match: \(preferredId)"
            }
        }

        if shouldConnect {
            connectToFoundDevice(peripheral, reason: connectionReason)
        }
    }

    // MARK: - Enhanced Connection Helper

    private func connectToFoundDevice(_ peripheral: CBPeripheral, reason: String) {
        guard self.peripheral == nil else {
            Core.log("NEX-CONN: ⚠️ Already connected/connecting to a device, ignoring new connect request for '\(peripheral.name ?? "Unknown")'")
            return
        }

        Core.log("NEX-CONN: 🔗 Connecting to device '\(peripheral.name ?? "Unknown")' - Reason: \(reason)")

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

        Core.log("NEX-CONN: 🚀 Connection initiated with enhanced options")
    }

    func centralManager(_: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Core.log("NEX-CONN: ✅ Successfully connected to \(peripheral.name ?? "unknown device").")
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

        Core.log("NEX-CONN: 💾 Device information saved for reliable reconnection")
        peripheral.delegate = self
        Core.log("NEX-CONN: 🔍 Discovering services...")
        peripheral.discoverServices([MAIN_SERVICE_UUID])

        // Reset any failed connection attempt counters
        reconnectionAttempts = 0
        Core.log("NEX-CONN: 🔄 Reset reconnection attempts counter")
    }

    func centralManager(_: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Core.log("NEX-CONN: ❌ Failed to connect to peripheral \(peripheral.name ?? "Unknown"). Error: \(error?.localizedDescription ?? "unknown")")
        isConnecting = false
        connectionState = .disconnected
        self.peripheral = nil // Reset peripheral on failure to allow reconnection
        // Optionally, start reconnection attempts here
        if !isDisconnecting, !isKilled {
            startReconnectionTimer()
        }
    }

    func centralManager(_: CBCentralManager, didDisconnectPeripheral disconnectedPeripheral: CBPeripheral, error: Error?) {
        Core.log("NEX-CONN: 🔌 Disconnected from peripheral: \(disconnectedPeripheral.name ?? "Unknown")")

        if let error = error {
            Core.log("NEX-CONN: ⚠️ Disconnect error: \(error.localizedDescription)")
        }

        // Reset connection state
        nexReady = false
        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        connectionState = .disconnected

        // Clear command queue if needed
        if isQueueWorkerRunning {
            Core.log("NEX-CONN: 🧹 Clearing command queue due to disconnection")
        }

        if !isDisconnecting, !isKilled {
            Core.log("NEX-CONN: 🔄 Unintentional disconnect detected. Attempting reconnection...")

            // Enhanced reconnection strategy from Java implementation
            if let savedName = savedDeviceName {
                Core.log("NEX-CONN: 🎯 Will attempt to reconnect to saved device: \(savedName)")
            }

            startReconnectionTimer()
        } else {
            Core.log("NEX-CONN: ✅ Intentional disconnect (isDisconnecting: \(isDisconnecting), isKilled: \(isKilled))")

            if isDisconnecting {
                // Don't clear device info on intentional disconnect - user might reconnect later
                Core.log("NEX-CONN: 💾 Keeping device info for potential future reconnection")
            }
        }
    }

    // MARK: - MTU Negotiation (iOS-specific implementation)

    private func requestOptimalMTU(for peripheral: CBPeripheral) {
        Core.log("NEX-CONN:  negotiating MTU")
        Core.log("NEX: 🔍 iOS MTU Discovery (Platform Limitation: max \(MTU_MAX_IOS) bytes)")
        Core.log("NEX: 🎯 iOS maximum: \(MTU_MAX_IOS) bytes, default: \(MTU_DEFAULT) bytes")

        // iOS MTU is automatically negotiated - we can only discover the current value
        // No manual MTU request available on iOS (platform limitation)

        // Get current MTU capability (iOS-specific approach)
        let maxWriteLength = peripheral.maximumWriteValueLength(for: .withResponse)
        let actualMTU = maxWriteLength + 3 // Add L2CAP header size

        Core.log("NEX: 📊 iOS MTU Discovery Results:")
        Core.log("NEX:    📏 Max write length: \(maxWriteLength) bytes")
        Core.log("NEX:    📡 Effective MTU: \(actualMTU) bytes")

        // Validate against iOS limitations
        let validatedMTU = min(actualMTU, MTU_MAX_IOS)
        if actualMTU > MTU_MAX_IOS {
            Core.log("NEX: 🔧 Clamping MTU from \(actualMTU) to iOS maximum: \(MTU_MAX_IOS)")
        }

        // Process MTU result immediately (iOS doesn't have callback like Android)
        onMTUNegotiated(mtu: validatedMTU, success: true)

        // After MTU is set, start device initialization sequence (from Java implementation)
        initializeNexDevice()
    }

    private func onMTUNegotiated(mtu: Int, success: Bool) {
        Core.log("NEX-CONN: 🔄 MTU Negotiation Result: Success=\(success), Device MTU=\(mtu)")

        if success, mtu > MTU_DEFAULT {
            // Store device capability and calculate actual negotiated MTU
            deviceMaxMTU = mtu
            // iOS limitation: Use actual MTU but cap at iOS maximum
            currentMTU = min(MTU_MAX_IOS, mtu)

            Core.log("NEX: 🎯 iOS MTU Configuration Complete:")
            Core.log("NEX:    🍎 iOS Platform Max: \(MTU_MAX_IOS) bytes")
            Core.log("NEX:    📡 Device Supports: \(deviceMaxMTU) bytes")
            Core.log("NEX:    🤝 Final MTU: \(currentMTU) bytes")

            // Calculate optimal chunk sizes based on iOS MTU constraints
            maxChunkSize = currentMTU - 10 // Reserve 10 bytes for headers
            bmpChunkSize = currentMTU - 6 // Reserve 6 bytes for image headers

            Core.log("NEX: 📦 Optimized Chunk Sizes:")
            Core.log("NEX:    📄 Data Chunk Size: \(maxChunkSize) bytes")
            Core.log("NEX:    🖼️ Image Chunk Size: \(bmpChunkSize) bytes")

        } else {
            Core.log("NEX: ⚠️ MTU negotiation failed or using minimum, applying iOS defaults")
            currentMTU = MTU_DEFAULT
            deviceMaxMTU = MTU_DEFAULT
            maxChunkSize = 20 // Very conservative for 23-byte MTU
            bmpChunkSize = 20 // Very conservative for 23-byte MTU

            Core.log("NEX: 📋 iOS Fallback Configuration:")
            Core.log("NEX:    📊 Default MTU: \(MTU_DEFAULT) bytes")
            Core.log("NEX:    📦 Data Chunk Size: \(maxChunkSize) bytes")
            Core.log("NEX:    🖼️ Image Chunk Size: \(bmpChunkSize) bytes")
            Core.log("NEX:    ⚠️ Using minimal chunks due to MTU limitation")
        }

        // Device is now ready for communication
        Core.log("NEX-CONN: ✅ Device initialization complete - ready for communication")
        nexReady = true
        connectionState = .connected

        // Emit device ready event to React Native
        emitDeviceReady()
    }

    // MARK: - Device Initialization (ported from Java MentraNexSGC)

    private func initializeNexDevice() {
        Core.log("NEX-CONN: 🚀 Starting basic Nex device initialization")
        // Basic initialization - complex commands removed for now
        Core.log("NEX-CONN: ✅ Basic initialization completed")
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
                Core.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
                Core.log("NEX: 📡 Emitted device ready event with MTU: \(currentMTU)")
            }
        } catch {
            Core.log("NEX: ❌ Error emitting device ready event: \(error)")
        }
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error discovering services: \(error.localizedDescription)")
            return
        }

        guard let services = peripheral.services else {
            Core.log("NEX-CONN: ⚠️ No services found for peripheral.")
            return
        }
        for service in services {
            if service.uuid == MAIN_SERVICE_UUID {
                Core.log("NEX-CONN: ✅ Found main service. Discovering characteristics...")
                peripheral.discoverCharacteristics([WRITE_CHAR_UUID, NOTIFY_CHAR_UUID], for: service)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error discovering characteristics: \(error.localizedDescription)")
            return
        }

        guard let characteristics = service.characteristics else {
            Core.log("NEX-CONN: ⚠️ No characteristics found for service \(service.uuid).")
            return
        }
        for characteristic in characteristics {
            if characteristic.uuid == WRITE_CHAR_UUID {
                Core.log("NEX-CONN: ✅ Found write characteristic.")
                writeCharacteristic = characteristic
            } else if characteristic.uuid == NOTIFY_CHAR_UUID {
                Core.log("NEX-CONN: ✅ Found notify characteristic. Subscribing for notifications.")
                notifyCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }

        if writeCharacteristic != nil, notifyCharacteristic != nil {
            Core.log("NEX-CONN: ✅ All required characteristics discovered. Proceeding to MTU negotiation.")

            // Start MTU negotiation like Java implementation
            requestOptimalMTU(for: peripheral)
        }
    }

    func peripheral(_: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error on updating value: \(error.localizedDescription)")
            return
        }

        guard let data = characteristic.value else {
            Core.log("NEX-CONN: ⚠️ Received notification with no data.")
            return
        }
        Core.log("NEX-CONN: 📥 Received data (\(data.count) bytes): \(data.toHexString())")
        // Simple data logging for now - complex processing removed
    }

    func peripheral(_: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error writing value to \(characteristic.uuid): \(error.localizedDescription)")
            return
        }
        // This log can be very noisy, so it's commented out.
        // Core.log("NEX-CONN: 📤 Successfully wrote value to \(characteristic.uuid).")
    }

    func peripheral(_: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            Core.log("NEX-CONN: ❌ Error changing notification state for \(characteristic.uuid): \(error.localizedDescription)")
            return
        }

        if characteristic.isNotifying {
            Core.log("NEX-CONN: ✅ Successfully subscribed to notifications for characteristic \(characteristic.uuid.uuidString).")
        } else {
            Core.log("NEX-CONN:  unsubscribed from notifications for characteristic \(characteristic.uuid.uuidString).")
        }
    }
}
