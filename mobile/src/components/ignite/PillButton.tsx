import React from "react"
import {TouchableOpacity, TouchableOpacityProps, TextStyle, ViewStyle, StyleProp} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle, ThemedStyleArray} from "@/theme"
import {TOptions} from "i18next"
import {TxKeyPath} from "@/i18n"
import {Text} from "@/components/ignite/Text"

export type PillButtonVariant = "primary" | "secondary" | "icon"

interface PillButtonProps extends Omit<TouchableOpacityProps, "style"> {
  /**
   * Text which is looked up via i18n.
   */
  tx?: TxKeyPath
  /**
   * The text to display if not using `tx` or nested components.
   */
  text?: string
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  txOptions?: TOptions
  /**
   * The button variant - primary (solid color), secondary (transparent with border), or icon (gray background)
   */
  variant?: PillButtonVariant

  /**
   * Optional style overrides for the button container
   */
  buttonStyle?: ViewStyle

  /**
   * Optional style overrides for the button text
   */
  textStyle?: TextStyle

  /**
   * Whether the button is disabled
   */
  disabled?: boolean

  /**
   * Hit slop to increase touchable area around the button
   */
  hitSlop?: {top?: number; bottom?: number; left?: number; right?: number} | number
}

/**
 * A reusable pill-shaped button component with primary and secondary variants.
 * Matches the design system used in AlertUtils/BasicDialog and Developer Settings.
 */
export function PillButton({
  text,
  variant = "secondary",
  buttonStyle,
  textStyle,
  disabled = false,
  tx,
  txOptions,
  ...touchableProps
}: PillButtonProps) {
  const {theme, themed} = useAppTheme()

  const isPrimary = variant === "primary"
  const isSecondary = variant === "secondary"

  const getBackgroundColor = () => {
    if (isPrimary) return theme.colors.tint
    if (isSecondary) return theme.colors.palette.transparent
    return theme.colors.tint
  }

  const getTextColor = () => {
    return theme.colors.text
  }

  const buttonStyles: StyleProp<ViewStyle> = [
    themed($button),
    {
      backgroundColor: getBackgroundColor(),
    },
    disabled && themed($disabled),
    buttonStyle,
  ]

  const textStyles: StyleProp<TextStyle> = [
    themed($text),
    {
      color: getTextColor(),
    },
    disabled && themed($disabledText),
    textStyle,
  ]

  return (
    <TouchableOpacity style={buttonStyles} disabled={disabled} hitSlop={10} {...touchableProps}>
      <Text style={textStyles} tx={tx} text={text} txOptions={txOptions}></Text>
    </TouchableOpacity>
  )
}

const $button: ThemedStyle<ViewStyle> = ({colors}) => ({
  paddingVertical: 8,
  paddingHorizontal: 16,
  borderRadius: 100, // Pill shape
  height: 36,
  justifyContent: "center",
  alignItems: "center",
})

const $disabled: ThemedStyle<ViewStyle> = ({colors}) => ({
  opacity: 0.4,
})

const $disabledText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.textDim,
})

const $text: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 14,
  fontWeight: "normal",
  textAlign: "center",
})
