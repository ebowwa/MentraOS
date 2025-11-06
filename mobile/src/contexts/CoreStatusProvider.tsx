import {INTENSE_LOGGING} from "@/utils/Constants"
import {CoreStatus, CoreStatusParser} from "@/utils/CoreStatusParser"
import {createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState} from "react"

import {deepCompare} from "@/utils/debug/debugging"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {getModelCapabilities} from "@/../../cloud/packages/types/src/hardware"
import {DeviceTypes} from "@/../../cloud/packages/types/src/enums"
import {useSettingsStore, SETTINGS_KEYS} from "@/stores/settings"
import CoreModule from "core"
import AsyncStorage from "@react-native-async-storage/async-storage"

interface CoreStatusContextType {
  status: CoreStatus
  refreshStatus: (data: any) => void
}

const CoreStatusContext = createContext<CoreStatusContextType | undefined>(undefined)

export const CoreStatusProvider = ({children}: {children: ReactNode}) => {
  const [status, setStatus] = useState<CoreStatus>(() => {
    return CoreStatusParser.parseStatus({})
  })
  const lastGlassesModel = useRef<string | null>(null)

  const refreshStatus = useCallback((data: any) => {
    if (!(data && "core_status" in data)) {
      return
    }

    const parsedStatus = CoreStatusParser.parseStatus(data)
    if (INTENSE_LOGGING) console.log("CoreStatus: status:", parsedStatus)

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

  // Auto-update mic source when glasses connect or change
  useEffect(() => {
    const updateMicSourceForGlasses = async () => {
      const currentModelName = status.glasses_info?.model_name || null

      // Check if glasses model changed or newly connected
      if (currentModelName !== lastGlassesModel.current) {
        console.log(`CoreStatus: Glasses model changed from ${lastGlassesModel.current} to ${currentModelName}`)
        lastGlassesModel.current = currentModelName

        if (currentModelName) {
          // Glasses connected - check if user has manually set mic source
          const storedMicPref = await AsyncStorage.getItem("preferred_mic")
          const userMicOverride = storedMicPref ? JSON.parse(storedMicPref) : null

          if (!userMicOverride || userMicOverride === "automatic") {
            // User hasn't manually selected or is on automatic - use recommended
            const capabilities = getModelCapabilities(currentModelName as DeviceTypes)
            const recommendedSource = capabilities.recommendedMicSource || "phone_auto_switch"

            console.log(`CoreStatus: Setting mic source to ${recommendedSource} for ${currentModelName}`)

            // Update local setting
            useSettingsStore.getState().setSetting(SETTINGS_KEYS.preferred_mic, recommendedSource)

            // Send to native
            CoreModule.updateSettings({
              preferred_mic: recommendedSource,
            })
          } else {
            console.log(`CoreStatus: User has manual mic selection: ${userMicOverride}, not overriding`)
          }
        }
      }
    }

    updateMicSourceForGlasses()
  }, [status.glasses_info?.model_name])

  useEffect(() => {
    const handleCoreStatusUpdate = (data: any) => {
      if (INTENSE_LOGGING) console.log("Handling received data.. refreshing status..")
      refreshStatus(data)
    }

    GlobalEventEmitter.on("CORE_STATUS_UPDATE", handleCoreStatusUpdate)
    return () => {
      GlobalEventEmitter.removeListener("CORE_STATUS_UPDATE", handleCoreStatusUpdate)
    }
  }, [refreshStatus])

  return (
    <CoreStatusContext.Provider
      value={{
        status,
        refreshStatus,
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
