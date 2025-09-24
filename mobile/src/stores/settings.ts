import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {getTimeZone} from "react-native-localize"
import bridge from "@/bridge/MantleBridge"
import restComms from "@/managers/RestComms"
import {isDeveloperBuildOrTestflight} from "@/utils/buildDetection"

export const SETTINGS_KEYS = {
  PREVIOUSLY_BONDED_PUCK: "PREVIOUSLY_BONDED_PUCK",
  ENABLE_PHONE_NOTIFICATIONS: "ENABLE_PHONE_NOTIFICATIONS",
  NOTIFICATION_APP_PREFERENCES: "NOTIFICATION_APP_PREFERENCES",
  NOTIFICATION_CATEGORY_PREFERENCES: "NOTIFICATION_CATEGORY_PREFERENCES",
  ONBOARDING_COMPLETED: "ONBOARDING_COMPLETED",
  SETTINGS_ACCESS_COUNT: "SETTINGS_ACCESS_COUNT",
  VISITED_LIVECAPTIONS_SETTINGS: "VISITED_LIVECAPTIONS_SETTINGS",
  CUSTOM_BACKEND_URL: "CUSTOM_BACKEND_URL",
  RECONNECT_ON_APP_FOREGROUND: "RECONNECT_ON_APP_FOREGROUND",
  HAS_EVER_ACTIVATED_APP: "HAS_EVER_ACTIVATED_APP",
  THEME_PREFERENCE: "THEME_PREFERENCE",
  DEV_MODE: "DEV_MODE",
  NEW_UI: "NEW_UI",
  OFFLINE_MODE: "OFFLINE_MODE",
  sensing_enabled: "sensing_enabled",
  power_saving_mode: "power_saving_mode",
  always_on_status_bar: "always_on_status_bar",
  bypass_vad_for_debugging: "bypass_vad_for_debugging",
  bypass_audio_encoding_for_debugging: "bypass_audio_encoding_for_debugging",
  metric_system_enabled: "metric_system_enabled",
  enforce_local_transcription: "enforce_local_transcription",
  button_press_mode: "button_press_mode",
  default_wearable: "default_wearable",
  device_name: "device_name",
  preferred_mic: "preferred_mic",
  contextual_dashboard_enabled: "contextual_dashboard_enabled",
  head_up_angle: "head_up_angle",
  brightness: "brightness",
  auto_brightness: "auto_brightness",
  dashboard_height: "dashboard_height",
  dashboard_depth: "dashboard_depth",
  button_mode: "button_mode",
  button_photo_size: "button_photo_size",
  button_video_settings: "button_video_settings",
  button_camera_led: "button_camera_led",
  button_video_settings_width: "button_video_settings_width",
  core_token: "core_token",
  server_url: "server_url",
  time_zone: "time_zone",
  time_zone_override: "time_zone_override",
  location_tier: "location_tier",
  offline_captions_app_running: "offline_captions_app_running",
} as const

