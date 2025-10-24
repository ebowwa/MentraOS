import RouteButton from "@/components/ui/RouteButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {useActiveBackgroundAppsCount} from "@/stores/applets"

export const BackgroundAppsLink: React.FC = () => {
  // const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const activeCount = useActiveBackgroundAppsCount()

  const handlePress = () => {
    push("/home/background-apps")
  }

  const label = translate("home:backgroundApps") + ` (${activeCount} ${translate("home:backgroundAppsActive")})`
  return <RouteButton label={label} onPress={handlePress} />
}
