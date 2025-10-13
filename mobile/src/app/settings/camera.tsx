import {useEffect, useState} from "react"
import {View, ScrollView, TouchableOpacity, Platform} from "react-native"
import {Text} from "@/components/ignite"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import bridge from "@/bridge/MantleBridge"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {Screen, Header} from "@/components/ignite"
import {isDeveloperBuildOrTestflight} from "@/utils/buildDetection"
import {useAuth} from "@/contexts/AuthContext"
import {isMentraUser} from "@/utils/isMentraUser"
import {SETTINGS_KEYS, useSetting, useSettingsStore} from "@/stores/settings"

type PhotoSize = "small" | "medium" | "large"
type VideoResolution = "720p" | "1080p" | "1440p" | "4K"
type MaxRecordingTime = "3m" | "5m" | "10m" | "15m" | "20m"

const PHOTO_SIZE_LABELS: Record<PhotoSize, string> = {
  small: "Small (800×600)",
  medium: "Medium (1440×1080)",
  large: "Large (3200×2400)",
}

const VIDEO_RESOLUTION_LABELS: Record<VideoResolution, string> = {
  "720p": "720p (1280×720)",
  "1080p": "1080p (1920×1080)",
  "1440p": "1440p (2560×1920)",
  "4K": "4K (3840×2160)",
}

const MAX_RECORDING_TIME_LABELS: Record<MaxRecordingTime, string> = {
  "3m": "3 minutes",
  "5m": "5 minutes",
  "10m": "10 minutes",
  "15m": "15 minutes",
  "20m": "20 minutes",
}

