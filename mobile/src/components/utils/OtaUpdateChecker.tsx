import {useEffect, useState} from "react"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import showAlert from "@/utils/AlertUtils"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {Capabilities, getModelCapabilities} from "../../../../cloud/packages/types/src"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

interface VersionInfo {
  versionCode: number
  versionName: string
  downloadUrl: string
  apkSize: number
  sha256: string
  releaseNotes: string
}

interface VersionJson {
  apps?: {
    [packageName: string]: VersionInfo
  }
  // Legacy format support
  versionCode?: number
  versionName?: string
  downloadUrl?: string
  apkSize?: number
  sha256?: string
  releaseNotes?: string
}

export async function fetchVersionInfo(url: string): Promise<VersionJson | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.error("Failed to fetch version info:", response.status)
      return null
    }
    return await response.json()
  } catch (error) {
    console.error("Error fetching version info:", error)
    return null
  }
}

export function isUpdateAvailable(currentBuildNumber: string | undefined, versionJson: VersionJson | null): boolean {
  if (!currentBuildNumber || !versionJson) {
    return false
  }

  const currentVersion = parseInt(currentBuildNumber, 10)
  if (isNaN(currentVersion)) {
    return false
  }

  let serverVersion: number | undefined

  // Check new format first
  if (versionJson.apps?.["com.augmentos.asg_client"]) {
    serverVersion = versionJson.apps["com.augmentos.asg_client"].versionCode
  } else if (versionJson.versionCode) {
    // Legacy format
    serverVersion = versionJson.versionCode
  }

  if (!serverVersion || isNaN(serverVersion)) {
    return false
  }

  return serverVersion > currentVersion
}

export function getLatestVersionInfo(versionJson: VersionJson | null): VersionInfo | null {
  if (!versionJson) {
    return null
  }

  // Check new format first
  if (versionJson.apps?.["com.augmentos.asg_client"]) {
    return versionJson.apps["com.augmentos.asg_client"]
  }

  // Legacy format
  if (versionJson.versionCode) {
    return {
      versionCode: versionJson.versionCode,
      versionName: versionJson.versionName || "",
      downloadUrl: versionJson.downloadUrl || "",
      apkSize: versionJson.apkSize || 0,
      sha256: versionJson.sha256 || "",
      releaseNotes: versionJson.releaseNotes || "",
    }
  }

  return null
}

export function OtaUpdateChecker() {
  const {status} = useCoreStatus()
  const [isChecking, setIsChecking] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const [_latestVersion, setLatestVersion] = useState<string | null>(null)
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
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

      const features: Capabilities = getModelCapabilities(defaultWearable)
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
      let checkCompleted = false
      try {
        const versionJson = await fetchVersionInfo(otaVersionUrl)
        checkCompleted = true
        if (isUpdateAvailable(currentBuildNumber, versionJson)) {
          const latestVersionInfo = getLatestVersionInfo(versionJson)
          setLatestVersion(latestVersionInfo?.versionName || null)

          showAlert(
            "Update Available",
            `An update for your glasses is available (v${
              latestVersionInfo?.versionCode || "Unknown"
            }).\n\nConnect your glasses to WiFi to automatically install the update.`,
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
        checkCompleted = true
      } finally {
        setIsChecking(false)
        if (checkCompleted) {
          setHasChecked(true)
        }
      }
    }
    checkForOtaUpdate()
  }, [glassesModel, otaVersionUrl, currentBuildNumber, glassesWifiConnected, hasChecked, isChecking])

  return null
}
