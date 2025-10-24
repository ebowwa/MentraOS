import {createContext, useContext, useEffect, ReactNode} from "react"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {useApplets, useStartApplet} from "@/stores/applets"

interface ButtonActionContextType {
  // Reserved for future extensions (e.g., custom button mappings)
}

const ButtonActionContext = createContext<ButtonActionContextType | undefined>(undefined)

export const ButtonActionProvider = ({children}: {children: ReactNode}) => {
  const applets = useApplets()
  const startApplet = useStartApplet()

  // Validate and update default button action app when device or applets change
  useEffect(() => {
    const validateAndSetDefaultApp = async () => {
      const currentDefaultApp = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_button_action_app)

      // Check if current default app is compatible
      const currentApp = applets.find(app => app.packageName === currentDefaultApp)
      const isCurrentAppCompatible = currentApp?.compatibility?.isCompatible !== false

      if (isCurrentAppCompatible && currentDefaultApp) {
        // Current app is fine, no change needed
        return
      }

      // Need to find a new default app
      // Prefer camera if available and compatible, otherwise first compatible standard app
      const cameraApp = applets.find(
        app => app.packageName === "com.mentra.camera" && app.compatibility?.isCompatible !== false,
      )

      const firstCompatibleApp = applets.find(
        app => app.type === "standard" && app.compatibility?.isCompatible !== false,
      )

      const newDefaultApp = cameraApp || firstCompatibleApp

      if (newDefaultApp) {
        console.log("🔘 Setting default button app to:", newDefaultApp.packageName)
        await useSettingsStore.getState().setSetting(SETTINGS_KEYS.default_button_action_app, newDefaultApp.packageName)
      }
    }

    validateAndSetDefaultApp()
  }, [applets]) // Run when applets change (which includes compatibility info)

  // Listen for button press events from glasses
  useEffect(() => {
    const onButtonPress = async (event: {buttonId: string; pressType: string; timestamp: number}) => {
      console.log("🔘 BUTTON_PRESS event in ButtonActionProvider:", event)

      // For V1: Handle short+long button presses the same.
      // Later, we'll differentiate actions based on pressType and have a fancy button configuration system for it.
      // if (event.pressType !== "short") {
      //   console.log("🔘 Ignoring non-short press:", event.pressType)
      //   return
      // }

      // Check if default button action is enabled
      const defaultButtonActionEnabled = await useSettingsStore
        .getState()
        .getSetting(SETTINGS_KEYS.default_button_action_enabled)

      if (!defaultButtonActionEnabled) {
        console.log("🔘 Default button action is disabled")
        return
      }

      // Check if any foreground app is running
      const activeForegroundApp = applets.find(app => app.type === "standard" && app.running)

      if (activeForegroundApp) {
        console.log(
          "🔘 Foreground app is running - button event already sent to server for app:",
          activeForegroundApp.name,
        )
        return
      }

      // No foreground app running - start default app
      const defaultAppPackageName = await useSettingsStore
        .getState()
        .getSetting(SETTINGS_KEYS.default_button_action_app)

      if (!defaultAppPackageName) {
        console.log("🔘 No default app configured")
        return
      }

      // Validate app compatibility before starting
      const targetApp = applets.find(app => app.packageName === defaultAppPackageName)
      if (!targetApp) {
        console.log("🔘 Default app not found:", defaultAppPackageName)
        return
      }

      if (targetApp.compatibility?.isCompatible === false) {
        console.log("🔘 Default app is incompatible with current device:", defaultAppPackageName)
        return
      }

      console.log("🔘 Starting default app:", defaultAppPackageName)
      startApplet(defaultAppPackageName)
    }

    GlobalEventEmitter.on("BUTTON_PRESS", onButtonPress)
    return () => {
      GlobalEventEmitter.removeListener("BUTTON_PRESS", onButtonPress)
    }
  }, [applets, startApplet])

  return <ButtonActionContext.Provider value={{}}>{children}</ButtonActionContext.Provider>
}

export const useButtonAction = () => {
  const context = useContext(ButtonActionContext)
  if (context === undefined) {
    throw new Error("useButtonAction must be used within a ButtonActionProvider")
  }
  return context
}
