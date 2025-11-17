import {useRef} from "react"
import {Platform, TextStyle, View, ViewStyle} from "react-native"
import {ScrollView} from "react-native-gesture-handler"
import Toast from "react-native-toast-message"

import {ProfileCard} from "@/components/account/ProfileCard"
import {Header, Icon, Screen, Text} from "@/components/ignite"
import {Group} from "@/components/ui/Group"
import {RouteButton} from "@/components/ui/RouteButton"
import {Spacer} from "@/components/ui/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"

export default function AccountPage() {
  const {theme, themed} = useAppTheme()
  const {push} = useNavigationHistory()
  const [devMode, setDevMode] = useSetting(SETTINGS_KEYS.dev_mode)
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)

  const pressCount = useRef(0)
  const lastPressTime = useRef(0)
  const pressTimeout = useRef<number | null>(null)

  const handleQuickPress = () => {
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

  const getVersionInfo = () => {
    if (devMode) {
      return (
        <View style={themed($versionContainer)}>
          <View style={{flexDirection: "row", gap: theme.spacing.s2}}>
            <Text
              style={themed($buildInfo)}
              text={translate("common:version", {number: process.env?.EXPO_PUBLIC_MENTRAOS_VERSION})}
            />
            <Text
              style={themed($buildInfo)}
              text={translate("common:version", {number: process.env?.EXPO_PUBLIC_VERSION})}
            />
            <Text
              style={themed($buildInfo)}
              text={process.env?.EXPO_PUBLIC_DEPLOYMENT_REGION}
            />
            {/* <Text style={themed($buildInfo)} text={`${process.env.EXPO_PUBLIC_BUILD_BRANCH}`} /> */}
          </View>
          <View style={{flexDirection: "row", gap: theme.spacing.s2}}>
            <Text style={themed($buildInfo)} text={`${process.env.EXPO_PUBLIC_BUILD_TIME}`} />
            <Text style={themed($buildInfo)} text={`${process.env.EXPO_PUBLIC_BUILD_COMMIT}`} />
          </View>
        </View>
      )
    }

    return (
      <View style={themed($versionContainer)}>
        <View style={{flexDirection: "row", gap: theme.spacing.s2}}>
          <Text
            style={themed($buildInfo)}
            text={translate("common:version", {number: process.env?.EXPO_PUBLIC_MENTRAOS_VERSION})}
          />
        </View>
      </View>
    )
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.s6}}>
      <Header leftTx="settings:title" onLeftPress={handleQuickPress} />

      <ScrollView
        style={{marginRight: -theme.spacing.s6, paddingRight: theme.spacing.s6}}
        contentInsetAdjustmentBehavior="automatic">
        <ProfileCard />

        <View style={{flex: 1, gap: theme.spacing.s6}}>
          <Group title={translate("account:accountSettings")}>
            <RouteButton
              icon={<Icon name="circle-user" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:profileSettings")}
              onPress={() => push("/settings/profile")}
            />
            <RouteButton
              icon={<Icon name="message-2-star" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:feedback")}
              onPress={() => push("/settings/feedback")}
            />
          </Group>

          {defaultWearable && (
            <Group title={translate("account:deviceSettings")}>
              <RouteButton
                icon={<Icon name="glasses" color={theme.colors.secondary_foreground} size={24} />}
                label={defaultWearable}
                onPress={() => push("/settings/glasses")}
              />
            </Group>
          )}

          <Group title={translate("account:appSettings")}>
            <RouteButton
              icon={<Icon name="sun" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:appAppearance")}
              onPress={() => push("/settings/theme")}
            />
            {Platform.OS === "android" && (
              <RouteButton
                icon={<Icon name="bell" size={24} color={theme.colors.secondary_foreground} />}
                label="Notification Settings"
                onPress={() => push("/settings/notifications")}
              />
            )}
            <RouteButton
              icon={<Icon name="file-type-2" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:transcriptionSettings")}
              onPress={() => push("/settings/transcription")}
            />
            <RouteButton
              icon={<Icon name="shield-lock" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:privacySettings")}
              onPress={() => push("/settings/privacy")}
            />
          </Group>

          <Group title={translate("deviceSettings:advancedSettings")}>
            {devMode && (
              <RouteButton
                icon={<Icon name="user-code" size={24} color={theme.colors.secondary_foreground} />}
                label={translate("settings:developerSettings")}
                onPress={() => push("/settings/developer")}
              />
            )}
          </Group>
        </View>

        {getVersionInfo()}

        <Spacer height={theme.spacing.s12} />
        <Spacer height={theme.spacing.s12} />
      </ScrollView>
    </Screen>
  )
}

const $versionContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  bottom: spacing.s2,
  width: "100%",
  paddingVertical: spacing.s2,
  borderRadius: spacing.s4,
  marginTop: spacing.s16,
})

const $buildInfo: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
  fontSize: 13,
})
