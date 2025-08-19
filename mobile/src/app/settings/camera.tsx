import React, {useEffect, useState} from "react"
import {View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {Screen, Header} from "@/components/ignite"
import {loadSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
import {isDeveloperBuildOrTestflight} from "@/utils/buildDetection"
import {useAuth} from "@/contexts/AuthContext"
import {isMentraUser} from "@/utils/isMentraUser"

type PhotoSize = "small" | "medium" | "large"
type VideoResolution = "720p" | "1080p"

const PHOTO_SIZE_LABELS: Record<PhotoSize, string> = {
  small: "Small (800×600)",
  medium: "Medium (1440×1080)",
  large: "Large (3200×2400)",
}

const VIDEO_RESOLUTION_LABELS: Record<VideoResolution, string> = {
  "720p": "720p (1280×720)",
  "1080p": "1080p (1920×1080)",
}

export default function CameraSettingsScreen() {
  const {theme, themed} = useAppTheme()
  const {status} = useCoreStatus()
  const {goBack} = useNavigationHistory()
  const {user} = useAuth()

  const [loadingPhotoSize, setLoadingPhotoSize] = useState(false)
  const [loadingVideoResolution, setLoadingVideoResolution] = useState(false)
  const [loadingLed, setLoadingLed] = useState(false)
  const [devMode, setDevMode] = useState(false)

  // Derive state directly from status
  const photoSize = (status.glasses_settings?.button_photo_size as PhotoSize) || "medium"
  const ledEnabled = status.glasses_settings?.button_camera_led !== false // Default true if not set

  // Convert video settings to resolution string
  const videoResolution = (() => {
    const videoSettings = status.glasses_settings?.button_video_settings
    if (videoSettings) {
      return videoSettings.width >= 1920 ? "1080p" : "720p"
    }
    return "720p"
  })()

  useEffect(() => {
    const checkDevMode = async () => {
      const devModeSetting = await loadSetting(SETTINGS_KEYS.DEV_MODE, false)
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
      setLoadingPhotoSize(true)
      await coreCommunicator.sendSetButtonPhotoSize(size)
    } catch (error) {
      console.error("Failed to update photo size:", error)
    } finally {
      setLoadingPhotoSize(false)
    }
  }

  const handleVideoResolutionChange = async (resolution: VideoResolution) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      console.log("Cannot change video resolution - glasses not connected")
      return
    }

    try {
      setLoadingVideoResolution(true)

      // Convert resolution to width/height/fps
      const width = resolution === "1080p" ? 1920 : 1280
      const height = resolution === "1080p" ? 1080 : 720
      const fps = 30

      await coreCommunicator.sendSetButtonVideoSettings(width, height, fps)
    } catch (error) {
      console.error("Failed to update video resolution:", error)
    } finally {
      setLoadingVideoResolution(false)
    }
  }

  const handleLedToggle = async (enabled: boolean) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      console.log("Cannot toggle LED - glasses not connected")
      return
    }

    try {
      setLoadingLed(true)
      await coreCommunicator.sendSetButtonCameraLed(enabled)
    } catch (error) {
      console.error("Failed to update LED setting:", error)
    } finally {
      setLoadingLed(false)
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
              <TouchableOpacity
                style={themed($optionItem)}
                onPress={() => handlePhotoSizeChange(value as PhotoSize)}
                disabled={loadingPhotoSize}>
                <Text style={themed($optionText)}>{label}</Text>
                {loadingPhotoSize && photoSize === value ? (
                  <ActivityIndicator size="small" color={theme.colors.tint} />
                ) : (
                  <MaterialCommunityIcons
                    name="check"
                    size={24}
                    color={photoSize === value ? theme.colors.checkmark : "transparent"}
                  />
                )}
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
                onPress={() => handleVideoResolutionChange(value as VideoResolution)}
                disabled={loadingVideoResolution}>
                <Text style={themed($optionText)}>{label}</Text>
                {loadingVideoResolution && videoResolution === value ? (
                  <ActivityIndicator size="small" color={theme.colors.tint} />
                ) : (
                  <MaterialCommunityIcons
                    name="check"
                    size={24}
                    color={videoResolution === value ? theme.colors.checkmark : "transparent"}
                  />
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {devMode && (
          <View style={{marginVertical: theme.spacing.sm}}>
            <ToggleSetting
              label="Recording LED"
              subtitle="Shows when camera is active"
              value={ledEnabled}
              onValueChange={handleLedToggle}
              disabled={loadingLed}
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

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
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
  height: StyleSheet.hairlineWidth,
  backgroundColor: colors.separator,
  marginVertical: 4,
})

const $optionText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
})

const $warningContainer: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  backgroundColor: colors.warningBackground || "#fff3cd",
  padding: spacing.md,
  margin: spacing.md,
  borderRadius: spacing.xs,
})

const $warningText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.warningText || "#856404",
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
