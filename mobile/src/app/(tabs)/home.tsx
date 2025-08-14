import React, {useRef, useCallback, PropsWithChildren, useState, useEffect} from "react"
import {View, Animated, Platform, ViewStyle, ScrollView, TouchableOpacity} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Header, Screen} from "@/components/ignite"
import AppsActiveList from "@/components/misc/AppsActiveList"
import AppsInactiveList from "@/components/misc/AppsInactiveList"
import AppsIncompatibleList from "@/components/misc/AppsIncompatibleList"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import CloudConnection from "@/components/misc/CloudConnection"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import NonProdWarning from "@/components/misc/NonProdWarning"
import {spacing, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import MicIcon from "assets/icons/component/MicIcon"
import NotificationOn from "assets/icons/component/NotificationOn"
import {ConnectDeviceButton, ConnectedGlasses, DeviceToolbar} from "@/components/misc/ConnectedDeviceInfo"
import {Spacer} from "@/components/misc/Spacer"
import Divider from "@/components/misc/Divider"
import {checkFeaturePermissions, PermissionFeatures} from "@/utils/PermissionsUtils"
import {OnboardingSpotlight} from "@/components/misc/OnboardingSpotlight"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {loadSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
import {AppsCombinedGridView} from "@/components/misc/AppsCombinedGridView"

export default function Homepage() {
  const {refreshAppStatus} = useAppStatus()
  const [hasMissingPermissions, setHasMissingPermissions] = useState(false)
  const [onboardingTarget, setOnboardingTarget] = useState<"glasses" | "livecaptions">("glasses")
  const liveCaptionsRef = useRef<any>(null)
  const connectButtonRef = useRef<any>(null)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const bellFadeAnim = useRef(new Animated.Value(0)).current
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()

  const [showNewUi, setShowNewUi] = useState(false)

  useEffect(() => {
    const check = async () => {
      const newUiSetting = await loadSetting(SETTINGS_KEYS.NEW_UI, false)
      setShowNewUi(newUiSetting)
    }
    check()
  }, [])

  const checkPermissions = async () => {
    const hasCalendar = await checkFeaturePermissions(PermissionFeatures.CALENDAR)
    const hasNotifications =
      Platform.OS === "android" ? await checkFeaturePermissions(PermissionFeatures.READ_NOTIFICATIONS) : true

    const hasLocation = await checkFeaturePermissions(PermissionFeatures.BACKGROUND_LOCATION)

    const shouldShowBell = !hasCalendar || !hasNotifications || !hasLocation
    setHasMissingPermissions(shouldShowBell)

    // Animate bell in if needed
    if (shouldShowBell) {
      Animated.timing(bellFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()
    }
  }

  const handleBellPress = () => {
    push("/settings/privacy")
  }

  // Check for missing permissions
  useEffect(() => {
    checkPermissions().catch(error => {
      console.error("Error checking permissions:", error)
    })
  }, [])

  useFocusEffect(
    useCallback(() => {
      checkPermissions()
    }, []),
  )

  // propagate any changes in app lists when this screen is mounted:
  useFocusEffect(
    useCallback(() => {
      return async () => {
        await refreshAppStatus()
      }
    }, []),
  )

  // Simple animated wrapper so we do not duplicate logic
  useFocusEffect(
    useCallback(() => {
      // Reset animations when screen is about to focus
      fadeAnim.setValue(0)

      // Start animations after a short delay
      const animationTimeout = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start()
      }, 50)

      return () => {
        clearTimeout(animationTimeout)
        fadeAnim.setValue(0)
      }
    }, [fadeAnim]),
  )

  if (showNewUi) {
    return (
      <Screen preset="fixed" style={themed($screen)}>
        <Header
          leftTx="home:title"
          RightActionComponent={
            <View style={themed($headerRight)}>
              {hasMissingPermissions && (
                <Animated.View style={{opacity: bellFadeAnim}}>
                  <TouchableOpacity onPress={handleBellPress}>
                    <NotificationOn />
                  </TouchableOpacity>
                </Animated.View>
              )}
              <MicIcon width={24} height={24} />
              <NonProdWarning />
            </View>
          }
        />

        <CloudConnection />
        <SensingDisabledWarning />
        <View>
          <ConnectedGlasses showTitle={false} />
          <DeviceToolbar />
        </View>
        <Spacer height={theme.spacing.md} />
        <View ref={connectButtonRef}>
          <ConnectDeviceButton />
        </View>
        <Spacer height={theme.spacing.md} />
        <AppsCombinedGridView />

        <OnboardingSpotlight
          targetRef={onboardingTarget === "glasses" ? connectButtonRef : liveCaptionsRef}
          setOnboardingTarget={setOnboardingTarget}
          onboardingTarget={onboardingTarget}
          message={
            onboardingTarget === "glasses"
              ? translate("home:connectGlassesToStart")
              : translate("home:tapToStartLiveCaptions")
          }
        />
      </Screen>
    )
  }

  return (
    <Screen preset="fixed" style={themed($screen)}>
      <Header
        leftTx="home:title"
        RightActionComponent={
          <View style={themed($headerRight)}>
            {hasMissingPermissions && (
              <Animated.View style={{opacity: bellFadeAnim}}>
                <TouchableOpacity onPress={handleBellPress}>
                  <NotificationOn />
                </TouchableOpacity>
              </Animated.View>
            )}
            <MicIcon width={24} height={24} />
            <NonProdWarning />
          </View>
        }
      />

      <CloudConnection />
      <ScrollView
        style={{marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}
        contentInsetAdjustmentBehavior="automatic">
        <SensingDisabledWarning />

        <ConnectedGlasses showTitle={false} />
        <DeviceToolbar />
        <Spacer height={theme.spacing.md} />
        <View ref={connectButtonRef}>
          <ConnectDeviceButton />
        </View>
        <Spacer height={theme.spacing.lg} />
        <Divider variant="full" />
        <Spacer height={theme.spacing.md} />

        <AppsActiveList />
        <Spacer height={spacing.xl} />
        <AppsInactiveList liveCaptionsRef={liveCaptionsRef} />
        <Spacer height={spacing.xl} />
        <AppsIncompatibleList />
      </ScrollView>

      <OnboardingSpotlight
        targetRef={onboardingTarget === "glasses" ? connectButtonRef : liveCaptionsRef}
        setOnboardingTarget={setOnboardingTarget}
        onboardingTarget={onboardingTarget}
        message={
          onboardingTarget === "glasses"
            ? translate("home:connectGlassesToStart")
            : translate("home:tapToStartLiveCaptions")
        }
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.lg,
})

const $headerRight: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
