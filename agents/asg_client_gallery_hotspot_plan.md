# ASG Client Gallery Hotspot Implementation Plan

## Overview

This document outlines the implementation plan for adding hotspot functionality to the ASG client gallery system. When users try to access the gallery and are not on the same WiFi network, the system will prompt a hotspot flow to enable photo/video transfer.

## Current Architecture Analysis

### Gallery System (Mobile App)

- **Location**: `mobile/src/app/asg/gallery.tsx` and `mobile/src/app/asg/components/Gallery/GalleryScreen.tsx`
- **API Client**: `mobile/src/app/asg/services/asgCameraApi.ts`
- **Current Flow**:
  1. Checks glasses WiFi connection status (`status.glasses_info?.glasses_wifi_connected`)
  2. Uses glasses WiFi IP (`status.glasses_info?.glasses_wifi_local_ip`)
  3. Connects to `http://{glassesWifiIp}:8089` for gallery API
  4. Shows connection warnings when not on same network

### ASG Client (Glasses)

- **Camera Server**: `asg_client/app/src/main/java/com/augmentos/asg_client/io/server/services/AsgCameraServer.java`
- **Network Management**: `asg_client/app/src/main/java/com/augmentos/asg_client/io/network/managers/K900NetworkManager.java`
- **WiFi Command Handler**: `asg_client/app/src/main/java/com/augmentos/asg_client/service/core/handlers/WifiCommandHandler.java`
- **BLE Communication**: `asg_client/app/src/main/java/com/augmentos/asg_client/service/communication/managers/CommunicationManager.java`

### Mobile Native Modules

- **Android**: `mobile/android/app/src/main/java/com/mentra/mentra/AugmentOSCommunicator.java`
- **iOS**: `mobile/ios/BleManager/AOSManager.swift`
- **BLE Pattern**: EventBus-based communication with Core service

## Implementation Plan

### Phase 1: Enhanced Existing BLE Command Infrastructure

#### 1.1 Enhance Existing `set_hotspot_state` Command

**Location**: ASG Client - `WifiCommandHandler.java`

Modify the existing `handleSetHotspotState` method to report back credentials:

```java
// Enhanced existing method in WifiCommandHandler.java
public boolean handleSetHotspotState(JSONObject data) {
    try {
        boolean hotspotEnabled = data.optBoolean("enabled", false);
        INetworkManager networkManager = serviceManager.getNetworkManager();

        if (hotspotEnabled) {
            String hotspotSsid = data.optString("ssid", "");
            String hotspotPassword = data.optString("password", "");

            // Generate credentials if not provided
            if (hotspotSsid.isEmpty()) {
                hotspotSsid = "AugmentOS_" + getDeviceId();
            }
            if (hotspotPassword.isEmpty()) {
                hotspotPassword = "augmentos" + System.currentTimeMillis();
            }

            networkManager.startHotspot(hotspotSsid, hotspotPassword);

            // NEW: Report back when hotspot is online
            JSONObject response = new JSONObject();
            response.put("command", "hotspot_started");
            response.put("ssid", hotspotSsid);
            response.put("password", hotspotPassword);
            response.put("ip", networkManager.getLocalIpAddress());
            communicationManager.sendJsonOverBle(response);

        } else {
            networkManager.stopHotspot();

            // NEW: Report when hotspot is stopped
            JSONObject response = new JSONObject();
            response.put("command", "hotspot_stopped");
            communicationManager.sendJsonOverBle(response);
        }
        return true;
    } catch (Exception e) {
        Log.e(TAG, "Error handling hotspot state command", e);
        return false;
    }
}
```

#### 1.2 Enhanced Network Manager

**Location**: `K900NetworkManager.java`

Add gallery-specific hotspot functionality:

```java
public void startGalleryHotspot() {
    // Ensure camera server is ready before starting hotspot
    if (!isCameraServerRunning()) {
        initializeCameraServer();
    }

    String ssid = generateGalleryHotspotSsid();
    String password = generateSecurePassword();

    startHotspot(ssid, password);

    // Store credentials for retrieval
    storeHotspotCredentials(ssid, password);
}

private void initializeCameraServer() {
    // Ensure AsgCameraServer is running on port 8089
    serviceManager.initializeCameraWebServer();
}
```

### Phase 2: BLE Communication and Status Integration

## Correct Data Flow: ASG Client → MentraLiveSGC → AugmentosService → React Native

### 2.1 ASG Client Sends Hotspot Status to Phone

**Location**: ASG Client - `WifiCommandHandler.java` (on glasses)

Send hotspot status to phone via BLE after hotspot state changes:

```java
public boolean handleSetHotspotState(JSONObject data) {
    try {
        boolean hotspotEnabled = data.optBoolean("enabled", false);
        INetworkManager networkManager = serviceManager.getNetworkManager();

        if (hotspotEnabled) {
            String hotspotSsid = data.optString("ssid", "");
            String hotspotPassword = data.optString("password", "");

            // Generate credentials if not provided
            if (hotspotSsid.isEmpty()) {
                hotspotSsid = "AugmentOS_" + getDeviceId();
            }
            if (hotspotPassword.isEmpty()) {
                hotspotPassword = "augmentos" + System.currentTimeMillis();
            }

            networkManager.startHotspot(hotspotSsid, hotspotPassword);
        } else {
            networkManager.stopHotspot();
        }

        // NEW: Send hotspot status to phone via BLE
        sendHotspotStatusToPhone(networkManager);

        return true;
    } catch (Exception e) {
        Log.e(TAG, "Error handling hotspot state command", e);
        return false;
    }
}

private void sendHotspotStatusToPhone(INetworkManager networkManager) {
    JSONObject hotspotStatus = new JSONObject();
    hotspotStatus.put("command", "hotspot_status_update");
    hotspotStatus.put("hotspot_enabled", networkManager.isHotspotEnabled());

    if (networkManager.isHotspotEnabled()) {
        hotspotStatus.put("hotspot_ssid", networkManager.getHotspotSsid());
        hotspotStatus.put("hotspot_password", networkManager.getHotspotPassword());
        hotspotStatus.put("hotspot_ip", networkManager.getLocalIpAddress());
    }

    communicationManager.sendJsonOverBle(hotspotStatus);
}
```

### 2.2 Create GlassesHotspotStatusChange Event Class

**Location**: Android Core - `android_core/app/src/main/java/com/augmentos/augmentos_core/smarterglassesmanager/eventbusmessages/GlassesHotspotStatusChange.java`

Create new EventBus event class (following exact pattern of `GlassesWifiStatusChange`):

```java
package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event sent when glasses hotspot status changes.
 * This follows the same pattern as GlassesWifiStatusChange for consistency.
 */
public class GlassesHotspotStatusChange {
    // The device model name
    public final String deviceModel;

    // Hotspot status information
    public final boolean isHotspotEnabled;
    public final String hotspotSsid;
    public final String hotspotPassword;
    public final String hotspotIp;

    /**
     * Create a new GlassesHotspotStatusChange
     *
     * @param deviceModel The glasses model name
     * @param isHotspotEnabled Current hotspot state
     * @param hotspotSsid Current hotspot SSID if enabled
     * @param hotspotPassword Current hotspot password if enabled
     * @param hotspotIp Local IP address of the glasses hotspot
     */
    public GlassesHotspotStatusChange(String deviceModel,
                                     boolean isHotspotEnabled,
                                     String hotspotSsid,
                                     String hotspotPassword,
                                     String hotspotIp) {
        this.deviceModel = deviceModel;
        this.isHotspotEnabled = isHotspotEnabled;
        this.hotspotSsid = hotspotSsid != null ? hotspotSsid : "";
        this.hotspotPassword = hotspotPassword != null ? hotspotPassword : "";
        this.hotspotIp = hotspotIp != null ? hotspotIp : "";
    }
}
```

