import React, {useState, useEffect} from "react"
import {View, Text, TouchableOpacity, ScrollView, ViewStyle, TextStyle, Platform} from "react-native"
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
import ActionButton from "@/components/ui/ActionButton"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import TestFlightDetector from "@/bridge/TestFlightDetector"

export default function SettingsPage() {
  const {status} = useStatus()
  const {logout} = useAuth()
  const {theme} = useAppTheme()
  const {push, replace} = useNavigationHistory()
  const [showDeveloperSettings, setShowDeveloperSettings] = useState(false)

  useEffect(() => {
    // Show developer settings on Android, or on iOS if it's TestFlight/Dev build
    if (Platform.OS === 'android') {
      setShowDeveloperSettings(true)
    } else {
      TestFlightDetector.isTestFlightOrDev().then(setShowDeveloperSettings)
    }
  }, [])

  const handleSignOut = async () => {
    try {
      await logout()

      // Navigate to Login screen directly instead of SplashScreen
      // This ensures we skip the SplashScreen logic that might detect stale user data
      replace("/")
    } catch (err) {
      console.error("Error during sign-out:", err)
      // Even if there's an error, still try to navigate away to login
      replace("/")
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

  return (
    <Screen preset="scroll" style={{paddingHorizontal: 20}}>
      <Header leftTx="settings:title" />

      <Spacer height={theme.spacing.xl} />

      <RouteButton label={translate("settings:profileSettings")} onPress={() => push("/settings/profile")} />

      <Spacer height={theme.spacing.md} />

      <RouteButton label={translate("settings:privacySettings")} onPress={() => push("/settings/privacy")} />

      {/* Comment this out until the light theme looks acceptable */}
      <Spacer height={theme.spacing.md} />

      <RouteButton
        label="Theme Settings"
        subtitle="Customize your app appearance"
        onPress={() => router.push("/settings/theme")}
      />

      {showDeveloperSettings && (
        <>
          <Spacer height={theme.spacing.md} />
          
          <RouteButton
            label={translate("settings:developerSettings")}
            // subtitle={translate("settings:developerSettingsSubtitle")}
            onPress={() => push("/settings/developer")}
          />
        </>
      )}

      <Spacer height={theme.spacing.md} />

      <ActionButton
        label={translate("settings:signOut")}
        variant={theme.isDark ? "destructive":"default"}
        onPress={confirmSignOut}
      />
    </Screen>
  )
}
