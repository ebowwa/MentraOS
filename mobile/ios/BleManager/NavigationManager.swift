//
//  NavigationManager.swift
//  MentraOS_Manager
//
//  Created by AI Assistant
//

import Foundation
import CoreLocation
import UIKit
import GoogleMaps
import GoogleNavigation

// navigation update callback type
public typealias NavigationUpdateCallback = (NavigationUpdate) -> Void
public typealias NavigationStatusCallback = (NavigationStatus) -> Void

// navigation update data structure
public struct NavigationUpdate {
    let instruction: String
    let distanceRemaining: Int  // meters
    let timeRemaining: Int      // seconds
    let streetName: String?
    let maneuver: String        // "turn_left", "turn_right", "continue", etc.
    let timestamp: TimeInterval
}

// navigation status enum
public enum NavigationStatus: Equatable {
    case idle
    case planning
    case navigating
    case rerouting
    case finished
    case error(String)
}

public class NavigationManager: NSObject {
    
    // callbacks for navigation events
    private var navigationUpdateCallback: NavigationUpdateCallback?
    private var navigationStatusCallback: NavigationStatusCallback?
    
    // location manager for permissions and basic location
    private let locationManager = CLLocationManager()
    
    // google navigation components - using GMSMapView with navigation enabled
    private var mapView: GMSMapView?
    
    // current navigation state
    private var currentStatus: NavigationStatus = .idle
    private var isNavigating = false
    private var currentDestination: String?
    
    // google maps api key
    private var googleMapsApiKey: String {
        return RNCConfig.env(for: "GOOGLE_KEY") ?? ""
    }
    
    override init() {
        super.init()
        setupLocationManager()
        initializeGoogleMaps()
        CoreCommsService.log("🧭 NavigationManager initialized")
    }
    
    // MARK: - Setup
    
