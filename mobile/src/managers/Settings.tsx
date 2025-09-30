// import bridge from "@/bridge/MantleBridge"
// import restComms from "@/managers/RestComms"
// import AsyncStorage from "@react-native-async-storage/async-storage"
// import {getTimeZone} from "react-native-localize"

// export const SETTINGS_KEYS = {
//   previously_bonded_puck: "previously_bonded_puck",
//   enable_phone_notifications: "enable_phone_notifications",
//   notification_app_preferences: "notification_app_preferences",
//   notification_category_preferences: "notification_category_preferences",
//   onboarding_completed: "onboarding_completed",
//   settings_access_count: "settings_access_count",
//   visited_livecaptions_settings: "visited_livecaptions_settings",
//   custom_backend_url: "custom_backend_url",
//   reconnect_on_app_foreground: "reconnect_on_app_foreground",
//   has_ever_activated_app: "has_ever_activated_app",
//   theme_preference: "theme_preference",
//   dev_mode: "dev_mode",
//   new_ui: "new_ui",
//   sensing_enabled: "sensing_enabled",
//   power_saving_mode: "power_saving_mode",
//   always_on_status_bar: "always_on_status_bar",
//   bypass_vad_for_debugging: "bypass_vad_for_debugging",
//   bypass_audio_encoding_for_debugging: "bypass_audio_encoding_for_debugging",
//   metric_system_enabled: "metric_system_enabled",
//   enforce_local_transcription: "enforce_local_transcription",
//   button_press_mode: "button_press_mode",
//   default_wearable: "default_wearable",
//   device_name: "device_name",
//   preferred_mic: "preferred_mic",
//   contextual_dashboard_enabled: "contextual_dashboard_enabled",
//   head_up_angle: "head_up_angle",
//   brightness: "brightness",
//   auto_brightness: "auto_brightness",
//   dashboard_height: "dashboard_height",
//   dashboard_depth: "dashboard_depth",
//   button_mode: "button_mode",
//   button_photo_size: "button_photo_size",
//   button_video_settings: "button_video_settings",
//   button_camera_led: "button_camera_led",
//   button_video_settings_width: "button_video_settings_width",
//   core_token: "core_token",
//   server_url: "server_url",
//   time_zone: "time_zone",
//   time_zone_override: "time_zone_override",
//   offline_stt: "offline_stt",
//   location_tier: "location_tier",
// }

// const DEFAULT_SETTINGS = {
//   [SETTINGS_KEYS.custom_backend_url]: "https://api.mentra.glass:443",
//   [SETTINGS_KEYS.enable_phone_notifications]: false,
//   [SETTINGS_KEYS.notification_app_preferences]: "{}",
//   [SETTINGS_KEYS.notification_category_preferences]: JSON.stringify({
//     social: true,
//     communication: true,
//     entertainment: true,
//     productivity: true,
//     news: true,
//     shopping: true,
//     other: true,
//   }),
//   [SETTINGS_KEYS.onboarding_completed]: false,
//   [SETTINGS_KEYS.settings_access_count]: 0,
//   [SETTINGS_KEYS.visited_livecaptions_settings]: false,
//   [SETTINGS_KEYS.reconnect_on_app_foreground]: true,
//   [SETTINGS_KEYS.has_ever_activated_app]: false,
//   [SETTINGS_KEYS.theme_preference]: "system",
//   [SETTINGS_KEYS.dev_mode]: false,
//   [SETTINGS_KEYS.new_ui]: false,
//   // previously core settings:
//   [SETTINGS_KEYS.sensing_enabled]: true,
//   [SETTINGS_KEYS.power_saving_mode]: false,
//   [SETTINGS_KEYS.always_on_status_bar]: false,
//   [SETTINGS_KEYS.bypass_vad_for_debugging]: true,
//   [SETTINGS_KEYS.bypass_audio_encoding_for_debugging]: false,
//   [SETTINGS_KEYS.metric_system_enabled]: false,
//   [SETTINGS_KEYS.enforce_local_transcription]: false,
//   [SETTINGS_KEYS.button_press_mode]: "photo",
//   [SETTINGS_KEYS.default_wearable]: null,
//   [SETTINGS_KEYS.device_name]: "",
//   [SETTINGS_KEYS.preferred_mic]: "phone",
//   [SETTINGS_KEYS.contextual_dashboard_enabled]: true,
//   [SETTINGS_KEYS.head_up_angle]: 45,
//   [SETTINGS_KEYS.brightness]: 50,
//   [SETTINGS_KEYS.auto_brightness]: true,
//   [SETTINGS_KEYS.dashboard_height]: 4,
//   [SETTINGS_KEYS.dashboard_depth]: 5,
//   [SETTINGS_KEYS.button_mode]: "photo",
//   [SETTINGS_KEYS.button_photo_size]: "medium",
//   // user settings:
//   [SETTINGS_KEYS.time_zone]: null,
//   [SETTINGS_KEYS.time_zone_override]: null,
//   // stt:
//   [SETTINGS_KEYS.offline_stt]: false,
//   // location:
//   [SETTINGS_KEYS.location_tier]: null,
// }