### 2.3 MentraLiveSGC Posts EventBus Event

**Location**: Android Core - `MentraLiveSGC.java` (on phone)

Handle hotspot status messages and post EventBus event (following exact pattern of WiFi handling):

```java
// Add import for new event class
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHotspotStatusChange;

// In the message handling switch statement, add new case:
case "hotspot_status_update":
    // Process hotspot status information (same pattern as "wifi_status")
    boolean hotspotEnabled = json.optBoolean("hotspot_enabled", false);
    String hotspotSsid = json.optString("hotspot_ssid", "");
    String hotspotPassword = json.optString("hotspot_password", "");
    String hotspotIp = json.optString("hotspot_ip", "");

    Log.d(TAG, "## Received hotspot status: enabled=" + hotspotEnabled +
          ", SSID=" + hotspotSsid + ", IP=" + hotspotIp);

    // Post EventBus event (exactly like WiFi status)
    EventBus.getDefault().post(new GlassesHotspotStatusChange(
            smartGlassesDevice.deviceModelName,
            hotspotEnabled,
            hotspotSsid,
            hotspotPassword,
            hotspotIp));
    break;
```

### 2.4 AugmentosService Subscribes to EventBus Event

**Location**: Android Core - `AugmentosService.java` (on phone)

Add EventBus subscription and status integration (following exact pattern of WiFi):

```java
// Add import for new event class
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesHotspotStatusChange;

// Add hotspot state storage (similar to existing WiFi state variables)
private boolean glassesHotspotEnabled = false;
private String glassesHotspotSsid = "";
private String glassesHotspotPassword = "";
private String glassesHotspotIp = "";

// Add EventBus subscription method (exactly like onGlassesNeedWifiCredentialsEvent)
@Subscribe
public void onGlassesHotspotStatusChange(GlassesHotspotStatusChange event) {
    glassesHotspotEnabled = event.isHotspotEnabled;
    glassesHotspotSsid = event.hotspotSsid;
    glassesHotspotPassword = event.hotspotPassword;
    glassesHotspotIp = event.hotspotIp;

    Log.d(TAG, "Received GlassesHotspotStatusChange: device=" + event.deviceModel +
          ", enabled=" + event.isHotspotEnabled + ", ssid=" + event.hotspotSsid);

    // Send status update to mobile app (same as WiFi)
    sendStatusToAugmentOsManager();
}

// In generateStatusJson method where glasses info is being populated
if (usesWifi) {
    connectedGlasses.put("glasses_wifi_connected", glassesWifiConnected);
    connectedGlasses.put("glasses_wifi_ssid", glassesWifiSsid);
    connectedGlasses.put("glasses_wifi_local_ip", glassesWifiLocalIp);

    // NEW: Add stored hotspot status information
    connectedGlasses.put("glasses_hotspot_enabled", glassesHotspotEnabled);
    if (glassesHotspotEnabled) {
        connectedGlasses.put("glasses_hotspot_ssid", glassesHotspotSsid);
        connectedGlasses.put("glasses_hotspot_password", glassesHotspotPassword);
        connectedGlasses.put("glasses_hotspot_ip", glassesHotspotIp);
    }
}

// Reset hotspot state on disconnect (in disconnectWearable method)
// Add alongside existing WiFi reset:
glassesHotspotEnabled = false;
glassesHotspotSsid = "";
glassesHotspotPassword = "";
glassesHotspotIp = "";
```

### 2.4 Network Manager Interface Updates (ASG Client)

**Location**: `asg_client/app/src/main/java/com/augmentos/asg_client/io/network/interfaces/INetworkManager.java`

Add hotspot state getter methods:

```java
public interface INetworkManager {
    // ... existing methods ...

    /**
     * Check if the hotspot is currently enabled
     * @return true if hotspot is active, false otherwise
     */
    boolean isHotspotEnabled();

    /**
     * Get the SSID of the currently running hotspot
     * @return the hotspot SSID, or empty string if not active
     */
    String getHotspotSsid();

    /**
     * Get the password of the currently running hotspot
     * @return the hotspot password, or empty string if not active
     */
    String getHotspotPassword();
}
```

