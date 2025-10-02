import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"
import ChevronRight from "assets/icons/component/ChevronRight"
import {router as _router} from "expo-router"
import {View, TouchableOpacity} from "react-native"

interface RouteButtonProps {
  label: string
  subtitle?: string
  onPress?: () => void
}

export default function RouteButton({label, subtitle, onPress}: RouteButtonProps) {
  const {theme, themed} = useAppTheme()
  return (
    <View style={[themed($settingsGroup), {paddingVertical: 0}]}>
      <TouchableOpacity onPress={onPress} disabled={!onPress}>
        <View style={{flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, alignItems: "center"}}>
          <View
            style={{
              flexDirection: "column",
              justifyContent: "space-between",
              paddingVertical: 8,
              maxWidth: "90%",
              gap: theme.spacing.xxs,
            }}>
            <Text style={themed($label)}>{label}</Text>
            {subtitle && <Text style={themed($subtitle)}>{subtitle}</Text>}
          </View>
          <ChevronRight size={24} color={theme.colors.text} />
        </View>
      </TouchableOpacity>
    </View>
  )
}

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontWeight: "500",
  color: colors.text,
  fontSize: spacing.md,
})

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundAlt,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.md,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.sm,
  fontWeight: "400",
})
