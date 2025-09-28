import {useEffect, useState} from "react"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {fetchVersionInfo, isUpdateAvailable, getLatestVersionInfo} from "@/utils/otaVersionChecker"
import {glassesFeatures} from "@/config/glassesFeatures"
import showAlert from "@/utils/AlertUtils"

export function OtaUpdateChecker() {
  const {status} = useCoreStatus()
  const [isChecking, setIsChecking] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [_latestVersion, setLatestVersion] = useState<string | null>(null)
  const {push} = useNavigationHistory()

  // Extract only the specific values we need to watch to avoid re-renders
  const glassesModel = status.glasses_info?.model_name
  const otaVersionUrl = status.glasses_info?.glasses_ota_version_url
  const currentBuildNumber = status.glasses_info?.glasses_build_number
  const glassesWifiConnected = status.glasses_info?.glasses_wifi_connected

  useEffect(() => {
    const checkForOtaUpdate = async () => {
      // Only check for glasses that support WiFi self OTA updates
      if (!glassesModel || hasChecked || isChecking) {
        return
      }

      const features = glassesFeatures[glassesModel]
      if (!features || !features.wifiSelfOtaUpdate) {
        // Remove console log to reduce spam
        return
      }

      // Skip if already connected to WiFi
      if (glassesWifiConnected) {
        // Remove console log to reduce spam
        return
      }

      if (!otaVersionUrl || !currentBuildNumber) {
        // Remove console log to reduce spam
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
                  push("/pairing/glasseswifisetup")
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
  }, [glassesModel, otaVersionUrl, currentBuildNumber, glassesWifiConnected, hasChecked, isChecking, router])

  return null
}

import bridge from "@/bridge/MantleBridge"
import {AppState} from "react-native"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export function Reconnect() {
  // Add a listener for app state changes to detect when the app comes back from background
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: any) => {
      console.log("App state changed to:", nextAppState)
      // If app comes back to foreground, hide the loading overlay
      if (nextAppState === "active") {
        const reconnectOnAppForeground = await useSettingsStore
          .getState()
          .getSetting(SETTINGS_KEYS.reconnect_on_app_foreground)
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
