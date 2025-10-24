import {View} from "react-native"

import {ActiveForegroundApp} from "@/components/home/ActiveForegroundApp"
import {BackgroundAppsLink} from "@/components/home/BackgroundAppsLink"
import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {ForegroundAppsGrid} from "@/components/home/ForegroundAppsGrid"
import {IncompatibleApps} from "@/components/home/IncompatibleApps"
import {Spacer} from "@/components/ui/Spacer"
import {useAppTheme} from "@/utils/useAppTheme"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {getModelCapabilities, Capabilities} from "@/../../cloud/packages/types/src"
import ConnectedSimulatedGlassesInfo from "@/components/mirror/ConnectedSimulatedGlassesInfo"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"

export const HomeContainer: React.FC = () => {
  const {theme} = useAppTheme()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [offlineMode] = useSetting(SETTINGS_KEYS.offline_mode)
  const {status} = useCoreStatus()
  const features: Capabilities = getModelCapabilities(defaultWearable)
  const connected = status.glasses_info?.model_name

  return (
    <View>
      <CompactDeviceStatus />
      {connected && features?.hasDisplay && <ConnectedSimulatedGlassesInfo />}
      <Spacer height={theme.spacing.xs} />
      <ActiveForegroundApp />
      <Spacer height={theme.spacing.xs} />
      {!offlineMode && <BackgroundAppsLink />}
      <ForegroundAppsGrid />
      <IncompatibleApps />
      <Spacer height={theme.spacing.xxxl} />
      <Spacer height={theme.spacing.xxxl} />
      <Spacer height={theme.spacing.xxxl} />
    </View>
  )
}
