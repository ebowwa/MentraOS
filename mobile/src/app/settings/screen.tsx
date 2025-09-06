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

export default function ScreenSettingsScreen() {
  const {status} = useCoreStatus()
  const {theme, themed} = useAppTheme()
  const {goBack, push} = useNavigationHistory()
  // -- States --
  const [brightness, setBrightness] = useState<number | null>(null)
  const [isAutoBrightnessEnabled, setIsAutoBrightnessEnabled] = useState(status.glasses_settings.auto_brightness)
  const [depth, setDepth] = useState<number | null>(status.glasses_settings.dashboard_depth)
  const [height, setHeight] = useState<number | null>(status.glasses_settings.dashboard_height)

  // -- Effects --
  useEffect(() => {
    setBrightness(status.glasses_settings.brightness)
  }, [status.glasses_settings.brightness])

  useEffect(() => {
    setIsAutoBrightnessEnabled(status.glasses_settings.auto_brightness)
  }, [status.glasses_settings.auto_brightness])

  useEffect(() => {
    setDepth(status.glasses_settings.dashboard_depth)
  }, [status.glasses_settings.dashboard_depth])

  useEffect(() => {
    setHeight(status.glasses_settings.dashboard_height)
  }, [status.glasses_settings.dashboard_height])

  useFocusEffect(
    useCallback(() => {
      bridge.toggleUpdatingScreen(true)
      return () => {
        bridge.toggleUpdatingScreen(false)
      }
    }, []),
  )

  // -- Handlers --
  const changeBrightness = async (newBrightness: number) => {
    // if (!status.glasses_info) {
    //   showAlert('Glasses not connected', 'Please connect your smart glasses first.');
    //   return;
    // }

    if (newBrightness == null) {
      return
    }

    // if (status.glasses_settings.brightness === '-') { return; } // or handle accordingly
    await bridge.setGlassesBrightnessMode(newBrightness, false)
    setBrightness(newBrightness)
  }

  const changeDepth = async (newDepth: number) => {
    await bridge.setGlassesDepth(newDepth)
    setDepth(newDepth)
  }

  const changeHeight = async (newHeight: number) => {
    await bridge.setGlassesHeight(newHeight)
    setHeight(newHeight)
  }

  const toggleAutoBrightness = async () => {
    const newVal = !isAutoBrightnessEnabled
    await bridge.setGlassesBrightnessMode(brightness ?? 50, newVal)
    setIsAutoBrightnessEnabled(newVal)
  }

  // Switch track colors
  const switchColors = {
    trackColor: {
      false: theme.colors.switchTrackOff,
      true: theme.colors.switchTrackOn,
    },
    thumbColor: Platform.OS === "ios" ? undefined : theme.colors.switchThumb,
    ios_backgroundColor: theme.colors.switchTrackOff,
  }

  // Fixed slider props to avoid warning
  const sliderProps = {
    style: [styles.slider],
    minimumValue: 0,
    maximumValue: 100,
    step: 1,
    onSlidingComplete: (value: number) => changeBrightness(value),
    value: brightness ?? 50,
    minimumTrackTintColor: theme.colors.buttonPrimary,
    maximumTrackTintColor: theme.colors.switchTrackOff,
    thumbTintColor: theme.colors.icon,
    // Using inline objects instead of defaultProps
    thumbTouchSize: {width: 40, height: 40},
    trackStyle: {height: 5},
    thumbStyle: {height: 20, width: 20},
  }

  const depthSliderProps = {
    style: [styles.slider],
    minimumValue: 1,
    maximumValue: 5,
    step: 1,
    onSlidingComplete: (value: number) => changeDepth(value),
    value: depth ?? 5,
    minimumTrackTintColor: theme.colors.buttonPrimary,
    maximumTrackTintColor: theme.colors.switchTrackOff,
    thumbTintColor: theme.colors.icon,
    // Using inline objects instead of defaultProps
    thumbTouchSize: {width: 40, height: 40},
    trackStyle: {height: 5},
    thumbStyle: {height: 20, width: 20},
  }

  const heightSliderProps = {
    style: [styles.slider],
    minimumValue: 1,
    maximumValue: 8,
    step: 1,
    onSlidingComplete: (value: number) => changeHeight(value),
    value: height ?? 4,
    minimumTrackTintColor: theme.colors.buttonPrimary,
    maximumTrackTintColor: theme.colors.switchTrackOff,
    thumbTintColor: theme.colors.icon,
    // Using inline objects instead of defaultProps
    thumbTouchSize: {width: 40, height: 40},
    trackStyle: {height: 5},
    thumbStyle: {height: 20, width: 20},
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header titleTx="screenSettings:title" leftIcon="caretLeft" onLeftPress={goBack} />

      <ScrollView>
        <SliderSetting
          label="Display Depth"
          subtitle="Adjust how far the content appears from you."
          value={depth ?? 5}
          min={1}
          max={5}
          onValueChange={value => setDepth(value)}
          onValueSet={changeDepth}
        />

        <Spacer height={theme.spacing.md} />

        <SliderSetting
          label="Display Height"
          subtitle="Adjust the vertical position of the content."
          value={height ?? 4}
          min={1}
          max={8}
          onValueChange={value => setHeight(value)}
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
