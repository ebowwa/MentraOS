import React from "react"
import {View} from "react-native"

import {NewUiActiveForegroundApp} from "@/components/home/NewUiActiveForegroundApp"
import {NewUiBackgroundAppsLink} from "@/components/home/NewUiBackgroundAppsLink"
import {NewUiCompactDeviceStatus} from "@/components/home/NewUiCompactDeviceStatus"
import {NewUiForegroundAppsGrid} from "@/components/home/NewUiForegroundAppsGrid"
import {NewUiIncompatibleApps} from "@/components/home/NewUiIncompatibleApps"
import Divider from "@/components/misc/Divider"
import {Spacer} from "@/components/misc/Spacer"
import {useAppTheme} from "@/utils/useAppTheme"

export const NewUiHomeContainer: React.FC = () => {
  const {themed, theme} = useAppTheme()

  return (
    <View>
      <NewUiCompactDeviceStatus />

      <Divider variant="full" />

      <NewUiActiveForegroundApp />

      <Divider variant="full" />

      <NewUiBackgroundAppsLink />

      <Divider variant="full" />

      <NewUiForegroundAppsGrid />

      <NewUiIncompatibleApps />

      <Spacer height={theme.spacing.xl} />
    </View>
  )
}
