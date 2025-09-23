import React, {useRef, PropsWithChildren, useState, useEffect} from "react"
import {Animated, ScrollView} from "react-native"
import {Header, Screen} from "@/components/ignite"
import {ConnectDeviceButton, ConnectedGlasses} from "@/components/misc/ConnectedDeviceInfo"
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
  const [defaultWearable, setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)

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
        {defaultWearable && glassesFeatures[defaultWearable].display && <ConnectedSimulatedGlassesInfo />}
        {defaultWearable && !glassesFeatures[defaultWearable].display && <ConnectedGlasses showTitle={false} />}
        <Spacer height={theme.spacing.lg} />
        <ConnectDeviceButton />
        <DeviceSettings />
      </ScrollView>
    </Screen>
  )
}
