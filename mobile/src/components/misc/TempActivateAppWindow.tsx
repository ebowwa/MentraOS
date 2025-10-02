import {useState} from "react"
import {View, ViewStyle, TextStyle, TouchableOpacity} from "react-native"
import {ThemedStyle} from "@/theme"
import {Icon, Text} from "../ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {Switch} from "../ignite/Toggle/Switch"

const TempActivateAppWindow = () => {
  const {themed, theme} = useAppTheme()

  const [visible, setVisible] = useState(true)

  if (!visible) return null

  return (
    <View>
      <View style={themed($tempWindow)}>
        <View style={themed($appNameParent)}>
          <Text tx="home:activateAnApp" style={[themed($appName), themed($appFlexBox)]} numberOfLines={1} />
          <Text tx="home:activateAnAppMessage" style={[themed($appName1), themed($appFlexBox)]} numberOfLines={2} />
        </View>
        <Switch value={false} onValueChange={() => {}} disabled={true} />
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

const _$toggleIconLayout: ThemedStyle<ViewStyle> = () => ({
  maxWidth: "100%",
  position: "absolute",
  overflow: "hidden",
})

const $appName: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontWeight: "500",
  // color: "#f9f8fe",
})

const $appName1: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  letterSpacing: 0.5,
  lineHeight: 18,
  // color: "#fffbfb",
})

const $appNameParent: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "column",
  flex: 1,
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
  backgroundColor: colors.backgroundAlt,
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
