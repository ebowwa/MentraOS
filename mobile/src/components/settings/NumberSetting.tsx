import React, {useState, useEffect} from "react"
import {View, Text, TextInput, StyleSheet, Platform, Pressable, Alert} from "react-native"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {ViewStyle, TextStyle} from "react-native"

type NumberSettingProps = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  placeholder?: string
  onValueChange: (value: number) => void
  containerStyle?: ViewStyle
}

const NumberSetting: React.FC<NumberSettingProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  placeholder = "Enter number...",
  onValueChange,
  containerStyle,
}) => {
  const {theme, themed} = useAppTheme()
  const [localValue, setLocalValue] = useState(value.toString())
  const [isEditing, setIsEditing] = useState(false)

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value.toString())
  }, [value])

  const validateAndUpdate = (text: string) => {
    // Allow empty string for editing
    if (text === "") {
      setLocalValue(text)
      return
    }

    // Check if it's a valid number
    const numValue = parseFloat(text)
    if (isNaN(numValue)) {
      return // Don't update if not a valid number
    }

    // Apply min/max constraints
    let finalValue = numValue
    if (min !== undefined && numValue < min) {
      finalValue = min
    }
    if (max !== undefined && numValue > max) {
      finalValue = max
    }

    // Apply step constraint
    if (step !== 1) {
      finalValue = Math.round(finalValue / step) * step
    }

    setLocalValue(finalValue.toString())
    onValueChange(finalValue)
  }

  const handleSubmit = () => {
    if (localValue === "") {
      // Reset to current value if empty
      setLocalValue(value.toString())
      setIsEditing(false)
      return
    }

    const numValue = parseFloat(localValue)
    if (isNaN(numValue)) {
      Alert.alert("Invalid Input", "Please enter a valid number.")
      setLocalValue(value.toString())
      setIsEditing(false)
      return
    }

    validateAndUpdate(localValue)
    setIsEditing(false)
  }

  const handleBlur = () => {
    handleSubmit()
  }

  const handleFocus = () => {
    setIsEditing(true)
  }

  const increment = () => {
    const newValue = value + step
    validateAndUpdate(newValue.toString())
  }

  const decrement = () => {
    const newValue = value - step
    validateAndUpdate(newValue.toString())
  }

  return (
    <View style={[themed($container), containerStyle]}>
      <Text style={themed($label)}>{label}</Text>

      <View style={themed($inputContainer)}>
        <Pressable style={themed($decrementButton)} onPress={decrement} disabled={min !== undefined && value <= min}>
          <Text style={themed($buttonText)}>-</Text>
        </Pressable>

        <TextInput
          style={themed($input)}
          value={localValue}
          onChangeText={setLocalValue}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={handleSubmit}
          keyboardType="numeric"
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textDim}
          selectTextOnFocus={true}
          returnKeyType="done"
          contextMenuHidden={true}
          autoCorrect={false}
          autoCapitalize="none"
        />

        <Pressable style={themed($incrementButton)} onPress={increment} disabled={max !== undefined && value >= max}>
          <Text style={themed($buttonText)}>+</Text>
        </Pressable>
      </View>

      {(min !== undefined || max !== undefined) && (
        <Text style={themed($constraintsText)}>
          {min !== undefined && max !== undefined
            ? `Range: ${min} - ${max}`
            : min !== undefined
              ? `Min: ${min}`
              : `Max: ${max}`}
        </Text>
      )}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.lg,
  width: "100%",
})

const $label: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 16,
  color: colors.text,
  marginBottom: spacing.sm,
})

const $inputContainer: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $input: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  flex: 1,
  fontSize: 16,
  color: colors.text,
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 6,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  textAlign: "center",
  minHeight: Platform.OS === "ios" ? 44 : 48,
})

const $decrementButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 6,
  width: 44,
  height: 44,
  justifyContent: "center",
  alignItems: "center",
})

const $incrementButton: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 6,
  width: 44,
  height: 44,
  justifyContent: "center",
  alignItems: "center",
})

const $buttonText: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 18,
  fontWeight: "600",
  color: colors.text,
})

const $constraintsText: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  fontSize: 12,
  color: colors.textDim,
  marginTop: spacing.xs,
  textAlign: "center",
})

export default NumberSetting
