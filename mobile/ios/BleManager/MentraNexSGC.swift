//
//  MentraNexSGC.swift
//  MentraOS_Manager
//
//  Created by Gemini on 2024-07-29.
//

import CoreBluetooth
import Foundation
import SwiftProtobuf

// Helper extension for debugging
extension Data {
    func hexEncodedString() -> String {
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

    static let shared = MentraNexSGC()

    // UUIDs from MentraNexSGC.java
    private let MAIN_SERVICE_UUID = CBUUID(string: "00004860-0000-1000-8000-00805f9b34fb")
    private let WRITE_CHAR_UUID = CBUUID(string: "000071FF-0000-1000-8000-00805f9b34fb")
    private let NOTIFY_CHAR_UUID = CBUUID(string: "000070FF-0000-1000-8000-00805f9b34fb")

    private var deviceSearchName = "Mentra" // Generic name, can be adjusted.

    // MARK: - Initialization

    override private init() {
        super.init()
        // Using a background queue for bluetooth operations
        let queue = DispatchQueue(label: "com.mentra.nex.ble", qos: .background)
        centralManager = CBCentralManager(delegate: self, queue: queue)
        CoreCommsService.log("NEX: MentraNexSGC initialized.")
    }

    // MARK: - Public Methods

    @objc func startScan() {
        guard centralManager?.state == .poweredOn else {
            CoreCommsService.log("NEX: Cannot scan, Bluetooth is not powered on.")
            return
        }
        CoreCommsService.log("NEX: Starting scan for peripherals with service UUID: \(MAIN_SERVICE_UUID.uuidString)")
        centralManager?.scanForPeripherals(withServices: [MAIN_SERVICE_UUID], options: nil)
    }

    @objc func stopScan() {
        centralManager?.stopScan()
        CoreCommsService.log("NEX: Stopped scanning.")
    }

    @objc func sendText(_ text: String) {
        guard let peripheral = peripheral, let writeCharacteristic = writeCharacteristic else {
            CoreCommsService.log("NEX: Not ready to send text. Peripheral or characteristic is nil.")
            return
        }

        CoreCommsService.log("NEX: Sending text: '\(text)'")

        // 1. Create the DisplayText message
        var displayText = MentraosBle_DisplayText()
        displayText.text = text
        displayText.size = 20
        displayText.x = 20
        displayText.y = 260
        displayText.fontCode = 20
        displayText.color = 10000

        // 2. Create the top-level PhoneToGlasses message
        var phoneToGlasses = MentraosBle_PhoneToGlasses()
        phoneToGlasses.displayText = displayText

        do {
            // 3. Serialize the message to binary data
            let protobufData = try phoneToGlasses.serializedData()

            // 4. Prepend the packet type (0x02 for protobuf)
            var packet = Data([0x02])
            packet.append(protobufData)

            CoreCommsService.log("NEX: Sending protobuf packet (\(packet.count) bytes): \(packet.hexEncodedString())")
            peripheral.writeValue(packet, for: writeCharacteristic, type: .withResponse)
        } catch {
            CoreCommsService.log("NEX: Error serializing protobuf message: \(error)")
        }
    }

    @objc func disconnect() {
        if let peripheral = peripheral {
            centralManager?.cancelPeripheralConnection(peripheral)
        }
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            CoreCommsService.log("NEX: Bluetooth is On.")
        // You can optionally start a scan automatically upon power on.
        // startScan()
        case .poweredOff:
            CoreCommsService.log("NEX: Bluetooth is Off.")
        case .resetting:
            CoreCommsService.log("NEX: Bluetooth is resetting.")
        case .unauthorized:
            CoreCommsService.log("NEX: Bluetooth is unauthorized.")
        case .unsupported:
            CoreCommsService.log("NEX: Bluetooth is unsupported.")
        case .unknown:
            CoreCommsService.log("NEX: Bluetooth state is unknown.")
        @unknown default:
            CoreCommsService.log("NEX: A new Bluetooth state was introduced.")
        }
    }

    func centralManager(_: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData _: [String: Any], rssi RSSI: NSNumber) {
        CoreCommsService.log("NEX: Discovered peripheral: \(peripheral.name ?? "Unknown") RSSI: \(RSSI)")

        // For now, we connect to the first peripheral that advertises the main service.
        // A more robust implementation might filter by name or other advertisement data.
        self.peripheral = peripheral
        centralManager?.stopScan()
        CoreCommsService.log("NEX: Stopping scan and attempting to connect to \(peripheral.name ?? "Unknown").")
        centralManager?.connect(peripheral, options: nil)
    }

    func centralManager(_: CBCentralManager, didConnect peripheral: CBPeripheral) {
        CoreCommsService.log("NEX: Successfully connected to \(peripheral.name ?? "unknown device").")
        peripheral.delegate = self
        CoreCommsService.log("NEX: Discovering services...")
        peripheral.discoverServices([MAIN_SERVICE_UUID])
    }

    func centralManager(_: CBCentralManager, didFailToConnect _: CBPeripheral, error: Error?) {
        CoreCommsService.log("NEX: Failed to connect to peripheral. Error: \(error?.localizedDescription ?? "unknown")")
    }

    func centralManager(_: CBCentralManager, didDisconnectPeripheral _: CBPeripheral, error _: Error?) {
        CoreCommsService.log("NEX: Disconnected from peripheral.")
        peripheral = nil
        writeCharacteristic = nil
        notifyCharacteristic = nil
        // Here you might want to implement reconnection logic.
    }

    // MARK: - CBPeripheralDelegate

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            CoreCommsService.log("NEX: Error discovering services: \(error.localizedDescription)")
            return
        }

        guard let services = peripheral.services else { return }
        for service in services {
            if service.uuid == MAIN_SERVICE_UUID {
                CoreCommsService.log("NEX: Found main service. Discovering characteristics...")
                peripheral.discoverCharacteristics([WRITE_CHAR_UUID, NOTIFY_CHAR_UUID], for: service)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            CoreCommsService.log("NEX: Error discovering characteristics: \(error.localizedDescription)")
            return
        }

        guard let characteristics = service.characteristics else { return }
        for characteristic in characteristics {
            if characteristic.uuid == WRITE_CHAR_UUID {
                CoreCommsService.log("NEX: Found write characteristic.")
                writeCharacteristic = characteristic
            } else if characteristic.uuid == NOTIFY_CHAR_UUID {
                CoreCommsService.log("NEX: Found notify characteristic. Subscribing for notifications.")
                notifyCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }
    }

    func peripheral(_: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            CoreCommsService.log("NEX: Error on updating value: \(error.localizedDescription)")
            return
        }

        guard let data = characteristic.value else { return }
        CoreCommsService.log("NEX: Received data (\(data.count) bytes): \(data.hexEncodedString())")
        // Here you would decode the incoming protobuf data.
    }

    func peripheral(_: CBPeripheral, didWriteValueFor _: CBCharacteristic, error: Error?) {
        if let error = error {
            CoreCommsService.log("NEX: Error writing value: \(error.localizedDescription)")
            return
        }
        CoreCommsService.log("NEX: Successfully wrote value.")
    }

    func peripheral(_: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            CoreCommsService.log("NEX: Error changing notification state: \(error.localizedDescription)")
            return
        }

        if characteristic.isNotifying {
            CoreCommsService.log("NEX: Successfully subscribed to notifications for characteristic \(characteristic.uuid.uuidString).")
        } else {
            CoreCommsService.log("NEX: Unsubscribed from notifications for characteristic \(characteristic.uuid.uuidString).")
        }
    }
}
