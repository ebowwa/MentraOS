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
typealias NavigationUpdateCallback = (NavigationUpdate) -> Void
typealias NavigationStatusCallback = (NavigationStatus) -> Void

// navigation update data structure
struct NavigationUpdate {
    let instruction: String
    let distanceRemaining: Int  // meters
    let timeRemaining: Int      // seconds
    let streetName: String?
    let maneuver: String        // "turn_left", "turn_right", "continue", etc.
    let timestamp: TimeInterval
}

// navigation status enum
enum NavigationStatus {
    case idle
    case planning
    case navigating
    case rerouting
    case finished
    case error(String)
}

class NavigationManager: NSObject {
    
    // callbacks for navigation events
    private var navigationUpdateCallback: NavigationUpdateCallback?
    private var navigationStatusCallback: NavigationStatusCallback?
    
    // location manager for permissions and basic location
    private let locationManager = CLLocationManager()
    
    // google navigation components
    private var navigator: GMSNavigator?
    private var mapView: GMSMapView?
    private var roadSnappedLocationProvider: GMSRoadSnappedLocationProvider?
    
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
        
        // check permissions first
        guard hasLocationPermission() else {
            CoreCommsService.log("❌ Cannot start navigation: no location permission")
            updateStatus(.error("Location permission required"))
            return
        }
        
        // check api key
        guard !googleMapsApiKey.isEmpty else {
            CoreCommsService.log("❌ Cannot start navigation: no Google Maps API key")
            updateStatus(.error("Google Maps API key required"))
            return
        }
        
        // check navigator
        guard let navigator = navigator else {
            CoreCommsService.log("❌ Cannot start navigation: navigator not initialized")
            updateStatus(.error("Navigation service not available"))
            return
        }
        
        // update state
        currentDestination = destination
        isNavigating = true
        updateStatus(.planning)
        
        // create destination
        let geocoder = CLGeocoder()
        geocoder.geocodeAddressString(destination) { [weak self] placemarks, error in
            guard let self = self else { return }
            
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
    
    private func startNavigationToCoordinate(_ coordinate: CLLocationCoordinate2D, mode: String) {
        guard let navigator = navigator else { return }
        
        CoreCommsService.log("🧭 Starting navigation to coordinate: \(coordinate.latitude), \(coordinate.longitude)")
        
        // create destination
        let destination = GMSNavigationWaypoint(location: coordinate, title: currentDestination ?? "Destination")
        
        // create travel mode
        let travelMode: GMSNavigationTravelMode
        switch mode.lowercased() {
        case "walking":
            travelMode = .walking
        case "cycling":
            travelMode = .cycling
        case "transit":
            travelMode = .transit
        default:
            travelMode = .driving
        }
        
        // build route request
        let request = GMSNavigationRouteRequest()
        request.destinations = [destination]
        request.travelMode = travelMode
        
        // start route calculation
        navigator.loadRoute(request) { [weak self] routeStatus in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                switch routeStatus {
                case .OK:
                    CoreCommsService.log("🧭 Route loaded successfully, starting navigation")
                    self.updateStatus(.navigating)
                    
                    // start navigation guidance
                    navigator.startNavigation()
                    navigator.startGuidance()
                    
                    // enable voice guidance
                    navigator.setVoiceGuidance(.audible)
                    
                case .networkError:
                    CoreCommsService.log("❌ Network error loading route")
                    self.updateStatus(.error("Network error"))
                    
                case .noRouteFound:
                    CoreCommsService.log("❌ No route found to destination")
                    self.updateStatus(.error("No route found"))
                    
                case .quotaExceeded:
                    CoreCommsService.log("❌ API quota exceeded")
                    self.updateStatus(.error("Service temporarily unavailable"))
                    
                default:
                    CoreCommsService.log("❌ Unknown error loading route: \(routeStatus)")
                    self.updateStatus(.error("Could not load route"))
                }
            }
        }
    }
    
    func stopNavigation() {
        CoreCommsService.log("🧭 Stopping navigation")
        
        // stop google navigation
        if let navigator = navigator, isNavigating {
            navigator.stopNavigation()
            navigator.stopGuidance()
        }
        
        isNavigating = false
        currentDestination = nil
        updateStatus(.idle)
        
        CoreCommsService.log("🧭 Navigation stopped")
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
        
        guard let navigator = navigator else {
            CoreCommsService.log("❌ Cannot update route preferences: navigator not available")
            return
        }
        
        // create route options
        var routingOptions = GMSNavigationRoutingOptions()
        routingOptions.avoidTolls = avoidTolls
        routingOptions.avoidHighways = avoidHighways
        
        // apply routing options
        navigator.setRoutingOptions(routingOptions)
        
        if isNavigating {
            CoreCommsService.log("🧭 Route preferences updated mid-navigation, requesting reroute")
            updateStatus(.rerouting)
            
            // request rerouting with new preferences
            navigator.requestRerouting()
        }
    }
    
    // MARK: - Google Maps Integration
    
