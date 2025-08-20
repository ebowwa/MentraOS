//
//  MentraLiveManager.swift
//  AOS
//
//  Created by Matthew Fosse on 7/3/25.
//

//
// MentraLiveManager.swift
// MentraOS_Manager
//
// Converted from MentraLiveSGC.java
//

import Combine
import CoreBluetooth
import Foundation
import React
import UIKit

// MARK: - Supporting Types

struct MentraLiveDevice {
    let name: String
    let address: String
}

// MARK: - BlePhotoUploadService

class BlePhotoUploadService {
    static let TAG = "BlePhotoUploadService"

    // Callback protocol
    protocol UploadCallback {
        func onSuccess(requestId: String)
        func onError(requestId: String, error: String)
    }

    enum PhotoUploadError: LocalizedError {
        case decodingFailed
        case avifNotSupported
        case uploadFailed(String)
        case invalidData

        var errorDescription: String? {
            switch self {
            case .decodingFailed:
                return "Failed to decode image data"
            case .avifNotSupported:
                return "AVIF format not supported on this iOS version"
            case let .uploadFailed(message):
                return "Upload failed: \(message)"
            case .invalidData:
                return "Invalid image data"
            }
        }
    }

    /**
     * Process image data and upload to webhook
     * - Parameters:
     *   - imageData: Raw image data (AVIF or JPEG)
     *   - requestId: Original request ID for tracking
     *   - webhookUrl: Destination webhook URL
     *   - authToken: Authentication token for upload
     *   - callback: Callback for success/error
     */
    static func processAndUploadPhoto(imageData: Data,
                                      requestId: String,
                                      webhookUrl: String,
                                      authToken: String)
    {
        Task {
            do {
                CoreCommsService.log("\(TAG): Processing BLE photo for upload. Image size: \(imageData.count) bytes")

                // 1. Decode image (AVIF or JPEG) to UIImage
                guard let image = decodeImage(imageData: imageData) else {
                    throw NSError(domain: "BlePhotoUpload",
                                  code: -1,
                                  userInfo: [NSLocalizedDescriptionKey: "Failed to decode image data"])
                }

                CoreCommsService.log("\(TAG): Decoded image to bitmap: \(Int(image.size.width))x\(Int(image.size.height))")

                // 2. Convert to JPEG for upload (in case it was AVIF)
                guard let jpegData = image.jpegData(compressionQuality: 0.9) else {
                    throw NSError(domain: "BlePhotoUpload",
                                  code: -2,
                                  userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to JPEG"])
                }

                CoreCommsService.log("\(TAG): Converted to JPEG for upload. Size: \(jpegData.count) bytes")

                // 3. Upload to webhook
                try await uploadToWebhook(jpegData: jpegData,
                                          requestId: requestId,
                                          webhookUrl: webhookUrl,
                                          authToken: authToken)

                CoreCommsService.log("\(TAG): Photo uploaded successfully for requestId: \(requestId)")

                //        DispatchQueue.main.async {
                //          callback.onSuccess(requestId: requestId)
                //        }

            } catch {
                CoreCommsService.log("\(TAG): Error processing BLE photo for requestId: \(requestId), error: \(error)")

                //        DispatchQueue.main.async {
                //          callback.onError(requestId: requestId, error: error.localizedDescription)
                //        }
            }
        }
    }

    /**
     * Decode image data (AVIF or JPEG) to UIImage
     */
    private static func decodeImage(imageData: Data) -> UIImage? {
        // First try standard UIImage decoding (works for JPEG, PNG, etc)
        if let image = UIImage(data: imageData) {
            return image
        }

        // If that fails, try AVIF decoding
        // Note: AVIF support requires iOS 16+ or a third-party library
        if #available(iOS 16.0, *) {
            // iOS 16+ has native AVIF support
            return UIImage(data: imageData)
        } else {
            // For older iOS versions, you would need to integrate a third-party
            // AVIF decoder library like libavif
            CoreCommsService.log("\(TAG): AVIF decoding not supported on this iOS version")
            return nil
        }
    }

    private static func uploadToWebhook(jpegData: Data,
                                        requestId: String,
                                        webhookUrl: String,
                                        authToken: String?) async throws
    {
        guard let url = URL(string: webhookUrl) else {
            CoreCommsService.log("LIVE: Invalid webhook URL: \(webhookUrl)")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30

        // Add auth header if provided
        if let authToken = authToken, !authToken.isEmpty {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }

        // Create multipart form data
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Add requestId field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"requestId\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(requestId)\r\n".data(using: .utf8)!)

        // Add source field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"source\"\r\n\r\n".data(using: .utf8)!)
        body.append("ble_transfer\r\n".data(using: .utf8)!)

        // Add photo field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"photo\"; filename=\"\(requestId).jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(jpegData)
        body.append("\r\n".data(using: .utf8)!)

        // Close multipart form
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        print("LIVE: Uploading photo to webhook: \(webhookUrl)")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw PhotoUploadError.uploadFailed("Invalid response")
            }

            if httpResponse.statusCode < 200 || httpResponse.statusCode >= 300 {
                let errorBody = String(data: data, encoding: .utf8) ?? "No response body"
                throw PhotoUploadError.uploadFailed("Upload failed with code \(httpResponse.statusCode): \(errorBody)")
            }

            print("LIVE: Upload successful. Response code: \(httpResponse.statusCode)")

        } catch {
            if error is PhotoUploadError {
                throw error
            } else {
                throw PhotoUploadError.uploadFailed(error.localizedDescription)
            }
        }
    }
}

extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}

private enum K900ProtocolUtils {
    // Protocol constants
    static let CMD_START_CODE: [UInt8] = [0x23, 0x23] // ##
    static let CMD_END_CODE: [UInt8] = [0x24, 0x24] // $$
    static let CMD_TYPE_STRING: UInt8 = 0x30 // String/JSON type

    // JSON Field constants
    static let FIELD_C = "C" // Command/Content field
    static let FIELD_V = "V" // Version field
    static let FIELD_B = "B" // Body field

    // Command types
    static let CMD_TYPE_PHOTO: UInt8 = 0x31
    static let CMD_TYPE_VIDEO: UInt8 = 0x32
    static let CMD_TYPE_MUSIC: UInt8 = 0x33
    static let CMD_TYPE_AUDIO: UInt8 = 0x34
    static let CMD_TYPE_DATA: UInt8 = 0x35

    // File transfer constants
    static let FILE_PACK_SIZE = 400 // Max data size per packet
    static let LENGTH_FILE_START = 2
    static let LENGTH_FILE_TYPE = 1
    static let LENGTH_FILE_PACKSIZE = 2
    static let LENGTH_FILE_PACKINDEX = 2
    static let LENGTH_FILE_SIZE = 4
    static let LENGTH_FILE_NAME = 16
    static let LENGTH_FILE_FLAG = 2
    static let LENGTH_FILE_VERIFY = 1
    static let LENGTH_FILE_END = 2

    struct FilePacketInfo {
        var fileType: UInt8 = 0
        var packSize: UInt16 = 0
        var packIndex: UInt16 = 0
        var fileSize: UInt32 = 0
        var fileName: String = ""
        var flags: UInt16 = 0
        var data: Data = .init()
        var verifyCode: UInt8 = 0
        var isValid: Bool = false
    }