    private func setupLocationManager() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
    }
    
    // MARK: - Callback Setup
    
    func setNavigationUpdateCallback(_ callback: @escaping NavigationUpdateCallback) {
        navigationUpdateCallback = callback
        CoreCommsService.log("🧭 Navigation update callback set")
    }
    
    func setNavigationStatusCallback(_ callback: @escaping NavigationStatusCallback) {
        navigationStatusCallback = callback
        CoreCommsService.log("🧭 Navigation status callback set")
    }
    
    // MARK: - Permissions
    
    func hasLocationPermission() -> Bool {
        let status = locationManager.authorizationStatus
        return status == .authorizedWhenInUse || status == .authorizedAlways
    }
    
    func requestLocationPermission() {
        CoreCommsService.log("🧭 Requesting location permission for navigation")
        locationManager.requestWhenInUseAuthorization()
    }
    
    // MARK: - Navigation Control
    
    func startNavigation(destination: String, mode: String = "driving") {
        CoreCommsService.log("🧭 Starting navigation to: \(destination) (mode: \(mode))")
        
        // ensure we're on the main thread for all UI operations
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // check permissions first
            guard self.hasLocationPermission() else {
                CoreCommsService.log("❌ Cannot start navigation: no location permission")
                self.updateStatus(.error("Location permission required"))
                return
            }
            
            // check api key
            guard !self.googleMapsApiKey.isEmpty else {
                CoreCommsService.log("❌ Cannot start navigation: no Google Maps API key")
                self.updateStatus(.error("Google Maps API key required"))
                return
            }
            
            // check map view
            guard let mapView = self.mapView else {
                CoreCommsService.log("❌ Cannot start navigation: map view not initialized")
                self.updateStatus(.error("Navigation service not available"))
                return
            }
            
            // update state
            self.currentDestination = destination
            self.isNavigating = true
            self.updateStatus(.planning)
            
            // first enable navigation on the map view if not already enabled
            if !mapView.isNavigationEnabled {
                // show terms and conditions first
                let companyName = "MentraOS"
                GMSNavigationServices.showTermsAndConditionsDialogIfNeeded(withCompanyName: companyName) { [weak self] termsAccepted in
                    guard let self = self else { return }
                    
                    if termsAccepted {
                        mapView.isNavigationEnabled = true
                        mapView.navigator?.add(self)
                        self.proceedWithNavigation(destination: destination, mode: mode)
                    } else {
                        CoreCommsService.log("❌ Navigation terms not accepted")
                        self.updateStatus(.error("Navigation terms not accepted"))
                    }
                }
            } else {
                // terms already accepted, proceed with navigation
                self.proceedWithNavigation(destination: destination, mode: mode)
            }
        }
    }
    
    private func proceedWithNavigation(destination: String, mode: String) {
        // create destination using place ID or geocoding
        // for now, let's use geocoding as a fallback
        let geocoder = CLGeocoder()
        geocoder.geocodeAddressString(destination) { [weak self] placemarks, error in
            guard let self = self else { return }
            
            // ensure we're back on the main thread for UI operations
            DispatchQueue.main.async {
                if let error = error {
                    CoreCommsService.log("❌ Geocoding error: \(error.localizedDescription)")
                    self.updateStatus(.error("Could not find destination"))
                    return
                }
                
                guard let placemark = placemarks?.first,
                      let location = placemark.location else {
                    CoreCommsService.log("❌ Could not geocode destination")
                    self.updateStatus(.error("Could not find destination"))
                    return
                }
                
                self.startNavigationToCoordinate(location.coordinate, mode: mode)
            }
        }
    }
    
    private func startNavigationToCoordinate(_ coordinate: CLLocationCoordinate2D, mode: String) {
        guard let mapView = mapView,
              let navigator = mapView.navigator else { 
            updateStatus(.error("Navigation not available"))
            return 
        }
        
        CoreCommsService.log("🧭 Starting navigation to coordinate: \(coordinate.latitude), \(coordinate.longitude)")
        
        // create destination waypoint - simplified approach without place ID for now
        var destinations = [GMSNavigationWaypoint]()
        if let waypoint = GMSNavigationWaypoint(location: coordinate, title: currentDestination ?? "Destination") {
            destinations.append(waypoint)
        } else {
            updateStatus(.error("Could not create waypoint"))
            return
        }
        
        // note: only driving mode is reliably supported, transit is not available
        // we'll ignore the mode parameter for now and default to driving
        
        // set destinations and start navigation
        navigator.setDestinations(destinations) { [weak self] routeStatus in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                switch routeStatus {
                case .OK:
                    CoreCommsService.log("🧭 Route loaded successfully, starting navigation")
                    self.updateStatus(.navigating)
                    
                    // start navigation guidance
                    navigator.isGuidanceActive = true
                    mapView.cameraMode = .following
                    
                case .locationUnavailable:
                    CoreCommsService.log("❌ Location unavailable")
                    self.updateStatus(.error("Location unavailable - check permissions"))
                    
                case .noRouteFound:
                    CoreCommsService.log("❌ No route found to destination")
                    self.updateStatus(.error("No route found"))
                    
                case .waypointError:
                    CoreCommsService.log("❌ Waypoint error")
                    self.updateStatus(.error("Invalid destination"))
                    
                default:
                    CoreCommsService.log("❌ Unknown error loading route: \(routeStatus)")
                    self.updateStatus(.error("Could not load route"))
                }
            }
        }
    }
    
    func stopNavigation() {
        CoreCommsService.log("🧭 Stopping navigation")
        
        // ensure we're on the main thread for UI operations
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // stop google navigation
            if let mapView = self.mapView,
               let navigator = mapView.navigator,
               self.isNavigating {
                navigator.isGuidanceActive = false
            }
            
            self.isNavigating = false
            self.currentDestination = nil
            self.updateStatus(.idle)
            
            CoreCommsService.log("🧭 Navigation stopped")
        }
    }
    
    func getCurrentStatus() -> NavigationStatus {
        return currentStatus
    }
    
    func isCurrentlyNavigating() -> Bool {
        return isNavigating
    }
    
    // MARK: - Route Options
    
    func updateRoutePreferences(avoidTolls: Bool = false, avoidHighways: Bool = false) {
        CoreCommsService.log("🧭 Updating route preferences - avoidTolls: \(avoidTolls), avoidHighways: \(avoidHighways)")
        
        // note: route preferences updating is not straightforward in the iOS Navigation SDK
        // this would require re-calculating the route with new options
        // for now, we'll just log that this was requested
        CoreCommsService.log("⚠️ Route preference updates not yet implemented - would require re-routing")
        
        // in a full implementation, you would:
        // 1. store the preferences 
        // 2. re-call setDestinations with updated routing options
        // 3. handle the transition smoothly
    }
    
    // MARK: - Google Maps Integration
    
    private func initializeGoogleMaps() {
        guard !googleMapsApiKey.isEmpty else {
            CoreCommsService.log("❌ Cannot initialize Google Maps: API key is empty")
            return
        }
        
        // ensure we're on the main thread for UI creation
        if Thread.isMainThread {
            performGoogleMapsInitialization()
        } else {
            DispatchQueue.main.sync {
                performGoogleMapsInitialization()
            }
        }
    }
    
    private func performGoogleMapsInitialization() {
        // initialize Google Maps services
        GMSServices.provideAPIKey(googleMapsApiKey)
        CoreCommsService.log("🧭 Google Maps initialized with API key")
        
        // create map view for navigation - this is enough for basic navigation
        let camera = GMSCameraPosition.camera(withLatitude: 37.7749, longitude: -122.4194, zoom: 15.0)
        let options = GMSMapViewOptions()
        options.camera = camera
        options.frame = .zero
        
        mapView = GMSMapView(options: options)
        
        // we'll configure navigation in startNavigation when user accepts terms
        CoreCommsService.log("🧭 Google Maps initialized successfully")
    }
    
    // MARK: - Helper Methods
    
    private func updateStatus(_ status: NavigationStatus) {
        currentStatus = status
        
        // log status change
        let statusString: String
        var errorMessage: String? = nil
        
        switch status {
        case .idle: statusString = "idle"
        case .planning: statusString = "planning"
        case .navigating: statusString = "navigating"
        case .rerouting: statusString = "rerouting"
        case .finished: statusString = "finished"
        case .error(let message): 
            statusString = "error"
            errorMessage = message
        }
        
        CoreCommsService.log("🧭 Navigation status changed to: \(statusString)")
        
        // send to cloud via ServerComms
        let navigationStatusData = NavigationStatusData(
            status: statusString,
            errorMessage: errorMessage,
            destination: currentDestination
        )
        ServerComms.getInstance().sendNavigationStatus(navigationStatusData)
        
        // notify callback
        navigationStatusCallback?(status)
    }
    
    private func sendNavigationUpdate(_ update: NavigationUpdate) {
        CoreCommsService.log("🧭 Navigation update: \(update.instruction)")
        CoreCommsService.log("🧭 Distance remaining: \(update.distanceRemaining)m, Time: \(update.timeRemaining)s")
        
        // send to cloud via ServerComms
        let navigationUpdateData = NavigationUpdateData(
            instruction: update.instruction,
            distanceRemaining: update.distanceRemaining,
            timeRemaining: update.timeRemaining,
            streetName: update.streetName,
            maneuver: update.maneuver
        )
        ServerComms.getInstance().sendNavigationUpdate(navigationUpdateData)
        
        // notify callback
        navigationUpdateCallback?(update)
    }
    
    // MARK: - Public Testing Methods
    
    func testNavigationFlow() {
        CoreCommsService.log("🧭 Starting navigation test flow")
        
        // test the full flow with real Google Navigation
        startNavigation(destination: "1600 Amphitheatre Parkway, Mountain View, CA")
        
        // we can test other functionality after navigation starts
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) {
            if self.isNavigating {
                CoreCommsService.log("🧭 Navigation is active - test successful")
            }
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension NavigationManager: CLLocationManagerDelegate {
    
    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        CoreCommsService.log("🧭 Location authorization changed to: \(status.rawValue)")
        
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            CoreCommsService.log("🧭 Location permission granted")
        case .denied, .restricted:
            CoreCommsService.log("❌ Location permission denied")
            updateStatus(.error("Location permission denied"))
        case .notDetermined:
            CoreCommsService.log("🧭 Location permission not determined")
        @unknown default:
            CoreCommsService.log("🧭 Unknown location authorization status")
        }
    }
    
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // handle location updates during navigation
        if let location = locations.last, isNavigating {
            CoreCommsService.log("🧭 Location updated during navigation: \(location.coordinate.latitude), \(location.coordinate.longitude)")
        }
    }
    
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        CoreCommsService.log("❌ Location manager error: \(error.localizedDescription)")
        updateStatus(.error("Location error: \(error.localizedDescription)"))
    }
}

// MARK: - GMSNavigatorListener

extension NavigationManager: GMSNavigatorListener {
    
    public func navigator(_ navigator: GMSNavigator, didArriveAt waypoint: GMSNavigationWaypoint) {
        CoreCommsService.log("🧭 Arrived at destination: \(waypoint.title ?? "Unknown")")
        updateStatus(.finished)
        
        // stop navigation
        stopNavigation()
        
        // auto-reset to idle after a few seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            self.updateStatus(.idle)
        }
    }
    
    public func navigatorDidChangeRoute(_ navigator: GMSNavigator) {
        CoreCommsService.log("🧭 Route changed")
        if currentStatus == .rerouting {
            updateStatus(.navigating)
        }
    }
    
    // simplified navigation update handling
    // we can't easily get detailed step-by-step information without more complex setup
    // for now, we'll just indicate that navigation is active
    private func createBasicNavigationUpdate() -> NavigationUpdate {
        return NavigationUpdate(
            instruction: "Continue following route",
            distanceRemaining: 0, // would need to calculate from route
            timeRemaining: 0,     // would need to calculate from route
            streetName: nil,
            maneuver: "continue",
            timestamp: Date().timeIntervalSince1970
        )
    }
}