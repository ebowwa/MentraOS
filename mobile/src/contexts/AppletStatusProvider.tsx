import React, {createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef} from "react"
import BackendServerComms from "../backend_comms/BackendServerComms"
import {useAuth} from "@/contexts/AuthContext"
import {useCoreStatus} from "./CoreStatusProvider"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {router} from "expo-router"
import {AppState} from "react-native"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
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
  publicUrl: string
  isSystemApp?: boolean
  uninstallable?: boolean
  webviewURL?: string
  logoURL: string
  appType: string
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
  is_foreground?: boolean
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
}

interface AppStatusContextType {
  appStatus: AppletInterface[]
  refreshAppStatus: () => Promise<void>
  optimisticallyStartApp: (packageName: string, appType?: string) => void
  optimisticallyStopApp: (packageName: string) => void
  clearPendingOperation: (packageName: string) => void
  checkAppHealthStatus: (packageName: string) => Promise<boolean>
}

const AppStatusContext = createContext<AppStatusContextType | undefined>(undefined)

export const AppStatusProvider = ({children}: {children: ReactNode}) => {
  const [appStatus, setAppStatus] = useState<AppletInterface[]>([])
  const {user, logout} = useAuth()
  const {status} = useCoreStatus()
  const {theme} = useAppTheme()
  const backendComms = BackendServerComms.getInstance()

  // Keep track of active operations to prevent race conditions
  const pendingOperations = useRef<{[packageName: string]: "start" | "stop"}>({})

  // Track when the last refresh was performed
  const lastRefreshTime = useRef<number>(0)

  // Track previous glasses connection to detect changes
  const previousGlassesModel = useRef<string | null>(null)

  const refreshAppStatus = useCallback(async () => {
    console.log("AppStatusProvider: refreshAppStatus called - user exists:", !!user, "user email:", user?.email)
    if (!user) {
      console.log("AppStatusProvider: No user, clearing app status")
      setAppStatus([])
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

    console.log("AppStatusProvider: Token check passed, starting app fetch...")

    // Record the time of this refresh attempt
    const refreshStartTime = Date.now()
    lastRefreshTime.current = refreshStartTime

    try {
      // Store current running states before fetching
      const currentRunningStates: {[packageName: string]: boolean} = {}
      appStatus.forEach(app => {
        if (app.is_running) {
          currentRunningStates[app.packageName] = true
        }
      })

      console.log("AppStatusProvider: Calling BackendServerComms.getApps()...")
      const appsData = await BackendServerComms.getInstance().getApps()
      console.log("AppStatusProvider: getApps() returned", appsData?.length || 0, "apps")

      // Only process this update if it's the most recent one
      if (refreshStartTime === lastRefreshTime.current) {
        // Merge existing running states with new data
        const updatedAppsData = appsData.map(app => {
          // Make a shallow copy of the app object
          const appCopy: AppletInterface = {...app}

          // Check pending operations first
          const pendingOp = pendingOperations.current[app.packageName]
          if (pendingOp === "start") {
            appCopy.is_running = true
          } else if (pendingOp === "stop") {
            appCopy.is_running = false
          } else if (app.is_running !== undefined) {
            // If the server provided is_running status, use it
            appCopy.is_running = Boolean(app.is_running)
          } else if (currentRunningStates[app.packageName]) {
            // Fallback to our local state if server didn't provide is_running
            appCopy.is_running = true
          } else {
            // Default to not running if no information is available
            appCopy.is_running = false
          }

          return appCopy
        })

        // // check if the list of running apps is the same:
        // const runningApps = updatedAppsData.filter(app => app.is_running)
        // const oldRunningApps = appStatus.filter(app => app.is_running)
        // const oldIncompatibleApps = appStatus.filter(app => !app.compatibility?.isCompatible)
        // const newIncompatibleApps = updatedAppsData.filter(app => !app.compatibility?.isCompatible)

        // if (runningApps !== oldRunningApps || oldIncompatibleApps !== newIncompatibleApps) {
        //   console.log("AppStatusProvider: Running apps changed, refreshing app list")
        //   setAppStatus(updatedAppsData)
        // }

        const diff = deepCompare(appStatus, updatedAppsData)
        if (diff.length === 0) {
          console.log("AppStatusProvider: Applet status did not change ###############################################")
          return
        }
        console.log("AppletStatusProvider: Applet status changed:", diff)

        setAppStatus(updatedAppsData)
      }
    } catch (err) {
      console.error("AppStatusProvider: Error fetching apps:", err)
    }
  }, [user, status])

  // Optimistically update app status when starting an app
  const optimisticallyStartApp = useCallback(async (packageName: string, appType?: string) => {
    // Handle foreground apps
    if (appType === "standard") {
      const runningStandardApps = appStatus.filter(
        app => app.is_running && app.appType === "standard" && app.packageName !== packageName,
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
        // First update all apps' foreground status
        const updatedApps = currentStatus.map(app => ({
          ...app,
          is_foreground: app.packageName === packageName,
        }))

        // Then update the target app to be running
        return updatedApps.map(app =>
          app.packageName === packageName ? {...app, is_running: true, is_foreground: true} : app,
        )
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
  }, [])

  // Optimistically update app status when stopping an app
  const optimisticallyStopApp = useCallback(async (packageName: string) => {
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
  }, [])

  // When an app start/stop operation succeeds, clear the pending operation
  const clearPendingOperation = useCallback((packageName: string) => {
    delete pendingOperations.current[packageName]
  }, [])

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

  const handleAppStateChange = async (nextAppState: any) => {
    console.log("App state changed to:", nextAppState)
    // If app comes back to foreground, hide the loading overlay
    if (nextAppState === "active") {
      if (await loadSetting(SETTINGS_KEYS.RECONNECT_ON_APP_FOREGROUND, true)) {
        console.log("Attempt reconnect to glasses", status.core_info.default_wearable, status.glasses_info?.model_name)
        if (status.core_info.default_wearable && !status.glasses_info?.model_name) {
          await coreCommunicator.sendConnectWearable(status.core_info.default_wearable)
        }
      }
    }
  }

  // const onAppStarted = (packageName: string) => {
  //   optimisticallyStartApp(packageName)
  // }
  // const onAppStopped = (packageName: string) => {
  //   optimisticallyStopApp(packageName)
  // }

  const onResetAppStatus = () => {
    console.log("RESET_APP_STATUS event received, clearing app status")
    setAppStatus([])
  }

  const onCoreTokenSet = () => {
    console.log("CORE_TOKEN_SET event received, forcing app refresh with 1.5 second delay")
    // Add a delay to let the token become valid on the server side
    setTimeout(() => {
      console.log("CORE_TOKEN_SET: Delayed refresh executing now")
      refreshAppStatus().catch(error => {
        console.error("CORE_TOKEN_SET: Error during delayed refresh:", error)
      })
    }, 1500)
  }

  // Initial fetch and refresh on user change or status change
  useEffect(() => {
    console.log("USE EFFECT 0")
    refreshAppStatus()
  }, [user, status.core_info.cloud_connection_status])

  // Monitor glasses connection changes and refresh apps when glasses change
  useEffect(() => {
    console.log("USE EFFECT 1")
    const currentGlassesModel = status.glasses_info?.model_name || null

    // Only check for changes after initial load (previousGlassesModel has been set at least once)
    if (previousGlassesModel.current !== undefined) {
      // Check if glasses connection changed
      if (previousGlassesModel.current !== currentGlassesModel) {
        console.log(
          "AppStatusProvider: Glasses connection changed from",
          previousGlassesModel.current || "none",
          "to",
          currentGlassesModel || "none",
          "- refreshing app list",
        )

        // Only refresh if we have a user and the change is meaningful
        if (user && (previousGlassesModel.current !== null || currentGlassesModel !== null)) {
          // Add error handling for refresh
          refreshAppStatus().catch(error => {
            console.error("AppStatusProvider: Error refreshing apps after glasses change:", error)
          })
        }
      }
    }

    // Update the previous glasses model for next comparison
    previousGlassesModel.current = currentGlassesModel
  }, [status.glasses_info?.model_name, user, refreshAppStatus])

  // Listen for app started/stopped events from CoreCommunicator
  useEffect(() => {
    // // @ts-ignore
    // GlobalEventEmitter.on("APP_STARTED_EVENT", onAppStarted)
    // // @ts-ignore
    // GlobalEventEmitter.on("APP_STOPPED_EVENT", onAppStopped)

    // @ts-ignore
    GlobalEventEmitter.on("RESET_APP_STATUS", onResetAppStatus)
    // @ts-ignore
    GlobalEventEmitter.on("CORE_TOKEN_SET", onCoreTokenSet)
    return () => {
      // @ts-ignore
      // GlobalEventEmitter.off("APP_STARTED_EVENT", onAppStarted)
      // @ts-ignore
      // GlobalEventEmitter.off("APP_STOPPED_EVENT", onAppStopped)

      // @ts-ignore
      GlobalEventEmitter.off("RESET_APP_STATUS", onResetAppStatus)
      // @ts-ignore
      GlobalEventEmitter.off("CORE_TOKEN_SET", onCoreTokenSet)
    }
  }, [optimisticallyStartApp, optimisticallyStopApp, refreshAppStatus])

  // Add a listener for app state changes to detect when the app comes back from background
  useEffect(() => {
    // Subscribe to app state changes
    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange)

    return () => {
      appStateSubscription.remove()
    }
  }, []) // subscribe only once

  return (
    <AppStatusContext.Provider
      value={{
        appStatus,
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
