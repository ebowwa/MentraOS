import React, {useRef, PropsWithChildren, useState, useEffect} from "react"
import {Animated, ScrollView} from "react-native"
import {Header, Screen} from "@/components/ignite"
import {ConnectDeviceButton, ConnectedGlasses} from "@/components/misc/ConnectedDeviceInfo"
import ConnectedSimulatedGlassesInfo from "@/components/misc/ConnectedSimulatedGlassesInfo"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
// import {ScrollView} from 'react-native-gesture-handler';
import CloudConnection from "@/components/misc/CloudConnection"

import {useAppTheme} from "@/utils/useAppTheme"
import DeviceSettings from "@/components/glasses/DeviceSettings"
import {translate} from "@/i18n/translate"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {glassesFeatures} from "@/config/glassesFeatures"

export default function Homepage() {
  const {appStatus} = useAppStatus()
  const {status} = useCoreStatus()
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  const {theme} = useAppTheme()

  // Clear loading state if apps are loaded
  useEffect(() => {
    if (appStatus.length > 0) {
      setIsInitialLoading(false)
    }
  }, [appStatus.length])

  const formatGlassesTitle = (title: string) => title.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase())
  let pageTitle

  if (status.core_info.default_wearable) {
    pageTitle = formatGlassesTitle(status.core_info.default_wearable)
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
        {status.glasses_info?.model_name && glassesFeatures[status.glasses_info.model_name].display && (
          <ConnectedSimulatedGlassesInfo />
        )}
        {status.glasses_info?.model_name && !glassesFeatures[status.glasses_info.model_name].display && (
          <ConnectedGlasses showTitle={false} />
        )}
        <Spacer height={theme.spacing.lg} />
        <ConnectDeviceButton />
        <DeviceSettings />
      </ScrollView>
    </Screen>
  )
}