export default function CameraSettingsScreen() {
  const {theme, themed} = useAppTheme()
  const {status} = useCoreStatus()
  const {goBack} = useNavigationHistory()
  const {user} = useAuth()
  const [devMode, setDevMode] = useSetting(SETTINGS_KEYS.dev_mode)

  // Local state for optimistic updates - initialize from status
  const [photoSize, setPhotoSize] = useState<PhotoSize>(
    (status.glasses_settings?.button_photo_size as PhotoSize) || "medium",
  )
  const [ledEnabled, setLedEnabled] = useState(
    status.glasses_settings?.button_camera_led !== false, // Default true if not set
  )
  const [videoResolution, setVideoResolution] = useState<VideoResolution>(() => {
    const videoSettings = status.glasses_settings?.button_video_settings
    if (videoSettings) {
      if (videoSettings.width >= 3840) return "4K"
      if (videoSettings.width >= 2560) return "1440p"
      if (videoSettings.width >= 1920) return "1080p"
      return "720p"
    }
    return "720p"
  })
  const [maxRecordingTime, setMaxRecordingTime] = useState<MaxRecordingTime>(() => {
    const maxTime = status.glasses_settings?.button_max_recording_time_minutes
    if (maxTime === 3) return "3m"
    if (maxTime === 5) return "5m"
    if (maxTime === 10) return "10m"
    if (maxTime === 15) return "15m"
    if (maxTime === 20) return "20m"
    return "10m" // default to 10 minutes
  })

  // Update local state when status changes
  useEffect(() => {
    if (status.glasses_settings?.button_photo_size) {
      setPhotoSize(status.glasses_settings.button_photo_size as PhotoSize)
    }
  }, [status.glasses_settings?.button_photo_size])

  useEffect(() => {
    if (status.glasses_settings?.button_camera_led !== undefined) {
      setLedEnabled(status.glasses_settings.button_camera_led)
    }
  }, [status.glasses_settings?.button_camera_led])

  useEffect(() => {
    const videoSettings = status.glasses_settings?.button_video_settings
    if (videoSettings) {
      if (videoSettings.width >= 3840) setVideoResolution("4K")
      else if (videoSettings.width >= 2560) setVideoResolution("1440p")
      else if (videoSettings.width >= 1920) setVideoResolution("1080p")
      else setVideoResolution("720p")
    }
  }, [status.glasses_settings?.button_video_settings])

  useEffect(() => {
    const maxTime = status.glasses_settings?.button_max_recording_time_minutes
    if (maxTime !== undefined) {
      if (maxTime === 3) setMaxRecordingTime("3m")
      else if (maxTime === 5) setMaxRecordingTime("5m")
      else if (maxTime === 10) setMaxRecordingTime("10m")
      else if (maxTime === 15) setMaxRecordingTime("15m")
      else if (maxTime === 20) setMaxRecordingTime("20m")
    }
  }, [status.glasses_settings?.button_max_recording_time_minutes])

  useEffect(() => {
    const checkDevMode = async () => {
      const devModeSetting = await useSettingsStore.getState().loadSetting(SETTINGS_KEYS.dev_mode)
      setDevMode(isDeveloperBuildOrTestflight() || isMentraUser(user?.email) || devModeSetting)
    }
    checkDevMode()
  }, [user?.email])

  const handlePhotoSizeChange = async (size: PhotoSize) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      console.log("Cannot change photo size - glasses not connected")
      return
    }

    try {
      setPhotoSize(size) // Optimistic update
      await bridge.sendSetButtonPhotoSize(size)
    } catch (error) {
      console.error("Failed to update photo size:", error)
      // Revert on error if we have the original value
      if (status.glasses_settings?.button_photo_size) {
        setPhotoSize(status.glasses_settings.button_photo_size as PhotoSize)
      }
    }
  }

  const handleVideoResolutionChange = async (resolution: VideoResolution) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      console.log("Cannot change video resolution - glasses not connected")
      return
    }

    try {
      setVideoResolution(resolution) // Optimistic update

      // Convert resolution to width/height/fps
      const width = resolution === "4K" ? 3840 : resolution === "1440p" ? 2560 : resolution === "1080p" ? 1920 : 1280
      const height = resolution === "4K" ? 2160 : resolution === "1440p" ? 1920 : resolution === "1080p" ? 1080 : 720
      const fps = resolution === "4K" ? 15 : 30

      await bridge.sendSetButtonVideoSettings(width, height, fps)
    } catch (error) {
      console.error("Failed to update video resolution:", error)
      // Revert on error
      const videoSettings = status.glasses_settings?.button_video_settings
      if (videoSettings) {
        if (videoSettings.width >= 3840) setVideoResolution("4K")
        else if (videoSettings.width >= 2560) setVideoResolution("1440p")
        else if (videoSettings.width >= 1920) setVideoResolution("1080p")
        else setVideoResolution("720p")
      }
    }
  }

  const handleLedToggle = async (enabled: boolean) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      console.log("Cannot toggle LED - glasses not connected")
      return
    }

    try {
      setLedEnabled(enabled) // Optimistic update
      await bridge.sendSetButtonCameraLed(enabled)
    } catch (error) {
      console.error("Failed to update LED setting:", error)
      // Revert on error
      if (status.glasses_settings?.button_camera_led !== undefined) {
        setLedEnabled(status.glasses_settings.button_camera_led)
      }
    }
  }

  const handleMaxRecordingTimeChange = async (time: MaxRecordingTime) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      console.log("Cannot change max recording time - glasses not connected")
      return
    }

    try {
      setMaxRecordingTime(time) // Optimistic update

      // Convert time to minutes
      const minutes = parseInt(time.replace("m", ""))

      await bridge.sendSetButtonMaxRecordingTime(minutes)
    } catch (error) {
      console.error("Failed to update max recording time:", error)
      // Revert on error
      const maxTime = status.glasses_settings?.button_max_recording_time_minutes
      if (maxTime !== undefined) {
        if (maxTime === 3) setMaxRecordingTime("3m")
        else if (maxTime === 5) setMaxRecordingTime("5m")
        else if (maxTime === 10) setMaxRecordingTime("10m")
        else if (maxTime === 15) setMaxRecordingTime("15m")
        else if (maxTime === 20) setMaxRecordingTime("20m")
      }
    }
  }

  // Check if glasses support camera button feature
  const supportsCameraButton = status.glasses_info?.model_name?.toLowerCase().includes("mentra live")

  if (!supportsCameraButton) {
    return (
      <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
        <Header leftIcon="caretLeft" onLeftPress={() => goBack()} title={translate("settings:cameraSettings")} />
        <View style={themed($emptyStateContainer)}>
          <Text style={themed($emptyStateText)}>Camera settings are not available for this device</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
      <Header leftIcon="caretLeft" onLeftPress={() => goBack()} title={translate("settings:cameraSettings")} />
      <ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic">
        <View style={themed($settingsGroup)}>
          <Text style={themed($settingLabel)}>Button Photo Settings</Text>
          <Text style={themed($settingSubtitle)}>Choose the resolution for photos taken with the camera button</Text>

          {Object.entries(PHOTO_SIZE_LABELS).map(([value, label], index) => (
            <View key={value}>
              {index > 0 && <View style={themed($divider)} />}
              <TouchableOpacity style={themed($optionItem)} onPress={() => handlePhotoSizeChange(value as PhotoSize)}>
                <Text style={themed($optionText)}>{label}</Text>
                <MaterialCommunityIcons
                  name="check"
                  size={24}
                  color={photoSize === value ? theme.colors.primary : "transparent"}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={themed($settingsGroup)}>
          <Text style={themed($settingLabel)}>Button Video Settings</Text>
          <Text style={themed($settingSubtitle)}>Choose the resolution for videos recorded with the camera button</Text>

          {Object.entries(VIDEO_RESOLUTION_LABELS).map(([value, label], index) => (
            <View key={value}>
              {index > 0 && <View style={themed($divider)} />}
              <TouchableOpacity
                style={themed($optionItem)}
                onPress={() => handleVideoResolutionChange(value as VideoResolution)}>
                <Text style={themed($optionText)}>{label}</Text>
                <MaterialCommunityIcons
                  name="check"
                  size={24}
                  color={videoResolution === value ? theme.colors.primary : "transparent"}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {Platform.OS === "ios" && (
          <View style={themed($settingsGroup)}>
            <Text style={themed($settingLabel)}>Maximum Recording Time</Text>
            <Text style={themed($settingSubtitle)}>Maximum duration for button-triggered video recording</Text>

            {Object.entries(MAX_RECORDING_TIME_LABELS).map(([value, label], index) => (
              <View key={value}>
                {index > 0 && <View style={themed($divider)} />}
                <TouchableOpacity
                  style={themed($optionItem)}
                  onPress={() => handleMaxRecordingTimeChange(value as MaxRecordingTime)}>
                  <Text style={themed($optionText)}>{label}</Text>
                  <MaterialCommunityIcons
                    name="check"
                    size={24}
                    color={maxRecordingTime === value ? theme.colors.primary : "transparent"}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {devMode && (
          <View style={{marginVertical: theme.spacing.sm}}>
            <ToggleSetting
              label="Recording LED"
              subtitle="Shows when camera is active"
              value={ledEnabled}
              onValueChange={handleLedToggle}
            />
          </View>
        )}

        {!status.core_info.puck_connected && (
          <View style={themed($warningContainer)}>
            <Text style={themed($warningText)}>Connect your glasses to change settings</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundAlt,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
  marginVertical: spacing.sm,
})

const $settingLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
  fontWeight: "600",
  marginBottom: 8,
})

const $settingSubtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: 12,
  marginBottom: spacing.sm,
})

const $optionItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: spacing.xs,
  paddingTop: spacing.xs,
})

const $divider: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: 1,
  backgroundColor: colors.separator,
  marginVertical: 4,
})

const $optionText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
})

const $warningContainer: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  backgroundColor: colors.warning,
  padding: spacing.md,
  margin: spacing.md,
  borderRadius: spacing.xs,
})

const $warningText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
  textAlign: "center",
})

const $emptyStateContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxl,
  minHeight: 300,
})

const $emptyStateText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
  textAlign: "center",
})
