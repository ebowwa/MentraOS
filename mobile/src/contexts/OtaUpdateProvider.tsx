import React, {createContext, useContext, useEffect, useState, ReactNode} from "react"
import {Alert} from "react-native"
import {useRouter} from "expo-router"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {fetchVersionInfo, isUpdateAvailable, getLatestVersionInfo} from "@/utils/otaVersionChecker"
import {glassesFeatures} from "@/config/glassesFeatures"
import showAlert from "@/utils/AlertUtils"

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

export function OtaUpdateProvider({children}: {children: ReactNode}) {
  const {status} = useCoreStatus()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [hasUpdate, setHasUpdate] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  useEffect(() => {
    // Only check for glasses that support WiFi self OTA updates
    if (!status.glasses_info || hasChecked || isChecking) {
      return
    }

    const glassesModel = status.glasses_info.model_name
    if (!glassesModel) {
      return
    }

    const features = glassesFeatures[glassesModel]
    if (!features || !features.wifiSelfOtaUpdate) {
      console.log(`Skipping OTA check for ${glassesModel} - does not support WiFi self OTA updates`)
      return
    }

    // Skip if already connected to WiFi
    if (status.glasses_info.glasses_wifi_connected) {
      console.log(`Skipping ASG OTA CHECK, already on wifi`)
      return
    }

    const otaVersionUrl = status.glasses_info.glasses_ota_version_url
    const currentBuildNumber = status.glasses_info.glasses_build_number
    console.log(`OTA VERSION URL: ${otaVersionUrl}, currentBuildNumber: ${currentBuildNumber}`)
    if (!otaVersionUrl || !currentBuildNumber) {
      console.log(
        `Skipping wifi ota check- one is null: OTA VERSION URL: ${otaVersionUrl}, currentBuildNumber: ${currentBuildNumber}`,
      )
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

          showAlert(
            "Update Available",
            `An update for your glasses is available (v${latestVersionInfo?.versionCode || "Unknown"}).\n\nConnect your glasses to WiFi to automatically install the update.`,
            [
              {
                text: "Later",
                style: "cancel",
              },
              {
                text: "Setup WiFi",
                onPress: () => {
                  router.push("/pairing/glasseswifisetup")
                },
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
