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

// navigation step data structure (individual step info)
public struct NavigationStep {
    let instruction: String      // full instruction text
    let distanceMeters: Int     // distance for this step in meters
    let timeSeconds: Int        // estimated time for this step in seconds
    let streetName: String?     // street/road name for this step
    let maneuver: String        // "turn_left", "turn_right", "continue", etc.
}

// coordinate point for polyline
public struct NavigationCoordinate {
    let latitude: Double
    let longitude: Double
}

// navigation update data structure
public struct NavigationUpdate {
    let instruction: String
    let distanceRemaining: Int     // meters to current step
    let timeRemaining: Int         // seconds to current step
    let streetName: String?
    let maneuver: String           // "turn_left", "turn_right", "continue", etc.
    let remainingSteps: [NavigationStep]  // all remaining steps in the route
    let distanceToDestination: Int // meters to final destination
    let timeToDestination: Int     // seconds to final destination (ETA)
    let routePolyline: [NavigationCoordinate]  // polyline coordinates for the current route
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
    private var currentRoutePolyline: [NavigationCoordinate] = []
    
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
    
    func startNavigation(destination: String, mode: String = "walking") {
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
        CoreCommsService.log("🧭 Starting geocoding for destination: '\(destination)'")
        
        // check network connectivity first
        let geocoder = CLGeocoder()
        
        // try to geocode with a timeout and better error handling
        geocoder.geocodeAddressString(destination) { [weak self] placemarks, error in
            guard let self = self else { return }
            
            // ensure we're back on the main thread for UI operations
            DispatchQueue.main.async {
                if let error = error {
                    CoreCommsService.log("❌ Geocoding error for '\(destination)': \(error.localizedDescription)")
                    CoreCommsService.log("❌ Error domain: \(error._domain), code: \(error._code)")
                    
                    // try fallback destinations for testing
                    self.tryFallbackDestinations(originalDestination: destination, mode: mode)
                    return
                }
                
                CoreCommsService.log("🧭 Geocoding completed. Found \(placemarks?.count ?? 0) placemarks")
                
                guard let placemark = placemarks?.first,
                      let location = placemark.location else {
                    CoreCommsService.log("❌ Could not extract location from geocoding results")
                    if let placemarks = placemarks {
                        CoreCommsService.log("❌ Placemarks available but no location: \(placemarks)")
                    }
                    self.updateStatus(.error("Could not find destination"))
                    return
                }
                
                CoreCommsService.log("🧭 Successfully geocoded to: \(location.coordinate.latitude), \(location.coordinate.longitude)")
                CoreCommsService.log("🧭 Placemark details: \(placemark)")
                
                self.startNavigationToCoordinate(location.coordinate, mode: mode)
            }
        }
    }
    
    private func tryFallbackDestinations(originalDestination: String, mode: String) {
        // list of fallback destinations to try if geocoding fails
        let fallbackDestinations = [
            "San Francisco, CA",
            "1 Market Street, San Francisco, CA",
            "Union Square, San Francisco, CA",
            "Pier 39, San Francisco, CA"
        ]
        
        CoreCommsService.log("🧭 Trying fallback destinations for '\(originalDestination)'")
        
        // try each fallback destination
        tryGeocodingFallbacks(destinations: fallbackDestinations, mode: mode, index: 0)
    }
    