### 2.5 Implement in K900NetworkManager (ASG Client)

**Location**: `K900NetworkManager.java`

```java
private String currentHotspotSsid = "";
private String currentHotspotPassword = "";
private boolean hotspotActive = false;

@Override
public void startHotspot(String ssid, String password) {
    // ... existing implementation ...

    // Store current hotspot state
    this.currentHotspotSsid = ssid;
    this.currentHotspotPassword = password;
    this.hotspotActive = true;

    Log.d(TAG, "Hotspot started: " + ssid);
}

@Override
public void stopHotspot() {
    // ... existing implementation ...

    // Clear hotspot state
    this.currentHotspotSsid = "";
    this.currentHotspotPassword = "";
    this.hotspotActive = false;

    Log.d(TAG, "Hotspot stopped");
}

@Override
public boolean isHotspotEnabled() {
    return hotspotActive;
}

@Override
public String getHotspotSsid() {
    return currentHotspotSsid;
}

@Override
public String getHotspotPassword() {
    return currentHotspotPassword;
}
```

### Phase 3: React Native Gallery Integration (Status-Based)

#### 3.1 Direct Status Object Access (No Service Needed!)

**Location**: `mobile/src/app/asg/components/Gallery/GalleryScreen.tsx`

Access hotspot state directly from the existing status object:

```typescript
import {CoreCommunicator} from "@/bridge/CoreCommunicator"
import {Clipboard} from "react-native"

// Get hotspot state from existing status object (just like WiFi state)
const {status} = useCoreStatus()

// Access hotspot info from status - same pattern as glasses_wifi_*
const isHotspotEnabled = status.glasses_info?.glasses_hotspot_enabled
const hotspotSsid = status.glasses_info?.glasses_hotspot_ssid
const hotspotPassword = status.glasses_info?.glasses_hotspot_password
const hotspotIp = status.glasses_info?.glasses_hotspot_ip

// Send hotspot command using existing infrastructure
const handleRequestHotspot = async () => {
  setIsRequestingHotspot(true)
  try {
    // Use existing CoreCommunicator to send command
    CoreCommunicator.sendCommand("set_hotspot_state", {enabled: true})

    // Status will automatically update via existing polling - no special handling needed!
  } catch (error) {
    showAlert("Error", "Failed to start hotspot: " + error.message)
  } finally {
    setIsRequestingHotspot(false)
  }
}

// React to hotspot state changes via status updates
useEffect(() => {
  if (isHotspotEnabled && hotspotSsid && hotspotPassword) {
    // Show credentials dialog when hotspot becomes available
    showAlert(
      "Gallery Hotspot Started",
      `Connect your phone to this WiFi network:

SSID: ${hotspotSsid}
Password: ${hotspotPassword}

The gallery will automatically reload once connected.`,
      [
        {text: "Copy SSID", onPress: () => Clipboard.setString(hotspotSsid)},
        {text: "Copy Password", onPress: () => Clipboard.setString(hotspotPassword)},
        {text: "OK"},
      ],
    )

    // Update camera API to use hotspot IP
    if (hotspotIp) {
      asgCameraApi.setServer(hotspotIp, 8089)
      loadInitialPhotos()
    }
  }
}, [isHotspotEnabled, hotspotSsid, hotspotPassword, hotspotIp])

// Stop hotspot when leaving gallery
const handleStopHotspot = () => {
  CoreCommunicator.sendCommand("set_hotspot_state", {enabled: false})
}
```

#### 3.2 Gallery Screen Hotspot Integration

**Location**: `mobile/src/app/asg/components/Gallery/GalleryScreen.tsx`

