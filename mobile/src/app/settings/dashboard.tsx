import React, {useState, useEffect} from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  ViewStyle,
  TextStyle,
  ScrollView,
} from "react-native"

import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import bridge from "@/bridge/MantleBridge"
import HeadUpAngleComponent from "@/components/misc/HeadUpAngleComponent"
import {Header} from "@/components/ignite"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {Screen} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {translate} from "@/i18n/translate"
import {Spacer} from "@/components/misc/Spacer"
import RouteButton from "@/components/ui/RouteButton"
import {glassesFeatures} from "@/config/glassesFeatures"
import {useSettings, useSettingsStore, SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function DashboardSettingsScreen() {
  const {status} = useCoreStatus()
  const {themed, theme} = useAppTheme()
  const {goBack, push} = useNavigationHistory()
  const [headUpAngleComponentVisible, setHeadUpAngleComponentVisible] = useState(false)
  const [defaultWearable, setDefaultWearable] = useSetting(SETTINGS_KEYS.default_wearable)
  const [headUpAngle, setHeadUpAngle] = useSetting(SETTINGS_KEYS.head_up_angle)
  const [contextualDashboardEnabled, setContextualDashboardEnabled] = useSetting(
    SETTINGS_KEYS.contextual_dashboard_enabled,
  )
  const [metricSystemEnabled, setMetricSystemEnabled] = useSetting(SETTINGS_KEYS.metric_system_enabled)

  // -- Handlers --
  const toggleContextualDashboard = async () => {
    const newVal = !contextualDashboardEnabled
    await setContextualDashboardEnabled(newVal)
    await bridge.sendToggleContextualDashboard(newVal) // TODO: config: remove
  }

  const toggleMetricSystem = async () => {
    const newVal = !metricSystemEnabled
    try {
      await setMetricSystemEnabled(newVal)
      await bridge.sendSetMetricSystemEnabled(newVal) // TODO: config: remove
    } catch (error) {
      console.error("Error toggling metric system:", error)
    }
  }

  const onSaveHeadUpAngle = async (newHeadUpAngle: number) => {
    if (!status.glasses_info) {
      Alert.alert("Glasses not connected", "Please connect your smart glasses first.")
      return
    }
    if (newHeadUpAngle == null) {
      return
    }

    setHeadUpAngleComponentVisible(false)
    await bridge.setGlassesHeadUpAngle(newHeadUpAngle) // TODO: config: remove
    await setHeadUpAngle(newHeadUpAngle)
  }

  const onCancelHeadUpAngle = () => {
    setHeadUpAngleComponentVisible(false)
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header titleTx="settings:dashboardSettings" leftIcon="caretLeft" onLeftPress={goBack} />
      <ScrollView>
        {/* <Text style={themed($sectionTitle)}>General Settings</Text> */}
        {/* <View style={themed($settingItem)}>
        <View style={themed($settingTextContainer)}>
          <Text style={themed($label)}>Contextual Dashboard</Text>
          {status.glasses_info?.model_name && (
            <Text style={themed($value)}>
              {`Show a summary of your phone notifications when you ${
                status.glasses_info?.model_name.toLowerCase().includes("even") ? "look up" : "tap your smart glasses"
              }.`}
            </Text>
          )}
        </View>
        <Switch
          value={isContextualDashboardEnabled}
          onValueChange={toggleContextualDashboard}
          trackColor={switchColors.trackColor}
          thumbColor={switchColors.thumbColor}
          ios_backgroundColor={switchColors.ios_backgroundColor}
        />
      </View> */}

        <ToggleSetting
          label={translate("settings:contextualDashboardLabel")}
          subtitle={translate("settings:contextualDashboardSubtitle")}
          value={contextualDashboardEnabled}
          onValueChange={toggleContextualDashboard}
        />

        <Spacer height={theme.spacing.md} />

        <ToggleSetting
          label={translate("settings:metricSystemLabel")}
          subtitle={translate("settings:metricSystemSubtitle")}
          value={metricSystemEnabled}
          onValueChange={toggleMetricSystem}
        />

        <Spacer height={theme.spacing.md} />

        {/* Dashboard Content Selection */}
        {/* <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Content Settings
          </Text>
          <TouchableOpacity
            style={[styles.settingItem, styles.elevatedCard]}
            onPress={() => !isLoading && setShowContentPicker(true)}
            disabled={isLoading}
          >
            <View style={styles.settingTextContainer}>
              <Text style={styles.label}>
                Dashboard Content
              </Text>
              <Text style={styles.value}>
                Choose what additional content to display in your dashboard along with your notifications.
              </Text>
            </View>
            <View style={styles.selectedValueContainer}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <>
                  <Text style={styles.selectedValue}>
                    {dashboardContentOptions.find(opt => opt.value === dashboardContent)?.label}
                  </Text>
                  <Icon name="chevron-right" size={16} color="#000000" />
                </>
              )}
            </View>
            {isUpdating && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            )}
          </TouchableOpacity>
        </View> */}
        {defaultWearable && glassesFeatures[defaultWearable]?.imu && (
          <RouteButton
            label={translate("settings:adjustHeadAngleLabel")}
            subtitle={translate("settings:adjustHeadAngleSubtitle")}
            onPress={() => setHeadUpAngleComponentVisible(true)}
          />
        )}

        {headUpAngle !== null && (
          <HeadUpAngleComponent
            visible={headUpAngleComponentVisible}
            initialAngle={headUpAngle}
            onCancel={onCancelHeadUpAngle}
            onSave={onSaveHeadUpAngle}
          />
        )}
      </ScrollView>
    </Screen>
  )
}

const $sectionTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 18,
  marginBottom: 8,
  marginTop: 20,
})

