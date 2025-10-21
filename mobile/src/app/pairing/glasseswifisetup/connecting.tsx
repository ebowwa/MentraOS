import {Button, Header, Screen} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {ThemedStyle} from "@/theme"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {useAppTheme} from "@/utils/useAppTheme"
import WifiCredentialsService from "@/utils/wifi/WifiCredentialsService"
import {Ionicons, MaterialIcons} from "@expo/vector-icons"
import CoreModule from "core"
import {useLocalSearchParams} from "expo-router"
import {useEffect, useRef, useState} from "react"
import {ActivityIndicator, TextStyle, View, ViewStyle} from "react-native"
import {Text} from "@/components/ignite"

export default function WifiConnectingScreen() {
  const params = useLocalSearchParams()
  const deviceModel = (params.deviceModel as string) || "Glasses"
  const ssid = params.ssid as string
  const password = (params.password as string) || ""
  const rememberPassword = (params.rememberPassword as string) === "true"

  const {theme, themed} = useAppTheme()

  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "success" | "failed">("connecting")
  const [errorMessage, setErrorMessage] = useState("")
  const connectionTimeoutRef = useRef<number | null>(null)
  const failureGracePeriodRef = useRef<number | null>(null)
  const {goBack, navigate} = useNavigationHistory()

  useEffect(() => {
    // Start connection attempt
    attemptConnection()

    const handleWifiStatusChange = (data: {connected: boolean; ssid?: string}) => {
      console.log("WiFi connection status changed:", data)

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }

      if (data.connected && data.ssid === ssid) {
        // Clear any failure grace period if it exists
        if (failureGracePeriodRef.current) {
          clearTimeout(failureGracePeriodRef.current)
          failureGracePeriodRef.current = null
        }

        // Save credentials ONLY on successful connection if checkbox was checked
        // This ensures we never save wrong passwords
        if (password && rememberPassword) {
          WifiCredentialsService.saveCredentials(ssid, password, true)
          WifiCredentialsService.updateLastConnected(ssid)
        }

        setConnectionStatus("success")
        // Don't show banner anymore since we have a dedicated success screen
        // User will manually dismiss with Done button
      } else if (!data.connected && connectionStatus === "connecting") {
        // Set up 5-second grace period before showing failure
        failureGracePeriodRef.current = setTimeout(() => {
          console.log("#$%^& Failed to connect to the network. Please check your password and try again.")
          setConnectionStatus("failed")
          setErrorMessage("Failed to connect to the network. Please check your password and try again.")
          failureGracePeriodRef.current = null
        }, 10000)
      }
    }

    GlobalEventEmitter.on("GLASSES_WIFI_STATUS_CHANGE", handleWifiStatusChange)

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }
      if (failureGracePeriodRef.current) {
        clearTimeout(failureGracePeriodRef.current)
        failureGracePeriodRef.current = null
      }
      GlobalEventEmitter.removeListener("GLASSES_WIFI_STATUS_CHANGE", handleWifiStatusChange)
    }
  }, [ssid])

  const attemptConnection = async () => {
    try {
      console.log("Attempting to send wifi credentials to Core", ssid, password)
      await CoreModule.sendWifiCredentials(ssid, password)

      // Set timeout for connection attempt (20 seconds)
      connectionTimeoutRef.current = setTimeout(() => {
        if (connectionStatus === "connecting") {
          setConnectionStatus("failed")
          setErrorMessage("Connection timed out. Please try again.")
        }
      }, 20000)
    } catch (error) {
      console.error("Error sending WiFi credentials:", error)
      setConnectionStatus("failed")
      setErrorMessage("Failed to send credentials to glasses. Please try again.")
    }
  }

  const handleTryAgain = () => {
    setConnectionStatus("connecting")
    setErrorMessage("")
    attemptConnection()
  }

  const handleCancel = () => {
    goBack()
  }

  const handleHeaderBack = () => {
    if (connectionStatus === "connecting") {
      // If still connecting, ask for confirmation
      goBack()
    } else {
      goBack()
    }
  }

  const renderContent = () => {
    switch (connectionStatus) {
      case "connecting":
        return (
          <>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={themed($statusText)}>Connecting to {ssid}...</Text>
            <Text style={themed($subText)}>This may take up to 20 seconds</Text>
          </>
        )

      case "success":
        return (
          <View style={themed($successContainer)}>
            <View style={themed($successContent)}>
              <View style={themed($successIconContainer)}>
                <Ionicons name="checkmark-circle" size={80} color="#0066FF" />
              </View>

              <Text style={themed($successTitle)}>Network added!</Text>

              <Text style={themed($successDescription)}>Your {deviceModel} will automatically update when it is:</Text>

              <View style={themed($conditionsList)}>
                <View style={themed($conditionItem)}>
                  <View style={themed($conditionIcon)}>
                    <MaterialIcons name="power-settings-new" size={24} color={theme.colors.text} />
                  </View>
                  <Text style={themed($conditionText)}>Powered on</Text>
                </View>

                <View style={themed($conditionItem)}>
                  <View style={themed($conditionIcon)}>
                    <MaterialIcons name="bolt" size={24} color={theme.colors.text} />
                  </View>
                  <Text style={themed($conditionText)}>Charging</Text>
                </View>

                <View style={themed($conditionItem)}>
                  <View style={themed($conditionIcon)}>
                    <MaterialIcons name="wifi" size={24} color={theme.colors.text} />
                  </View>
                  <Text style={themed($conditionText)}>Connected to a saved Wi-Fi network</Text>
                </View>
              </View>
            </View>

            <View style={themed($successButtonContainer)}>
              <Button onPress={() => navigate("/")}>
                <Text>Done</Text>
              </Button>
            </View>
          </View>
        )

      case "failed":
        return (
          <View style={themed($failureContainer)}>
            <View style={themed($failureContent)}>
              <View style={themed($failureIconContainer)}>
                <Ionicons name="close-circle" size={80} color={theme.colors.error} />
              </View>

              <Text style={themed($failureTitle)}>Connection Failed</Text>

              <Text style={themed($failureDescription)}>{errorMessage}</Text>

              <View style={themed($failureTipsList)}>
                <View style={themed($failureTipItem)}>
                  <View style={themed($failureTipIcon)}>
                    <MaterialIcons name="lock" size={24} color={theme.colors.textDim} />
                  </View>
                  <Text style={themed($failureTipText)}>Make sure the password was entered correctly</Text>
                </View>

                <View style={themed($failureTipItem)}>
                  <View style={themed($failureTipIcon)}>
                    <MaterialIcons name="wifi" size={24} color={theme.colors.textDim} />
                  </View>
                  <Text style={themed($failureTipText)}>
                    Mentra Live Beta can only connect to pure 2.4GHz WiFi networks (not 5GHz or dual-band 2.4/5GHz)
                  </Text>
                </View>
              </View>
            </View>

            <View style={themed($failureButtonsContainer)}>
              <Button onPress={handleTryAgain}>
                <Text>Try Again</Text>
              </Button>
              <View style={{height: theme.spacing.sm}} />
              <Button onPress={handleCancel} preset="reversed">
                <Text>Cancel</Text>
              </Button>
            </View>
          </View>
        )
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      {connectionStatus === "connecting" && (
        <Header title="Connecting" leftIcon="caretLeft" onLeftPress={handleHeaderBack} />
      )}
      <View style={themed($content)}>{renderContent()}</View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.lg,
  justifyContent: "center",
  alignItems: "center",
})

