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
  
  var CONNECTING_DEVICE = ""
  var onConnectionStateChanged: (() -> Void)?
  @Published public var batteryLevel: Int = -1
  @Published public var isConnected: Bool = false
  @Published public var ready: Bool = false {
    didSet {
      if oldValue != ready {
        CoreCommsService.log("MACH1: connection_state_changed: \(ready)")
        onConnectionStateChanged?()
      }
    }
  }
  
  // Store discovered peripherals by their identifier
  private var discoveredPeripherals: [String: CBPeripheral] = [:]
  
  
  private var textHandle: Int?
  private var tapTextHandle: Int?
  private var autoScroller: ScrollLayout.AutoScroller?
  private var currentLayout: Ultralite.Layout?
  private var isConnectedListener: BondListener<Bool>?
  private var batteryLevelListener: BondListener<Int>?
  private var setupDone: Bool = false
  @Published public var isHeadUp = false
  
  
  private func verifyBonding() {
      guard let device = UltraliteManager.shared.currentDevice else {
          ready = false
          return
      }
      
      // Try to request control - this will fail if not bonded
      let gotControl = device.requestControl(
          layout: UltraliteSDK.Ultralite.Layout.textBottomLeftAlign,
          timeout: 0,
          hideStatusBar: true,
          showTapAnimation: true,
          maxNumTaps: 3
      )
      
      CoreCommsService.log("MACH1: gotControl: \(gotControl ?? false)")
      
      if gotControl == true {
          ready = true
          batteryLevel = device.batteryLevel.value ?? -1
          CoreCommsService.log("MACH1: Device is bonded and ready")
      } else {
          ready = false
          CoreCommsService.log("MACH1: Device connected but not bonded")
      }
  }
  
  
  func setup() {
    if setupDone { return }
    isConnectedListener = BondListener(listener: { [weak self] value in
      guard let self = self else { return }
      CoreCommsService.log("MACH1: isConnectedListener: \(value)")
      
      if value {
        verifyBonding()
      }
    })
    
    batteryLevelListener = BondListener(listener: { [weak self] value in
      guard let self = self else { return }
      CoreCommsService.log("MACH1: batteryLevelListener: \(value)")
      batteryLevel = value
    })
    
    
    
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleTapEvent(_:)),
      name: .tap,
      object: nil
    )
    
    
    CoreCommsService.log("MACH1: setup done")
    self.setupDone = true
  }
  
  // Handle the tap event
  @objc func handleTapEvent(_ notification: Notification) {
    
    guard let userInfo = notification.userInfo else {
      CoreCommsService.log("MACH1: handleTapEvent: no userInfo")
      return
    }
    
    guard let tap = userInfo["tap"] else {
      CoreCommsService.log("MACH1: handleTapEvent: no tap")
      return
    }
    
    let hack = "\(tap)"
    // get the number between the parentheses Optional(3)
    let tapNumber = hack.split(separator: "(").last?.split(separator: ")").first
    let tapNumberInt: Int = Int(tapNumber ?? "0") ?? -1
    
    switch tapNumberInt {
    case 2:
      isHeadUp = !isHeadUp
    case 3:
      isHeadUp = !isHeadUp
    default:
      CoreCommsService.log("MACH1: Tap count \(tapNumberInt)")
    }
    
  }
  
  func linked(unk: UltraliteSDK.Ultralite?) {
    CoreCommsService.log("Mach1Manager: Linked")
    UltraliteManager.shared.currentDevice?.isConnected.bind(listener: isConnectedListener!)
    UltraliteManager.shared.currentDevice?.batteryLevel.bind(listener: batteryLevelListener!)
  }
  
  public func connectById(_ id: String) {
    setup()
    let isLinked = UltraliteManager.shared.isLinked.value
    let currentDevice = UltraliteManager.shared.currentDevice
    let isConnected = isLinked && currentDevice != nil && currentDevice!.isPaired && currentDevice!.isConnected.value
    let peripheral = discoveredPeripherals[id] ?? currentDevice?.peripheral
    
    
    let gotControl = currentDevice?.requestControl(layout: UltraliteSDK.Ultralite.Layout.textBottomLeftAlign, timeout: 0, hideStatusBar: true, showTapAnimation: true, maxNumTaps: 3)
    
    CoreCommsService.log("MACH1: gotControl: \(gotControl ?? false)")
    CoreCommsService.log("MACH1: control is nil \(gotControl == nil)")
    
    UltraliteManager.shared.currentDevice?.isConnected.bind(listener: isConnectedListener!)
    UltraliteManager.shared.currentDevice?.batteryLevel.bind(listener: batteryLevelListener!)
    
    if isConnected {
      ready = true
      return
    }
    
    if !isLinked {
      if peripheral == nil {
        CoreCommsService.log("Mach1Manager: No peripheral found or stored with ID: \(id)")
        CONNECTING_DEVICE = id
        UltraliteManager.shared.startScan(callback: foundDevice2)
        return
      }
      CoreCommsService.log("Mach1Manager: Connecting to peripheral with ID: \(id)")
      UltraliteManager.shared.link(device: peripheral!, callback: linked)
      UltraliteManager.shared.currentDevice?.isConnected.bind(listener: isConnectedListener!)
      UltraliteManager.shared.currentDevice?.batteryLevel.bind(listener: batteryLevelListener!)
      return
    }
  }
  
  func clearDisplay() {
    guard let device = UltraliteManager.shared.currentDevice else {
      CoreCommsService.log("Mach1Manager: No current device")
      ready = false
      return
    }
    
    if !device.isConnected.value {
      CoreCommsService.log("Mach1Manager: Device not connected")
      ready = false
      return
    }
    
    device.screenOff()
  }
  
  func disconnect() {
    UltraliteManager.shared.stopScan()
    ready = false
  }
  
  func sendTextWall(_ text: String) {
    //    displayTextWall(text)
    guard let device = UltraliteManager.shared.currentDevice else {
      CoreCommsService.log("Mach1Manager: No current device")
      ready = false
      return
    }
    
    if !device.isConnected.value {
      CoreCommsService.log("Mach1Manager: Device not connected")
      ready = false
      return
    }
    
    CoreCommsService.log("MACH1: Sending text: \(text)")
    
    device.sendText(text: text)
    device.canvas.commit()
  }
  
  func sendDoubleTextWall(_ topText: String, _ bottomText: String) {
    guard let device = UltraliteManager.shared.currentDevice else {
      CoreCommsService.log("Mach1Manager: No current device")
      ready = false
      return
    }
    
    if !device.isConnected.value {
      CoreCommsService.log("Mach1Manager: Device not connected")
      ready = false
      return
    }
    
    CoreCommsService.log("MACH1: Sending double text wall - top: \(topText), bottom: \(bottomText)")
    
    // Clean the text (remove any special characters if needed)
    let cleanedTopText = topText
    let cleanedBottomText = bottomText
    
    // Count newlines in top text
    let newlineCount = cleanedTopText.filter { $0 == "\n" }.count
    
    // Calculate rows to add between top and bottom (3 minus existing newlines)
    let rowsTop = 3 - newlineCount
    
    // Build combined text
    var combinedText = cleanedTopText
    
    // Add empty lines between top and bottom
    for _ in 0..<rowsTop {
      combinedText += "\n"
    }
    
    // Add bottom text
    combinedText += cleanedBottomText
    
    // Send the combined text
    device.sendText(text: combinedText)
    device.canvas.commit()
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
    
    let id = String(deviceName)
    
    // Store the peripheral by its identifier
    discoveredPeripherals[id] = device
    emitDiscoveredDevice(id)
  }
  
  func foundDevice2(_ device: CBPeripheral) {
    guard let name = device.name else { return }
    
    // just get the part inside the brackets
    let deviceName = name.split(separator: "[").last?.split(separator: "]").first
    
    guard let deviceName = deviceName else { return }
    
    let id = String(deviceName)
    
    discoveredPeripherals[id] = device
    
    if id == CONNECTING_DEVICE {
      self.connectById(id)
    }
  }
  
  func findCompatibleDevices() {
    setup()
    CoreCommsService.log("@@@@@@@@@@@@@@@@@@@@@ FINDING COMPATIBLE DEVICES @@@@@@@@@@@@@@@@@@@@@@")
    UltraliteManager.shared.setBluetoothManger()
    let scanResult = UltraliteManager.shared.startScan(callback: foundDevice)
    CoreCommsService.log("Mach1: \(scanResult)")
    if scanResult == UltraliteSDK.UltraliteManager.BluetoothScanResult.BLUETOOTH_PERMISSION_NEEDED {
      // call this function again in 5 seconds:
      DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
        self.findCompatibleDevices()
      }
    }
  }
  
  public func displayBitmap(base64ImageData: String) async -> Bool {
    guard let bmpData = Data(base64Encoded: base64ImageData) else {
      CoreCommsService.log("MACH1: Failed to decode base64 image data")
      return false
    }
    
    CoreCommsService.log("MACH1: ✅ Successfully decoded base64 image data to \(bmpData.count) bytes")
    
    // Convert data to UIImage
    guard let uiImage = UIImage(data: bmpData) else {
      CoreCommsService.log("MACH1: Failed to create UIImage from data")
      return false
    }
    
    // Resize the image to 620x460
    let targetSize = CGSize(width: 620, height: 460)
    UIGraphicsBeginImageContextWithOptions(targetSize, false, 0.0)
    uiImage.draw(in: CGRect(origin: .zero, size: targetSize))
    let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    
    guard let resizedImage = resizedImage,
          let cgImage = resizedImage.cgImage else {
      CoreCommsService.log("MACH1: Failed to resize image or get CGImage")
      return false
    }
    
    guard let device = UltraliteManager.shared.currentDevice else {
      CoreCommsService.log("MACH1: No current device")
      AOSManager.getInstance().forgetSmartGlasses()
      return false
    }
    
    if !device.isConnected.value {
      CoreCommsService.log("MACH1: Device not connected")
      return false
    }
    
    CoreCommsService.log("MACH1: Sending bitmap")
    
    // Draw the background image at position (50, 80)
    //      device.canvas.drawBackground(image: cgImage, x: 50, y: 80)
    device.canvas.drawBackground(image: cgImage, x: 50, y: 80)
    device.canvas.commit()
    
    return true
  }
  
  func forget() {
    UltraliteManager.shared.unlink()
  }
  
  override func viewDidLoad() {
    super.viewDidLoad()
    //    if let device = UltraliteManager.shared.currentDevice, device.isConnected.value == true {
    //      // we have a device and are connected
    //      draw()
    //    }
    //    else if UltraliteManager.shared.currentDevice != nil {
    //      //      // we have a device but it isn't connected
    //      //            isConnectedListener = BondListener(listener: { [weak self] value in
    //      //              if value {
    //      //                draw()
    //      //              }
    //      //            })
    //      //            UltraliteManager.shared.currentDevice?.isConnected.bind(listener: isConnectedListener!)
    //    }
  }
  
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    
    //    if UltraliteManager.shared.currentDevice == nil {
    //      // we have no device, show show the user the picker
    //      showPairingPicker()
    //    }
  }
  
  func draw() {
    //    guard let device = UltraliteManager.shared.currentDevice else {
    //      return
    //    }
    //
    //    // start control
    //    layout = .canvas
    //    startControl()
    //
    //    if let image = UIImage(systemName: "face.smiling")?.cgImage {
    //      // draw something to the screen
    //      device.canvas.drawBackground(image: image, x: 100, y: 100)
    //      // don't forget to commit, this is a common mistake.
    //      device.canvas.commit()
    //    }
    
  }
  
  override func onTapEvent(taps: Int) {
    CoreCommsService.log("MACH1: Tap Event: \(taps)")
    //    draw()
  }
  
}
