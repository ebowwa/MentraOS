//
//  CoreCommsService.swift
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

import Foundation
import React

@objc(CoreCommsService)
class CoreCommsService: RCTEventEmitter {
    static var emitter: RCTEventEmitter!

    override init() {
        super.init()
        CoreCommsService.emitter = self
    }

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    static func log(_ message: String) {
        print(message)
        let msg = "SWIFT:\(message)"
        emitter.sendEvent(withName: "CoreMessageEvent", body: msg)
    }

    override func supportedEvents() -> [String] {
        // add more as needed
        return ["onReady", "onPending", "onFailure", "onConnectionStateChanged", "CoreMessageIntentEvent", "CoreMessageEvent", "WIFI_SCAN_RESULTS"]
    }
}