```typescript
// Add hotspot service import
import {GalleryHotspotService} from "../../services/galleryHotspotService"

// Add hotspot state
const [isHotspotActive, setIsHotspotActive] = useState(false)
const [hotspotCredentials, setHotspotCredentials] = useState<HotspotCredentials | null>(null)
const [isRequestingHotspot, setIsRequestingHotspot] = useState(false)

// Add hotspot request function
const handleRequestHotspot = async () => {
  setIsRequestingHotspot(true)
  try {
    const credentials = await GalleryHotspotService.getInstance().requestHotspot()
    setHotspotCredentials(credentials)
    setIsHotspotActive(true)

    // Show credentials to user
    showHotspotCredentialsDialog(credentials)

    // Update camera API to use hotspot IP
    asgCameraApi.setServer(credentials.ip, 8089)

    // Reload gallery
    loadInitialPhotos()
  } catch (error) {
    showAlert("Hotspot Error", "Failed to start gallery hotspot: " + error.message, [{text: "OK"}])
  } finally {
    setIsRequestingHotspot(false)
  }
}

const showHotspotCredentialsDialog = (credentials: HotspotCredentials) => {
  showAlert(
    "Gallery Hotspot Started",
    `Connect your phone to this WiFi network:

SSID: ${credentials.ssid}
Password: ${credentials.password}

The gallery will automatically reload once connected.`,
    [
      {text: "Copy SSID", onPress: () => Clipboard.setString(credentials.ssid)},
      {text: "Copy Password", onPress: () => Clipboard.setString(credentials.password)},
      {text: "OK"},
    ],
  )
}

// Update gallery connection check
useEffect(() => {
  // Check connectivity immediately on mount
  checkConnectivity().then(() => {
    console.log("[GalleryScreen] Initial connectivity check complete")

    // If not connected and not on hotspot, suggest hotspot
    if (!isGalleryReachable && !isHotspotActive) {
      suggestHotspotFlow()
    }
  })
  loadInitialPhotos()
  loadDownloadedPhotos()
}, [isWifiConnected, glassesWifiIp])

const suggestHotspotFlow = () => {
  showAlert(
    "Gallery Not Accessible",
    "Your glasses are not on the same WiFi network. Would you like to start a hotspot for gallery access?",
    [
      {text: "Cancel", style: "cancel"},
      {text: "Start Hotspot", onPress: handleRequestHotspot},
    ],
  )
}
```

#### 3.3 Enhanced Network Connectivity Service

**Location**: `mobile/src/app/asg/services/networkConnectivityService.ts`

```typescript
// Add hotspot detection
export interface NetworkStatus {
  galleryReachable: boolean
  glassesOnWifi: boolean
  hotspotActive: boolean
  hotspotCredentials?: HotspotCredentials
}

// Update connectivity check to include hotspot status
export const useNetworkConnectivity = () => {
  const [hotspotStatus, setHotspotStatus] = useState<{
    active: boolean
    credentials?: HotspotCredentials
  }>({active: false})

  const checkConnectivity = async (): Promise<NetworkStatus> => {
    // ... existing connectivity checks ...

    const hotspotCredentials = GalleryHotspotService.getInstance().getCurrentCredentials()
    const hotspotActive = hotspotCredentials !== null

    return {
      galleryReachable: reachable,
      glassesOnWifi: wifiConnected,
      hotspotActive,
      hotspotCredentials,
    }
  }

  return {
    // ... existing returns ...
    hotspotStatus,
    checkConnectivity,
  }
}
```

### Phase 4: Auto-Connect Features (Phase 2)

#### 4.1 Android WiFi Auto-Connect

**Location**: `mobile/android/app/src/main/java/com/mentra/mentra/WiFiAutoConnectModule.java`

