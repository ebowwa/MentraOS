import React, {useState, useEffect} from "react"
import {View, Text, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity} from "react-native"
import {useLocalSearchParams, router} from "expo-router"
import {Screen, Icon, Header, Checkbox} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import ActionButton from "@/components/ui/ActionButton"
import WifiCredentialsService from "@/utils/WifiCredentialsService"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {ScrollView} from "react-native"

export default function WifiPasswordScreen() {
  const params = useLocalSearchParams()
  const deviceModel = (params.deviceModel as string) || "Glasses"
  const initialSsid = (params.ssid as string) || ""

  const {theme, themed} = useAppTheme()
  const {push, goBack} = useNavigationHistory()
  const [ssid, setSsid] = useState(initialSsid)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberPassword, setRememberPassword] = useState(false)
  const [hasSavedPassword, setHasSavedPassword] = useState(false)

  // Load saved password when component mounts
  useEffect(() => {
    if (initialSsid) {
      const savedPassword = WifiCredentialsService.getPassword(initialSsid)
      if (savedPassword) {
        setPassword(savedPassword)
        setHasSavedPassword(true)
        setRememberPassword(true) // Check the box if there's a saved password
      }
    }
  }, [initialSsid])

  // Handle checkbox state changes - immediately remove saved password when unchecked
  useEffect(() => {
    console.log("321321 rememberPassword", rememberPassword)
    console.log("321321 initialSsid", initialSsid)
    if (!rememberPassword && initialSsid) {
      // Remove saved credentials immediately when checkbox is unchecked
      WifiCredentialsService.removeCredentials(initialSsid)
      setHasSavedPassword(false)
      console.log("$%^&*()_321321 removed credentials")
    }
  }, [rememberPassword, initialSsid])

  const handleConnect = async () => {
    if (!ssid) {
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: "Please enter a network name",
        type: "error",
      })
      return
    }

    // Handle password saving based on checkbox state
    if (rememberPassword && password) {
      // Save credentials if checkbox is checked
      await WifiCredentialsService.saveCredentials(ssid, password, true)
    } else if (!rememberPassword) {
      // Remove saved credentials if checkbox is unchecked
      await WifiCredentialsService.removeCredentials(ssid)
    }

    // Navigate to connecting screen with credentials
    router.push({
      pathname: "/pairing/glasseswifisetup/connecting",
      params: {
        deviceModel,
        ssid,
        password,
        rememberPassword: rememberPassword.toString(),
      },
    })
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <Header title="Enter Glasses WiFi Details" leftIcon="caretLeft" onLeftPress={() => goBack()} />
      <ScrollView
        style={{marginBottom: 20, marginTop: 10, marginRight: -theme.spacing.md, paddingRight: theme.spacing.md}}>
        <View style={themed($content)}>
          <View style={themed($inputContainer)}>
            <Text style={themed($label)}>Network Name (SSID)</Text>
            <TextInput
              style={themed($input)}
              value={ssid}
              onChangeText={setSsid}
              placeholder="Enter network name"
              placeholderTextColor={theme.colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!initialSsid} // Only editable if manually entering
            />
          </View>

          <View style={themed($inputContainer)}>
            <Text style={themed($label)}>Password</Text>
            <View style={themed($passwordContainer)}>
              <TextInput
                style={themed($passwordInput)}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={theme.colors.textDim}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={themed($eyeButton)}>
                <Icon icon={showPassword ? "view" : "hidden"} size={20} color={theme.colors.textDim} />
              </TouchableOpacity>
            </View>
            {hasSavedPassword && (
              <Text style={themed($savedPasswordText)}>✓ Password loaded from saved credentials</Text>
            )}
          </View>

          <View style={themed($checkboxContainer)}>
            <Checkbox value={rememberPassword} onValueChange={setRememberPassword} />
            <View style={themed($checkboxContent)}>
              <Text style={themed($checkboxLabel)}>Remember Password</Text>
              <Text style={themed($checkboxDescription)}>Save this password for future connections</Text>
            </View>
          </View>

          <View style={themed($buttonContainer)}>
            <ActionButton label="Connect" onPress={handleConnect} />

            <ActionButton label="Cancel" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  paddingHorizontal: spacing.lg,
})

const $inputContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.lg,
})

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  fontWeight: "500",
  color: colors.text,
  marginBottom: spacing.xs,
})

const $input: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  height: 50,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.xs,
  padding: spacing.sm,
  fontSize: 16,
  color: colors.text,
  backgroundColor: colors.background,
})

const $passwordContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  position: "relative",
})

const $passwordInput: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flex: 1,
  height: 50,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.xs,
  padding: spacing.sm,
  paddingRight: 50,
  fontSize: 16,
  color: colors.text,
  backgroundColor: colors.background,
})

const $eyeButton: ThemedStyle<ViewStyle> = ({spacing}) => ({
  position: "absolute",
  right: spacing.sm,
  height: 50,
  width: 40,
  justifyContent: "center",
  alignItems: "center",
})

const $savedPasswordText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.tint,
  marginTop: spacing.xs,
  fontStyle: "italic",
})

const $checkboxContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  marginBottom: spacing.lg,
  paddingVertical: spacing.sm,
})

const $checkboxContent: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  marginLeft: spacing.sm,
})

const $checkboxLabel: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  fontWeight: "500",
  color: colors.text,
  marginBottom: spacing.xs,
})

const $checkboxDescription: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  color: colors.textDim,
})

const $buttonContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginTop: spacing.xl,
  gap: spacing.md,
})
