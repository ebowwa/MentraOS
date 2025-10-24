import {
  AppletInterface,
  getModelCapabilities,
  HardwareRequirementLevel,
  HardwareType,
} from "@/../../cloud/packages/types/src"
import {translate} from "@/i18n"
import restComms from "@/services/RestComms"
import {SETTINGS_KEYS, useSetting, useSettingsStore} from "@/stores/settings"
import {getThemeIsDark} from "@/theme/getTheme"
import showAlert from "@/utils/AlertUtils"
import {CompatibilityResult, HardwareCompatibility} from "@/utils/hardware"
import {useMemo} from "react"
import {create} from "zustand"

export interface ClientAppletInterface extends AppletInterface {
  offline: boolean
  offlineRoute: string
  compatibility?: CompatibilityResult
  loading: boolean
}

interface AppStatusState {
  apps: ClientAppletInterface[]
  refreshApplets: () => Promise<void>
  startApplet: (packageName: string, appType?: string) => Promise<void>
  stopApplet: (packageName: string) => Promise<void>
  stopAllApplets: () => Promise<void>
}

export const DUMMY_APPLET: ClientAppletInterface = {
  packageName: "",
  name: "",
  webviewUrl: "",
  logoUrl: "",
  type: "standard",
  permissions: [],
  running: false,
  loading: false,
  healthy: true,
  hardwareRequirements: [],
  offline: true,
  offlineRoute: "",
}

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

export const cameraPackageName = "com.mentra.camera"
export const captionsPackageName = "com.augmentos.livecaptions"

// get offline applets:
export const getOfflineApplets = async (): Promise<ClientAppletInterface[]> => {
  const isDark = await getThemeIsDark()

  const offlineCameraRunning = await useSettingsStore.getState().getSetting(cameraPackageName)
  const offlineCaptionsRunning = await useSettingsStore.getState().getSetting(captionsPackageName)
  return [
    {
      packageName: cameraPackageName,
      name: "Camera",
      type: "standard", // Foreground app (only one at a time)
      offline: true, // Works without internet connection
      logoUrl: getCameraIcon(isDark),
      // description: "Capture photos and videos with your Mentra glasses.",
      webviewUrl: "",
      // version: "0.0.1",
      permissions: [],
      offlineRoute: "/asg/gallery",
      running: offlineCameraRunning,
      loading: false,
      healthy: true,
      hardwareRequirements: [{type: HardwareType.CAMERA, level: HardwareRequirementLevel.REQUIRED}],
    },
    {
      packageName: captionsPackageName,
      name: "Live Captions",
      type: "standard", // Foreground app (only one at a time)
      offline: true, // Works without internet connection
      // logoUrl: getCaptionsIcon(isDark),
      logoUrl: "https://appstore.augmentos.org/app-icons/captions.png",
      // description: "Live captions for your mentra glasses.",
      webviewUrl: "",
      // version: "0.0.1",
      healthy: true,
      permissions: [],
      offlineRoute: "",
      running: offlineCaptionsRunning,
      loading: false,
      hardwareRequirements: [{type: HardwareType.DISPLAY, level: HardwareRequirementLevel.REQUIRED}],
    },
  ]
}

// export const isAppCompatible = (app: ClientAppletInterface): boolean => {
//   const defaultWearable = useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_wearable)
//   const capabilities = getCapabilitiesForModel(defaultWearable)
//   if (!capabilities) return false
//   const requiredCapabilities = app.required
//   return requiredCapabilities.every(capability => capabilities.includes(capability))
// }

const setOfflineApplet = async (packageName: string, status: boolean) => {
  await useSettingsStore.getState().setSetting(packageName, status)

  // Captions app special handling
  if (packageName === captionsPackageName) {
    console.log(`APPLET: Captions app ${status ? "started" : "stopped"}`)
    await useSettingsStore.getState().setSetting(SETTINGS_KEYS.offline_captions_running, status, true)
  }

  // Camera app special handling - send gallery mode to glasses
  if (packageName === cameraPackageName) {
    console.log(`APPLET: Camera app ${status ? "started" : "stopped"}`)
    await useSettingsStore.getState().setSetting(SETTINGS_KEYS.gallery_mode, status, true)
  }
}

const toggleApplet = async (applet: ClientAppletInterface, status: boolean) => {
  if (applet.offline) {
    await setOfflineApplet(applet.packageName, status)
    await useAppletStatusStore.getState().refreshApplets() // update state immediately
    return
  }

  if (status) {
    await restComms.startApp(applet.packageName)
  } else {
    await restComms.stopApp(applet.packageName)
  }
  // TODO: remove this and just update when we receive the app_state_change event from the server
  setTimeout(() => {
    useAppletStatusStore.getState().refreshApplets()
  }, 1000)
}

