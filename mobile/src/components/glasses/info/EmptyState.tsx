import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {View, TextStyle, ViewStyle} from "react-native"

export function EmptyState() {
  const {themed} = useAppTheme()

  return (
    <View style={themed($container)}>
      <View style={themed($emptyStateContainer)}>
        <Text tx="deviceSettings:emptyState" style={themed($emptyStateText)} />
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 12,
  width: "100%",
  minHeight: 240,
  justifyContent: "center",
  backgroundColor: "transparent",
})

const $emptyStateContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "flex-start",
  alignItems: "center",
  paddingTop: spacing.xl,
  paddingBottom: spacing.xxl,
  minHeight: 200,
})

const $emptyStateText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 20,
  textAlign: "center",
  lineHeight: 28,
  fontWeight: "500",
})
