//
//  Bridge.swift
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

import Foundation
import React

@objc(Bridge)
class Bridge: RCTEventEmitter {
    static var emitter: RCTEventEmitter!

    override init() {
        super.init()
        Bridge.emitter = self
    }

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    static func log(_ message: String) {
        // print(message)
        let msg = "SWIFT:\(message)"
        emitter.sendEvent(withName: "CoreMessageEvent", body: msg)
    }

    static func sendEvent(withName: String, body: String) {
        emitter.sendEvent(withName: withName, body: body)
    }

    static func showBanner(type: String, message: String) {
        let data = ["type": type, "message": message] as [String: Any]
        Bridge.sendTypedMessage("show_banner", body: data)
    }

    static func sendAppStartedEvent(_ packageName: String) {
        let data = ["packageName": packageName]
        Bridge.sendTypedMessage("app_started", body: data)
    }

    static func sendAppStoppedEvent(_ packageName: String) {
        let data = ["packageName": packageName]
        Bridge.sendTypedMessage("app_stopped", body: data)
    }

    static func sendPairFailureEvent(_ error: String) {
        let data = ["error": error]
        Bridge.sendTypedMessage("pair_failure", body: data)
    }

    override func supportedEvents() -> [String] {
        // add more as needed
        return ["CoreMessageEvent", "WIFI_SCAN_RESULTS"]
    }

    // WS Comms:
    static func sendWSText(_ msg: String) {
        let data = ["text": msg]
        Bridge.sendTypedMessage("ws_text", body: data)
    }

    static func sendWSBinary(_ data: Data) {
        let base64String = data.base64EncodedString()
        let body = ["binary": base64String]
        Bridge.sendTypedMessage("ws_binary", body: body)
    }

    static func sendTypedMessage(_ type: String, body: [String: Any]) {
        var body = body
        body["type"] = type
        let jsonData = try! JSONSerialization.data(withJSONObject: body)
        let jsonString = String(data: jsonData, encoding: .utf8)
        emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString!)
    }
}
