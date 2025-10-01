import {View} from "react-native"
import {Screen, Text} from "@/components/ignite"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {Button} from "@/components/ignite/Button"
import {MaterialCommunityIcons, FontAwesome} from "@expo/vector-icons"
import {Spacer} from "@/components/misc/Spacer"
import restComms from "@/managers/RestComms"
import {SETTINGS_KEYS, useSettingsStore} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"

export default function OnboardingWelcome() {
  const {appStatus, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()

  const stopAllApps = async () => {
    const runningApps = appStatus.filter(app => app.is_running)
    for (const runningApp of runningApps) {
      optimisticallyStopApp(runningApp.packageName)
      try {
        await restComms.stopApp(runningApp.packageName)
        clearPendingOperation(runningApp.packageName)
      } catch (error) {
        console.error("stop app error:", error)
        refreshAppStatus()
      }
    }
  }

  // User has smart glasses - go to glasses selection screen
  const handleHasGlasses = async () => {
    // TODO: Track analytics event - user has glasses
    // analytics.track('onboarding_has_glasses_selected')

    // Mark that onboarding should be shown on Home screen
    useSettingsStore.getState().setSetting(SETTINGS_KEYS.onboarding_completed, false)

    // deactivate all running apps:
    await stopAllApps()

    push("/pairing/select-glasses-model")
  }

  // User doesn't have glasses yet - go directly to simulated glasses
  const handleNoGlasses = () => {
    // TODO: Track analytics event - user doesn't have glasses
    // analytics.track('onboarding_no_glasses_selected')

    // Mark that onboarding should be shown on Home screen
    useSettingsStore.getState().setSetting(SETTINGS_KEYS.onboarding_completed, false)

    // Go directly to simulated glasses pairing screen
    push("/pairing/prep", {glassesModelName: "Simulated Glasses"})
  }

  return (
    <Screen preset="fixed" style={themed($screenContainer)}>
      <View style={themed($mainContainer)}>
        {/* <View style={styles.logoContainer}>
          <Icon
            name="augmented-reality"
            size={100}
            color={isDarkTheme ? '#FFFFFF' : '#2196F3'}
          />
        </View> */}

        <View style={themed($infoContainer)}>
          <Text style={themed($title)} tx="onboarding:welcome" />

          <Text style={themed($description)} tx="onboarding:getStarted" />

          <Spacer height={20} />

          <Text style={themed($question)} tx="onboarding:doYouHaveGlasses" />
        </View>

        <Button
          onPress={handleHasGlasses}
          text="I have smart glasses"
          textAlignment="center"
          LeftAccessory={() => <MaterialCommunityIcons name="glasses" size={16} color={theme.colors.textAlt} />}
        />

        <Spacer height={10} />
        <Button
          onPress={handleNoGlasses}
          text="I don't have glasses yet"
          preset="default"
          LeftAccessory={() => <FontAwesome name="mobile" size={16} color={theme.colors.textAlt} />}
        />
      </View>
    </Screen>
  )
}

const $screenContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.background,
})

const $mainContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  flexDirection: "column",
  justifyContent: "center",
  padding: spacing.lg,
})

const $infoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  flex: 0,
  justifyContent: "center",
  marginBottom: spacing.xxl,
  width: "100%",
})

const $title: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontFamily: "Montserrat-Bold",
  fontSize: 32,
  fontWeight: "bold",
  marginBottom: spacing.md,
  textAlign: "center",
  color: colors.text,
})

const $description: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 18,
  lineHeight: 26,
  marginBottom: spacing.xl,
  paddingHorizontal: spacing.lg,
  textAlign: "center",
  color: colors.text,
})

const $question: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "600",
  textAlign: "center",
  marginBottom: spacing.sm,
  color: colors.text,
})
