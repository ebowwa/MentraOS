import {translate} from "@/i18n"
import restComms from "@/services/RestComms"
import {SETTINGS_KEYS, useSetting, useSettingsStore} from "@/stores/settings"
import {getThemeIsDark} from "@/theme/getTheme"
import {ClientAppletInterface} from "@/types/AppletTypes"
import showAlert from "@/utils/AlertUtils"
import {HardwareCompatibility} from "@/utils/hardware"
import {getModelCapabilities, HardwareRequirementLevel, HardwareType} from "../../../cloud/packages/types/src"
import {useMemo} from "react"
import {create} from "zustand"

interface AppStatusState {
  apps: ClientAppletInterface[]
  refreshApps: () => Promise<void>
  startApp: (packageName: string, appType?: string) => Promise<void>
  stopApp: (packageName: string) => Promise<void>
  stopAllApps: () => Promise<void>
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

const cameraPackageName = "com.mentra.camera"
const captionsPackageName = "com.mentra.captions"

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
      isOffline: true, // Works without internet connection
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
      isOffline: true, // Works without internet connection
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
  if (packageName === captionsPackageName) {
    await useSettingsStore.getState().setSetting(SETTINGS_KEYS.offline_captions_running, status, true)
  }
}

export const useAppletStatusStore = create<AppStatusState>((set, get) => ({
  apps: [],

  refreshApps: async () => {
    const coreToken = restComms.getCoreToken()
    if (!coreToken) return

    try {
      const appsData: AppletInterface[] = await restComms.getApps()

      const onlineApps: ClientAppletInterface[] = appsData.map(app => ({
        ...app,
        isOffline: false,
        offlineRoute: "",
      }))

      // merge in the offline apps:
      let applets: ClientAppletInterface[] = [...onlineApps, ...(await getOfflineApplets())]

      // remove duplicates and keep the online versions:
      const packageNameMap = new Map<string, ClientAppletInterface>()
      applets.forEach(app => {
        const existing = packageNameMap.get(app.packageName)
        if (!existing || !app.isOffline) {
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
    } catch (err) {
      console.error("Error fetching apps:", err)
    }
  },

  startApp: async (packageName: string) => {
    const applet = get().apps.find(a => a.packageName === packageName)
    console.log("applet", applet)

    if (!applet) {
      console.error(`Applet not found for package name: ${packageName}`)
      return
    }

    // if (applet.type === "standard") {
    //   const runningStandardApps = get().apps.filter(
    //     a => a.is_running && a.type === "standard" && a.packageName !== packageName,
    //   )
    //   for (const app of runningStandardApps) {
    //     await restComms.stopApp(app.packageName).catch(console.error)
    //     set(state => ({
    //       apps: state.apps.map(a =>
    //         a.packageName === app.packageName ? {...a, is_running: false, loading: false} : a,
    //       ),
    //     }))
    //   }
    // }

    set(state => ({
      apps: state.apps.map(a =>
        a.packageName === packageName ? {...a, running: true, loading: !applet.isOffline} : a,
      ),
    }))

    console.log("applet is offline: ", applet.isOffline)

    try {
      if (!applet.isOffline) {
        await restComms.startApp(packageName)
      } else {
        setOfflineApplet(packageName, true)
      }
      await useSettingsStore.getState().setSetting(SETTINGS_KEYS.has_ever_activated_app, true)
    } catch (error: any) {
      console.error("Start app error:", error)

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

  stopApp: async (packageName: string) => {
    set(state => ({
      apps: state.apps.map(a => (a.packageName === packageName ? {...a, running: false, loading: false} : a)),
    }))
    const applet = get().apps.find(a => a.packageName === packageName)
    if (!applet) {
      console.error(`Applet with package name ${packageName} not found`)
      return
    }
    if (!applet.isOffline) {
      await restComms.stopApp(packageName).catch(console.error)
    } else {
      setOfflineApplet(packageName, false)
    }
  },

  stopAllApps: async () => {
    const runningApps = get().apps.filter(app => app.running)

    for (const app of runningApps) {
      if (!app.isOffline) {
        await restComms.stopApp(app.packageName)
      } else {
        setOfflineApplet(app.packageName, false)
      }
    }

    set({apps: get().apps.map(a => ({...a, running: false}))})
  },
}))

export const useApplets = () => useAppletStatusStore(state => state.apps)
export const useStartApplet = () => useAppletStatusStore(state => state.startApp)
export const useStopApplet = () => useAppletStatusStore(state => state.stopApp)
export const useRefreshApplets = () => useAppletStatusStore(state => state.refreshApps)
export const useStopAllApplets = () => useAppletStatusStore(state => state.stopAllApps)
export const useInactiveForegroundApps = () => {
  const apps = useApplets()
  const [isOffline] = useSetting(SETTINGS_KEYS.offline_mode)
  if (isOffline) {
    return useMemo(() => apps.filter(app => app.type === "standard" && !app.running && app.isOffline), [apps])
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
