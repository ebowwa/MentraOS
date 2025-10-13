import {CoreStatus} from "@/utils/CoreStatusParser"
import {showAlert} from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"

/**
 * Camera App Protection Utility
 *
 * Centralized logic for protecting the Camera app from being stopped
 * when Mentra Live glasses are connected.
 */

/**
 * Check if Mentra Live glasses are currently connected
 */
export const isMentraLiveConnected = (status: CoreStatus): boolean => {
  const glassesModelName = status.glasses_info?.model_name
  return (
    glassesModelName?.toLowerCase().includes("mentra live") ||
    glassesModelName?.toLowerCase().includes("mentra_live") ||
    false
  )
}

/**
 * Check if the given package name is the Camera app
 */
export const isCameraApp = (packageName: string): boolean => {
  return packageName === "com.mentra.camera"
}

/**
 * Check if Camera app stop should be blocked
 */
export const shouldBlockCameraAppStop = (packageName: string, status: CoreStatus): boolean => {
  return isCameraApp(packageName) && isMentraLiveConnected(status)
}

/**
 * Show the Camera app protection alert
 */
export const showCameraAppProtectionAlert = (theme: ReturnType<typeof useAppTheme>["theme"]) => {
  console.log("🛡️ Camera app protection active - preventing stop during Mentra Live connection")

  showAlert(
    "Camera App Required",
    "The Camera app cannot be stopped while Mentra Live glasses are connected.",
    [{text: "OK"}],
    {
      iconName: "shield-check",
      iconColor: theme.colors.tint,
    },
  )
}

/**
 * Attempt to stop an app with Camera app protection
 * Returns true if the operation was blocked, false if it should proceed
 */
export const attemptAppStop = (
  packageName: string,
  status: CoreStatus,
  theme: ReturnType<typeof useAppTheme>["theme"],
): boolean => {
  if (shouldBlockCameraAppStop(packageName, status)) {
    showCameraAppProtectionAlert(theme)
    return true // Operation was blocked
  }
  return false // Operation should proceed
}
