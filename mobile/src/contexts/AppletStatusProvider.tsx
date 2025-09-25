import {createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef, useMemo} from "react"
import {useAuth} from "@/contexts/AuthContext"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {deepCompare} from "@/utils/debugging"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"
import restComms from "@/managers/RestComms"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"

export type AppPermissionType =
  | "ALL"
  | "MICROPHONE"
  | "CAMERA"
  | "CALENDAR"
  | "LOCATION"
  | "BACKGROUND_LOCATION"
  | "READ_NOTIFICATIONS"
  | "POST_NOTIFICATIONS"
export interface AppletPermission {
  description: string
  type: AppPermissionType
  required?: boolean
}

// Define the AppInterface based on AppI from SDK
export interface AppletInterface {
  packageName: string
  name: string
  developerName?: string
  publicUrl?: string
  isSystemApp?: boolean
  uninstallable?: boolean
  webviewURL?: string
  logoURL: string
  type: string // "standard", "background"
  appStoreId?: string
  developerId?: string
  hashedEndpointSecret?: string
  hashedApiKey?: string
  description?: string
  version?: string
  settings?: Record<string, unknown>
  isPublic?: boolean
  appStoreStatus?: "DEVELOPMENT" | "SUBMITTED" | "REJECTED" | "PUBLISHED"
  developerProfile?: {
    company?: string
    website?: string
    contactEmail?: string
    description?: string
    logo?: string
  }
  permissions: AppletPermission[]
  is_running?: boolean
  loading?: boolean
  compatibility?: {
    isCompatible: boolean
    missingRequired: Array<{
      type: string
      description?: string
    }>
    missingOptional: Array<{
      type: string
      description?: string
    }>
    message: string
  }
  // New optional isOnline from backend
  isOnline?: boolean | null
}

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
  const {theme} = useAppTheme()

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

      setAppStatus(currentAppStatus => {
        const diff = deepCompare(currentAppStatus, mapped)
        if (diff.length === 0) {
          console.log("AppStatusProvider: Applet status did not change")
          return currentAppStatus
        }
        return mapped
      })
    } catch (err) {
      console.error("AppStatusProvider: Error fetching apps:", err)
    }
  }, [user])

  // Optimistically update app status when starting an app
  const optimisticallyStartApp = async (packageName: string, appType?: string) => {
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
    const usingNewUI = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.NEW_UI)

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
        await useSettingsStore.getState().setSetting(SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP, true)
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

  // refresh app status until loaded:
  useEffect(() => {
    if (appStatus.length > 0) return
    const interval = setInterval(() => {
      refreshAppStatus()
    }, 2000)
    return () => clearInterval(interval)
  }, [appStatus.length])

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
