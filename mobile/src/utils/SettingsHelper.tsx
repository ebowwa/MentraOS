import bridge from "@/bridge/MantleBridge"
import restComms from "@/managers/RestComms"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {getTimeZone} from "react-native-localize"

export const SETTINGS_KEYS = {
  PREVIOUSLY_BONDED_PUCK: "PREVIOUSLY_BONDED_PUCK",
  ENABLE_PHONE_NOTIFICATIONS: "ENABLE_PHONE_NOTIFICATIONS",
  ONBOARDING_COMPLETED: "ONBOARDING_COMPLETED",
  SETTINGS_ACCESS_COUNT: "SETTINGS_ACCESS_COUNT",
  VISITED_LIVECAPTIONS_SETTINGS: "VISITED_LIVECAPTIONS_SETTINGS",
  CUSTOM_BACKEND_URL: "CUSTOM_BACKEND_URL",
  RECONNECT_ON_APP_FOREGROUND: "RECONNECT_ON_APP_FOREGROUND",
  HAS_EVER_ACTIVATED_APP: "HAS_EVER_ACTIVATED_APP",
  THEME_PREFERENCE: "THEME_PREFERENCE",
  DEV_MODE: "DEV_MODE",
  NEW_UI: "NEW_UI",
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
  offline_stt: "offline_stt",
}

const DEFAULT_SETTINGS = {
  [SETTINGS_KEYS.CUSTOM_BACKEND_URL]: "https://api.mentra.glass:443",
  [SETTINGS_KEYS.ENABLE_PHONE_NOTIFICATIONS]: false,
  [SETTINGS_KEYS.ONBOARDING_COMPLETED]: false,
  [SETTINGS_KEYS.SETTINGS_ACCESS_COUNT]: 0,
  [SETTINGS_KEYS.VISITED_LIVECAPTIONS_SETTINGS]: false,
  [SETTINGS_KEYS.RECONNECT_ON_APP_FOREGROUND]: true,
  [SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP]: false,
  [SETTINGS_KEYS.THEME_PREFERENCE]: "system",
  [SETTINGS_KEYS.DEV_MODE]: false,
  [SETTINGS_KEYS.NEW_UI]: false,
  // previously core settings:
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
  // user settings:
  [SETTINGS_KEYS.time_zone]: null,
  [SETTINGS_KEYS.time_zone_override]: null,
  // stt:
  [SETTINGS_KEYS.offline_stt]: false,
}

export const getSettingDefault = (key: string) => {
  if (key === SETTINGS_KEYS.time_zone) {
    return getTimeZone()
  }
  return DEFAULT_SETTINGS[key]
}

const saveSetting = async (
  key: string,
  value: any,
  updateCore: boolean = true,
  updateServer: boolean = true,
): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(value)
    await AsyncStorage.setItem(key, jsonValue)
    if (CORE_SETTINGS_KEYS.includes(key)) {
      if (updateCore) {
        bridge.updateSettings({[key]: value})
      }
    }

    if (!updateServer) {
      return
    }

    await restComms.writeUserSettings({[key]: value})
  } catch (error) {
    console.error(`Failed to save setting (${key}):`, error)
  }
}

const handleSpecialCases = async (key: string) => {
  if (key === SETTINGS_KEYS.time_zone) {
    const override = await loadSetting(SETTINGS_KEYS.time_zone_override)
    if (override) {
      return override
    }
    return getTimeZone()
  }
  return null
}

const loadSetting = async (key: string, overrideDefaultValue?: any): Promise<any> => {
  const override = await handleSpecialCases(key)
  if (override) {
    return override
  }

  const defaultValue = overrideDefaultValue ?? getSettingDefault(key)
  try {
    const jsonValue = await AsyncStorage.getItem(key)

    if (jsonValue !== null) {
      return JSON.parse(jsonValue)
    }

    return defaultValue
  } catch (error) {
    console.error(`Failed to load setting (${key}):`, error)
    return defaultValue
  }
}

export const writeSettingsLocally = async (settings: any): Promise<any> => {
  for (const key in settings) {
    await saveSetting(key, settings[key], true, false)
  }
}

export const initUserSettings = async (): Promise<any> => {
  // tell the server our time zone on init:
  const timeZone = await loadSetting(SETTINGS_KEYS.time_zone)
  await saveSetting(SETTINGS_KEYS.time_zone, timeZone, true, true)
}

export const getRestUrl = async (): Promise<string> => {
  const serverUrl = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL)
  const url = new URL(serverUrl)
  const secure = url.protocol === "https:"
  return `${secure ? "https" : "http"}://${url.hostname}:${url.port || (secure ? 443 : 80)}`
}

export const getWsUrl = async (): Promise<string> => {
  const serverUrl = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL)
  const url = new URL(serverUrl)
  const secure = url.protocol === "https:"
  const wsUrl = `${secure ? "wss" : "ws"}://${url.hostname}:${url.port || (secure ? 443 : 80)}/glasses-ws`
  return wsUrl
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
]

// return an object populated with settings that the core should have:
export const getCoreSettings = async (): Promise<any> => {
  const coreSettingsObj: any = {}

  for (const setting of CORE_SETTINGS_KEYS) {
    coreSettingsObj[setting] = await loadSetting(setting)
  }

  return coreSettingsObj
}

export {saveSetting, loadSetting}
