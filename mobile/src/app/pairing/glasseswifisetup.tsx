import React, {useCallback} from "react"
import {View, Text, BackHandler} from "react-native"
import {useLocalSearchParams, router, useFocusEffect} from "expo-router"
import {Screen, Header} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle, ScrollView} from "react-native"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import RouteButton from "@/components/ui/RouteButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function GlassesWifiSetupScreen() {
  const {deviceModel = "Glasses"} = useLocalSearchParams()
  const {theme, themed} = useAppTheme()
  const {status} = useStatus()
  const {push, goBack} = useNavigationHistory()

  const handleGoBack = useCallback(() => {
    goBack()
    return true // Prevent default back behavior
  }, [])

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", handleGoBack)
      return () => backHandler.remove()
    }, [handleGoBack]),
  )

  // Get current WiFi status from glasses
  const currentWifi = status.glasses_info?.glasses_wifi_ssid
  const isWifiConnected = status.glasses_info?.glasses_wifi_connected

  const handleScanForNetworks = () => {
    push("/pairing/glasseswifisetup/scan", {deviceModel})
  }

  const handleManualEntry = () => {
    push("/pairing/glasseswifisetup/password", {deviceModel, ssid: ""})
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)} safeAreaEdges={[]}>
      <Header title="Glasses WiFi Setup" leftIcon="caretLeft" onLeftPress={handleGoBack} />

      <ScrollView
        style={{marginBottom: 20, marginTop: 10, marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}>
        <View style={themed($content)}>
          <Text style={themed($subtitle)}>Your {deviceModel} glasses needs WiFi to connect to the internet.</Text>

          {/* Show current WiFi status if available */}
          {isWifiConnected && currentWifi && (
            <View style={themed($statusContainer)}>
              <Text style={themed($statusText)}>Currently connected to: {currentWifi}</Text>
            </View>
          )}

          {!isWifiConnected && (
            <View style={themed($statusContainer)}>
              <Text style={themed($statusText)}>Not connected to WiFi</Text>
              <Text style={themed($statusText)}>
                Note: Mentra Live Beta is only compatible with 2.4ghz WiFi networks.
              </Text>
            </View>
          )}

          <View style={themed($buttonContainer)}>
            <RouteButton
              label="Scan for Networks"
              subtitle="Automatically find nearby WiFi networks"
              onPress={handleScanForNetworks}
            />

            <RouteButton
              label="Enter Network Manually"
              subtitle="Type in network name and password"
              onPress={handleManualEntry}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.lg,
  alignItems: "center",
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  marginBottom: spacing.xl,
  textAlign: "center",
})

const $statusContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundDim,
  padding: spacing.md,
  borderRadius: spacing.xs,
  marginBottom: spacing.xl,
  width: "100%",
})

const $statusText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.text,
  textAlign: "center",
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  width: "100%",
  gap: spacing.md,
  marginTop: spacing.md,
})
