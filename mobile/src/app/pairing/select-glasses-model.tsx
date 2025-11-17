import {View, TouchableOpacity, Platform, ScrollView, Image, ViewStyle, ImageStyle, TextStyle} from "react-native"

import {Text} from "@/components/ignite"
import {Header} from "@/components/ignite"
import {Screen} from "@/components/ignite/Screen"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {$styles, ThemedStyle} from "@/theme"
import {getGlassesImage} from "@/utils/getGlassesImage"
import {useAppTheme} from "@/utils/useAppTheme"

import {DeviceTypes} from "@/../../cloud/packages/types/src"
import {useCallback} from "react"
import CoreModule from "core"
import {useFocusEffect} from "expo-router"
import {Spacer} from "@/components/ui/Spacer"
// import {useLocalSearchParams} from "expo-router"

export default function SelectGlassesModelScreen() {
  const {theme, themed} = useAppTheme()
  const {push, goBack} = useNavigationHistory()

  // when this screen is focused, forget any glasses that may be paired:
  useFocusEffect(
    useCallback(() => {
      CoreModule.forget()
      return () => {}
    }, []),
  )

  // Platform-specific glasses options
  const glassesOptions =
    Platform.OS === "ios"
      ? [
          // {modelName: DeviceTypes.SIMULATED, key: DeviceTypes.SIMULATED},
          {modelName: DeviceTypes.G1, key: "evenrealities_g1"},
          {modelName: DeviceTypes.LIVE, key: "mentra_live"},
          {modelName: DeviceTypes.MACH1, key: "mentra_mach1"},
          {modelName: DeviceTypes.Z100, key: "vuzix-z100"},
          // {modelName: DeviceTypes.NEX, key: "mentra_nex"},
          //{modelName: "Brilliant Labs Frame", key: "frame"},
        ]
      : [
          // Android:
          // {modelName: DeviceTypes.SIMULATED, key: DeviceTypes.SIMULATED},
          {modelName: DeviceTypes.G1, key: "evenrealities_g1"},
          {modelName: DeviceTypes.LIVE, key: "mentra_live"},
          {modelName: DeviceTypes.MACH1, key: "mentra_mach1"},
          {modelName: DeviceTypes.Z100, key: "vuzix-z100"},
          // {modelName: "Mentra Nex", key: "mentra_nex"},
          // {modelName: "Brilliant Labs Frame", key: "frame"},
        ]

  const triggerGlassesPairingGuide = async (glassesModelName: string) => {
    // No need for Bluetooth permissions anymore as we're using direct communication
    console.log("TRIGGERING SEARCH SCREEN FOR: " + glassesModelName)
    push("/pairing/prep", {glassesModelName: glassesModelName})
  }

  return (
    <Screen preset="fixed" style={themed($styles.screen)}>
      <Header
        titleTx="pairing:selectModel"
        leftIcon="chevron-left"
        onLeftPress={() => {
          goBack()
        }}
      />
      <Spacer height={theme.spacing.s4} />
      <ScrollView style={{marginRight: -theme.spacing.s4, paddingRight: theme.spacing.s4}}>
        <View style={{flexDirection: "column", gap: theme.spacing.s4}}>
          {glassesOptions.map(glasses => (
            <TouchableOpacity
              key={glasses.key}
              style={themed($settingItem)}
              onPress={() => triggerGlassesPairingGuide(glasses.modelName)}>
              <Image source={getGlassesImage(glasses.modelName)} style={themed($glassesImage)} />
              <Text style={[themed($label)]}>{glasses.modelName}</Text>
            </TouchableOpacity>
          ))}
          <Spacer height={theme.spacing.s4} />
        </View>
      </ScrollView>
    </Screen>
  )
}

const $settingItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.s3,
  height: 190,
  borderRadius: spacing.s4,
  backgroundColor: colors.primary_foreground,
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  width: 180,
  maxHeight: 80,
  resizeMode: "contain",
})

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: spacing.s4,
  fontWeight: "600",
  flexWrap: "wrap",
  color: colors.text,
})