const DEFAULT_SETTINGS: Record<string, any> = {
  [SETTINGS_KEYS.CUSTOM_BACKEND_URL]: "https://api.mentra.glass:443",
  [SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS]: false,
  [SETTINGS_KEYS.NOTIFICATION_APP_PREFERENCES]: "{}",
  [SETTINGS_KEYS.NOTIFICATION_CATEGORY_PREFERENCES]: JSON.stringify({
    social: true,
    communication: true,
    entertainment: true,
    productivity: true,
    news: true,
    shopping: true,
    other: true,
  }),
  [SETTINGS_KEYS.ONBOARDING_COMPLETED]: false,
  [SETTINGS_KEYS.SETTINGS_ACCESS_COUNT]: 0,
  [SETTINGS_KEYS.VISITED_LIVECAPTIONS_SETTINGS]: false,
  [SETTINGS_KEYS.RECONNECT_ON_APP_FOREGROUND]: false,
  [SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP]: false,
  [SETTINGS_KEYS.THEME_PREFERENCE]: "system",
  [SETTINGS_KEYS.DEV_MODE]: false,
  [SETTINGS_KEYS.NEW_UI]: false,
  [SETTINGS_KEYS.OFFLINE_MODE]: false,
  [SETTINGS_KEYS.sensing_enabled]: true,
  [SETTINGS_KEYS.power_saving_mode]: false,
  [SETTINGS_KEYS.always_on_status_bar]: false,
  [SETTINGS_KEYS.bypass_vad_for_debugging]: true,
  [SETTINGS_KEYS.bypass_audio_encoding_for_debugging]: false,
  [SETTINGS_KEYS.metric_system_enabled]: false,
  [SETTINGS_KEYS.enforce_local_transcription]: false,
  [SETTINGS_KEYS.button_press_mode]: "photo",
  [SETTINGS_KEYS.default_wearable]: null,
  [SETTINGS_KEYS.device_name]: "",
  [SETTINGS_KEYS.preferred_mic]: "phone",
  [SETTINGS_KEYS.contextual_dashboard_enabled]: true,
  [SETTINGS_KEYS.head_up_angle]: 45,
  [SETTINGS_KEYS.brightness]: 50,
  [SETTINGS_KEYS.auto_brightness]: true,
  [SETTINGS_KEYS.dashboard_height]: 4,
  [SETTINGS_KEYS.dashboard_depth]: 5,
  [SETTINGS_KEYS.button_mode]: "photo",
  [SETTINGS_KEYS.button_photo_size]: "medium",
  [SETTINGS_KEYS.time_zone]: null,
  [SETTINGS_KEYS.time_zone_override]: null,
  [SETTINGS_KEYS.location_tier]: null,
  [SETTINGS_KEYS.offline_captions_app_running]: false,
}

const CORE_SETTINGS_KEYS = [
  SETTINGS_KEYS.sensing_enabled,
  SETTINGS_KEYS.power_saving_mode,
  SETTINGS_KEYS.always_on_status_bar,
  SETTINGS_KEYS.bypass_vad_for_debugging,
  SETTINGS_KEYS.bypass_audio_encoding_for_debugging,
  SETTINGS_KEYS.metric_system_enabled,
  SETTINGS_KEYS.enforce_local_transcription,
  SETTINGS_KEYS.button_press_mode,
  SETTINGS_KEYS.default_wearable,
  SETTINGS_KEYS.device_name,
  SETTINGS_KEYS.preferred_mic,
  SETTINGS_KEYS.contextual_dashboard_enabled,
  SETTINGS_KEYS.head_up_angle,
  SETTINGS_KEYS.brightness,
  SETTINGS_KEYS.auto_brightness,
  SETTINGS_KEYS.dashboard_height,
  SETTINGS_KEYS.dashboard_depth,
  SETTINGS_KEYS.button_mode,
  SETTINGS_KEYS.button_photo_size,
  SETTINGS_KEYS.offline_captions_app_running,
]

interface SettingsState {
  // Settings values
  settings: Record<string, any>

  // Loading states
  isInitialized: boolean
  loadingKeys: Set<string>

  // Actions
  setSetting: (key: string, value: any, updateCore?: boolean, updateServer?: boolean) => Promise<void>
  setSettings: (updates: Record<string, any>, updateCore?: boolean, updateServer?: boolean) => Promise<void>
  setManyLocally: (settings: Record<string, any>) => Promise<void>
  getSetting: (key: string) => any
  loadSetting: (key: string) => Promise<any>
  loadAllSettings: () => Promise<void>
  initUserSettings: () => Promise<void>

  // Utility methods
  getDefaultValue: (key: string) => any
  handleSpecialCases: (key: string) => Promise<any>
  getRestUrl: () => string
  getWsUrl: () => string
  getCoreSettings: () => Record<string, any>
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    settings: {...DEFAULT_SETTINGS},
    isInitialized: false,
    loadingKeys: new Set(),

