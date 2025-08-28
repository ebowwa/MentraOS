import AsyncStorage from "@react-native-async-storage/async-storage"

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
}

const DEFAULT_SETTINGS = {
  [SETTINGS_KEYS.CUSTOM_BACKEND_URL]: null,
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
  [SETTINGS_KEYS.default_wearable]: "glasses",
  [SETTINGS_KEYS.preferred_mic]: "phone",
  [SETTINGS_KEYS.contextual_dashboard_enabled]: true,
  [SETTINGS_KEYS.head_up_angle]: 45,
  [SETTINGS_KEYS.brightness]: 50,
  [SETTINGS_KEYS.auto_brightness]: true,
  [SETTINGS_KEYS.dashboard_height]: 4,
  [SETTINGS_KEYS.dashboard_depth]: 5,
  [SETTINGS_KEYS.button_mode]: "photo",
  [SETTINGS_KEYS.button_photo_size]: "medium",
}

const saveSetting = async (key: string, value: any): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(value)
    await AsyncStorage.setItem(key, jsonValue)
  } catch (error) {
    console.error(`Failed to save setting (${key}):`, error)
  }
}

const loadSetting = async (key: string, overrideDefaultValue?: any) => {
  const defaultValue = overrideDefaultValue ?? DEFAULT_SETTINGS[key]
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

export {saveSetting, loadSetting}
