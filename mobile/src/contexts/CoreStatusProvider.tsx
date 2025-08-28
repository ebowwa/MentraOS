import React, {createContext, useContext, useState, ReactNode, useCallback, useEffect} from "react"
import {Platform} from "react-native"
import {CoreStatusParser, CoreStatus} from "@/utils/CoreStatusParser"
import {INTENSE_LOGGING, MOCK_CONNECTION} from "@/consts"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import {useAuth} from "@/contexts/AuthContext"
import coreCommunicator from "@/bridge/CoreCommunicator"

import {deepCompare} from "@/utils/debugging"

interface CoreStatusContextType {
  status: CoreStatus
  initializeCoreConnection: () => void
  refreshStatus: (data: any) => void
  getCoreToken: () => string | null
}

const CoreStatusContext = createContext<CoreStatusContextType | undefined>(undefined)

let lastStatus: CoreStatus = CoreStatusParser.defaultStatus

export const CoreStatusProvider = ({children}: {children: ReactNode}) => {
  const [status, setStatus] = useState<CoreStatus>(() => {
    return CoreStatusParser.parseStatus({})
  })

  const refreshStatus = (data: any) => {
    if (!(data && "status" in data)) {
      return
    }

    const parsedStatus = CoreStatusParser.parseStatus(data)

    if (INTENSE_LOGGING) console.log("Parsed status:", parsedStatus)

    const diff = deepCompare(lastStatus, parsedStatus)
    if (diff.length === 0) {
      console.log("CoreStatusProvider: Status did not change ###############################################")
      return
    }

    console.log("CoreStatusProvider: Status changed:", diff)

    lastStatus = parsedStatus
    setStatus(parsedStatus)
  }

  // Initialize the Core communication
  const initializeCoreConnection = useCallback(() => {
    console.log("CoreStatusProvider: Initializing core connection @@@@@@@@@@@@@@@@@")
    coreCommunicator.initialize()
  }, [])

  // Helper to get coreToken (directly returns from BackendServerComms)
  const getCoreToken = useCallback(() => {
    return BackendServerComms.getInstance().getCoreToken()
  }, [])

  useEffect(() => {
    const handleStatusUpdateReceived = (data: any) => {
      if (INTENSE_LOGGING) console.log("Handling received data.. refreshing status..")
      refreshStatus(data)
    }

    coreCommunicator.removeListener("statusUpdateReceived", handleStatusUpdateReceived)
    coreCommunicator.on("statusUpdateReceived", handleStatusUpdateReceived)
    return () => {
      coreCommunicator.removeListener("statusUpdateReceived", handleStatusUpdateReceived)
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
