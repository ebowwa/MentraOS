import React, {useState} from "react"
import {View, Text, TouchableOpacity, ScrollView, ViewStyle, TextStyle} from "react-native"
import {FontAwesome} from "@expo/vector-icons"
import {Screen, Header, Icon} from "@/components/ignite"
import {router} from "expo-router"
import {spacing, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {translate} from "@/i18n"

import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import showAlert from "@/utils/AlertUtils"
import {useAuth} from "@/contexts/AuthContext"
import RouteButton from "@/components/ui/RouteButton"
import {Spacer} from "@/components/misc/Spacer"

export default function SettingsPage() {
  const {status} = useStatus()
  const {logout} = useAuth()
  const {themed, theme} = useAppTheme()

  const handleSignOut = async () => {
    try {
      await logout()

      // Navigate to Login screen directly instead of SplashScreen
      // This ensures we skip the SplashScreen logic that might detect stale user data
      router.replace("/")
    } catch (err) {
      console.error("Error during sign-out:", err)
      // Even if there's an error, still try to navigate away to login
      router.replace("/")
    }
  }

  const confirmSignOut = () => {
    showAlert(
      translate("settings:signOut"),
      translate("settings:signOutConfirm"),
      [
        {text: translate("common:cancel"), style: "cancel"},
        {text: translate("common:yes"), onPress: handleSignOut},
      ],
      {cancelable: false},
    )
  }

  // Switch track colors

  const navigateTo = (screen: string, params = {}) => {
    router.push(`/${screen.toLowerCase()}` as any, params)
  }

  return (
    <Screen preset="scroll" style={{paddingHorizontal: 20}}>
      <Header titleTx="settings:title" />

      <RouteButton label={translate("settings:profileSettings")} onPress={() => router.push("/settings/profile")} />

      <Spacer height={theme.spacing.md} />

      <RouteButton label={translate("settings:privacySettings")} onPress={() => router.push("/settings/privacy")} />

      <Spacer height={theme.spacing.md} />

      <RouteButton
        label={translate("settings:screenSettings")}
        subtitle={translate("settings:screenDescription")}
        onPress={() => router.push("/settings/screen")}
      />

      <Spacer height={theme.spacing.md} />

      <RouteButton
        label={translate("settings:glassesWifiSettings")}
        subtitle={translate("settings:glassesWifiDescription")}
        onPress={() => {
          // Check if connected glasses support WiFi
          const supportsWifi = status.glasses_info && status.glasses_info.glasses_use_wifi === true

          if (supportsWifi) {
            // router.push({
            //   pathname: "/pairing/glasseswifisetup",
            //   params: {deviceModel: status.glasses_info?.model_name || "Glasses"},
            // })
          } else {
            showAlert(
              translate("common:notAvailable"),
              translate("settings:wifiUnavailable"),
              [{text: translate("common:ok")}],
              {
                iconName: "wifi",
                iconColor: theme.colors.palette.primary100,
              },
            )
          }
        }}
      />

      <Spacer height={theme.spacing.md} />

      <RouteButton
        label={translate("settings:developerSettings")}
        // subtitle={translate("settings:developerSettingsSubtitle")}
        onPress={() => router.push("/settings/developer")}
      />

      <Spacer height={theme.spacing.md} />

      <RouteButton
        label={translate("settings:signOut")}
        onPress={confirmSignOut}
      />
      
    </Screen>
  )
}

const $settingItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.md,
  borderBottomColor: colors.border,
  borderBottomWidth: 1,
})

const $settingItem2: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  paddingVertical: spacing.md,
  borderBottomColor: colors.border,
  borderBottomWidth: 1,
})

const $settingTextContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingRight: spacing.sm,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  flexWrap: "wrap",
  color: colors.text,
  fontFamily: "SF Pro Rounded",
})

const $dangerLabel: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  flexWrap: "wrap",
  color: "#FF0F0F",
})

const $value: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  marginTop: 5,
  flexWrap: "wrap",
  color: colors.textDim,
})

const $disabledItem: ThemedStyle<TextStyle> = () => ({
  opacity: 0.4,
})

const $iconColor: ThemedStyle<string> = ({colors}) => colors.textDim

const $flagContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: 2,
  borderRadius: 4,
  backgroundColor: "rgba(255, 107, 107, 0.1)",
  alignSelf: "flex-start",
})

const $flagText: ThemedStyle<TextStyle> = () => ({
  fontSize: 12,
  fontWeight: "500",
  color: "#ff6b6b",
})
