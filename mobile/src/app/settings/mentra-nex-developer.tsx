import React, {useState, useEffect} from "react"
import {View, Text, StyleSheet, Switch, TouchableOpacity, Platform, ScrollView, TextInput} from "react-native"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import coreCommunicator from "@/bridge/CoreCommunicator"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {saveSetting, loadSetting} from "@/utils/SettingsHelper"
import {MOCK_CONNECTION, SETTINGS_KEYS} from "@/consts"
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
  const {theme} = useAppTheme()
  const {goBack, push} = useNavigationHistory()
  // State for custom URL management
  const [text, setText] = useState("Hello World")
  const [positionX, setPositionX] = useState("0")
  const [positionY, setPositionY] = useState("0")
  const [size, setSize] = useState("20")
  const [commandSender, setCommandSender] = useState<object | null>(null)
  const [commandReceiver, setCommandReceiver] = useState<object | null>(null)
  useEffect(() => {
    const handleCommandFromSender = (sender: object) => {
      console.log("handleCommandFromSender:", sender)
      setCommandSender(sender)
    }

    const handleCommandFromReceiver = (receiver: object) => {
      console.log("handleCommandFromReceiver:", receiver)
      setCommandReceiver(receiver)
    }

    if (!MOCK_CONNECTION) {
      GlobalEventEmitter.on("send_command_to_ble", handleCommandFromSender)
      GlobalEventEmitter.on("receive_command_from_ble", handleCommandFromReceiver)
    }

    return () => {
      if (!MOCK_CONNECTION) {
        GlobalEventEmitter.removeListener("send_command_to_ble", handleCommandFromSender)
        GlobalEventEmitter.removeListener("receive_command_from_ble", handleCommandFromReceiver)
      }
    }
  }, [])

  // Modified handler for Custom URL
  const onSendTextClick = async () => {
    if (status.core_info.puck_connected && status.glasses_info?.model_name) {
      if (text === "" || positionX === null || positionY === null || size === null) {
        showAlert("Please fill all the fields", "Please fill all the fields", [
          {
            text: "OK",
            onPress: () => {},
          },
        ])
        return
      }
      await coreCommunicator.sendDisplayText(text, parseInt(positionX, 0), parseInt(positionY, 0), parseInt(size, 10))
    } else {
      showAlert("Please connect to the device", "Please connect to the device", [
        {
          text: "OK",
          onPress: () => {},
        },
      ])
      return
    }
  }

  const onRestTextClick = async () => {
    setText("Hello World")
    setPositionX("0")
    setPositionY("0")
    setSize("20")
  }

  const onSendImageClick = async () => {
    if (status.core_info.puck_connected && status.glasses_info?.model_name) {
      await coreCommunicator.sendDisplayImage("test_image.png")
    } else {
      showAlert("Please connect to the device", "Please connect to the device", [
        {
          text: "OK",
          onPress: () => {},
        },
      ])
      return
    }
  }

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
      <Header title="BLE Test for Mentra Nex" leftIcon="caretLeft" onLeftPress={() => goBack()} />
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
              value={text}
              onChangeText={setText}
              maxLength={100}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={true}
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
                value={positionX}
                onChangeText={setPositionX}
                autoCapitalize="none"
                maxLength={3}
                autoCorrect={false}
                keyboardType="phone-pad"
                editable={true}
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
                value={positionY}
                maxLength={3}
                onChangeText={setPositionY}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="phone-pad"
                editable={true}
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
                value={size}
                onChangeText={setSize}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={2}
                keyboardType="phone-pad"
                editable={true}
              />
            </View>
            <View style={styles.buttonRow}>
              <PillButton
                text="Send Text"
                variant="primary"
                onPress={onSendTextClick}
                disabled={false}
                buttonStyle={styles.saveButton}
              />
              <PillButton
                text="Reset Settings"
                variant="icon"
                onPress={onRestTextClick}
                disabled={false}
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
            <Text style={[styles.label, {color: theme.colors.text}]}>Send the testing image to BLE</Text>

            <View style={styles.buttonRow}>
              <PillButton
                text="Send Image"
                variant="primary"
                onPress={onSendImageClick}
                disabled={false}
                buttonStyle={styles.saveButton}
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
            <Text style={[styles.label, {color: theme.colors.text}]}>Send Command to BLE</Text>

            <Text style={[styles.value, {color: theme.colors.textDim}]}>Command:{commandSender?.command ?? ""}</Text>
            <Text style={[styles.value, {color: theme.colors.textDim}]}>HEX:{commandSender?.commandText ?? ""}</Text>
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
            <Text style={[styles.label, {color: theme.colors.text}]}>Received Command from BLE</Text>
            <Text style={[styles.value, {color: theme.colors.textDim}]}>Command: {commandReceiver?.command ?? ""}</Text>
            <Text style={[styles.value, {color: theme.colors.textDim}]}>HEX: {commandReceiver?.commandText ?? ""}</Text>
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
