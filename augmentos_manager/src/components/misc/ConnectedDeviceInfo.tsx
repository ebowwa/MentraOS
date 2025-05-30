import React, {useCallback, useEffect, useRef, useState} from "react"
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, ViewStyle, TextStyle} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Button, Icon} from "@/components/ignite"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {getGlassesImage} from "@/utils/getGlassesImage"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {router} from "expo-router"
import {useAppTheme} from "@/utils/useAppTheme"
import {spacing, ThemedStyle} from "@/theme"
import ConnectedSimulatedGlassesInfo from "./ConnectedSimulatedGlassesInfo"
import SolarLineIconsSet4 from "assets/icons/SolarLineIconsSet4"
import ChevronRight from "assets/icons/ChevronRight"
import {Circle} from "react-native-svg"
import {AnimatedCircularProgress} from "react-native-circular-progress"
import { getBatteryColor } from "@/utils/getBatteryIcon"


export const ConnectDeviceButton = () => {
  const {status} = useStatus()

  const connectGlasses = async () => {
    if (!status.core_info.default_wearable) {
      router.push("/pairing/select-glasses-model")
      return
    }

    // Check that Bluetooth and Location are enabled/granted
    const requirementsCheck = await coreCommunicator.checkConnectivityRequirements()
    if (!requirementsCheck.isReady) {
      // Show alert about missing requirements
      console.log("Requirements not met, showing banner with message:", requirementsCheck.message)
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: requirementsCheck.message || "Cannot connect to glasses - check Bluetooth and Location settings",
        type: "error",
      })

      return
    }

    try {
      console.log("Connecting to glasses:", status.core_info.default_wearable)
      if (status.core_info.default_wearable && status.core_info.default_wearable != "") {
        console.log("Connecting to glasses:", status.core_info.default_wearable)
        await coreCommunicator.sendConnectWearable(status.core_info.default_wearable)
      }
    } catch (error) {
      console.error("connect to glasses error:", error)
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: "Failed to connect to glasses",
        type: "error",
      })
    }
  }

  const sendDisconnectWearable = async () => {
    console.log("Disconnecting wearable")

    try {
      await coreCommunicator.sendDisconnectWearable()
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
  if (!status.core_info.default_wearable) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <SolarLineIconsSet4 />}
        RightAccessory={() => <ChevronRight />}
        onPress={() => {
          router.push("/pairing/select-glasses-model")
        }}
        tx="home:pairGlasses"
      />
    )
  }

  if (status.core_info.is_searching) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <ActivityIndicator size="small" color="#fff" style={{marginLeft: 5}} />}
        onPress={() => {}}
        tx="home:connectingGlasses"
      />
    )
  }

  if (!status.glasses_info?.model_name) {
    return (
      <Button
        textStyle={[{marginLeft: spacing.xxl}]}
        textAlignment="left"
        LeftAccessory={() => <SolarLineIconsSet4 />}
        RightAccessory={() => <ChevronRight />}
        onPress={handleConnectOrDisconnect}
        tx="home:connectGlasses"
      />
    )
  }
}

export const DeviceHome = () => {
  const {status} = useStatus()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const slideAnim = useRef(new Animated.Value(-50)).current

  const {themed, theme} = useAppTheme()

  return (
    <View style={themed($deviceInfoContainer)}>
      <View style={styles.connectedContent}>
        <Animated.Image
          source={getGlassesImage(status.core_info.default_wearable)}
          style={[styles.glassesImage, {opacity: fadeAnim, transform: [{scale: scaleAnim}]}]}
        />
      </View>
    </View>
  )
}

interface ConnectedGlassesProps {
  showTitle: boolean
}

export const ConnectedGlasses: React.FC<ConnectedGlassesProps> = ({showTitle}) => {
  const {status} = useStatus()
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const {themed, theme} = useAppTheme()
  const formatGlassesTitle = (title: string) => title.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase())

  // green to red color gradient based on battery life:
const getBatteryColor = (batteryLife: number) => {
  if (batteryLife >= 80) {
    return "#00ac1a"
  } else if (batteryLife >= 50) {
    return "#FFC107"
  } else {
    return "#E24A24"
  }
}

  useFocusEffect(
    useCallback(() => {
      // Reset animations to initial values
      fadeAnim.setValue(0)
      scaleAnim.setValue(0.8)
      slideAnim.setValue(-50)

      // Start animations if device is connected
      if (status.core_info.puck_connected) {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 8,
            tension: 60,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
          }),
        ]).start()
      }
      // Cleanup function
      return () => {
        fadeAnim.stopAnimation()
        scaleAnim.stopAnimation()
        slideAnim.stopAnimation()
      }
    }, [status.core_info.default_wearable, status.core_info.puck_connected, fadeAnim, scaleAnim, slideAnim]),
  )

  // no glasses paired
  if (!status.core_info.default_wearable) {
    return null
  }

  if (status.glasses_info?.model_name && status.glasses_info.model_name.toLowerCase().includes("simulated")) {
    return <ConnectedSimulatedGlassesInfo />
  }

  // glasses paired and connected:
  return (
    <View style={styles.connectedContent}>
      <Animated.Image
        source={getGlassesImage(status.core_info.default_wearable)}
        style={[styles.glassesImage, {opacity: fadeAnim, transform: [{scale: scaleAnim}]}]}
      />
      {showTitle && (
        <Animated.View style={[styles.connectedStatus, {transform: [{translateX: slideAnim}]}]}>
          <Text style={[styles.connectedTextTitle, {color: theme.colors.text}]}>
            {formatGlassesTitle(status.core_info.default_wearable)}
          </Text>
        </Animated.View>
      )}
    </View>
  )
}

export default function ConnectedDeviceInfo() {
  const {status, refreshStatus} = useStatus()
  const {theme, themed} = useAppTheme()
  const [microphoneActive, setMicrophoneActive] = useState(status.core_info.is_mic_enabled_for_frontend)

  useEffect(() => {
    setMicrophoneActive(status.core_info.is_mic_enabled_for_frontend)
  }, [status.core_info.is_mic_enabled_for_frontend])


  const renderConnectedInterface = () => {
    if (!status.glasses_info?.model_name) {
      return null
    }

    return (
      <View style={themed($statusBar)}>
        {/* <View style={styles.statusInfo}>
            {status.glasses_info?.battery_life != null && typeof status.glasses_info?.battery_life === "number" && (
              <>
                <Text style={themed($statusLabel)}>Battery</Text>
                <View style={styles.batteryContainer}>
                  {status.glasses_info?.battery_life >= 0 && (
                    <Icon
                      name={getBatteryIcon(status.glasses_info?.battery_life ?? 0)}
                      size={16}
                      color={getBatteryColor(status.glasses_info?.battery_life ?? 0)}
                    />
                  )}
                  <Text style={themed($batteryValue)}>
                    {status.glasses_info.battery_life == -1 ? "-" : `${status.glasses_info.battery_life}%`}
                  </Text>
                </View>
              </>
            )}
          </View> */}

        {/* battery circular progress bar */}
        <View>
          {/* <Text style={themed($batteryValue)}>
            {status.glasses_info?.battery_life == -1 ? "-" : `${status.glasses_info?.battery_life}%`}
          </Text> */}

          <AnimatedCircularProgress
            size={36}
            width={3}
            lineCap="round"
            fillLineCap="round"
            fill={status.glasses_info?.battery_life}
            tintColor={getBatteryColor(status.glasses_info?.battery_life ?? 0)}
            backgroundColor={theme.colors.palette.neutral300}
            children={() => <Text style={themed($batteryValue)}>{status.glasses_info?.battery_life}</Text>}
            rotation={0}
          />
        </View>

        {/* disconnect button */}
        <TouchableOpacity
          style={[styles.disconnectButton, status.core_info.is_searching && styles.disabledDisconnectButton]}
          onPress={() => {
            coreCommunicator.sendDisconnectWearable()
          }}
          disabled={status.core_info.is_searching}>
          <Icon name="power-off" size={18} color="white" style={styles.icon} />
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>
    )
  }

  {
    /* Use the simulated version if we're connected to simulated glasses */
  }
  if (status.glasses_info?.model_name && status.glasses_info.model_name.toLowerCase().includes("simulated")) {
    return <ConnectedSimulatedGlassesInfo />
  }

  const renderStatusIndicators = () => {
    {
      /* Status Indicators Row - Only render if indicators present */
    }
    if (microphoneActive || (status.glasses_info && status.glasses_info.glasses_use_wifi === true)) {
      return (
        <View style={styles.statusIndicatorsRow}>
          {microphoneActive && <Icon name="microphone" size={20} color="#4CAF50" />}

          {/* Centered flex space */}
          <View style={{flex: 1}} />

          {/* WiFi Status Indicator */}
          {status.glasses_info && status.glasses_info.glasses_use_wifi === true && (
            <TouchableOpacity
              style={styles.wifiContainer}
              onPress={() => {
                if (status.glasses_info) {
                  router.push({
                    pathname: "/pairing/glasses-wifi-setup",
                    params: {
                      deviceModel: status.glasses_info.model_name || "Glasses",
                    },
                  })
                }
              }}>
              {status.glasses_info.glasses_wifi_connected ? (
                <>
                  {status.glasses_info.glasses_wifi_ssid && (
                    <Text style={styles.wifiSsidText}>{status.glasses_info.glasses_wifi_ssid}</Text>
                  )}
                  <Icon name="wifi" size={20} color="#4CAF50" />
                </>
              ) : (
                <MaterialIcon name="wifi-off" size={20} color="#E53935" />
              )}
            </TouchableOpacity>
          )}
        </View>
      )
    }
    return null
  }

  return (
    <View style={themed($deviceInfoContainer)}>
      {renderStatusIndicators()}
      <ConnectedGlasses showTitle={true} />
      {renderConnectedInterface()}
      <ConnectDeviceButton />
    </View>
  )
}

