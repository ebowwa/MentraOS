import {AppState} from "react-native"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {checkConnectivityRequirementsUI} from "@/utils/PermissionsUtils"
import {useEffect} from "react"

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
        // check if we have bluetooth perms in case they got removed:
        await checkConnectivityRequirementsUI()
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
