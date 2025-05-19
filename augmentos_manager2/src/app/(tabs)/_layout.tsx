import React from "react"
import { Tabs } from "expo-router/tabs"
import { Icon } from "@/components"
import { translate } from "@/i18n"
import { colors, spacing, ThemedStyle, typography } from "@/theme"
import { TextStyle, View, ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { FontAwesome } from '@expo/vector-icons';
import { useAppTheme, useThemeProvider } from "@/utils/useAppTheme"

export default function Layout() {
  const { bottom } = useSafeAreaInsets()

  const { themeScheme } = useThemeProvider();
  const { themed } = useAppTheme();

  const showLabel = false

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: [themed($tabBar), {
          paddingBottom: bottom + 32,
        }],
        // tabBarActiveTintColor: themed(({ colors }) => colors.text),
        // tabBarInactiveTintColor: themed(({ colors }) => "#000"),
        tabBarLabelStyle: themed($tabBarLabel),
        tabBarItemStyle: themed($tabBarItem),
        tabBarLabelPosition: 'below-icon',
        // tabBarPosition: 'left',
        // animation: 'shift',
        // tabBarBackground: () => <View />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          href: "/home",
          headerShown: false,
          tabBarAccessibilityLabel: translate("navigator:homeTab"),
          tabBarLabel: showLabel ? translate("navigator:homeTab") : "",
          tabBarIcon: ({ focused, color }) => (
            <FontAwesome name="home" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mirror"
        options={{
          href: "/mirror",
          headerShown: false,
          tabBarAccessibilityLabel: translate("navigator:mirrorTab"),
          tabBarLabel: showLabel ? translate("navigator:mirrorTab") : "",
          tabBarIcon: ({ focused, color }) => (
            <FontAwesome name="cog" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          href: "/store",
          headerShown: false,
          tabBarAccessibilityLabel: translate("navigator:storeTab"),
          tabBarLabel: showLabel ? translate("navigator:storeTab") : "",
          tabBarIcon: ({ focused, color }) => (
            <FontAwesome name="cog" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: "/settings",
          headerShown: false,
          tabBarAccessibilityLabel: translate("navigator:settingsTab"),
          tabBarLabel: showLabel ? translate("navigator:settingsTab") : "",
          tabBarIcon: ({ focused, color }) => (
            <FontAwesome name="cog" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}

const $tabBar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral300,
  // borderTopColor: colors.transparent,
  // borderTopWidth: 1,
  paddingTop: 4,
  height: 64,
  borderTopWidth: 0,
})

const $tabBarItem: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingTop: spacing.md,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
  flex: 1,
})