// const CORE_SETTINGS_KEYS = [
//   SETTINGS_KEYS.sensing_enabled,
//   SETTINGS_KEYS.power_saving_mode,
//   SETTINGS_KEYS.always_on_status_bar,
//   SETTINGS_KEYS.bypass_vad_for_debugging,
//   SETTINGS_KEYS.bypass_audio_encoding_for_debugging,
//   SETTINGS_KEYS.metric_system_enabled,
//   SETTINGS_KEYS.enforce_local_transcription,
//   SETTINGS_KEYS.button_press_mode,
//   SETTINGS_KEYS.default_wearable,
//   SETTINGS_KEYS.device_name,
//   SETTINGS_KEYS.preferred_mic,
//   SETTINGS_KEYS.contextual_dashboard_enabled,
//   SETTINGS_KEYS.head_up_angle,
//   SETTINGS_KEYS.brightness,
//   SETTINGS_KEYS.auto_brightness,
//   SETTINGS_KEYS.dashboard_height,
//   SETTINGS_KEYS.dashboard_depth,
//   SETTINGS_KEYS.button_mode,
//   SETTINGS_KEYS.button_photo_size,
//   SETTINGS_KEYS.offline_stt,
// ]

// class Settings {
//   private static instance: Settings

//   private constructor() {}

//   public static getInstance(): Settings {
//     if (!Settings.instance) {
//       Settings.instance = new Settings()
//     }
//     return Settings.instance
//   }

//   public async get(key: string, overrideDefaultValue?: any): Promise<any> {
//     const override = await this.handleSpecialCases(key)
//     if (override) {
//       return override
//     }

//     const defaultValue = overrideDefaultValue ?? (await this.getDefaultValue(key))
//     try {
//       const jsonValue = await AsyncStorage.getItem(key)

//       if (jsonValue !== null) {
//         return JSON.parse(jsonValue)
//       }

//       return defaultValue
//     } catch (error) {
//       console.error(`Failed to load setting (${key}):`, error)
//       return defaultValue
//     }
//   }

//   public async set(key: string, value: any, updateCore: boolean = true, updateServer: boolean = true): Promise<void> {
//     try {
//       const jsonValue = JSON.stringify(value)
//       await AsyncStorage.setItem(key, jsonValue)
//       if (CORE_SETTINGS_KEYS.includes(key)) {
//         if (updateCore) {
//           bridge.updateSettings({[key]: value})
//         }
//       }

//       if (!updateServer) {
//         return
//       }

//       await restComms.writeUserSettings({[key]: value})
//     } catch (error) {
//       console.error(`Failed to save setting (${key}):`, error)
//     }
//   }

//   public async getDefaultValue(key: string): Promise<any> {
//     if (key === SETTINGS_KEYS.time_zone) {
//       return getTimeZone()
//     }
//     return DEFAULT_SETTINGS[key]
//   }

//   public async handleSpecialCases(key: string): Promise<any> {
//     if (key === SETTINGS_KEYS.time_zone) {
//       const override = await this.get(SETTINGS_KEYS.time_zone_override)
//       if (override) {
//         return override
//       }
//       return getTimeZone()
//     }
//     return null
//   }

//   public async initUserSettings(): Promise<void> {
//     const timeZone = await this.get(SETTINGS_KEYS.time_zone)
//     await this.set(SETTINGS_KEYS.time_zone, timeZone, true, true)
//   }

//   public async getRestUrl(): Promise<string> {
//     const serverUrl = await this.get(SETTINGS_KEYS.custom_backend_url)
//     const url = new URL(serverUrl)
//     const secure = url.protocol === "https:"
//     return `${secure ? "https" : "http"}://${url.hostname}:${url.port || (secure ? 443 : 80)}`
//   }

//   public async getWsUrl(): Promise<string> {
//     const serverUrl = await this.get(SETTINGS_KEYS.custom_backend_url)
//     const url = new URL(serverUrl)
//     const secure = url.protocol === "https:"
//     const wsUrl = `${secure ? "wss" : "ws"}://${url.hostname}:${url.port || (secure ? 443 : 80)}/glasses-ws`
//     return wsUrl
//   }

//   public async setManyLocally(settings: any): Promise<any> {
//     for (const key in settings) {
//       await this.set(key, settings[key], true, false)
//     }
//   }

//   public async getCoreSettings(): Promise<any> {
//     const coreSettingsObj: any = {}

//     for (const setting of CORE_SETTINGS_KEYS) {
//       coreSettingsObj[setting] = await this.get(setting)
//     }

//     return coreSettingsObj
//   }
// }

// const settings = Settings.getInstance()
// export default settings
