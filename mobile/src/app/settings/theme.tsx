import {View, TouchableOpacity, ViewStyle, TextStyle} from "react-native"
import {Screen, Header, Text} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {MaterialCommunityIcons} from "@expo/vector-icons"
import {type ThemeType} from "@/utils/useAppTheme"
// eslint-disable-next-line
import {StyleSheet} from "react-native"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {SETTINGS_KEYS, useSetting} from "@/stores/settings"

export default function ThemeSettingsPage() {
  const {theme, themed, setThemeContextOverride} = useAppTheme()
  const {replace} = useNavigationHistory()

  const [themePreference, setThemePreference] = useSetting(SETTINGS_KEYS.theme_preference)

  const handleThemeChange = async (newTheme: ThemeType) => {
    await setThemePreference(newTheme)

    // Apply theme immediately
    if (newTheme === "system") {
      setThemeContextOverride(undefined)
    } else {
      setThemeContextOverride(newTheme)
    }
  }

  const renderThemeOption = (themeKey: ThemeType, label: string, subtitle?: string, isLast: boolean = false) => (
    <>
      <TouchableOpacity
        style={{flexDirection: "row", justifyContent: "space-between", paddingVertical: 8}}
        onPress={() => handleThemeChange(themeKey)}>
        <View style={{flexDirection: "column", gap: 4}}>
          <Text text={label} style={{color: theme.colors.text}} />
          {subtitle && <Text text={subtitle} style={themed($subtitle)} />}
        </View>
        <MaterialCommunityIcons
          name="check"
          size={24}
          color={themePreference === themeKey ? theme.colors.primary : "transparent"}
        />
      </TouchableOpacity>
      {/* @ts-ignore */}
      {!isLast && (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.colors.palette.neutral300,
            marginVertical: 4,
          }}
        />
      )}
    </>
  )

  return (
    <Screen preset="scroll" style={{paddingHorizontal: theme.spacing.md}}>
      <Header title="Theme Settings" leftIcon="caretLeft" onLeftPress={() => replace("/(tabs)/settings")} />

      <View style={themed($settingsGroup)}>
        {renderThemeOption("light", "Light Theme", undefined, false)}
        {renderThemeOption("dark", "Dark Theme", undefined, false)}
        {renderThemeOption("system", "System Default", undefined, true)}
      </View>
    </Screen>
  )
}

const $settingsGroup: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: 12,
  marginTop: 16,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.sm,
})
