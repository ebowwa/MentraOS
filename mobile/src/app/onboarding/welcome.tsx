import {Screen, Text} from "@/components/ignite"
import {Button} from "@/components/ignite/Button"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {DeviceTypes} from "@/utils/Constants"
import {useAppTheme} from "@/utils/useAppTheme"
import {FontAwesome, MaterialCommunityIcons} from "@expo/vector-icons"
import {TextStyle, View, ViewStyle} from "react-native"

export default function OnboardingWelcome() {
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()
  const [_onboarding, setOnboardingCompleted] = useSetting(SETTINGS_KEYS.onboarding_completed)

  // User has smart glasses - go to glasses selection screen
  const handleHasGlasses = async () => {
    // TODO: Track analytics event - user has glasses
    // analytics.track('onboarding_has_glasses_selected')
    setOnboardingCompleted(true)
    push("/pairing/select-glasses-model", {onboarding: true})
  }

  // User doesn't have glasses yet - go directly to simulated glasses
  const handleNoGlasses = () => {
    // TODO: Track analytics event - user doesn't have glasses
    // analytics.track('onboarding_no_glasses_selected')
    setOnboardingCompleted(true)
    // Go directly to simulated glasses pairing screen
    push("/pairing/prep", {glassesModelName: DeviceTypes.SIMULATED})
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
          tx="onboarding:haveGlasses"
          textAlignment="center"
          LeftAccessory={() => <MaterialCommunityIcons name="glasses" size={16} color={theme.colors.textAlt} />}
        />

        <Spacer height={10} />
        <Button
          onPress={handleNoGlasses}
          tx="onboarding:dontHaveGlasses"
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
  fontSize: spacing.xl,
  lineHeight: 32,
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
  color: colors.textDim,
})

const $question: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: spacing.lg,
  fontWeight: "600",
  textAlign: "center",
  marginBottom: spacing.sm,
  color: colors.text,
})
