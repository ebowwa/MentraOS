import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {View, TextStyle, ViewStyle} from "react-native"

export function NotConnectedInfo() {
  const {themed} = useAppTheme()

  return (
    <View style={themed($container)}>
      <Text tx="deviceSettings:notConnectedInfo" style={themed($text)} />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.sm,
  marginBottom: spacing.sm,
  marginTop: spacing.sm,
})

const $text: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 14,
  textAlign: "center",
})
