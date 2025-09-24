import {useEffect, useState, ReactNode} from "react"
import {useRouter} from "expo-router"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {fetchVersionInfo, isUpdateAvailable, getLatestVersionInfo} from "@/utils/otaVersionChecker"
import {glassesFeatures} from "@/config/glassesFeatures"
import showAlert from "@/utils/AlertUtils"

export function OtaUpdateChecker() {
  const {status} = useCoreStatus()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  useEffect(() => {
    const checkForOtaUpdate = async () => {
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
      try {
        const versionJson = await fetchVersionInfo(otaVersionUrl)
        if (isUpdateAvailable(currentBuildNumber, versionJson)) {
          const latestVersionInfo = getLatestVersionInfo(versionJson)
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
          setHasChecked(true)
        }
      } catch (error) {
        console.error("Error checking for OTA update:", error)
      } finally {
        setIsChecking(false)
      }
    }
    checkForOtaUpdate()
  }, [status.glasses_info, hasChecked, isChecking, router])

  return null
}

import bridge from "@/bridge/MantleBridge"
import {AppState} from "react-native"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"

export function Reconnect() {
  // Add a listener for app state changes to detect when the app comes back from background
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: any) => {
      console.log("App state changed to:", nextAppState)
      // If app comes back to foreground, hide the loading overlay
      if (nextAppState === "active") {
        const reconnectOnAppForeground = await useSettingsStore
          .getState()
          .getSetting(SETTINGS_KEYS.RECONNECT_ON_APP_FOREGROUND)
        if (!reconnectOnAppForeground) {
          return
        }
        let defaultWearable = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_wearable)
        let deviceName = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.device_name)
        console.log("Attempt reconnect to glasses", defaultWearable, deviceName)
        await bridge.sendConnectWearable(defaultWearable, deviceName)
      }
    }

    // Subscribe to app state changes
    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

    return () => {
      appStateSubscription.remove()
    }
  }, []) // subscribe only once

  return null
}
