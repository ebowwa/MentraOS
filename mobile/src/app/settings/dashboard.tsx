import {useState} from "react"
import {Alert, ScrollView} from "react-native"

import {getModelCapabilities} from "@/../../cloud/packages/types/src"
import {Header, Screen} from "@/components/ignite"
import HeadUpAngleComponent from "@/components/misc/HeadUpAngleComponent"
import ToggleSetting from "@/components/settings/ToggleSetting"
import RouteButton from "@/components/ui/RouteButton"
import {Spacer} from "@/components/ui/Spacer"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n/translate"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {useAppTheme} from "@/utils/useAppTheme"

export default function DashboardSettingsScreen() {
  const {status} = useCoreStatus()
  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()
  const [headUpAngleComponentVisible, setHeadUpAngleComponentVisible] = useState(false)
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [headUpAngle, setHeadUpAngle] = useSetting(SETTINGS_KEYS.head_up_angle)
  const [contextualDashboardEnabled, setContextualDashboardEnabled] = useSetting(SETTINGS_KEYS.contextual_dashboard)
  const [metricSystemEnabled, setMetricSystemEnabled] = useSetting(SETTINGS_KEYS.metric_system)
  const features = getModelCapabilities(defaultWearable)

  // -- Handlers --
  const toggleContextualDashboard = async () => {
    const newVal = !contextualDashboardEnabled
    await setContextualDashboardEnabled(newVal)
  }

  const toggleMetricSystem = async () => {
    const newVal = !metricSystemEnabled
    try {
      await setMetricSystemEnabled(newVal)
    } catch (error) {
      console.error("Error toggling metric system:", error)
    }
  }

  const onSaveHeadUpAngle = async (newHeadUpAngle: number) => {
    if (!status.glasses_info) {
      Alert.alert("Glasses not connected", "Please connect your smart glasses first.")
      return
    }
    if (newHeadUpAngle == null) {
      return
    }

    setHeadUpAngleComponentVisible(false)
    await setHeadUpAngle(newHeadUpAngle)
  }

  const onCancelHeadUpAngle = () => {
    setHeadUpAngleComponentVisible(false)
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header titleTx="settings:dashboardSettings" leftIcon="caretLeft" onLeftPress={goBack} />
      <ScrollView>
        <ToggleSetting
          label={translate("settings:contextualDashboardLabel")}
          subtitle={translate("settings:contextualDashboardSubtitle")}
          value={contextualDashboardEnabled}
          onValueChange={toggleContextualDashboard}
        />

        <Spacer height={theme.spacing.md} />

        <ToggleSetting
          label={translate("settings:metricSystemLabel")}
          subtitle={translate("settings:metricSystemSubtitle")}
          value={metricSystemEnabled}
          onValueChange={toggleMetricSystem}
        />

        <Spacer height={theme.spacing.md} />

        {defaultWearable && features?.hasIMU && (
          <RouteButton
            label={translate("settings:adjustHeadAngleLabel")}
            subtitle={translate("settings:adjustHeadAngleSubtitle")}
            onPress={() => setHeadUpAngleComponentVisible(true)}
          />
        )}

        {headUpAngle !== null && (
          <HeadUpAngleComponent
            visible={headUpAngleComponentVisible}
            initialAngle={headUpAngle}
            onCancel={onCancelHeadUpAngle}
            onSave={onSaveHeadUpAngle}
          />
        )}
      </ScrollView>
    </Screen>
  )
}