export const useAppletStatusStore = create<AppStatusState>((set, get) => ({
  apps: [],

  refreshApplets: async () => {
    const appsData: AppletInterface[] = await restComms.getApplets()

    const onlineApps: ClientAppletInterface[] = appsData.map(app => ({
      ...app,
      loading: false,
      offline: false,
      offlineRoute: "",
    }))

    // merge in the offline apps:
    let applets: ClientAppletInterface[] = [...onlineApps, ...(await getOfflineApplets())]
    const offlineMode = useSettingsStore.getState().getSetting(SETTINGS_KEYS.offline_mode)

    // remove duplicates and keep the online versions:
    const packageNameMap = new Map<string, ClientAppletInterface>()
    applets.forEach(app => {
      const existing = packageNameMap.get(app.packageName)
      if (!existing || offlineMode) {
        packageNameMap.set(app.packageName, app)
      }
    })
    applets = Array.from(packageNameMap.values())

    // add in the compatibility info:
    let defaultWearable = useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_wearable)
    let capabilities = getModelCapabilities(defaultWearable)

    for (const applet of applets) {
      let result = HardwareCompatibility.checkCompatibility(applet.hardwareRequirements, capabilities)
      applet.compatibility = result
    }

    set({apps: applets})
  },

  startApplet: async (packageName: string) => {
    const applet = get().apps.find(a => a.packageName === packageName)

    if (!applet) {
      console.error(`Applet not found for package name: ${packageName}`)
      return
    }

    // Handle foreground apps - only one can run at a time
    if (applet.type === "standard") {
      const runningForegroundApps = get().apps.filter(
        app => app.running && app.type === "standard" && app.packageName !== packageName,
      )

      console.log(`Found ${runningForegroundApps.length} running foreground apps to stop`)

      // Stop all other running foreground apps (both online and offline)
      for (const runningApp of runningForegroundApps) {
        console.log(`Stopping foreground app: ${runningApp.name} (${runningApp.packageName})`)

        // // Optimistically update UI
        // set(state => ({
        //   apps: state.apps.map(a =>
        //     a.packageName === runningApp.packageName ? {...a, running: false, loading: false} : a,
        //   ),
        // }))

        toggleApplet(runningApp, false)
      }
    }

    // Start the new app
    set(state => ({
      apps: state.apps.map(a => (a.packageName === packageName ? {...a, running: true, loading: !applet.offline} : a)),
    }))

    try {
      await toggleApplet(applet, true)

      await useSettingsStore.getState().setSetting(SETTINGS_KEYS.has_ever_activated_app, true)
    } catch (error: any) {
      if (error?.response?.data?.error?.stage === "HARDWARE_CHECK") {
        showAlert(
          translate("home:hardwareIncompatible"),
          error.response.data.error.message ||
            translate("home:hardwareIncompatibleMessage", {app: packageName, missing: "required hardware"}),
          [{text: translate("common:ok")}],
          {iconName: "alert-circle-outline"},
        )
      }

      set(state => ({
        apps: state.apps.map(a => (a.packageName === packageName ? {...a, running: false, loading: false} : a)),
      }))
    }
  },

  stopApplet: async (packageName: string) => {
    const applet = get().apps.find(a => a.packageName === packageName)
    if (!applet) {
      console.error(`Applet with package name ${packageName} not found`)
      return
    }

    set(state => ({
      apps: state.apps.map(a => (a.packageName === packageName ? {...a, running: false, loading: true} : a)),
    }))

    toggleApplet(applet, false)
  },

  stopAllApplets: async () => {
    const runningApps = get().apps.filter(app => app.running)

    for (const app of runningApps) {
      if (!app.offline) {
        await restComms.stopApp(app.packageName)
      } else {
        setOfflineApplet(app.packageName, false)
      }
    }

    set({apps: get().apps.map(a => ({...a, running: false}))})
  },
}))

export const useApplets = () => useAppletStatusStore(state => state.apps)
export const useStartApplet = () => useAppletStatusStore(state => state.startApplet)
export const useStopApplet = () => useAppletStatusStore(state => state.stopApplet)
export const useRefreshApplets = () => useAppletStatusStore(state => state.refreshApplets)
export const useStopAllApplets = () => useAppletStatusStore(state => state.stopAllApplets)
export const useInactiveForegroundApps = () => {
  const apps = useApplets()
  const [isOffline] = useSetting(SETTINGS_KEYS.offline_mode)
  if (isOffline) {
    return useMemo(() => apps.filter(app => app.type === "standard" && !app.running && app.offline), [apps])
  }
  return useMemo(() => apps.filter(app => (app.type === "standard" || !app.type) && !app.running), [apps])
}
export const useBackgroundApps = () => {
  const apps = useApplets()
  return useMemo(
    () => ({
      active: apps.filter(app => app.type === "background" && app.running),
      inactive: apps.filter(app => app.type === "background" && !app.running),
    }),
    [apps],
  )
}

export const useActiveForegroundApp = () => {
  const apps = useApplets()
  return useMemo(() => apps.find(app => (app.type === "standard" || !app.type) && app.running) || null, [apps])
}

export const useActiveBackgroundAppsCount = () => {
  const apps = useApplets()
  return useMemo(() => apps.filter(app => app.type === "background" && app.running).length, [apps])
}

export const useIncompatibleApps = () => {
  const apps = useApplets()
  return useMemo(() => apps.filter(app => !app.compatibility?.isCompatible), [apps])
}

// export const useIncompatibleApps = async () => {
//   const apps = useApplets()
//   const defaultWearable = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_wearable)

//   const capabilities: Capabilities | null = await getCapabilitiesForModel(defaultWearable)
//   if (!capabilities) {
//     console.error("Failed to fetch capabilities")
//     return []
//   }

//   return useMemo(() => {
//     return apps.filter((app) => {
//       let result = HardwareCompatibility.checkCompatibility(app.hardwareRequirements, capabilities)
//       return !result.isCompatible
//     })
//   }, [apps])
// }

// export const useFilteredApps = async () => {
//   const apps = useApplets()
//   const defaultWearable = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_wearable)

//   const capabilities: Capabilities | null = getCapabilitiesForModel(defaultWearable)
//   if (!capabilities) {
//     console.error("Failed to fetch capabilities")
//     throw new Error("Failed to fetch capabilities")
//   }

//   return useMemo(() => {
//     return {

//     })
//   }, [apps])
// }
