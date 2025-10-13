import {createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef, useMemo} from "react"
import {useAuth} from "@/contexts/AuthContext"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {deepCompare} from "@/utils/debugging"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"
import restComms from "@/managers/RestComms"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {AppletInterface} from "@/types/AppletTypes"
import {getOfflineApps} from "@/types/OfflineApps"
import {isOfflineApp} from "@/types/AppletTypes"
import bridge from "@/bridge/MantleBridge"
import {hasCamera} from "@/config/glassesFeatures"
// Camera app protection removed - now handled by default button action system

interface AppStatusContextType {
  appStatus: AppletInterface[]
  renderableApps: AppletInterface[]
  refreshAppStatus: () => Promise<void>
  optimisticallyStartApp: (packageName: string, appType?: string) => void
  optimisticallyStopApp: (packageName: string) => void
  stopAllApps: () => Promise<void>
  clearPendingOperation: (packageName: string) => void
}

const AppStatusContext = createContext<AppStatusContextType | undefined>(undefined)

export const AppStatusProvider = ({children}: {children: ReactNode}) => {
  const [appStatus, setAppStatus] = useState<AppletInterface[]>([])
  const {user} = useAuth()
  const {theme, themeContext} = useAppTheme()
  const {status} = useCoreStatus()

  // Keep track of active operations to prevent race conditions
  const pendingOperations = useRef<{[packageName: string]: "start" | "stop"}>({})
  // Keep track of refresh timeouts to cancel them
  const refreshTimeouts = useRef<{[packageName: string]: NodeJS.Timeout}>({})

  const refreshAppStatus = useCallback(async () => {
    console.log("AppStatusProvider: refreshAppStatus called - user exists:", !!user, "user email:", user?.email)
    if (!user) {
      console.log("AppStatusProvider: No user, clearing app status")
      return Promise.resolve()
    }

    // Check if we have a core token from RestComms
    const coreToken = restComms.getCoreToken()
    console.log(
      "AppStatusProvider: Core token check - token exists:",
      !!coreToken,
      "token length:",
      coreToken?.length || 0,
    )
    if (!coreToken) {
      console.log("Waiting for core token before fetching apps")
      return Promise.resolve()
    }

    try {
      const appsData = await restComms.getApps()

      // Load camera app state from AsyncStorage ONCE before mapping
      const savedCameraAppState = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.camera_app_running)

      // Merge existing running states with new data
      const mapped = appsData.map(app => {
        // shallow incomplete copy, just enough to render the list:
        const applet: AppletInterface = {
          // @ts-ignore
          type: app.type || app["appType"],
          developerName: app.developerName,
          packageName: app.packageName,
          name: app.name,
          publicUrl: app.publicUrl,
          logoURL: app.logoURL,
          permissions: app.permissions,
          webviewURL: app.webviewURL,
          is_running: app.is_running,
          loading: false,
          // @ts-ignore include server-provided latest status if present
          isOnline: (app as any).isOnline,
          // @ts-ignore include compatibility info from backend
          compatibility: (app as any).compatibility,
        }

        return applet
      })

      // Get default wearable setting for compatibility check
      const defaultWearable = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_wearable)

      setAppStatus(currentAppStatus => {
        // Add offline apps to the beginning of the list (with compatibility check)
        const offlineApps = getOfflineApps(status.glasses_info?.model_name, defaultWearable, themeContext === "dark")

        const appsWithOffline = [...offlineApps, ...mapped]

        // Preserve running state from current appStatus for offline apps
        const offlineAppsWithState = appsWithOffline.map(app => {
          // Check if this is an offline app
          if (isOfflineApp(app)) {
            // Find existing state for this offline app
            const existingApp = currentAppStatus.find((a: AppletInterface) => a.packageName === app.packageName)

            // Preserve is_running and loading state if app was already in state
            if (existingApp) {
              const updatedApp = {
                ...app,
                is_running: existingApp.is_running,
                loading: existingApp.loading,
              }

              // Special logic for camera app: if it's running, override compatibility to be compatible
              if (app.packageName === "com.mentra.camera" && existingApp.is_running) {
                updatedApp.compatibility = {
                  isCompatible: true,
                  missingRequired: [],
                  missingOptional: [],
                  message: "",
                }
              }

              return updatedApp
            }

            // No existing state - restore from AsyncStorage for camera app
            if (app.packageName === "com.mentra.camera") {
              const restoredApp = {
                ...app,
                is_running: savedCameraAppState ?? false,
                loading: false,
              }

              // If camera app is running, check if we have camera-capable glasses (connected or default)
              if (savedCameraAppState) {
                const wearableToCheck = status.glasses_info?.model_name || defaultWearable
                const hasGlassesCamera = hasCamera(wearableToCheck)

                if (hasGlassesCamera) {
                  // Override compatibility to be compatible
                  restoredApp.compatibility = {
                    isCompatible: true,
                    missingRequired: [],
                    missingOptional: [],
                    message: "",
                  }
                } else {
                  restoredApp.is_running = false
                  // Update AsyncStorage to reflect the stopped state
                  useSettingsStore.getState().setSetting(SETTINGS_KEYS.camera_app_running, false)
                }
              }

              return restoredApp
            }
          }

          // Not an offline app or no existing state, return as-is
          return app
        })

        const diff = deepCompare(currentAppStatus, offlineAppsWithState)
        if (diff.length === 0) {
          console.log("AppStatusProvider: Applet status did not change")
          //console.log(JSON.stringify(currentAppStatus, null, 2));
          return currentAppStatus
        }
        return offlineAppsWithState
      })
    } catch (err) {
      console.error("AppStatusProvider: Error fetching apps:", err)
    }
  }, [user, themeContext])

  // Optimistically update app status when starting an app
  const optimisticallyStartApp = async (packageName: string, appType?: string) => {
    // Find the app to check if it's offline
    const app = appStatus.find(a => a.packageName === packageName)

    // Check if this is an offline app first
    if (app && isOfflineApp(app)) {
      console.log("Starting offline app:", packageName)
      setAppStatus(currentStatus =>
        currentStatus.map(app => (app.packageName === packageName ? {...app, is_running: true, loading: false} : app)),
      )

      // Persist camera app state to AsyncStorage
      if (packageName === "com.mentra.camera") {
        await useSettingsStore.getState().setSetting(SETTINGS_KEYS.camera_app_running, true)
        console.log("Camera app state persisted to AsyncStorage: true")
      }

      return
    }

    // Cancel any pending stop operation for this app
    if (pendingOperations.current[packageName] === "stop") {
      delete pendingOperations.current[packageName]
      // Cancel refresh timeout too
      if (refreshTimeouts.current[packageName]) {
        clearTimeout(refreshTimeouts.current[packageName])
        delete refreshTimeouts.current[packageName]
      }
    }
    // Record that we have a pending start operation
    pendingOperations.current[packageName] = "start"
    // Handle foreground apps
    if (appType === "standard") {
      const runningStandardApps = appStatus.filter(
        app => app.is_running && app.type === "standard" && app.packageName !== packageName,
      )

      for (const runningApp of runningStandardApps) {
        optimisticallyStopApp(runningApp.packageName)
        // Skip offline apps - they don't need server communication
        if (isOfflineApp(runningApp)) {
          console.log("Skipping offline app in foreground switch:", runningApp.packageName)
          clearPendingOperation(runningApp.packageName)
          continue
        }
        try {
          restComms.stopApp(runningApp.packageName)
          clearPendingOperation(runningApp.packageName)
        } catch (error) {
          console.error("Stop app error:", error)
          refreshAppStatus()
        }
      }
    }

    // check if using new UI:
    const usingNewUI = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.new_ui)

    setAppStatus(currentStatus => {
      // Update the app to be running immediately in new UI
      if (!usingNewUI) {
        return currentStatus.map(app => (app.packageName === packageName ? {...app, is_running: true} : app))
      }
      // In new UI, set running immediately with subtle loading indicator
      return currentStatus.map(app =>
        app.packageName === packageName ? {...app, is_running: true, loading: true} : app,
      )
    })

    // actually start the app:
    {
      try {
        await restComms.startApp(packageName)
        clearPendingOperation(packageName)
        await useSettingsStore.getState().setSetting(SETTINGS_KEYS.has_ever_activated_app, true)
        // Clear loading state immediately after successful start
        setAppStatus(currentStatus =>
          currentStatus.map(app => (app.packageName === packageName ? {...app, loading: false} : app)),
        )
      } catch (error: any) {
        console.error("Start app error:", error)

        if (error?.response?.data?.error?.stage === "HARDWARE_CHECK") {
          showAlert(
            translate("home:hardwareIncompatible"),
            error.response.data.error.message ||
              translate("home:hardwareIncompatibleMessage", {
                app: packageName,
                missing: "required hardware",
              }),
            [{text: translate("common:ok")}],
            {
              iconName: "alert-circle-outline",
              iconColor: theme.colors.error,
            },
          )
        }

        clearPendingOperation(packageName)
        refreshAppStatus()
      }
    }

    // Cancel any existing refresh timeout for this app
    if (refreshTimeouts.current[packageName]) {
      clearTimeout(refreshTimeouts.current[packageName])
    }
    // Refresh app status quickly
    refreshTimeouts.current[packageName] = setTimeout(() => {
      delete refreshTimeouts.current[packageName]
      refreshAppStatus()
    }, 500)
  }

  // Stop all running apps
  const stopAllApps = async () => {
    try {
      const runningApps = appStatus.filter(app => app.is_running)

      for (const app of runningApps) {
        // Skip offline apps - they don't need server communication
        if (isOfflineApp(app)) {
          console.log("Skipping offline app in stopAllApps:", app.packageName)
          continue
        }
        await restComms.stopApp(app.packageName)
      }

      // Update local state to reflect all apps are stopped
      setAppStatus(currentStatus => currentStatus.map(app => (app.is_running ? {...app, is_running: false} : app)))
    } catch (error) {
      console.error("Error stopping all apps:", error)
      throw error
    }
  }

  // Optimistically update app status when stopping an app
  const optimisticallyStopApp = async (packageName: string) => {
    // Find the app to check if it's offline
    const app = appStatus.find(a => a.packageName === packageName)

    // Check if this is an offline app first
    if (app && isOfflineApp(app)) {
      console.log("Stopping offline app:", packageName)

      setAppStatus(currentStatus =>
        currentStatus.map(app => (app.packageName === packageName ? {...app, is_running: false, loading: false} : app)),
      )

      // Persist camera app state to AsyncStorage
      if (packageName === "com.mentra.camera") {
        await useSettingsStore.getState().setSetting(SETTINGS_KEYS.camera_app_running, false)
        console.log("Camera app state persisted to AsyncStorage: false")
      }

      return
    }

    // Cancel any pending start operation for this app
    if (pendingOperations.current[packageName] === "start") {
      delete pendingOperations.current[packageName]
      // Cancel refresh timeout too
      if (refreshTimeouts.current[packageName]) {
        clearTimeout(refreshTimeouts.current[packageName])
        delete refreshTimeouts.current[packageName]
      }
    }
    // optimistically stop the app:
    {
      // Record that we have a pending stop operation
      pendingOperations.current[packageName] = "stop"

      // Set a timeout to clear this operation after 10 seconds
      setTimeout(() => {
        if (pendingOperations.current[packageName] === "stop") {
          delete pendingOperations.current[packageName]
        }
      }, 10000)

      setAppStatus(currentStatus =>
        currentStatus.map(app => (app.packageName === packageName ? {...app, is_running: false, loading: false} : app)),
      )
    }

    // actually stop the app:
    {
      try {
        await restComms.stopApp(packageName)
        clearPendingOperation(packageName)
        // Clear loading state immediately after successful stop
        setAppStatus(currentStatus =>
          currentStatus.map(app => (app.packageName === packageName ? {...app, loading: false} : app)),
        )
      } catch (error) {
        refreshAppStatus()
        console.error("Stop app error:", error)
      }
    }

    // Cancel any existing refresh timeout for this app
    if (refreshTimeouts.current[packageName]) {
      clearTimeout(refreshTimeouts.current[packageName])
    }
    // Refresh app status quickly
    refreshTimeouts.current[packageName] = setTimeout(() => {
      delete refreshTimeouts.current[packageName]
      refreshAppStatus()
    }, 500)
  }

  // When an app start/stop operation succeeds, clear the pending operation
  const clearPendingOperation = (packageName: string) => {
    delete pendingOperations.current[packageName]
  }

  const onAppStateChange = () => {
    // console.log("APP_STATE_CHANGE event received, forcing app refresh")
    refreshAppStatus()
  }

  // Listen for app started/stopped events from bridge
  useEffect(() => {
    // @ts-ignore
    GlobalEventEmitter.on("APP_STATE_CHANGE", onAppStateChange)
    return () => {
      // @ts-ignore
      GlobalEventEmitter.off("APP_STATE_CHANGE", onAppStateChange)
    }
  }, [])

  // Listen for button press events from glasses
  useEffect(() => {
    const onButtonPress = async (event: {buttonId: string; pressType: string; timestamp: number}) => {
      console.log("🔘 BUTTON_PRESS event in AppletStatusProvider:", event)

      // Only handle short press for V1
      if (event.pressType !== "short") {
        console.log("🔘 Ignoring non-short press:", event.pressType)
        return
      }

      // Check if default button action is enabled
      const defaultButtonActionEnabled = await useSettingsStore
        .getState()
        .getSetting(SETTINGS_KEYS.default_button_action_enabled)

      if (!defaultButtonActionEnabled) {
        console.log("🔘 Default button action is disabled")
        return
      }

      // Check if any foreground app is running
      const activeForegroundApp = appStatus.find(app => app.type === "standard" && app.is_running)

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

      console.log("🔘 Starting default app:", defaultAppPackageName)
      optimisticallyStartApp(defaultAppPackageName, "standard")
    }

    // @ts-ignore
    GlobalEventEmitter.on("BUTTON_PRESS", onButtonPress)
    return () => {
      // @ts-ignore
      GlobalEventEmitter.off("BUTTON_PRESS", onButtonPress)
    }
  }, [appStatus, optimisticallyStartApp])

  // refresh app status until loaded:
  useEffect(() => {
    if (appStatus.length > 0) return
    const interval = setInterval(() => {
      refreshAppStatus()
    }, 2000)
    return () => clearInterval(interval)
  }, [appStatus.length])

  // Watch camera app state and send gallery mode updates to glasses (Android only)
  useEffect(() => {
    const cameraApp = appStatus.find(app => app.packageName === "com.mentra.camera")

    if (cameraApp) {
      const isRunning = cameraApp.is_running ?? false
      console.log(`Camera app state changed: is_running = ${isRunning}`)
      bridge.sendGalleryModeActive(isRunning)
    }
  }, [appStatus])

  // Re-send camera app state when glasses connect/reconnect
  useEffect(() => {
    const glassesModelName = status.glasses_info?.model_name

    if (glassesModelName) {
      // Glasses just connected - re-send current camera app state
      console.log(`Glasses connected (${glassesModelName}) - re-syncing camera app state`)

      const cameraApp = appStatus.find(app => app.packageName === "com.mentra.camera")
      const isRunning = cameraApp?.is_running ?? false

      console.log(`Re-sending gallery mode state on connection: ${isRunning}`)
      bridge.sendGalleryModeActive(isRunning)

      // Refresh app status to update compatibility (camera app will show as compatible if glasses have camera)
      console.log("📸 Refreshing app status after glasses connect to update compatibility")
      refreshAppStatus()

      // Only auto-start camera if NO foreground app is running
      if (hasCamera(glassesModelName)) {
        const cameraApp = appStatus.find(app => app.packageName === "com.mentra.camera")
        const activeForegroundApp = appStatus.find(app => app.type === "standard" && app.is_running)

        if (cameraApp && !cameraApp.is_running && !activeForegroundApp) {
          console.log(`📸 No foreground app running - auto-starting camera app`)
          optimisticallyStartApp("com.mentra.camera", "standard")
        } else if (activeForegroundApp) {
          console.log(`📸 Foreground app already running (${activeForegroundApp.name}) - not auto-starting camera`)
        } else if (cameraApp?.is_running) {
          console.log("📸 Camera app already running")
        }
      }
    } else {
      // Glasses disconnected - DO NOT auto-stop camera app
      // User controls camera app state manually
      console.log("📸 Glasses disconnected - camera app state unchanged")

      // Refresh app status to re-evaluate compatibility (camera app will show as incompatible)
      console.log("📸 Refreshing app status after glasses disconnect to update compatibility")
      refreshAppStatus()
    }
  }, [status.glasses_info?.model_name]) // Triggers when glasses connect/disconnect

  return (
    <AppStatusContext.Provider
      value={{
        appStatus,
        // Expose renderableApps (currently same as appStatus; reserved for filters)
        renderableApps: appStatus,
        refreshAppStatus,
        optimisticallyStartApp,
        optimisticallyStopApp,
        stopAllApps,
        clearPendingOperation,
      }}>
      {children}
    </AppStatusContext.Provider>
  )
}

