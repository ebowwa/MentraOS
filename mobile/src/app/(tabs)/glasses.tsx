import {Header, Screen} from "@/components/ignite"
import {ScrollView} from "react-native"
import {ConnectDeviceButton} from "@/components/misc/ConnectedDeviceInfo"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"

import {useAppTheme} from "@/utils/useAppTheme"
import DeviceSettings from "@/components/glasses/DeviceSettings"
import {translate} from "@/i18n/translate"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function Glasses() {
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

  // let connected = status.glasses_info?.model_name ?? false
  // let features = getCapabilitiesForModel(defaultWearable)

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header leftText={pageTitle} />
      <ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic">
        {/* <CloudConnection /> */}
        {/* {connected && features?.hasDisplay && <ConnectedSimulatedGlassesInfo />} */}
        {/* {connected && features?.hasDisplay && <ConnectedGlasses showTitle={false} />} */}
        {/* <Spacer height={theme.spacing.lg} /> */}
        <ConnectDeviceButton />
        <DeviceSettings />
      </ScrollView>
    </Screen>
  )
}
