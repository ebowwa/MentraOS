import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {View, TouchableOpacity, TextStyle, ViewStyle} from "react-native"
import {translate} from "@/i18n/translate"

interface MicrophoneSelectorProps {
  preferredMic: string
  onMicChange: (mic: string) => void
  glassesConnected?: boolean
  glassesHasMic?: boolean
}

type MicOption = {
  value: string
  titleKey: string
  descriptionKey: string
  recommended?: boolean
  requiresGlasses?: boolean
}

const micOptions: MicOption[] = [
  {
    value: "automatic",
    titleKey: "deviceSettings:micAutomatic",
    descriptionKey: "deviceSettings:micAutomaticDesc",
    recommended: true,
  },
  {
    value: "phone_auto_switch",
    titleKey: "deviceSettings:micPhoneAutoSwitch",
    descriptionKey: "deviceSettings:micPhoneAutoSwitchDesc",
  },
  {
    value: "glasses_only",
    titleKey: "deviceSettings:micGlassesOnly",
    descriptionKey: "deviceSettings:micGlassesOnlyDesc",
    requiresGlasses: true,
  },
  {
    value: "bluetooth_mic",
    titleKey: "deviceSettings:micBluetoothMic",
    descriptionKey: "deviceSettings:micBluetoothMicDesc",
  },
]

export function MicrophoneSelector({preferredMic, onMicChange, glassesConnected}: MicrophoneSelectorProps) {
  const {theme, themed} = useAppTheme()

  // Normalize legacy values
  const normalizedMic =
    preferredMic === "phone" ? "phone_auto_switch" : preferredMic === "glasses" ? "glasses_only" : preferredMic

  return (
    <View style={themed($container)}>
      <Text tx="deviceSettings:microphoneSelection" style={[themed($label), {marginBottom: theme.spacing.sm}]} />

      {micOptions.map((option, index) => {
        const isSelected = normalizedMic === option.value
        const isDisabled = option.requiresGlasses && !glassesConnected

        return (
          <View key={option.value}>
            {index > 0 && (
              <View
                style={{
                  height: 1,
                  backgroundColor: theme.colors.separator,
                  marginVertical: 8,
                }}
              />
            )}
            <TouchableOpacity
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: theme.spacing.xs,
                opacity: isDisabled ? 0.5 : 1,
              }}
              onPress={() => !isDisabled && onMicChange(option.value)}
              disabled={isDisabled}>
              <View style={{flexDirection: "column", gap: 4, flex: 1, paddingRight: 8}}>
                <View style={{flexDirection: "row", alignItems: "center", gap: 8}}>
                  <Text style={{color: theme.colors.text, fontWeight: "600"}}>{translate(option.titleKey)}</Text>
                  {option.recommended && (
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
                  )}
                </View>
                <Text style={{color: theme.colors.textDim, fontSize: 13}}>{translate(option.descriptionKey)}</Text>
                {isDisabled && (
                  <Text style={{color: theme.colors.error, fontSize: 12, fontStyle: "italic"}}>
                    {translate("deviceSettings:glassesNeededForGlassesMic")}
                  </Text>
                )}
              </View>
              {isSelected && <MaterialCommunityIcons name="check" size={24} color={theme.colors.primary} />}
            </TouchableOpacity>
          </View>
        )
      })}
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
