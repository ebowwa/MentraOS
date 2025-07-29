import React, {createContext, useContext, useEffect, useState, ReactNode} from "react"
import {Alert} from "react-native"
import {useRouter} from "expo-router"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {fetchVersionInfo, isUpdateAvailable, getLatestVersionInfo} from "@/utils/otaVersionChecker"

interface OtaUpdateContextType {
  isChecking: boolean
  hasUpdate: boolean
  latestVersion: string | null
}

const OtaUpdateContext = createContext<OtaUpdateContextType>({
  isChecking: false,
  hasUpdate: false,
  latestVersion: null,
})

export const useOtaUpdate = () => useContext(OtaUpdateContext)

export function OtaUpdateProvider({children}: {children: ReactNode}) {
  const {status} = useStatus()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  useEffect(() => {
    // Only check for Mentra Live glasses
    if (!status.glasses_info || !status.glasses_info.model_name?.includes("Mentra Live") || hasChecked || isChecking) {
      return
    }

    // Skip if already connected to WiFi
    if (status.glasses_info.glasses_wifi_connected) {
      return
    }

    const otaVersionUrl = status.glasses_info.glasses_ota_version_url
    const currentBuildNumber = status.glasses_info.glasses_build_number

    if (!otaVersionUrl || !currentBuildNumber) {
      return
    }

    // Check for updates
    setIsChecking(true)
    fetchVersionInfo(otaVersionUrl)
      .then(versionJson => {
        if (isUpdateAvailable(currentBuildNumber, versionJson)) {
          const latestVersionInfo = getLatestVersionInfo(versionJson)
          setHasUpdate(true)
          setLatestVersion(latestVersionInfo?.versionName || null)

          Alert.alert(
            "Update Available",
            `A new version of Mentra Live firmware (v${latestVersionInfo?.versionName || "Unknown"}) is available. Connect your glasses to WiFi to automatically install the update.`,
            [
              {
                text: "Setup WiFi",
                onPress: () => {
                  router.push("/pairing/glasseswifisetup")
                },
              },
              {
                text: "Later",
                style: "cancel",
              },
            ],
          )
        }
        setHasChecked(true)
      })
      .catch(error => {
        console.error("Error checking for OTA update:", error)
      })
      .finally(() => {
        setIsChecking(false)
      })
  }, [status.glasses_info, hasChecked, isChecking, router])

  return (
    <OtaUpdateContext.Provider value={{isChecking, hasUpdate, latestVersion}}>{children}</OtaUpdateContext.Provider>
  )
}
