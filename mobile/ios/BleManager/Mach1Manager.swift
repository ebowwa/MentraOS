//
//  Mach1Manager.swift
//  MentraOS_Manager
//
//  Created by Mach1 Device Integration
//

import Foundation
import Combine
import UIKit
import React
import UltraliteSDK
import CoreBluetooth



class Mach1Manager: UltraliteBaseViewController {
  
  
  var onConnectionStateChanged: (() -> Void)?
  @Published public var batteryLevel: Int = -1
  @Published public var isConnected: Bool = false
  @Published public var ready: Bool = false {
    didSet {
      if oldValue != ready {
        //          onConnectionStateChanged?()
      }
    }
  }
  
  // Store discovered peripherals by their identifier
  private var discoveredPeripherals: [String: CBPeripheral] = [:]
  
  
  func linked(unk: UltraliteSDK.Ultralite?) {
    CoreCommsService.log("Mach1Manager: Connected")
    isConnected = true
    ready = true
    
  }
  
  public func connectById(_ id: String) {
    guard let peripheral = discoveredPeripherals[id] else {
      CoreCommsService.log("Mach1Manager: No peripheral found with ID: \(id)")
      return
    }
    
    CoreCommsService.log("Mach1Manager: Connecting to peripheral with ID: \(id)")
    UltraliteManager.shared.link(device: peripheral, callback: linked)
  }
  
  func RN_clearDisplay() {
    //    clearDisplay()
  }
  
  func disconnect() {
    UltraliteManager.shared.unlink()
  }
  
  func RN_sendTextWall(_ text: String) {
    //    displayTextWall(text)
  }
  
  func RN_sendDoubleTextWall(_ topText: String, _ bottomText: String) {
    //    displayDoubleTextWall(topText: topText, bottomText: bottomText)
  }
  
  
  public func emitDiscoveredDevice(_ name: String) {
    let res: [String: Any] = [
      "model_name": "Mentra Mach1",
      "device_name": "\(name)",
    ]
    let eventBody: [String: Any] = [
      "compatible_glasses_search_result": res,
    ]
    
    // must convert to string before sending:
    do {
      let jsonData = try JSONSerialization.data(withJSONObject: eventBody, options: [])
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        CoreCommsService.emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString)
      }
    } catch {
      CoreCommsService.log("Error converting to JSON: \(error)")
    }
  }
  
  func foundDevice(_ device: CBPeripheral) {
    // log the found devices:
    CoreCommsService.log(device.name ?? "Unknown Device")

    guard let name = device.name else { return }

    // just get the part inside the brackets
    let deviceName = name.split(separator: "[").last?.split(separator: "]").first

    guard let deviceName = deviceName else { return }
    
    // Store the peripheral by its identifier
    discoveredPeripherals[String(deviceName)] = device

    emitDiscoveredDevice(String(deviceName))
    
  }
  
  func findCompatibleDevices() {
    
    CoreCommsService.log("@@@@@@@@@@@@@@@@@@@@@ FINDING COMPATIBLE DEVICES @@@@@@@@@@@@@@@@@@@@@@")
    UltraliteManager.shared.setBluetoothManger()
    let scanResult = UltraliteManager.shared.startScan(callback: foundDevice)
    CoreCommsService.log("Mach1: \(scanResult)")
    
    //    showPairingPicker()
  }
  
  
  
  
  private var isConnectedListener: BondListener<Bool>?
  
  override func viewDidLoad() {
    super.viewDidLoad()
    
    if let device = UltraliteManager.shared.currentDevice, device.isConnected.value == true {
      // we have a device and are connected
      draw()
    }
    else if UltraliteManager.shared.currentDevice != nil {
      //      // we have a device but it isn't connected
      //      isConnectedListener = BondListener(listener: { [weak self] value in
      //        if value {
      //          draw()
      //        }
      //      })
      //      UltraliteManager.shared.currentDevice?.isConnected.bind(listener: isConnectedListener!)
    }
  }
  
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    
    if UltraliteManager.shared.currentDevice == nil {
      // we have no device, show show the user the picker
      showPairingPicker()
    }
  }
  
  func draw() {
    guard let device = UltraliteManager.shared.currentDevice else {
      return
    }
    
    // start control
    layout = .canvas
    startControl()
    
    if let image = UIImage(systemName: "face.smiling")?.cgImage {
      // draw something to the screen
      device.canvas.drawBackground(image: image, x: 100, y: 100)
      // don't forget to commit, this is a common mistake.
      device.canvas.commit()
    }
    
  }
  
}
