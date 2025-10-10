import {useCallback} from "react"
import {ScrollView} from "react-native"
import bridge from "@/bridge/MantleBridge"
import {Header, Screen} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {useFocusEffect} from "expo-router"
import {Spacer} from "@/components/misc/Spacer"
import SliderSetting from "@/components/settings/SliderSetting"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {IS_DEV_MODE} from "@/consts"

export default function ScreenSettingsScreen() {
  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()
  const [dashboardDepth, setDashboardDepth] = useSetting(SETTINGS_KEYS.dashboard_depth)
  const [dashboardHeight, setDashboardHeight] = useSetting(SETTINGS_KEYS.dashboard_height)

  useFocusEffect(
    useCallback(() => {
      bridge.toggleUpdatingScreen(true)
      return () => {
        bridge.toggleUpdatingScreen(false)
      }
    }, []),
  )

  const changeDepth = async (newDepth: number) => {
    await setDashboardDepth(newDepth)
    await bridge.setGlassesDepth(newDepth) // TODO: config: remove
  }

  const changeHeight = async (newHeight: number) => {
    await setDashboardHeight(newHeight)
    await bridge.setGlassesHeight(newHeight) // TODO: config: remove
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header titleTx="screenSettings:title" leftIcon="caretLeft" onLeftPress={goBack} />

      <ScrollView>
        <SliderSetting
          label="Display Height"
          subtitle="Adjust the vertical position of the content."
          value={dashboardHeight ?? 4}
          min={1}
          max={8}
          onValueChange={changeHeight}
          onValueSet={changeHeight}
        />

        {IS_DEV_MODE && (
          <>
            <Spacer height={theme.spacing.md} />

            <SliderSetting
              label="Display Depth"
              subtitle="Adjust how far the content appears from you."
              value={dashboardDepth ?? 5}
              min={1}
              max={5}
              onValueChange={changeDepth}
              onValueSet={changeDepth}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
