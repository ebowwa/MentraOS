import React from "react"
import {ScrollView, View} from "react-native"

import {NewUiActiveForegroundApp} from "@/components/home/NewUiActiveForegroundApp"
import {NewUiBackgroundAppsLink} from "@/components/home/NewUiBackgroundAppsLink"
import {NewUiCompactDeviceStatus} from "@/components/home/NewUiCompactDeviceStatus"
import {NewUiForegroundAppsGrid} from "@/components/home/NewUiForegroundAppsGrid"
import Divider from "@/components/misc/Divider"
import {Spacer} from "@/components/misc/Spacer"
import {useAppTheme} from "@/utils/useAppTheme"

export const NewUiHomeContainer: React.FC = () => {
  const {themed, theme} = useAppTheme()

  return (
    <ScrollView
      style={themed($scrollView)}
      contentContainerStyle={themed($scrollViewContent)}
      showsVerticalScrollIndicator={false}>
      <NewUiCompactDeviceStatus />

      <Divider variant="full" />

      <NewUiActiveForegroundApp />

      <Divider variant="full" />

      <NewUiBackgroundAppsLink />

      <Divider variant="full" />

      <NewUiForegroundAppsGrid />
    </ScrollView>
  )
}

const $scrollView = theme => ({
  flex: 1,
})

const $scrollViewContent = theme => ({
  flexGrow: 1,
  paddingBottom: theme.spacing.xl,
})
