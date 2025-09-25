import React, {useCallback, useRef, useState} from "react"
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, ViewStyle} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Button, Icon} from "@/components/ignite"
import bridge from "@/bridge/MantleBridge"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {
  getGlassesClosedImage,
  getGlassesImage,
  getGlassesOpenImage,
  getEvenRealitiesG1Image,
} from "@/utils/getGlassesImage"
import {useAppTheme} from "@/utils/useAppTheme"
import {spacing, ThemedStyle} from "@/theme"
import ConnectedSimulatedGlassesInfo from "./ConnectedSimulatedGlassesInfo"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import ChevronRight from "assets/icons/component/ChevronRight"
import SunIcon from "assets/icons/component/SunIcon"
import {glassesFeatures} from "@/config/glassesFeatures"
// import {} from "assets/icons/"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"
import {showAlert, showBluetoothAlert, showLocationAlert, showLocationServicesAlert} from "@/utils/AlertUtils"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useSetting, useSettingsStore} from "@/stores/settings"
import {SETTINGS_KEYS} from "@/stores/settings"

export const ConnectDeviceButton = () => {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState(false)
  const {push} = useNavigationHistory()
  const [defaultWearable, setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)

  const connectGlasses = async () => {
    if (!defaultWearable) {
      push("/pairing/select-glasses-model")
      return
    }

    // Show loading state during connectivity check
    setIsCheckingConnectivity(true)

    try {
      // Check that Bluetooth and Location are enabled/granted
      const requirementsCheck = await bridge.checkConnectivityRequirements()

      if (!requirementsCheck.isReady) {
        // Show alert about missing requirements with "Turn On" button
        console.log("Requirements not met, showing alert with message:", requirementsCheck.message)

        // Use the appropriate connectivity alert based on the requirement
        switch (requirementsCheck.requirement) {
          case "bluetooth":
            showBluetoothAlert(
              "Connection Requirements",
              requirementsCheck.message || "Bluetooth is required to connect to glasses",
            )
            break
          case "location":
            showLocationAlert(
              "Connection Requirements",
              requirementsCheck.message || "Location permission is required to scan for glasses",
            )
            break
          case "locationServices":
            showLocationServicesAlert(
              "Connection Requirements",
              requirementsCheck.message || "Location services are required to scan for glasses",
            )
            break
          default:
            showAlert(
              "Connection Requirements",
              requirementsCheck.message || "Cannot connect to glasses - check Bluetooth and Location settings",
              [{text: "OK"}],
            )
        }
        return
      }

      // Connectivity check passed, proceed with connection
      const defaultWearable = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.default_wearable)
      const deviceName = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.device_name)
      console.log("Connecting to glasses:", defaultWearable, deviceName)
      if (defaultWearable && defaultWearable != "") {
        await bridge.sendConnectWearable(defaultWearable, deviceName, "")
      }
    } catch (error) {
      console.error("connect to glasses error:", error)
      showAlert("Connection Error", "Failed to connect to glasses. Please try again.", [{text: "OK"}])
    } finally {
      setIsCheckingConnectivity(false)
    }
  }

  const sendDisconnectWearable = async () => {
    console.log("Disconnecting wearable")

    try {
      await bridge.sendDisconnectWearable()
    } catch (error) {}
  }

  // New handler: if already connecting, pressing the button calls disconnect.
  const handleConnectOrDisconnect = async () => {
    if (status.core_info.is_searching) {
      await sendDisconnectWearable()
    } else {
      await connectGlasses()
    }
  }

  // if we have simulated glasses, show nothing:
  if (defaultWearable && defaultWearable.toLowerCase().includes("simulated")) {
    return null
  }

  // Debug the conditional logic
  const defaultWearableNull = defaultWearable == null
  const defaultWearableStringNull = defaultWearable == "null"

  if (defaultWearableNull || defaultWearableStringNull) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <SolarLineIconsSet4 color={theme.colors.textAlt} />}
        RightAccessory={() => <ChevronRight color={theme.colors.textAlt} />}
        onPress={() => {
          push("/pairing/select-glasses-model")
        }}
        tx="home:pairGlasses"
      />
    )
  }

  if (status.core_info.is_searching || isCheckingConnectivity) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginLeft: 5}} />}
        onPress={handleConnectOrDisconnect}
        tx="home:connectingGlasses"
      />
    )
  }

  if (!status.glasses_info?.model_name) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <SolarLineIconsSet4 color={theme.colors.textAlt} />}
        RightAccessory={() => <ChevronRight color={theme.colors.textAlt} />}
        onPress={handleConnectOrDisconnect}
        tx="home:connectGlasses"
        disabled={isCheckingConnectivity}
      />
    )
  }

  return null
}

interface ConnectedGlassesProps {
  showTitle: boolean
}

