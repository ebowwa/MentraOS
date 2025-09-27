import {useCallback, useRef, useState} from "react"
import {
  View,
  Text,
  Animated,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  ViewStyle,
  ImageStyle,
  TextStyle,
} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {Icon, Button} from "@/components/ignite"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {SETTINGS_KEYS, useSetting, useSettingsStore} from "@/stores/settings"
import {glassesFeatures} from "@/config/glassesFeatures"
import {
  getGlassesImage,
  getGlassesOpenImage,
  getGlassesClosedImage,
  getEvenRealitiesG1Image,
} from "@/utils/getGlassesImage"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import SunIcon from "assets/icons/component/SunIcon"
import bridge from "@/bridge/MantleBridge"
import {showAlert, showBluetoothAlert, showLocationAlert, showLocationServicesAlert} from "@/utils/AlertUtils"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import ChevronRight from "assets/icons/component/ChevronRight"
import {ThemedStyle} from "@/theme"
import ConnectedSimulatedGlassesInfo from "@/components/misc/ConnectedSimulatedGlassesInfo"

export const CompactDeviceStatus: React.FC = () => {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState(false)
  const fadeAnim = useRef(new Animated.Value(0)).current

  useFocusEffect(
    useCallback(() => {
      fadeAnim.setValue(0)
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start()
      return () => {
        fadeAnim.stopAnimation()
      }
    }, [defaultWearable, fadeAnim]),
  )

  // If no glasses paired, show Pair Glasses button
  if (!defaultWearable || defaultWearable === "null") {
    return (
      <View style={themed($disconnectedContainer)}>
        <Button
          textStyle={[{marginLeft: theme.spacing.xxl}]}
          textAlignment="left"
          LeftAccessory={() => <SolarLineIconsSet4 color={theme.colors.textAlt} />}
          RightAccessory={() => <ChevronRight color={theme.colors.textAlt} />}
          onPress={() => push("/pairing/select-glasses-model")}
          tx="home:pairGlasses"
        />
      </View>
    )
  }

  // Show simulated glasses view for simulated glasses
  if (defaultWearable.toLowerCase().includes("simulated")) {
    return <ConnectedSimulatedGlassesInfo />
  }

  const connectGlasses = async () => {
    if (!defaultWearable) {
      push("/pairing/select-glasses-model")
      return
    }

    setIsCheckingConnectivity(true)

    try {
      const requirementsCheck = await bridge.checkConnectivityRequirements()

      if (!requirementsCheck.isReady) {
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

      const deviceName = await useSettingsStore.getState().getSetting(SETTINGS_KEYS.device_name)
      console.log("Connecting to glasses:", defaultWearable, deviceName)
      if (defaultWearable !== "") {
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
    } catch (error) {
      console.error("disconnect wearable error:", error)
    }
  }

  const handleConnectOrDisconnect = async () => {
    if (status.core_info.is_searching) {
      await sendDisconnectWearable()
    } else {
      await connectGlasses()
    }
  }

  const getCurrentGlassesImage = () => {
    let image = getGlassesImage(defaultWearable)

    if (defaultWearable === "Even Realities G1" || defaultWearable === "evenrealities_g1" || defaultWearable === "g1") {
      const style = status.glasses_info?.glasses_style
      const color = status.glasses_info?.glasses_color
      let state = "folded"
      if (!status.glasses_info?.case_removed) {
        state = status.glasses_info?.case_open ? "case_open" : "case_close"
      }
      return getEvenRealitiesG1Image(style, color, state, "l", theme.isDark, status.glasses_info?.case_battery_level)
    }

    if (!status.glasses_info?.case_removed) {
      image = status.glasses_info?.case_open ? getGlassesOpenImage(defaultWearable) : getGlassesClosedImage(defaultWearable)
    }

    return image
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength - 3) + "..."
  }

  if (status.core_info.is_searching || isCheckingConnectivity) {
    return (
      <View style={themed($disconnectedContainer)}>
        <Animated.View style={[themed($disconnectedImageContainer), {opacity: fadeAnim}]}>
          <Image source={getCurrentGlassesImage()} style={themed($disconnectedGlassesImage)} />
        </Animated.View>
        <Button
          textStyle={[{marginLeft: theme.spacing.xxl}]}
          textAlignment="left"
          LeftAccessory={() => <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginLeft: 5}} />}
          onPress={handleConnectOrDisconnect}
          tx="home:connectingGlasses"
        />
      </View>
    )
  }

  if (!status.glasses_info?.model_name) {
    return (
      <View style={themed($disconnectedContainer)}>
        <Animated.View style={[themed($disconnectedImageContainer), {opacity: fadeAnim}]}>
          <Image source={getCurrentGlassesImage()} style={themed($disconnectedGlassesImage)} />
        </Animated.View>
        <Button
          textStyle={[{marginLeft: theme.spacing.xxl}]}
          textAlignment="left"
          LeftAccessory={() => <SolarLineIconsSet4 color={theme.colors.textAlt} />}
          RightAccessory={() => <ChevronRight color={theme.colors.textAlt} />}
          onPress={handleConnectOrDisconnect}
          tx="home:connectGlasses"
          disabled={isCheckingConnectivity}
        />
      </View>
    )
  }

  const modelName = status.glasses_info?.model_name || ""
  const hasDisplay = glassesFeatures[modelName]?.display ?? true
  const hasWifi = glassesFeatures[modelName]?.wifi ?? false
  const wifiSsid = status.glasses_info?.glasses_wifi_ssid
  const wifiConnected = Boolean(wifiSsid)
  const autoBrightness = status.glasses_settings?.auto_brightness
  const batteryLevel = status.glasses_info?.battery_level

  return (
    <View style={themed($container)}>
      <Animated.View style={[themed($imageContainer), {opacity: fadeAnim}]}>
        <Image source={getCurrentGlassesImage()} style={themed($glassesImage)} />
      </Animated.View>

      <View style={themed($statusContainer)}>
        <View style={themed($statusRow)}>
          <Icon icon="battery" size={16} color={theme.colors.statusIcon} />
          <Text style={themed($statusText)} numberOfLines={1}>
            {batteryLevel !== -1 ? (
              `${batteryLevel}%`
            ) : (
              <ActivityIndicator size="small" color={theme.colors.statusText} />
            )}
          </Text>
        </View>

        {hasDisplay && (
          <View style={themed($statusRow)}>
            <SunIcon size={16} color={theme.colors.statusIcon} />
            <Text style={themed($statusText)} numberOfLines={1}>
              {autoBrightness ? "Auto" : `${status.glasses_settings?.brightness}%`}
            </Text>
          </View>
        )}

        <View style={themed($statusRow)}>
          {hasWifi ? (
            <TouchableOpacity
              style={themed($statusRow)}
              onPress={() => {
                push("/pairing/glasseswifisetup", {
                  deviceModel: status.glasses_info?.model_name || "Glasses",
                })
              }}>
              <MaterialCommunityIcons
                name={wifiConnected ? "wifi" : "wifi-off"}
                size={16}
                color={theme.colors.statusIcon}
              />
              <Text style={themed($statusText)} numberOfLines={1}>
                {truncateText(wifiSsid || "No WiFi", 12)}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <MaterialCommunityIcons name="bluetooth" size={16} color={theme.colors.statusIcon} />
              <Text style={themed($statusText)} numberOfLines={1}>
                Connected
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: spacing.sm,
  gap: spacing.sm,
})

const $imageContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 2,
  alignItems: "center",
  justifyContent: "center",
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: 100,
  resizeMode: "contain",
})

const $statusContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  gap: spacing.xs,
})

const $statusRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
})

const $statusText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.statusText,
  fontSize: 14,
  fontFamily: "Inter-Regular",
  flex: 1,
})

const $disconnectedContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  marginTop: -spacing.md,
  paddingBottom: spacing.sm,
  gap: spacing.xs,
})

const $disconnectedImageContainer: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
  alignItems: "center",
})

const $disconnectedGlassesImage: ThemedStyle<ImageStyle> = () => ({
  width: "80%",
  height: 160,
  resizeMode: "contain",
})
