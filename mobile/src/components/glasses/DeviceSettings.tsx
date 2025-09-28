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
  Platform,
  ScrollView,
} from "react-native"
import {useFocusEffect} from "@react-navigation/native"
import {Icon} from "@/components/ignite"
import bridge from "@/bridge/MantleBridge"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import ToggleSetting from "@/components/settings/ToggleSetting"
import SliderSetting from "@/components/settings/SliderSetting"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {translate} from "@/i18n/translate"
import showAlert, {showDestructiveAlert} from "@/utils/AlertUtils"
import {PermissionFeatures, requestFeaturePermissions} from "@/utils/PermissionsUtils"
import RouteButton from "@/components/ui/RouteButton"
import ActionButton from "@/components/ui/ActionButton"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {glassesFeatures, hasBrightness, hasCustomMic, hasGallery} from "@/config/glassesFeatures"
import {useAuth} from "@/contexts/AuthContext"
import {SvgXml} from "react-native-svg"
import OtaProgressSection from "./OtaProgressSection"
import InfoSection from "@/components/ui/InfoSection"
import {SETTINGS_KEYS, useSetting, useSettingsStore} from "@/stores/settings"

// Icon components defined directly in this file to avoid path resolution issues
interface CaseIconProps {
  size?: number
  color?: string
  isCharging?: boolean
  isDark?: boolean
}

