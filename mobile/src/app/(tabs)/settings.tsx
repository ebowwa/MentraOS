import {useEffect, useRef} from "react"
import {View, Platform, ViewStyle} from "react-native"
import {Screen, Header, Text} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {translate} from "@/i18n"
import showAlert from "@/utils/AlertUtils"
import RouteButton from "@/components/ui/RouteButton"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {isMentraUser} from "@/utils/isMentraUser"
import {isAppStoreProductionBuild, isDeveloperBuildOrTestflight} from "@/utils/buildDetection"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import Toast from "react-native-toast-message"
import Constants from "expo-constants"
import {ThemedStyle} from "@/theme"
import {ScrollView} from "react-native-gesture-handler"
import {useAuth} from "@/contexts/AuthContext"

export default function SettingsPage() {
  const {user} = useAuth()
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()

  const [devMode, setDevMode] = useSetting(SETTINGS_KEYS.dev_mode)

  useEffect(() => {
    const checkDevMode = async () => {
      const devModeSetting = devMode
      setDevMode(isDeveloperBuildOrTestflight() || isMentraUser(user?.email) || devModeSetting)
    }
    checkDevMode()
  }, [])

  const pressCount = useRef(0)
  const lastPressTime = useRef(0)
  const pressTimeout = useRef<NodeJS.Timeout | null>(null)

  const handleQuickPress = () => {
    push("/settings")

    // Don't allow secret menu on iOS App Store builds
    if (Platform.OS === "ios" && isAppStoreProductionBuild()) {
      return
    }

    const currentTime = Date.now()
    const timeDiff = currentTime - lastPressTime.current
    const maxTimeDiff = 2000
    const maxPressCount = 10
    const showAlertAtPressCount = 5

    // Reset counter if too much time has passed
    if (timeDiff > maxTimeDiff) {
      pressCount.current = 1
    } else {
      pressCount.current += 1
    }

    lastPressTime.current = currentTime

    // Clear existing timeout
    if (pressTimeout.current) {
      clearTimeout(pressTimeout.current)
    }

    // Handle different press counts
    if (pressCount.current === maxPressCount) {
      showAlert("Developer Mode", "Developer mode enabled!", [{text: translate("common:ok")}])
      setDevMode(true)
      pressCount.current = 0
    } else if (pressCount.current >= showAlertAtPressCount) {
      const remaining = maxPressCount - pressCount.current
      Toast.show({
        type: "info",
        text1: "Developer Mode",
        text2: `${remaining} more taps to enable developer mode`,
        position: "bottom",
        topOffset: 80,
        visibilityTime: 1000,
      })
    }

    // Reset counter after 2 seconds of no activity
    pressTimeout.current = setTimeout(() => {
      pressCount.current = 0
    }, maxTimeDiff)
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.lg}}>
      <Header leftTx="settings:title" onLeftPress={handleQuickPress} />

      <ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic">
        <Spacer height={theme.spacing.xl} />

        <View style={{flex: 1, gap: theme.spacing.md}}>
          <RouteButton label={translate("settings:profileSettings")} onPress={() => push("/settings/profile")} />

          <RouteButton label={translate("settings:privacySettings")} onPress={() => push("/settings/privacy")} />

          {Platform.OS === "android" && (
            <RouteButton label="Notification Settings" onPress={() => push("/settings/notifications")} />
          )}

          <RouteButton
            label={translate("settings:transcriptionSettings")}
            onPress={() => push("/settings/transcription")}
          />

          <RouteButton label={translate("settings:themeSettings")} onPress={() => push("/settings/theme")} />

          <RouteButton label={translate("settings:feedback")} onPress={() => push("/settings/feedback")} />

          {devMode && (
            <>
              <RouteButton
                label={translate("settings:developerSettings")}
                // subtitle={translate("settings:developerSettingsSubtitle")}
                onPress={() => push("/settings/developer")}
              />
            </>
          )}
        </View>
      </ScrollView>

      <View style={themed($versionContainer)}>
        <Text
          text={translate("common:version", {number: Constants.expoConfig?.extra?.MENTRAOS_VERSION})}
          style={{color: theme.colors.textDim}}
        />
      </View>
    </Screen>
  )
}

const $versionContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  bottom: spacing.xs,
  width: "100%",
  paddingVertical: spacing.xs,
  borderRadius: spacing.md,
  // position: "absolute",
  // flex: 1,
  // borderWidth: 1,
  // borderColor: colors.border,
  // backgroundColor: colors.background,
})
