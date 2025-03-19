//
//  LocationManager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/16/25.
//

import Foundation
import CoreLocation

class LocationManager: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private var fastLocationManager: CLLocationManager?
    private var locationChangedCallback: (() -> Void)?
    private var currentLocation: CLLocation?
    private var initialFixObtained = false
    
    // Timeout handling
    private var initialFixTimer: Timer?
    private var accurateFixTimer: Timer?
    
    override init() {
        super.init()
        setupLocationManager()
        requestInitialFix()
    }
    
    private func setupLocationManager() {
        // Main location manager for accurate updates
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter = 10 // Update when user moves 10 meters
        locationManager.allowsBackgroundLocationUpdates = false
        locationManager.pausesLocationUpdatesAutomatically = true
        
        // Request authorization
        locationManager.requestWhenInUseAuthorization()
    }
    
    private func requestInitialFix() {
        // Try to get cached location first
        if let cachedLocation = locationManager.location {
            processInitialLocation(cachedLocation)
            return
        }
        
        // Create a separate location manager for fast initial fix
        let fastManager = CLLocationManager()
        fastManager.delegate = self
        fastManager.desiredAccuracy = kCLLocationAccuracyHundredMeters // Lower accuracy for speed
        fastManager.distanceFilter = kCLDistanceFilterNone // Any movement triggers update
        
        self.fastLocationManager = fastManager
        fastManager.startUpdatingLocation()
        
        // Set a timeout for the initial fix
        initialFixTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            
            // If we haven't received a fast fix, try with the main manager
            if !self.initialFixObtained {
                print("Fast fix timed out, starting regular updates")
                self.fastLocationManager?.stopUpdatingLocation()
                self.fastLocationManager = nil
                self.locationManager.startUpdatingLocation()
                
                // Set another timeout for the accurate fix
                self.setupAccurateFixTimeout()
            }
        }
    }
    
    private func setupAccurateFixTimeout() {
        accurateFixTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: false) { [weak self] _ in
            guard let self = self else { return }
            
            // If we still don't have a location, something's wrong
            if self.currentLocation == nil {
                print("Failed to get location within reasonable time. May need to check permissions or device settings.")
                
                // We'll let the location manager continue trying, but might want to notify the user
            }
        }
    }
    
    private func processInitialLocation(_ location: CLLocation) {
        currentLocation = location
        initialFixObtained = true
        
        // Notify via callback
        locationChangedCallback?()
        
        // Clean up fast location manager if it exists
        if let fastManager = fastLocationManager {
            fastManager.stopUpdatingLocation()
            fastLocationManager = nil
        }
        
        // Cancel initial fix timer if running
        initialFixTimer?.invalidate()
        initialFixTimer = nil
        
        // Start regular updates with main location manager
        locationManager.startUpdatingLocation()
    }
    
    func setLocationChangedCallback(_ callback: @escaping () -> Void) {
        self.locationChangedCallback = callback
    }
    
    // MARK: - CLLocationManagerDelegate Methods
    
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        
        // If this is from the fast manager, process it as an initial fix
        if manager == fastLocationManager && !initialFixObtained {
            print("Got fast initial fix")
            processInitialLocation(location)
            return
        }
        
        // For the main location manager, only process significant changes
        if initialFixObtained && (currentLocation == nil || location.distance(from: currentLocation!) > 10) {
            print("Got accurate location update")
            currentLocation = location
            
            // Notify via callback
            locationChangedCallback?()
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // More specific error handling
        if let clError = error as? CLError {
            switch clError.code {
            case .denied:
                print("LocationManager: User denied location permissions")
            case .network:
                print("LocationManager: Network error, unable to get location")
            default:
                print("LocationManager: Failed with CLError: \(clError.localizedDescription)")
            }
        } else {
            print("LocationManager: Failed with error: \(error.localizedDescription)")
        }
        
        // If the fast manager fails, try with the main manager
        if manager == fastLocationManager {
            fastLocationManager?.stopUpdatingLocation()
            fastLocationManager = nil
            locationManager.startUpdatingLocation()
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            // If we get authorization and haven't started yet, request initial fix
            if !initialFixObtained && fastLocationManager == nil {
                requestInitialFix()
            } else if initialFixObtained && !locationManager.location.isNil {
                locationManager.startUpdatingLocation()
            }
        case .denied, .restricted:
            print("LocationManager: Location access denied or restricted")
        case .notDetermined:
            print("LocationManager: Location permission not determined yet")
        @unknown default:
            print("LocationManager: Unknown authorization status")
        }
    }
    
    // MARK: - Location Getters
    
    func getCurrentLocation() -> (latitude: Double, longitude: Double)? {
        guard let location = currentLocation else { return nil }
        return (latitude: location.coordinate.latitude, longitude: location.coordinate.longitude)
    }
    
    func getLastKnownLocation() -> (latitude: Double, longitude: Double)? {
        // First try our cached current location
        if let current = getCurrentLocation() {
            return current
        }
        
        // If we don't have one, try the system's last location
        if let systemLocation = locationManager.location {
            return (latitude: systemLocation.coordinate.latitude,
                   longitude: systemLocation.coordinate.longitude)
        }
        
        return nil
    }
    
    // Call this to manually stop location updates (e.g., when app goes to background)
    func stopLocationUpdates() {
        initialFixTimer?.invalidate()
        accurateFixTimer?.invalidate()
        fastLocationManager?.stopUpdatingLocation()
        locationManager.stopUpdatingLocation()
    }
    
    // Call this to manually restart location updates (e.g., when app comes to foreground)
    func restartLocationUpdates() {
        if !initialFixObtained {
            requestInitialFix()
        } else {
            locationManager.startUpdatingLocation()
        }
    }
}

// Extension to make optional checking cleaner
extension Optional {
    var isNil: Bool {
        return self == nil
    }
}