const CaseIcon = ({size = 24, color, isCharging = false, isDark = false}: CaseIconProps) => {
  const caseSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 16.125L10.5 16.125L10.5 17.625L3 17.625L3 16.125Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 4.875L21 4.875L21 6.375L3 6.375L3 4.875Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 13.125L10.5 13.125L10.5 14.625L3 14.625L3 13.125Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="1.5" y="6.375" width="1.5" height="9.75" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="21" y="6.375" width="1.5" height="4.5" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="10.5" y="10.125" width="3" height="1.5" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.5 12.375H21V13.875H13.5V12.375Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.5 13.875H21V17.625H13.5V13.875Z" fill="${isCharging ? "#FEF991" : color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.5 17.625H21V19.125H13.5V17.625Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M21 13.875H22.5V17.625H21V13.875Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M22.5 14.625H23.25V16.875H22.5V14.625Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="12" y="13.875" width="1.5" height="3.75" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
</svg>`
  return <SvgXml xml={caseSvg} width={size} height={size} />
}

interface GlassesIconProps {
  size?: number
  color?: string
  isOn?: boolean
  isDark?: boolean
}

const GlassesIcon = ({size = 24, color, isOn = false, isDark = false}: GlassesIconProps) => {
  const glassesSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1.5 9H3.00005V15.0002H1.5V9Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.502 12H15.002V15.0001H13.502V12Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M12 9H13.5001V12.0001H12V9Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M10.5 9H12.0001V12.0001H10.5V9Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M10.5 10.5H13.5001V12.0001H10.5V10.5Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M9.00195 12H10.502V15.0001H9.00195V12Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M21 9H22.5001V15.0002H21V9Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M3 7.5H10.5003V9.00005H3V7.5Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.502 7.5H21.0022V9.00005H13.502V7.5Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M3 15H9.00021V16.5001H3V15Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M15 15H21.0002V16.5001H15V15Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
</svg>`
  return <SvgXml xml={glassesSvg} width={size} height={size} />
}

export default function DeviceSettings() {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const slideAnim = useRef(new Animated.Value(-50)).current
  const {theme, themed} = useAppTheme()
  const {status} = useCoreStatus()
  const isGlassesConnected = Boolean(status.glasses_info?.model_name)
  const [defaultWearable, setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [buttonMode, setButtonMode] = useSetting(SETTINGS_KEYS.button_mode)
  const [preferredMic, setPreferredMic] = useSetting(SETTINGS_KEYS.preferred_mic)
  const [autoBrightness, setAutoBrightness] = useSetting(SETTINGS_KEYS.auto_brightness)
  const [brightness, setBrightness] = useSetting(SETTINGS_KEYS.brightness)
  const [showAdvancedSettings, setShowAdvancedSettings] = useSetting(SETTINGS_KEYS.SHOW_ADVANCED_SETTINGS)

  const {push} = useNavigationHistory()

  // Check if we have any advanced settings to show
  const hasMicrophoneSelector =
    isGlassesConnected &&
    defaultWearable &&
    hasCustomMic(defaultWearable) &&
    (defaultWearable !== "Mentra Live" ||
      (Platform.OS === "android" && status.glasses_info?.glasses_device_model !== "K900"))

  const hasDeviceInfo =
    status.glasses_info?.bluetooth_name ||
    status.glasses_info?.glasses_build_number ||
    status.glasses_info?.glasses_wifi_local_ip

  const hasAdvancedSettingsContent = hasMicrophoneSelector || hasDeviceInfo

  // Animate advanced settings dropdown
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: showAdvancedSettings ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [showAdvancedSettings, fadeAnim])

  useFocusEffect(
    useCallback(() => {
      // Reset animations to initial values
      fadeAnim.setValue(0)
      scaleAnim.setValue(0.8)
      slideAnim.setValue(-50)

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
      // Cleanup function
      return () => {
        fadeAnim.stopAnimation()
        scaleAnim.stopAnimation()
        slideAnim.stopAnimation()
      }
    }, [fadeAnim, scaleAnim, slideAnim]),
  )

  const sendDisconnectWearable = async () => {
    console.log("Disconnecting wearable")

    try {
      await bridge.sendDisconnectWearable()
    } catch (error) {}
  }

  useEffect(() => {
    if (status.glasses_settings?.button_mode) {
      setButtonMode(status.glasses_settings.button_mode)
    }
  }, [status.glasses_settings?.button_mode])

  const setMic = async (val: string) => {
    if (val === "phone") {
      // We're potentially about to enable the mic, so request permission
      const hasMicPermission = await requestFeaturePermissions(PermissionFeatures.MICROPHONE)
      if (!hasMicPermission) {
        // Permission denied, don't toggle the setting
        console.log("Microphone permission denied, cannot enable phone microphone")
        showAlert(
          "Microphone Permission Required",
          "Microphone permission is required to use the phone microphone feature. Please grant microphone permission in settings.",
          [{text: "OK"}],
          {
            iconName: "microphone",
            iconColor: "#2196F3",
          },
        )
        return
      }
    }

    setPreferredMic(val)
    await useSettingsStore.getState().setSetting(SETTINGS_KEYS.preferred_mic, val)
    await bridge.sendSetPreferredMic(val) // TODO: config: remove
  }

  const setButtonModeWithSave = async (mode: string) => {
    setButtonMode(mode)
    await useSettingsStore.getState().setSetting(SETTINGS_KEYS.button_mode, mode)
    await bridge.sendSetButtonMode(mode) // TODO: config: remove
  }

  const confirmForgetGlasses = () => {
    showDestructiveAlert(
      translate("settings:forgetGlasses"),
      translate("settings:forgetGlassesConfirm"),
      [
        {text: translate("common:cancel"), style: "cancel"},
        {
          text: translate("common:yes"),
          onPress: () => {
            bridge.sendForgetSmartGlasses()
          },
        },
      ],
      {
        cancelable: false,
      },
    )
  }

  // Check if no glasses are paired at all
  if (!defaultWearable) {
    return (
      <View style={themed($container)}>
        <View style={themed($emptyStateContainer)}>
          <Text style={themed($emptyStateText)}>
            Glasses settings will appear here.{"\n"}Pair glasses to adjust settings.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={themed($container)}>
      {/* Show helper text if glasses are paired but not connected */}
      {!status.glasses_info?.model_name && defaultWearable && (
        <View style={themed($infoContainer)}>
          <Text style={themed($infoText)}>
            Changes to glasses settings will take effect when glasses are connected.
          </Text>
        </View>
      )}

      {/* Battery Status Section */}
      {isGlassesConnected &&
        status.glasses_info?.battery_level !== undefined &&
        status.glasses_info.battery_level !== -1 && (
          <View style={themed($settingsGroup)}>
            <Text style={[themed($subtitle), {marginBottom: theme.spacing.xs}]}>Battery Status</Text>
            {/* Glasses Battery */}
            {status.glasses_info.battery_level !== -1 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}>
                <View style={{flexDirection: "row", alignItems: "center"}}>
                  <GlassesIcon size={20} isDark={theme.isDark} />
                  <Text style={{color: theme.colors.text, marginLeft: theme.spacing.xs}}>Glasses</Text>
                </View>
                <View style={{flexDirection: "row", alignItems: "center"}}>
                  <Icon icon="battery" size={16} color={theme.colors.text} />
                  <Text style={{color: theme.colors.text, marginLeft: 4, fontWeight: "500"}}>
                    {status.glasses_info.battery_level}%
                  </Text>
                </View>
              </View>
            )}

            {/* Case Battery */}
            {status.glasses_info.case_battery_level !== undefined &&
              status.glasses_info.case_battery_level !== -1 &&
              !status.glasses_info.case_removed && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: theme.spacing.xs,
                  }}>
                  <View style={{flexDirection: "row", alignItems: "center"}}>
                    <CaseIcon size={20} isCharging={status.glasses_info.case_charging} isDark={theme.isDark} />
                    <Text style={{color: theme.colors.text, marginLeft: theme.spacing.xxs}}>
                      Case {status.glasses_info.case_charging ? "(Charging)" : ""}
                    </Text>
                  </View>
                  <View style={{flexDirection: "row", alignItems: "center"}}>
                    <Icon icon="battery" size={16} color={theme.colors.text} />
                    <Text style={{color: theme.colors.text, marginLeft: theme.spacing.xxs, fontWeight: "500"}}>
                      {status.glasses_info.case_battery_level}%
                    </Text>
                  </View>
                </View>
              )}
          </View>
        )}

      {hasGallery(defaultWearable) && (
        <RouteButton
          label={translate("glasses:gallery")}
          subtitle={translate("glasses:galleryDescription")}
          onPress={() => push("/asg/gallery")}
        />
      )}

      {hasBrightness(defaultWearable) && isGlassesConnected && (
        <View style={themed($settingsGroup)}>
          <ToggleSetting
            label="Auto Brightness"
            value={autoBrightness}
            onValueChange={value => {
              setAutoBrightness(value)
              bridge.setGlassesBrightnessMode(brightness, value)
            }}
            containerStyle={{
              paddingHorizontal: 0,
              paddingTop: 0,
              paddingBottom: autoBrightness ? 0 : undefined,
              borderWidth: 0,
            }}
          />

          {!autoBrightness && (
            <>
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: theme.colors.separator,
                  marginBottom: theme.spacing.xs,
                }}
              />
              <SliderSetting
                label="Brightness"
                value={brightness}
                onValueChange={setBrightness}
                min={0}
                max={100}
                onValueSet={value => {
                  bridge.setGlassesBrightnessMode(value, autoBrightness)
                }}
                containerStyle={{paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0}}
                disableBorder
              />
            </>
          )}
        </View>
      )}

      {/* Nex Developer Settings - Only show when connected to Mentra Nex */}
      {defaultWearable && defaultWearable.toLowerCase().includes("nex") && (
        <RouteButton
          label="Nex Developer Settings"
          subtitle="Advanced developer tools and debugging features"
          onPress={() => push("/glasses/nex-developer-settings")}
        />
      )}
      {/* Mic selector has been moved to Advanced Settings section below */}

      {/* Only show button mode selector if glasses support configurable button */}
      {defaultWearable && glassesFeatures[defaultWearable]?.configurableButton && (
        <View style={themed($settingsGroup)}>
          <Text style={[themed($settingLabel), {marginBottom: theme.spacing.sm}]}>
            {translate("deviceSettings:cameraButtonAction")}
          </Text>

          <TouchableOpacity
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingBottom: theme.spacing.xs,
              paddingTop: theme.spacing.xs,
            }}
            onPress={() => setButtonModeWithSave("photo")}>
            <Text style={{color: theme.colors.text}}>{translate("deviceSettings:takeGalleryPhoto")}</Text>
            <MaterialCommunityIcons
              name="check"
              size={24}
              color={buttonMode === "photo" ? theme.colors.checkmark : "transparent"}
            />
          </TouchableOpacity>

          {/* divider */}
          <View
            style={{height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.separator, marginVertical: 4}}
          />

          <TouchableOpacity
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingTop: theme.spacing.xs,
              paddingBottom: theme.spacing.xs,
            }}
            onPress={() => setButtonModeWithSave("apps")}>
            <Text style={{color: theme.colors.text}}>{translate("deviceSettings:useInApps")}</Text>
            <MaterialCommunityIcons
              name="check"
              size={24}
              color={buttonMode === "apps" ? theme.colors.checkmark : "transparent"}
            />
          </TouchableOpacity>

          {/* divider */}
          <View
            style={{height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.separator, marginVertical: 4}}
          />

          <TouchableOpacity
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingTop: theme.spacing.xs,
            }}
            onPress={() => setButtonModeWithSave("both")}>
            <Text style={{color: theme.colors.text}}>{translate("deviceSettings:both")}</Text>
            <MaterialCommunityIcons
              name="check"
              size={24}
              color={buttonMode === "both" ? theme.colors.checkmark : "transparent"}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Camera Settings button for glasses with configurable button */}
      {defaultWearable && glassesFeatures[defaultWearable]?.configurableButton && (
        <RouteButton
          label={translate("settings:cameraSettings")}
          subtitle={translate("settings:cameraSettingsDescription")}
          onPress={() => push("/settings/camera")}
        />
      )}

      {/* Only show WiFi settings if connected glasses support WiFi */}
      {defaultWearable && glassesFeatures[defaultWearable]?.wifi && (
        <RouteButton
          label={translate("settings:glassesWifiSettings")}
          subtitle={translate("settings:glassesWifiDescription")}
          onPress={() => {
            push("/pairing/glasseswifisetup", {deviceModel: status.glasses_info?.model_name || "Glasses"})
          }}
        />
      )}

      {/* Device info is rendered within the Advanced Settings section below */}

      {/* OTA Progress Section - Only show for Mentra Live glasses */}
      {defaultWearable && isGlassesConnected && defaultWearable.toLowerCase().includes("live") && (
        <OtaProgressSection otaProgress={status.ota_progress} />
      )}

      <RouteButton
        label={translate("settings:dashboardSettings")}
        subtitle={translate("settings:dashboardDescription")}
        onPress={() => push("/settings/dashboard")}
      />

      {defaultWearable && isGlassesConnected && defaultWearable !== "Simulated Glasses" && (
        <ActionButton
          label={translate("settings:disconnectGlasses")}
          variant="destructive"
          onPress={() => {
            bridge.sendDisconnectWearable()
          }}
        />
      )}

      {defaultWearable && (
        <ActionButton
          label={translate("settings:forgetGlasses")}
          variant="destructive"
          onPress={confirmForgetGlasses}
        />
      )}

      {/* Advanced Settings Dropdown - Only show if there's content */}
      {defaultWearable && hasAdvancedSettingsContent && (
        <>
          <TouchableOpacity
            style={themed($advancedSettingsButton)}
            onPress={() => setShowAdvancedSettings(!showAdvancedSettings)}
            activeOpacity={0.7}>
            <View style={themed($advancedSettingsContent)}>
              <Text style={themed($advancedSettingsLabel)}>Advanced Settings</Text>
              <MaterialCommunityIcons
                name={showAdvancedSettings ? "chevron-up" : "chevron-down"}
                size={24}
                color={theme.colors.textDim}
              />
            </View>
          </TouchableOpacity>

          {showAdvancedSettings && (
            <Animated.View style={{opacity: fadeAnim}}>
              {/* Microphone Selector - moved from above */}
              {hasMicrophoneSelector && (
                <View style={themed($settingsGroup)}>
                  <Text style={[themed($settingLabel), {marginBottom: theme.spacing.sm}]}>Microphone Selection</Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingBottom: theme.spacing.xs,
                        paddingTop: theme.spacing.xs,
                      }}
                      onPress={() => setMic("phone")}>
                      <Text style={{color: theme.colors.text}}>{translate("deviceSettings:systemMic")}</Text>
                      <MaterialCommunityIcons
                        name="check"
                        size={24}
                        color={preferredMic === "phone" ? theme.colors.checkmark : "transparent"}
                      />
                    </TouchableOpacity>
                    {/* divider */}
                    <View
                      style={{
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: theme.colors.separator,
                        marginVertical: 4,
                      }}
                    />
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingTop: theme.spacing.xs,
                      }}
                      onPress={() => setMic("glasses")}>
                      <View style={{flexDirection: "column", gap: 4}}>
                        <Text style={{color: theme.colors.text}}>{translate("deviceSettings:glassesMic")}</Text>
                      </View>
                      <MaterialCommunityIcons
                        name="check"
                        size={24}
                        color={preferredMic === "glasses" ? theme.colors.checkmark : "transparent"}
                      />
                    </TouchableOpacity>
                  </View>
                )}

              {/* Spacer between sections */}
              <View style={{height: 16}} />

              {/* Device Information - moved from above */}
              {isGlassesConnected && (
                <InfoSection
                  title="Device Information"
                  items={[
                    {label: "Bluetooth Name", value: status.glasses_info?.bluetooth_name},
                    {label: "Build Number", value: status.glasses_info?.glasses_build_number},
                    {label: "Local IP Address", value: status.glasses_info?.glasses_wifi_local_ip},
                  ]}
                />
              )}
            </Animated.View>
          )}
        </>
      )}

      <View style={{height: 30}}>{/* this just gives the user a bit more space to scroll */}</View>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 12,
  width: "100%",
  minHeight: 240,
  justifyContent: "center",
  marginTop: -13, // Reduced space above component
  // backgroundColor: colors.palette.neutral200,
  backgroundColor: "transparent",
  gap: 16,
})

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
})

