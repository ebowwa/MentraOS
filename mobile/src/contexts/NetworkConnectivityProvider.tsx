import React, {createContext, useContext, useEffect, useState, ReactNode} from "react"
import {networkConnectivityService, NetworkStatus} from "@/services/asg/networkConnectivityService"
import {useCoreStatus} from "./CoreStatusProvider"

interface NetworkConnectivityContextType {
  networkStatus: NetworkStatus
  isGalleryReachable: boolean
  shouldShowWarning: () => boolean
  getStatusMessage: () => string
  checkConnectivity: () => Promise<NetworkStatus>
}

const NetworkConnectivityContext = createContext<NetworkConnectivityContextType | undefined>(undefined)

interface NetworkConnectivityProviderProps {
  children: ReactNode
}

export function NetworkConnectivityProvider({children}: NetworkConnectivityProviderProps) {
  const {status} = useCoreStatus()
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(networkConnectivityService.getStatus())

  // Get glasses WiFi info from status
  const glassesWifiIp = status.glasses_info?.glasses_wifi_local_ip
  const isWifiConnected = status.glasses_info?.glasses_wifi_connected
  const glassesWifiSSID = status.glasses_info?.glasses_wifi_ssid

  // Get glasses hotspot info from status
  const isHotspotEnabled = status.glasses_info?.glasses_hotspot_enabled
  const hotspotGatewayIp = status.glasses_info?.glasses_hotspot_gateway_ip
  const hotspotSSID = status.glasses_info?.glasses_hotspot_ssid

  // Determine the active IP - ONLY use hotspot gateway IP when phone is connected to hotspot
  // Never use local WiFi IP - we only support hotspot mode for gallery
  const phoneConnectedToHotspot = networkStatus.phoneSSID && hotspotSSID && networkStatus.phoneSSID === hotspotSSID

  // Only use hotspot IP when phone is actually connected to the hotspot
  const activeGlassesIp = phoneConnectedToHotspot && hotspotGatewayIp ? hotspotGatewayIp : undefined
  const activeConnection = phoneConnectedToHotspot
  const activeSSID = phoneConnectedToHotspot ? hotspotSSID : undefined

  // Initialize network monitoring
  useEffect(() => {
    console.log("[NetworkConnectivityProvider] Initializing network monitoring")
    console.log("[NetworkConnectivityProvider] Initial glasses info from status:", {
      isWifiConnected,
      glassesWifiSSID,
      glassesWifiIp,
      isHotspotEnabled,
      hotspotGatewayIp,
      hotspotSSID,
      activeConnection,
      activeGlassesIp,
      activeSSID,
    })

    // Initialize the service
    networkConnectivityService.initialize()

    // Subscribe to network changes
    const unsubscribe = networkConnectivityService.subscribe(status => {
      console.log("[NetworkConnectivityProvider] Network status updated:", status)
      setNetworkStatus(status)
    })

    // Set initial glasses status if available
    if (activeConnection !== undefined) {
      console.log("[NetworkConnectivityProvider] Setting initial glasses status")
      networkConnectivityService.updateGlassesStatus(activeConnection, activeSSID || null, activeGlassesIp || undefined)
    }

    // Cleanup
    return () => {
      console.log("[NetworkConnectivityProvider] Cleaning up network monitoring")
      unsubscribe()
      networkConnectivityService.destroy()
    }
  }, [])

  // Update glasses status when it changes
  useEffect(() => {
    console.log("[NetworkConnectivityProvider] Glasses status changed:", {
      isWifiConnected,
      glassesWifiSSID,
      glassesWifiIp,
      isHotspotEnabled,
      hotspotGatewayIp,
      hotspotSSID,
      activeConnection,
      activeGlassesIp,
      activeSSID,
    })

    if (activeConnection !== undefined) {
      networkConnectivityService.updateGlassesStatus(activeConnection, activeSSID || null, activeGlassesIp || undefined)
    }
  }, [activeConnection, activeSSID, activeGlassesIp])

  const value: NetworkConnectivityContextType = {
    networkStatus,
    isGalleryReachable: networkStatus.galleryReachable,
    shouldShowWarning: () => networkConnectivityService.shouldShowWarning(),
    getStatusMessage: () => networkConnectivityService.getStatusMessage(),
    checkConnectivity: () => networkConnectivityService.checkConnectivity(),
  }

  return <NetworkConnectivityContext.Provider value={value}>{children}</NetworkConnectivityContext.Provider>
}

export function useNetworkConnectivity() {
  const context = useContext(NetworkConnectivityContext)
  if (!context) {
    throw new Error("useNetworkConnectivity must be used within NetworkConnectivityProvider")
  }
  return context
}