    static func extractFilePacket(_ protocolData: Data) -> FilePacketInfo? {
        guard protocolData.count >= 31 else {
            return nil
        }

        var info = FilePacketInfo()
        var pos = LENGTH_FILE_START // Skip start code

        // File type
        info.fileType = protocolData[pos]
        pos += LENGTH_FILE_TYPE

        // Pack size (big-endian)
        info.packSize = (UInt16(protocolData[pos]) << 8) | UInt16(protocolData[pos + 1])
        pos += LENGTH_FILE_PACKSIZE

        // Pack index (big-endian)
        info.packIndex = (UInt16(protocolData[pos]) << 8) | UInt16(protocolData[pos + 1])
        pos += LENGTH_FILE_PACKINDEX

        // File size (big-endian)
        info.fileSize = (UInt32(protocolData[pos]) << 24) |
            (UInt32(protocolData[pos + 1]) << 16) |
            (UInt32(protocolData[pos + 2]) << 8) |
            UInt32(protocolData[pos + 3])
        pos += LENGTH_FILE_SIZE

        // File name
        let nameBytes = protocolData.subdata(in: pos ..< (pos + LENGTH_FILE_NAME))

        // Find null terminator
        var nameLen = 0
        for i in 0 ..< LENGTH_FILE_NAME {
            if nameBytes[i] == 0 { break }
            nameLen += 1
        }

        if let fileName = String(data: nameBytes.subdata(in: 0 ..< nameLen), encoding: .utf8) {
            info.fileName = fileName
        }
        pos += LENGTH_FILE_NAME

        // Flags (big-endian)
        info.flags = (UInt16(protocolData[pos]) << 8) | UInt16(protocolData[pos + 1])
        pos += LENGTH_FILE_FLAG

        // Verify packet has enough data
        let requiredLength = pos + Int(info.packSize) + LENGTH_FILE_VERIFY + LENGTH_FILE_END
        if protocolData.count < requiredLength {
            print("K900ProtocolUtils: File packet too short for data. Need: \(requiredLength), Have: \(protocolData.count), packSize=\(info.packSize), pos=\(pos)")
            return nil
        }

        // Data
        info.data = protocolData.subdata(in: pos ..< (pos + Int(info.packSize)))
        pos += Int(info.packSize)

        // Verify code
        info.verifyCode = protocolData[pos]
        pos += LENGTH_FILE_VERIFY

        // Check end code
        if protocolData[pos] != CMD_END_CODE[0] || protocolData[pos + 1] != CMD_END_CODE[1] {
            return nil
        }

        // Calculate and verify checksum
        var checkSum = 0
        for byte in info.data {
            checkSum += Int(byte)
        }
        let calculatedVerify = UInt8(checkSum & 0xFF)

        info.isValid = (calculatedVerify == info.verifyCode)

        if !info.isValid {
            print("K900ProtocolUtils: File packet checksum failed. Expected: \(String(format: "%02X", info.verifyCode)), Calculated: \(String(format: "%02X", calculatedVerify))")
        } else {
            print("K900ProtocolUtils: File packet extracted successfully: index=\(info.packIndex), size=\(info.packSize), fileName=\(info.fileName)")
        }

        return info
    }
}

private struct FileTransferSession {
    let fileName: String
    let fileSize: Int
    let totalPackets: Int
    var expectedNextPacket: Int = 0
    var receivedPackets: [Int: Data] = [:]
    let startTime: Date
    var isComplete: Bool = false

    init(fileName: String, fileSize: Int) {
        self.fileName = fileName
        self.fileSize = fileSize
        totalPackets = (fileSize + K900ProtocolUtils.FILE_PACK_SIZE - 1) / K900ProtocolUtils.FILE_PACK_SIZE
        startTime = Date()
    }

    mutating func addPacket(_ index: Int, data: Data) -> Bool {
        guard index >= 0 && index < totalPackets && receivedPackets[index] == nil else {
            return false
        }

        receivedPackets[index] = data

        // Update expected next packet
        while receivedPackets[expectedNextPacket] != nil {
            expectedNextPacket += 1
        }

        // Check if complete
        isComplete = (receivedPackets.count == totalPackets)
        return true
    }

    func assembleFile() -> Data? {
        guard isComplete else { return nil }

        var fileData = Data(capacity: fileSize)

        for i in 0 ..< totalPackets {
            if let packet = receivedPackets[i] {
                fileData.append(packet)
            }
        }

        // Trim to exact file size
        return fileData.prefix(fileSize)
    }
}

private struct BlePhotoTransfer {
    let bleImgId: String
    let requestId: String
    let webhookUrl: String
    var session: FileTransferSession?
    let phoneStartTime: Date
    var bleTransferStartTime: Date?
    var glassesCompressionDurationMs: Int64 = 0

    init(bleImgId: String, requestId: String, webhookUrl: String) {
        self.bleImgId = bleImgId
        self.requestId = requestId
        self.webhookUrl = webhookUrl
        phoneStartTime = Date()
    }
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

