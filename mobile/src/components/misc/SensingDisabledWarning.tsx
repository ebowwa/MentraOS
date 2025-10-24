// SensingDisabledWarning.tsx
import {View, TouchableOpacity, ViewStyle, TextStyle} from "react-native"
import {Text} from "@/components/ignite"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"

const SensingDisabledWarning: React.FC = () => {
  const {push} = useNavigationHistory()
  const {theme, themed} = useAppTheme()
  const [sensingEnabled, _setSensingEnabled] = useSetting(SETTINGS_KEYS.sensing_enabled)

  if (sensingEnabled) {
    return null
  }

  return (
    <View
      style={[themed($container), {backgroundColor: theme.colors.backgroundAlt, borderColor: theme.colors.warning}]}>
      <View style={themed($warningContent)}>
        <Icon name="microphone-off" size={22} color="#FF9800" />
        <Text style={themed($warningText)}>{translate("warning:sensingDisabled")}</Text>
      </View>
      <TouchableOpacity
        style={themed($settingsButton)}
        onPress={() => {
          push("/settings/privacy")
        }}>
        <Text style={themed($settingsButtonTextBlue)} tx="common:settings" />
      </TouchableOpacity>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  padding: spacing.md,
  borderRadius: spacing.md,
  borderWidth: spacing.xxxs,
  alignSelf: "center",
})

const $settingsButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.xs,
})

const $settingsButtonTextBlue: ThemedStyle<TextStyle> = ({spacing, colors}) => ({
  color: colors.primary,
  fontSize: spacing.md,
  fontWeight: "bold",
})

const $warningContent: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  flexDirection: "row",
  flex: 1,
})

const $warningText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.warning,
  flex: 1,
  fontSize: spacing.md,
  marginLeft: spacing.sm,
})

export default SensingDisabledWarning
