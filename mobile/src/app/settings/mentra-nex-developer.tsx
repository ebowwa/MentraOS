import React, {useState, useEffect} from "react"
import {View, Text, StyleSheet, Switch, TouchableOpacity, Platform, ScrollView, TextInput} from "react-native"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {useStatus} from "@/contexts/AugmentOSStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import {saveSetting, loadSetting} from "@/utils/SettingsHelper"
import {SETTINGS_KEYS} from "@/consts"
import axios from "axios"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {Header, Screen, PillButton} from "@/components/ignite"
import {router} from "expo-router"
import {Spacer} from "@/components/misc/Spacer"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {spacing} from "@/theme"

export default function MentraNexDeveloperSettingsScreen() {
  const {status} = useStatus()
  const [isBypassVADForDebuggingEnabled, setIsBypassVADForDebuggingEnabled] = useState(
    status.core_info.bypass_vad_for_debugging,
  )

  const {theme} = useAppTheme()
  const {goBack, push} = useNavigationHistory()
  // State for custom URL management
  const [customUrlInput, setCustomUrlInput] = useState("")
  const [positionX, setPositionX] = useState(0)
  const [positionY, setPositionY] = useState(0)
  const [savedCustomUrl, setSavedCustomUrl] = useState<string | null>(null)
  const [isSavingUrl, setIsSavingUrl] = useState(false) // Add loading state
  const [reconnectOnAppForeground, setReconnectOnAppForeground] = useState(true)
  const {replace} = useNavigationHistory()

  // Load saved URL on mount
  useEffect(() => {
    const loadSettings = async () => {
      const url = await loadSetting(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
      setSavedCustomUrl(url)
      setCustomUrlInput(url || "")

      const reconnectOnAppForeground = await loadSetting(SETTINGS_KEYS.RECONNECT_ON_APP_FOREGROUND, true)
      setReconnectOnAppForeground(reconnectOnAppForeground)
    }
    loadSettings()
  }, [])

  useEffect(() => {
    setIsBypassVADForDebuggingEnabled(status.core_info.bypass_vad_for_debugging)
  }, [status.core_info.bypass_vad_for_debugging])

  // Modified handler for Custom URL
  const onSendTextClick = async () => {}

  const onRestTextClick = async () => {}

  const onSendImageClick = async () => {}

  const switchColors = {
    trackColor: {
      false: theme.colors.switchTrackOff,
      true: theme.colors.switchTrackOn,
    },
    thumbColor: Platform.OS === "ios" ? undefined : theme.colors.switchThumb,
    ios_backgroundColor: theme.colors.switchTrackOff,
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title="Developer Settings for Mentra Nex" leftIcon="caretLeft" onLeftPress={() => goBack()} />
      <ScrollView>
        <View
          style={[
            styles.settingContainer,
            {
              backgroundColor: theme.colors.background,
              borderWidth: theme.spacing.xxxs,
              borderColor: theme.colors.border,
            },
          ]}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.label, {color: theme.colors.text}]}>Custom Display Text Settings</Text>
            <Text style={[styles.value, {color: theme.colors.textDim}]}>
              Set the display text for the Mentra Nex with text,x,y and size
            </Text>

            <TextInput
              style={[
                styles.urlInput,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.inputBorderHighlight,
                  color: theme.colors.text,
                },
              ]}
              placeholder="text"
              placeholderTextColor={theme.colors.textDim}
              value={customUrlInput}
              onChangeText={setCustomUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isSavingUrl}
            />
            <View style={styles.rowContainer}>
              <TextInput
                style={[
                  styles.urlInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.inputBorderHighlight,
                    color: theme.colors.text,
                    width: "30%",
                  },
                ]}
                placeholder="x"
                placeholderTextColor={theme.colors.textDim}
                value={customUrlInput}
                onChangeText={setCustomUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numeric"
                editable={!isSavingUrl}
              />
              <TextInput
                style={[
                  styles.urlInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.inputBorderHighlight,
                    color: theme.colors.text,
                    width: "30%",
                  },
                ]}
                placeholder="y"
                placeholderTextColor={theme.colors.textDim}
                value={customUrlInput}
                onChangeText={setCustomUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numeric"
                editable={!isSavingUrl}
              />
              <TextInput
                style={[
                  styles.urlInput,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.inputBorderHighlight,
                    color: theme.colors.text,
                    width: "30%",
                  },
                ]}
                placeholder="size"
                placeholderTextColor={theme.colors.textDim}
                value={customUrlInput}
                onChangeText={setCustomUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numeric"
                editable={!isSavingUrl}
              />
            </View>
            <View style={styles.buttonRow}>
              <PillButton
                text="Send Text"
                variant="primary"
                onPress={onSendTextClick}
                disabled={isSavingUrl}
                buttonStyle={styles.saveButton}
              />
              <PillButton
                text="Reset Settings"
                variant="icon"
                onPress={onRestTextClick}
                disabled={isSavingUrl}
                buttonStyle={styles.resetButton}
              />
            </View>
          </View>
        </View>

        <Spacer height={theme.spacing.md} />
        <View
          style={[
            styles.settingContainer,
            {
              backgroundColor: theme.colors.background,
              borderWidth: theme.spacing.xxxs,
              borderColor: theme.colors.border,
            },
          ]}>
          <View style={styles.settingTextContainer}>
            <Text style={[styles.label, {color: theme.colors.text}]}>Send the testing image to Firmware</Text>

            <View style={styles.buttonRow}>
              <PillButton
                text="Send Image"
                variant="primary"
                onPress={onSendImageClick}
                disabled={isSavingUrl}
                buttonStyle={styles.saveButton}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  warningContainer: {
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  warningContent: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 4,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 6,
  },
  warningSubtitle: {
    fontSize: 14,
    marginLeft: 22,
  },
  settingContainer: {
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  button: {
    flexShrink: 1,
  },
  buttonColumn: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 12,
  },
  buttonColumnCentered: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    marginTop: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  label: {
    flexWrap: "wrap",
    fontSize: 16,
  },
  value: {
    flexWrap: "wrap",
    fontSize: 12,
    marginTop: 5,
  },
  // New styles for custom URL section
  urlInput: {
    borderWidth: 1,
    borderRadius: 12, // Consistent border radius
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 10,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  saveButton: {
    flex: 1,
    marginRight: 10,
  },
  resetButton: {
    flex: 1,
  },

  rowContainer: {
    flexDirection: "row",
    gap: 10, // Space between inputs
  },
  halfWidth: {
    flex: 1, // Each takes up equal space
  },
})
