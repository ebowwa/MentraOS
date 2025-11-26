import {getTimeZone} from "react-native-localize"
import {AsyncResult, result as Res, Result} from "typesafe-ts"
import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"

import restComms from "@/services/RestComms"
import {storage} from "@/utils/storage"

interface Setting {
  key: string
  defaultValue: () => any
  writable: boolean
  saveOnServer: boolean
  // change the key to a different key based on the indexer
  // NEVER do any network calls in the indexer (or performance will suffer greatly
  indexer?: (key: string) => string
  // optionally override the value of the setting when it's accessed
  override?: () => any
  // onWrite?: () => void
}

export const SETTINGS: Record<string, Setting> = {
  // feature flags / mantle settings:
  dev_mode: {key: "dev_mode", defaultValue: () => __DEV__, writable: true, saveOnServer: true},
  enable_squircles: {key: "enable_squircles", defaultValue: () => true, writable: true, saveOnServer: true},
  debug_console: {key: "debug_console", defaultValue: () => false, writable: true, saveOnServer: true},
  china_deployment: {
    key: "china_deployment",
    defaultValue: () => (process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? true : false),
    override: () => (process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? true : false),
    writable: false,
    saveOnServer: false,
  },
  backend_url: {
    key: "backend_url",
    defaultValue: () =>
      process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china"
        ? "https://api.mentraglass.cn:443"
        : "https://api.mentra.glass:443",
    writable: true,
    override: () => {
      // Session override takes precedence (for internal dev escape hatch)
      const sessionOverride = useSettingsStore.getState().sessionBackendOverride
      if (sessionOverride) {
        return sessionOverride
      }
      if (process.env.EXPO_PUBLIC_BACKEND_URL_OVERRIDE) {
        return process.env.EXPO_PUBLIC_BACKEND_URL_OVERRIDE
      }
      return undefined
    },
    saveOnServer: true,
  },
  store_url: {
    key: "store_url",
    defaultValue: () =>
      process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china"
        ? "https://store.mentraglass.cn"
        : "https://apps.mentra.glass",
    writable: true,
    override: () => {
      if (process.env.EXPO_PUBLIC_STORE_URL_OVERRIDE) {
        return process.env.EXPO_PUBLIC_STORE_URL_OVERRIDE
      }
      return undefined
    },
    saveOnServer: true,
  },
  reconnect_on_app_foreground: {
    key: "reconnect_on_app_foreground",
    defaultValue: () => false,
    writable: true,
    saveOnServer: true,
  },
  location_tier: {key: "location_tier", defaultValue: () => "", writable: true, saveOnServer: true},
  // state:
  core_token: {key: "core_token", defaultValue: () => "", writable: true, saveOnServer: true},
  default_wearable: {key: "default_wearable", defaultValue: () => "", writable: true, saveOnServer: true},
  device_name: {key: "device_name", defaultValue: () => "", writable: true, saveOnServer: true},
  device_address: {key: "device_address", defaultValue: () => "", writable: true, saveOnServer: true},
  // ui state:
  theme_preference: {key: "theme_preference", defaultValue: () => "system", writable: true, saveOnServer: true},
  enable_phone_notifications: {
    key: "enable_phone_notifications",
    defaultValue: () => false,
    writable: true,
    saveOnServer: true,
  },
  settings_access_count: {key: "settings_access_count", defaultValue: () => 0, writable: true, saveOnServer: true},
  show_advanced_settings: {
    key: "show_advanced_settings",
    defaultValue: () => false,
    writable: true,
    saveOnServer: false,
  },
  onboarding_completed: {key: "onboarding_completed", defaultValue: () => false, writable: true, saveOnServer: true},

  // core settings:
  sensing_enabled: {key: "sensing_enabled", defaultValue: () => true, writable: true, saveOnServer: true},
  power_saving_mode: {key: "power_saving_mode", defaultValue: () => false, writable: true, saveOnServer: true},
  always_on_status_bar: {key: "always_on_status_bar", defaultValue: () => false, writable: true, saveOnServer: true},
  bypass_vad_for_debugging: {
    key: "bypass_vad_for_debugging",
    defaultValue: () => true,
    writable: true,
    saveOnServer: true,
  },
  bypass_audio_encoding_for_debugging: {
    key: "bypass_audio_encoding_for_debugging",
    defaultValue: () => false,
    writable: true,
    saveOnServer: true,
  },
  metric_system: {key: "metric_system", defaultValue: () => false, writable: true, saveOnServer: true},
  enforce_local_transcription: {
    key: "enforce_local_transcription",
    defaultValue: () => false,
    writable: true,
    saveOnServer: true,
  },
  preferred_mic: {
    key: "preferred_mic",
    defaultValue: () => "auto",
    writable: true,
    indexer: (key: string) => {
      const glasses = useSettingsStore.getState().getSetting(SETTINGS.default_wearable.key)
      if (glasses) {
        return `${key}:${glasses}`
      }
      return key
    },
    saveOnServer: true,
  },
  screen_disabled: {key: "screen_disabled", defaultValue: () => false, writable: true, saveOnServer: false},
  // glasses settings:
  contextual_dashboard: {key: "contextual_dashboard", defaultValue: () => true, writable: true, saveOnServer: true},
  head_up_angle: {key: "head_up_angle", defaultValue: () => 45, writable: true, saveOnServer: true},
  brightness: {key: "brightness", defaultValue: () => 50, writable: true, saveOnServer: true},
  auto_brightness: {key: "auto_brightness", defaultValue: () => true, writable: true, saveOnServer: true},
  dashboard_height: {key: "dashboard_height", defaultValue: () => 4, writable: true, saveOnServer: true},
  dashboard_depth: {key: "dashboard_depth", defaultValue: () => 5, writable: true, saveOnServer: true},
  gallery_mode: {key: "gallery_mode", defaultValue: () => false, writable: true, saveOnServer: true},
  // button settings
  button_mode: {key: "button_mode", defaultValue: () => "photo", writable: true, saveOnServer: true},
  button_photo_size: {key: "button_photo_size", defaultValue: () => "large", writable: true, saveOnServer: true},
  button_video_settings: {
    key: "button_video_settings",
    defaultValue: () => ({width: 1920, height: 1080, fps: 30}),
    writable: true,
    saveOnServer: true,
  },
  button_camera_led: {key: "button_camera_led", defaultValue: () => true, writable: true, saveOnServer: true},
  button_video_settings_width: {
    key: "button_video_settings_width",
    defaultValue: () => 1920,
    writable: true,
    saveOnServer: true,
  },
  button_max_recording_time: {
    key: "button_max_recording_time",
    defaultValue: () => 10,
    writable: true,
    saveOnServer: true,
  },

  // time zone settings
  time_zone: {
    key: "time_zone",
    defaultValue: () => "",
    writable: true,
    override: () => {
      const override = useSettingsStore.getState().getSetting(SETTINGS.time_zone_override.key)
      if (override) {
        return override
      }
      return getTimeZone()
    },
    saveOnServer: true,
  },
  time_zone_override: {key: "time_zone_override", defaultValue: () => "", writable: true, saveOnServer: true},
  // offline applets
  offline_mode: {key: "offline_mode", defaultValue: () => false, writable: true, saveOnServer: true},
  offline_captions_running: {
    key: "offline_captions_running",
    defaultValue: () => false,
    writable: true,
    saveOnServer: true,
  },
  // button action settings
  default_button_action_enabled: {
    key: "default_button_action_enabled",
    defaultValue: () => true,
    writable: true,
    saveOnServer: true,
  },
  default_button_action_app: {
    key: "default_button_action_app",
    defaultValue: () => "com.mentra.camera",
    writable: true,
    saveOnServer: true,
  },
  // notifications
  notifications_enabled: {key: "notifications_enabled", defaultValue: () => true, writable: true, saveOnServer: true},
  notifications_blocklist: {key: "notifications_blocklist", defaultValue: () => [], writable: true, saveOnServer: true},
} as const

