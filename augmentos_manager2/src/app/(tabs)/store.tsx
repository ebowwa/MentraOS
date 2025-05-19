import React, { useEffect, useState, useCallback } from "react"
import {
  View,
  ViewStyle,
  TextStyle,
  ScrollView,
  RefreshControl,
  SectionList,
} from "react-native"
import { Screen, Text, Button, Header } from "src/components"
import { router } from "expo-router"
import { colors, spacing, ThemedStyle } from "src/theme"
import { useAppTheme } from "src/utils/useAppTheme"

export default function chatsScreen() {
  // const { session } = useAuth()
  const { themed } = useAppTheme()

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={themed($screenContainer)}>
      <Header titleTx="chatsScreen:title" safeAreaEdges={[]} rightIcon="more" onRightPress={() => {
        router.push("/settings")
      }}/>
    </Screen>
  )
}

// Styles
const $screenContainer: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})


const $headerText: ThemedStyle<TextStyle> = ({ colors }) => ({
  fontSize: 32,
  color: colors.text,
})