    setSetting: async (key: string, value: any, updateCore = true, updateServer = true) => {
      try {
        // Update store immediately for optimistic UI
        set(state => ({
          settings: {...state.settings, [key]: value},
        }))

        // Persist to AsyncStorage
        const jsonValue = JSON.stringify(value)
        await AsyncStorage.setItem(key, jsonValue)

        // Update core settings if needed
        if (CORE_SETTINGS_KEYS.includes(key) && updateCore) {
          bridge.updateSettings({[key]: value})
        }

        // Sync with server if needed
        if (updateServer) {
          await restComms.writeUserSettings({[key]: value})
        }
      } catch (error) {
        console.error(`Failed to save setting (${key}):`, error)

        // Rollback on error
        const oldValue = await get().loadSetting(key)
        set(state => ({
          settings: {...state.settings, [key]: oldValue},
        }))

        throw error
      }
    },

    setSettings: async (updates: Record<string, any>, updateCore = true, updateServer = true) => {
      try {
        // Update store immediately
        set(state => ({
          settings: {...state.settings, ...updates},
        }))

        // Persist all to AsyncStorage
        await Promise.all(
          Object.entries(updates).map(([key, value]) => AsyncStorage.setItem(key, JSON.stringify(value))),
        )

        // Update core settings
        if (updateCore) {
          const coreUpdates: Record<string, any> = {}
          Object.keys(updates).forEach(key => {
            if (CORE_SETTINGS_KEYS.includes(key)) {
              coreUpdates[key] = updates[key]
            }
          })
          if (Object.keys(coreUpdates).length > 0) {
            bridge.updateSettings(coreUpdates)
          }
        }

        // Sync with server
        if (updateServer) {
          await restComms.writeUserSettings(updates)
        }
      } catch (error) {
        console.error("Failed to save settings:", error)

        // Rollback all on error
        const oldValues: Record<string, any> = {}
        for (const key of Object.keys(updates)) {
          oldValues[key] = await get().loadSetting(key)
        }
        set(state => ({
          settings: {...state.settings, ...oldValues},
        }))

        throw error
      }
    },

    getSetting: (key: string) => {
      const state = get()

      const specialCase = state.handleSpecialCases(key)
      if (specialCase !== null) {
        return specialCase
      }

      return state.settings[key] ?? DEFAULT_SETTINGS[key]
    },

    getDefaultValue: (key: string) => {
      if (key === SETTINGS_KEYS.time_zone) {
        return getTimeZone()
      }
      if (key === SETTINGS_KEYS.DEV_MODE) {
        return isDeveloperBuildOrTestflight()
      }
      return DEFAULT_SETTINGS[key]
    },

    handleSpecialCases: (key: string) => {
      const state = get()
      if (key === SETTINGS_KEYS.time_zone) {
        const override = state.getSetting(SETTINGS_KEYS.time_zone_override)
        if (override) {
          return override
        }
        return getTimeZone()
      }
      return null
    },

    loadSetting: async (key: string) => {
      const state = get()
      try {
        // Check for special cases first
        const specialCase = state.handleSpecialCases(key)
        if (specialCase !== null) {
          return specialCase
        }

        const jsonValue = await AsyncStorage.getItem(key)
        if (jsonValue !== null) {
          const value = JSON.parse(jsonValue)

          // Update store with loaded value
          set(state => ({
            settings: {...state.settings, [key]: value},
          }))

          return value
        }

        const defaultValue = get().getDefaultValue(key)
        return defaultValue
      } catch (error) {
        console.error(`Failed to load setting (${key}):`, error)
        return get().getDefaultValue(key)
      }
    },

    setManyLocally: async (settings: Record<string, any>) => {
      // Update store immediately
      set(state => ({
        settings: {...state.settings, ...settings},
      }))

      // Persist all to AsyncStorage
      await Promise.all(
        Object.entries(settings).map(([key, value]) => AsyncStorage.setItem(key, JSON.stringify(value))),
      )

      // Update core settings
      const coreUpdates: Record<string, any> = {}
      Object.keys(settings).forEach(key => {
        if (CORE_SETTINGS_KEYS.includes(key)) {
          coreUpdates[key] = settings[key]
        }
      })
      if (Object.keys(coreUpdates).length > 0) {
        bridge.updateSettings(coreUpdates)
      }
    },

