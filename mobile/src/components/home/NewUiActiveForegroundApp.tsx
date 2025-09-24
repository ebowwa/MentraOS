import React, {useState} from "react"
import {View, TouchableOpacity, Text} from "react-native"

import AppIcon from "@/components/misc/AppIcon"
import {useNewUiActiveForegroundApp} from "@/hooks/useNewUiFilteredApps"
import {useAppStatus} from "@/contexts/AppletStatusProvider"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {useAppTheme} from "@/utils/useAppTheme"
import ChevronRight from "assets/icons/component/ChevronRight"
import restComms from "@/managers/RestComms"
import {showAlert} from "@/utils/AlertUtils"
import {performHealthCheckFlow} from "@/utils/healthCheckFlow"

export const NewUiActiveForegroundApp: React.FC = () => {
  const {themed, theme} = useAppTheme()
  const {push} = useNavigationHistory()
  const activeForegroundApp = useNewUiActiveForegroundApp()
  const {optimisticallyStopApp, clearPendingOperation, refreshAppStatus} = useAppStatus()
  const [isLoading, setIsLoading] = useState(false)

  const handlePress = () => {
    if (activeForegroundApp) {
      // Check if app has webviewURL and navigate directly to it
      if (activeForegroundApp.webviewURL && activeForegroundApp.isOnline !== false) {
        push("/applet/webview", {
          webviewURL: activeForegroundApp.webviewURL,
          appName: activeForegroundApp.name,
          packageName: activeForegroundApp.packageName,
        })
      } else {
        push("/applet/settings", {
          packageName: activeForegroundApp.packageName,
          appName: activeForegroundApp.name,
        })
      }
    }
  }

  const handleLongPress = () => {
    if (activeForegroundApp) {
      showAlert("Stop App", `Do you want to stop ${activeForegroundApp.name}?`, [
        {text: "Cancel", style: "cancel"},
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            setIsLoading(true)
            optimisticallyStopApp(activeForegroundApp.packageName)

            try {
              await restComms.stopApp(activeForegroundApp.packageName)
              clearPendingOperation(activeForegroundApp.packageName)
            } catch (error) {
              refreshAppStatus()
              console.error("Stop app error:", error)
            } finally {
              setIsLoading(false)
            }
          },
        },
      ])
    }
  }

  if (!activeForegroundApp) {
    // Show placeholder when no active app
    return (
      <View style={themed($container)}>
        <View style={themed($placeholderContent)}>
          <Text style={themed($placeholderText)}>Tap an app below to activate it</Text>
        </View>
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={themed($container)}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      disabled={isLoading}>
      <View style={themed($rowContent)}>
        <AppIcon app={activeForegroundApp as any} style={themed($appIcon)} />
        <View style={themed($appInfo)}>
          <Text style={themed($appName)} numberOfLines={1} ellipsizeMode="tail">
            {activeForegroundApp.name}
          </Text>
          <View style={themed($tagContainer)}>
            <View style={themed($activeTag)}>
              <Text style={themed($tagText)}>Active</Text>
            </View>
          </View>
        </View>
        <ChevronRight color={theme.colors.text} />
      </View>
    </TouchableOpacity>
  )
}

const $container = theme => ({
  borderRadius: theme.spacing.sm,
  marginVertical: theme.spacing.xs,
  minHeight: 72,
})

const $rowContent = theme => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: theme.spacing.xs,
  paddingVertical: theme.spacing.sm,
  gap: theme.spacing.sm,
})

const $appIcon = theme => ({
  width: 64,
  height: 64,
})

const $appInfo = theme => ({
  flex: 1,
  justifyContent: "center",
})

const $appName = theme => ({
  fontSize: 16,
  fontWeight: "500",
  color: theme.colors.text,
  marginBottom: theme.spacing.xxs,
})

const $tagContainer = theme => ({
  flexDirection: "row",
  gap: theme.spacing.xs,
})

const $activeTag = theme => ({
  paddingHorizontal: theme.spacing.xs,
  paddingVertical: 2,
  backgroundColor: theme.colors.success + "20",
  borderRadius: theme.spacing.xxs,
})

const $tagText = theme => ({
  fontSize: 11,
  color: theme.colors.foregroundTagText,
  fontWeight: "500",
})

const $placeholderContent = theme => ({
  padding: theme.spacing.lg,
  alignItems: "center",
  justifyContent: "center",
})

const $placeholderText = theme => ({
  fontSize: 15,
  color: theme.colors.textDim,
  textAlign: "center",
})
