import {Text} from "@/components/ignite"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {View, TouchableOpacity, TextStyle, ViewStyle} from "react-native"
import {translate} from "@/i18n/translate"

interface MicrophoneSelectorProps {
  preferredMic: string
  onMicChange: (mic: string) => void
  defaultWearableHasMic?: boolean
}

type MicOption = {
  value: string
  titleKey: string
  descriptionKey: string
  recommended?: boolean
}

const micOptions: MicOption[] = [
  {
    value: "automatic",
    titleKey: "deviceSettings:micAutomatic",
    descriptionKey: "deviceSettings:micAutomaticDesc",
    recommended: true,
  },
  {
    value: "phone_internal",
    titleKey: "deviceSettings:micPhoneInternal",
    descriptionKey: "deviceSettings:micPhoneInternalDesc",
  },
  {
    value: "glasses_custom",
    titleKey: "deviceSettings:micGlassesCustom",
    descriptionKey: "deviceSettings:micGlassesCustomDesc",
  },
  {
    value: "bluetooth_classic",
    titleKey: "deviceSettings:micBluetoothClassic",
    descriptionKey: "deviceSettings:micBluetoothClassicDesc",
  },
]

export function MicrophoneSelector({preferredMic, onMicChange, defaultWearableHasMic}: MicrophoneSelectorProps) {
  const {theme, themed} = useAppTheme()

  // Filter options - only show glasses_custom if default wearable has a custom mic
  const availableOptions = micOptions.filter(option => {
    if (option.value === "glasses_custom") {
      return defaultWearableHasMic === true
    }
    return true
  })

  return (
    <View style={themed($container)}>
      <Text tx="deviceSettings:microphoneSelection" style={[themed($label), {marginBottom: theme.spacing.sm}]} />

      {availableOptions.map((option, index) => {
        const isSelected = preferredMic === option.value

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
              }}
              onPress={() => onMicChange(option.value)}>
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
                {/* <Text style={{color: theme.colors.textDim, fontSize: 13}}>{translate(option.descriptionKey)}</Text> */}
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
