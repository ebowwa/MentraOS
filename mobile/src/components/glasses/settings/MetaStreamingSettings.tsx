import CoreModule from "core"
import {useEffect, useCallback} from "react"
import {View, ViewStyle, TouchableOpacity, TextStyle} from "react-native"

import {Text} from "@/components/ignite"
import {Group} from "@/components/ui/Group"
import {SETTINGS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

/** Available streaming resolution options for Meta glasses */
type MetaStreamingResolution = "low" | "medium" | "high"
type MetaStreamingOrientation = "portrait" | "landscape"

/** Resolution dimensions for each quality level */
const RESOLUTION_DIMENSIONS = {
  low: {portrait: "360×640", landscape: "640×360"},
  medium: {portrait: "504×896", landscape: "896×504"},
  high: {portrait: "720×1280", landscape: "1280×720"},
}

const RESOLUTION_OPTIONS: {label: string; value: MetaStreamingResolution}[] = [
  {label: "Low", value: "low"},
  {label: "Medium", value: "medium"},
  {label: "High", value: "high"},
]

const FPS_OPTIONS: {label: string; value: number}[] = [
  {label: "15 fps", value: 15},
  {label: "24 fps", value: 24},
  {label: "30 fps", value: 30},
]

const ORIENTATION_OPTIONS: {label: string; value: MetaStreamingOrientation; icon: string}[] = [
  {label: "Portrait", value: "portrait", icon: "📱"},
  {label: "Landscape", value: "landscape", icon: "📺"},
]

export function MetaStreamingSettings() {
  const {themed} = useAppTheme()
  const [resolution, setResolution] = useSetting<string>(SETTINGS.meta_streaming_resolution.key)
  const [fps, setFps] = useSetting<number>(SETTINGS.meta_streaming_fps.key)
  const [orientation, setOrientation] = useSetting<string>(SETTINGS.meta_streaming_orientation.key)

  // Apply settings when they change
  const applySettings = useCallback(async (res: MetaStreamingResolution, frameRate: number) => {
    try {
      await CoreModule.configureMetaStreaming(res, frameRate)
    } catch (error) {
      console.log("Failed to configure Meta streaming:", error)
    }
  }, [])

  // Apply on mount and when settings change
  useEffect(() => {
    if (resolution && fps) {
      applySettings(resolution as MetaStreamingResolution, fps)
    }
  }, [resolution, fps, applySettings])

  const handleResolutionChange = async (value: MetaStreamingResolution) => {
    await setResolution(value)
  }

  const handleFpsChange = async (value: number) => {
    await setFps(value)
  }

  const handleOrientationChange = async (value: MetaStreamingOrientation) => {
    await setOrientation(value)
  }

  /** Get dimensions string based on current resolution and orientation */
  const getDimensions = (res: MetaStreamingResolution) => {
    const orient = (orientation || "portrait") as MetaStreamingOrientation
    return RESOLUTION_DIMENSIONS[res]?.[orient] || RESOLUTION_DIMENSIONS[res]?.portrait
  }

  return (
    <Group title="Video Streaming">
      {/* Orientation Selection */}
      <View style={themed($sectionContainer)}>
        <Text style={themed($sectionLabel)} text="Orientation" />
        <View style={themed($optionsRow)}>
          {ORIENTATION_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.value}
              style={[themed($optionButton), orientation === option.value && themed($optionButtonSelected)]}
              onPress={() => handleOrientationChange(option.value)}>
              <Text
                style={[themed($optionText), orientation === option.value && themed($optionTextSelected)]}
                text={`${option.icon} ${option.label}`}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Resolution Selection */}
      <View style={themed($sectionContainer)}>
        <Text style={themed($sectionLabel)} text="Resolution" />
        <View style={themed($optionsRow)}>
          {RESOLUTION_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.value}
              style={[themed($optionButton), resolution === option.value && themed($optionButtonSelected)]}
              onPress={() => handleResolutionChange(option.value)}>
              <Text
                style={[themed($optionText), resolution === option.value && themed($optionTextSelected)]}
                text={option.label}
              />
              <Text
                style={[themed($optionSubtext), resolution === option.value && themed($optionSubtextSelected)]}
                text={getDimensions(option.value)}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* FPS Selection */}
      <View style={themed($sectionContainer)}>
        <Text style={themed($sectionLabel)} text="Frame Rate" />
        <View style={themed($optionsRow)}>
          {FPS_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.value}
              style={[themed($optionButton), fps === option.value && themed($optionButtonSelected)]}
              onPress={() => handleFpsChange(option.value)}>
              <Text
                style={[themed($optionText), fps === option.value && themed($optionTextSelected)]}
                text={option.label}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Group>
  )
}

const $sectionContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.s4,
  paddingVertical: spacing.s3,
})

const $sectionLabel: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.textDim,
  marginBottom: spacing.s2,
})

const $optionsRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  gap: spacing.s2,
})

const $optionButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flex: 1,
  paddingVertical: spacing.s3,
  paddingHorizontal: spacing.s2,
  borderRadius: spacing.s2,
  backgroundColor: colors.primary_foreground,
  borderWidth: 1,
  borderColor: colors.border,
  alignItems: "center",
})

const $optionButtonSelected: ThemedStyle<ViewStyle> = ({colors}) => ({
  borderColor: colors.primary,
  backgroundColor: colors.primary + "10",
})

const $optionText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "600",
  color: colors.text,
})

const $optionTextSelected: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.primary,
})

const $optionSubtext: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 11,
  color: colors.textDim,
  marginTop: 2,
})

const $optionSubtextSelected: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.primary,
})
