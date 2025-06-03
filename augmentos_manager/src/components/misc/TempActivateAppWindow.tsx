import * as React from "react"
import {Text, View, ViewStyle, TextStyle, TouchableOpacity} from "react-native"
import {SafeAreaView} from "react-native-safe-area-context"
import {colors, spacing, ThemedStyle} from "@/theme"
import {Icon} from "../ignite"
import {translate} from "@/i18n"
import {loadSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
import {useAppTheme} from "@/utils/useAppTheme"

const TempActivateAppWindow = () => {
  const {themed, theme} = useAppTheme()

  const [visible, setVisible] = React.useState(true)
  const [shouldShow, setShouldShow] = React.useState(false)

  React.useEffect(() => {
    const checkIfShouldShow = async () => {
      const hasEverActivatedApp = await loadSetting(SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP, false)
      // Only update state if we should actually show the window
      if (!hasEverActivatedApp) {
        setShouldShow(true)
      }
    }

    checkIfShouldShow()
  }, [])

  if (!visible || !shouldShow) return null

  return (
    <View style={{marginTop: 16}}>
      <View style={themed($tempWindow)}>
        <View style={themed($appNameParent)}>
          <Text style={[themed($appName), themed($appFlexBox)]} numberOfLines={1}>
            {translate("home:activateAnApp")}
          </Text>
          <Text style={[themed($appName1), themed($appFlexBox)]} numberOfLines={2}>
            {translate("home:activateAnAppMessage")}
          </Text>
        </View>
        <View style={themed($animatedToggle)}>
          <View style={[themed($toggleBarIcon), themed($toggleIconLayout)]} />
          <View style={[themed($toggleCircleIcon), themed($toggleIconLayout), {left: "44.44%"}]}>
            <View style={{flex: 1, borderRadius: 12, backgroundColor: "#CED2ED"}} />
          </View>
        </View>
      </View>
      <TouchableOpacity onPress={() => setVisible(false)} style={[themed($xIcon), {display: "none"}]}>
        <Icon icon={"x"} size={spacing.md} />
      </TouchableOpacity>
    </View>
  )
}

const $appFlexBox: ThemedStyle<TextStyle> = () => ({
  color: colors.text,
  overflow: "hidden",
  textAlign: "left",
  fontFamily: "SF Pro Rounded",
  alignSelf: "stretch",
})

const $toggleIconLayout: ThemedStyle<ViewStyle> = () => ({
  maxWidth: "100%",
  position: "absolute",
  overflow: "hidden",
})

const $appName: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontWeight: "500",
  color: "#f9f8fe",
})

const $appName1: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  letterSpacing: 0.5,
  lineHeight: 18,
  color: "#fffbfb",
})

const $appNameParent: ThemedStyle<ViewStyle> = () => ({
  width: 210,
  gap: 12,
  zIndex: 0,
})

const $toggleBarIcon: ThemedStyle<ViewStyle> = () => ({
  height: "70%",
  width: "94.53%",
  top: "15%",
  right: "5.47%",
  bottom: "15%",
  left: "0%",
  borderRadius: 8,
  maxHeight: "100%",
  backgroundColor: "blue",
})

const $toggleCircleIcon: ThemedStyle<ViewStyle> = () => ({
  width: "55.47%",
  top: 0,
  right: "0.06%",
  left: "44.47%",
  borderRadius: 12,
  height: 21,
})

const $animatedToggle: ThemedStyle<ViewStyle> = () => ({
  width: 38,
  height: 20,
  zIndex: 1,
})

const $xIcon: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 2,
})

const $tempWindow: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 16,
  backgroundColor: colors.background + "E6",
  flex: 1,
  width: "100%",
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 30,
  paddingVertical: 16,
  gap: 41,
})

export default TempActivateAppWindow
