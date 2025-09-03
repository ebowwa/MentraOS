import React, {useState} from "react"
import {View, TextInput, ScrollView, TextStyle, ViewStyle, KeyboardAvoidingView, Platform} from "react-native"
import {Header, Screen} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {translate} from "@/i18n"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import ActionButton from "@/components/ui/ActionButton"
import showAlert from "@/utils/AlertUtils"
import BackendServerComms from "@/bridge/BackendServerComms"

export default function FeedbackPage() {
  const [feedbackText, setFeedbackText] = useState("")
  const {goBack} = useNavigationHistory()
  const {theme, themed} = useAppTheme()

  const handleSubmitFeedback = async (feedbackBody: string) => {
    console.log("Feedback submitted:", feedbackBody)

    try {
      await BackendServerComms.getInstance().sendFeedback(feedbackBody)

      showAlert(translate("feedback:thankYou"), translate("feedback:feedbackReceived"), [
        {
          text: translate("common:ok"),
          onPress: () => {
            setFeedbackText("")
            goBack()
          },
        },
      ])
    } catch (error) {
      console.error("Error sending feedback:", error)
      showAlert(translate("common:error"), translate("feedback:errorSendingFeedback"), [
        {
          text: translate("common:ok"),
          onPress: () => {
            goBack()
          },
        },
      ])
    }
  }

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title={translate("feedback:giveFeedback")} leftIcon="caretLeft" onLeftPress={goBack} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex: 1}}>
        <ScrollView contentContainerStyle={themed($scrollContainer)} keyboardShouldPersistTaps="handled">
          <View style={themed($container)}>
            <TextInput
              style={themed($textInput)}
              multiline
              numberOfLines={10}
              placeholder={translate("feedback:shareYourThoughts")}
              placeholderTextColor={theme.colors.textDim}
              value={feedbackText}
              onChangeText={setFeedbackText}
              textAlignVertical="top"
            />

            <ActionButton
              label={translate("feedback:submitFeedback")}
              variant="default"
              onPress={() => handleSubmitFeedback(feedbackText)}
              disabled={!feedbackText.trim()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const $container: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flex: 1,
  gap: spacing.lg,
})

const $scrollContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexGrow: 1,
  paddingVertical: spacing.md,
})

const $textInput: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: spacing.sm,
  padding: spacing.md,
  fontSize: 16,
  color: colors.text,
  minHeight: 200,
  maxHeight: 400,
})
