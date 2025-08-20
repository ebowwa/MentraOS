import React, {useState, useEffect, useRef} from "react"
import {View, Text, FlatList, TouchableOpacity, ActivityIndicator, BackHandler} from "react-native"
import {useLocalSearchParams, router, useFocusEffect} from "expo-router"
import {Screen, Header, Button, Icon} from "@/components/ignite"
import coreCommunicator from "@/bridge/CoreCommunicator"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useCallback} from "react"
import WifiCredentialsService from "@/utils/WifiCredentialsService"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

// Enhanced network info type
interface NetworkInfo {
  ssid: string
  requiresPassword: boolean
  signalStrength?: number
}

export default function WifiScanScreen() {
  const {deviceModel = "Glasses"} = useLocalSearchParams()
  const {theme, themed} = useAppTheme()
  const {status} = useCoreStatus()

  const [networks, setNetworks] = useState<NetworkInfo[]>([])
  const [savedNetworks, setSavedNetworks] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(true)
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentScanSessionRef = useRef<number>(Date.now())
  const receivedResultsForSessionRef = useRef<boolean>(false)

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

    const handleWifiScanResults = (data: {networks: string[]; networksEnhanced?: any[]}) => {
      console.log("🎯 ========= SCAN.TSX RECEIVED WIFI RESULTS =========")
      console.log("🎯 Data received:", data)

      // Process enhanced format if available, otherwise use legacy format
      let processedNetworks: NetworkInfo[]
      if (data.networksEnhanced && data.networksEnhanced.length > 0) {
        console.log("🎯 Processing enhanced networks:", data.networksEnhanced)
        processedNetworks = data.networksEnhanced.map((network: any) => ({
          ssid: network.ssid || "",
          requiresPassword: network.requiresPassword !== false, // Default to secure
          signalStrength: network.signalStrength || -100,
        }))
        console.log("🎯 Enhanced networks count:", processedNetworks.length)
      } else {
        console.log("🎯 Processing legacy networks:", data.networks)
        processedNetworks = (data.networks || []).map((ssid: string) => ({
          ssid,
          requiresPassword: true, // Default to secure for legacy format
          signalStrength: -100, // Default weak signal
        }))
        console.log("🎯 Legacy networks count:", processedNetworks.length)
      }

      // Clear the timeout since we got results
      if (scanTimeoutRef.current) {
        console.log("🎯 Clearing scan timeout - results received")
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }

      // Handle network results - replace on first result of new session, append on subsequent
      setNetworks(prevNetworks => {
        console.log(
          "🎯 Previous networks:",
          prevNetworks.map(n => n.ssid),
        )
        console.log("🎯 Received results for current session:", receivedResultsForSessionRef.current)

        let baseNetworks: NetworkInfo[]
        if (receivedResultsForSessionRef.current) {
          // This is additional results from the same scan session - append
          console.log("🎯 Appending to existing networks from current session")
          baseNetworks = prevNetworks
        } else {
          // This is the first result of a new scan session - replace
          console.log("🎯 Starting fresh with new scan session results")
          baseNetworks = []
        }

        // Create a Map to avoid duplicates by SSID when adding new networks
        const existingMap = new Map<string, NetworkInfo>()
        baseNetworks.forEach(network => existingMap.set(network.ssid, network))
        processedNetworks.forEach(network => {
          if (network.ssid) {
            existingMap.set(network.ssid, network)
          }
        })
        const newNetworks = Array.from(existingMap.values())
        console.log(
          "🎯 Updated networks list:",
          newNetworks.map(n => `${n.ssid} (${n.requiresPassword ? "secured" : "open"})`),
        )
        return newNetworks
      })

      // Mark that we've received results for the current session
      receivedResultsForSessionRef.current = true
      setIsScanning(false)
      console.log("🎯 ========= END SCAN.TSX WIFI RESULTS =========")
    }

    GlobalEventEmitter.on("WIFI_SCAN_RESULTS", handleWifiScanResults)

    return () => {
      GlobalEventEmitter.removeListener("WIFI_SCAN_RESULTS", handleWifiScanResults)
      // Clean up timeout on unmount
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
    }
  }, [])

  const startScan = async () => {
    setIsScanning(true)
    // Start a new scan session - results from this session will replace previous networks
    currentScanSessionRef.current = Date.now()
    receivedResultsForSessionRef.current = false

    // Don't clear networks immediately - let the user see existing results while scanning
    // Networks will be refreshed when new results arrive

    // Clear any existing timeout
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }

    // Set a timeout for scan results
    scanTimeoutRef.current = setTimeout(() => {
      console.log("⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️")
      console.log("⏱️ WIFI SCAN TIMEOUT - NO RESULTS AFTER 15 SECONDS ⏱️")
      console.log("⏱️ RETRYING SCAN AUTOMATICALLY...")
      console.log("⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️⏱️")

      // Don't stop scanning, just retry silently
      coreCommunicator.requestWifiScan().catch(error => {
        console.error("⏱️ RETRY FAILED:", error)
      })

      scanTimeoutRef.current = null
    }, 15000) // 15 second timeout

    try {
      await coreCommunicator.requestWifiScan()
    } catch (error) {
      console.error("Error scanning for WiFi networks:", error)
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      setIsScanning(false)
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: "Failed to scan for WiFi networks",
        type: "error",
      })
    }
  }

  const handleNetworkSelect = (selectedNetwork: NetworkInfo) => {
    // Check if this is the currently connected network
    if (isWifiConnected && currentWifi === selectedNetwork.ssid) {
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: `Already connected to ${selectedNetwork.ssid}`,
        type: "info",
      })
      return
    }

    // Skip password screen for open networks and connect directly
    if (!selectedNetwork.requiresPassword) {
      console.log(`🔓 Open network selected: ${selectedNetwork.ssid} - connecting directly`)
      push("/pairing/glasseswifisetup/connecting", {
        deviceModel,
        ssid: selectedNetwork.ssid,
        password: "", // Empty password for open networks
      })
    } else {
      console.log(`🔒 Secured network selected: ${selectedNetwork.ssid} - going to password screen`)
      push("/pairing/glasseswifisetup/password", {
        deviceModel,
        ssid: selectedNetwork.ssid,
        requiresPassword: selectedNetwork.requiresPassword.toString(),
      })
    }
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <Header title="Select Glasses WiFi Network" leftIcon="caretLeft" onLeftPress={handleGoBack} />
      <View style={themed($content)}>
        {isScanning ? (
          <View style={themed($loadingContainer)}>
            <ActivityIndicator size="large" color={theme.colors.text} />
            <Text style={themed($loadingText)}>Scanning for networks...</Text>
          </View>
        ) : networks.length > 0 ? (
          <>
            <FlatList
              data={networks}
              keyExtractor={(item, index) => `network-${index}`}
              renderItem={({item}) => {
                const isConnected = isWifiConnected && currentWifi === item.ssid
                const isSaved = savedNetworks.includes(item.ssid)
                return (
                  <TouchableOpacity
                    style={themed(isConnected ? $connectedNetworkItem : isSaved ? $savedNetworkItem : $networkItem)}
                    onPress={() => handleNetworkSelect(item)}>
                    <View style={themed($networkContent)}>
                      <View style={themed($networkNameRow)}>
                        <Text
                          style={themed(
                            isConnected ? $connectedNetworkText : isSaved ? $savedNetworkText : $networkText,
                          )}>
                          {item.ssid}
                        </Text>
                        {item.requiresPassword && !isConnected && (
                          <Icon
                            icon="lock"
                            size={16}
                            color={isSaved ? theme.colors.text : theme.colors.text}
                            containerStyle={themed($securityIconContainer)}
                          />
                        )}
                      </View>
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
                        {!item.requiresPassword && !isConnected && !isSaved && (
                          <View style={themed($openBadge)}>
                            <Text style={themed($openBadgeText)}>Open</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {!isConnected && (
                      <Text style={themed(isSaved ? $savedChevron : $chevron)}>{isSaved ? "🔑" : "›"}</Text>
                    )}
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
  textAlignVertical: "center",
})

const $connectedChevron: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  color: colors.tint,
  marginLeft: 8,
  fontWeight: "bold",
  textAlignVertical: "center",
})

const $savedChevron: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 18,
  color: colors.tint,
  marginLeft: 8,
  textAlignVertical: "center",
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

const $networkNameRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
})

const $securityIconContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginLeft: spacing.xs,
  justifyContent: "center",
  alignItems: "center",
})

const $openBadge: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.palette.success100,
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: spacing.xs,
  marginLeft: spacing.sm,
})

const $openBadgeText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 10,
  fontWeight: "500",
  color: colors.palette.success600,
})
