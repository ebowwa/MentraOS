import React, {useEffect, useState} from "react"
import {View, Text, ScrollView, ActivityIndicator, Alert, StyleSheet, TouchableOpacity} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

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
  const {pop} = useNavigationHistory()

  const [loading, setLoading] = useState(false)
  const [photoSize, setPhotoSize] = useState<PhotoSize>("medium")
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("720p")
  const [ledEnabled, setLedEnabled] = useState(true)

  useEffect(() => {
    // Load current settings from status
    if (status.glasses_settings) {
      setPhotoSize((status.glasses_settings.button_photo_size as PhotoSize) || "medium")
      setLedEnabled(status.glasses_settings.button_camera_led !== false) // Default true if not set

      // Convert video settings to resolution string
      const videoSettings = status.glasses_settings.button_video_settings
      if (videoSettings) {
        const resolution = videoSettings.width >= 1920 ? "1080p" : "720p"
        setVideoResolution(resolution)
      }
    }
  }, [status.glasses_settings])

  const handlePhotoSizeChange = async (size: PhotoSize) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      Alert.alert("Not Connected", "Please connect your glasses first")
      return
    }

    try {
      setLoading(true)
      await coreCommunicator.sendSetButtonPhotoSize(size)
      setPhotoSize(size)
      Alert.alert("Success", "Photo size updated")
    } catch (error) {
      Alert.alert("Error", "Failed to update photo size")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleVideoResolutionChange = async (resolution: VideoResolution) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      Alert.alert("Not Connected", "Please connect your glasses first")
      return
    }

    try {
      setLoading(true)

      // Convert resolution to width/height/fps
      const width = resolution === "1080p" ? 1920 : 1280
      const height = resolution === "1080p" ? 1080 : 720
      const fps = 30

      await coreCommunicator.sendSetButtonVideoSettings(width, height, fps)
      setVideoResolution(resolution)
      Alert.alert("Success", "Video resolution updated")
    } catch (error) {
      Alert.alert("Error", "Failed to update video resolution")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleLedToggle = async (enabled: boolean) => {
    if (!status.core_info.puck_connected || !status.glasses_info?.model_name) {
      Alert.alert("Not Connected", "Please connect your glasses first")
      return
    }

    try {
      setLoading(true)
      await coreCommunicator.sendSetButtonCameraLed(enabled)
      setLedEnabled(enabled)
      Alert.alert("Success", `Recording LED ${enabled ? "enabled" : "disabled"}`)
    } catch (error) {
      Alert.alert("Error", "Failed to update LED setting")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // Check if glasses support camera button feature
  const supportsCameraButton = status.glasses_info?.model_name?.toLowerCase().includes("mentra live")

  if (!supportsCameraButton) {
    return (
      <View style={themed($container)}>
        <View style={themed($header)}>
          <TouchableOpacity onPress={() => pop()} style={themed($backButton)}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={themed($title)}>{translate("settings:cameraSettings")}</Text>
          <View style={{width: 40}} />
        </View>
        <View style={themed($emptyStateContainer)}>
          <Text style={themed($emptyStateText)}>Camera settings are not available for this device</Text>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={themed($loadingContainer)}>
        <ActivityIndicator size="large" color={theme.colors.tint} />
      </View>
    )
  }

  return (
    <View style={themed($container)}>
      <View style={themed($header)}>
        <TouchableOpacity onPress={() => pop()} style={themed($backButton)}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={themed($title)}>{translate("settings:cameraSettings")}</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView style={themed($scrollContainer)}>
        <View style={themed($section)}>
          <Text style={themed($sectionTitle)}>Button Photo Settings</Text>
          <Text style={themed($description)}>Choose the resolution for photos taken with the camera button</Text>
          <View style={themed($optionsContainer)}>
            {Object.entries(PHOTO_SIZE_LABELS).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={themed($optionRow)}
                onPress={() => handlePhotoSizeChange(value as PhotoSize)}
                disabled={loading}>
                <Text style={themed($optionText)}>{label}</Text>
                <MaterialCommunityIcons
                  name="check"
                  size={24}
                  color={photoSize === value ? theme.colors.checkmark : "transparent"}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={themed($section)}>
          <Text style={themed($sectionTitle)}>Button Video Settings</Text>
          <Text style={themed($description)}>Choose the resolution for videos recorded with the camera button</Text>
          <View style={themed($optionsContainer)}>
            {Object.entries(VIDEO_RESOLUTION_LABELS).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={themed($optionRow)}
                onPress={() => handleVideoResolutionChange(value as VideoResolution)}
                disabled={loading}>
                <Text style={themed($optionText)}>{label}</Text>
                <MaterialCommunityIcons
                  name="check"
                  size={24}
                  color={videoResolution === value ? theme.colors.checkmark : "transparent"}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={themed($section)}>
          <Text style={themed($sectionTitle)}>Recording LED</Text>
          <Text style={themed($description)}>Control the recording LED when using camera button</Text>
          <TouchableOpacity style={themed($optionRow)} onPress={() => handleLedToggle(!ledEnabled)} disabled={loading}>
            <Text style={themed($optionText)}>Recording LED</Text>
            <MaterialCommunityIcons
              name={ledEnabled ? "toggle-switch" : "toggle-switch-off"}
              size={40}
              color={ledEnabled ? theme.colors.checkmark : theme.colors.textDim}
            />
          </TouchableOpacity>
        </View>

        {!status.core_info.puck_connected && (
          <View style={themed($warningContainer)}>
            <Text style={themed($warningText)}>Connect your glasses to change settings</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  backgroundColor: "transparent",
})

const $header: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
})

const $backButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
})

const $title: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.text,
})

const $scrollContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $section: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  marginVertical: spacing.sm,
  marginHorizontal: spacing.md,
  padding: spacing.md,
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 18,
  fontWeight: "600",
  marginBottom: spacing.xs,
  color: colors.text,
})

const $description: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.textDim,
  marginBottom: spacing.md,
})

const $optionsContainer: ThemedStyle<ViewStyle> = () => ({})

const $optionRow: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: colors.separator,
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