export const useAppStatus = () => {
  const context = useContext(AppStatusContext)
  if (!context) {
    throw new Error("useAppStatus must be used within an AppStatusProvider")
  }
  return context
}

/**
 * Hook to get only foreground apps (type === "standard")
 */
export function useNewUiForegroundApps(): AppletInterface[] {
  const {appStatus} = useAppStatus()

  return useMemo(() => {
    // appStatus is an array, not an object with registered_applets
    if (!appStatus || !Array.isArray(appStatus)) return []
    return appStatus.filter(
      app => app.type === "standard" || !app.type, // default to standard if type is missing
    )
  }, [appStatus])
}

/**
 * Hook to get only background apps (type === "background")
 */
export function useBackgroundApps(): {active: AppletInterface[]; inactive: AppletInterface[]} {
  const {appStatus} = useAppStatus()

  return useMemo(() => {
    const active = appStatus.filter(app => app.type === "background" && app.is_running)
    const inactive = appStatus.filter(app => app.type === "background" && !app.is_running)
    return {active, inactive}
  }, [appStatus])
}

/**
 * Hook to get the currently active foreground app
 */
export function useActiveForegroundApp(): AppletInterface | null {
  const {appStatus} = useAppStatus()

  return useMemo(() => {
    if (!appStatus || !Array.isArray(appStatus)) return null
    return appStatus.find(app => (app.type === "standard" || !app.type) && app.is_running) || null
  }, [appStatus])
}

/**
 * Hook to get count of active background apps
 */
export function useActiveBackgroundAppsCount(): number {
  const {appStatus} = useAppStatus()

  return useMemo(() => {
    if (!appStatus || !Array.isArray(appStatus)) return 0
    return appStatus.filter(app => app.type === "background" && app.is_running).length
  }, [appStatus])
}

/**
 * Hook to get incompatible apps (both foreground and background)
 */
export function useIncompatibleApps(): AppletInterface[] {
  const {appStatus} = useAppStatus()

  return useMemo(() => {
    if (!appStatus || !Array.isArray(appStatus)) return []
    return appStatus.filter(app => {
      // Don't show running apps in incompatible list
      if (app.is_running) return false

      // Check if app has compatibility info and is marked as incompatible
      return app.compatibility && !app.compatibility.isCompatible
    })
  }, [appStatus])
}
