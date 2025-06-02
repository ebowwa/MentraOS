import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"
import {router} from "expo-router"
import {View, Text, TouchableOpacity, ViewStyle, TextStyle} from "react-native"

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
            <Text style={{color: theme.colors.text}}>{label}</Text>
            {subtitle && <Text style={themed($subtitle)}>{subtitle}</Text>}
          </View>
          <ChevronRight size={24} color={theme.colors.text} />
        </View>
      </TouchableOpacity>
    </View>
  )
}

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: 12,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.sm,
})
