import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"
import React from "react"
import {View, Text, StyleSheet, Platform, ViewStyle, TextStyle} from "react-native"
import {Switch} from "@/components/ignite/Toggle"

type ToggleSettingProps = {
  label: string
  subLabel?: string
  value: boolean
  onValueChange: (newValue: boolean) => void
}

const ToggleSetting: React.FC<ToggleSettingProps> = ({label, subLabel, value, onValueChange}) => {
  const {theme, themed} = useAppTheme()

  // const switchColors = {
  //   trackColor: {
  //     false: theme.isDark ? theme.colors.palette.neutral200 : theme.colors.palette.neutral900,
  //     true: theme.colors.palette.primary300,
  //   },
  //   thumbColor:
  //     Platform.OS === 'ios' ? undefined : theme.isDark ? theme.colors.palette.neutral200 : theme.colors.palette.neutral900,
  //   ios_backgroundColor: theme.isDark ? theme.colors.palette.neutral200 : theme.colors.palette.neutral900,
  // };

  return (
    <View style={themed($container)}>
      <View style={themed($textContainer)}>
        <Text style={themed($label)}>{label}</Text>
        {subLabel && <Text style={themed($subLabel)}>{subLabel}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        // inputOuterStyle={{backgroundColor: "red"}}
        // inputInnerStyle={{backgroundColor: "green"}}
        // inputDetailStyle={{backgroundColor: "blue"}}
        // inputWrapperStyle={{backgroundColor: "yellow"}}
        // inputOuterStyle={{backgroundColor: theme.colors.palette.primary400}}
        inputInnerStyle={{backgroundColor: theme.colors.palette.primary400}}
        inputDetailStyle={{backgroundColor: theme.colors.palette.primary300}}
        inputOuterStyle={{backgroundColor: theme.colors.palette.primary200}}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  backgroundColor: colors.background,
  padding: spacing.md,
  borderRadius: spacing.lg,
})

const $textContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  gap: 4,
})

const $label: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 16,
  color: colors.text,
})

const $subLabel: ThemedStyle<TextStyle> = ({colors}) => ({
  fontSize: 12,
  color: colors.textDim,
})

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  label: {
    fontSize: 16,
  },
})

const SettingsSwitch = () => {
  const {themed} = useAppTheme()
  return (
    <View style={themed($switchContainer)}>
      <Text>Settings</Text>
      <Switch value={true} onValueChange={() => {}} />
    </View>
  )
}

const $switchContainer: ThemedStyle<ViewStyle> = ({colors}) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: 10,
  backgroundColor: colors.palette.neutral100,
  borderRadius: 12,
})

export default ToggleSetting