// these settings are automatically synced to the core:
const CORE_SETTINGS_KEYS: string[] = [
  SETTINGS.sensing_enabled.key,
  SETTINGS.power_saving_mode.key,
  SETTINGS.always_on_status_bar.key,
  SETTINGS.bypass_vad_for_debugging.key,
  SETTINGS.bypass_audio_encoding_for_debugging.key,
  SETTINGS.metric_system.key,
  SETTINGS.enforce_local_transcription.key,
  SETTINGS.preferred_mic.key,
  SETTINGS.screen_disabled.key,
  // glasses settings:
  SETTINGS.contextual_dashboard.key,
  SETTINGS.head_up_angle.key,
  SETTINGS.brightness.key,
  SETTINGS.auto_brightness.key,
  SETTINGS.dashboard_height.key,
  SETTINGS.dashboard_depth.key,
  SETTINGS.gallery_mode.key,
  // button:
  SETTINGS.button_mode.key,
  SETTINGS.button_photo_size.key,
  SETTINGS.button_video_settings.key,
  SETTINGS.button_camera_led.key,
  SETTINGS.button_max_recording_time.key,
  SETTINGS.default_wearable.key,
  SETTINGS.device_name.key,
  SETTINGS.device_address.key,
  // offline applets:
  SETTINGS.offline_captions_running.key,
  // SETTINGS.offline_camera_running.key,
  // notifications:
  SETTINGS.notifications_enabled.key,
  SETTINGS.notifications_blocklist.key,
]

