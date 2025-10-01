import React, {useState, useEffect, useCallback} from "react"
import {StyleSheet, ScrollView, Platform, ViewStyle, TextStyle} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import bridge from "@/bridge/MantleBridge"
import {Header, Screen} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {useFocusEffect} from "expo-router"
import {Spacer} from "@/components/misc/Spacer"
import SliderSetting from "@/components/settings/SliderSetting"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useSettings, useSettingsStore, SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function ScreenSettingsScreen() {
  const {theme, themed} = useAppTheme()
  const {goBack, push} = useNavigationHistory()
  const [dashboardDepth, setDashboardDepth] = useSetting(SETTINGS_KEYS.dashboard_depth)
  const [dashboardHeight, setDashboardHeight] = useSetting(SETTINGS_KEYS.dashboard_height)

  useFocusEffect(
    useCallback(() => {
      bridge.toggleUpdatingScreen(true)
      return () => {
        bridge.toggleUpdatingScreen(false)
      }
    }, []),
  )

  const changeDepth = async (newDepth: number) => {
    await setDashboardDepth(newDepth)
    await bridge.setGlassesDepth(newDepth) // TODO: config: remove
  }

  const changeHeight = async (newHeight: number) => {
    await setDashboardHeight(newHeight)
    await bridge.setGlassesHeight(newHeight) // TODO: config: remove
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header titleTx="screenSettings:title" leftIcon="caretLeft" onLeftPress={goBack} />

      <ScrollView>
        <SliderSetting
          label="Display Depth"
          subtitle="Adjust how far the content appears from you."
          value={dashboardDepth ?? 5}
          min={1}
          max={5}
          onValueChange={changeDepth}
          onValueSet={changeDepth}
        />

        <Spacer height={theme.spacing.md} />

        <SliderSetting
          label="Display Height"
          subtitle="Adjust the vertical position of the content."
          value={dashboardHeight ?? 4}
          min={1}
          max={8}
          onValueChange={changeHeight}
          onValueSet={changeHeight}
        />
      </ScrollView>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
  flexWrap: "wrap",
})

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  titleContainer: {
    marginBottom: 10,
    marginHorizontal: -20,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  // Removed hardcoded theme colors - using dynamic styling
  settingItem: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 20,
    // borderBottomColor moved to dynamic styling
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  value: {
    flexWrap: "wrap",
    fontSize: 12,
    marginTop: 5,
  },
  disabledItem: {
    opacity: 0.4,
  },
  slider: {
    height: 40,
    width: "100%",
  },
  thumbTouchSize: {
    height: 40,
    width: 40,
  },
  trackStyle: {
    height: 5,
  },
  thumbStyle: {
    height: 20,
    width: 20,
  },
  // Removed hardcoded slider colors - using dynamic styling
  // minimumTrackTintColor, maximumTrackTintColor, thumbTintColor moved to inline props
})
