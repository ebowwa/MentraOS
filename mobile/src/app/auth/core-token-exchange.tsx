import React, {useEffect, useState, useRef} from "react"
import {View, Text, ActivityIndicator, StyleSheet, Platform, TouchableOpacity, Animated, TextStyle} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useNavigation} from "@react-navigation/native"
import {useAuth} from "@/contexts/AuthContext"
import coreCommunicator from "@/bridge/CoreCommunicator"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import Button from "@/components/misc/Button"
import {loadSetting, saveSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/utils/SettingsHelper"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {translate} from "@/i18n/translate"
import {useDeeplink} from "@/contexts/DeeplinkContext"
import {router} from "expo-router"

export default function CoreTokenExchange() {
  const {status} = useCoreStatus()
  const {user, session, loading: authLoading} = useAuth()
  const [connectionError, setConnectionError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isUsingCustomUrl, setIsUsingCustomUrl] = useState(false)
  const [errorMessage, setErrorMessage] = useState(
    "Connection to AugmentOS failed. Please check your connection and try again.",
  )
  const hasAttemptedConnection = useRef(false)
  const loadingOverlayOpacity = useRef(new Animated.Value(1)).current
  const {theme, themed} = useAppTheme()
  const {goBack, push, replace, getPendingRoute, setPendingRoute} = useNavigationHistory()
  const {processUrl} = useDeeplink()

  const loadPendingRouteOrHome = async () => {
    const pendingRoute = getPendingRoute()
    console.log("@@@@@@@@@@@@@ LOADING PENDING ROUTE OR HOME @@@@@@@@@@@@@@@", pendingRoute)
    if (pendingRoute) {
      setPendingRoute(null)
      setTimeout(() => {
        processUrl(pendingRoute)
      }, 2000)
    } else {
      // less jarring if the nav isn't instant
      setTimeout(() => {
        router.dismissAll()
        replace("/(tabs)/home")
      }, 100)
    }
  }

  const handleTokenExchange = async () => {
    if (isLoading) return

    setIsLoading(true)

    try {
      const supabaseToken = session?.access_token
      if (!supabaseToken) {
        setErrorMessage("Unable to authenticate. Please sign in again.")
        setIsLoading(false)
        return
      }

      // Exchange token with backend
      const backend = BackendServerComms.getInstance()
      const coreToken = await backend.exchangeToken(supabaseToken)

      const uid = user.email || user.id
      coreCommunicator.setAuthenticationSecretKey(uid, coreToken)
      BackendServerComms.getInstance().setCoreToken(coreToken)

      // Navigate
      // Check if the user has completed onboarding
      const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, false)
      if (onboardingCompleted) {
        // If onboarding is completed, go directly to Home
        loadPendingRouteOrHome()
      } else {
        // If onboarding is not completed, go to WelcomePage
        replace("/onboarding/welcome")
      }
    } catch (err) {
      // Check if we're using a custom backend URL
      const customUrl = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
      const isCustom = customUrl && typeof customUrl === "string" && customUrl.trim() !== ""

      if (isCustom) {
        setIsUsingCustomUrl(true)
        setErrorMessage(
          `Connection to custom backend (${customUrl}) failed. The server may be unavailable or the URL may be incorrect.`,
        )
      } else {
        setIsUsingCustomUrl(false)
        setErrorMessage("Connection to AugmentOS failed. Please check your connection and try again.")
      }

      setConnectionError(true)
      setIsLoading(false)
    }
  }

  const handleResetUrl = async () => {
    try {
      await saveSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
      await coreCommunicator.setServerUrl("") // Clear Android service override
      setIsUsingCustomUrl(false)
      setErrorMessage("Backend URL reset to default. Please try connecting again.")
    } catch (error) {
      console.error("Failed to reset URL:", error)
      setErrorMessage("Failed to reset URL. Please try again.")
    }
  }

  useEffect(() => {
    // Don't show the error UI for initial load attempts and avoid repeating failed attempts
    if (connectionError || hasAttemptedConnection.current) return

    // We only proceed once the core is connected, the user is loaded, etc.
    if (!authLoading && user) {
      // Track that we've attempted a connection
      hasAttemptedConnection.current = true

      // 1) Get the Supabase token from your AuthContext
      const supabaseToken = session?.access_token
      if (!supabaseToken) {
        console.log("No Supabase token found")
        setErrorMessage("Unable to authenticate. Please sign in again.")
        setConnectionError(true)
        return
      }

      // 2) Check if we need to do the exchange
      if (!status.auth.core_token_owner || status.auth.core_token_owner !== user.email) {
        console.log("OWNER IS NULL CALLING VERIFY (TOKEN EXCHANGE)")

        // Don't try automatic retry if we're already loading or had an error
        if (!isLoading) {
          handleTokenExchange().catch(error => {
            console.error("Error in automatic token exchange:", error)
          })
        }
      } else {
        // If we already have a token, go straight to Home
        BackendServerComms.getInstance().setCoreToken(status.core_info.core_token)
        loadPendingRouteOrHome()
      }
    }
  }, [status.core_info.puck_connected, authLoading, user])

  // Loading screen
  if (!connectionError) {
    return (
      <Screen preset="fixed" safeAreaEdges={["bottom"]}>
        <View style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
          <ActivityIndicator size="large" color={theme.colors.loadingIndicator} />
          <Text style={themed($loadingText)}>{translate("login:connectingToServer")}</Text>
        </View>
      </Screen>
    )
  }

  // Error screen (similar to VersionUpdateScreen)
  return (
    <Screen preset="fixed" style={{flex: 1, justifyContent: "center", alignItems: "center"}} safeAreaEdges={["bottom"]}>
      <View style={styles.mainContainer}>
        <View style={styles.infoContainer}>
          <View style={styles.iconContainer}>
            <Icon name="wifi-off" size={80} color={theme.colors.error} />
          </View>

          <Text style={[styles.title, {color: theme.colors.text}]}>{translate("login:connectionError")}</Text>

          <Text style={[styles.description, {color: theme.colors.textDim}]}>{errorMessage}</Text>
        </View>

        <View style={styles.setupContainer}>
          {isUsingCustomUrl && (
            <Button onPress={handleResetUrl} disabled={isLoading} iconName="refresh" style={styles.resetButton}>
              Reset to Default URL
            </Button>
          )}

          <Button onPress={handleTokenExchange} isDarkTheme={theme.isDark} disabled={isLoading} iconName="reload">
            {isLoading ? "Connecting..." : "Retry Connection"}
          </Button>
        </View>
      </View>
    </Screen>
  )
}

const $loadingText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  marginTop: spacing.md,
  fontSize: 16,
  color: colors.text,
})

const styles = StyleSheet.create({
  authLoadingIndicator: {
    marginBottom: 16,
  },
  authLoadingLogoPlaceholder: {
    height: 100,
    marginBottom: 20,
    width: 100,
  },
  authLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // backgroundColor: "rgba(255, 255, 255, 0.9)",
    zIndex: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  authLoadingText: {
    fontSize: 16,
    fontFamily: "Montserrat-Medium",
    // color moved to themed style
    textAlign: "center",
  },
  container: {
    flex: 1,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 24,
    textAlign: "center",
  },
  iconContainer: {
    marginBottom: 32,
  },
  infoContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 180,
    height: 400,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
  },
  mainContainer: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "flex-start",
    padding: 24,
  },
  setupContainer: {
    alignItems: "center",
    paddingBottom: 40,
    width: "100%",
    marginTop: "auto",
  },
  title: {
    fontFamily: "Montserrat-Bold",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 28,
    textAlign: "center",
  },
  resetButton: {
    marginBottom: 16,
  },
  // Removed hardcoded color styles - now using theme dynamic colors
})
