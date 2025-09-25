import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {AppletInterface} from "@/types/AppletInterface"
import {useMemo} from "react"

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
export function useNewUiBackgroundApps(): AppletInterface[] {
  const {appStatus} = useAppStatus()

  return useMemo(() => {
    if (!appStatus || !Array.isArray(appStatus)) return []
    return appStatus.filter(app => app.type === "background")
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
export function useNewUiActiveBackgroundAppsCount(): number {
  const {appStatus} = useAppStatus()

  return useMemo(() => {
    if (!appStatus || !Array.isArray(appStatus)) return 0
    return appStatus.filter(app => app.type === "background" && app.is_running).length
  }, [appStatus])
}