// const PER_GLASSES_SETTINGS_KEYS: string[] = [SETTINGS.preferred_mic.key]

interface SettingsState {
  // Settings values
  settings: Record<string, any>
  // Loading states
  isInitialized: boolean
  // Session-only overrides (not persisted, cleared on app restart)
  sessionBackendOverride: string | null
  // Actions
  setSetting: (key: string, value: any, updateServer?: boolean) => AsyncResult<void, Error>
  setManyLocally: (settings: Record<string, any>) => AsyncResult<void, Error>
  getSetting: (key: string) => any
  setSessionBackendOverride: (url: string | null) => void
  // loadSetting: (key: string) => AsyncResult<void, Error>
  loadAllSettings: () => AsyncResult<void, Error>
  // Utility methods
  getRestUrl: () => string
  getWsUrl: () => string
  getCoreSettings: () => Record<string, any>
}

const getDefaultSettings = () =>
  Object.keys(SETTINGS).reduce(
    (acc, key) => {
      acc[key] = SETTINGS[key].defaultValue()
      return acc
    },
    {} as Record<string, any>,
  )

const migrateSettings = () => {
  useSettingsStore.getState().setSetting(SETTINGS.enable_squircles.key, true, true)
  // Force light mode - dark mode is not complete yet
  useSettingsStore.getState().setSetting(SETTINGS.theme_preference.key, "light", true)
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    settings: getDefaultSettings(),
    isInitialized: false,
    sessionBackendOverride: null,
    loadingKeys: new Set(),
    setSetting: (key: string, value: any, updateServer = true): AsyncResult<void, Error> => {
      return Res.try_async(async () => {
        const setting = SETTINGS[key]
        const originalKey = key

        if (!setting) {
          console.error(`SETTINGS: SET: ${originalKey} is not a valid setting!`)
          return
        }

        if (setting.indexer) {
          key = setting.indexer(originalKey)
        }

        if (!setting.writable) {
          console.error(`SETTINGS: ${originalKey} is not writable!`)
          return
        }

        // Update store immediately for optimistic UI
        set(state => ({
          settings: {...state.settings, [key]: value},
        }))

        console.log(`SETTINGS: SET: ${key} = ${value}`)

        // Persist to AsyncStorage
        let res = await storage.save(key, value)
        if (res.is_error()) {
          console.error(`SETTINGS: couldn't save setting to storage: `, res.error)
        }

        // Sync with server if needed
        if (updateServer) {
          const result = await restComms.writeUserSettings({[key]: value})
          if (result.is_error()) {
            console.log("SETTINGS: couldn't sync setting to server: ", result.error)
          }
        }
      })
    },
    getSetting: (key: string) => {
      const state = get()
      const originalKey = key
      const setting = SETTINGS[originalKey]

      if (!setting) {
        console.error(`SETTINGS: GET: ${originalKey} is not a valid setting!`)
        return undefined
      }

      if (setting.override) {
        let override = setting.override()
        if (override !== undefined) {
          return override
        }
      }

      if (setting.indexer) {
        key = setting.indexer(originalKey)
      }

      // console.log(`GET SETTING: ${key} = ${state.settings[key]}`)
      try {
        return state.settings[key] ?? SETTINGS[originalKey].defaultValue()
      } catch (e) {
        // for dynamically created settings, we need to create a new setting in SETTINGS:
        console.log(`Failed to get setting, creating new setting:(${key}):`, e)
        SETTINGS[key] = {key: key, defaultValue: () => undefined, writable: true, saveOnServer: false}
        return SETTINGS[key].defaultValue()
      }
    },
    // batch update many settings from the server:
    setManyLocally: (settings: Record<string, any>): AsyncResult<void, Error> => {
      return Res.try_async(async () => {
        // Update store immediately
        set(state => ({
          settings: {...state.settings, ...settings},
        }))
        // Persist all to storage
        await Promise.all(Object.entries(settings).map(([key, value]) => storage.save(key, value)))
      })
    },
    // Session-only backend override (not persisted, for internal dev use)
    setSessionBackendOverride: (url: string | null) => {
      console.log(`SETTINGS: Session backend override set to: ${url}`)
      set({sessionBackendOverride: url})
    },
    // loads any preferences that have been changed from the default and saved to DISK!
    loadAllSettings: (): AsyncResult<void, Error> => {
      return Res.try_async(async () => {
        const state = get()
        let loadedSettings: Record<string, any> = {}

        if (state.isInitialized) {
          migrateSettings()
          return undefined
        }

        for (const setting of Object.values(SETTINGS)) {
          // load all subkeys for an indexed setting:
          if (setting?.indexer) {
            console.log(`SETTINGS: LOAD: ${setting.key} with indexer!`)

            let res: Result<Record<string, unknown>, Error> = storage.loadSubKeys(setting.key)
            if (res.is_error()) {
              console.log(`SETTINGS: LOAD: ${setting.key}`, res.error)
              continue
            }

            let subKeys: Record<string, unknown> = res.value
            console.log(`SETTINGS: LOAD: ${setting.key} subkeys are set!`, subKeys)
            loadedSettings = {...loadedSettings, ...subKeys}
            continue
          }

          let res = storage.load<any>(setting.key)
          if (res.is_error()) {
            // this setting isn't set from the default, so we don't load anything
            continue
          }
          // normal key:value pair:
          let value = res.value
          loadedSettings[setting.key] = value
        }

        // console.log("##############################################")
        // console.log(loadedSettings)
        // console.log("##############################################")

        set(state => ({
          isInitialized: true,
          settings: {...state.settings, ...loadedSettings},
        }))
        migrateSettings()
      })
    },
    getRestUrl: () => {
      const serverUrl = get().getSetting(SETTINGS.backend_url.key)
      const url = new URL(serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "https" : "http"}://${url.hostname}:${url.port || (secure ? 443 : 80)}`
    },
    getWsUrl: () => {
      const serverUrl = get().getSetting(SETTINGS.backend_url.key)
      const url = new URL(serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "wss" : "ws"}://${url.hostname}:${url.port || (secure ? 443 : 80)}/glasses-ws`
    },
    getCoreSettings: () => {
      const state = get()
      const coreSettings: Record<string, any> = {}
      Object.values(SETTINGS).forEach(setting => {
        if (CORE_SETTINGS_KEYS.includes(setting.key)) {
          coreSettings[setting.key] = state.getSetting(setting.key)
        }
      })
      return coreSettings
    },
  })),
)

export const useSetting = <T = any>(key: string): [T, (value: T) => AsyncResult<void, Error>] => {
  const value = useSettingsStore(state => state.getSetting(key))
  const setSetting = useSettingsStore(state => state.setSetting)
  return [value, (newValue: T) => setSetting(key, newValue)]
}
