// AppIcon.tsx
import React, {useEffect, useState} from "react"
import {View, TouchableOpacity, ViewStyle, ImageStyle, TextStyle, Platform, ActivityIndicator} from "react-native"
import {Image} from "expo-image"
import {AppletInterface} from "@/contexts/AppletStatusProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {SquircleView} from "expo-squircle-view"
import {loadSetting, SETTINGS_KEYS} from "@/utils/SettingsHelper"

interface AppIconProps {
  app: AppletInterface
  onClick?: () => void
  style?: ViewStyle
  showLabel?: boolean
}

const AppIcon: React.FC<AppIconProps> = ({app, onClick, style, showLabel = false}) => {
  const {themed, theme} = useAppTheme()

  const WrapperComponent = onClick ? TouchableOpacity : View

  const [usingNewUI, setUsingNewUI] = useState(false)

  useEffect(() => {
    const check = async () => {
      const newUI = await loadSetting(SETTINGS_KEYS.NEW_UI, false)
      setUsingNewUI(newUI)
    }
    check()
  }, [])

  return (
    <WrapperComponent
      onPress={onClick}
      activeOpacity={onClick ? 0.7 : undefined}
      style={[themed($container), style]}
      accessibilityLabel={onClick ? `Launch ${app.name}` : undefined}
      accessibilityRole={onClick ? "button" : undefined}>
      {Platform.OS === "ios" && usingNewUI ? (
        <SquircleView
          cornerSmoothing={100}
          preserveSmoothing={true}
          style={{
            overflow: "hidden", // use as a mask
            alignItems: "center",
            justifyContent: "center",
            width: style?.width ?? 56,
            height: style?.height ?? 56,
            borderRadius: style?.borderRadius ?? theme.spacing.md,
          }}>
          {app.loading && (
            <View style={themed($loadingContainer)}>
              <ActivityIndicator size="large" color={theme.colors.palette.white} />
            </View>
          )}
          <Image
            source={{uri: app.logoURL}}
            style={themed($icon)}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        </SquircleView>
      ) : (
        <>
          {app.loading && usingNewUI && (
            <View style={themed($loadingContainer)}>
              <ActivityIndicator size="large" color={theme.colors.tint} />
            </View>
          )}
          <Image
            source={{uri: app.logoURL}}
            style={[themed($icon), {borderRadius: 60, width: style?.width ?? 56, height: style?.height ?? 56}]}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        </>
      )}
      {showLabel && <Text text={app.name} style={themed($appName)} numberOfLines={2} />}
    </WrapperComponent>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  overflow: "hidden",
})

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  justifyContent: "center",
  alignItems: "center",
  zIndex: 10,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
})

const $icon: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: "100%",
  resizeMode: "cover",
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