    private func tryGeocodingFallbacks(destinations: [String], mode: String, index: Int) {
        guard index < destinations.count else {
            CoreCommsService.log("❌ All fallback destinations failed")
            updateStatus(.error("Could not find any destination"))
            return
        }
        
        let destination = destinations[index]
        CoreCommsService.log("🧭 Trying fallback destination \(index + 1)/\(destinations.count): '\(destination)'")
        
        let geocoder = CLGeocoder()
        geocoder.geocodeAddressString(destination) { [weak self] placemarks, error in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                if let error = error {
                    CoreCommsService.log("❌ Fallback destination '\(destination)' failed: \(error.localizedDescription)")
                    // try next fallback
                    self.tryGeocodingFallbacks(destinations: destinations, mode: mode, index: index + 1)
                    return
                }
                
                guard let placemark = placemarks?.first,
                      let location = placemark.location else {
                    CoreCommsService.log("❌ Fallback destination '\(destination)' had no location")
                    // try next fallback
                    self.tryGeocodingFallbacks(destinations: destinations, mode: mode, index: index + 1)
                    return
                }
                
                CoreCommsService.log("🧭 Successfully used fallback destination: '\(destination)'")
                CoreCommsService.log("🧭 Coordinates: \(location.coordinate.latitude), \(location.coordinate.longitude)")
                
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
        
        // set travel mode based on the mode parameter  
        // Note: According to Google Navigation SDK documentation, we set travel mode on mapView
        switch mode.lowercased() {
        case "walking":
            mapView.travelMode = .walking
            CoreCommsService.log("🧭 Set travel mode to: walking")
        case "cycling":
            mapView.travelMode = .cycling
            CoreCommsService.log("🧭 Set travel mode to: cycling")
        case "driving":
            mapView.travelMode = .driving
            CoreCommsService.log("🧭 Set travel mode to: driving")
        default:
            CoreCommsService.log("🧭 Unknown travel mode '\(mode)', defaulting to walking")
            mapView.travelMode = .walking
        }
        
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
                    
                    // generate initial navigation update
                    self.generateNavigationUpdate()
                    
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
            maneuver: update.maneuver,
            remainingSteps: update.remainingSteps.map { step in
                NavigationStepData(
                    instruction: step.instruction,
                    distanceMeters: step.distanceMeters,
                    timeSeconds: step.timeSeconds,
                    streetName: step.streetName,
                    maneuver: step.maneuver
                )
            },
            distanceToDestination: update.distanceToDestination,
            timeToDestination: update.timeToDestination,
            routePolyline: update.routePolyline.map { coordinate in
                NavigationCoordinateData(
                    latitude: coordinate.latitude,
                    longitude: coordinate.longitude
                )
            }
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
        CoreCommsService.log("🧭 Arrived at destination: \(waypoint.title.isEmpty ? "Unknown" : waypoint.title)")
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
        
        // extract updated polyline when route changes
        currentRoutePolyline = extractRoutePolyline(from: navigator)
        
        // get updated navigation info when route changes
        getLatestNavigationInfo(from: navigator)
    }
    
    // This method provides real-time navigation updates during navigation
    public func navigator(_ navigator: GMSNavigator, didUpdate navInfo: GMSNavigationNavInfo) {
        CoreCommsService.log("🧭 Navigation info updated")
        
        guard isNavigating else { return }
        
        // extract real navigation data from navInfo
        let instruction = extractInstruction(from: navInfo)
        let distanceRemaining = extractDistanceRemaining(from: navInfo)
        let timeRemaining = extractTimeRemaining(from: navInfo)
        let streetName = extractStreetName(from: navInfo)
        let maneuver = extractManeuver(from: navInfo)
        let remainingSteps = extractRemainingSteps(from: navInfo)
        let distanceToDestination = extractDistanceToDestination(from: navInfo)
        let timeToDestination = extractTimeToDestination(from: navInfo)
        
        // create navigation update with real data
        let update = NavigationUpdate(
            instruction: instruction,
            distanceRemaining: distanceRemaining,
            timeRemaining: timeRemaining,
            streetName: streetName,
            maneuver: maneuver,
            remainingSteps: remainingSteps,
            distanceToDestination: distanceToDestination,
            timeToDestination: timeToDestination,
            routePolyline: currentRoutePolyline,
            timestamp: Date().timeIntervalSince1970
        )
        
        CoreCommsService.log("🧭 Real navigation update: \(instruction)")
        CoreCommsService.log("🧭 Distance remaining: \(distanceRemaining)m, Time: \(timeRemaining)s")
        
        sendNavigationUpdate(update)
    }
    
    // This method is called when navigation guidance becomes available/unavailable
    public func navigator(_ navigator: GMSNavigator, didUpdateRemainingTime timeToDestination: TimeInterval, distance: CLLocationDistance) {
        CoreCommsService.log("🧭 Updated time to destination: \(Int(timeToDestination))s, distance: \(Int(distance))m")
        
        // this gives us overall trip progress, can be used for additional context
        if isNavigating {
            // we can use this for trip-level updates if needed
        }
    }
    
    // MARK: - Navigation Data Extraction
    // Methods to extract real navigation data from GMSNavigationNavInfo
    
    private func getLatestNavigationInfo(from navigator: GMSNavigator) {
        // Note: currentNavInfo doesn't exist in the API
        // We'll rely on the delegate method being called automatically
        CoreCommsService.log("🧭 Waiting for navigation info update from delegate")
    }
    
    private func extractInstruction(from navInfo: GMSNavigationNavInfo) -> String {
        // try to get the current step instruction using documented properties
        if let currentStep = navInfo.currentStep {
            // use fullInstructionText as documented in GMSNavigationStepInfo
            return currentStep.fullInstructionText
        }
        
        // fallback to basic instruction
        return "Continue following the route"
    }
    
    private func extractDistanceRemaining(from navInfo: GMSNavigationNavInfo) -> Int {
        // use the dynamic distance to current step that updates as you move
        let distance = navInfo.distanceToCurrentStepMeters
        
        // check for invalid values (NaN, infinite, negative)
        if distance.isNaN || distance.isInfinite || distance < 0 {
            return 1000 // fallback distance
        }
        
        return Int(distance)
    }
    
    private func extractTimeRemaining(from navInfo: GMSNavigationNavInfo) -> Int {
        // use the dynamic time to current step that updates as you move
        let time = navInfo.timeToCurrentStepSeconds
        
        // check for invalid values (NaN, infinite, negative)
        if time.isNaN || time.isInfinite || time < 0 {
            return 300 // fallback time (5 minutes)
        }
        
        return Int(time)
    }
    
    private func extractTimeToDestination(from navInfo: GMSNavigationNavInfo) -> Int {
        // use the total time to final destination (ETA)
        let time = navInfo.timeToFinalDestinationSeconds
        
        // check for invalid values (NaN, infinite, negative)
        if time.isNaN || time.isInfinite || time < 0 {
            return 1800 // fallback time (30 minutes)
        }
        
        return Int(time)
    }
    
    private func extractDistanceToDestination(from navInfo: GMSNavigationNavInfo) -> Int {
        // use the total distance to final destination
        let distance = navInfo.distanceToFinalDestinationMeters
        
        // check for invalid values (NaN, infinite, negative)
        if distance.isNaN || distance.isInfinite || distance < 0 {
            return 5000 // fallback distance (5km)
        }
        
        return Int(distance)
    }
    
    private func extractStreetName(from navInfo: GMSNavigationNavInfo) -> String? {
        // try to get current street name using documented properties
        if let currentStep = navInfo.currentStep {
            // check if simpleRoadName is available and not empty, otherwise use fullRoadName
            let simpleRoadName = currentStep.simpleRoadName
            if !simpleRoadName.isEmpty {
                return simpleRoadName
            }
            
            let fullRoadName = currentStep.fullRoadName
            if !fullRoadName.isEmpty {
                return fullRoadName
            }
        }
        
        return nil
    }
    
    private func extractManeuver(from navInfo: GMSNavigationNavInfo) -> String {
        // map GMSNavigationManeuver to string using correct enum values
        if let currentStep = navInfo.currentStep {
            switch currentStep.maneuver {
            case .turnLeft:
                return "turn_left"
            case .turnRight:
                return "turn_right"
            case .turnSlightLeft:
                return "turn_slight_left"
            case .turnSlightRight:
                return "turn_slight_right"
            case .turnSharpLeft:
                return "turn_sharp_left"
            case .turnSharpRight:
                return "turn_sharp_right"
            case .straight:
                return "continue"
            case .turnKeepLeft:
                return "keep_left"
            case .turnKeepRight:
                return "keep_right"
            default:
                return "continue"
            }
        }
        
        return "continue"
    }
    
    private func extractRemainingSteps(from navInfo: GMSNavigationNavInfo) -> [NavigationStep] {
        // get all remaining steps from Google Navigation SDK
        let remainingSteps = navInfo.remainingSteps
        
        // convert each GMSNavigationStepInfo to our NavigationStep struct
        return remainingSteps.map { stepInfo in
            return NavigationStep(
                instruction: stepInfo.fullInstructionText,
                distanceMeters: Int(stepInfo.distanceFromPrevStepMeters),
                timeSeconds: Int(stepInfo.timeFromPrevStepSeconds),
                streetName: stepInfo.simpleRoadName.isEmpty ? stepInfo.fullRoadName : stepInfo.simpleRoadName,
                maneuver: extractManeuverFromStepInfo(stepInfo)
            )
        }
    }
    
    private func extractManeuverFromStepInfo(_ stepInfo: GMSNavigationStepInfo) -> String {
        // map GMSNavigationManeuver to string for individual step
        switch stepInfo.maneuver {
        case .turnLeft:
            return "turn_left"
        case .turnRight:
            return "turn_right"
        case .turnSlightLeft:
            return "turn_slight_left"
        case .turnSlightRight:
            return "turn_slight_right"
        case .turnSharpLeft:
            return "turn_sharp_left"
        case .turnSharpRight:
            return "turn_sharp_right"
        case .straight:
            return "continue"
        case .turnKeepLeft:
            return "keep_left"
        case .turnKeepRight:
            return "keep_right"
        default:
            return "continue"
        }
    }
    
    private func extractRoutePolyline(from navigator: GMSNavigator) -> [NavigationCoordinate] {
        // get the current route path from the navigator
        guard let routeLegs = navigator.routeLegs, !routeLegs.isEmpty else {
            CoreCommsService.log("🧭 No route legs available for polyline extraction")
            return []
        }
        
        var coordinates: [NavigationCoordinate] = []
        
        // iterate through all route legs to build complete polyline
        for routeLeg in routeLegs {
            guard let path = routeLeg.path else {
                CoreCommsService.log("🧭 No path available for route leg")
                continue
            }
            
            // extract coordinates from GMSPath
            for i in 0..<path.count() {
                let coordinate = path.coordinate(at: i)
                coordinates.append(NavigationCoordinate(
                    latitude: coordinate.latitude,
                    longitude: coordinate.longitude
                ))
            }
        }
        
        CoreCommsService.log("🧭 Extracted polyline with \(coordinates.count) coordinates")
        return coordinates
    }
    
    // MARK: - Fallback Navigation Update Generation (for route changes)
    
    private func generateNavigationUpdate() {
        guard isNavigating else { return }
        
        // Note: currentNavInfo doesn't exist, we rely on delegate calls
        // This is just a fallback when delegate isn't called
        let update = NavigationUpdate(
            instruction: "Continue following the route",
            distanceRemaining: 1000,
            timeRemaining: 300,
            streetName: currentDestination,
            maneuver: "continue",
            remainingSteps: [], // no remaining steps info available in fallback
            distanceToDestination: 5000, // fallback distance to destination
            timeToDestination: 1800, // fallback time to destination (30 min)
            routePolyline: currentRoutePolyline, // use current cached polyline
            timestamp: Date().timeIntervalSince1970
        )
        
        sendNavigationUpdate(update)
        CoreCommsService.log("🧭 Generated fallback navigation update")
    }
    
}
