import {View} from "react-native"

import {ActiveForegroundApp} from "@/components/home/ActiveForegroundApp"
import {BackgroundAppsLink} from "@/components/home/BackgroundAppsLink"
import {CompactDeviceStatus} from "@/components/home/CompactDeviceStatus"
import {ForegroundAppsGrid} from "@/components/home/ForegroundAppsGrid"
import {NewUiIncompatibleApps} from "@/components/home/NewUiIncompatibleApps"
import Divider from "@/components/misc/Divider"
import {Spacer} from "@/components/misc/Spacer"
import {useAppTheme} from "@/utils/useAppTheme"

export const HomeContainer: React.FC = () => {
  const {theme} = useAppTheme()

  return (
    <View>
      <CompactDeviceStatus />
      <Divider variant="full" />
      <ActiveForegroundApp />
      <Divider variant="full" />
      <BackgroundAppsLink />
      <Divider variant="full" />
      <ForegroundAppsGrid />
      <NewUiIncompatibleApps />
      <Spacer height={theme.spacing.xl} />
    </View>
  )
}
