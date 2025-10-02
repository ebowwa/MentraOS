import {ScrollView} from "react-native"
import {Header, Screen} from "@/components/ignite"
import {ConnectDeviceButton, ConnectedGlasses} from "@/components/misc/ConnectedDeviceInfo"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import ConnectedSimulatedGlassesInfo from "@/components/misc/ConnectedSimulatedGlassesInfo"
import CloudConnection from "@/components/misc/CloudConnection"

import {useAppTheme} from "@/utils/useAppTheme"
import DeviceSettings from "@/components/glasses/DeviceSettings"
import {translate} from "@/i18n/translate"
import {Spacer} from "@/components/misc/Spacer"
import {glassesFeatures} from "@/config/glassesFeatures"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function Homepage() {
  const {theme} = useAppTheme()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const {status} = useCoreStatus()

  const formatGlassesTitle = (title: string) => title.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase())
  let pageTitle

  if (defaultWearable) {
    pageTitle = formatGlassesTitle(defaultWearable)
  } else {
    pageTitle = translate("glasses:title")
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
      <Header leftText={pageTitle} />
      <ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic">
        <CloudConnection />
        {defaultWearable && status.glasses_info?.model_name && glassesFeatures[defaultWearable]?.display && (
          <ConnectedSimulatedGlassesInfo />
        )}
        {defaultWearable &&
          status.glasses_info?.model_name &&
          glassesFeatures[defaultWearable] &&
          !glassesFeatures[defaultWearable].display && <ConnectedGlasses showTitle={false} />}
        <Spacer height={theme.spacing.lg} />
        <ConnectDeviceButton />
        <DeviceSettings />
      </ScrollView>
    </Screen>
  )
}
