import {AppletInterface} from "./AppletTypes"
import {hasCamera} from "@/config/glassesFeatures"

/**
 * Get theme-appropriate camera icon
 */
const getCameraIcon = (isDark: boolean) => {
  return isDark
    ? require("../../assets/icons/camera_dark_mode.png")
    : require("../../assets/icons/camera_light_mode.png")
}

/**
 * Offline Apps Configuration
 *
 * These are local React Native apps that don't require webviews or server communication.
 * They navigate directly to specific React Native routes when activated.
 */

/**
 * Get offline apps configuration with theme-aware icons
 */
export const getOfflineAppsConfig = (isDark: boolean): AppletInterface[] => [
  {
    packageName: "com.mentra.camera",
    name: "Camera",
    type: "standard", // Foreground app (only one at a time)
    isOffline: true, // Works without internet connection
    developerName: "Mentra",
    logoURL: getCameraIcon(isDark),
    permissions: [],
    offlineRoute: "/asg/gallery",
    is_running: false,
    loading: false,
    isOnline: true, // Always "online" for offline apps
    compatibility: {
      isCompatible: true,
      missingRequired: [],
      missingOptional: [],
      message: "",
    },
  },
]

// Legacy export for backward compatibility - defaults to light theme
export const OFFLINE_APPS: AppletInterface[] = getOfflineAppsConfig(false)

/**
 * Get all offline apps with dynamic compatibility based on connected glasses and theme
 */
export const getOfflineApps = (
  glassesModelName?: string | null,
  defaultWearable?: string | null,
  isDark?: boolean,
): AppletInterface[] => {
  const apps = getOfflineAppsConfig(isDark ?? false)
  return apps.map(app => {
    // Camera app requires camera-capable glasses to be connected
    if (app.packageName === "com.mentra.camera") {
      // Check camera capability - prioritize connected glasses, fallback to default wearable
      const wearableToCheck = glassesModelName || defaultWearable

      if (wearableToCheck) {
        const hasGlassesCamera = hasCamera(wearableToCheck)

        if (!hasGlassesCamera) {
          // Mark as incompatible if glasses don't have camera
          return {
            ...app,
            compatibility: {
              isCompatible: false,
              missingRequired: [{type: "camera", available: false}],
              missingOptional: [],
              message: `Camera app requires glasses with a camera. ${wearableToCheck} does not have a camera.`,
            },
          }
        }

        // Glasses have camera capability - compatible
        return app
      }

      // No glasses info available - show as incompatible
      return {
        ...app,
        compatibility: {
          isCompatible: false,
          missingRequired: [{type: "camera", available: false}],
          missingOptional: [],
          message: "Camera app requires glasses with a camera to be connected.",
        },
      }
    }

    return app
  })
}

/**
 * Get a specific offline app by package name with theme support
 */
export const getOfflineApp = (packageName: string, isDark?: boolean): AppletInterface | undefined => {
  const apps = getOfflineAppsConfig(isDark ?? false)
  return apps.find(app => app.packageName === packageName)
}