export const ConnectedGlasses: React.FC<ConnectedGlassesProps> = ({showTitle}) => {
  const {status} = useCoreStatus()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const {themed, theme} = useAppTheme()
  const [defaultWearable, setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)

  useFocusEffect(
    useCallback(() => {
      // Reset animations to initial values
      fadeAnim.setValue(0)
      scaleAnim.setValue(0.8)

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]).start()
      // Cleanup function
      return () => {
        fadeAnim.stopAnimation()
      }
    }, [defaultWearable, fadeAnim]),
  )

  // Calculate glasses image on every render to prevent flashing
  const getCurrentGlassesImage = () => {
    let image = getGlassesImage(defaultWearable)

    // For Even Realities G1, use dynamic image based on style and color
    if (
      defaultWearable &&
      (defaultWearable === "Even Realities G1" || defaultWearable === "evenrealities_g1" || defaultWearable === "g1")
    ) {
      const style = status.glasses_info?.glasses_style
      const color = status.glasses_info?.glasses_color

      // Determine the state based on case status
      let state = "folded"
      if (!status.glasses_info?.case_removed) {
        if (status.glasses_info?.case_open) {
          state = "case_open"
        } else {
          state = "case_close"
        }
      }

      return getEvenRealitiesG1Image(style, color, state, "l", theme.isDark, status.glasses_info?.case_battery_level)
    }

    // For other glasses, use the existing logic
    if (!status.glasses_info?.case_removed) {
      if (status.glasses_info?.case_open) {
        image = getGlassesOpenImage(defaultWearable)
      } else {
        image = getGlassesClosedImage(defaultWearable)
      }
    }

    return image
  }

  // no glasses paired
  if (!defaultWearable || defaultWearable === "null") {
    return null
  }

  if (defaultWearable && defaultWearable.toLowerCase().includes("simulated")) {
    return <ConnectedSimulatedGlassesInfo />
  }

  return (
    <View style={styles.connectedContent}>
      {/* <Text>{status.glasses_info?.case_charging ? "Charging" : "Not charging"}</Text> */}
      <Animated.Image source={getCurrentGlassesImage()} style={[styles.glassesImage, {opacity: fadeAnim}]} />
    </View>
  )
}

export function SplitDeviceInfo() {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const [defaultWearable, setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)

  // Show image if we have either connected glasses or a default wearable

  if (!defaultWearable) {
    return null
  }

  let glassesImage = getGlassesImage(defaultWearable)
  let caseImage = null

  // For Even Realities G1, use dynamic image based on style and color
  if (
    defaultWearable &&
    (defaultWearable === "Even Realities G1" || defaultWearable === "evenrealities_g1" || defaultWearable === "g1")
  ) {
    const style = status.glasses_info?.glasses_style
    const color = status.glasses_info?.glasses_color

    // Determine the state based on case status
    let state = "folded"
    if (!status.glasses_info?.case_removed) {
      if (status.glasses_info?.case_open) {
        state = "case_open"
      } else {
        state = "case_close"
      }
    }

    glassesImage = getEvenRealitiesG1Image(
      style,
      color,
      state,
      "l",
      theme.isDark,
      status.glasses_info?.case_battery_level,
    )
  } else {
    // Only show case image if glasses are actually connected (not just paired)
    if (status.glasses_info?.model_name && !status.glasses_info?.case_removed) {
      if (status.glasses_info?.case_open) {
        caseImage = getGlassesOpenImage(defaultWearable)
      } else {
        caseImage = getGlassesClosedImage(defaultWearable)
      }
    }
  }

  return (
    <View style={styles.connectedContent}>
      <View style={{flexDirection: "row", alignItems: "center", gap: 10}}>
        <Animated.Image source={glassesImage} style={[styles.glassesImage, {width: caseImage ? "50%" : "80%"}]} />
        {caseImage && <Animated.Image source={caseImage} style={[styles.glassesImage, {width: "50%"}]} />}
      </View>
    </View>
  )
}

