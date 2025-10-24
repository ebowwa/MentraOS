import {Text} from "@/components/ignite"
import {useState} from "react"
import {ActivityIndicator, Image, ImageStyle, TextStyle, TouchableOpacity, View, ViewStyle} from "react-native"
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons"

import {Button, Icon} from "@/components/ignite"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"
import {ThemedStyle} from "@/theme"
import {showAlert} from "@/utils/AlertUtils"
import {
  getEvenRealitiesG1Image,
  getGlassesClosedImage,
  getGlassesImage,
  getGlassesOpenImage,
} from "@/utils/getGlassesImage"
import {checkConnectivityRequirementsUI} from "@/utils/PermissionsUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"
import SolarLineIconsSet4 from "assets/icons/component/SolarLineIconsSet4"
import SunIcon from "assets/icons/component/SunIcon"
import {DeviceTypes, getModelCapabilities} from "../../../../cloud/packages/types/src"
import CoreModule from "core"

export const CompactDeviceStatus: React.FC = () => {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const [defaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState(false)
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
  // if (defaultWearable.includes(DeviceTypes.SIMULATED)) {
  // return <ConnectedSimulatedGlassesInfo />
  // }

  const connectGlasses = async () => {
    if (!defaultWearable) {
      push("/pairing/select-glasses-model")
      return
    }

    setIsCheckingConnectivity(true)

    try {
      const requirementsCheck = await checkConnectivityRequirementsUI()

      if (!requirementsCheck) {
        return
      }
    } catch (error) {
      console.error("connect to glasses error:", error)
      showAlert("Connection Error", "Failed to connect to glasses. Please try again.", [{text: "OK"}])
    } finally {
      setIsCheckingConnectivity(false)
    }
    await CoreModule.connectDefault()
  }

  const handleConnectOrDisconnect = async () => {
    if (status.core_info.is_searching) {
      await CoreModule.disconnect()
    } else {
      await connectGlasses()
    }
  }

  const getCurrentGlassesImage = () => {
    let image = getGlassesImage(defaultWearable)

    if (defaultWearable === DeviceTypes.G1) {
      const style = status.glasses_info?.glasses_style
      const color = status.glasses_info?.glasses_color
      let state = "folded"
      if (!status.glasses_info?.case_removed) {
        state = status.glasses_info?.case_open ? "case_open" : "case_close"
      }
      return getEvenRealitiesG1Image(style, color, state, "l", theme.isDark, status.glasses_info?.case_battery_level)
    }

    if (!status.glasses_info?.case_removed) {
      image = status.glasses_info?.case_open
        ? getGlassesOpenImage(defaultWearable)
        : getGlassesClosedImage(defaultWearable)
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
        <View style={[themed($disconnectedImageContainer)]}>
          <Image source={getCurrentGlassesImage()} style={themed($disconnectedGlassesImage)} />
        </View>
        <Button
          textStyle={[{marginLeft: theme.spacing.xxl}]}
          textAlignment="left"
          LeftAccessory={() => <ActivityIndicator size="small" color={theme.colors.textAlt} style={{marginLeft: 5}} />}
          tx="home:connectingGlasses"
          // disabled={true}
          onPress={handleConnectOrDisconnect}
        />
      </View>
    )
  }

  if (!status.glasses_info?.model_name) {
    return (
      <View style={themed($disconnectedContainer)}>
        <View style={[themed($disconnectedImageContainer)]}>
          <Image source={getCurrentGlassesImage()} style={themed($disconnectedGlassesImage)} />
        </View>
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

  // Don't show glasses image and stats for simulated glasses
  if (defaultWearable === DeviceTypes.SIMULATED) {
    return null
  }

  const features = getModelCapabilities(defaultWearable)
  const hasDisplay = features?.hasDisplay ?? true
  const hasWifi = features?.hasWifi ?? false
  const wifiSsid = status.glasses_info?.glasses_wifi_ssid
  const wifiConnected = Boolean(wifiSsid)
  const autoBrightness = status.glasses_settings?.auto_brightness
  const batteryLevel = status.glasses_info?.battery_level ?? 100

  return (
    <View style={themed($container)}>
      <View style={[themed($imageContainer)]}>
        <Image source={getCurrentGlassesImage()} style={themed($glassesImage)} />
      </View>

      <View style={themed($statusContainer)}>
        <View style={themed($statusRow)}>
          <Icon icon="battery" size={16} color={theme.colors.textDim} />
          <Text style={[themed($statusText), {height: 22}]} numberOfLines={1}>
            {batteryLevel !== -1 ? `${batteryLevel}%` : <ActivityIndicator size="small" color={theme.colors.text} />}
          </Text>
        </View>

        {hasDisplay && (
          <View style={themed($statusRow)}>
            <SunIcon size={16} color={theme.colors.textDim} />
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
                color={theme.colors.textDim}
              />
              <Text style={themed($statusText)} numberOfLines={1}>
                {truncateText(wifiSsid || "No WiFi", 12)}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <MaterialCommunityIcons name="bluetooth" size={16} color={theme.colors.textDim} />
              <Text style={themed($statusText)} numberOfLines={1} tx="glasses:connected" />
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  paddingVertical: spacing.md,
  gap: spacing.sm,
})

const $imageContainer: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  flex: 2,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
  borderRadius: spacing.lg,
  backgroundColor: colors.backgroundAlt,
  alignSelf: "stretch",
  paddingHorizontal: spacing.md,
})

const $glassesImage: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: 100,
  resizeMode: "contain",
})

const $statusContainer: ThemedStyle<ViewStyle> = ({spacing, colors}) => ({
  flex: 1,
  minWidth: 100,
  justifyContent: "center",
  gap: spacing.xs,
  borderColor: colors.border,
  borderWidth: spacing.xxxs,
  padding: spacing.md,
  backgroundColor: colors.backgroundAlt,
  borderRadius: spacing.lg,
})

const $statusRow: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  justifyContent: "space-between",
  // width: "400,
})

const $statusText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
  fontSize: 14,
  fontFamily: "Inter-Regular",
  flex: 1,
})

const $disconnectedContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  alignItems: "center",
  paddingBottom: spacing.sm,
  gap: spacing.xs,
})

const $disconnectedImageContainer: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  width: "100%",
  alignItems: "center",
  borderColor: colors.border,
  borderWidth: spacing.xxxs,
  padding: spacing.sm,
  backgroundColor: colors.backgroundAlt,
  borderRadius: spacing.lg,
  marginBottom: spacing.sm,
})

const $disconnectedGlassesImage: ThemedStyle<ImageStyle> = () => ({
  // width: "80%",
  height: 100,
  resizeMode: "contain",
})