const $statusText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 20,
  fontWeight: "500",
  color: colors.text,
  marginTop: spacing.lg,
  textAlign: "center",
})

const $subText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.textDim,
  marginTop: spacing.xs,
  textAlign: "center",
})

const $successContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  justifyContent: "space-between",
})

const $successContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $successIconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  marginTop: spacing.xxl,
  marginBottom: spacing.lg,
})

const $successTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 24,
  fontWeight: "600",
  color: colors.text,
  textAlign: "center",
  marginBottom: spacing.lg,
})

const $successDescription: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  textAlign: "center",
  marginBottom: spacing.xl,
  paddingHorizontal: spacing.lg,
})

const $conditionsList: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.xl,
})

const $conditionItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $conditionIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.md,
  width: 32,
})

const $conditionText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  flex: 1,
})

const $successButtonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.lg,
})

const $failureContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
  justifyContent: "space-between",
})

const $failureContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $failureIconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  marginTop: spacing.xxl,
  marginBottom: spacing.lg,
})

const $failureTitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 24,
  fontWeight: "600",
  color: colors.error,
  textAlign: "center",
  marginBottom: spacing.lg,
})

const $failureDescription: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  textAlign: "center",
  marginBottom: spacing.xl,
  paddingHorizontal: spacing.xl,
})

const $failureButtonsContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  //marginHorizontal: spacing.lg,
  marginBottom: spacing.lg,
})

const $failureTipsList: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingHorizontal: spacing.xl,
  marginTop: spacing.md,
})

const $failureTipItem: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $failureTipIcon: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginRight: spacing.md,
  width: 32,
})

const $failureTipText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.textDim,
  flex: 1,
})