    func centralManager(_: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData _: [String: Any], rssi _: NSNumber) {
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
               savedDeviceName == name
            {
                CoreCommsService.log("Found our remembered device by name, connecting: \(name)")
                stopScan()
                connectToDevice(peripheral)
            }
        }
    }

    func centralManager(_: CBCentralManager, didConnect peripheral: CBPeripheral) {
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

    func centralManager(_: CBCentralManager, didDisconnectPeripheral _: CBPeripheral, error _: Error?) {
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

    func centralManager(_: CBCentralManager, didFailToConnect _: CBPeripheral, error: Error?) {
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
    func peripheral(_: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
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
            peripheral.discoverCharacteristics([TX_CHAR_UUID, RX_CHAR_UUID, FILE_READ_UUID, FILE_WRITE_UUID], for: service)
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
            } else if characteristic.uuid == FILE_READ_UUID {
                fileReadCharacteristic = characteristic
                CoreCommsService.log("📁 Found FILE_READ characteristic (72FF)!")
            } else if characteristic.uuid == FILE_WRITE_UUID {
                fileWriteCharacteristic = characteristic
                CoreCommsService.log("📁 Found FILE_WRITE characteristic (73FF)!")
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

            // Enable notifications on file characteristics if available
            if let fileRead = fileReadCharacteristic {
                peripheral.setNotifyValue(true, for: fileRead)
            }

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

    func peripheral(_: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        // CoreCommsService.log("GOT CHARACTERISTIC UPDATE @@@@@@@@@@@@@@@@@@@@@")
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

        // CoreCommsService.log("Thread-\(threadId): 🎉 didUpdateValueFor CALLBACK TRIGGERED! Characteristic: \(uuid)")
        // if uuid == RX_CHAR_UUID {
        //   CoreCommsService.log("Thread-\(threadId): 🎯 RECEIVED DATA ON RX CHARACTERISTIC (Peripheral's TX)")
        // } else if uuid == TX_CHAR_UUID {
        //   CoreCommsService.log("Thread-\(threadId): 🎯 RECEIVED DATA ON TX CHARACTERISTIC (Peripheral's RX)")
        // }
        // CoreCommsService.log("Thread-\(threadId): 🔍 Processing received data - \(data.count) bytes")

        processReceivedData(data)
    }

    func peripheral(_: CBPeripheral, didWriteValueFor _: CBCharacteristic, error: Error?) {
        if let error = error {
            CoreCommsService.log("Error writing characteristic: \(error.localizedDescription)")
        } else {
            CoreCommsService.log("Characteristic write successful")
        }
    }

    func peripheral(_: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            CoreCommsService.log("Error updating notification state: \(error.localizedDescription)")
        } else {
            CoreCommsService.log("Notification state updated for \(characteristic.uuid): \(characteristic.isNotifying ? "ON" : "OFF")")

            if characteristic.uuid == RX_CHAR_UUID, characteristic.isNotifying {
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

    @objc func RN_displayBitmap(_: UIImage) {
        CoreCommsService.log("[STUB] Device has no display. Cannot display bitmap.")
    }

    @objc func RN_displayTextLine(_ text: String) {
        CoreCommsService.log("[STUB] Device has no display. Text line would show: \(text)")
    }

    @objc func RN_displayReferenceCardSimple(_ title: String, body _: String) {
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

    @objc func RN_displayCustomContent(_: String) {
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
    private let FILE_READ_UUID = CBUUID(string: "000072FF-0000-1000-8000-00805f9b34fb")
    private let FILE_WRITE_UUID = CBUUID(string: "000073FF-0000-1000-8000-00805f9b34fb")
    private let FILE_SAVE_DIR = "MentraLive_Images"

    // NEW: File transfer properties
    private var fileReadCharacteristic: CBCharacteristic?
    private var fileWriteCharacteristic: CBCharacteristic?
    private var activeFileTransfers = [String: FileTransferSession]()
    private var blePhotoTransfers = [String: BlePhotoTransfer]()

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

    // MARK: - Properties

    @objc static func requiresMainQueueSetup() -> Bool { return true }

    // Connection State
    private var _connectionState: MentraLiveConnectionState = .disconnected
    var connectionState: MentraLiveConnectionState {
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
    var glassesReady = false
    private var reconnectAttempts = 0
    private var isNewVersion = false
    private var globalMessageId = 0
    private var lastReceivedMessageId = 0
    var glassesAppVersion: String = ""
    var glassesBuildNumber: String = ""
    var glassesOtaVersionUrl: String = ""
    var glassesDeviceModel: String = ""
    var glassesAndroidVersion: String = ""

    var ready: Bool {
        get { return glassesReady }
        set {
            let oldValue = glassesReady
            glassesReady = newValue
            if oldValue != newValue {
                // Call the callback when state changes
                //        onConnectionStateChanged?()
            }
            if !newValue {
                // Reset battery levels when disconnected
                batteryLevel = -1
            }
        }
    }

    // Data Properties
    @Published var batteryLevel: Int = -1
    @Published var isCharging: Bool = false
    @Published var isWifiConnected: Bool = false
    @Published var wifiSsid: String = ""
    @Published var wifiLocalIp: String = ""
    @Published var isHotspotEnabled: Bool = false
    @Published var hotspotSsid: String = ""
    @Published var hotspotPassword: String = ""
    @Published var hotspotLocalIp: String = ""

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
    var jsonObservable: ((JSONObject) -> Void)?

    // onButtonPress (buttonId: String, pressType: String)
    var onButtonPress: ((String, String) -> Void)?
    // onPhotoRequest (requestId: String, appId: String, webhookUrl: String?)
    var onPhotoRequest: ((String, String) -> Void)?
    // onVideoStreamResponse (appId: String, streamUrl: String)
    var onVideoStreamResponse: ((String, String) -> Void)?

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

    func findCompatibleDevices() {
        CoreCommsService.log("Finding compatible Mentra Live glasses")

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

    func connectById(_ deviceName: String) {
        CoreCommsService.log("connectById: \(deviceName)")
        Task {
            // Save the device name for future reconnection
            UserDefaults.standard.set(deviceName, forKey: PREFS_DEVICE_NAME)

            // Start scanning to find this specific device
            if centralManager == nil {
                centralManager = CBCentralManager(delegate: self, queue: bluetoothQueue, options: ["CBCentralManagerOptionShowPowerAlertKey": 0])
                // wait for the central manager to be fully initialized before we start scanning:
                try? await Task.sleep(nanoseconds: 100 * 1_000_000) // 100ms
            }

            // Will connect when found during scan
            startScan()
        }
    }

    @objc func getConnectedBluetoothName() -> String? {
        return connectedPeripheral?.name
    }

    @objc func disconnect() {
        CoreCommsService.log("Disconnecting from Mentra Live glasses")

        // Clear any pending messages
        pending = nil
        pendingMessageTimer?.invalidate()
        pendingMessageTimer = nil

        if let peripheral = connectedPeripheral {
            centralManager?.cancelPeripheralConnection(peripheral)
        }

        stopAllTimers()
        connectionState = .disconnected
    }

    @objc func setMicrophoneEnabled(_ enabled: Bool) {
        CoreCommsService.log("Setting microphone state to: \(enabled)")

        let json: [String: Any] = [
            "type": "set_mic_state",
            "enabled": enabled,
        ]

        sendJson(json, wakeUp: true)
    }

    @objc func requestPhoto(_ requestId: String, appId: String, webhookUrl: String?, size: String?) {
        CoreCommsService.log("Requesting photo: \(requestId) for app: \(appId)")

        var json: [String: Any] = [
            "type": "take_photo",
            "requestId": requestId,
            "appId": appId,
        ]

        // Always generate BLE ID for potential fallback
        let bleImgId = "I" + String(format: "%09d", Int(Date().timeIntervalSince1970 * 1000) % 100_000_000)
        json["bleImgId"] = bleImgId
        json["transferMethod"] = "auto"

        if let webhookUrl = webhookUrl, !webhookUrl.isEmpty {
            json["webhookUrl"] = webhookUrl
            blePhotoTransfers[bleImgId] = BlePhotoTransfer(bleImgId: bleImgId, requestId: requestId, webhookUrl: webhookUrl)
        }

        // propagate size (default to medium if invalid)
        if let size = size, ["small", "medium", "large"].contains(size) {
            json["size"] = size
        } else {
            json["size"] = "medium"
        }

        CoreCommsService.log("Using auto transfer mode with BLE fallback ID: \(bleImgId)")

        sendJson(json, wakeUp: true)
    }

    func startRtmpStream(_ message: [String: Any]) {
        CoreCommsService.log("Starting RTMP stream")
        var json = message
        json.removeValue(forKey: "timestamp")
        sendJson(json, wakeUp: true)
    }

    func stopRtmpStream() {
        CoreCommsService.log("Stopping RTMP stream")
        let json: [String: Any] = ["type": "stop_rtmp_stream"]
        sendJson(json, wakeUp: true)
    }

    func sendRtmpKeepAlive(_ message: [String: Any]) {
        CoreCommsService.log("Sending RTMP keep alive")
        sendJson(message)
    }

    @objc func startRecordVideo() {
        let json: [String: Any] = ["type": "start_record_video"]
        sendJson(json, wakeUp: true)
    }

    @objc func stopRecordVideo() {
        let json: [String: Any] = ["type": "stop_record_video"]
        sendJson(json, wakeUp: true)
    }

    @objc func startVideoStream() {
        let json: [String: Any] = ["type": "start_video_stream"]
        sendJson(json, wakeUp: true)
    }

    @objc func stopVideoStream() {
        let json: [String: Any] = ["type": "stop_video_stream"]
        sendJson(json, wakeUp: true)
    }

    // MARK: - Command Queue

    class PendingMessage {
        init(data: Data, id: String, retries: Int) {
            self.data = data
            self.id = id
            self.retries = retries
        }

        let data: Data
        let retries: Int
        let id: String
    }

    private var pending: PendingMessage?
    private var pendingMessageTimer: Timer?

    actor CommandQueue {
        private var commands: [PendingMessage] = []

        func enqueue(_ command: PendingMessage) {
            commands.append(command)
        }

        func pushToFront(_ command: PendingMessage) {
            commands.insert(command, at: 0)
        }

        func dequeue() -> PendingMessage? {
            guard !commands.isEmpty else { return nil }
            return commands.removeFirst()
        }
    }

    private func setupCommandQueue() {
        Task.detached { [weak self] in
            guard let self = self else { return }
            while true {
                if self.pending == nil {
                    if let command = await self.commandQueue.dequeue() {
                        await self.processSendQueue(command)
                    }
                }
                try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
            }
        }
    }

    private func processSendQueue(_ message: PendingMessage) async {
        guard let peripheral = connectedPeripheral,
              let txChar = txCharacteristic
        else {
            return
        }

        // Enforce rate limiting
        let currentTime = Date().timeIntervalSince1970 * 1000
        let timeSinceLastSend = currentTime - lastSendTimeMs

        try? await Task.sleep(nanoseconds: UInt64(1_000_000))
        lastSendTimeMs = Date().timeIntervalSince1970 * 1000

        // Send the data
        peripheral.writeValue(message.data, for: txChar, type: .withResponse)

        // don't do the retry system on the old glasses versions
        if !isNewVersion {
            return
        }

        // Set the pending message
        pending = message

        // Start retry timer for 1s
        DispatchQueue.main.async { [weak self] in
            self?.pendingMessageTimer?.invalidate()
            self?.pendingMessageTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: false) { _ in
                self?.handlePendingMessageTimeout()
            }
        }
    }

    private func handlePendingMessageTimeout() {
        guard let pendingMessage = pending else { return }

        CoreCommsService.log("⚠️ Message timeout - no response for mId: \(pendingMessage.id), retry attempt: \(pendingMessage.retries + 1)/3")

        // Clear the pending message
        pending = nil

        // Check if we should retry
        if pendingMessage.retries < 3 {
            // Create a new message with incremented retry count
            let retryMessage = PendingMessage(
                data: pendingMessage.data,
                id: pendingMessage.id,
                retries: pendingMessage.retries + 1
            )

            // Push to front of queue for immediate retry
            Task {
                await self.commandQueue.pushToFront(retryMessage)
            }

            CoreCommsService.log("🔄 Retrying message mId: \(pendingMessage.id) (attempt \(retryMessage.retries)/3)")
        } else {
            CoreCommsService.log("❌ Message failed after 3 retries - mId: \(pendingMessage.id)")
            // Optionally emit an event or callback for failed message
        }
    }

    // MARK: - BLE Scanning

    private func startScan() {
        // guard !isScanning else { return }

        guard centralManager!.state == .poweredOn else {
            CoreCommsService.log("Attempting to scan but bluetooth is not powered on.")
            return
        }

        CoreCommsService.log("Starting BLE scan for Mentra Live glasses")
        isScanning = true

        let scanOptions: [String: Any] = [
            CBCentralManagerScanOptionAllowDuplicatesKey: false,
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
        // TODO: implement reconnection
    }

    // MARK: - Data Processing

    private func processReceivedData(_ data: Data) {
        guard data.count > 0 else { return }

        let bytes = [UInt8](data)

        // Log first few bytes for debugging
        let hexString = data.prefix(16).map { String(format: "%02X ", $0) }.joined()
        CoreCommsService.log("Processing data packet, first \(min(data.count, 16)) bytes: \(hexString)")

        // Check for K900 protocol format (starts with ##)
        if data.count >= 7, bytes[0] == 0x23, bytes[1] == 0x23 {
            processK900ProtocolData(data)
            return
        }

        // Check for JSON data
        if bytes[0] == 0x7B { // '{'
            if let jsonString = String(data: data, encoding: .utf8),
               jsonString.hasPrefix("{"), jsonString.hasSuffix("}")
            {
                processJsonMessage(jsonString)
            }
        }
    }

    private func processK900ProtocolData(_ data: Data) {
        let bytes = [UInt8](data)

        let commandType = bytes[2]

        // Check if this is a file transfer packet
        if commandType == K900ProtocolUtils.CMD_TYPE_PHOTO ||
            commandType == K900ProtocolUtils.CMD_TYPE_VIDEO ||
            commandType == K900ProtocolUtils.CMD_TYPE_AUDIO ||
            commandType == K900ProtocolUtils.CMD_TYPE_DATA
        {
            CoreCommsService.log("📦 DETECTED FILE TRANSFER PACKET (type: 0x\(String(format: "%02X", commandType)))")

            // Debug: Log the raw data
            let hexDump = data.prefix(64).map { String(format: "%02X ", $0) }.joined()
            CoreCommsService.log("📦 Raw file packet data length=\(data.count), first 64 bytes: \(hexDump)")

            // The data IS the file packet - it starts with ## and contains the full file packet structure
            if let packetInfo = K900ProtocolUtils.extractFilePacket(data) {
                processFilePacket(packetInfo)
            } else {
                CoreCommsService.log("Failed to extract or validate file packet")
                // BES chip handles ACKs automatically
            }

            return // Exit after processing file packet
        }

        let payloadLength: Int

        // Determine endianness based on device name
        if let deviceName = connectedPeripheral?.name,
           deviceName.hasPrefix("XyBLE_") || deviceName.hasPrefix("MENTRA_LIVE")
        {
            // K900 device - big-endian
            payloadLength = (Int(bytes[3]) << 8) | Int(bytes[4])
        } else {
            // Standard device - little-endian
            payloadLength = (Int(bytes[4]) << 8) | Int(bytes[3])
        }

        CoreCommsService.log("K900 Protocol - Command: 0x\(String(format: "%02X", commandType)), Payload length: \(payloadLength)")

        // Extract payload if it's JSON data
        if commandType == 0x30, data.count >= payloadLength + 7 {
            if bytes[5 + payloadLength] == 0x24, bytes[6 + payloadLength] == 0x24 {
                let payloadData = data.subdata(in: 5 ..< (5 + payloadLength))
                if let payloadString = String(data: payloadData, encoding: .utf8) {
                    processJsonMessage(payloadString)
                }
            }
        }
    }

    private func processJsonMessage(_ jsonString: String) {
        CoreCommsService.log("Got JSON from glasses: \(jsonString)")

        do {
            guard let data = jsonString.data(using: .utf8),
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                return
            }

            processJsonObject(json)
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
            return
        }

        if let mId = json["mId"] as? Int {
            CoreCommsService.log("Received message with mId: \(mId)")
            if String(mId) == pending?.id {
                CoreCommsService.log("Received expected response! clearing pending")
                pending = nil
                // Cancel the retry timer
                pendingMessageTimer?.invalidate()
                pendingMessageTimer = nil
            } else if pending?.id != nil {
                CoreCommsService.log("Received unexpected response! expected: \(pending!.id), received: \(mId) global: \(globalMessageId)")
            }
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
            let ip = json["local_ip"] as? String ?? ""
            updateWifiStatus(connected: connected, ssid: ssid, ip: ip)

        case "hotspot_status_update":
            let enabled = json["hotspot_enabled"] as? Bool ?? false
            let ssid = json["hotspot_ssid"] as? String ?? ""
            let password = json["hotspot_password"] as? String ?? ""
            let ip = json["hotspot_ip"] as? String ?? ""
            updateHotspotStatus(enabled: enabled, ssid: ssid, password: password, ip: ip)

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

        case "imu_response", "imu_stream_response", "imu_gesture_response",
             "imu_gesture_subscribed", "imu_ack", "imu_error":
            // Handle IMU-related responses
            handleImuResponse(json)

        case "keep_alive_ack":
            emitKeepAliveAck(json)

        case "msg_ack":
            CoreCommsService.log("Received msg_ack")

        case "ble_photo_ready":
            processBlePhotoReady(json)

        case "ble_photo_complete":
            processBlePhotoComplete(json)

        default:
            // Forward unknown types to observable
            //      jsonObservable?(json)
            CoreCommsService.log("Unhandled message type: \(type)")
        }
    }

    private func processK900JsonMessage(_ json: [String: Any]) {
        guard let command = json["C"] as? String else { return }

        CoreCommsService.log("Processing K900 command: \(command)")

        // convert command string (which is a json string) to a json object:
        let commandJson = try? JSONSerialization.jsonObject(with: command.data(using: .utf8)!) as? [String: Any]
        processJsonObject(commandJson ?? [:])

        if command.starts(with: "{") {
            return
        }

        switch command {
        case "sr_hrt":
            if let bodyObj = json["B"] as? [String: Any] {
                let ready = bodyObj["ready"] as? Int ?? 0

                let percentage = bodyObj["pt"] as? Int ?? 0
                if percentage > 0, percentage <= 20 {
                    if !glassesReady {
                        CoreCommsService.sendPairFailureEvent("errors:pairingBatteryTooLow")
                        return
                    }
                }

                if ready == 1 {
                    CoreCommsService.log("K900 SOC ready")
                    let readyMsg: [String: Any] = [
                        "type": "phone_ready",
                        "timestamp": Int64(Date().timeIntervalSince1970 * 1000),
                    ]
                    // Send it through our data channel
                    sendJson(readyMsg, wakeUp: true)
                }
            }

        case "sr_batv":
            if let body = json["B"] as? [String: Any],
               let voltage = body["vt"] as? Int,
               let percentage = body["pt"] as? Int
            {
                let voltageVolts = Double(voltage) / 1000.0
                let isCharging = voltage > 4000

                CoreCommsService.log("🔋 K900 Battery Status - Voltage: \(voltageVolts)V, Level: \(percentage)%")
                updateBatteryStatus(level: percentage, charging: isCharging)
            }

        case "sr_shut":
            CoreCommsService.log("K900 shutdown command received - glasses shutting down")
            // Mark as killed to prevent reconnection attempts
            isKilled = true
            // Clean disconnect without reconnection
            if let peripheral = connectedPeripheral {
                CoreCommsService.log("Disconnecting from glasses due to shutdown")
                centralManager?.cancelPeripheralConnection(peripheral)
            }
            // Notify the system that glasses are intentionally disconnected
            connectionState = .disconnected

        default:
            CoreCommsService.log("Unknown K900 command: \(command)")
            jsonObservable?(json)
        }
    }

    // commands to send to the glasses:

    func requestWifiScan() {
        CoreCommsService.log("LiveManager: Requesting WiFi scan from glasses")
        let json: [String: Any] = ["type": "request_wifi_scan"]
        sendJson(json)
    }

    func sendWifiCredentials(_ ssid: String, password: String) {
        CoreCommsService.log("LiveManager: Sending WiFi credentials for SSID: \(ssid)")

        guard !ssid.isEmpty else {
            CoreCommsService.log("LiveManager: Cannot set WiFi credentials - SSID is empty")
            return
        }

        let json: [String: Any] = [
            "type": "set_wifi_credentials",
            "ssid": ssid,
            "password": password,
        ]

        sendJson(json, wakeUp: true)
    }

    func sendHotspotState(_ enabled: Bool) {
        CoreCommsService.log("LiveManager: 🔥 Sending hotspot state: \(enabled)")

        let json: [String: Any] = [
            "type": "set_hotspot_state",
            "enabled": enabled,
        ]

        sendJson(json, wakeUp: true)
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

        // Send user settings to glasses
        sendUserSettings()

        // Start heartbeat
        startHeartbeat()

        // Update connection state
        connectionState = .connected
    }

    private func handleWifiScanResult(_ json: [String: Any]) {
        var networks: [String] = []
        var enhancedNetworks: [[String: Any]] = []

        // First, check for enhanced format (networks_neo)
        if let networksNeoArray = json["networks_neo"] as? [[String: Any]] {
            enhancedNetworks = networksNeoArray
            // Extract SSIDs for backwards compatibility
            networks = networksNeoArray.compactMap { networkInfo in
                networkInfo["ssid"] as? String
            }
            CoreCommsService.log("Received enhanced WiFi scan results: \(enhancedNetworks.count) networks with security info")
        }
        // Fall back to legacy format
        else if let networksArray = json["networks"] as? [String] {
            networks = networksArray
            CoreCommsService.log("Received legacy WiFi scan results: \(networks.count) networks found")
        } else if let networksString = json["networks"] as? String {
            networks = networksString.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            CoreCommsService.log("Received legacy WiFi scan results (string format): \(networks.count) networks found")
        }

        // Emit with enhanced data if available, otherwise legacy format
        if !enhancedNetworks.isEmpty {
            emitWifiScanResultEnhanced(enhancedNetworks, legacyNetworks: networks)
        } else {
            emitWifiScanResult(networks)
        }
    }

    private func handleButtonPress(_ json: [String: Any]) {
        let buttonId = json["buttonId"] as? String ?? "unknown"
        let pressType = json["pressType"] as? String ?? "short"

        CoreCommsService.log("Received button press - buttonId: \(buttonId), pressType: \(pressType)")
        onButtonPress?(buttonId, pressType)
    }

    private func handleVersionInfo(_ json: [String: Any]) {
        let appVersion = json["app_version"] as? String ?? ""
        let buildNumber = json["build_number"] as? String ?? ""
        let deviceModel = json["device_model"] as? String ?? ""
        let androidVersion = json["android_version"] as? String ?? ""
        let otaVersionUrl = json["ota_version_url"] as? String ?? ""

        glassesAppVersion = appVersion
        glassesBuildNumber = buildNumber
        glassesOtaVersionUrl = otaVersionUrl
        isNewVersion = (Int(buildNumber) ?? 0) >= 5
        glassesDeviceModel = deviceModel
        glassesAndroidVersion = androidVersion

        CoreCommsService.log("Glasses Version - App: \(appVersion), Build: \(buildNumber), Device: \(deviceModel), Android: \(androidVersion), OTA URL: \(otaVersionUrl)")
        emitVersionInfo(appVersion: appVersion, buildNumber: buildNumber, deviceModel: deviceModel, androidVersion: androidVersion, otaVersionUrl: otaVersionUrl)
    }

    private func handleAck(_: [String: Any]) {
        CoreCommsService.log("Received ack")
        //    let messageId = json["mId"] as? Int ?? 0
        //    if let pendingMessage = pending, pendingMessage.id == messageId {
        //      pending = nil
        //    }
    }

    // MARK: - BLE Photo Transfer Handlers

    private func processBlePhotoReady(_ json: [String: Any]) {
        let bleImgId = json["bleImgId"] as? String ?? ""
        let requestId = json["requestId"] as? String ?? ""
        let compressionDurationMs = json["compressionDurationMs"] as? Int64 ?? 0

        CoreCommsService.log("📸 BLE photo ready notification: bleImgId=\(bleImgId), requestId=\(requestId)")

        // Update the transfer with glasses compression duration
        if var transfer = blePhotoTransfers[bleImgId] {
            transfer.glassesCompressionDurationMs = compressionDurationMs
            transfer.bleTransferStartTime = Date() // BLE transfer starts now
            blePhotoTransfers[bleImgId] = transfer
            CoreCommsService.log("⏱️ Glasses compression took: \(compressionDurationMs)ms")
        } else {
            CoreCommsService.log("Received ble_photo_ready for unknown transfer: \(bleImgId)")
        }
    }

    private func processBlePhotoComplete(_ json: [String: Any]) {
        let bleRequestId = json["requestId"] as? String ?? ""
        let bleBleImgId = json["bleImgId"] as? String ?? ""
        let bleSuccess = json["success"] as? Bool ?? false

        CoreCommsService.log("BLE photo transfer complete - requestId: \(bleRequestId), bleImgId: \(bleBleImgId), success: \(bleSuccess)")

        // Send completion notification back to glasses
        if bleSuccess {
            sendBleTransferComplete(requestId: bleRequestId, bleImgId: bleBleImgId, success: true)
        } else {
            CoreCommsService.log("BLE photo transfer failed for requestId: \(bleRequestId)")
        }
    }

    // MARK: - File Transfer Processing

    private func processFilePacket(_ packetInfo: K900ProtocolUtils.FilePacketInfo) {
        //    CoreCommsService.log("📦 Processing file packet: \(packetInfo.fileName) [\(packetInfo.packIndex)/\(((packetInfo.fileSize + K900ProtocolUtils.FILE_PACK_SIZE - 1) / K900ProtocolUtils.FILE_PACK_SIZE - 1))] (\(packetInfo.packSize) bytes)")

        // Check if this is a BLE photo transfer we're tracking
        var bleImgId = packetInfo.fileName
        if let dotIndex = bleImgId.lastIndex(of: ".") {
            bleImgId = String(bleImgId[..<dotIndex])
        }

        if var photoTransfer = blePhotoTransfers[bleImgId] {
            // This is a BLE photo transfer
            CoreCommsService.log("📦 BLE photo transfer packet for requestId: \(photoTransfer.requestId)")

            // Get or create session for this transfer
            if photoTransfer.session == nil {
                var session = FileTransferSession(fileName: packetInfo.fileName, fileSize: Int(packetInfo.fileSize))
                photoTransfer.session = session
                blePhotoTransfers[bleImgId] = photoTransfer
                CoreCommsService.log("📦 Started BLE photo transfer: \(packetInfo.fileName) (\(packetInfo.fileSize) bytes, \(session.totalPackets) packets)")
            }

            // Add packet to session
            if var session = photoTransfer.session {
                let added = session.addPacket(Int(packetInfo.packIndex), data: packetInfo.data)
                photoTransfer.session = session
                blePhotoTransfers[bleImgId] = photoTransfer

                if added, session.isComplete {
                    let transferEndTime = Date()
                    let totalDuration = transferEndTime.timeIntervalSince(photoTransfer.phoneStartTime) * 1000
                    let bleTransferDuration = photoTransfer.bleTransferStartTime != nil ?
                        transferEndTime.timeIntervalSince(photoTransfer.bleTransferStartTime!) * 1000 : 0

                    CoreCommsService.log("✅ BLE photo transfer complete: \(packetInfo.fileName)")
                    CoreCommsService.log("⏱️ Total duration (request to complete): \(Int(totalDuration))ms")
                    CoreCommsService.log("⏱️ Glasses compression: \(photoTransfer.glassesCompressionDurationMs)ms")
                    if bleTransferDuration > 0 {
                        CoreCommsService.log("⏱️ BLE transfer duration: \(Int(bleTransferDuration))ms")
                        CoreCommsService.log("📊 Transfer rate: \(Int(packetInfo.fileSize) * 1000 / Int(bleTransferDuration)) bytes/sec")
                    }

                    // Get complete image data (AVIF or JPEG)
                    if let imageData = session.assembleFile() {
                        // Process and upload the photo
                        processAndUploadBlePhoto(photoTransfer, imageData: imageData)
                    }

                    // Clean up
                    blePhotoTransfers.removeValue(forKey: bleImgId)
                }
            }

            return
        }

        // Regular file transfer (not a BLE photo)
        var session = activeFileTransfers[packetInfo.fileName]
        if session == nil {
            // New file transfer
            session = FileTransferSession(fileName: packetInfo.fileName, fileSize: Int(packetInfo.fileSize))
            activeFileTransfers[packetInfo.fileName] = session

            CoreCommsService.log("📦 Started new file transfer: \(packetInfo.fileName) (\(packetInfo.fileSize) bytes, \(session!.totalPackets) packets)")
        }

        // Add packet to session
        if var sess = session {
            let added = sess.addPacket(Int(packetInfo.packIndex), data: packetInfo.data)
            activeFileTransfers[packetInfo.fileName] = sess

            if added {
                CoreCommsService.log("📦 Packet \(packetInfo.packIndex) received successfully (BES will auto-ACK)")

                // Check if transfer is complete
                if sess.isComplete {
                    CoreCommsService.log("📦 File transfer complete: \(packetInfo.fileName)")

                    // Assemble and save the file
                    if let fileData = sess.assembleFile() {
                        saveReceivedFile(fileName: packetInfo.fileName, fileData: fileData, fileType: packetInfo.fileType)
                    }

                    // Remove from active transfers
                    activeFileTransfers.removeValue(forKey: packetInfo.fileName)
                }
            } else {
                CoreCommsService.log("📦 Duplicate or invalid packet: \(packetInfo.packIndex)")
            }
        }
    }

    private func saveReceivedFile(fileName: String, fileData: Data, fileType: UInt8) {
        do {
            // Get or create the directory for saving files
            let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            let saveDirectory = documentsDirectory.appendingPathComponent(FILE_SAVE_DIR)

            if !FileManager.default.fileExists(atPath: saveDirectory.path) {
                try FileManager.default.createDirectory(at: saveDirectory, withIntermediateDirectories: true)
            }

            // Generate unique filename with timestamp
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyyMMdd_HHmmss"
            let timestamp = dateFormatter.string(from: Date())

            // Determine file extension based on type
            var fileExtension = ""
            switch fileType {
            case K900ProtocolUtils.CMD_TYPE_PHOTO:
                // For photos, try to preserve the original extension
                if let dotIndex = fileName.lastIndex(of: ".") {
                    fileExtension = String(fileName[dotIndex...])
                } else {
                    fileExtension = ".jpg" // Default to JPEG if no extension
                }
            case K900ProtocolUtils.CMD_TYPE_VIDEO:
                fileExtension = ".mp4"
            case K900ProtocolUtils.CMD_TYPE_AUDIO:
                fileExtension = ".wav"
            default:
                // Try to get extension from original filename
                if let dotIndex = fileName.lastIndex(of: ".") {
                    fileExtension = String(fileName[dotIndex...])
                }
            }

            // Create unique filename
            var baseFileName = fileName
            if let dotIndex = baseFileName.lastIndex(of: ".") {
                baseFileName = String(baseFileName[..<dotIndex])
            }
            let uniqueFileName = "\(baseFileName)_\(timestamp)\(fileExtension)"

            // Save the file
            let fileURL = saveDirectory.appendingPathComponent(uniqueFileName)
            try fileData.write(to: fileURL)

            CoreCommsService.log("💾 Saved file: \(fileURL.path)")

            // Notify about the received file
            notifyFileReceived(filePath: fileURL.path, fileType: fileType)

        } catch {
            CoreCommsService.log("Error saving received file: \(fileName), error: \(error)")
        }
    }

    private func notifyFileReceived(filePath: String, fileType: UInt8) {
        // Create event based on file type
        let event: [String: Any] = [
            "type": "file_received",
            "filePath": filePath,
            "fileType": String(format: "0x%02X", fileType),
            "timestamp": Int64(Date().timeIntervalSince1970 * 1000),
        ]

        // Emit event through data observable
        jsonObservable?(event)
    }

    private func processAndUploadBlePhoto(_ transfer: BlePhotoTransfer, imageData: Data) {
        CoreCommsService.log("Processing BLE photo for upload. RequestId: \(transfer.requestId)")
        let uploadStartTime = Date()

        // Save BLE photo locally for debugging/backup
        //    do {
        //      let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        //      let saveDirectory = documentsDirectory.appendingPathComponent(FILE_SAVE_DIR)
        //
        //      if !FileManager.default.fileExists(atPath: saveDirectory.path) {
        //        try FileManager.default.createDirectory(at: saveDirectory, withIntermediateDirectories: true)
        //      }
        //
        //      // BLE photos are ALWAYS AVIF format
        //      let fileName = "BLE_\(transfer.bleImgId)_\(Int64(Date().timeIntervalSince1970 * 1000)).avif"
        //      let fileURL = saveDirectory.appendingPathComponent(fileName)
        //
        //      try imageData.write(to: fileURL)
        //      CoreCommsService.log("💾 Saved BLE photo locally: \(fileURL.path)")
        //    } catch {
        //      CoreCommsService.log("Error saving BLE photo locally: \(error)")
        //    }

        // Get core token for authentication
        guard let coreToken = UserDefaults.standard.string(forKey: "core_token") else {
            CoreCommsService.log("LIVE: core_token not set!")
            return
        }

        BlePhotoUploadService.processAndUploadPhoto(imageData: imageData, requestId: transfer.requestId, webhookUrl: transfer.webhookUrl, authToken: coreToken)
    }

    private func sendBleTransferComplete(requestId: String, bleImgId: String, success: Bool) {
        let json: [String: Any] = [
            "type": "ble_photo_transfer_complete",
            "requestId": requestId,
            "bleImgId": bleImgId,
            "success": success,
        ]

        sendJson(json, wakeUp: true)
        CoreCommsService.log("Sent BLE transfer complete notification: \(json)")
    }

    // MARK: - Sending Data

    func queueSend(_ data: Data, id: String) {
        Task {
            await commandQueue.enqueue(PendingMessage(data: data, id: id, retries: 0))
        }
    }

    func sendJson(_ jsonOriginal: [String: Any], wakeUp: Bool = false) {
        do {
            var json = jsonOriginal
            var messageId: Int64 = -1
            if isNewVersion {
                messageId = Int64(globalMessageId)
                json["mId"] = globalMessageId
                globalMessageId += 1
            }

            let jsonData = try JSONSerialization.data(withJSONObject: json)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                // First check if the message needs chunking
                // Create a test C-wrapped version to check size
                var testWrapper: [String: Any] = [K900ProtocolUtils.FIELD_C: jsonString]
                if wakeUp {
                    testWrapper["W"] = 1
                }
                let testData = try JSONSerialization.data(withJSONObject: testWrapper)
                let testWrappedJson = String(data: testData, encoding: .utf8) ?? ""

                // Check if chunking is needed
//                if MessageChunker.needsChunking(testWrappedJson) {
//                    CoreCommsService.log("Message exceeds threshold, chunking required")
//
//                    // Create chunks
//                    let chunks = MessageChunker.createChunks(originalJson: jsonString, messageId: messageId)
//                    CoreCommsService.log("Sending \(chunks.count) chunks")
//
//                    // Send each chunk
//                    for (index, chunk) in chunks.enumerated() {
//                        let chunkData = try JSONSerialization.data(withJSONObject: chunk)
//                        if let chunkStr = String(data: chunkData, encoding: .utf8) {
//                            // Pack each chunk using the normal K900 protocol
//                            let packedData = packJson(chunkStr, wakeUp: wakeUp && index == 0) ?? Data() // Only wakeup on first chunk
//
//                            // Queue the chunk for sending
//                            queueSend(packedData, id: "chunk_\(index)_\(String(globalMessageId - 1))")
//
//                            // Add small delay between chunks to avoid overwhelming the connection
//                            if index < chunks.count - 1 {
//                                Thread.sleep(forTimeInterval: 0.05) // 50ms delay between chunks
//                            }
//                        }
//                    }
//
//                    CoreCommsService.log("All chunks queued for transmission")
//                } else {
                // Normal single message transmission
                CoreCommsService.log("Sending data to glasses: \(jsonString)")
                let packedData = packJson(jsonString, wakeUp: wakeUp) ?? Data()
                queueSend(packedData, id: String(globalMessageId - 1))
//                }
            }
        } catch {
            CoreCommsService.log("Error creating JSON: \(error)")
        }
    }

    // MARK: - Status Requests

    private func requestBatteryStatus() {
        let json: [String: Any] = [
            "C": "cs_batv",
            "V": 1,
            "B": "",
            "mId": globalMessageId,
        ]
        globalMessageId += 1

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: json)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                let packedData = packDataToK900(jsonData, cmdType: K900ProtocolUtils.CMD_TYPE_STRING) ?? Data()
                queueSend(packedData, id: String(globalMessageId - 1))
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

        guard let coreToken = UserDefaults.standard.string(forKey: "core_token"), !coreToken.isEmpty else {
            CoreCommsService.log("No coreToken available to send to ASG client")
            return
        }

        let json: [String: Any] = [
            "type": "auth_token",
            "coreToken": coreToken,
            "timestamp": Int64(Date().timeIntervalSince1970 * 1000),
        ]

        sendJson(json)
    }

    // MARK: - IMU Methods

    /**
     * Request a single IMU reading from the glasses
     * Power-optimized: sensors turn on briefly then off
     */
    @objc func requestImuSingle() {
        CoreCommsService.log("Requesting single IMU reading")
        let json: [String: Any] = ["type": "imu_single"]
        sendJson(json)
    }

    /**
     * Start IMU streaming from the glasses
     * @param rateHz Sampling rate in Hz (1-100)
     * @param batchMs Batching period in milliseconds (0-1000)
     */
    @objc func startImuStream(rateHz: Int, batchMs: Int) {
        CoreCommsService.log("Starting IMU stream: \(rateHz)Hz, batch: \(batchMs)ms")
        let json: [String: Any] = [
            "type": "imu_stream_start",
            "rate_hz": rateHz,
            "batch_ms": batchMs,
        ]
        sendJson(json)
    }

    /**
     * Stop IMU streaming from the glasses
     */
    @objc func stopImuStream() {
        CoreCommsService.log("Stopping IMU stream")
        let json: [String: Any] = ["type": "imu_stream_stop"]
        sendJson(json)
    }

    /**
     * Subscribe to gesture detection on the glasses
     * Power-optimized: uses accelerometer-only at low rate
     * @param gestures Array of gestures to detect ("head_up", "head_down", "nod_yes", "shake_no")
     */
    @objc func subscribeToImuGestures(_ gestures: [String]) {
        CoreCommsService.log("Subscribing to IMU gestures: \(gestures)")
        let json: [String: Any] = [
            "type": "imu_subscribe_gesture",
            "gestures": gestures,
        ]
        sendJson(json)
    }

    /**
     * Unsubscribe from all gesture detection
     */
    @objc func unsubscribeFromImuGestures() {
        CoreCommsService.log("Unsubscribing from IMU gestures")
        let json: [String: Any] = ["type": "imu_unsubscribe_gesture"]
        sendJson(json)
    }

    /**
     * Handle IMU response from glasses
     */
    private func handleImuResponse(_ json: [String: Any]) {
        guard let type = json["type"] as? String else {
            CoreCommsService.log("IMU response missing type")
            return
        }

        switch type {
        case "imu_response":
            // Single IMU reading
            handleSingleImuData(json)

        case "imu_stream_response":
            // Stream of IMU readings
            handleStreamImuData(json)

        case "imu_gesture_response":
            // Gesture detected
            handleImuGesture(json)

        case "imu_gesture_subscribed":
            // Gesture subscription confirmed
            if let gestures = json["gestures"] as? [String] {
                CoreCommsService.log("IMU gesture subscription confirmed: \(gestures)")
            }

        case "imu_ack":
            // Command acknowledgment
            if let message = json["message"] as? String {
                CoreCommsService.log("IMU command acknowledged: \(message)")
            }

        case "imu_error":
            // Error response
            if let error = json["error"] as? String {
                CoreCommsService.log("IMU error: \(error)")
            }

        default:
            CoreCommsService.log("Unknown IMU response type: \(type)")
        }
    }

    private func handleSingleImuData(_ json: [String: Any]) {
        guard let accel = json["accel"] as? [Double],
              let gyro = json["gyro"] as? [Double],
              let mag = json["mag"] as? [Double],
              let quat = json["quat"] as? [Double],
              let euler = json["euler"] as? [Double]
        else {
            CoreCommsService.log("Invalid IMU data format")
            return
        }

        CoreCommsService.log(String(format: "IMU Single Reading - Accel: [%.2f, %.2f, %.2f], Euler: [%.1f°, %.1f°, %.1f°]",
                                    accel[0], accel[1], accel[2],
                                    euler[0], euler[1], euler[2]))

        // Emit event for other components
        let eventBody: [String: Any] = [
            "imu_data": [
                "accel": accel,
                "gyro": gyro,
                "mag": mag,
                "quat": quat,
                "euler": euler,
                "timestamp": Date().timeIntervalSince1970 * 1000,
            ],
        ]
        emitEvent("ImuDataEvent", body: eventBody)
    }

    private func handleStreamImuData(_ json: [String: Any]) {
        guard let readings = json["readings"] as? [[String: Any]] else {
            CoreCommsService.log("Invalid IMU stream data format")
            return
        }

        for reading in readings {
            handleSingleImuData(reading)
        }
    }

    private func handleImuGesture(_ json: [String: Any]) {
        guard let gesture = json["gesture"] as? String else {
            CoreCommsService.log("Invalid IMU gesture format")
            return
        }

        let timestamp = json["timestamp"] as? Double ?? Date().timeIntervalSince1970 * 1000

        CoreCommsService.log("IMU Gesture detected: \(gesture)")

        // Emit event for other components
        let eventBody: [String: Any] = [
            "imu_gesture": [
                "gesture": gesture,
                "timestamp": timestamp,
            ],
        ]
        emitEvent("ImuGestureEvent", body: eventBody)
    }

    // MARK: - Update Methods

    private func updateBatteryStatus(level: Int, charging: Bool) {
        batteryLevel = level
        isCharging = charging
        // emitBatteryLevelEvent(level: level, charging: charging)
    }

    private func updateWifiStatus(connected: Bool, ssid: String, ip: String) {
        CoreCommsService.log("🌐 Updating WiFi status - connected: \(connected), ssid: \(ssid)")
        isWifiConnected = connected
        wifiSsid = ssid
        wifiLocalIp = ip
        emitWifiStatusChange()

        // Trigger immediate status update to match Android behavior
        aosManager?.triggerStatusUpdate()
    }

    private func updateHotspotStatus(enabled: Bool, ssid: String, password: String, ip: String) {
        CoreCommsService.log("🔥 Updating hotspot status - enabled: \(enabled), ssid: \(ssid)")
        isHotspotEnabled = enabled
        hotspotSsid = ssid
        hotspotPassword = password
        hotspotLocalIp = ip
        emitHotspotStatusChange()

        // Trigger immediate status update to match Android behavior
        aosManager?.triggerStatusUpdate()
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
        guard glassesReady, connectionState == .connected else {
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
            requestReadyK900()
        }

        readinessCheckDispatchTimer!.resume()
    }

    private func requestReadyK900() {
        let cmdObject: [String: Any] = [
            "C": "cs_hrt", // Video command
            "B": "", // Add the body
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: cmdObject)
            if let jsonStr = String(data: jsonData, encoding: .utf8) {
                CoreCommsService.log("Sending hrt command: \(jsonStr)")

                if let packedData = packDataToK900(jsonData, cmdType: K900ProtocolUtils.CMD_TYPE_STRING) {
                    queueSend(packedData, id: String(globalMessageId))
                    globalMessageId += 1
                }
            }
        } catch {
            CoreCommsService.log("Error creating video command: \(error)")
        }
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

            if self.isConnecting, self.connectionState != .connected {
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
        pendingMessageTimer?.invalidate()
        pendingMessageTimer = nil
    }

    // MARK: - Event Emission

    private func emitDiscoveredDevice(_ name: String) {
        let eventBody: [String: Any] = [
            "compatible_glasses_search_result": [
                "model_name": "Mentra Live",
                "device_name": name,
            ],
        ]

        emitEvent("CoreMessageEvent", body: eventBody)
    }

    private func emitStopScanEvent() {
        let eventBody: [String: Any] = [
            "type": "glasses_bluetooth_search_stop",
            "device_model": "Mentra Live",
        ]

        // emitEvent("GlassesBluetoothSearchStopEvent", body: eventBody)
    }

    // private func emitBatteryLevelEvent(level: Int, charging: Bool) {
    //   let eventBody: [String: Any] = [
    //     "battery_level": level,
    //     "is_charging": charging
    //   ]

    //   emitEvent("BatteryLevelEvent", body: eventBody)
    // }

    private func emitWifiStatusChange() {
        let eventBody = ["glasses_wifi_status_change": [
            "connected": isWifiConnected,
            "ssid": wifiSsid,
            "local_ip": wifiLocalIp,
        ]]
        emitEvent("CoreMessageEvent", body: eventBody)
    }

    private func emitHotspotStatusChange() {
        let eventBody = ["glasses_hotspot_status_change": [
            "enabled": isHotspotEnabled,
            "ssid": hotspotSsid,
            "password": hotspotPassword,
            "local_ip": hotspotLocalIp,
        ]]
        emitEvent("CoreMessageEvent", body: eventBody)
    }

    private func emitWifiScanResult(_ networks: [String]) {
        let eventBody = ["wifi_scan_results": networks]
        emitEvent("CoreMessageEvent", body: eventBody)
    }

    private func emitWifiScanResultEnhanced(_ enhancedNetworks: [[String: Any]], legacyNetworks: [String]) {
        let eventBody: [String: Any] = [
            "wifi_scan_results": legacyNetworks, // Backwards compatibility
            "wifi_scan_results_enhanced": enhancedNetworks, // Enhanced format with security info
        ]
        emitEvent("CoreMessageEvent", body: eventBody)
    }

    private func emitRtmpStreamStatus(_ json: [String: Any]) {
        emitEvent("RtmpStreamStatusEvent", body: json)
    }

    private func emitButtonPress(buttonId: String, pressType: String, timestamp: Int64) {
        let eventBody: [String: Any] = [
            "device_model": "Mentra Live",
            "button_id": buttonId,
            "press_type": pressType,
            "timestamp": timestamp,
        ]

        // emitEvent("CoreMessageEvent", body: eventBody)
    }

    private func emitVersionInfo(appVersion: String, buildNumber: String, deviceModel: String, androidVersion: String, otaVersionUrl: String) {
        let eventBody: [String: Any] = [
            "app_version": appVersion,
            "build_number": buildNumber,
            "device_model": deviceModel,
            "android_version": androidVersion,
            "ota_version_url": otaVersionUrl,
        ]

        emitEvent("CoreMessageEvent", body: eventBody)
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
                if eventName == "GlassesWifiScanResults" {
                    CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
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

extension MentraLiveManager {
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
        result.append(contentsOf: K900ProtocolUtils.CMD_START_CODE)

        // Command type
        result.append(cmdType)

        // Length (2 bytes, big-endian)
        result.append(UInt8((dataLength >> 8) & 0xFF)) // MSB first
        result.append(UInt8(dataLength & 0xFF)) // LSB second

        // Copy the data
        result.append(data)

        // End code $$
        result.append(contentsOf: K900ProtocolUtils.CMD_END_CODE)

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
        result.append(contentsOf: K900ProtocolUtils.CMD_START_CODE)

        // Command type
        result.append(cmdType)

        // Length (2 bytes, little-endian for phone-to-device)
        result.append(UInt8(dataLength & 0xFF)) // LSB first
        result.append(UInt8((dataLength >> 8) & 0xFF)) // MSB second

        // Copy the data
        result.append(data)

        // End code $$
        result.append(contentsOf: K900ProtocolUtils.CMD_END_CODE)

        return result
    }

    /**
     * Pack a JSON string for phone-to-K900 device communication
     * 1. Wrap with C-field: {"C": jsonData}
     * 2. Then pack with BES2700 protocol using little-endian: ## + type + length + {"C": jsonData} + $$
     */
    private func packJson(_ jsonData: String?, wakeUp: Bool = false) -> Data? {
        guard let jsonData = jsonData else { return nil }

        do {
            // First wrap with C-field
            var wrapper: [String: Any] = [K900ProtocolUtils.FIELD_C: jsonData]
            if wakeUp {
                wrapper["W"] = 1 // Add W field as seen in MentraLiveSGC (optional)
            }

            // Convert to string
            let jsonData = try JSONSerialization.data(withJSONObject: wrapper)
            guard let wrappedJson = String(data: jsonData, encoding: .utf8) else { return nil }

            // Then pack with BES2700 protocol format using little-endian
            let jsonBytes = wrappedJson.data(using: .utf8)!
            return packDataToK900(jsonBytes, cmdType: K900ProtocolUtils.CMD_TYPE_STRING)

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
            let wrapper: [String: Any] = [K900ProtocolUtils.FIELD_C: content]
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
        return bytes[0] == K900ProtocolUtils.CMD_START_CODE[0] && bytes[1] == K900ProtocolUtils.CMD_START_CODE[1]
    }

    /**
     * Check if a JSON string is already properly formatted for K900 protocol
     */
    private func isCWrappedJson(_ jsonStr: String) -> Bool {
        do {
            guard let data = jsonStr.data(using: .utf8) else { return false }
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

            // Check for simple C-wrapping {"C": "content"} - only one field
            if let json = json, json.keys.contains(K900ProtocolUtils.FIELD_C) && json.count == 1 {
                return true
            }

            // Check for full K900 format {"C": "command", "V": val, "B": body}
            if let json = json,
               json.keys.contains(K900ProtocolUtils.FIELD_C) &&
               json.keys.contains(K900ProtocolUtils.FIELD_V) &&
               json.keys.contains(K900ProtocolUtils.FIELD_B)
            {
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
              protocolData.count >= 7
        else {
            return nil
        }

        let bytes = [UInt8](protocolData)

        // Extract length (little-endian for device-to-phone)
        let length = Int(bytes[3]) | (Int(bytes[4]) << 8)

        if length + 7 > protocolData.count {
            return nil // Invalid length
        }

        // Extract payload
        let payload = protocolData.subdata(in: 5 ..< (5 + length))
        return payload
    }

    // MARK: - Button Mode Settings

    func sendButtonModeSetting(_ mode: String) {
        CoreCommsService.log("Sending button mode setting to glasses: \(mode)")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot send button mode - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "button_mode_setting",
            "mode": mode,
        ]
        sendJson(json)
    }

    // MARK: - Buffer Recording Methods

    func startBufferRecording() {
        CoreCommsService.log("Starting buffer recording on glasses")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot start buffer recording - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "start_buffer_recording",
        ]
        sendJson(json)
    }

    func stopBufferRecording() {
        CoreCommsService.log("Stopping buffer recording on glasses")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot stop buffer recording - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "stop_buffer_recording",
        ]
        sendJson(json)
    }

    func saveBufferVideo(requestId: String, durationSeconds: Int) {
        CoreCommsService.log("Saving buffer video: requestId=\(requestId), duration=\(durationSeconds)s")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot save buffer video - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "save_buffer_video",
            "request_id": requestId,
            "duration_seconds": durationSeconds,
        ]
        sendJson(json)
    }

    private func sendUserSettings() {
        CoreCommsService.log("Sending user settings to glasses")

        // Send button mode setting
        let buttonMode = UserDefaults.standard.string(forKey: "button_press_mode") ?? "photo"
        sendButtonModeSetting(buttonMode)

        // Send button video recording settings
        sendButtonVideoRecordingSettings()

        // Send button photo settings
        sendButtonPhotoSettings()

        // Send button camera LED setting
        sendButtonCameraLedSetting()
    }

    func sendButtonVideoRecordingSettings() {
        let width = UserDefaults.standard.integer(forKey: "button_video_width")
        let height = UserDefaults.standard.integer(forKey: "button_video_height")
        let fps = UserDefaults.standard.integer(forKey: "button_video_fps")

        // Use defaults if not set
        let finalWidth = width > 0 ? width : 1280
        let finalHeight = height > 0 ? height : 720
        let finalFps = fps > 0 ? fps : 30

        CoreCommsService.log("Sending button video recording settings: \(finalWidth)x\(finalHeight)@\(finalFps)fps")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot send button video recording settings - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "button_video_recording_setting",
            "settings": [
                "width": finalWidth,
                "height": finalHeight,
                "fps": finalFps,
            ],
        ]
        sendJson(json)
    }

    func sendButtonPhotoSettings() {
        let size = UserDefaults.standard.string(forKey: "button_photo_size") ?? "medium"

        CoreCommsService.log("Sending button photo setting: \(size)")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot send button photo settings - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "button_photo_setting",
            "size": size,
        ]
        sendJson(json)
    }

    func sendButtonCameraLedSetting() {
        let enabled = UserDefaults.standard.bool(forKey: "button_camera_led")

        CoreCommsService.log("Sending button camera LED setting: \(enabled)")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot send button camera LED setting - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "button_camera_led",
            "enabled": enabled,
        ]
        sendJson(json)
    }

    func startVideoRecording(requestId: String, save: Bool) {
        startVideoRecording(requestId: requestId, save: save, width: 0, height: 0, fps: 0)
    }

    func startVideoRecording(requestId: String, save: Bool, width: Int, height: Int, fps: Int) {
        CoreCommsService.log("Starting video recording on glasses: requestId=\(requestId), save=\(save), resolution=\(width)x\(height)@\(fps)fps")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot start video recording - not connected")
            return
        }

        var json: [String: Any] = [
            "type": "start_video_recording",
            "request_id": requestId,
            "save": save,
        ]

        // Add video settings if provided
        if width > 0, height > 0 {
            json["settings"] = [
                "width": width,
                "height": height,
                "fps": fps > 0 ? fps : 30,
            ]
        }
        sendJson(json)
    }

    func stopVideoRecording(requestId: String) {
        CoreCommsService.log("Stopping video recording on glasses: requestId=\(requestId)")

        guard connectionState == .connected else {
            CoreCommsService.log("Cannot stop video recording - not connected")
            return
        }

        let json: [String: Any] = [
            "type": "stop_video_recording",
            "request_id": requestId,
        ]
        sendJson(json)
    }
}