    loadAllSettings: async () => {
      set(_state => ({
        loadingKeys: new Set(Object.values(SETTINGS_KEYS)),
      }))

      const loadedSettings: Record<string, any> = {}

      for (const key of Object.values(SETTINGS_KEYS)) {
        try {
          const value = await get().loadSetting(key)
          loadedSettings[key] = value
        } catch (error) {
          console.error(`Failed to load setting ${key}:`, error)
          loadedSettings[key] = DEFAULT_SETTINGS[key]
        }
      }

      set({
        settings: loadedSettings,
        isInitialized: true,
        loadingKeys: new Set(),
      })
    },

    initUserSettings: async () => {
      const timeZone = get().getSetting(SETTINGS_KEYS.time_zone)
      await get().setSetting(SETTINGS_KEYS.time_zone, timeZone, true, true)
      set({isInitialized: true})
    },

    getRestUrl: () => {
      const serverUrl = get().getSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL)
      const url = new URL(serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "https" : "http"}://${url.hostname}:${url.port || (secure ? 443 : 80)}`
    },

    getWsUrl: () => {
      const serverUrl = get().getSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL)
      const url = new URL(serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "wss" : "ws"}://${url.hostname}:${url.port || (secure ? 443 : 80)}/glasses-ws`
    },

    getCoreSettings: () => {
      const state = get()
      const coreSettings: Record<string, any> = {}

      CORE_SETTINGS_KEYS.forEach(key => {
        coreSettings[key] = state.getSetting(key)
      })

      return coreSettings
    },
  })),
)

// Initialize settings on app startup
export const initializeSettings = async () => {
  await useSettingsStore.getState().loadAllSettings()
  // await useSettingsStore.getState().initUserSettings()
}

// Utility hooks for common patterns
export const useSetting = <T = any>(key: string): [T, (value: T) => Promise<void>] => {
  const value = useSettingsStore(state => state.settings[key] as T)
  const setSetting = useSettingsStore(state => state.setSetting)

  return [value ?? DEFAULT_SETTINGS[key], (newValue: T) => setSetting(key, newValue)]
}

export const useSettings = (keys: string[]): Record<string, any> => {
  return useSettingsStore(state => {
    const result: Record<string, any> = {}
    keys.forEach(key => {
      result[key] = state.getSetting(key)
    })
    return result
  })
}

// Selectors for specific settings (memoized automatically by Zustand)
// export const useDevMode = () => useSetting<boolean>(SETTINGS_KEYS.DEV_MODE)
// export const useNotificationsEnabled = () => useSetting<boolean>(SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS)

// Example usage:
/**
 * // In a component:
 * function ThemeToggle() {
 *   const [theme, setTheme] = useTheme()
 *
 *   return (
 *     <Switch
 *       value={theme === 'dark'}
 *       onValueChange={(isDark) => setTheme(isDark ? 'dark' : 'light')}
 *     />
 *   )
 * }
 *
 * // Or with multiple settings:
 * function NotificationSettings() {
 *   const settings = useSettings([
 *     SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS,
 *     SETTINGS_KEYS.NOTIFICATION_APP_PREFERENCES
 *   ])
 *   const setSetting = useSettingsStore(state => state.setSetting)
 *
 *   return (
 *     <Switch
 *       value={settings[SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS]}
 *       onValueChange={(enabled) =>
 *         setSetting(SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS, enabled)
 *       }
 *     />
 *   )
 * }
 *
 * // Subscribe to specific changes outside React:
 * const unsubscribe = useSettingsStore.subscribe(
 *   state => state.settings[SETTINGS_KEYS.THEME_PREFERENCE],
 *   (theme) => console.log('Theme changed to:', theme)
 * )
 */
