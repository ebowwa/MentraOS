import {TouchableOpacity, View, ViewStyle, TextStyle} from "react-native"
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import {Text} from "@/components/ignite"

export type ActionButtonVariant = "default" | "warning" | "destructive" | "secondary"

interface ActionButtonProps {
  /**
   * The text to display in the button
   */
  label: string

  /**
   * Optional subtitle text to display below the label
   */
  subtitle?: string

  /**
   * The button variant - default (blue), warning (orange), or destructive (red)
   */
  variant?: ActionButtonVariant

  /**
   * Callback when the button is pressed
   */
  onPress: () => void

  /**
   * Whether the button is disabled
   */
  disabled?: boolean

  /**
   * Optional style overrides for the container
   */
  containerStyle?: ViewStyle
}

/**
 * A reusable action button component for settings screens.
 * Similar to RouteButton but for actions like delete, disconnect, etc.
 */
export default function ActionButton({
  label,
  subtitle,
  variant = "default",
  onPress,
  disabled = false,
  containerStyle,
}: ActionButtonProps) {
  const {theme, themed} = useAppTheme()

  const getTextColor = () => {
    switch (variant) {
      case "warning":
        return theme.colors.warning
      case "destructive":
        return theme.colors.error
      case "secondary":
        return theme.colors.textDim
      default:
        return theme.colors.palette.primary500
    }
  }

  return (
    <TouchableOpacity
      style={[themed($container), disabled && {opacity: 0.4}, containerStyle]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}>
      <View style={themed($textContainer)}>
        <Text style={[themed($text), {color: getTextColor()}]} text={label} />
        {subtitle && <Text style={themed($subtitle)} text={subtitle} />}
      </View>
    </TouchableOpacity>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.md,
  borderWidth: spacing.xxxs,
  borderColor: colors.border,
})

const $textContainer: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  gap: 4,
  flex: 1,
})

const $text: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 15,
  fontWeight: "500",
  color: colors.text,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.textDim,
})
