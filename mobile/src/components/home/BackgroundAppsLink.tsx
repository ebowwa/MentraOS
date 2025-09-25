import {TouchableOpacity, View, Text, ViewStyle, TextStyle} from "react-native"

import {useNewUiActiveBackgroundAppsCount} from "@/hooks/useNewUiFilteredApps"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {ThemedStyle} from "@/theme"

export const BackgroundAppsLink: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const activeCount = useNewUiActiveBackgroundAppsCount()

  const handlePress = () => {
    push("/new-ui-background-apps")
  }

  return (
    <TouchableOpacity style={themed($container)} onPress={handlePress} activeOpacity={0.7}>
      <View style={themed($content)}>
        <Text style={themed($label)}>
          Background Apps <Text style={themed($count)}>({activeCount} active)</Text>
        </Text>
        <ChevronRight color={theme.colors.text} />
      </View>
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  borderRadius: spacing.sm,
  marginVertical: spacing.xs,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.md,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  color: colors.text,
  fontWeight: "500",
})

const $count: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
  fontWeight: "400",
})
