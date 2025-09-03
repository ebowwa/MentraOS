import React, {useState, useEffect} from "react"
import {View, Text, ActivityIndicator, Platform, Linking} from "react-native"
import Constants from "expo-constants"
import semver from "semver"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {router} from "expo-router"

import BackendServerComms from "@/backend_comms/BackendServerComms"
import {Button, Screen} from "@/components/ignite"
import {Spacer} from "@/components/misc/Spacer"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useDeeplink} from "@/contexts/DeeplinkContext"
import {useAuth} from "@/contexts/AuthContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {loadSetting, saveSetting, SETTINGS_KEYS} from "@/utils/SettingsHelper"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {translate} from "@/i18n"
import {TextStyle, ViewStyle} from "react-native"
import {ThemedStyle} from "@/theme"

// Types
type ScreenState = "loading" | "error" | "outdated" | "success"

interface StatusConfig {
  icon: string
  iconColor: string
  title: string
  description: string
}

// Constants
const APP_STORE_URL = "https://mentra.glass/os"
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.mentra.mentra"
const NAVIGATION_DELAY = 100
const DEEPLINK_DELAY = 1000

export default function VersionUpdateScreen() {
  // Hooks
  const {theme, themed} = useAppTheme()
  const {user, session} = useAuth()
  const {replace, getPendingRoute, setPendingRoute} = useNavigationHistory()
  const {processUrl} = useDeeplink()

  // State
  const [state, setState] = useState<ScreenState>("loading")
  const [localVersion, setLocalVersion] = useState<string | null>(null)
  const [cloudVersion, setCloudVersion] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUsingCustomUrl, setIsUsingCustomUrl] = useState(false)
  const [errorType, setErrorType] = useState<"connection" | "auth" | null>(null)
  const [loadingStatus, setLoadingStatus] = useState<string>(translate("versionCheck:checkingForUpdates"))

  // Helper Functions
  const getLocalVersion = (): string | null => {
    try {
      return Constants.expoConfig?.extra?.MENTRAOS_VERSION || null
    } catch (error) {
      console.error("Error getting local version:", error)
      return null
    }
  }

  const checkCustomUrl = async (): Promise<boolean> => {
    const customUrl = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
    const isCustom = Boolean(customUrl?.trim())
    setIsUsingCustomUrl(isCustom)
    return isCustom
  }

  const navigateToDestination = async () => {
    const pendingRoute = getPendingRoute()

    if (pendingRoute) {
      setPendingRoute(null)
      setTimeout(() => processUrl(pendingRoute), DEEPLINK_DELAY)
    } else {
      setTimeout(() => {
        router.dismissAll()
        replace("/(tabs)/home")
      }, NAVIGATION_DELAY)
    }
  }

  const handleTokenExchange = async (): Promise<void> => {
    setState("loading")
    setLoadingStatus(translate("versionCheck:connectingToServer"))
    try {
      const supabaseToken = session?.access_token
      if (!supabaseToken) {
        setErrorType("auth")
        setState("error")
        return
      }

      const backend = BackendServerComms.getInstance()
      const coreToken = await backend.exchangeToken(supabaseToken)
      const uid = user?.email || user?.id

      coreCommunicator.setAuthCreds(coreToken, uid)

      // Check onboarding status
      const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, false)

      if (!onboardingCompleted) {
        replace("/onboarding/welcome")
        return
      }

      await navigateToDestination()
    } catch (error) {
      console.error("Token exchange failed:", error)
      await checkCustomUrl()
      setErrorType("connection")
      setState("error")
    }
  }

  const checkCloudVersion = async (): Promise<void> => {
    setState("loading")
    setErrorType(null)
    setLoadingStatus(translate("versionCheck:checkingForUpdates"))

    try {
      const backendComms = BackendServerComms.getInstance()
      const localVer = getLocalVersion()
      setLocalVersion(localVer)

      if (!localVer) {
        console.error("Failed to get local version")
        setErrorType("connection")
        setState("error")
        return
      }

      await backendComms.restRequest("/apps/version", null, {
        onSuccess: data => {
          const cloudVer = data.version
          setCloudVersion(cloudVer)

          console.log(`Version check: local=${localVer}, cloud=${cloudVer}`)

          if (semver.lt(localVer, cloudVer)) {
            setState("outdated")
            return
          }
          handleTokenExchange()
        },
        onFailure: errorCode => {
          console.error("Failed to fetch cloud version:", errorCode)
          setErrorType("connection")
          setState("error")
        },
      })
    } catch (error) {
      console.error("Version check failed:", error)
      setErrorType("connection")
      setState("error")
    }
  }

  const handleUpdate = async (): Promise<void> => {
    setIsUpdating(true)
    try {
      const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL
      await Linking.openURL(url)
    } catch (error) {
      console.error("Error opening store:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleResetUrl = async (): Promise<void> => {
    try {
      await saveSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
      await coreCommunicator.setServerUrl("")
      setIsUsingCustomUrl(false)
      await checkCloudVersion()
    } catch (error) {
      console.error("Failed to reset URL:", error)
    }
  }

  const getStatusConfig = (): StatusConfig => {
    switch (state) {
      case "error":
        if (errorType === "auth") {
          return {
            icon: "account-alert",
            iconColor: theme.colors.error,
            title: "Authentication Error",
            description: "Unable to authenticate. Please sign in again.",
          }
        }
        return {
          icon: "wifi-off",
          iconColor: theme.colors.error,
          title: "Connection Error",
          description: isUsingCustomUrl
            ? "Could not connect to the custom server. Please reset to default or check your connection."
            : "Could not connect to the server. Please check your connection and try again.",
        }

      case "outdated":
        return {
          icon: "update",
          iconColor: theme.colors.tint,
          title: "Update Required",
          description: "MentraOS is outdated. An update is required to continue using the application.",
        }

      default:
        return {
          icon: "check-circle",
          iconColor: theme.colors.palette.primary500,
          title: "Up to Date",
          description: "MentraOS is up to date. Returning to home...",
        }
    }
  }

  // Effects
  useEffect(() => {
    const init = async () => {
      await checkCustomUrl()
      await checkCloudVersion()
    }
    init()
  }, [])

  // Render
  if (state === "loading") {
    return (
      <Screen preset="fixed" safeAreaEdges={["bottom"]}>
        <View style={themed($centerContainer)}>
          <ActivityIndicator size="large" color={theme.colors.text} />
          <Text style={themed($loadingText)}>{loadingStatus}</Text>
        </View>
      </Screen>
    )
  }

  const statusConfig = getStatusConfig()

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]}>
      <View style={themed($mainContainer)}>
        <View style={themed($infoContainer)}>
          <View style={themed($iconContainer)}>
            <Icon name={statusConfig.icon} size={80} color={statusConfig.iconColor} />
          </View>

          <Text style={themed($title)}>{statusConfig.title}</Text>
          <Text style={themed($description)}>{statusConfig.description}</Text>

          {state === "outdated" && (
            <>
              {localVersion && <Text style={themed($versionText)}>Local: v{localVersion}</Text>}
              {cloudVersion && <Text style={themed($versionText)}>Latest: v{cloudVersion}</Text>}
            </>
          )}

          <View style={themed($buttonContainer)}>
            {state === "error" && (
              <Button
                onPress={checkCloudVersion}
                style={themed($primaryButton)}
                text={translate("versionCheck:retryConnection")}
              />
            )}

            {state === "outdated" && (
              <Button
                onPress={handleUpdate}
                disabled={isUpdating}
                style={themed($primaryButton)}
                text={translate("versionCheck:update")}
              />
            )}

            {state === "error" && isUsingCustomUrl && (
              <Button
                onPress={handleResetUrl}
                style={themed($secondaryButton)}
                text={translate("versionCheck:resetUrl")}
              />
            )}

            {(state === "error" || state === "outdated") && (
              <Button
                style={themed($secondaryButton)}
                RightAccessory={() => <Icon name="arrow-right" size={24} color={theme.colors.textAlt} />}
                onPress={navigateToDestination}
                tx="versionCheck:continueAnyways"
              />
            )}
          </View>
        </View>
      </View>
    </Screen>
  )
}

// Styles
const $centerContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $loadingText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  marginTop: spacing.md,
  fontSize: 16,
  color: colors.text,
})

const $mainContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.lg,
})

const $infoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingTop: spacing.xl,
})

const $iconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.xl,
})

const $title: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 28,
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: spacing.md,
  color: colors.text,
})

const $description: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  textAlign: "center",
  marginBottom: spacing.xl,
  lineHeight: 24,
  paddingHorizontal: spacing.lg,
  color: colors.textDim,
})

const $versionText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  textAlign: "center",
  marginBottom: spacing.xs,
  color: colors.textDim,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  alignItems: "center",
  paddingBottom: spacing.xl,
  gap: spacing.md,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: "100%",
  backgroundColor: colors.palette.primary200,
  color: colors.textAlt,
})