const $deviceInfoContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  // padding: 16,
  // borderRadius: 12,
  // width: "100%",
  // minHeight: 240,
  // justifyContent: "center",
  marginTop: 16,
  // paddingHorizontal: 24,
  // backgroundColor: colors.palette.neutral200,
})

const $statusLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  lineHeight: 16,
  fontWeight: "500",
  letterSpacing: -0.08,
  fontFamily: "SF Pro",
})

const $batteryValue: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  fontWeight: "bold",
  fontFamily: "Montserrat-Bold",
  color: colors.text,
})

const $statusBar: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  borderRadius: 12,
  padding: 10,
})

const styles = StyleSheet.create({
  deviceInfoContainer: {
    padding: 16,
    borderRadius: 12,
    width: "100%",
    minHeight: 240,
    justifyContent: "center",
    marginTop: 16, // Increased space above component
    backgroundColor: "#E5E5EA",
  },
  connectedContent: {
    flex: 1,
    flexShrink: 1,
    justifyContent: "space-between",
    alignItems: "center",
  },
  disconnectedContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  glassesImage: {
    width: "80%",
    height: 120,
    resizeMode: "contain",
  },
  statusInfoNotConnected: {
    alignItems: "center",
    flex: 1,
    width: "100%",
  },
  statusInfo: {
    alignItems: "center",
    flex: 1,
    marginRight: 20,
  },
  batteryContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  batteryIcon: {
    marginRight: 4,
    alignSelf: "center",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  connectedStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  connectedDot: {
    fontSize: 14,
    marginRight: 2,
    fontFamily: "Montserrat-Bold",
  },
  separator: {
    marginHorizontal: 10,
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  connectedTextGreen: {
    color: "#28a745",
    marginLeft: 4,
    marginRight: 2,
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  connectedTextTitle: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  statusLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: -0.08,
    fontFamily: "SF Pro",
  },
  connectText: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
    fontFamily: "Montserrat-Bold",
  },
  noGlassesText: {
    color: "black",
    textAlign: "center",
    fontSize: 16,
    marginBottom: 10,
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    padding: 10,
    borderRadius: 8,
    width: "80%",
  },
  connectingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFC107", // Yellow when enabled & searching
    padding: 10,
    borderRadius: 8,
    width: "80%",
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
  icon: {
    marginRight: 4,
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
  },
  disconnectButton: {
    flexDirection: "row",
    backgroundColor: "#E24A24",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    justifyContent: "center",
    marginRight: 5,
    width: "40%",
  },
  disconnectText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Montserrat-Regular",
  },
  statusIndicatorsRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    //height: 30,
  },
  iconContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  wifiContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 18,
  },
  wifiSsidText: {
    fontSize: 12,
    color: "#4CAF50",
    fontWeight: "bold",
    marginRight: 5,
    maxWidth: 120,
  },
})