export function DeviceToolbar() {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const [defaultWearable, setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  if (!defaultWearable) {
    return null
  }

  // don't show if simulated glasses
  if (status.glasses_info?.model_name?.toLowerCase().includes("simulated")) {
    return null
  }

  const autoBrightness = status.glasses_settings.auto_brightness
  const modelName = status.glasses_info?.model_name || ""
  const hasDisplay = glassesFeatures[modelName]?.display ?? true // Default to true if model not found
  const hasWifi = glassesFeatures[modelName]?.wifi ?? false // Default to false if model not found
  const wifiSsid = status.glasses_info?.glasses_wifi_ssid

  return (
    <View style={themed($deviceToolbar)}>
      {/* battery - always shown */}
      <View style={{flexDirection: "row", alignItems: "center", gap: 6}}>
        {status.glasses_info?.battery_level != -1 ? (
          <>
            <Icon icon="battery" size={18} color={theme.colors.statusIcon} />
            <Text style={{color: theme.colors.statusText}}>{status.glasses_info?.battery_level}%</Text>
          </>
        ) : (
          // <Text style={{color: theme.colors.text}}>No battery</Text>
          <ActivityIndicator size="small" color={theme.colors.statusText} />
        )}
      </View>

      {/* brightness - always rendered, conditionally show content */}
      <View style={{flexDirection: "row", alignItems: "center", gap: 6}}>
        {hasDisplay ? (
          <>
            <SunIcon size={18} color={theme.colors.statusIcon} />
            {autoBrightness ? (
              <Text style={{color: theme.colors.statusText}}>Auto</Text>
            ) : (
              <>
                <Text
                  style={{color: theme.colors.statusText, fontSize: 16, marginLeft: 4, fontFamily: "Inter-Regular"}}>
                  {status.glasses_settings.brightness}%
                </Text>
              </>
            )}
          </>
        ) : (
          <View style={{width: 50, height: 18}} />
        )}
      </View>

      {/* connection - always rendered, conditionally show WiFi or Bluetooth */}
      <View style={{flexDirection: "row", alignItems: "center", gap: 6}}>
        {hasWifi ? (
          <TouchableOpacity
            style={{flexDirection: "row", alignItems: "center", gap: 6}}
            onPress={() => {
              push("/pairing/glasseswifisetup", {deviceModel: status.glasses_info?.model_name || "Glasses"})
            }}>
            <MaterialCommunityIcons name="wifi" size={18} color={theme.colors.statusIcon} />
            <Text style={{color: theme.colors.statusText, fontSize: 16, fontFamily: "Inter-Regular"}}>
              {wifiSsid || "Disconnected"}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <MaterialCommunityIcons name="bluetooth" size={18} color={theme.colors.statusIcon} />
            <Text style={{color: theme.colors.statusText, fontSize: 16, fontFamily: "Inter-Regular"}}>Connected</Text>
          </>
        )}
      </View>
    </View>
  )
}

const $deviceToolbar: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  // backgroundColor: colors.palette.neutral200,
  borderRadius: spacing.md,
  paddingHorizontal: spacing.md,
  marginTop: spacing.md,
})

const styles = StyleSheet.create({
  batteryContainer: {
    alignItems: "center",
    flexDirection: "row",
  },
  batteryIcon: {
    alignSelf: "center",
    marginRight: 4,
  },
  buttonText: {
    color: "#fff",
    fontFamily: "Montserrat-Bold",
    fontSize: 14,
    fontWeight: "bold",
  },
  connectText: {
    fontFamily: "Montserrat-Bold",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
  },
  connectedContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  connectedDot: {
    fontFamily: "Montserrat-Bold",
    fontSize: 14,
    marginRight: 2,
  },
  connectedStatus: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 12,
  },
  connectedTextGreen: {
    color: "#28a745",
    fontFamily: "Montserrat-Bold",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 4,
    marginRight: 2,
  },
  connectedTextTitle: {
    fontFamily: "Montserrat-Bold",
    fontSize: 16,
    fontWeight: "bold",
  },
  deviceInfoContainer: {
    padding: 16,
    borderRadius: 12,
    width: "100%",
    minHeight: 240,
    justifyContent: "center",
    marginTop: 16, // Increased space above component
    backgroundColor: "#E5E5EA",
  },
  disabledButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#A9A9A9", // Grey when disabled
    padding: 10,
    borderRadius: 8,
    width: "80%",
  },
  disabledDisconnectButton: {
    backgroundColor: "#A9A9A9",
  },
  disconnectButton: {
    alignItems: "center",
    backgroundColor: "#E24A24",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    marginRight: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: "40%",
  },
  disconnectText: {
    color: "#fff",
    fontFamily: "Montserrat-Regular",
    fontSize: 12,
    fontWeight: "500",
  },
  disconnectedContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  glassesImage: {
    height: 120,
    resizeMode: "contain",
    width: "80%",
  },
  icon: {
    marginRight: 4,
  },
  iconContainer: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  noGlassesText: {
    color: "black",
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
  },
  separator: {
    fontFamily: "Montserrat-Bold",
    fontSize: 16,
    fontWeight: "bold",
    marginHorizontal: 10,
  },
  statusIndicatorsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    width: "100%",
    //height: 30,
  },
  statusInfo: {
    alignItems: "center",
    flex: 1,
    marginRight: 20,
  },
  statusInfoNotConnected: {
    alignItems: "center",
    flex: 1,
    width: "100%",
  },
  statusLabel: {
    fontFamily: "SF Pro",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.08,
    lineHeight: 16,
  },
  statusValue: {
    fontFamily: "Montserrat-Bold",
    fontSize: 14,
    fontWeight: "bold",
  },
  wifiContainer: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  wifiSsidText: {
    color: "#4CAF50",
    fontSize: 12,
    fontWeight: "bold",
    marginRight: 5,
    maxWidth: 120,
  },
})
