import {View, ViewStyle} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {SquircleView} from "expo-squircle-view"
import {useSetting, SETTINGS_KEYS} from "@/stores/settings"

interface CameraAppIconProps {
  size?: "small" | "medium" | "large"
  style?: ViewStyle
}

export const CameraAppIcon: React.FC<CameraAppIconProps> = ({size = "medium", style}) => {
  const {themed, theme} = useAppTheme()
  const [enableSquircles] = useSetting(SETTINGS_KEYS.enable_squircles)

  // Size configurations to match GetMoreAppsIcon
  const sizeConfig = {
    small: {
      container: 40,
      icon: 24,
    },
    medium: {
      container: 48,
      icon: 28,
    },
    large: {
      container: 64,
      icon: 36,
    },
  }

  const config = sizeConfig[size]

  // Use custom size from style if provided (e.g., 90x90 in settings page)
  const containerSize = style?.width || config.container
  const iconSizeValue = style?.width ? (style.width as number) * 0.55 : config.icon // Scale icon to ~55% of container

  // Use border radius: squircles use theme.spacing.md, circles always use 60 (perfect circle)
  // When squircles are disabled, always use 60 to create a perfect circle regardless of style prop
  const borderRadius = enableSquircles ? theme.spacing.md : 60

  const iconContent = <MaterialCommunityIcons name="camera-outline" size={iconSizeValue} color={theme.colors.text} />

  // Render with squircle if enabled, otherwise use standard rounded corners (circle)
  if (enableSquircles) {
    return (
      <SquircleView
        cornerSmoothing={100}
        preserveSmoothing={true}
        style={[
          themed($container),
          {
            width: containerSize,
            height: containerSize,
            borderRadius: borderRadius,
            overflow: "hidden",
          },
        ]}>
        {iconContent}
      </SquircleView>
    )
  }

  return (
    <View
      style={[
        themed($container),
        {
          width: containerSize,
          height: containerSize,
          borderRadius: borderRadius,
        },
      ]}>
      {iconContent}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.backgroundAlt,
  alignItems: "center",
  justifyContent: "center",
})
