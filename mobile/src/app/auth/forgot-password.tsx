import {useState} from "react"
import {View, TextInput, ActivityIndicator, ScrollView, ViewStyle, TextStyle} from "react-native"
import {supabase} from "@/supabase/supabaseClient"
import {Button, Header, Screen, Text} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle, spacing} from "@/theme"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import showAlert from "@/utils/AlertUtils"
import {FontAwesome} from "@expo/vector-icons"
import {Spacer} from "@/components/misc/Spacer"
import Toast from "react-native-toast-message"

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const {goBack} = useNavigationHistory()
  const {theme, themed} = useAppTheme()

  const isEmailValid = email.includes("@") && email.includes(".")

  const handleSendResetEmail = async () => {
    if (!isEmailValid) {
      showAlert(translate("common:error"), translate("login:invalidEmail"), [{text: "OK"}])
      return
    }

    setIsLoading(true)

    try {
      const {error} = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "com.mentra://auth/reset-password",
      })

      if (error) {
        showAlert(translate("common:error"), error.message)
      } else {
        Toast.show({
          type: "success",
          text1: translate("login:resetEmailSent"),
          text2: translate("login:checkEmailForReset"),
          position: "bottom",
          visibilityTime: 5000,
        })
        // Navigate back to login screen after showing success message
        setTimeout(() => {
          goBack()
        }, 2000)
      }
    } catch (err) {
      console.error("Error sending reset email:", err)
      showAlert(translate("common:error"), err.toString())
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title={translate("login:forgotPasswordTitle")} leftIcon="caretLeft" onLeftPress={goBack} />
      <ScrollView
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={themed($card)}>
          <Text tx="login:forgotPasswordSubtitle" style={themed($subtitle)} />

          <View style={themed($form)}>
            <View style={themed($inputGroup)}>
              <Text tx="login:email" style={themed($inputLabel)} />
              <View style={themed($enhancedInputContainer)}>
                <FontAwesome name="envelope" size={16} color={theme.colors.textDim} />
                <Spacer width={spacing.sm} />
                <TextInput
                  hitSlop={{top: 16, bottom: 16}}
                  style={themed($enhancedInput)}
                  placeholder={translate("login:emailPlaceholder")}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={theme.colors.textDim}
                  autoFocus={true}
                />
              </View>
            </View>

            <Spacer height={spacing.lg} />

            <Button
              tx="login:sendResetEmail"
              style={themed($primaryButton)}
              pressedStyle={themed($pressedButton)}
              textStyle={themed($buttonText)}
              onPress={handleSendResetEmail}
              disabled={!isEmailValid || isLoading}
              LeftAccessory={() =>
                isLoading && <ActivityIndicator size="small" color={theme.colors.icon} style={{marginRight: 8}} />
              }
            />

            <Spacer height={spacing.md} />

            <Text tx="login:rememberPassword" style={themed($helperText)} />
            <Button
              tx="login:backToLogin"
              style={themed($secondaryButton)}
              textStyle={themed($secondaryButtonText)}
              onPress={goBack}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

// Themed Styles - matching login and change-password screens
const $scrollContent: ThemedStyle<ViewStyle> = () => ({
  flexGrow: 1,
})

const $card: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  padding: spacing.lg,
})

const $subtitle: ThemedStyle<TextStyle> = ({spacing, colors}) => ({
  fontSize: 16,
  color: colors.text,
  textAlign: "left",
  marginBottom: spacing.lg,
  lineHeight: 22,
})

const $form: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
})

const $inputGroup: ThemedStyle<ViewStyle> = ({spacing}) => ({
  marginBottom: spacing.sm,
})

const $inputLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "500",
  color: colors.text,
  marginBottom: 8,
})

const $enhancedInputContainer: ThemedStyle<ViewStyle> = ({colors, spacing, isDark}) => ({
  flexDirection: "row",
  alignItems: "center",
  height: 48,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingHorizontal: spacing.sm,
  backgroundColor: isDark ? colors.transparent : colors.background,
  ...(isDark
    ? {
        shadowOffset: {
          width: 0,
          height: 1,
        },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      }
    : {}),
})

const $enhancedInput: ThemedStyle<TextStyle> = ({colors}) => ({
  flex: 1,
  fontSize: 16,
  color: colors.text,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({})

const $pressedButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.buttonPressed,
  opacity: 0.9,
})

const $buttonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textAlt,
  fontSize: 16,
  fontWeight: "bold",
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.transparent,
  borderWidth: 0,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.tint,
  fontSize: 14,
  textDecorationLine: "underline",
})

const $helperText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 14,
  color: colors.textDim,
  textAlign: "center",
  marginBottom: spacing.xs,
})
