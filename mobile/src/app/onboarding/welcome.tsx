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

export default function OnboardingWelcome() {
  const {appStatus, optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()
  const {theme} = useAppTheme()
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
    <Screen preset="fixed" style={{backgroundColor: theme.colors.background}}>
      <View style={styles.mainContainer}>
        {/* <View style={styles.logoContainer}>
          <Icon
            name="augmented-reality"
            size={100}
            color={isDarkTheme ? '#FFFFFF' : '#2196F3'}
          />
        </View> */}

        <View style={styles.infoContainer}>
          <Text style={[styles.title, {color: theme.colors.text}]}>Welcome to MentraOS</Text>

          <Text style={[styles.description, {color: theme.colors.text}]}>Let&apos;s get started.</Text>

          <Spacer height={20} />

          <Text style={[styles.question, {color: theme.colors.text}]}>Do you have smart glasses?</Text>
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

const styles = {
  description: {
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 32,
    paddingHorizontal: 24,
    textAlign: "center",
  },
  infoContainer: {
    alignItems: "center",
    flex: 0,
    justifyContent: "center",
    marginBottom: 40,
    width: "100%",
  },
  mainContainer: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontFamily: "Montserrat-Bold",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  question: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
}