```java
@ReactModule(name = WiFiAutoConnectModule.NAME)
public class WiFiAutoConnectModule extends ReactContextBaseJavaModule {
    @ReactMethod
    public void connectToHotspot(String ssid, String password, Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Use WifiNetworkSuggestion API for Android 10+
            connectWithNetworkSuggestion(ssid, password, promise);
        } else {
            // Use legacy WifiConfiguration for older versions
            connectWithWifiConfiguration(ssid, password, promise);
        }
    }

    @TargetApi(Build.VERSION_CODES.Q)
    private void connectWithNetworkSuggestion(String ssid, String password, Promise promise) {
        WifiNetworkSuggestion suggestion = new WifiNetworkSuggestion.Builder()
            .setSsid(ssid)
            .setWpa2Passphrase(password)
            .setIsAppInteractionRequired(true)
            .build();

        List<WifiNetworkSuggestion> suggestionsList = Arrays.asList(suggestion);

        WifiManager wifiManager = (WifiManager) getReactApplicationContext()
            .getSystemService(Context.WIFI_SERVICE);

        int status = wifiManager.addNetworkSuggestions(suggestionsList);

        if (status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) {
            promise.resolve("Network suggestion added successfully");
        } else {
            promise.reject("SUGGESTION_FAILED", "Failed to add network suggestion");
        }
    }
}
```

#### 4.2 iOS WiFi Auto-Connect

**Location**: `mobile/ios/BleManager/WiFiAutoConnectManager.swift`

```swift
import NetworkExtension

@objc(WiFiAutoConnectManager)
class WiFiAutoConnectManager: NSObject {

    @objc func connectToHotspot(_ ssid: String, password: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {

        if #available(iOS 11.0, *) {
            let hotspotConfig = NEHotspotConfiguration(ssid: ssid, passphrase: password, isWEP: false)
            hotspotConfig.joinOnce = true

            NEHotspotConfigurationManager.shared.apply(hotspotConfig) { error in
                if let error = error {
                    rejecter("CONNECTION_FAILED", "Failed to connect to hotspot", error)
                } else {
                    resolver("Connected successfully")
                }
            }
        } else {
            rejecter("UNSUPPORTED", "Hotspot configuration not supported on this iOS version", nil)
        }
    }
}
```

### Phase 5: Gallery Lifecycle Management

#### 5.1 Automatic Hotspot Cleanup

**Location**: `mobile/src/app/asg/components/Gallery/GalleryScreen.tsx`

```typescript
// Add cleanup on component unmount
useEffect(() => {
  return () => {
    // Cleanup hotspot when leaving gallery
    if (isHotspotActive) {
      GalleryHotspotService.getInstance().stopHotspot()
    }
  }
}, [isHotspotActive])

// Add cleanup on app background
useEffect(() => {
  const subscription = AppState.addEventListener("change", nextAppState => {
    if (nextAppState === "background" && isHotspotActive) {
      // Stop hotspot when app goes to background
      GalleryHotspotService.getInstance().stopHotspot()
      setIsHotspotActive(false)
      setHotspotCredentials(null)
    }
  })

  return () => subscription?.remove()
}, [isHotspotActive])
```

#### 5.2 Connection State Management

**Location**: `mobile/src/app/asg/components/Gallery/GalleryScreen.tsx`

```typescript
// Enhanced connection monitoring
useEffect(() => {
  let interval: NodeJS.Timeout | null = null

  if (isHotspotActive && hotspotCredentials) {
    // Monitor connection to hotspot
    interval = setInterval(async () => {
      try {
        asgCameraApi.setServer(hotspotCredentials.ip, 8089)
        const reachable = await asgCameraApi.isServerReachable()

        if (reachable && !lastConnectionStatus) {
          // Connection restored via hotspot
          console.log("[GalleryScreen] Hotspot connection established")
          loadInitialPhotos()
          loadDownloadedPhotos()
          setLastConnectionStatus(true)
        }
      } catch (error) {
        console.log("[GalleryScreen] Hotspot connection check failed:", error)
      }
    }, 3000) // Check every 3 seconds
  }

  return () => {
    if (interval) {
      clearInterval(interval)
    }
  }
}, [isHotspotActive, hotspotCredentials])
```

## Security Considerations

### 1. Hotspot Security

