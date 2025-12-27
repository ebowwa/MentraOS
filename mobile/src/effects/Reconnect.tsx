import {DeviceTypes} from "@/../../cloud/packages/types/src"
import CoreModule from "core"
import {useEffect} from "react"
import {AppState} from "react-native"

import {SETTINGS, useSettingsStore} from "@/stores/settings"
import {checkConnectivityRequirementsUI} from "@/utils/PermissionsUtils"

export function Reconnect() {
  // Auto-connect to Meta glasses on app startup
  useEffect(() => {
    const autoConnectOnStartup = async () => {
      try {
        // Check if user has Meta glasses set as default wearable
        const defaultWearable = await useSettingsStore.getState().getSetting(SETTINGS.default_wearable.key)

        console.log("RECONNECT: 🔍 Auto-connect check - defaultWearable:", defaultWearable)
        console.log("RECONNECT: 🔍 DeviceTypes.META_RAYBAN:", DeviceTypes.META_RAYBAN)
        console.log("RECONNECT: 🔍 Includes check:", defaultWearable?.includes(DeviceTypes.META_RAYBAN))

        if (defaultWearable?.includes(DeviceTypes.META_RAYBAN)) {
          console.log("RECONNECT: ✅ Meta glasses detected as default, attempting auto-connect...")

          // Check Bluetooth/location permissions first
          const hasPermissions = await checkConnectivityRequirementsUI()
          if (!hasPermissions) {
            console.log("RECONNECT: ❌ Missing permissions for Meta glasses auto-connect")
            return
          }
          console.log("RECONNECT: ✅ Permissions granted, calling CoreModule.initializeDefault()...")

          // Initialize Meta glasses - SDK will auto-connect to registered glasses
          await CoreModule.initializeDefault()
          console.log("RECONNECT: ✅ initializeDefault() completed")
        } else {
          console.log("RECONNECT: ℹ️ No Meta glasses configured as default wearable")
        }
      } catch (error) {
        console.error("RECONNECT: ❌ Error during auto-connect:", error)
      }
    }

    // Run auto-connect on mount
    autoConnectOnStartup()
  }, [])

  // Add a listener for app state changes to detect when the app comes back from background
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: any) => {
      console.log("App state changed to:", nextAppState)
      // If app comes back to foreground, hide the loading overlay
      if (nextAppState === "active") {
        const reconnectOnAppForeground = await useSettingsStore
          .getState()
          .getSetting(SETTINGS.reconnect_on_app_foreground.key)
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
