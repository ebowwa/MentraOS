import React, {createContext, useContext, useEffect, useState, ReactNode} from "react"
import {networkConnectivityService, NetworkStatus} from "@/app/asg/services/networkConnectivityService"
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

  // Initialize network monitoring
  useEffect(() => {
    console.log("[NetworkConnectivityProvider] Initializing network monitoring")
    console.log("[NetworkConnectivityProvider] Initial glasses info from status:", {
      isWifiConnected,
      glassesWifiSSID,
      glassesWifiIp,
    })

    // Initialize the service
    networkConnectivityService.initialize()

    // Subscribe to network changes
    const unsubscribe = networkConnectivityService.subscribe(status => {
      console.log("[NetworkConnectivityProvider] Network status updated:", status)
      setNetworkStatus(status)
    })

    // Set initial glasses status if available
    if (isWifiConnected !== undefined) {
      console.log("[NetworkConnectivityProvider] Setting initial glasses status")
      networkConnectivityService.updateGlassesStatus(
        isWifiConnected,
        glassesWifiSSID || null,
        glassesWifiIp || undefined,
      )
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
    })

    if (isWifiConnected !== undefined) {
      networkConnectivityService.updateGlassesStatus(
        isWifiConnected,
        glassesWifiSSID || null,
        glassesWifiIp || undefined,
      )
    }
  }, [isWifiConnected, glassesWifiSSID, glassesWifiIp])

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
