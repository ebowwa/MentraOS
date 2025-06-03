import React, { useState, useEffect } from "react"
import { View, Platform, ViewStyle, ScrollView, TextInput, Pressable, Text } from "react-native"
import { router } from "expo-router"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import Animated from "react-native-reanimated"
import { Header, Screen } from "@/components/ignite"
import AppsActiveList from "@/components/misc/AppsActiveList"
import AppsInactiveList from "@/components/misc/AppsInactiveList"
import { useAppStatus } from "@/contexts/AppStatusProvider"
import { colors, ThemedStyle } from "@/theme"
import { useAppTheme } from "@/utils/useAppTheme"
import { Spacer } from "@/components/misc/Spacer"
import Divider from "@/components/misc/Divider"
import { ArrowLeftIcon } from "assets/icons/component/ArrowLeftIcon"
import { CloseXIcon } from "assets/icons/component/CloseXIcon"
import { translate } from "@/i18n"


export default function SearchAppsPage() {
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <Screen preset="fixed" style={themed($screen)}>
      
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: 16,
          height: 48,
          backgroundColor: theme.colors.background,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <ArrowLeftIcon color={theme.colors.icon} size={24} />
        </Pressable>

        <TextInput
          placeholder= {translate("home:search")}
          placeholderTextColor="#aaa"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ flex: 1, marginLeft: 12, color: theme.colors.text, fontSize: 16 }}
        />
        <Pressable onPress={() => setSearchQuery("")}>
          <CloseXIcon color={theme.colors.icon} size={24} />
        </Pressable>

      </View>

      <ScrollView style={{ marginRight: -theme.spacing.md, paddingRight: theme.spacing.md }}>


        <Divider variant="full" />
        <AppsActiveList isSearchPage={true} searchQuery={searchQuery} />
        <Divider variant="inset" />

        <AppsInactiveList isSearchPage={true} searchQuery={searchQuery} />
        <Spacer height={40} />
      </ScrollView>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => {
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  return {
    paddingHorizontal: 20,
    paddingTop: insets.top + theme.spacing.md,
  }
}

const $headerRight: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
})
