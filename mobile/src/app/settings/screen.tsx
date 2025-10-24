import {Header, Screen} from "@/components/ignite"
import SliderSetting from "@/components/settings/SliderSetting"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {useAppTheme} from "@/utils/useAppTheme"
import CoreModule from "core"
import {useFocusEffect} from "expo-router"
import {useCallback} from "react"
import {ScrollView} from "react-native"

export default function ScreenSettingsScreen() {
  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()
  const [dashboardDepth, setDashboardDepth] = useSetting(SETTINGS_KEYS.dashboard_depth)
  const [dashboardHeight, setDashboardHeight] = useSetting(SETTINGS_KEYS.dashboard_height)

  useFocusEffect(
    useCallback(() => {
      CoreModule.updateSettings({screen_disabled: true})
      return () => {
        CoreModule.updateSettings({screen_disabled: false})
      }
    }, []),
  )

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header titleTx="screenSettings:title" leftIcon="caretLeft" onLeftPress={goBack} />

      <ScrollView>
        <SliderSetting
          label="Display Depth"
          subtitle="Adjust how far the content appears from you."
          value={dashboardDepth ?? 5}
          min={1}
          max={5}
          onValueChange={_value => {}}
          onValueSet={setDashboardDepth}
        />

        <Spacer height={theme.spacing.md} />

        <SliderSetting
          label="Display Height"
          subtitle="Adjust the vertical position of the content."
          value={dashboardHeight ?? 4}
          min={1}
          max={8}
          onValueChange={_value => {}}
          onValueSet={setDashboardHeight}
        />
      </ScrollView>
    </Screen>
  )
}
