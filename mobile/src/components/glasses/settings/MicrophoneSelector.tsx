import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {View, TouchableOpacity, TextStyle, ViewStyle} from "react-native"
import {translate} from "@/i18n/translate"

interface MicrophoneSelectorProps {
  preferredMic: string
  onMicChange: (mic: string) => void
}

export function MicrophoneSelector({preferredMic, onMicChange}: MicrophoneSelectorProps) {
  const {theme, themed} = useAppTheme()

  return (
    <View style={themed($container)}>
      <Text tx="deviceSettings:microphoneSelection" style={[themed($label), {marginBottom: theme.spacing.sm}]} />

      <TouchableOpacity
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: theme.spacing.xs,
          paddingTop: theme.spacing.xs,
        }}
        onPress={() => onMicChange("phone")}>
        <View style={{flexDirection: "row", alignItems: "center", gap: 8}}>
          <Text style={{color: theme.colors.text}}>{translate("deviceSettings:systemMic")}</Text>
          <View
            style={{
              backgroundColor: theme.colors.primary + "20",
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
            }}>
            <Text
              tx="deviceSettings:recommended"
              style={{color: theme.colors.primary, fontSize: 11, fontWeight: "600"}}
            />
          </View>
        </View>
        {preferredMic === "phone" && <MaterialCommunityIcons name="check" size={24} color={theme.colors.primary} />}
      </TouchableOpacity>

      <View
        style={{
          height: 1,
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
        onPress={() => onMicChange("glasses")}>
        <View style={{flexDirection: "column", gap: 4}}>
          <Text tx="deviceSettings:glassesMic" style={{color: theme.colors.text}} />
        </View>
        {preferredMic === "glasses" && <MaterialCommunityIcons name="check" size={24} color={theme.colors.primary} />}
      </TouchableOpacity>
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundAlt,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
  fontSize: 16,
  fontWeight: "600",
})
