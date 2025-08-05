//
//  NavigationTester.swift
//  MentraOS_Manager
//
//  Created for testing NavigationManager
//

import Foundation

class NavigationTester {
    
    private let navigationManager = NavigationManager()
    
    init() {
        setupCallbacks()
    }
    
    private func setupCallbacks() {
        // listen for navigation updates
        navigationManager.setNavigationUpdateCallback { update in
            CoreCommsService.log("🧭 NAV UPDATE: \(update.instruction)")
            CoreCommsService.log("🧭 Distance: \(update.distanceRemaining)m, ETA: \(update.timeRemaining)s")
            CoreCommsService.log("🧭 Maneuver: \(update.maneuver)")
        }
        
        // listen for status changes
        navigationManager.setNavigationStatusCallback { status in
            switch status {
            case .idle:
                CoreCommsService.log("🧭 STATUS: Idle")
            case .planning:
                CoreCommsService.log("🧭 STATUS: Planning route...")
            case .navigating:
                CoreCommsService.log("🧭 STATUS: Navigating!")
            case .rerouting:
                CoreCommsService.log("🧭 STATUS: Rerouting...")
            case .finished:
                CoreCommsService.log("🧭 STATUS: Arrived at destination!")
            case .error(let message):
                CoreCommsService.log("❌ NAV ERROR: \(message)")
            }
        }
    }
    
    // MARK: - Test Methods
    
    func testBasicNavigation() {
        CoreCommsService.log("🧭 Starting basic navigation test")
        navigationManager.startNavigation(destination: "Apple Park, Cupertino, CA")
    }
    
    func testNavigationWithModeWalking() {
        CoreCommsService.log("🧭 Starting walking navigation test")
        navigationManager.startNavigation(destination: "1 Infinite Loop, Cupertino, CA", mode: "walking")
    }
    
    func testRoutePreferences() {
        CoreCommsService.log("🧭 Testing route preferences")
        navigationManager.startNavigation(destination: "San Francisco, CA")
        
        // test preferences after 10 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) {
            CoreCommsService.log("🧭 Updating route preferences to avoid tolls")
            self.navigationManager.updateRoutePreferences(avoidTolls: true, avoidHighways: false)
        }
    }
    
    func testStopNavigation() {
        CoreCommsService.log("🧭 Testing stop navigation")
        navigationManager.startNavigation(destination: "Golden Gate Bridge, San Francisco")
        
        // stop after 15 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 15.0) {
            CoreCommsService.log("🧭 Stopping navigation manually")
            self.navigationManager.stopNavigation()
        }
    }
    
    func testNavigationFlow() {
        CoreCommsService.log("🧭 Starting full navigation flow test")
        navigationManager.testNavigationFlow()
    }
    
    func testLocationPermission() {
        if navigationManager.hasLocationPermission() {
            CoreCommsService.log("✅ Location permission already granted")
        } else {
            CoreCommsService.log("⚠️ Requesting location permission")
            navigationManager.requestLocationPermission()
        }
    }
    
    func getCurrentNavigationStatus() {
        let status = navigationManager.getCurrentStatus()
        let isNavigating = navigationManager.isCurrentlyNavigating()
        CoreCommsService.log("🧭 Current status: \(status), Is navigating: \(isNavigating)")
    }
    
    // MARK: - Quick Test Runner
    
    func runAllTests() {
        CoreCommsService.log("🧭 ===== STARTING NAVIGATION TESTS =====")
        
        testLocationPermission()
        
        // wait 2 seconds for permission, then start tests
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.testBasicNavigation()
            
            // chain tests with delays
            DispatchQueue.main.asyncAfter(deadline: .now() + 30.0) {
                self.navigationManager.stopNavigation()
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
                    self.testNavigationWithModeWalking()
                }
            }
        }
    }
}