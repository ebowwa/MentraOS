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

//// MARK: - Mach1Manager Class
//class Mach1Manager: UltraliteBaseViewController {
//
//  // MARK: - Constants
//  private let TAP_DEBOUNCE_TIME: TimeInterval = 0.08 // 80ms
//  private let CARD_LINGER_TIME = 15
//  private let DISPLAY_TIMEOUT = 60 // seconds
//
//
//  // MARK: - Font Sizes
//  enum FontSize: Int {
//    case small = 24
//    case medium = 29
//    case large = 40
//
//    var maxLines: Int {
//      switch self {
//      case .small: return 14
//      case .medium: return 12
//      case .large: return 7
//      }
//    }
//
//    var maxCharsPerLine: Int {
//      switch self {
//      case .small: return 42
//      case .medium: return 38
//      case .large: return 28
//      }
//    }
//  }
//
//  // MARK: - Properties
//
//  // Connection callback
//  var onConnectionStateChanged: (() -> Void)?
//
//  // Published properties for reactive updates
//  @Published public var batteryLevel: Int = -1
//  @Published public var isConnected: Bool = false
//  @Published public var ready: Bool = false {
//    didSet {
//      if oldValue != ready {
//        onConnectionStateChanged?()
//      }
//    }
//  }
//
//  // Ultralite device management
//  private var currentDevice: Ultralite?
//  private var isConnectedListener: BondListener<Bool>?
//  private var batteryListener: BondListener<Int>?
//
//  // Display state
//  private var currentLayout: Ultralite.Layout = .canvas
//  private var screenToggleOff: Bool = false
//  private var screenIsClear: Bool = true
//  private var currentFontSize: FontSize = .medium
//
//  // Canvas handles
//  private var textHandles: [Int] = []
//  private var animationHandle: Int?
//
//  // Event handling
//  private var lastTapTime: TimeInterval = 0
//  private var totalDashboardToggleCount: Int = 0
//  private var tapObserver: Any?
//
//  // Handlers
//  private var goHomeHandler: DispatchWorkItem?
//  private var screenOffHandler: DispatchWorkItem?
//
//  // Display configuration
//  private let leftSidePixelBuffer = 40
//
//  init() {
//    super.init(coder: coder)
//    UltraliteBaseViewController.showPairingPicker(self)
//  }
//
//  deinit {
//    disconnect()
//    if let tapObserver = tapObserver {
//      NotificationCenter.default.removeObserver(tapObserver)
//    }
//  }
//
//  // MARK: - View Lifecycle
//
//  override func viewDidLoad() {
//    super.viewDidLoad()
//
//    // Configure display settings
//    displayTimeout = DISPLAY_TIMEOUT
//    maximumNumTaps = maximumNumTaps
//
//    setupUltralite()
//
//    // Check if we already have a connected device
//    if let device = UltraliteManager.shared.currentDevice, device.isConnected.value == true {
//      currentDevice = device
//      device.isConnected.bind(listener: isConnectedListener!)
//      ready = true
//      isConnected = true
//    } else if let device = UltraliteManager.shared.currentDevice {
//      // We have a device but it isn't connected
//      currentDevice = device
//      isConnectedListener = BondListener(listener: { [weak self] value in
//        self?.isConnected = value
//        self?.ready = value
//        if value {
//          self?.onConnectionStateChanged?()
//        }
//      })
//      device.isConnected.bind(listener: isConnectedListener!)
//    }
//  }
//
//  override func viewDidAppear(_ animated: Bool) {
//    super.viewDidAppear(animated)
//
//    if UltraliteManager.shared.currentDevice == nil {
//      // No device paired, could show pairing picker if in a view controller context
//      CoreCommsService.log("No Ultralite device paired")
//    }
//  }
//
//  // MARK: - Ultralite Setup
//
//  private func setupUltralite() {
//    // Override tap handling from base class
//    // The base class will call onTap when taps are detected
//
//    // Set up battery listener
//    batteryListener = BondListener(listener: { [weak self] battery in
//      self?.batteryLevel = battery
//      self?.handleBatteryUpdate(battery)
//    })
//  }
//
//  // Override tap handler from UltraliteBaseViewController
//  override func onTap(notification: Notification) {
////    super.onTap(notification)
////    handleTapNotification(notification)
//  }
//
//  // Override app leave handler
//  override func onAppLeave() {
//    super.onAppLeave()
//    stopControl()
//  }
//
//  // MARK: - Public Methods (Core Connection)
//
//  @objc public func findCompatibleDevices() {
//    // Use the built-in method from UltraliteBaseViewController
//    showPairingPicker()
//  }
//
//  @objc public func connectById(_ deviceId: String) {
//    // Not needed with UltraliteSDK - it manages connections automatically
//    // The SDK will connect to the last paired device
//    if let device = UltraliteManager.shared.currentDevice {
//      currentDevice = device
//      device.isConnected.bind(listener: isConnectedListener!)
////      device.battery.bind(listener: batteryListener!)
//    }
//  }
//
//  @objc public func disconnect() {
//    goHomeHandler?.cancel()
//    screenOffHandler?.cancel()
//
//    // Clear display before disconnecting
//    if let device = currentDevice {
//      device.canvas.clear(shouldClearBackground: true)
//      device.canvas.commit()
//      device.releaseControl()
//    }
//
//    // Unbind listeners
//    if let device = currentDevice {
//      device.isConnected.unbind(listener: isConnectedListener!)
////      device.battery.unbind(listener: batteryListener!)
//    }
//
//    UltraliteManager.shared.unlink()
//
//    currentDevice = nil
//    ready = false
//    isConnected = false
//    screenToggleOff = false
//    screenIsClear = true
//    textHandles.removeAll()
//  }
//
//  // MARK: - Display Methods (React Native Bridge)
//
//  @objc func RN_sendTextWall(_ text: String) {
//    displayTextWall(text)
//  }
//
//  @objc func RN_sendDoubleTextWall(_ topText: String, _ bottomText: String) {
//    displayDoubleTextWall(topText: topText, bottomText: bottomText)
//  }
//
//  @objc func RN_clearDisplay() {
//    clearDisplay()
//  }
//
//  @objc func RN_setBrightness(_ brightness: Int, autoMode: Bool) {
//    setBrightness(brightness, autoMode: autoMode)
//  }
//
//  @objc func RN_setFontSize(_ size: String) {
//    switch size.lowercased() {
//    case "small":
//      currentFontSize = .small
//    case "large":
//      currentFontSize = .large
//    default:
//      currentFontSize = .medium
//    }
//  }
//
//  // MARK: - Display Implementation
//
//  private func displayTextWall(_ text: String) {
////    guard !screenToggleOff, let device = currentDevice else { return }
////
////    let cleanedText = cleanText(text)
////
////    // Cancel any pending home screen timers
////    goHomeHandler?.cancel()
////
////    // Use base class control methods
////    layout = .canvas
////    if !startControl() {
////      CoreCommsService.log("ERROR: Unable to gain control of the device")
////      return
////    }
////
////    // Clear previous text handles
////    for handle in textHandles {
////      _ = device.canvas.removeText(id: handle)
////    }
////    textHandles.removeAll()
////
////    // Split text into lines and display
////    let lines = cleanedText.split(separator: "\n").map(String.init)
////    let truncatedLines = Array(lines.prefix(currentFontSize.maxLines))
////
////    var yOffset = 0
////    for line in truncatedLines {
////      if let handle = device.canvas.createText(
////        text: String(line),
////        textAlignment: .left,
////        textColor: .white,
////        anchor: .bottomLeft,
////        xOffset: leftSidePixelBuffer,
////        yOffset: yOffset
////      ) {
////        textHandles.append(handle)
////      }
////      yOffset -= (currentFontSize.rawValue + 5) // Line spacing
////    }
////
////    device.canvas.commit()
////    screenIsClear = false
//  }
//
//  private func displayDoubleTextWall(topText: String, bottomText: String) {
////    guard !screenToggleOff, let device = currentDevice else { return }
////
////    let cleanedTop = cleanText(topText)
////    let cleanedBottom = cleanText(bottomText)
////
////    goHomeHandler?.cancel()
////
////    // Use base class control methods
////    layout = .canvas
////    if !startControl() {
////      CoreCommsService.log("ERROR: Unable to gain control of the device")
////      return
////    }
////
////    // Clear previous text handles
////    for handle in textHandles {
////      _ = device.canvas.removeText(id: handle)
////    }
////    textHandles.removeAll()
////
////    // Display top text
////    if let topHandle = device.canvas.createText(
////      text: cleanedTop,
////      textAlignment: .left,
////      textColor: .white,
////      anchor: .topLeft,
////      xOffset: leftSidePixelBuffer,
////      yOffset: 20
////    ) {
////      textHandles.append(topHandle)
////    }
////
////    // Display bottom text
////    if let bottomHandle = device.canvas.createText(
////      text: cleanedBottom,
////      textAlignment: .left,
////      textColor: .white,
////      anchor: .bottomLeft,
////      xOffset: leftSidePixelBuffer,
////      yOffset: 20
////    ) {
////      textHandles.append(bottomHandle)
////    }
////
////    device.canvas.commit()
////    screenIsClear = false
//  }
//
//  func displayBitmap(_ bitmap: UIImage) {
////    guard !screenToggleOff, let device = currentDevice else { return }
////
////    // Use base class control methods
////    layout = .canvas
////    if !startControl() {
////      CoreCommsService.log("ERROR: Unable to gain control of the device")
////      return
////    }
////
////    // Clear canvas first
////    device.canvas.clear(shouldClearBackground: true)
////
////    // Resize bitmap to fit display (640x480)
////    let resizedBitmap = resizeBitmap(bitmap, to: CGSize(width: 620, height: 460))
////
////    // Draw bitmap centered
////    if let cgImage = resizedBitmap.cgImage {
////      device.canvas.drawBackground(
////        image: cgImage,
////        x: (device.canvas.WIDTH - cgImage.width) / 2,
////        y: (device.canvas.HEIGHT - cgImage.height) / 2
////      )
////    }
////
////    device.canvas.commit()
////    screenIsClear = false
//  }
//
//  func displayReferenceCard(title: String, body: String, lingerTime: Int = 15) {
////    guard !screenToggleOff, let device = currentDevice else { return }
////
////    // Use base class control methods
////    layout = .canvas
////    if !startControl() {
////      CoreCommsService.log("ERROR: Unable to gain control of the device")
////      return
////    }
////
////    // Clear canvas
////    device.canvas.clear(shouldClearBackground: false)
////
////    // Clear previous text handles
////    for handle in textHandles {
////      _ = device.canvas.removeText(id: handle)
////    }
////    textHandles.removeAll()
////
////    let combinedText = title.isEmpty ? body : "\(title): \(body)"
////
////    // Create wrapped text in top right
////    if let handle = device.canvas.createText(
////      text: combinedText,
////      textAlignment: .right,
////      textColor: .white,
////      anchor: .topRight,
////      xOffset: -20,
////      yOffset: 20,
//////      wrapWidth: 320
////    ) {
////      textHandles.append(handle)
////    }
////
////    device.canvas.commit()
////    screenIsClear = false
////
////    // Schedule auto-clear
////    goHomeHandler?.cancel()
////    goHomeHandler = DispatchWorkItem { [weak self] in
////      self?.showHomeScreen()
////    }
////    DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(lingerTime), execute: goHomeHandler!)
//  }
//
//  func displayBulletList(title: String, bullets: [String], lingerTime: Int = 15) {
////    guard !screenToggleOff, let device = currentDevice else { return }
////
////    // Use base class control methods
////    layout = .canvas
////    if !startControl() {
////      CoreCommsService.log("ERROR: Unable to gain control of the device")
////      return
////    }
////
////    // Clear canvas
////    device.canvas.clear(shouldClearBackground: false)
////
////    // Clear previous text handles
////    for handle in textHandles {
////      _ = device.canvas.removeText(id: handle)
////    }
////    textHandles.removeAll()
////
////    // Display title
////    if let titleHandle = device.canvas.createText(
////      text: title,
////      textAlignment: .left,
////      textColor: .white,
////      anchor: .topLeft,
////      xOffset: leftSidePixelBuffer,
////      yOffset: 20
////    ) {
////      textHandles.append(titleHandle)
////    }
////
////    // Display bullets
////    var yOffset = 80
////    for bullet in bullets.prefix(3) { // Max 3 bullets to fit screen
////      if let bulletHandle = device.canvas.createText(
////        text: "• \(bullet)",
////        textAlignment: .left,
////        textColor: .white,
////        anchor: .topLeft,
////        xOffset: leftSidePixelBuffer + 20,
////        yOffset: yOffset,
//////        wrapWidth: 580
////      ) {
////        textHandles.append(bulletHandle)
////      }
////      yOffset += 125
////    }
////
////    device.canvas.commit()
////    screenIsClear = false
////
////    // Schedule auto-clear
////    goHomeHandler?.cancel()
////    goHomeHandler = DispatchWorkItem { [weak self] in
////      self?.showHomeScreen()
////    }
////    DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(lingerTime), execute: goHomeHandler!)
//  }
//
//  // func displayRowsCard(_ rows: [String], lingerTime: Int = CARD_LINGER_TIME) {
//  //     guard !screenToggleOff, isConnected else { return }
//
//  //     changeLayout(to: .canvas)
//
//  //     // Clear previous row texts
//  //     rowTextsLiveNow.forEach { _ in
//  //         // Remove text command would go here
//  //     }
//  //     rowTextsLiveNow.removeAll()
//
//  //     // Draw row divider lines
//  //     let lineThickness = 3
//  //     for y in stride(from: 120, to: 480, by: 120) {
//  //         drawLine(x: 0, y: y, width: 640, height: lineThickness)
//  //     }
//
//  //     // Display rows (max 4)
//  //     let reversedRows = Array(rows.reversed())
//  //     let numRows = min(reversedRows.count, 4)
//  //     let yStartHeight = 55
//
//  //     for i in 0..<numRows {
//  //         let yOffset = (4 - numRows) * 112
//  //         let y = yStartHeight + yOffset + (i * 112)
//
//  //         sendCanvasText(reversedRows[i], anchor: .topLeft, x: leftSidePixelBuffer, y: y, width: 640 - leftSidePixelBuffer)
//  //         rowTextsLiveNow.append(i) // Track text ID
//  //     }
//
//  //     commitCanvas()
//  //     screenIsClear = false
//  // }
//
//  private func clearDisplay() {
//    showHomeScreen()
//  }
//
//  private func showHomeScreen() {
//    CoreCommsService.log("Showing home screen")
//
//    guard let device = currentDevice else { return }
//
//    // Clear all content
//    device.canvas.clear(shouldClearBackground: true)
//
//    // Remove all text handles
//    for handle in textHandles {
//      _ = device.canvas.removeText(id: handle)
//    }
//    textHandles.removeAll()
//
//    // Remove animation if exists
//    if animationHandle != nil {
//      _ = device.canvas.removeAninimation()
//      animationHandle = nil
//    }
//
//    device.canvas.commit()
//
//    // Use base class method to stop control
//    stopControl()
//
//    screenIsClear = true
//  }
//
//  // MARK: - Layout Management
//
//  private func changeLayout(to layout: Ultralite.Layout) {
//    guard let device = currentDevice else { return }
//
//    // UltraliteSDK manages layout switching automatically when requesting control
//    currentLayout = layout
//  }
//
//  // MARK: - Utility Methods
//
//  private func cleanText(_ input: String) -> String {
//    var cleaned = input
//
//    //        // Replace Chinese punctuation with English equivalents
//    //        let replacements = [
//    //            " ，": ", ", "，": ", ",
//    //            " 。": ".", "。": ".",
//    //            " ！": "!", " ？": "?", "？": "?",
//    //            "：": ":", "；": ";",
//    //            "（": "(", "）": ")",
//    //            "【": "[", "】": "]",
//    //            """: "\"", """: "\"",
//    //            "、": ",",
//    //            "'": "'", "'": "'"
//    //        ]
//    //
//    //        for (chinese, english) in replacements {
//    //            cleaned = cleaned.replacingOccurrences(of: chinese, with: english)
//    //        }
//
//    // Fix contractions: handle spaces around apostrophes
//    cleaned = cleaned.replacingOccurrences(of: "\\s+'\\s*", with: "'", options: .regularExpression)
//
//    return cleaned
//  }
//
//  private func resizeBitmap(_ image: UIImage, to size: CGSize) -> UIImage {
//    UIGraphicsBeginImageContextWithOptions(size, false, 0.0)
//    image.draw(in: CGRect(origin: .zero, size: size))
//    let resizedImage = UIGraphicsGetImageFromCurrentImageContext()!
//    UIGraphicsEndImageContext()
//    return resizedImage
//  }
//
//  // MARK: - Screen Control
//
//  private func setBrightness(_ brightness: Int, autoMode: Bool) {
//    guard let device = currentDevice else { return }
//
//    // UltraliteSDK doesn't expose direct brightness control
//    // This would need to be implemented through device-specific commands if available
//    CoreCommsService.log("Setting brightness to \(brightness), auto: \(autoMode)")
//  }
//
//  // MARK: - Event Handling
//
//  private func handleTapNotification(_ notification: Notification) {
//    let currentTime = Date().timeIntervalSince1970
//
//    guard currentTime - lastTapTime >= TAP_DEBOUNCE_TIME else {
//      CoreCommsService.log("Ignoring duplicate tap event")
//      return
//    }
//
//    if let taps = notification.userInfo?["tap"] as? Int64 {
//      lastTapTime = currentTime
//      totalDashboardToggleCount += 1
//
//      CoreCommsService.log("Mach1 tap event: \(taps) taps, total: \(totalDashboardToggleCount)")
//
//      // Forward tap event to React Native
//      NotificationCenter.default.post(
//        name: NSNotification.Name("GlassesTapEvent"),
//        object: nil,
//        userInfo: ["taps": Int(taps)]
//      )
//    }
//  }
//
//  private func handlePowerButtonPress(turningOn: Bool) {
//    CoreCommsService.log("Mach1 power button pressed, turning on: \(turningOn)")
//
//    screenToggleOff = !turningOn
//
//    if turningOn {
//      // Post display power event
//      NotificationCenter.default.post(
//        name: NSNotification.Name("GlassesDisplayPowerEvent"),
//        object: nil,
//        userInfo: ["powerOn": turningOn]
//      )
//    } else {
//      // Clear display when turning off
//      showHomeScreen()
//    }
//  }
//
//  private func handleBatteryUpdate(_ level: Int) {
//    // Post battery event to React Native
//    NotificationCenter.default.post(
//      name: NSNotification.Name("BatteryLevelEvent"),
//      object: nil,
//      userInfo: ["level": level, "charging": false]
//    )
//  }
//}
//
//// MARK: - UltraliteBaseViewController Extension
//// Helper to get power button events if extending from UltraliteBaseViewController
//extension Mach1Manager {
//  func setupPowerButtonObserver() {
//    // Check if UltraliteSDK provides power button notifications
//    NotificationCenter.default.addObserver(
//      forName: NSNotification.Name("ultralitePowerButton"),
//      object: nil,
//      queue: .main
//    ) { [weak self] notification in
//      if let powerOn = notification.userInfo?["powerOn"] as? Bool {
//        self?.handlePowerButtonPress(turningOn: powerOn)
//      }
//    }
//  }
//}
//




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
  
  
  public func connectById(_ id: String) {
    //    UltraliteManager.shared.connectById(id)
  }
  
  func RN_clearDisplay() {
    //    clearDisplay()
  }
  
  func disconnect() {
    
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
    
  }
  
  func findCompatibleDevices() {
    
    CoreCommsService.log("@@@@@@@@@@@@@@@@@@@@@ FINDING COMPATIBLE DEVICES @@@@@@@@@@@@@@@@@@@@@@")
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
