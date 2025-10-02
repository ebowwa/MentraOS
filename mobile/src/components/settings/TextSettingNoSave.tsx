import {View, Platform, Pressable} from "react-native"
import {Text} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {useFocusEffect} from "expo-router"
import {useCallback} from "react"
import {textEditorStore} from "@/utils/TextEditorStore"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

type TextSettingNoSaveProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
  settingKey: string
}

const TextSettingNoSave: React.FC<TextSettingNoSaveProps> = ({label, value, onChangeText, settingKey}) => {
  const {theme} = useAppTheme()
  const {push} = useNavigationHistory()

  // Check for pending value when component gets focus
  useFocusEffect(
    useCallback(() => {
      // Only process if there's actually a pending value (meaning we just returned from text editor)
      const pendingValue = textEditorStore.getPendingValue()
      if (pendingValue && pendingValue.key === settingKey) {
        onChangeText(pendingValue.value)
        textEditorStore.setPendingValue(pendingValue.key, "") // Only clear when we use it
      } else if (pendingValue) {
        // If there's a pending value but it doesn't match, put it back
        textEditorStore.setPendingValue(pendingValue.key, pendingValue.value)
      }
    }, [settingKey]),
  )

  const handleOpenEditor = () => {
    push("/applet/text-editor", {label, value, settingKey})
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.backgroundAlt,
          borderWidth: theme.spacing.xxxs,
          borderColor: theme.colors.border,
          borderRadius: theme.borderRadius.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
        },
      ]}>
      <Text style={[styles.label, {color: theme.colors.text}]}>{label}</Text>

      <Pressable
        style={({pressed}) => [styles.button, {borderColor: theme.colors.border}, pressed && styles.buttonPressed]}
        onPress={handleOpenEditor}
        android_ripple={{color: "rgba(0, 0, 0, 0.1)"}}>
        <Text style={[styles.buttonText, {color: theme.colors.text}]} numberOfLines={2} ellipsizeMode="tail">
          {value || "Tap to edit..."}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = {
  button: {
    backgroundColor: "transparent",
    borderRadius: Platform.OS === "ios" ? 8 : 4,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: Platform.OS === "ios" ? 44 : 48,
    padding: Platform.OS === "ios" ? 12 : 10,
  },
  buttonPressed: {
    backgroundColor: Platform.OS === "ios" ? "rgba(0, 0, 0, 0.05)" : "transparent",
    opacity: Platform.OS === "ios" ? 0.8 : 1,
  },
  buttonText: {
    fontSize: 16,
  },
  container: {
    width: "100%",
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
} as const

export default TextSettingNoSave
