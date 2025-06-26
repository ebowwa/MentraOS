import * as React from "react"
import {View, ViewStyle, TextStyle, TouchableOpacity} from "react-native"
import {ThemedStyle} from "@/theme"
import {Icon, Text} from "../ignite"
import {translate} from "@/i18n"
import {useAppTheme} from "@/utils/useAppTheme"

const TempActivateAppWindow = () => {
  const {themed, theme} = useAppTheme()

  const [visible, setVisible] = React.useState(true)

  if (!visible) return null

  return (
    <View>
      <View style={themed($tempWindow)}>
        <View style={themed($appNameParent)}>
          <Text tx="home:activateAnApp" style={[themed($appName), themed($appFlexBox)]} numberOfLines={1} />
          <Text tx="home:activateAnAppMessage" style={[themed($appName1), themed($appFlexBox)]} numberOfLines={2} />
        </View>
        <View style={themed($animatedToggle)}>
          <View style={themed($toggleBarIcon)} />
          <View style={[themed($toggleCircleIcon), {backgroundColor: theme.colors.switchThumbOff}]} />
        </View>
      </View>
      <TouchableOpacity onPress={() => setVisible(false)} style={[themed($xIcon), {display: "none"}]}>
        <Icon icon={"x"} size={theme.spacing.md} />
      </TouchableOpacity>
    </View>
  )
}

const $appFlexBox: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  overflow: "hidden",
  textAlign: "left",
  alignSelf: "stretch",
})

const $toggleIconLayout: ThemedStyle<ViewStyle> = () => ({
  maxWidth: "100%",
  position: "absolute",
  overflow: "hidden",
})

const $appName: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontWeight: "500",
  // color: "#f9f8fe",
})

const $appName1: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 13,
  letterSpacing: 0.5,
  lineHeight: 18,
  // color: "#fffbfb",
})

const $appNameParent: ThemedStyle<ViewStyle> = () => ({
  // width: 210,
  // gap: 12,
  // zIndex: 0,
  flexDirection: "column",
  // height: 100,
  flex: 1,
})

const $toggleBarIcon: ThemedStyle<ViewStyle> = ({colors}) => ({
  height: 16,
  width: 32,
  borderRadius: 16,
  backgroundColor: colors.switchTrackOff,
  borderColor: colors.switchBorder,
  borderWidth: colors.switchBorderWidth,
  position: "absolute",
})

const $toggleCircleIcon: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: 24,
  height: 24,
  top: -4,
  left: -4,
  borderRadius: 12,
  position: "absolute",
  borderColor: colors.switchBorder,
  borderWidth: colors.switchBorderWidth,
})

const $animatedToggle: ThemedStyle<ViewStyle> = () => ({
  width: 32,
  height: 16,
  zIndex: 1,
  position: "relative",
})

const $xIcon: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 2,
})

const $tempWindow: ThemedStyle<ViewStyle> = ({colors, spacing, borderRadius}) => ({
  borderRadius: borderRadius.md,
  // backgroundColor: colors.background + "E6",
  backgroundColor: colors.background,
  // flex: 1,
  // width: "100%",
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 30,
  paddingVertical: 16,
  gap: 41,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
})

export default TempActivateAppWindow
