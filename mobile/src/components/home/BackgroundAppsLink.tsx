import RouteButton from "@/components/ui/RouteButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {useActiveBackgroundAppsCount} from "@/stores/applets"
// import {TextStyle, ViewStyle} from "react-native"
// import {ThemedStyle} from "@/theme"
// import ChevronRight from "assets/icons/component/ChevronRight"
// import {useAppTheme} from "@/utils/useAppTheme"

export const BackgroundAppsLink: React.FC = () => {
  // const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const activeCount = useActiveBackgroundAppsCount()

  const handlePress = () => {
    push("/home/background-apps")
  }

  const label = translate("home:backgroundApps") + ` (${activeCount} ${translate("home:backgroundAppsActive")})`
  return <RouteButton label={label} onPress={handlePress} />

  // return (
  //   <TouchableOpacity style={themed($container)} onPress={handlePress} activeOpacity={0.7}>
  //     <View style={themed($content)}>
  //       <Text style={themed($label)}>
  //         {translate("home:backgroundApps")}{" "}
  //         <Text style={themed($count)}>
  //           ({activeCount} {translate("home:backgroundAppsActive")})
  //         </Text>
  //       </Text>
  //       <ChevronRight color={theme.colors.text} />
  //     </View>
  //   </TouchableOpacity>
  // )
}

// const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
//   borderRadius: spacing.sm,
//   marginVertical: spacing.xs,
// })

// const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
//   flexDirection: "row",
//   alignItems: "center",
//   justifyContent: "space-between",
//   paddingHorizontal: spacing.xs,
//   paddingVertical: spacing.md,
// })

// const $label: ThemedStyle<TextStyle> = ({colors}) => ({
//   fontSize: 15,
//   color: colors.text,
//   fontWeight: "500",
// })

// const $count: ThemedStyle<TextStyle> = ({colors}) => ({
//   fontSize: 14,
//   color: colors.textDim,
//   fontWeight: "400",
// })