- **Unique SSIDs**: Include device ID/timestamp to avoid conflicts
- **Strong Passwords**: Generate cryptographically secure passwords
- **Time Limits**: Auto-disable hotspot after inactivity
- **Access Control**: Only allow gallery access, not general internet

### 2. Network Isolation

- **Firewall Rules**: Only allow connections to camera server port (8089)
- **No Internet Bridging**: Hotspot doesn't provide internet access
- **Session Tokens**: Implement session-based authentication for gallery access

### 3. Privacy Protection

- **Temporary Networks**: Hotspot is ephemeral and removed after use
- **No Data Logging**: Don't log sensitive network information
- **User Consent**: Clear prompts before starting hotspot

## Updated Implementation Timeline

### Sprint 1 (Week 1): ASG Client and BLE Communication

- [ ] Add hotspot state getters to INetworkManager interface (ASG Client)
- [ ] Implement hotspot state tracking in K900NetworkManager (ASG Client)
- [ ] Enhance WifiCommandHandler to send hotspot status via BLE (ASG Client)
- [ ] Test BLE hotspot status messages are sent from glasses

### Sprint 2 (Week 2): Android Core Integration

- [ ] Add hotspot message handling in MentraLiveSGC (Android Core)
- [ ] Add hotspot state storage in AugmentosService (Android Core)
- [ ] Update generateStatusJson to include hotspot fields (Android Core)
- [ ] Test status object contains hotspot information from StatusProvider

### Sprint 3 (Week 3): Mobile Gallery Integration

- [ ] Update GalleryScreen to read hotspot state from status object
- [ ] Add hotspot request flow with credential display dialog
- [ ] Implement hotspot cleanup on gallery exit
- [ ] Test end-to-end flow: command → BLE → status → UI

### Sprint 4 (Week 4): Auto-Connect Features (Optional Phase 2)

- [ ] Implement NetworkSuggestions for Android auto-connect
- [ ] Implement NEHotspotConfiguration for iOS auto-connect
- [ ] Add user preference for auto-connect behavior
- [ ] Comprehensive testing and polish

## Testing Strategy

### Unit Tests

- BLE command handlers in ASG client
- Network manager hotspot functionality
- React Native service layer

### Integration Tests

- End-to-end BLE communication
- Hotspot startup and credential exchange
- Gallery connectivity after hotspot setup

### Device Testing

- Multiple Android devices (different API levels)
- Multiple iOS devices (different iOS versions)
- Different glasses models (K900, other supported devices)

### User Acceptance Testing

- Gallery access flow with non-technical users
- Connection reliability testing
- Battery impact assessment

## Success Criteria

### Functional Requirements

- [ ] Gallery accessible when not on same WiFi network
- [ ] Hotspot credentials displayed to user
- [ ] Automatic hotspot cleanup when leaving gallery
- [ ] Support for both Android and iOS

### Performance Requirements

- [ ] Hotspot startup within 10 seconds
- [ ] Gallery loads within 5 seconds after connection
- [ ] Minimal battery impact (< 5% additional drain)

### User Experience Requirements

- [ ] Clear user prompts and instructions
- [ ] Graceful handling of connection failures
- [ ] No permanent network configuration changes

## Risk Mitigation

### Technical Risks

- **BLE Communication Failures**: Implement retry logic and fallback modes
- **Hotspot API Changes**: Abstract network APIs with interface layer
- **Platform Compatibility**: Extensive testing across OS versions

### User Experience Risks

- **Complex Setup Flow**: Provide clear step-by-step instructions
- **Connection Confusion**: Clear indicators of connection state
- **Battery Drain**: Implement intelligent power management

### Security Risks

- **Unauthorized Access**: Implement strong authentication
- **Network Exposure**: Minimal attack surface with firewall rules
- **Credential Leakage**: Secure credential handling and cleanup

This implementation plan provides a comprehensive approach to adding hotspot functionality to the gallery system while maintaining security, performance, and user experience standards.
