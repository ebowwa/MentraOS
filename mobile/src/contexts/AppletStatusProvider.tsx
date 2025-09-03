import React, {createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef} from "react"
import BackendServerComms from "../backend_comms/BackendServerComms"
import {useAuth} from "@/contexts/AuthContext"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {AppState} from "react-native"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/utils/SettingsHelper"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {deepCompare} from "@/utils/debugging"
import showAlert from "@/utils/AlertUtils"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"

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
  is_loading?: boolean
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
  clearPendingOperation: (packageName: string) => void
  checkAppHealthStatus: (packageName: string) => Promise<boolean>
}

const AppStatusContext = createContext<AppStatusContextType | undefined>(undefined)

export const AppStatusProvider = ({children}: {children: ReactNode}) => {
  const [appStatus, setAppStatus] = useState<AppletInterface[]>([])
  const {user} = useAuth()
  const {theme} = useAppTheme()
  const backendComms = BackendServerComms.getInstance()

  // Keep track of active operations to prevent race conditions
  const pendingOperations = useRef<{[packageName: string]: "start" | "stop"}>({})

  const refreshAppStatus = useCallback(async () => {
    console.log("AppStatusProvider: refreshAppStatus called - user exists:", !!user, "user email:", user?.email)
    if (!user) {
      console.log("AppStatusProvider: No user, clearing app status")
      return Promise.resolve()
    }

    // Check if we have a core token from BackendServerComms
    const coreToken = BackendServerComms.getInstance().getCoreToken()
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
      const appsData = await BackendServerComms.getInstance().getApps()

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
          is_loading: false,
          // @ts-ignore include server-provided latest status if present
          isOnline: (app as any).isOnline,
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
    await doStartApp(packageName, appType)
  }

  // Extracted actual start logic
  const doStartApp = async (packageName: string, appType?: string) => {
    // Handle foreground apps
    if (appType === "standard") {
      const runningStandardApps = appStatus.filter(
        app => app.is_running && app.type === "standard" && app.packageName !== packageName,
      )

      for (const runningApp of runningStandardApps) {
        optimisticallyStopApp(runningApp.packageName)
        try {
          backendComms.stopApp(runningApp.packageName)
          clearPendingOperation(runningApp.packageName)
        } catch (error) {
          console.error("Stop app error:", error)
          refreshAppStatus()
        }
      }
    }

    // optimistically start the app:
    {
      // Record that we have a pending start operation
      pendingOperations.current[packageName] = "start"

      // Set a timeout to clear this operation after 10 seconds (in case callback never happens)
      setTimeout(() => {
        if (pendingOperations.current[packageName] === "start") {
          delete pendingOperations.current[packageName]
        }
      }, 20000)

      setAppStatus(currentStatus => {
        // Then update the target app to be running
        return currentStatus.map(app => (app.packageName === packageName ? {...app, is_running: true} : app))
      })
    }

    // actually start the app:
    {
      try {
        await backendComms.startApp(packageName)
        clearPendingOperation(packageName)
        await saveSetting(SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP, true)
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
  }

  // Optimistically update app status when stopping an app
  const optimisticallyStopApp = async (packageName: string) => {
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
        currentStatus.map(app => (app.packageName === packageName ? {...app, is_running: false} : app)),
      )
    }

    // actually stop the app:
    {
      try {
        await backendComms.stopApp(packageName)
        clearPendingOperation(packageName)
      } catch (error) {
        refreshAppStatus()
        console.error("Stop app error:", error)
      }
    }
  }

  // When an app start/stop operation succeeds, clear the pending operation
  const clearPendingOperation = (packageName: string) => {
    delete pendingOperations.current[packageName]
  }

  const checkAppHealthStatus = async (packageName: string): Promise<boolean> => {
    // GET the app's /health endpoint
    return true
    try {
      const app = appStatus.find(app => app.packageName === packageName)
      if (!app) {
        return false
      }
      const baseUrl = await BackendServerComms.getInstance().getServerUrl()
      // POST /api/app-uptime/app-pkg-health-check with body { "packageName": packageName }
      const healthUrl = `${baseUrl}/api/app-uptime/app-pkg-health-check`
      const healthResponse = await fetch(healthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({packageName}),
      })
      const healthData = await healthResponse.json()
      return healthData.success
    } catch (error) {
      console.error("AppStatusProvider: Error checking app health status:", error)
      return false
    }
  }

  const onCoreTokenSet = () => {
    console.log("CORE_TOKEN_SET event received, forcing app refresh with 1.5 second delay")
    // Add a delay to let the token become valid on the server side
    setTimeout(() => {
      console.log("CORE_TOKEN_SET: Delayed refresh executing now")
      refreshAppStatus()
    }, 1500)
  }

  // Listen for app started/stopped events from CoreCommunicator
  useEffect(() => {
    // @ts-ignore
    GlobalEventEmitter.on("CORE_TOKEN_SET", onCoreTokenSet)
    return () => {
      // @ts-ignore
      GlobalEventEmitter.off("CORE_TOKEN_SET", onCoreTokenSet)
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
        clearPendingOperation,
        checkAppHealthStatus,
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