    private func initializeGoogleMaps() {
        guard !googleMapsApiKey.isEmpty else {
            CoreCommsService.log("❌ Cannot initialize Google Maps: API key is empty")
            return
        }
        
        // initialize Google Maps services
        GMSServices.provideAPIKey(googleMapsApiKey)
        CoreCommsService.log("🧭 Google Maps initialized with API key")
        
        // create map view (required for navigation)
        let camera = GMSCameraPosition.camera(withLatitude: 37.7749, longitude: -122.4194, zoom: 15.0)
        mapView = GMSMapView.map(withFrame: .zero, camera: camera)
        
        // initialize navigator
        do {
            navigator = try GMSNavigator(mapView: mapView!)
            navigator?.delegate = self
            CoreCommsService.log("🧭 Google Navigator initialized successfully")
        } catch {
            CoreCommsService.log("❌ Failed to initialize Google Navigator: \(error.localizedDescription)")
            updateStatus(.error("Navigation service initialization failed"))
        }
        
        // initialize road snapped location provider for better location tracking
        roadSnappedLocationProvider = GMSRoadSnappedLocationProvider()
        roadSnappedLocationProvider?.delegate = self
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
        
        // test route preferences after 10 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) {
            self.updateRoutePreferences(avoidTolls: true, avoidHighways: false)
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension NavigationManager: CLLocationManagerDelegate {
    
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
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
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // handle location updates during navigation
        if let location = locations.last, isNavigating {
            CoreCommsService.log("🧭 Location updated during navigation: \(location.coordinate.latitude), \(location.coordinate.longitude)")
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        CoreCommsService.log("❌ Location manager error: \(error.localizedDescription)")
        updateStatus(.error("Location error: \(error.localizedDescription)"))
    }
}

// MARK: - GMSNavigatorDelegate

extension NavigationManager: GMSNavigatorDelegate {
    
    func navigator(_ navigator: GMSNavigator, didUpdateCurrentRoute route: GMSNavigationRoute) {
        CoreCommsService.log("🧭 Route updated")
        if currentStatus == .rerouting {
            updateStatus(.navigating)
        }
    }
    
    func navigator(_ navigator: GMSNavigator, didUpdate navInfo: GMSNavigationNavInfo) {
        // extract navigation information
        let distanceRemaining = Int(navInfo.distanceToCurrentStepMeters)
        let timeRemaining = Int(navInfo.timeToCurrentStepSeconds)
        let instruction = navInfo.fullInstructions ?? "Continue"
        let streetName = navInfo.currentStep?.maneuver?.toString() ?? "Unknown"
        
        // convert maneuver to string
        let maneuverString: String
        if let maneuver = navInfo.currentStep?.maneuver {
            maneuverString = maneuverToString(maneuver)
        } else {
            maneuverString = "continue"
        }
        
        let update = NavigationUpdate(
            instruction: instruction,
            distanceRemaining: distanceRemaining,
            timeRemaining: timeRemaining,
            streetName: streetName,
            maneuver: maneuverString,
            timestamp: Date().timeIntervalSince1970
        )
        
        sendNavigationUpdate(update)
    }
    
    func navigator(_ navigator: GMSNavigator, didArriveAt waypoint: GMSNavigationWaypoint) {
        CoreCommsService.log("🧭 Arrived at destination")
        updateStatus(.finished)
        
        // stop navigation
        stopNavigation()
        
        // auto-reset to idle after a few seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            self.updateStatus(.idle)
        }
    }
    
    func navigator(_ navigator: GMSNavigator, didFailReroutingWithError error: Error) {
        CoreCommsService.log("❌ Rerouting failed: \(error.localizedDescription)")
        updateStatus(.error("Rerouting failed"))
    }
    
    func navigatorDidBeginRerouting(_ navigator: GMSNavigator) {
        CoreCommsService.log("🧭 Rerouting started")
        updateStatus(.rerouting)
    }
    
    func navigatorDidFinishRerouting(_ navigator: GMSNavigator) {
        CoreCommsService.log("🧭 Rerouting completed")
        updateStatus(.navigating)
    }
    
    // helper method to convert maneuver enum to string
    private func maneuverToString(_ maneuver: GMSNavigationManeuver) -> String {
        switch maneuver {
        case .turnLeft: return "turn_left"
        case .turnRight: return "turn_right"
        case .turnSlightLeft: return "turn_slight_left"
        case .turnSlightRight: return "turn_slight_right"
        case .turnSharpLeft: return "turn_sharp_left"
        case .turnSharpRight: return "turn_sharp_right"
        case .uturnLeft: return "uturn_left"
        case .uturnRight: return "uturn_right"
        case .continue: return "continue"
        case .merge: return "merge"
        case .onRamp: return "on_ramp"
        case .offRamp: return "off_ramp"
        case .fork: return "fork"
        case .roundaboutEnter: return "roundabout_enter"
        case .roundaboutExit: return "roundabout_exit"
        case .roundaboutLeft: return "roundabout_left"
        case .roundaboutRight: return "roundabout_right"
        case .arrive: return "arrive"
        default: return "continue"
        }
    }
}

// MARK: - GMSRoadSnappedLocationProviderDelegate

extension NavigationManager: GMSRoadSnappedLocationProviderDelegate {
    
    func locationProvider(_ locationProvider: GMSRoadSnappedLocationProvider, didUpdate location: CLLocation) {
        // handle road-snapped location updates during navigation
        if isNavigating {
            CoreCommsService.log("🧭 Road-snapped location updated: \(location.coordinate.latitude), \(location.coordinate.longitude)")
        }
    }
    
    func locationProvider(_ locationProvider: GMSRoadSnappedLocationProvider, didFailWithError error: Error) {
        CoreCommsService.log("❌ Road-snapped location provider error: \(error.localizedDescription)")
    }
}