const $settingLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
  fontWeight: "600",
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.sm,
})

const $infoContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  padding: spacing.sm,
  marginBottom: spacing.sm,
  marginTop: spacing.sm,
})

const $infoText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 14,
  textAlign: "center",
})

const $advancedSettingsButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  paddingVertical: 14,
  paddingHorizontal: 16,
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
})

const $advancedSettingsContent: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})

const $advancedSettingsLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
  fontWeight: "600",
})

const $emptyStateContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xxl,
  minHeight: 300,
})

const $emptyStateText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.text,
  fontSize: 20,
  textAlign: "center",
  lineHeight: 28,
  fontWeight: "500",
})

const styles = StyleSheet.create({
  buttonText: {
    color: "#fff",
    fontFamily: "Montserrat-Bold",
    fontSize: 14,
    fontWeight: "bold",
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // backgroundColor moved to dynamic styling with theme
    padding: 10,
    borderRadius: 8,
    width: "80%",
  },
  connectText: {
    fontFamily: "Montserrat-Bold",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
  },
  connectedDot: {
    fontFamily: "Montserrat-Bold",
    fontSize: 14,
    marginRight: 2,
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
  connectingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // backgroundColor moved to dynamic styling with theme
    padding: 10,
    borderRadius: 8,
    width: "80%",
  },
  disabledButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // backgroundColor moved to dynamic styling with theme
    padding: 10,
    borderRadius: 8,
    width: "80%",
  },
  disabledDisconnectButton: {
    // backgroundColor moved to dynamic styling with theme
  },
  disconnectButton: {
    flexDirection: "row",
    // backgroundColor moved to dynamic styling with theme
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    justifyContent: "center",
    marginRight: 5,
    width: "40%",
  },
  disconnectText: {
    // color moved to dynamic styling with theme
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Montserrat-Regular",
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
    // backgroundColor moved to dynamic styling with theme
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
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
    fontSize: 12,
    // color moved to dynamic styling with theme
    fontWeight: "bold",
    marginRight: 5,
    maxWidth: 120,
  },
})