const $modalOverlay: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: colors.modalOverlay,
})

const $pickerContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: "90%",
  maxHeight: "80%",
  borderRadius: 16,
  overflow: "hidden",
})

const $pickerHeader: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  padding: 16,
  borderBottomWidth: 1,
})

const $pickerTitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 20,
  fontWeight: "600",
  color: colors.text,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $value: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
})

// settingItem: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     padding: 16,
//   },
//   settingTextContainer: {
//     flex: 1,
//     paddingRight: 12,
//   },

const $settingItem: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  padding: 16,
  borderRadius: 12,
  marginBottom: 12,
  backgroundColor: colors.background,
})

const $settingTextContainer: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  paddingRight: 12,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    // backgroundColor moved to dynamic styling
  },
  header: {
    borderBottomWidth: 1,
    padding: 20,
    paddingTop: 10,
    // borderBottomColor moved to dynamic styling
  },
  headerTitle: {
    fontFamily: "Montserrat-Bold",
    fontSize: 28,
    fontWeight: "bold",
    // color moved to dynamic styling
  },
  scrollViewContainer: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    marginLeft: 4,
    // color moved to dynamic styling
  },
  elevatedCard: {
    borderRadius: 12,
    marginBottom: 12,
    // backgroundColor moved to dynamic styling
    ...Platform.select({
      ios: {
        shadowColor: "#000", // Shadow color is universal
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  settingItem: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  settingTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
    // color moved to dynamic styling
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    // color moved to dynamic styling
  },
  selectedValueContainer: {
    alignItems: "center",
    flexDirection: "row",
  },
  selectedValue: {
    fontSize: 16,
    marginRight: 4,
    // color moved to dynamic styling
  },
  // modalOverlay, pickerContainer, pickerHeader moved to ThemedStyle

  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    // color moved to dynamic styling
  },
  pickerOptionsContainer: {
    maxHeight: 400,
  },
  pickerOption: {
    borderBottomWidth: 1,
    padding: 16,
    // borderBottomColor moved to dynamic styling
  },
  optionContent: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pickerOptionText: {
    flex: 1,
    fontSize: 16,
    // color moved to dynamic styling
  },
  selectedOption: {
    // backgroundColor moved to dynamic styling
  },
  selectedOptionText: {
    // color moved to dynamic styling
  },
  disabledItem: {
    opacity: 0.5,
  },
  loadingOverlay: {
    alignItems: "center",
    borderRadius: 12,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    // backgroundColor moved to dynamic styling
  },
  // pickerTitle moved to ThemedStyle
  disabledButton: {
    opacity: 0.5,
  },
})
