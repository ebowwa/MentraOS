import React, {createContext, useContext, useState, ReactNode, useCallback, useEffect} from "react"
import {CoreStatusParser, CoreStatus} from "@/utils/CoreStatusParser"
import {INTENSE_LOGGING} from "@/consts"
import bridge from "@/bridge/MantleBridge"

import {deepCompare} from "@/utils/debugging"
import restComms from "@/managers/RestComms"
import {loadSetting, saveSetting, SETTINGS_KEYS} from "@/utils/SettingsHelper"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {useConnectionStore} from "@/stores/connection"
import {Platform} from "react-native"
import {WebSocketStatus} from "@/managers/WebSocketManager"

interface CoreStatusContextType {
  status: CoreStatus
  initializeCoreConnection: () => void
  refreshStatus: (data: any) => void
  getCoreToken: () => string | null
}

const CoreStatusContext = createContext<CoreStatusContextType | undefined>(undefined)

export const CoreStatusProvider = ({children}: {children: ReactNode}) => {
  const connectionStatus = useConnectionStore(state => state.status)

  const [status, setStatus] = useState<CoreStatus>(() => {
    return CoreStatusParser.parseStatus({})
  })

  const refreshStatus = useCallback((data: any) => {
    if (!(data && "status" in data)) {
      return
    }

    const parsedStatus = CoreStatusParser.parseStatus(data)
    if (INTENSE_LOGGING) console.log("CoreStatus: status:", parsedStatus)

    // TODO: config: remove
    if (Platform.OS === "android") {
      if (parsedStatus.core_info.cloud_connection_status === "CONNECTED") {
        const store = useConnectionStore.getState()
        store.setStatus(WebSocketStatus.CONNECTED)
      } else if (parsedStatus.core_info.cloud_connection_status === "DISCONNECTED") {
        const store = useConnectionStore.getState()
        store.setStatus(WebSocketStatus.DISCONNECTED)
      } else if (parsedStatus.core_info.cloud_connection_status === "CONNECTING") {
        const store = useConnectionStore.getState()
        store.setStatus(WebSocketStatus.CONNECTING)
      } else if (parsedStatus.core_info.cloud_connection_status === "ERROR") {
        const store = useConnectionStore.getState()
        store.setStatus(WebSocketStatus.ERROR)
      }
    }

    // only update the status if diff > 0
    setStatus(prevStatus => {
      const diff = deepCompare(prevStatus, parsedStatus)
      if (diff.length === 0) {
        console.log("CoreStatus: Status did not change")
        return prevStatus // don't re-render
      }

      console.log("CoreStatus: Status changed:", diff)
      return parsedStatus
    })
  }, [])

  // Initialize the Core communication
  const initializeCoreConnection = useCallback(() => {
    console.log("CoreStatus: Initializing core connection")
    bridge.initialize()
  }, [])

  // Helper to get coreToken (directly returns from RestComms)
  const getCoreToken = useCallback(() => {
    return restComms.getCoreToken()
  }, [])

  useEffect(() => {
    const handleCoreStatusUpdate = (data: any) => {
      if (INTENSE_LOGGING) console.log("Handling received data.. refreshing status..")
      refreshStatus(data)
    }

    GlobalEventEmitter.on("CORE_STATUS_UPDATE", handleCoreStatusUpdate)
    return () => {
      GlobalEventEmitter.removeListener("CORE_STATUS_UPDATE", handleCoreStatusUpdate)
    }
  }, [])

  return (
    <CoreStatusContext.Provider
      value={{
        initializeCoreConnection,
        status,
        refreshStatus,
        getCoreToken,
      }}>
      {children}
    </CoreStatusContext.Provider>
  )
}

export const useCoreStatus = () => {
  const context = useContext(CoreStatusContext)
  if (!context) {
    throw new Error("useStatus must be used within a StatusProvider")
  }
  return context
}
