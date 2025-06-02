import * as React from "react"
import {Text, View, ViewStyle, TextStyle} from "react-native"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {translate, TxKeyPath} from "@/i18n"

interface EmptyAppsViewProps {
  statusMessageKey: TxKeyPath
  activeAppsMessageKey: TxKeyPath
}

const EmptyAppsView = ({statusMessageKey, activeAppsMessageKey}: EmptyAppsViewProps) => {
  const {themed} = useAppTheme()

  return (
    <View style={themed($emptyApps)}>
      <Text style={themed($statusMessage)} numberOfLines={1}>
        {translate(statusMessageKey)}
      </Text>
      <Text style={themed($activeAppsMessage)} numberOfLines={1}>
        {translate(activeAppsMessageKey)}
      </Text>
    </View>
  )
}

const $emptyApps: ThemedStyle<ViewStyle> = () => ({
  alignSelf: "stretch",
  borderRadius: 15,
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 12,
  height: 68,
  gap: 4,
})

const $statusMessage: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 17,
  letterSpacing: 1.7,
  textTransform: "capitalize",
  fontFamily: "SF Pro Rounded",
  color: "#b0b9ff", // optionally use colors.primary if appropriate
  overflow: "hidden",
  textAlign: "left",
})

const $activeAppsMessage: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 13,
  letterSpacing: 0.4,
  lineHeight: 18,
  fontFamily: "Inter-Regular",
  color: "#898fb2", // optionally use colors.textDim if appropriate
  overflow: "hidden",
  textAlign: "left",
})

export default EmptyAppsView
