// AppIcon.tsx
import React from "react"
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  ImageStyle,
  TextStyle,
  Platform,
  ActivityIndicator,
} from "react-native"
import {Image} from "expo-image"
import {AppletInterface} from "@/contexts/AppletStatusProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"

interface AppIconProps {
  app: AppletInterface
  onClick?: () => void
  style?: ViewStyle
  showLabel?: boolean
}

const AppIcon: React.FC<AppIconProps> = ({app, onClick, style, showLabel = false}) => {
  const {themed, theme} = useAppTheme()

  const WrapperComponent = onClick ? TouchableOpacity : View

  return (
    <WrapperComponent
      onPress={onClick}
      activeOpacity={onClick ? 0.7 : undefined}
      style={[themed($container), style]}
      accessibilityLabel={onClick ? `Launch ${app.name}` : undefined}
      accessibilityRole={onClick ? "button" : undefined}>
      <View
        style={{
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          width: style?.width ?? 56,
          height: style?.height ?? 56,
          borderRadius: (style?.width ?? 56) / 2, // Make it a perfect circle
        }}>
        {/* overlay loading indicator: */}
        {app.loading && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
              zIndex: 10,
            }}>
            <ActivityIndicator size="large" color={theme.colors.text} />
          </View>
        )}
        <Image
          source={{uri: app.logoURL}}
          style={themed($icon)}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      </View>

      {showLabel && <Text text={app.name} style={themed($appName)} numberOfLines={2} />}
    </WrapperComponent>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  overflow: "hidden",
})

const $icon: ThemedStyle<ImageStyle> = () => ({
  height: "100%",
  resizeMode: "cover",
  width: "100%",
})

const $appName: ThemedStyle<TextStyle> = ({colors, isDark}) => ({
  fontSize: 11,
  fontWeight: "600",
  lineHeight: 12,
  marginTop: 5,
  textAlign: "left",
  color: isDark ? "#ced2ed" : "#000000",
})

const $squareBadge: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  borderRadius: 6,
  height: 20,
  justifyContent: "center",
  position: "absolute",
  right: 3,
  top: -8,
  width: 20,
  zIndex: 3,
})

export default React.memo(AppIcon)
