import React, {useState, useEffect} from "react"
import {View, Text, ActivityIndicator, Platform} from "react-native"
import Constants from "expo-constants"
import semver from "semver"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import {Button, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import {TextStyle, ViewStyle} from "react-native"
import {ThemedStyle} from "@/theme"

// Icon component - adjust import based on your icon library
import Icon from "react-native-vector-icons/MaterialCommunityIcons" // or your preferred icon library
import {Linking} from "react-native"
import {translate} from "@/i18n"
import {Spacer} from "@/components/misc/Spacer"

export default function VersionUpdateScreen() {
  const [isLoading, setIsLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const [isVersionMismatch, setIsVersionMismatch] = useState(false)
  const [localVersion, setLocalVersion] = useState<string | null>(null)
  const [cloudVersion, setCloudVersion] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const {replace} = useNavigationHistory()
  const {theme, themed} = useAppTheme()

  // Get local version from expo config
  const getLocalVersion = () => {
    try {
      const version = Constants.expoConfig?.extra?.MENTRAOS_VERSION
      console.log("Local version from expo config:", version)
      return version || null
    } catch (error) {
      console.error("Error getting local version:", error)
      return null
    }
  }

  // Check the cloud version against local version
  const checkCloudVersion = async () => {
    setIsLoading(true)
    setConnectionError(false)

    try {
      const backendComms = BackendServerComms.getInstance()
      const localVer = getLocalVersion()
      setLocalVersion(localVer)

      if (!localVer) {
        console.error("Failed to get local version from expo config")
        setConnectionError(true)
        setIsLoading(false)
        return
      }

      // Call the endpoint to get cloud version
      await backendComms.restRequest("/apps/version", null, {
        onSuccess: data => {
          const cloudVer = data.version
          setCloudVersion(cloudVer)
          console.log(`Comparing local version (${localVer}) with cloud version (${cloudVer})`)

          // Compare versions using semver
          if (semver.lt(localVer, cloudVer)) {
            console.log("A new version is available. Please update the app.")
            setIsVersionMismatch(true)
            setIsLoading(false)
            return
          }
          // don't stop the loading, just continue to the core token exchange:
          console.log("Local version is up-to-date.")
          setIsVersionMismatch(false)
          // less jarring
          setTimeout(() => {
            replace("/auth/core-token-exchange")
          }, 100)
        },
        onFailure: errorCode => {
          console.error("Failed to fetch cloud version:", errorCode)
          setConnectionError(true)
          setIsLoading(false)
        },
      })
    } catch (error) {
      console.error("Error checking cloud version:", error)
      setConnectionError(true)
      setIsLoading(false)
    }
  }

  // // Handle update button press
  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      let url = ""
      // On mobile platforms, redirect to app store
      if (Platform.OS === "ios") {
        url = "https://mentra.glass/os"
        console.log("Redirecting to App Store:", url)
      } else if (Platform.OS === "android") {
        url = "https://play.google.com/store/apps/details?id=com.mentra.mentra"
      }
      console.log("Redirecting to store:", url)
      Linking.openURL(url)
    } catch (error) {
      console.error("Error handling update:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  // Check cloud version on mount
  useEffect(() => {
    checkCloudVersion()
  }, [])

  if (isLoading) {
    return (
      <Screen preset="fixed" safeAreaEdges={["bottom"]}>
        <View style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
          <ActivityIndicator size="large" color={theme.colors.loadingIndicator} />
          <Text style={themed($loadingText)}>{translate("versionCheck:checkingForUpdates")}</Text>
        </View>
      </Screen>
    )
  }

  const getStatusIcon = () => {
    if (connectionError) {
      return <Icon name="wifi-off" size={80} color={theme.colors.error} />
    } else if (isVersionMismatch) {
      return <Icon name="update" size={80} color={theme.colors.tint} />
    } else {
      return <Icon name="check-circle" size={80} color={theme.colors.palette.primary500} />
    }
  }

  const getStatusTitle = () => {
    if (connectionError) return "Connection Error"
    if (isVersionMismatch) return "Update Required"
    return "Up to Date"
  }

  const getStatusDescription = () => {
    if (connectionError) {
      return "Could not connect to the server. Please check your connection and try again."
    }
    if (isVersionMismatch) {
      return "MentraOS is outdated. An update is required to continue using the application."
    }
    return "MentraOS is up to date. Returning to home..."
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <View style={themed($mainContainer)}>
        <View style={themed($infoContainer)}>
          <View style={themed($iconContainer)}>{getStatusIcon()}</View>

          <Text style={themed($title)}>{getStatusTitle()}</Text>

          <Text style={themed($description)}>{getStatusDescription()}</Text>

          {localVersion && <Text style={themed($versionText)}>Local: v{localVersion}</Text>}

          {cloudVersion && <Text style={themed($versionText)}>Latest: v{cloudVersion}</Text>}
        </View>

        {(connectionError || isVersionMismatch) && (
          <View style={themed($buttonContainer)}>
            <Button
              onPress={connectionError ? checkCloudVersion : handleUpdate}
              disabled={isUpdating}
              style={themed($primaryButton)}
              text={connectionError ? translate("versionCheck:retryConnection") : translate("versionCheck:update")}
            />

            <Spacer height={theme.spacing.md} />

            <Button
              style={themed($secondaryButton)}
              // textStyle={{color: theme.colors.text}}
              RightAccessory={() => <Icon name="arrow-right" size={24} color={theme.colors.textAlt} />}
              onPress={() => {
                replace("/auth/core-token-exchange")
              }}
              tx="versionCheck:continueAnyways"
            />
          </View>
        )}
      </View>
    </Screen>
  )
}

// Themed styles
const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
})

const $loadingContainer: ThemedStyle<ViewStyle> = () => ({
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
  flexDirection: "column",
  justifyContent: "space-between",
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

const $title: ThemedStyle<TextStyle> = ({colors, spacing, typography}) => ({
  fontSize: 28,
  fontWeight: "bold",
  fontFamily: typography.primary.bold,
  textAlign: "center",
  marginBottom: spacing.md,
  color: colors.text,
})

const $description: ThemedStyle<TextStyle> = ({colors, spacing, typography}) => ({
  fontSize: 16,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  marginBottom: spacing.xl,
  lineHeight: 24,
  paddingHorizontal: spacing.lg,
  color: colors.textDim,
})

const $versionText: ThemedStyle<TextStyle> = ({colors, spacing, typography}) => ({
  fontSize: 14,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  marginBottom: spacing.xs,
  color: colors.textDim,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  alignItems: "center",
  paddingBottom: spacing.xl,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  width: "100%",
  backgroundColor: colors.palette.primary200,
  color: colors.textAlt,
})

const $skipButtonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.md,
  width: "100%",
  alignItems: "center",
})

const $skipButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: "transparent",
  borderWidth: 1,
  borderColor: colors.border,
  width: "100%",
})
