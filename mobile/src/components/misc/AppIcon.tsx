// AppIcon.tsx
import React from "react"
import {View, StyleSheet, TouchableOpacity, ViewStyle, ImageStyle, TextStyle, Platform} from "react-native"
import {Image} from "expo-image"
import {AppletInterface} from "@/contexts/AppletStatusProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"
import {SquircleView} from "expo-squircle-view"
import {ThemedStyle} from "@/theme"

interface AppIconProps {
  app: AppletInterface
  isForegroundApp?: boolean
  onClick?: () => void
  style?: ViewStyle
  showLabel?: boolean
}

const AppIcon: React.FC<AppIconProps> = ({app, isForegroundApp = false, onClick, style, showLabel = false}) => {
  const {themed, theme} = useAppTheme()

  const WrapperComponent = onClick ? TouchableOpacity : View

  return (
    <WrapperComponent
      onPress={onClick}
      activeOpacity={onClick ? 0.7 : undefined}
      style={[themed($container), style]}
      accessibilityLabel={onClick ? `Launch ${app.name}` : undefined}
      accessibilityRole={onClick ? "button" : undefined}>
      {Platform.OS === "ios" ? (
        <SquircleView
          cornerSmoothing={100}
          preserveSmoothing={true}
          style={{
            // backgroundColor: "red",
            overflow: "hidden", // use as a mask
            alignItems: "center",
            justifyContent: "center",
            width: style?.width ?? 56,
            height: style?.height ?? 56,
            borderRadius: style?.borderRadius ?? theme.spacing.md,
          }}>
          <Image
            source={{uri: app.logoURL}}
            style={themed($icon)}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        </SquircleView>
      ) : (
        <Image
          source={{uri: app.logoURL}}
          style={[themed($icon), {borderRadius: 60}]}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      )}

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
