import React, {createContext, useContext, useState, ReactNode, useCallback, useEffect} from "react"
import {Platform} from "react-native"
import {AugmentOSParser, AugmentOSMainStatus} from "@/utils/AugmentOSStatusParser"
import {INTENSE_LOGGING, MOCK_CONNECTION} from "@/consts"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import {useAuth} from "@/contexts/AuthContext"
import coreCommunicator from "@/bridge/CoreCommunicator"

import {deepCompare} from "@/utils/debugging"

interface AugmentOSStatusContextType {
  status: AugmentOSMainStatus
  initializeCoreConnection: () => void
  refreshStatus: (data: any) => void
  getCoreToken: () => string | null
}

const AugmentOSStatusContext = createContext<AugmentOSStatusContextType | undefined>(undefined)

let lastStatus: AugmentOSMainStatus = AugmentOSParser.defaultStatus

export const CoreStatusProvider = ({children}: {children: ReactNode}) => {
  const [status, setStatus] = useState<AugmentOSMainStatus>(() => {
    return AugmentOSParser.parseStatus({})
  })

  const refreshStatus = (data: any) => {
    if (!(data && "status" in data)) {
      return
    }

    const parsedStatus = AugmentOSParser.parseStatus(data)

    if (INTENSE_LOGGING) console.log("Parsed status:", parsedStatus)

    const diff = deepCompare(lastStatus, parsedStatus)
    if (diff.length === 0) {
      console.log("STATUS PROVIDER: Status did not change ###############################################")
      return
    }

    console.log("STATUS PROVIDER: Status changed:", diff)

    lastStatus = parsedStatus
    setStatus(parsedStatus)
  }

  // Initialize the Core communication
  const initializeCoreConnection = useCallback(() => {
    console.log("STATUS PROVIDER: Initializing core connection @@@@@@@@@@@@@@@@@")
    coreCommunicator.initialize()
  }, [])

  // Helper to get coreToken (directly returns from BackendServerComms)
  const getCoreToken = useCallback(() => {
    return BackendServerComms.getInstance().getCoreToken()
  }, [])

  const handleStatusUpdateReceived = (data: any) => {
    if (INTENSE_LOGGING) console.log("Handling received data.. refreshing status..")
    refreshStatus(data)
  }

  useEffect(() => {
    coreCommunicator.removeListener("statusUpdateReceived", handleStatusUpdateReceived)
    coreCommunicator.on("statusUpdateReceived", handleStatusUpdateReceived)
    return () => {
      coreCommunicator.removeListener("statusUpdateReceived", handleStatusUpdateReceived)
    }
  }, [])

  return (
    <AugmentOSStatusContext.Provider
      value={{
        initializeCoreConnection,
        status,
        refreshStatus,
        getCoreToken,
      }}>
      {children}
    </AugmentOSStatusContext.Provider>
  )
}

export const useCoreStatus = () => {
  const context = useContext(AugmentOSStatusContext)
  if (!context) {
    throw new Error("useStatus must be used within a StatusProvider")
  }
  return context
}
