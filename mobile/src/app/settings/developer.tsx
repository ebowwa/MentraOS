import React, {useState, useEffect} from "react"
import {View, StyleSheet, Platform, ScrollView, TextInput} from "react-native"
import Icon from "react-native-vector-icons/MaterialCommunityIcons"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import bridge from "@/bridge/MantleBridge"
import settings, {SETTINGS_KEYS} from "@/managers/Settings"
import showAlert from "@/utils/AlertUtils"
import {useAppTheme} from "@/utils/useAppTheme"
import {Header, Screen, PillButton, Text} from "@/components/ignite"
import RouteButton from "@/components/ui/RouteButton"
import {router} from "expo-router"
import {Spacer} from "@/components/misc/Spacer"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {spacing} from "@/theme"
import {glassesFeatures} from "@/config/glassesFeatures"

export default function DeveloperSettingsScreen() {
  const {status} = useCoreStatus()
  const {theme} = useAppTheme()
  const {goBack, push} = useNavigationHistory()
  const {replace} = useNavigationHistory()
  const [customUrlInput, setCustomUrlInput] = useState("")
  const [savedCustomUrl, setSavedCustomUrl] = useState<string | null>(null)
  const [isSavingUrl, setIsSavingUrl] = useState(false)
  const [reconnectOnAppForeground, setReconnectOnAppForeground] = useState(true)
  const [showNewUi, setShowNewUi] = useState(false)
  const [powerSavingMode, setPowerSavingMode] = useState(false)

  // Triple-tap detection for Asia East button
  const [asiaButtonTapCount, setAsiaButtonTapCount] = useState(0)
  const [asiaButtonLastTapTime, setAsiaButtonLastTapTime] = useState(0)

  const toggleReconnectOnAppForeground = async () => {
    const newSetting = !reconnectOnAppForeground
    await settings.set(SETTINGS_KEYS.RECONNECT_ON_APP_FOREGROUND, newSetting)
    setReconnectOnAppForeground(newSetting)
  }

  const toggleNewUi = async () => {
    const newSetting = !showNewUi
    await settings.set(SETTINGS_KEYS.NEW_UI, newSetting)
    setShowNewUi(newSetting)
  }

  // Modified handler for Custom URL
  const handleSaveUrl = async () => {
    const urlToTest = customUrlInput.trim().replace(/\/+$/, "")

    // Basic validation
    if (!urlToTest) {
      showAlert("Empty URL", "Please enter a URL or reset to default.", [{text: "OK"}])
      return
    }

    if (!urlToTest.startsWith("http://") && !urlToTest.startsWith("https://")) {
      showAlert("Invalid URL", "Please enter a valid URL starting with http:// or https://", [{text: "OK"}])
      return
    }

    setIsSavingUrl(true) // Start loading indicator

    try {
      // Test the URL by fetching the version endpoint
      const testUrl = `${urlToTest}/apps/version`
      console.log(`Testing URL: ${testUrl}`)

      // Create an AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      try {
        const response = await fetch(testUrl, {
          method: "GET",
          signal: controller.signal,
        })

        clearTimeout(timeoutId) // Clear timeout if request completes

        // Check if the request was successful (status 200-299)
        if (response.ok) {
          const data = await response.json()
          console.log("URL Test Successful:", data)

          // Save the URL if the test passes
          await settings.set(SETTINGS_KEYS.CUSTOM_BACKEND_URL, urlToTest)
          await bridge.setServerUrl(urlToTest) // TODO: config: remove
          setSavedCustomUrl(urlToTest)

          await showAlert(
            "Success",
            "Custom backend URL saved and verified. It will be used on the next connection attempt or app restart.",
            [
              {
                text: translate("common:ok"),
                onPress: () => {
                  replace("/init")
                },
              },
            ],
          )
        } else {
          // Handle non-2xx responses as errors
          console.error(`URL Test Failed: Status ${response.status}`)
          showAlert(
            "Verification Failed",
            `The server responded, but with status ${response.status}. Please check the URL and server status.`,
            [{text: "OK"}],
          )
        }
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId) // Ensure timeout is cleared
        throw fetchError // Re-throw to be caught by outer try-catch
      }
    } catch (error: unknown) {
      // Handle network errors or timeouts
      console.error("URL Test Failed:", error instanceof Error ? error.message : "Unknown error")

      let errorMessage = "Could not connect to the specified URL. Please check the URL and your network connection."

      // Check if it's an abort error (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        errorMessage = "Connection timed out. Please check the URL and server status."
      }
      // Check for network errors
      else if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "Network error occurred. Please check your internet connection and the URL."
      }

      showAlert("Verification Failed", errorMessage, [{text: "OK"}])
    } finally {
      setIsSavingUrl(false) // Stop loading indicator
    }
  }

  const handleResetUrl = async () => {
    await settings.set(SETTINGS_KEYS.CUSTOM_BACKEND_URL, null)
    await bridge.setServerUrl("") // TODO: config: remove
    setSavedCustomUrl(null)
    setCustomUrlInput("")
    showAlert("Success", "Reset backend URL to default.", [
      {
        text: "OK",
        onPress: () => {
          replace("/init")
        },
      },
    ])
  }

  // Triple-tap handler for Asia East button
  const handleAsiaButtonPress = () => {
    const currentTime = Date.now()
    const timeDiff = currentTime - asiaButtonLastTapTime

    // Reset counter if more than 2 seconds has passed
    if (timeDiff > 2000) {
      setAsiaButtonTapCount(1)
    } else {
      setAsiaButtonTapCount(prev => prev + 1)
    }

    setAsiaButtonLastTapTime(currentTime)

    // Check for triple-tap
    if (asiaButtonTapCount + 1 >= 3) {
      setCustomUrlInput("https://devold.augmentos.org:443")
    } else {
      setCustomUrlInput("https://asiaeastapi.mentra.glass:443")
    }
  }

  // Load saved URL on mount
  useEffect(() => {
    const loadSettings = async () => {
      const url = await settings.get(SETTINGS_KEYS.CUSTOM_BACKEND_URL)
      setSavedCustomUrl(url)
      setCustomUrlInput(url || "")

      const reconnectOnAppForeground = await settings.get(SETTINGS_KEYS.RECONNECT_ON_APP_FOREGROUND)
      setReconnectOnAppForeground(reconnectOnAppForeground)

      const newUiSetting = await settings.get(SETTINGS_KEYS.NEW_UI)
      setShowNewUi(newUiSetting)

      const powerSavingMode = await settings.get(SETTINGS_KEYS.power_saving_mode)
      setPowerSavingMode(powerSavingMode)
    }
    loadSettings()
  }, [])

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title="Developer Settings" leftIcon="caretLeft" onLeftPress={() => goBack()} />

      <View
        style={[
          styles.warningContainer,
          {
            backgroundColor: theme.colors.warningBackgroundDestructive,
            borderWidth: theme.spacing.xxxs,
            borderColor: theme.colors.palette.angry600,
          },
        ]}>
        <View style={styles.warningContent}>
          <Icon name="alert" size={16} color={theme.colors.text} />
          <Text tx="warning:warning" style={[styles.warningTitle, {color: theme.colors.text}]} />
        </View>
        <Text tx="warning:developerSettingsWarning" style={[styles.warningSubtitle, {color: theme.colors.text}]} />
      </View>

      <Spacer height={theme.spacing.md} />

      <ScrollView style={{flex: 1, marginHorizontal: -theme.spacing.md, paddingHorizontal: theme.spacing.md}}>
        <RouteButton
          label="🎥 Buffer Recording Debug"
          subtitle="Control 30-second video buffer on glasses"
          onPress={() => push("/settings/buffer-debug")}
        />

        <Spacer height={theme.spacing.md} />
        <ToggleSetting
          label={translate("settings:reconnectOnAppForeground")}
          subtitle={translate("settings:reconnectOnAppForegroundSubtitle")}
          value={reconnectOnAppForeground}
          onValueChange={toggleReconnectOnAppForeground}
        />

        <Spacer height={theme.spacing.md} />

        <ToggleSetting
          label={translate("settings:newUi")}
          subtitle={translate("settings:newUiSubtitle")}
          value={showNewUi}
          onValueChange={toggleNewUi}
        />

        <Spacer height={theme.spacing.md} />

        {/* G1 Specific Settings - Only show when connected to Even Realities G1 */}
        {status.core_info.default_wearable &&
          glassesFeatures[status.core_info.default_wearable] &&
          glassesFeatures[status.core_info.default_wearable].powerSavingMode && (
            <>
              <Text style={[styles.sectionTitle, {color: theme.colors.textDim}]}>G1 Specific Settings</Text>
              <ToggleSetting
                label={translate("settings:powerSavingMode")}
                subtitle={translate("settings:powerSavingModeSubtitle")}
                value={powerSavingMode}
                onValueChange={async value => {
                  setPowerSavingMode(value)
                  await bridge.sendTogglePowerSavingMode(value)
                }}
              />
              <Spacer height={theme.spacing.md} />
            </>
          )}

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
            <Text style={[styles.label, {color: theme.colors.text}]}>Custom Backend URL</Text>
            <Text style={[styles.value, {color: theme.colors.textDim}]}>
              Override the default backend server URL. Leave blank to use default.
              {savedCustomUrl && `\nCurrently using: ${savedCustomUrl}`}
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
              placeholder="e.g., http://192.168.1.100:7002"
              placeholderTextColor={theme.colors.textDim}
              value={customUrlInput}
              onChangeText={setCustomUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isSavingUrl}
            />
            <View style={styles.buttonRow}>
              <PillButton
                text={isSavingUrl ? "Testing..." : "Save & Test URL"}
                variant="primary"
                onPress={handleSaveUrl}
                disabled={isSavingUrl}
                buttonStyle={styles.saveButton}
              />
              <PillButton
                tx="common:reset"
                variant="icon"
                onPress={handleResetUrl}
                disabled={isSavingUrl}
                buttonStyle={styles.resetButton}
              />
            </View>
            <View style={styles.buttonColumn}>
              <PillButton
                tx="developer:global"
                variant="icon"
                onPress={() => setCustomUrlInput("https://api.mentra.glass:443")}
                buttonStyle={styles.button}
              />
              <PillButton
                tx="developer:dev"
                variant="icon"
                onPress={() => setCustomUrlInput("https://devapi.mentra.glass:443")}
                buttonStyle={styles.button}
              />
            </View>
            <View style={styles.buttonColumn}>
              <PillButton
                tx="developer:debug"
                variant="icon"
                onPress={() => setCustomUrlInput("https://debug.augmentos.cloud:443")}
                buttonStyle={styles.button}
              />
              <PillButton
                tx="developer:usCentral"
                variant="icon"
                onPress={() => setCustomUrlInput("https://uscentralapi.mentra.glass:443")}
                buttonStyle={styles.button}
              />
            </View>
            <View style={styles.buttonColumn}>
              <PillButton
                tx="developer:france"
                variant="icon"
                onPress={() => setCustomUrlInput("https://franceapi.mentra.glass:443")}
                buttonStyle={styles.button}
              />
              <PillButton
                tx="developer:asiaEast"
                variant="icon"
                onPress={handleAsiaButtonPress}
                buttonStyle={styles.button}
              />
            </View>
          </View>
        </View>

        <Spacer height={theme.spacing.md} />
        <Spacer height={theme.spacing.xxl} />
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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
})
