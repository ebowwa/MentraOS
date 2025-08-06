import React, {useState, useEffect} from "react"
import {View, Text, FlatList, TouchableOpacity, ActivityIndicator, BackHandler} from "react-native"
import {useLocalSearchParams, router, useFocusEffect} from "expo-router"
import {Screen, Header, Button} from "@/components/ignite"
import coreCommunicator from "@/bridge/CoreCommunicator"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {useCallback} from "react"
import WifiCredentialsService from "@/utils/WifiCredentialsService"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function WifiScanScreen() {
  const {deviceModel = "Glasses"} = useLocalSearchParams()
  const {theme, themed} = useAppTheme()
  const {status} = useStatus()

  const [networks, setNetworks] = useState<string[]>([])
  const [savedNetworks, setSavedNetworks] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(true)

  const {push, goBack} = useNavigationHistory()

  // Get current WiFi status
  const currentWifi = status.glasses_info?.glasses_wifi_ssid
  const isWifiConnected = status.glasses_info?.glasses_wifi_connected

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

  useEffect(() => {
    // Load saved networks
    const loadSavedNetworks = () => {
      const savedCredentials = WifiCredentialsService.getAllCredentials()
      setSavedNetworks(savedCredentials.map(cred => cred.ssid))
    }

    loadSavedNetworks()
    // Start scanning immediately when screen loads
    startScan()

    const handleWifiScanResults = (data: {networks: string[]}) => {
      console.log("WiFi scan results received:", data.networks)
      setNetworks(data.networks)
      setIsScanning(false)
    }

    GlobalEventEmitter.on("WIFI_SCAN_RESULTS", handleWifiScanResults)

    return () => {
      GlobalEventEmitter.removeListener("WIFI_SCAN_RESULTS", handleWifiScanResults)
    }
  }, [])

  const startScan = async () => {
    setIsScanning(true)
    setNetworks([])

    try {
      await coreCommunicator.requestWifiScan()
    } catch (error) {
      console.error("Error scanning for WiFi networks:", error)
      setIsScanning(false)
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: "Failed to scan for WiFi networks",
        type: "error",
      })
    }
  }

  const handleNetworkSelect = (selectedNetwork: string) => {
    // Check if this is the currently connected network
    if (isWifiConnected && currentWifi === selectedNetwork) {
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: `Already connected to ${selectedNetwork}`,
        type: "info",
      })
      return
    }

    push("/pairing/glasseswifisetup/password", {deviceModel, ssid: selectedNetwork})
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <Header title="Select Glasses WiFi Network" leftIcon="caretLeft" onLeftPress={handleGoBack} />
      <View style={themed($content)}>
        {isScanning ? (
          <View style={themed($loadingContainer)}>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={themed($loadingText)}>Scanning for networks...</Text>
            <Text style={themed($loadingText)}>
              (this may take a while, try restarting the app if it doesn't work after 2 minutes)
            </Text>
          </View>
        ) : networks.length > 0 ? (
          <>
            <FlatList
              data={networks}
              keyExtractor={(item, index) => `network-${index}`}
              renderItem={({item}) => {
                const isConnected = isWifiConnected && currentWifi === item
                const isSaved = savedNetworks.includes(item)
                return (
                  <TouchableOpacity
                    style={themed(isConnected ? $connectedNetworkItem : isSaved ? $savedNetworkItem : $networkItem)}
                    onPress={() => handleNetworkSelect(item)}>
                    <View style={themed($networkContent)}>
                      <Text
                        style={themed(
                          isConnected ? $connectedNetworkText : isSaved ? $savedNetworkText : $networkText,
                        )}>
                        {item}
                      </Text>
                      <View style={themed($badgeContainer)}>
                        {isConnected && (
                          <View style={themed($connectedBadge)}>
                            <Text style={themed($connectedBadgeText)}>Connected</Text>
                          </View>
                        )}
                        {isSaved && !isConnected && (
                          <View style={themed($savedBadge)}>
                            <Text style={themed($savedBadgeText)}>Saved</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={themed(isConnected ? $connectedChevron : isSaved ? $savedChevron : $chevron)}>
                      {isConnected ? "✓" : isSaved ? "🔑" : "›"}
                    </Text>
                  </TouchableOpacity>
                )
              }}
              style={themed($networksList)}
              contentContainerStyle={themed($listContent)}
            />
            <Button text="Scan Again" onPress={startScan} style={themed($scanButton)} />
          </>
        ) : (
          <View style={themed($emptyContainer)}>
            <Text style={themed($emptyText)}>No networks found</Text>
            <Button text="Try Again" onPress={startScan} style={themed($tryAgainButton)} />
          </View>
        )}
      </View>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.lg,
})

const $loadingContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxl,
})

const $loadingText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  marginTop: spacing.md,
  fontSize: 16,
  color: colors.textDim,
})

const $networksList: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: "100%",
})

const $listContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  paddingBottom: spacing.md,
})

const $networkItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  backgroundColor: colors.background,
  padding: spacing.md,
  marginBottom: spacing.xs,
  borderRadius: spacing.xs,
  borderWidth: 1,
  borderColor: colors.border,
})

const $connectedNetworkItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  backgroundColor: colors.backgroundDim,
  padding: spacing.md,
  marginBottom: spacing.xs,
  borderRadius: spacing.xs,
  borderWidth: 1,
  borderColor: colors.border,
  opacity: 0.7,
})

const $savedNetworkItem: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  backgroundColor: colors.background,
  padding: spacing.md,
  marginBottom: spacing.xs,
  borderRadius: spacing.xs,
  borderWidth: 1,
  borderColor: colors.tint,
})

const $networkContent: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
})

const $networkText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  flex: 1,
})

const $connectedNetworkText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.textDim,
  flex: 1,
})

const $savedNetworkText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
  flex: 1,
  fontWeight: "500",
})

const $badgeContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
})

const $connectedBadge: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.tint,
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: spacing.xs,
  marginLeft: spacing.sm,
})

const $savedBadge: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.textDim,
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: spacing.xs,
  marginLeft: spacing.sm,
})

const $connectedBadgeText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 10,
  fontWeight: "500",
  color: colors.background,
  textTransform: "uppercase",
})

const $savedBadgeText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 10,
  fontWeight: "500",
  color: colors.background,
  textTransform: "uppercase",
})

const $chevron: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 24,
  color: colors.textDim,
  marginLeft: 8,
})

const $connectedChevron: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  color: colors.tint,
  marginLeft: 8,
  fontWeight: "bold",
})

const $savedChevron: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 18,
  color: colors.tint,
  marginLeft: 8,
})

const $emptyContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxl,
})

const $emptyText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.textDim,
  marginBottom: spacing.lg,
  textAlign: "center",
})

const $scanButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.md,
})

const $tryAgainButton: ThemedStyle<ViewStyle> = () => ({})
