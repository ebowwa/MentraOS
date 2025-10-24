import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {getTimeZone} from "react-native-localize"
import restComms from "@/services/RestComms"
import {isDeveloperBuildOrTestflight} from "@/utils/buildDetection"
import CoreModule from "core"
import Toast from "react-native-toast-message"
export const SETTINGS_KEYS = {
  // feature flags:
  dev_mode: "dev_mode",
  enable_squircles: "enable_squircles",
  debug_console: "debug_console",
  // ui state:
  default_wearable: "default_wearable",
  device_name: "device_name",
  device_address: "device_address",
  onboarding_completed: "onboarding_completed",
  has_ever_activated_app: "has_ever_activated_app",
  visited_livecaptions_settings: "visited_livecaptions_settings",
  // ui settings:
  enable_phone_notifications: "enable_phone_notifications",
  settings_access_count: "settings_access_count",
  custom_backend_url: "custom_backend_url",
  reconnect_on_app_foreground: "reconnect_on_app_foreground",
  theme_preference: "theme_preference",
  // core settings:
  sensing_enabled: "sensing_enabled",
  power_saving_mode: "power_saving_mode",
  always_on_status_bar: "always_on_status_bar",
  bypass_vad_for_debugging: "bypass_vad_for_debugging",
  bypass_audio_encoding_for_debugging: "bypass_audio_encoding_for_debugging",
  metric_system: "metric_system",
  enforce_local_transcription: "enforce_local_transcription",
  preferred_mic: "preferred_mic",
  screen_disabled: "screen_disabled",
  // glasses settings:
  contextual_dashboard: "contextual_dashboard",
  head_up_angle: "head_up_angle",
  brightness: "brightness",
  auto_brightness: "auto_brightness",
  dashboard_height: "dashboard_height",
  dashboard_depth: "dashboard_depth",
  gallery_mode: "gallery_mode",
  // button settings
  button_mode: "button_mode",
  button_photo_size: "button_photo_size",
  button_video_settings: "button_video_settings",
  button_camera_led: "button_camera_led",
  button_video_settings_width: "button_video_settings_width",
  button_max_recording_time: "button_max_recording_time",
  core_token: "core_token",
  server_url: "server_url",
  location_tier: "location_tier",
  show_advanced_settings: "show_advanced_settings",
  // time zone settings
  time_zone: "time_zone",
  time_zone_override: "time_zone_override",
  // offline applets
  offline_mode: "offline_mode",
  offline_captions_running: "offline_captions_running",
  // offline_camera_running: "offline_camera_running",
  // Button action settings
  default_button_action_enabled: "default_button_action_enabled",
  default_button_action_app: "default_button_action_app",
  // notifications
  notifications_enabled: "notifications_enabled",
  notifications_blocklist: "notifications_blocklist",
} as const
const DEFAULT_SETTINGS: Record<string, any> = {
  // feature flags / dev:
  [SETTINGS_KEYS.dev_mode]: false,
  [SETTINGS_KEYS.enable_squircles]: false,
  [SETTINGS_KEYS.debug_console]: false,
  // ui state:
  [SETTINGS_KEYS.default_wearable]: "",
  [SETTINGS_KEYS.device_name]: "",
  [SETTINGS_KEYS.device_address]: "",
  [SETTINGS_KEYS.onboarding_completed]: false,
  [SETTINGS_KEYS.has_ever_activated_app]: false,
  [SETTINGS_KEYS.visited_livecaptions_settings]: false,
  // ui settings:
  [SETTINGS_KEYS.enable_phone_notifications]: false,
  [SETTINGS_KEYS.settings_access_count]: 0,
  [SETTINGS_KEYS.custom_backend_url]: "https://api.mentra.glass:443",
  [SETTINGS_KEYS.reconnect_on_app_foreground]: false,
  [SETTINGS_KEYS.theme_preference]: "system",
  // core settings:
  [SETTINGS_KEYS.sensing_enabled]: true,
  [SETTINGS_KEYS.power_saving_mode]: false,
  [SETTINGS_KEYS.always_on_status_bar]: false,
  [SETTINGS_KEYS.bypass_vad_for_debugging]: true,
  [SETTINGS_KEYS.bypass_audio_encoding_for_debugging]: false,
  [SETTINGS_KEYS.metric_system]: false,
  [SETTINGS_KEYS.enforce_local_transcription]: false,
  [SETTINGS_KEYS.preferred_mic]: "phone",
  [SETTINGS_KEYS.screen_disabled]: false,
  // glasses settings:
  [SETTINGS_KEYS.contextual_dashboard]: true,
  [SETTINGS_KEYS.head_up_angle]: 45,
  [SETTINGS_KEYS.brightness]: 50,
  [SETTINGS_KEYS.auto_brightness]: true,
  [SETTINGS_KEYS.dashboard_height]: 4,
  [SETTINGS_KEYS.dashboard_depth]: 5,
  [SETTINGS_KEYS.gallery_mode]: false,
  // button settings
  [SETTINGS_KEYS.button_mode]: "photo",
  [SETTINGS_KEYS.button_photo_size]: "medium",
  [SETTINGS_KEYS.button_video_settings]: {width: 1920, height: 1080, fps: 30},
  [SETTINGS_KEYS.button_camera_led]: true,
  [SETTINGS_KEYS.button_max_recording_time]: 10,
  [SETTINGS_KEYS.location_tier]: "",
  // time zone settings
  [SETTINGS_KEYS.time_zone]: "",
  [SETTINGS_KEYS.time_zone_override]: "",
  // offline applets
  [SETTINGS_KEYS.offline_mode]: false,
  [SETTINGS_KEYS.offline_captions_running]: false,
  // [SETTINGS_KEYS.offline_camera_running]: false,
  // button action settings
  [SETTINGS_KEYS.default_button_action_enabled]: true,
  [SETTINGS_KEYS.default_button_action_app]: "com.mentra.camera",
  // notifications
  [SETTINGS_KEYS.notifications_enabled]: true,
  [SETTINGS_KEYS.notifications_blocklist]: [],
}
const CORE_SETTINGS_KEYS = [
  SETTINGS_KEYS.sensing_enabled,
  SETTINGS_KEYS.power_saving_mode,
  SETTINGS_KEYS.always_on_status_bar,
  SETTINGS_KEYS.bypass_vad_for_debugging,
  SETTINGS_KEYS.bypass_audio_encoding_for_debugging,
  SETTINGS_KEYS.metric_system,
  SETTINGS_KEYS.enforce_local_transcription,
  SETTINGS_KEYS.preferred_mic,
  SETTINGS_KEYS.screen_disabled,
  // glasses settings:
  SETTINGS_KEYS.contextual_dashboard,
  SETTINGS_KEYS.head_up_angle,
  SETTINGS_KEYS.brightness,
  SETTINGS_KEYS.auto_brightness,
  SETTINGS_KEYS.dashboard_height,
  SETTINGS_KEYS.dashboard_depth,
  SETTINGS_KEYS.gallery_mode,
  // button:
  SETTINGS_KEYS.button_mode,
  SETTINGS_KEYS.button_photo_size,
  SETTINGS_KEYS.button_video_settings,
  SETTINGS_KEYS.button_camera_led,
  SETTINGS_KEYS.button_max_recording_time,
  SETTINGS_KEYS.default_wearable,
  SETTINGS_KEYS.device_name,
  SETTINGS_KEYS.device_address,
  // offline applets:
  SETTINGS_KEYS.offline_captions_running,
  // SETTINGS_KEYS.offline_camera_running,
  // notifications:
  SETTINGS_KEYS.notifications_enabled,
  SETTINGS_KEYS.notifications_blocklist,
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
        try {
          // Update core settings if needed
          if (CORE_SETTINGS_KEYS.includes(key as (typeof CORE_SETTINGS_KEYS)[number]) && updateCore) {
            CoreModule.updateSettings({[key]: value})
          }
        } catch (e) {
          console.log("SETTINGS: couldn't update core settings: ", e)
        }
        // Sync with server if needed
        try {
          if (updateServer) {
            await restComms.writeUserSettings({[key]: value})
          }
        } catch (e) {
          console.log("SETTINGS: couldn't sync setting to server: ", e)
        }
      } catch (error) {
        console.error(`Failed to save setting (${key}):`, error)
        // Rollback on error
        const oldValue = await get().loadSetting(key)
        set(state => ({
          settings: {...state.settings, [key]: oldValue},
        }))
        Toast.show({
          type: "error",
          text1: "Failed to save setting",
          text2: error + "",
        })
        // throw error
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
            if (CORE_SETTINGS_KEYS.includes(key as (typeof CORE_SETTINGS_KEYS)[number])) {
              coreUpdates[key] = updates[key]
            }
          })
          if (Object.keys(coreUpdates).length > 0) {
            CoreModule.updateSettings(coreUpdates)
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
      if (key === SETTINGS_KEYS.dev_mode) {
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
        if (CORE_SETTINGS_KEYS.includes(key as (typeof CORE_SETTINGS_KEYS)[number])) {
          coreUpdates[key] = settings[key]
        }
      })
      if (Object.keys(coreUpdates).length > 0) {
        CoreModule.updateSettings(coreUpdates)
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
      const serverUrl = get().getSetting(SETTINGS_KEYS.custom_backend_url)
      const url = new URL(serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "https" : "http"}://${url.hostname}:${url.port || (secure ? 443 : 80)}`
    },
    getWsUrl: () => {
      const serverUrl = get().getSetting(SETTINGS_KEYS.custom_backend_url)
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
      console.log(coreSettings)
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
// export const useSettings = (keys: string[]): Record<string, any> => {
//   return useSettingsStore(state => {
//     const result: Record<string, any> = {}
//     keys.forEach(key => {
//       result[key] = state.getSetting(key)
//     })
//     return result
//   })
// }
// Selectors for specific settings (memoized automatically by Zustand)
// export const useDevMode = () => useSetting<boolean>(SETTINGS_KEYS.dev_mode)
// export const useNotificationsEnabled = () => useSetting<boolean>(SETTINGS_KEYS.enable_phone_notifications)
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
 *     SETTINGS_KEYS.enable_phone_notifications,
 *     SETTINGS_KEYS.notification_app_preferences
 *   ])
 *   const setSetting = useSettingsStore(state => state.setSetting)
 *
 *   return (
 *     <Switch
 *       value={settings[SETTINGS_KEYS.enable_phone_notifications]}
 *       onValueChange={(enabled) =>
 *         setSetting(SETTINGS_KEYS.enable_phone_notifications, enabled)
 *       }
 *     />
 *   )
 * }
 *
 * // Subscribe to specific changes outside React:
 * const unsubscribe = useSettingsStore.subscribe(
 *   state => state.settings[SETTINGS_KEYS.theme_preference],
 *   (theme) => console.log('Theme changed to:', theme)
 * )
 */
