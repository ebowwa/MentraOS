import React, {useCallback, useEffect, useRef, useState} from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Switch,
  ViewStyle,
  TextStyle,
} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Button, Icon} from "@/components/ignite"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import {getGlassesImage} from "@/utils/getGlassesImage"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {getBatteryColor, getBatteryIcon} from "@/utils/getBatteryIcon"
import {Slider} from "react-native-elements"
import {router} from "expo-router"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import ToggleSetting from "../settings/ToggleSetting"
import SliderSetting from "../settings/SliderSetting"
import {FontAwesome, MaterialCommunityIcons} from "@expo/vector-icons"
import {translate} from "@/i18n/translate"
import showAlert from "@/utils/AlertUtils"

export default function ConnectedDeviceInfo() {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const [connectedGlasses, setConnectedGlasses] = useState("")
  const {status, refreshStatus} = useStatus()
  const [preferredMic, setPreferredMic] = useState(status.core_info.preferred_mic)

  const preferredMicOptions = [
    {label: translate("settings:phoneHeadset"), value: "phone"},
    {label: translate("settings:glasses"), value: "glasses"},
  ]

  const [isConnectButtonDisabled, setConnectButtonDisabled] = useState(false)
  const [isDisconnectButtonDisabled, setDisconnectButtonDisabled] = useState(false)

  useFocusEffect(
    useCallback(() => {
      // Reset animations to initial values
      fadeAnim.setValue(0)
      scaleAnim.setValue(0.8)
      slideAnim.setValue(-50)

      // Update connectedGlasses state when default_wearable changes
      if (status.core_info.default_wearable) {
        setConnectedGlasses(status.core_info.default_wearable)
      }

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
      if (status.core_info.default_wearable !== "") {
        setDisconnectButtonDisabled(false)
      }
      // Cleanup function
      return () => {
        fadeAnim.stopAnimation()
        scaleAnim.stopAnimation()
        slideAnim.stopAnimation()
      }
    }, [status.core_info.default_wearable, status.core_info.puck_connected, fadeAnim, scaleAnim, slideAnim]),
  )

  const sendDisconnectWearable = async () => {
    setDisconnectButtonDisabled(true)
    setConnectButtonDisabled(false)

    console.log("Disconnecting wearable")

    try {
      await coreCommunicator.sendDisconnectWearable()
    } catch (error) {}
  }

  const {theme, themed} = useAppTheme()

  const themeStyles = {
    backgroundColor: theme.colors.palette.neutral300,
    textColor: theme.colors.text,
    statusLabelColor: theme.isDark ? "#CCCCCC" : "#666666",
    statusValueColor: theme.isDark ? "#FFFFFF" : "#333333",
    connectedDotColor: "#28a745",
    separatorColor: theme.isDark ? "#666666" : "#999999",
  }

  const formatGlassesTitle = (title: string) => title.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase())

  const batteryIcon = getBatteryIcon(status.glasses_info?.battery_life ?? 0)
  const batteryColor = getBatteryColor(status.glasses_info?.battery_life ?? 0)

  // Determine the button style for connecting glasses
  const getConnectButtonStyle = () => {
    return status.core_info.is_searching
      ? styles.connectingButton
      : isConnectButtonDisabled
        ? styles.disabledButton
        : styles.connectButton
  }

  let [autoBrightness, setAutoBrightness] = useState(status?.glasses_settings?.auto_brightness ?? true)
  let [brightness, setBrightness] = useState(status?.glasses_settings?.brightness ?? 50)

  useEffect(() => {
    console.log("status?.glasses_settings?.brightness", status?.glasses_settings?.brightness)
    setBrightness(status?.glasses_settings?.brightness ?? 50)
    setAutoBrightness(status?.glasses_settings?.auto_brightness ?? true)
  }, [status?.glasses_settings?.brightness, status?.glasses_settings?.auto_brightness])

  const renderInterface = () => {
    if (!status.glasses_info?.model_name) {
      return (
        // Connect button rendering with spinner on right
        <View style={styles.noGlassesContent}>
          <TouchableOpacity
            style={getConnectButtonStyle()}
            onPress={handleConnectOrDisconnect}
            disabled={isConnectButtonDisabled && !status.core_info.is_searching}>
            <Text style={styles.buttonText}>
              {isConnectButtonDisabled || status.core_info.is_searching ? "Connecting Glasses..." : "Connect Glasses"}
            </Text>
            {status.core_info.is_searching && <ActivityIndicator size="small" color="#fff" style={{marginLeft: 5}} />}
          </TouchableOpacity>
        </View>
      )
    }

    return (
      <>
        <Animated.View style={[styles.statusBar, {opacity: fadeAnim}]}>
          <View style={styles.statusInfo}>
            {status.glasses_info?.battery_life != null && typeof status.glasses_info?.battery_life === "number" && (
              <>
                <Text style={[styles.statusLabel, {color: themeStyles.statusLabelColor}]}>Battery</Text>
                <View style={styles.batteryContainer}>
                  {status.glasses_info?.battery_life >= 0 && (
                    <Icon name={batteryIcon} size={16} color={batteryColor} style={styles.batteryIcon} />
                  )}
                  <Text style={[styles.batteryValue, {color: batteryColor}]}>
                    {status.glasses_info.battery_life == -1 ? "-" : `${status.glasses_info.battery_life}%`}
                  </Text>
                </View>
              </>
            )}
          </View>
          <TouchableOpacity
            style={[styles.disconnectButton, isDisconnectButtonDisabled && styles.disabledDisconnectButton]}
            onPress={sendDisconnectWearable}
            disabled={isDisconnectButtonDisabled}>
            <Icon name="power-off" size={18} color="white" style={styles.icon} />
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </Animated.View>
      </>
    )
  }

  const confirmForgetGlasses = () => {
    showAlert(
      translate("settings:forgetGlasses"),
      translate("settings:forgetGlassesConfirm"),
      [
        {text: translate("common:cancel"), style: "cancel"},
        {
          text: translate("common:yes"),
          onPress: () => {
            coreCommunicator.sendForgetSmartGlasses()
          },
        },
      ],
      {
        cancelable: false,
      },
    )
  }

  return (
    <View style={themed($container)}>
      <View style={themed($settingsGroup)}>
        <ToggleSetting label="Auto Brightness" value={autoBrightness} onValueChange={setAutoBrightness} />

        {!autoBrightness && (
          <>
            <View
              style={{height: 1, backgroundColor: theme.colors.palette.neutral300, marginTop: 12, marginBottom: 4}}
            />
            <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
              <View style={{flex: 8}}>
                <SliderSetting
                  label="Brightness"
                  value={brightness}
                  onValueChange={setBrightness}
                  min={0}
                  max={100}
                  onValueSet={value => {
                    coreCommunicator.setGlassesBrightnessMode(value, autoBrightness)
                  }}
                />
              </View>
              <View
                style={{
                  flex: 3,
                  alignItems: "center",
                  alignSelf: "flex-end",
                  marginBottom: -4,
                  paddingBottom: 12,
                  flexDirection: "row",
                  alignContent: "center",
                  marginLeft: 12,
                }}>
                <MaterialCommunityIcons name="brightness-7" size={24} color={theme.colors.text} />
                <Text style={{color: theme.colors.text, fontSize: 16, fontWeight: "bold", marginLeft: 4}}>
                  {brightness}%
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
      {/* divider */}

      <View style={themed($settingsGroup)}>
        <TouchableOpacity
          style={{flexDirection: "row", justifyContent: "space-between", paddingVertical: 8}}
          onPress={() => setPreferredMic("phone")}>
          <Text style={{color: theme.colors.text}}>{translate("deviceSettings:phoneMic")}</Text>
          <MaterialCommunityIcons
            name="check"
            size={24}
            color={preferredMic === "phone" ? theme.colors.palette.primary300 : "transparent"}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={{flexDirection: "row", justifyContent: "space-between", paddingVertical: 8}}
          onPress={() => setPreferredMic("glasses")}>
          <View style={{flexDirection: "column", gap: 4}}>
            <Text style={{color: theme.colors.text}}>{translate("deviceSettings:glassesMic")}</Text>
            {!status.glasses_info?.model_name && (
              <Text style={themed($subtitle)}>{translate("deviceSettings:glassesNeededForGlassesMic")}</Text>
            )}
          </View>
          <MaterialCommunityIcons
            name="check"
            size={24}
            color={preferredMic === "glasses" ? theme.colors.palette.primary300 : "transparent"}
          />
        </TouchableOpacity>
      </View>

      <View style={[themed($settingsGroup), {paddingVertical: 0}]}>
        <TouchableOpacity
          onPress={() => {
            router.push("/settings/dashboard")
          }}>
          <View
            style={{flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, alignItems: "center"}}>
            <View style={{flexDirection: "column", justifyContent: "space-between", paddingVertical: 8}}>
              <Text style={{color: theme.colors.text}}>Dashboard Settings</Text>
              <Text style={themed($subtitle)}>Contextual Dashboard and Head Up Settings</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.text} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={themed($settingsGroup)}>
        {status.core_info.default_wearable && (
          <TouchableOpacity
            style={{backgroundColor: "transparent", paddingVertical: 8, }}
            onPress={confirmForgetGlasses}>
            <Text style={themed($dangerLabel)}>{translate("settings:forgetGlasses")}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{height: 30}}>{/* this just gives the user a bit more space to scroll */}</View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  borderRadius: 12,
  width: "100%",
  minHeight: 240,
  justifyContent: "center",
  marginTop: 16, // Increased space above component
  // backgroundColor: colors.palette.neutral200,
  backgroundColor: "transparent",
  gap: 16,
})

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.palette.neutral200,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: 12,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.sm,
})

const $settingTextContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
})

const $dangerLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.palette.angry500,
})

const $disabledItem: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.5,
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
  noGlassesContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
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
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 12,
    padding: 10,
    width: "100%",
    backgroundColor: "#6750A414",
    flexWrap: "wrap",
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
  batteryValue: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Montserrat-Bold",
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
