import React from "react"
import {TouchableOpacity, Text, StyleSheet, TouchableOpacityProps, TextStyle, ViewStyle} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"

export type PillButtonVariant = "primary" | "secondary" | "icon"

interface PillButtonProps extends Omit<TouchableOpacityProps, "style"> {
  /**
   * The text to display in the button
   */
  text: string

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
  ...touchableProps
}: PillButtonProps) {
  const {theme} = useAppTheme()

  const isPrimary = variant === "primary"
  const isSecondary = variant === "secondary"
  const isIcon = variant === "icon"

  const getBackgroundColor = () => {
    if (isPrimary) return theme.colors.buttonPillPrimary
    if (isSecondary) return theme.colors.buttonPillSecondary
    return theme.colors.buttonPillIcon
  }

  const getTextColor = () => {
    if (isPrimary) return theme.colors.buttonPillPrimaryText
    if (isSecondary) return theme.colors.buttonPillSecondaryText
    return theme.colors.buttonPillIconText
  }

  const buttonStyles = [
    styles.button,
    {
      backgroundColor: getBackgroundColor(),
      ...(isSecondary && {
        borderWidth: 1,
        borderColor: theme.colors.buttonPillSecondaryBorder,
      }),
    },
    disabled && styles.disabled,
    buttonStyle,
  ]

  const textStyles = [
    styles.text,
    {
      color: getTextColor(),
    },
    disabled && styles.disabledText,
    textStyle,
  ]

  return (
    <TouchableOpacity style={buttonStyles} disabled={disabled} hitSlop={10} {...touchableProps}>
      <Text style={textStyles}>{text}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 100, // Pill shape
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.4,
  },
  disabledText: {
    // Text color will be automatically dimmed by the container opacity
  },
  text: {
    fontSize: 14,
    fontWeight: "normal",
    textAlign: "center",
  },
})
