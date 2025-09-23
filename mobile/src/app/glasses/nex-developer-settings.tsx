import React from "react"
import {Stack} from "expo-router"
import NexDeveloperSettings from "@/components/glasses/NexDeveloperSettings"
import {Screen, Header} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function NexDeveloperSettingsPage() {
  const {theme} = useAppTheme()
  const {goBack} = useNavigationHistory()

  return (
    <Screen preset="fixed" style={{paddingHorizontal: theme.spacing.md}}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <Header title="Nex Developer Settings" leftIcon="caretLeft" onLeftPress={() => goBack()} />
      <NexDeveloperSettings />
    </Screen>
  )
}
