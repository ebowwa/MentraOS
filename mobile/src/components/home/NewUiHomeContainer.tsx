import React from "react"
import {ScrollView, View} from "react-native"

import {NewUiActiveForegroundApp} from "@/components/home/NewUiActiveForegroundApp"
import {NewUiBackgroundAppsLink} from "@/components/home/NewUiBackgroundAppsLink"
import {NewUiCompactDeviceStatus} from "@/components/home/NewUiCompactDeviceStatus"
import {NewUiForegroundAppsGrid} from "@/components/home/NewUiForegroundAppsGrid"
import {useAppTheme} from "@/utils/useAppTheme"

export const NewUiHomeContainer: React.FC = () => {
  const {themed} = useAppTheme()

  return (
    <ScrollView
      style={themed($scrollView)}
      contentContainerStyle={themed($scrollViewContent)}
      showsVerticalScrollIndicator={false}>
      <NewUiCompactDeviceStatus />
      <NewUiActiveForegroundApp />
      <NewUiBackgroundAppsLink />
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
