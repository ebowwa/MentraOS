import React, {useCallback, useRef} from "react"
import {View, Text, Animated, Image, ActivityIndicator, TouchableOpacity} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {Icon} from "@/components/ignite"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
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

export const NewUiCompactDeviceStatus: React.FC = () => {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
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

  // If no glasses paired, don't show this section
  if (!defaultWearable || defaultWearable === "null") {
    return null
  }

  // Don't show for simulated glasses
  if (defaultWearable.toLowerCase().includes("simulated")) {
    return null
  }

  // Get current glasses image
  const getCurrentGlassesImage = () => {
    let image = getGlassesImage(defaultWearable)

    // For Even Realities G1, use dynamic image
    if (defaultWearable === "Even Realities G1" || defaultWearable === "evenrealities_g1" || defaultWearable === "g1") {
      const style = status.glasses_info?.glasses_style
      const color = status.glasses_info?.glasses_color
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

    // For other glasses
    if (!status.glasses_info?.case_removed) {
      if (status.glasses_info?.case_open) {
        image = getGlassesOpenImage(defaultWearable)
      } else {
        image = getGlassesClosedImage(defaultWearable)
      }
    }

    return image
  }

  const modelName = status.glasses_info?.model_name || ""
  const hasDisplay = glassesFeatures[modelName]?.display ?? true
  const hasWifi = glassesFeatures[modelName]?.wifi ?? false
  const wifiSsid = status.glasses_info?.glasses_wifi_ssid
  const autoBrightness = status.glasses_settings?.auto_brightness
  const batteryLevel = status.glasses_info?.battery_level

  // Helper to truncate text with ellipsis
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength - 3) + "..."
  }

  return (
    <View style={themed($container)}>
      {/* Glasses Image - 2/3 width */}
      <Animated.View style={[themed($imageContainer), {opacity: fadeAnim}]}>
        <Image source={getCurrentGlassesImage()} style={themed($glassesImage)} />
      </Animated.View>

      {/* Status Items - 1/3 width */}
      <View style={themed($statusContainer)}>
        {/* Battery */}
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

        {/* Brightness */}
        {hasDisplay && (
          <View style={themed($statusRow)}>
            <SunIcon size={16} color={theme.colors.statusIcon} />
            <Text style={themed($statusText)} numberOfLines={1}>
              {autoBrightness ? "Auto" : `${status.glasses_settings?.brightness}%`}
            </Text>
          </View>
        )}

        {/* WiFi/Bluetooth */}
        <View style={themed($statusRow)}>
          {hasWifi ? (
            <TouchableOpacity
              style={themed($statusRow)}
              onPress={() => {
                push("/pairing/glasseswifisetup", {
                  deviceModel: status.glasses_info?.model_name || "Glasses",
                })
              }}>
              <MaterialCommunityIcons name="wifi" size={16} color={theme.colors.statusIcon} />
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

const $container = theme => ({
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: theme.spacing.sm,
  gap: theme.spacing.sm,
})

const $imageContainer = theme => ({
  flex: 2,
  alignItems: "center",
  justifyContent: "center",
})

const $glassesImage = theme => ({
  width: "100%",
  height: 100,
  resizeMode: "contain",
})

const $statusContainer = theme => ({
  flex: 1,
  justifyContent: "center",
  gap: theme.spacing.xs,
})

const $statusRow = theme => ({
  flexDirection: "row",
  alignItems: "center",
  gap: theme.spacing.xxs,
})

const $statusText = theme => ({
  color: theme.colors.statusText,
  fontSize: 14,
  fontFamily: "Inter-Regular",
  flex: 1,
})
