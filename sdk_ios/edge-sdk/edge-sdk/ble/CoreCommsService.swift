//
//  CoreCommsService.swift
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

import Foundation

class CoreCommsService {
//    static var emitter: RCTEventEmitter!

//    override init() {
//        super.init()
//        CoreCommsService.emitter = self
//    }

    
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    static func log(_ message: String) {
        print(message)
//        let msg = "SWIFT:\(message)"
//        emitter.sendEvent(withName: "CoreMessageEvent", body: msg)
    }

    static func showBanner(type: String, message: String) {
//        let data = ["notify_manager":
//            ["type": type, "message": message]] as [String: Any]
//        let jsonData = try! JSONSerialization.data(withJSONObject: data)
//        let jsonString = String(data: jsonData, encoding: .utf8)
//        emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString!)
    }

    static func sendAppStartedEvent(_ packageName: String) {
//        let msg = ["type": "app_started", "packageName": packageName]
//        let jsonData = try! JSONSerialization.data(withJSONObject: msg)
//        let jsonString = String(data: jsonData, encoding: .utf8)
//        emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString!)
    }

    static func sendAppStoppedEvent(_ packageName: String) {
//        let msg = ["type": "app_stopped", "packageName": packageName]
//        let jsonData = try! JSONSerialization.data(withJSONObject: msg)
//        let jsonString = String(data: jsonData, encoding: .utf8)
//        emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString!)
    }

    static func sendPairFailureEvent(_ error: String) {
//        let msg = ["type": "pair_failure", "error": error]
//        let jsonData = try! JSONSerialization.data(withJSONObject: msg, options: [])
//        let jsonString = String(data: jsonData, encoding: .utf8)
//        emitter.sendEvent(withName: "CoreMessageEvent", body: jsonString!)
    }
    
    static func sendEvent(withName: String, body: String) {
        print(withName, body)
    }

    func supportedEvents() -> [String] {
        // add more as needed
        return ["onReady", "onPending", "onFailure", "onConnectionStateChanged", "CoreMessageIntentEvent", "CoreMessageEvent", "WIFI_SCAN_RESULTS"]
    }
}
