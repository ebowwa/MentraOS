import React, {useRef, useCallback, PropsWithChildren, useState, useEffect} from "react"
import {View, Animated, Platform, ViewStyle, ScrollView, TouchableOpacity} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Header, Screen} from "@/components/ignite"
import {AppsCombinedGridView} from "@/components/misc/AppsCombinedGridView"
import AppsIncompatibleList from "@/components/misc/AppsIncompatibleList"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useAppStatus} from "@/contexts/AppStatusProvider"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import semver from "semver"
import Constants from "expo-constants"
import CloudConnection from "@/components/misc/CloudConnection"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"
import SensingDisabledWarning from "@/components/misc/SensingDisabledWarning"
import NonProdWarning from "@/components/misc/NonProdWarning"
import {spacing, ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import MicIcon from "assets/icons/component/MicIcon"
import NotificationOn from "assets/icons/component/NotificationOn"
import {ConnectDeviceButton, ConnectedGlasses, DeviceToolbar} from "@/components/misc/ConnectedDeviceInfo"
import {Spacer} from "@/components/misc/Spacer"
import Divider from "@/components/misc/Divider"
import {
  askPermissionsUI,
  checkFeaturePermissions,
  checkPermissionsUI,
  PERMISSION_CONFIG,
  PermissionFeatures,
  requestPermissionsUI,
} from "@/utils/PermissionsUtils"
import {router} from "expo-router"
import {OnboardingSpotlight} from "@/components/misc/OnboardingSpotlight"
import {SETTINGS_KEYS} from "@/consts"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {showAlert} from "@/utils/AlertUtils"

export default function Homepage() {
  const {
    appStatus,
    refreshAppStatus,
    optimisticallyStartApp,
    optimisticallyStopApp,
    clearPendingOperation,
    checkAppHealthStatus,
  } = useAppStatus()
  const {status} = useStatus()
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [hasMissingPermissions, setHasMissingPermissions] = useState(false)
  const [showOnboardingSpotlight, setShowOnboardingSpotlight] = useState(false)
  const [onboardingTarget, setOnboardingTarget] = useState<"glasses" | "livecaptions">("glasses")
  const [liveCaptionsPackageName, setLiveCaptionsPackageName] = useState<string | null>(null)
  const liveCaptionsRef = useRef<any>(null)
  const connectButtonRef = useRef<any>(null)
  const backendComms = BackendServerComms.getInstance()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const bellFadeAnim = useRef(new Animated.Value(0)).current
  const {themed, theme} = useAppTheme()
  const {push, replace} = useNavigationHistory()

  // Reset loading state when connection status changes
  useEffect(() => {
    if (status.core_info.cloud_connection_status === "CONNECTED") {
      setIsInitialLoading(true)
      const timer = setTimeout(() => {
        setIsInitialLoading(false)
      }, 10000)
      return () => clearTimeout(timer)
    }
    return () => {}
  }, [status.core_info.cloud_connection_status])

  // Clear loading state if apps are loaded
  useEffect(() => {
    if (appStatus.length > 0) {
      setIsInitialLoading(false)
    }
  }, [appStatus.length])

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

  // Check onboarding status
  useEffect(() => {
    const checkOnboarding = async () => {
      const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
      if (!onboardingCompleted) {
        // Check if glasses are connected
        const glassesConnected = status.glasses_info?.model_name != null

        if (!glassesConnected) {
          setOnboardingTarget("glasses")
          setShowOnboardingSpotlight(true)
        } else {
          // Check if Live Captions app exists and is not running
          const liveCaptionsApp = appStatus.find(
            app =>
              app.packageName === "com.augmentos.livecaptions" ||
              app.packageName === "cloud.augmentos.live-captions" ||
              app.packageName === "com.mentra.livecaptions",
          )

          if (liveCaptionsApp && !liveCaptionsApp.is_running) {
            setOnboardingTarget("livecaptions")
            setLiveCaptionsPackageName(liveCaptionsApp.packageName)
            setShowOnboardingSpotlight(true)
          }
        }
      }
    }

    checkOnboarding().catch(error => {
      console.error("Error checking onboarding:", error)
    })
  }, [status.glasses_info?.model_name, appStatus])

  // Handle spotlight dismiss
  const handleSpotlightDismiss = () => {
    setShowOnboardingSpotlight(false)
    // Mark onboarding as completed if user skips
    saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)
  }

  // Handle spotlight target press
  const handleSpotlightTargetPress = async () => {
    if (onboardingTarget === "glasses") {
      push("/pairing/select-glasses-model")
    } else if (onboardingTarget === "livecaptions" && liveCaptionsPackageName) {
      // Dismiss spotlight first
      setShowOnboardingSpotlight(false)

      // Start the Live Captions app directly
      try {
        const backendComms = BackendServerComms.getInstance()
        await backendComms.startApp(liveCaptionsPackageName)

        // Mark onboarding as completed
        await saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true)

        // Show the success message after a short delay
        setTimeout(() => {
          showAlert(
            translate("home:tryLiveCaptionsTitle"),
            translate("home:tryLiveCaptionsMessage"),
            [{text: translate("common:ok")}],
            {
              iconName: "microphone",
            },
          )
        }, 500)
      } catch (error) {
        console.error("Error starting Live Captions:", error)
      }
    }
  }

  const handleBellPress = () => {
    push("/settings/privacy")
  }

  // Handler functions for grid view
  const handleStartApp = async (packageName: string) => {
    const appInfo = appStatus.find(app => app.packageName === packageName)
    if (!appInfo) {
      console.error("App not found:", packageName)
      return
    }

    if (!(await checkAppHealthStatus(appInfo.packageName))) {
      showAlert(translate("errors:appNotOnlineTitle"), translate("errors:appNotOnlineMessage"), [
        {text: translate("common:ok")},
      ])
      return
    }

    // ask for needed perms:
    const result = await askPermissionsUI(appInfo, theme)
    if (result === -1) {
      return
    } else if (result === 0) {
      handleStartApp(appInfo.packageName) // restart this function
      return
    }

    // Optimistically update UI
    optimisticallyStartApp(packageName)

    // Handle foreground apps
    if (appInfo?.appType === "standard") {
      const runningStandardApps = appStatus.filter(
        app => app.is_running && app.appType === "standard" && app.packageName !== packageName,
      )

      for (const runningApp of runningStandardApps) {
        optimisticallyStopApp(runningApp.packageName)
        try {
          await backendComms.stopApp(runningApp.packageName)
          clearPendingOperation(runningApp.packageName)
        } catch (error) {
          console.error("Stop app error:", error)
          refreshAppStatus()
        }
      }
    }

    try {
      await backendComms.startApp(packageName)
      clearPendingOperation(packageName)
      await saveSetting(SETTINGS_KEYS.HAS_EVER_ACTIVATED_APP, true)
    } catch (error: any) {
      console.error("Start app error:", error)

      if (error?.response?.data?.error?.stage === "HARDWARE_CHECK") {
        showAlert(
          translate("home:hardwareIncompatible"),
          error.response.data.error.message ||
            translate("home:hardwareIncompatibleMessage", {
              app: appInfo.name,
              missing: "required hardware",
            }),
          [{text: translate("common:ok")}],
          {
            iconName: "alert-circle-outline",
            iconColor: theme.colors.error,
          },
        )
      }

      clearPendingOperation(packageName)
      refreshAppStatus()
    }
  }

  const handleStopApp = async (packageName: string) => {
    optimisticallyStopApp(packageName)

    try {
      await backendComms.stopApp(packageName)
      clearPendingOperation(packageName)
    } catch (error) {
      refreshAppStatus()
      console.error("Stop app error:", error)
    }
  }

  const handleOpenAppSettings = (app: any) => {
    push("/applet/settings", {packageName: app.packageName, appName: app.name})
  }

  const handleOpenWebView = (app: any) => {
    if (app.webviewURL) {
      replace("/applet/webview", {
        webviewURL: app.webviewURL,
        appName: app.name,
        packageName: app.packageName,
      })
    }
  }

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

        <Spacer height={theme.spacing.xs} />

        <ConnectedGlasses showTitle={false} />
        <DeviceToolbar />
        <Spacer height={theme.spacing.md} />
        <View ref={connectButtonRef}>
          <ConnectDeviceButton />
        </View>
        <Spacer height={theme.spacing.lg} />
        <Divider variant="full" />
        <Spacer height={theme.spacing.md} />

        <AppsCombinedGridView
          activeApps={appStatus.filter(app => app.is_running)}
          inactiveApps={appStatus.filter(
            app =>
              !app.is_running &&
              (!app.compatibility || app.compatibility.isCompatible) &&
              !(Platform.OS === "ios" && (app.packageName === "cloud.augmentos.notify" || app.name === "Notify")),
          )}
          onStartApp={handleStartApp}
          onStopApp={handleStopApp}
          onOpenSettings={handleOpenAppSettings}
          onOpenWebView={handleOpenWebView}
        />
        <Spacer height={spacing.xl} />
        <AppsIncompatibleList />
      </ScrollView>

      <OnboardingSpotlight
        visible={showOnboardingSpotlight}
        targetRef={onboardingTarget === "glasses" ? connectButtonRef : liveCaptionsRef}
        onDismiss={handleSpotlightDismiss}
        onTargetPress={handleSpotlightTargetPress}
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
